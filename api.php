<?php
declare(strict_types=1);

require __DIR__ . '/config.php';
require __DIR__ . '/mailer.php';

ini_set('display_errors', '0');
ini_set('log_errors', '1');
set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

ini_set('session.use_strict_mode', '1');
session_name('booking_portal_session');
$isHttps =
    (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
    ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
session_set_cookie_params([
    'httponly' => true,
    'secure' => $isHttps,
    'samesite' => 'Strict',
    'path' => APP_COOKIE_PATH,
]);
session_start();
$sessionNow = time();
if (!empty($_SESSION['user_id'])) {
    $idle = $sessionNow - (int) ($_SESSION['last_activity'] ?? $sessionNow);
    $age = $sessionNow - (int) ($_SESSION['session_started_at'] ?? $sessionNow);
    if ($idle > 1800 || $age > 28800) {
        $_SESSION = [];
        session_regenerate_id(true);
    } else {
        $_SESSION['last_activity'] = $sessionNow;
        if ($sessionNow - (int) ($_SESSION['last_rotation'] ?? 0) > 900) {
            session_regenerate_id(true);
            $_SESSION['last_rotation'] = $sessionNow;
        }
    }
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
if ($isHttps) {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}
if (APP_ENV === 'production' && !$isHttps) {
    http_response_code(426);
    echo json_encode(['ok' => false, 'error' => 'HTTPS is required']);
    exit();
}

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit();
}

function installDatabase(): void
{
    if (DB_AUTO_CREATE) {
        $server = db(false);
        $server->exec(
            'CREATE DATABASE IF NOT EXISTS `' .
                DB_NAME .
                '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
        );
    }
    $pdo = db();
    $schemaVersion =
        'runtime_schema_20261001_' . substr(hash_file('sha256', __DIR__ . '/database.sql'), 0, 12);
    try {
        $versionCheck = $pdo->prepare('SELECT setting_value FROM app_settings WHERE setting_key=?');
        $versionCheck->execute([$schemaVersion]);
        if ($versionCheck->fetchColumn() !== false) {
            return;
        }
    } catch (PDOException $error) {
        if ((int) ($error->errorInfo[1] ?? 0) !== 1146) {
            throw $error;
        }
    }
    $schema = file_get_contents(__DIR__ . '/database.sql');
    foreach (preg_split('/;\s*(?:\r?\n|$)/', (string) $schema) as $statement) {
        $statement = trim($statement);
        if ($statement !== '' && !preg_match('/^(CREATE DATABASE|USE)\b/i', $statement)) {
            $pdo->exec($statement);
        }
    }

    $emailColumn = $pdo->query("SHOW COLUMNS FROM users LIKE 'email'")->fetch();
    if (!$emailColumn) {
        $pdo->exec(
            'ALTER TABLE users ADD COLUMN email VARCHAR(190) NULL AFTER name, ADD UNIQUE KEY uq_users_email (email)',
        );
    }
    $permColumn = $pdo->query("SHOW COLUMNS FROM users LIKE 'config_permissions'")->fetch();
    if (!$permColumn) {
        $pdo->exec(
            "ALTER TABLE users ADD COLUMN config_permissions VARCHAR(255) NOT NULL DEFAULT '' AFTER billing_rate",
        );
    }
    $mfaColumn = $pdo->query("SHOW COLUMNS FROM users LIKE 'mfa_enabled'")->fetch();
    if (!$mfaColumn) {
        $pdo->exec(
            'ALTER TABLE users ADD COLUMN mfa_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER password_hash',
        );
    }
    $changeColumn = $pdo->query("SHOW COLUMNS FROM users LIKE 'must_change_password'")->fetch();
    if (!$changeColumn) {
        $pdo->exec(
            'ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER mfa_enabled',
        );
    }
    $changedAtColumn = $pdo->query("SHOW COLUMNS FROM users LIKE 'password_changed_at'")->fetch();
    if (!$changedAtColumn) {
        $pdo->exec(
            'ALTER TABLE users ADD COLUMN password_changed_at DATETIME NULL AFTER must_change_password',
        );
    }
    $sessionVersionColumn = $pdo->query("SHOW COLUMNS FROM users LIKE 'session_version'")->fetch();
    if (!$sessionVersionColumn) {
        $pdo->exec(
            'ALTER TABLE users ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER password_changed_at',
        );
    }
    $activeColumn = $pdo->query("SHOW COLUMNS FROM users LIKE 'active'")->fetch();
    if ($activeColumn && (string) $activeColumn['Default'] !== '0') {
        $pdo->exec('ALTER TABLE users MODIFY active TINYINT(1) NOT NULL DEFAULT 0');
    }
    $pdo->exec('UPDATE users SET mfa_enabled=1 WHERE mfa_enabled<>1');
    $activationPolicy = $pdo
        ->query("SELECT COUNT(*) FROM app_settings WHERE setting_key='admin_activation_policy_v1'")
        ->fetchColumn();
    if (!(int) $activationPolicy) {
        $pdo->beginTransaction();
        try {
            $pdo->exec(
                "UPDATE users SET active=0,session_version=session_version+1 WHERE access_role<>'admin'",
            );
            $pdo->exec(
                "INSERT INTO app_settings (setting_key,setting_value) VALUES ('admin_activation_policy_v1','1')",
            );
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
    }
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS mfa_challenges (challenge_id CHAR(64) PRIMARY KEY,user_id VARCHAR(24) NOT NULL,code_hash VARCHAR(255) NOT NULL,expires_at DATETIME NOT NULL,attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,consumed_at DATETIME NULL,requested_ip VARCHAR(64) NOT NULL DEFAULT '',created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT fk_mfa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,INDEX idx_mfa_user_created (user_id,created_at),INDEX idx_mfa_expiry (expires_at)) ENGINE=InnoDB",
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS auth_events (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,user_id VARCHAR(24) NULL,email VARCHAR(190) NOT NULL DEFAULT '',event_type VARCHAR(40) NOT NULL,ip_address VARCHAR(64) NOT NULL DEFAULT '',user_agent VARCHAR(255) NOT NULL DEFAULT '',created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX idx_auth_email_time (email,created_at),INDEX idx_auth_ip_time (ip_address,created_at),INDEX idx_auth_user_time (user_id,created_at)) ENGINE=InnoDB",
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS password_reset_challenges (challenge_id CHAR(64) PRIMARY KEY,user_id VARCHAR(24) NOT NULL,code_hash VARCHAR(255) NOT NULL,expires_at DATETIME NOT NULL,attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,consumed_at DATETIME NULL,requested_ip VARCHAR(64) NOT NULL DEFAULT '',created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,INDEX idx_password_reset_user_created (user_id,created_at),INDEX idx_password_reset_expiry (expires_at)) ENGINE=InnoDB",
    );
    $pdo->exec(
        "INSERT IGNORE INTO pods (name) SELECT DISTINCT pod FROM users WHERE pod<>'' AND access_role<>'admin'",
    );
    $billingToColumn = $pdo
        ->query("SHOW COLUMNS FROM timesheet_entries LIKE 'billing_to_id'")
        ->fetch();
    if (!$billingToColumn) {
        $pdo->exec(
            'ALTER TABLE timesheet_entries ADD COLUMN billing_to_id VARCHAR(24) NULL AFTER person_id, ADD INDEX idx_entry_billing_to (billing_to_id)',
        );
    }
    $importBatchColumn = $pdo
        ->query("SHOW COLUMNS FROM timesheet_entries LIKE 'import_batch_id'")
        ->fetch();
    if (!$importBatchColumn) {
        $pdo->exec(
            'ALTER TABLE timesheet_entries ADD COLUMN import_batch_id CHAR(32) NULL AFTER source, ADD INDEX idx_entry_import_batch (import_batch_id)',
        );
    }
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS timesheet_import_batches (batch_id CHAR(32) PRIMARY KEY,imported_by VARCHAR(24) NULL,file_name VARCHAR(255) NOT NULL,row_count INT UNSIGNED NOT NULL,employee_count INT UNSIGNED NOT NULL,status ENUM('active','undone') NOT NULL DEFAULT 'active',created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,undone_at DATETIME NULL,undone_by VARCHAR(24) NULL,CONSTRAINT fk_import_user FOREIGN KEY (imported_by) REFERENCES users(id) ON DELETE SET NULL,INDEX idx_import_created (created_at),INDEX idx_import_user (imported_by)) ENGINE=InnoDB",
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS timesheet_import_changes (batch_id CHAR(32) NOT NULL,entry_id VARCHAR(40) NOT NULL,previous_json LONGTEXT NULL,PRIMARY KEY (batch_id,entry_id),CONSTRAINT fk_import_change_batch FOREIGN KEY (batch_id) REFERENCES timesheet_import_batches(batch_id) ON DELETE CASCADE) ENGINE=InnoDB',
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS sharepoint_backups (backup_month CHAR(7) PRIMARY KEY,file_name VARCHAR(255) NOT NULL,row_count INT UNSIGNED NOT NULL,graph_item_id VARCHAR(255) NOT NULL DEFAULT '',status ENUM('completed','failed') NOT NULL,error_message VARCHAR(500) NOT NULL DEFAULT '',created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB",
    );
    $legacyPricing = $pdo->query("SHOW TABLES LIKE 'client_pricing'")->fetchColumn();
    $pricingMigrated = $pdo
        ->query("SELECT COUNT(*) FROM app_settings WHERE setting_key='entity_pricing_migrated'")
        ->fetchColumn();
    if ($legacyPricing && !(int) $pricingMigrated) {
        $pdo->exec(
            'INSERT IGNORE INTO entity_pricing (entity_name,designation,hourly_rate) SELECT client_name,designation,hourly_rate FROM client_pricing',
        );
        $pdo->exec(
            "INSERT INTO app_settings (setting_key,setting_value) VALUES ('entity_pricing_migrated','1') ON DUPLICATE KEY UPDATE setting_value='1'",
        );
    }
    $knownEmails = [
        'ADMIN' => 'admin@thereckoner.co.uk',
        'RA-079' => 'abid.wahab@thereckoner.co.uk',
        'RA-006' => 'a.akhtar@thereckoner.co.uk',
        'RA-053' => 'a.haider@thereckoner.co.uk',
        'RA-036' => 'a.raza@thereckoner.co.uk',
        'RA-069' => 'amna.saleem@thereckoner.co.uk',
        'RA-040' => 'a.shoaib@thereckoner.co.uk',
        'RA-014' => 'danial.qureshi@thereckoner.co.uk',
        'RA-055' => 'f.mehmood@thereckoner.co.uk',
        'RA-064' => 'fatima.amir@thereckoner.co.uk',
        'RA-002' => 'ibrar.g@thereckoner.co.uk',
        'RA-087' => 'kiran.batool@thereckoner.co.uk',
        'RA-005' => 'm.ahmed@thereckoner.co.uk',
        'RA-082' => 'mehak.mehmood@thereckoner.co.uk',
        'RA-021' => 'awais.m@thereckoner.co.uk',
        'RA-045' => 'm.huzaifa@thereckoner.co.uk',
        'RA-003' => 'zeeshan.khan@thereckoner.co.uk',
        'RA-018' => 's.ali@thereckoner.co.uk',
        'RA-063' => 'syed.saqib@thereckoner.co.uk',
        'RA-047' => 'z.javed@thereckoner.co.uk',
        'RA-077' => 'zohaib.khalid@thereckoner.co.uk',
        'RA-083' => 'alina.k@thereckoner.co.uk',
        'RA-088' => 'ammar.qasim@thereckoner.co.uk',
        'RA-094' => 'm.madih@thereckoner.co.uk',
        'RA-089' => 'm.awaiz@thereckoner.co.uk',
        'RA-093' => 'saif@thereckoner.co.uk',
        'RA-095' => 'toughral@thereckoner.co.uk',
        'RA-097' => 'shahlan@thereckoner.co.uk',
        'RA-098' => 'nawal@thereckoner.co.uk',
        'RA-099' => 'rohama@thereckoner.co.uk',
        'RA-096' => 'rimsha@thereckoner.co.uk',
        'RA-112' => 'arqam.ali@thereckoner.co.uk',
        'RA-109' => 'm.ilyas@thereckoner.co.uk',
        'RA-111' => 'shahzad@thereckoner.co.uk',
        'RA-108' => 'ahmed.khan@thereckoner.co.uk',
        'RA-107' => 'ajmal@thereckoner.co.uk',
        'RA-105' => 'm.rahbar@thereckoner.co.uk',
        'RA-110' => 'maaz.a@thereckoner.co.uk',
        'RA-114' => 'q.syed@thereckoner.co.uk',
        'RA-113' => 'sana@thereckoner.co.uk',
        'RA-115' => 'a.umar@thereckoner.co.uk',
        'RA-116' => 'ramzan.tariq@thereckoner.co.uk',
        'RA-117' => 'a.rehman@thereckoner.co.uk',
    ];
    $emailUpdate = $pdo->prepare(
        "UPDATE users SET email=? WHERE id=? AND (email IS NULL OR email LIKE '%@reckoner.local')",
    );
    foreach ($knownEmails as $id => $email) {
        $emailUpdate->execute([$email, $id]);
    }

    $additionalRoster = [
        ['RA-083', 'Alina Khalid'],
        ['RA-088', 'Ammar Qasim'],
        ['RA-094', 'Madih Ur Rahman'],
        ['RA-089', 'Muhammad Awaiz'],
        ['RA-093', 'Saif-Ur-Rehman'],
        ['RA-095', 'Toughral Naeem'],
        ['RA-097', 'Shahlan Amir'],
        ['RA-098', 'Nawal Iftikhar'],
        ['RA-099', 'Rohama Sohail'],
        ['RA-096', 'Rimsha Hanif'],
        ['RA-112', 'Arqam Ali'],
        ['RA-109', 'Muhammad Ilyas'],
        ['RA-111', 'Shahzad'],
        ['RA-108', 'Ahmed Khan'],
        ['RA-107', 'Ajmal Shah'],
        ['RA-105', 'Muhammad Rahbar'],
        ['RA-110', 'Maaz Ahmad'],
        ['RA-114', 'Qurat Ul Ain Syed'],
        ['RA-113', 'Sana Safdar'],
        ['RA-115', 'Ashiq Umar'],
        ['RA-116', 'Ramzan Tariq'],
        ['RA-117', 'Abdul Rehman'],
        ['RA-120', 'Isra Munsif'],
        ['RA-119', 'Zartasha Nadeem'],
        ['RA-121', 'Shiza'],
        ['RA-999', 'Ayzan Sylvester'],
        ['RA-103', 'Umer Khursheed'],
        ['RA-104', 'Umar Rahim'],
        ['RA-102', 'Abdul Haseeb'],
        ['RA-122', 'Waleed'],
        ['RA-123', 'Hareem'],
        ['RA-125', 'Jaweria Ali'],
        ['RA-126', 'Rafay Mudassar'],
    ];
    $rosterSeeded = (int) $pdo
        ->query("SELECT COUNT(*) FROM app_settings WHERE setting_key='additional_roster_seeded_v1'")
        ->fetchColumn();
    if (!$rosterSeeded) {
        if (
            !(int) $pdo
                ->query("SELECT COUNT(*) FROM users WHERE access_role<>'admin'")
                ->fetchColumn()
        ) {
            $registerInsert = $pdo->prepare(
                "INSERT IGNORE INTO users (id,name,email,pod,job_title,access_role,password_hash,active) VALUES (?,?,?,'Unassigned','Employee','employee',?,0)",
            );
            foreach ($additionalRoster as [$id, $name]) {
                $registerInsert->execute([
                    $id,
                    $name,
                    $knownEmails[$id] ?? null,
                    passwordHash(temporaryPassword()),
                ]);
            }
        }
        $pdo->exec(
            "INSERT IGNORE INTO app_settings (setting_key,setting_value) VALUES ('additional_roster_seeded_v1','1')",
        );
    }

    $configurationVersion = 'configuration_data_2026_09_23';
    $versionCheck = $pdo->prepare('SELECT COUNT(*) FROM app_settings WHERE setting_key=?');
    $versionCheck->execute([$configurationVersion]);
    if (!(int) $versionCheck->fetchColumn() && is_file(__DIR__ . '/reference_data.tsv')) {
        $file = fopen(__DIR__ . '/reference_data.tsv', 'rb');
        if ($file === false) {
            throw new RuntimeException('Cannot read configuration data');
        }
        $pdo->beginTransaction();
        try {
            fgets($file);
            fgets($file);
            $references = [];
            $holidayInsert = $pdo->prepare(
                'INSERT IGNORE INTO public_holidays (holiday_name,holiday_date) VALUES (?,?)',
            );
            $clean = static fn($value): string => trim(
                str_replace("\xc2\xa0", '', (string) $value),
            );
            while (($row = fgetcsv($file, 0, "\t")) !== false) {
                foreach (
                    ['entity' => 5, 'type' => 6, 'assignment' => 7, 'work_area' => 8, 'client' => 9]
                    as $category => $index
                ) {
                    $value = $clean($row[$index] ?? '');
                    if ($value !== '') {
                        $references[$category . ':' . $value] = [$category, $value];
                    }
                }
                $holiday = $clean($row[3] ?? '');
                $date = $clean($row[4] ?? '');
                if ($holiday !== '' && $date !== '') {
                    $parsed = DateTimeImmutable::createFromFormat('!d/m/Y', $date);
                    if ($parsed && $parsed->format('d/m/Y') === $date) {
                        $holidayInsert->execute([$holiday, $parsed->format('Y-m-d')]);
                    }
                }
            }
            foreach (array_chunk(array_values($references), 100) as $chunk) {
                $placeholders = implode(',', array_fill(0, count($chunk), '(?,?,1)'));
                $parameters = [];
                foreach ($chunk as [$category, $value]) {
                    array_push($parameters, $category, $value);
                }
                $pdo->prepare(
                    "INSERT INTO reference_values (category,value,active) VALUES $placeholders ON DUPLICATE KEY UPDATE active=1",
                )->execute($parameters);
            }
            if (
                (int) $pdo->query("SELECT COUNT(*) FROM users WHERE id='ADMIN'")->fetchColumn() > 0
            ) {
                $pdo->prepare(
                    "INSERT IGNORE INTO users (id,name,email,pod,job_title,access_role,password_hash,active) VALUES ('RA-124','Tayyab',NULL,'Audit Mavericks','Semi Senior Audit Associate','employee',?,0)",
                )->execute([passwordHash(temporaryPassword())]);
                $pdo->exec(
                    "UPDATE users SET name='Tayyab' WHERE id='RA-124' AND name='Umaar Qasim'",
                );
            }
            $pdo->prepare(
                'INSERT INTO app_settings (setting_key,setting_value) VALUES (?,?)',
            )->execute([$configurationVersion, '1']);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        } finally {
            fclose($file);
        }
    }
    $timesheetReferenceVersion = 'timesheet_references_2026_09_28';
    $versionCheck->execute([$timesheetReferenceVersion]);
    if (!(int) $versionCheck->fetchColumn()) {
        $historicalReferences = [
            ['work_area', 'Training Received'],
            ['work_area', 'Training Given'],
            ['work_area', 'Companies House'],
            ['work_area', 'Statutory Holidays'],
            ['work_area', 'Internal'],
            ['work_area', 'Timesheet'],
            ['work_area', 'Zenith Multi Academy Trust'],
            ['work_area', 'Leave'],
            ['assignment', 'Internal'],
            ['assignment', 'Leave'],
            ['client', 'Training'],
            ['client', 'Reginella Investments Limited'],
            ['client', 'Leave'],
        ];
        $pdo->beginTransaction();
        try {
            $insertReference = $pdo->prepare(
                'INSERT INTO reference_values (category,value,active) VALUES (?,?,1) ON DUPLICATE KEY UPDATE active=1',
            );
            foreach ($historicalReferences as [$category, $value]) {
                $insertReference->execute([$category, $value]);
            }
            $pdo->prepare(
                'INSERT INTO app_settings (setting_key,setting_value) VALUES (?,?)',
            )->execute([$timesheetReferenceVersion, '1']);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
    }
    $pdo->exec(
        "INSERT INTO reference_values (category,value,active) VALUES ('client','Internal',1),('client','Internal meetings',1),('assignment','Holiday/Leave',1),('work_area','Annual Leave',1),('work_area','Half Day Leave',1),('work_area','Holiday/Leave',1) ON DUPLICATE KEY UPDATE active=1",
    );
    $pdo->exec(
        "INSERT IGNORE INTO reference_values (category,value,active) SELECT 'assignment',stage,1 FROM bookings WHERE stage<>''",
    );

    if ((int) $pdo->query("SELECT COUNT(*) FROM users WHERE id='ADMIN'")->fetchColumn() > 0) {
        $pdo->prepare(
            'INSERT IGNORE INTO app_settings (setting_key,setting_value) VALUES (?,?)',
        )->execute([$schemaVersion, '1']);
        return;
    }

    $roster = [
        ['RA-003', 'Assurance Allies', 'Muhammad Zeeshan Khan', 'Manager'],
        ['RA-018', 'Assurance Allies', 'Saqib Ali', 'Assistant Manager'],
        ['RA-079', 'Assurance Allies', 'Abid Wahab', 'Trainee'],
        ['RA-082', 'Assurance Allies', 'Mehak Mehmood', 'Semi Senior Audit Associate'],
        ['RA-002', 'Audit Guild', 'Ibrar Ghani', 'Manager'],
        ['RA-047', 'Audit Guild', 'Zaynab Javed', 'Semi Senior Audit Associate'],
        ['RA-053', 'Audit Guild', 'Ali Haider', 'Senior Audit Associate'],
        ['RA-069', 'Audit Guild', 'Amna Saleem', 'Trainee'],
        ['RA-006', 'Audit Guild', 'Ahmad Akhtar', 'Senior Audit Associate'],
        ['RA-005', 'Audit Guild', 'Malik Jamal Ahmed', 'Semi Senior Audit Associate'],
        ['RA-077', 'Audit Guild', 'Zohaib Khalid', 'Trainee'],
        ['RA-014', 'Audit Mavericks', 'Danial Qureshi', 'Manager'],
        ['RA-021', 'Audit Mavericks', 'Muhammad Awais', 'Assistant Manager'],
        ['RA-063', 'Audit Mavericks', 'Syed Saqib Shah', 'Assistant Manager'],
        ['RA-040', 'Audit Mavericks', 'Arqam Shoaib', 'Senior Audit Associate'],
        ['RA-064', 'Audit Mavericks', 'Fatima Aamir', 'Trainee'],
        ['RA-045', 'Audit Mavericks', 'Muhammad Huzaifa', 'Trainee'],
        ['RA-055', 'Audit Mavericks', 'Farrukh', 'Assistant Manager'],
        ['RA-036', 'Audit Mavericks', 'Ali Raza', 'Trainee'],
        ['RA-087', 'Audit Mavericks', 'Kiran Batool', 'Trainee'],
        ['RA-124', 'Audit Mavericks', 'Tayyab', 'Semi Senior Audit Associate'],
    ];
    $insert = $pdo->prepare(
        'INSERT INTO users (id,name,email,pod,job_title,access_role,password_hash,active) VALUES (?,?,?,?,?,?,?,?)',
    );
    foreach ($roster as [$id, $pod, $name, $title]) {
        $role = stripos($title, 'manager') !== false ? 'manager' : 'employee';
        $insert->execute([
            $id,
            $name,
            $knownEmails[$id] ?? null,
            $pod,
            $title,
            $role,
            passwordHash(temporaryPassword()),
            0,
        ]);
    }
    $insert->execute([
        'ADMIN',
        'Administrator',
        $knownEmails['ADMIN'],
        'Administration',
        'System Administrator',
        'admin',
        passwordHash(temporaryPassword()),
        1,
    ]);
    $settings = [
        'start' => date('Y-m-01'),
        'end' => date('Y-m-t'),
        'asOf' => date('Y-m-d'),
        'soonDays' => 3,
        'capMode' => 'block',
        'hoursPerDay' => 8,
        'billingTarget' => 75,
        'amberThreshold' => 60,
    ];
    $stmt = $pdo->prepare('INSERT INTO app_settings (setting_key,setting_value) VALUES (?,?)');
    foreach ($settings as $key => $value) {
        $stmt->execute([$key, (string) $value]);
    }
    $stmt->execute([$schemaVersion, '1']);
}

function body(): array
{
    $data = json_decode((string) file_get_contents('php://input'), true);
    return is_array($data) ? $data : [];
}

function currentUser(): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    $stmt = db()->prepare('SELECT * FROM users WHERE id=? AND active=1');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user) {
        return null;
    }
    if ((int) ($_SESSION['session_version'] ?? -1) !== (int) ($user['session_version'] ?? 0)) {
        unset($_SESSION['user_id'], $_SESSION['csrf']);
        return null;
    }
    return $user;
}

function requireUser(): array
{
    $user = currentUser();
    if (!$user) {
        respond(['ok' => false, 'error' => 'Authentication required'], 401);
    }
    return $user;
}

function csrf(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
    }
    return $_SESSION['csrf'];
}

function checkCsrf(array $request): void
{
    if (!hash_equals(csrf(), (string) ($request['csrf'] ?? ''))) {
        respond(['ok' => false, 'error' => 'Invalid request token'], 403);
    }
}

function isAdmin(array $user): bool
{
    return $user['access_role'] === 'admin';
}
function isManager(array $user): bool
{
    return in_array($user['access_role'], ['manager', 'admin'], true);
}
function configPermissions(array $user): array
{
    return array_values(array_filter(explode(',', (string) ($user['config_permissions'] ?? ''))));
}
function canConfig(array $user, string $area): bool
{
    return isAdmin($user) ||
        ($user['access_role'] === 'manager' && in_array($area, configPermissions($user), true));
}

function canAccessPerson(array $user, string $personId): bool
{
    if (isAdmin($user)) {
        return true;
    }
    if ($user['access_role'] === 'employee') {
        return $user['id'] === $personId;
    }
    $stmt = db()->prepare(
        'SELECT COUNT(*) FROM users WHERE id=? AND pod=? AND access_role<>\'admin\'',
    );
    $stmt->execute([$personId, $user['pod']]);
    return (int) $stmt->fetchColumn() > 0;
}

function canEditTimesheet(array $user, string $personId): bool
{
    return isAdmin($user) || $user['id'] === $personId;
}

function referenceChoice(
    PDO $pdo,
    string $category,
    mixed $raw,
    bool $allowBlank = true,
    bool $allowNew = false,
    ?int $rowNumber = null,
): string {
    $value = trim(str_replace("\xc2\xa0", ' ', (string) $raw));
    $label = str_replace('_', ' ', $category);
    if ($value === '') {
        if ($allowBlank) {
            return '';
        }
        respond(
            [
                'ok' => false,
                'error' =>
                    ($rowNumber !== null ? 'Row ' . $rowNumber . ': ' : '') .
                    'Select a ' .
                    $label .
                    ' value',
            ],
            422,
        );
    }
    static $cache = [];
    $key = $category . "\0" . strtolower($value);
    if (!array_key_exists($key, $cache)) {
        $stmt = $pdo->prepare(
            'SELECT value FROM reference_values WHERE category=? AND active=1 AND LOWER(value)=LOWER(?) LIMIT 1',
        );
        $stmt->execute([$category, $value]);
        $cache[$key] = $stmt->fetchColumn();
    }
    if ($cache[$key] !== false) {
        return (string) $cache[$key];
    }
    if ($allowNew) {
        return $value;
    }
    respond(
        [
            'ok' => false,
            'error' =>
                ($rowNumber !== null ? 'Row ' . $rowNumber . ': ' : '') .
                '"' .
                $value .
                '" is not in the ' .
                $label .
                ' dropdown. Add it in Config > Reference lists, then retry.',
        ],
        422,
    );
}
function settings(): array
{
    $out = [];
    foreach (db()->query('SELECT setting_key,setting_value FROM app_settings') as $row) {
        $out[$row['setting_key']] = $row['setting_value'];
    }
    $out['soonDays'] = (int) ($out['soonDays'] ?? 3);
    $out['hoursPerDay'] = (float) ($out['hoursPerDay'] ?? 8);
    $out['billingTarget'] = (float) ($out['billingTarget'] ?? 75);
    $out['amberThreshold'] = (float) ($out['amberThreshold'] ?? 60);
    return $out;
}

function stateFor(array $user): array
{
    $pdo = db();
    $pods = isAdmin($user)
        ? $pdo->query('SELECT name FROM pods ORDER BY name')->fetchAll(PDO::FETCH_COLUMN)
        : [];
    $billingRoster = array_map(
        fn($r) => [
            'id' => $r['id'],
            'name' => $r['name'],
            'pod' => $r['pod'],
            'role' => $r['job_title'],
        ],
        $pdo
            ->query(
                "SELECT id,name,pod,job_title FROM users WHERE access_role<>'admin' ORDER BY name",
            )
            ->fetchAll(),
    );
    $where = 'u.access_role<>\'admin\'';
    $params = [];
    if ($user['access_role'] === 'employee') {
        $where .= ' AND u.active=1 AND u.id=?';
        $params[] = $user['id'];
    } elseif ($user['access_role'] === 'manager') {
        $where .= ' AND u.active=1 AND u.pod=?';
        $params[] = $user['pod'];
    }
    $stmt = $pdo->prepare("SELECT u.* FROM users u WHERE $where ORDER BY u.pod,u.name");
    $stmt->execute($params);
    $users = $stmt->fetchAll();
    $ids = array_column($users, 'id');
    $adminAccounts = isAdmin($user)
        ? $pdo
            ->query(
                "SELECT id,name,email,active FROM users WHERE access_role='admin' ORDER BY name",
            )
            ->fetchAll(PDO::FETCH_ASSOC)
        : [];
    $roster = array_map(
        fn($r) => [
            'id' => $r['id'],
            'pod' => $r['pod'],
            'name' => $r['name'],
            'email' => $r['email'],
            'role' => $r['job_title'],
            'accessRole' => $r['access_role'],
            'entity' => $r['entity'],
            'monthlyTarget' => (float) $r['monthly_target'],
            'billingRate' => $r['billing_rate'] === null ? null : (float) $r['billing_rate'],
            'configPermissions' => configPermissions($r),
            'hasPassword' => true,
            'mfaEnabled' => (bool) $r['mfa_enabled'],
            'mustChangePassword' => (bool) $r['must_change_password'],
            'active' => (bool) $r['active'],
        ],
        $users,
    );
    $importSql =
        "SELECT b.*,COALESCE(u.name,'Removed user') importer_name FROM timesheet_import_batches b LEFT JOIN users u ON u.id=b.imported_by";
    $importParams = [];
    if (!isAdmin($user)) {
        $importSql .= ' WHERE b.imported_by=?';
        $importParams[] = $user['id'];
    }
    $importSql .= ' ORDER BY b.created_at DESC LIMIT 50';
    $importStmt = $pdo->prepare($importSql);
    $importStmt->execute($importParams);
    $importLogs = array_map(
        fn($r) => [
            'batchId' => $r['batch_id'],
            'importedBy' => $r['imported_by'],
            'importer' => $r['importer_name'],
            'fileName' => $r['file_name'],
            'rowCount' => (int) $r['row_count'],
            'employeeCount' => (int) $r['employee_count'],
            'status' => $r['status'],
            'createdAt' => $r['created_at'],
            'undoneAt' => $r['undone_at'],
        ],
        $importStmt->fetchAll(),
    );
    if (!$ids) {
        return [
            'roster' => [],
            'pods' => $pods,
            'billingRoster' => $billingRoster,
            'bookings' => [],
            'leaves' => [],
            'entries' => [],
            'crossPodEntries' => [],
            'importLogs' => $importLogs,
            'adminAccounts' => $adminAccounts,
            'settings' => settings(),
            'configPermissions' => configPermissions($user),
            'entityPricing' => [],
            'csrf' => csrf(),
        ];
    }
    $marks = implode(',', array_fill(0, count($ids), '?'));
    $q = $pdo->prepare("SELECT * FROM bookings WHERE person_id IN ($marks) ORDER BY start_date");
    $q->execute($ids);
    $bookings = array_map(
        fn($r) => [
            'id' => $r['id'],
            'personId' => $r['person_id'],
            'firm' => $r['firm'],
            'client' => $r['client'],
            'status' => $r['status'],
            'stage' => $r['stage'],
            'start' => $r['start_date'],
            'end' => $r['end_date'],
            'note' => $r['note'],
            'color' => $r['color'],
        ],
        $q->fetchAll(),
    );
    $q = $pdo->prepare("SELECT * FROM leaves WHERE person_id IN ($marks) ORDER BY start_date");
    $q->execute($ids);
    $leaves = array_map(
        fn($r) => [
            'id' => $r['id'],
            'personId' => $r['person_id'],
            'type' => $r['leave_type'],
            'start' => $r['start_date'],
            'end' => $r['end_date'],
            'note' => $r['note'],
        ],
        $q->fetchAll(),
    );
    $q = $pdo->prepare(
        "SELECT * FROM timesheet_entries WHERE person_id IN ($marks) ORDER BY work_date DESC,start_time DESC,end_time DESC,id DESC",
    );
    $q->execute($ids);
    $entries = array_map(
        fn($r) => [
            'id' => $r['id'],
            'personId' => $r['person_id'],
            'billingTo' => $r['billing_to_id'] ?: $r['person_id'],
            'bookingId' => $r['booking_id'] ?? '',
            'entity' => $r['entity'],
            'type' => $r['charge_type'],
            'date' => $r['work_date'],
            'start' => $r['start_time'] ? substr($r['start_time'], 0, 5) : '',
            'end' => $r['end_time'] ? substr($r['end_time'], 0, 5) : '',
            'hours' => $r['hours'] === null ? null : (float) $r['hours'],
            'client' => $r['client_name'],
            'assignment' => $r['assignment'],
            'workArea' => $r['work_area'],
            'notes' => $r['work_done'],
            'source' => $r['source'],
            'updatedAt' => $r['updated_at'],
        ],
        $q->fetchAll(),
    );
    $crossPodEntries = isAdmin($user) ? $entries : [];
    $holidays = array_map(
        fn($r) => [
            'id' => (int) $r['id'],
            'name' => $r['holiday_name'],
            'date' => $r['holiday_date'],
        ],
        $pdo->query('SELECT * FROM public_holidays ORDER BY holiday_date')->fetchAll(),
    );
    $references = [
        'entity' => [],
        'type' => [],
        'assignment' => [],
        'work_area' => [],
        'client' => [],
    ];
    foreach (
        $pdo->query(
            'SELECT category,value FROM reference_values WHERE active=1 ORDER BY category,value',
        )
        as $r
    ) {
        $references[$r['category']][] = $r['value'];
    }
    $thresholds = [];
    foreach ($pdo->query('SELECT client_name,minimum_hours FROM audit_thresholds') as $r) {
        $thresholds[$r['client_name']] = (float) $r['minimum_hours'];
    }
    $pricing = array_map(
        fn($r) => [
            'entity' => $r['entity_name'],
            'designation' => $r['designation'],
            'rate' => (float) $r['hourly_rate'],
        ],
        $pdo->query('SELECT * FROM entity_pricing ORDER BY entity_name,designation')->fetchAll(),
    );
    return [
        'roster' => $roster,
        'pods' => $pods,
        'billingRoster' => $billingRoster,
        'bookings' => $bookings,
        'leaves' => $leaves,
        'entries' => $entries,
        'crossPodEntries' => $crossPodEntries,
        'importLogs' => $importLogs,
        'adminAccounts' => $adminAccounts,
        'holidays' => $holidays,
        'references' => $references,
        'auditThresholds' => $thresholds,
        'entityPricing' => $pricing,
        'configPermissions' => configPermissions($user),
        'settings' => settings(),
        'csrf' => csrf(),
    ];
}

function requirePersonScope(array $user, array $payload, bool $management = false): string
{
    $pid = (string) ($payload['personId'] ?? '');
    if ($pid === '' || !canAccessPerson($user, $pid)) {
        respond(['ok' => false, 'error' => 'That employee is outside your permitted scope'], 403);
    }
    if ($management && !isManager($user)) {
        respond(['ok' => false, 'error' => 'Manager access required'], 403);
    }
    return $pid;
}

function requireExistingRecordOwner(
    PDO $pdo,
    array $user,
    string $table,
    string $id,
    string $personId,
    bool $timesheet = false,
): void {
    $stmt = $pdo->prepare("SELECT person_id FROM $table WHERE id=?");
    $stmt->execute([$id]);
    $existing = $stmt->fetchColumn();
    if ($existing === false) {
        return;
    }
    if (
        (string) $existing !== $personId ||
        !canAccessPerson($user, (string) $existing) ||
        ($timesheet && !canEditTimesheet($user, (string) $existing))
    ) {
        respond(['ok' => false, 'error' => 'This record belongs to another employee'], 403);
    }
}
function sessionData(array $user): array
{
    return [
        'role' => $user['access_role'],
        'personId' => isAdmin($user) ? null : $user['id'],
        'name' => $user['name'],
        'pod' => $user['pod'],
        'mustChangePassword' => (bool) ($user['must_change_password'] ?? false),
    ];
}

function maskedEmail(string $email): string
{
    [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
    $visible = substr($local, 0, min(2, strlen($local)));
    return $visible . str_repeat('*', max(2, strlen($local) - strlen($visible))) . '@' . $domain;
}

function issueMfaChallenge(array $user, bool $resend = false): array
{
    $email = strtolower(trim((string) ($user['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        respond(
            [
                'ok' => false,
                'error' =>
                    'This account needs a valid email address. Ask the administrator to update it.',
            ],
            422,
        );
    }
    $pdo = db();
    $pdo->exec('DELETE FROM mfa_challenges WHERE expires_at<DATE_SUB(NOW(),INTERVAL 1 DAY)');
    if ($resend) {
        $latest = $pdo->prepare(
            'SELECT created_at FROM mfa_challenges WHERE user_id=? ORDER BY created_at DESC LIMIT 1',
        );
        $latest->execute([$user['id']]);
        $last = $latest->fetchColumn();
        if ($last && strtotime((string) $last) > time() - 60) {
            respond(
                [
                    'ok' => false,
                    'error' => 'Please wait 60 seconds before requesting another code.',
                ],
                429,
            );
        }
    }
    $limit = $pdo->prepare(
        'SELECT COUNT(*) FROM mfa_challenges WHERE user_id=? AND created_at>DATE_SUB(NOW(),INTERVAL 15 MINUTE)',
    );
    $limit->execute([$user['id']]);
    if ((int) $limit->fetchColumn() >= 5) {
        respond(
            [
                'ok' => false,
                'error' => 'Too many verification codes were requested. Try again in 15 minutes.',
            ],
            429,
        );
    }
    $challenge = bin2hex(random_bytes(32));
    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $pdo->prepare(
        'UPDATE mfa_challenges SET consumed_at=NOW() WHERE user_id=? AND consumed_at IS NULL',
    )->execute([$user['id']]);
    $insert = $pdo->prepare(
        'INSERT INTO mfa_challenges (challenge_id,user_id,code_hash,expires_at,requested_ip) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 10 MINUTE),?)',
    );
    $insert->execute([
        $challenge,
        $user['id'],
        password_hash($code, PASSWORD_DEFAULT),
        (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
    ]);
    try {
        sendMfaCode($email, (string) $user['name'], $code);
    } catch (Throwable $error) {
        $pdo->prepare('DELETE FROM mfa_challenges WHERE challenge_id=?')->execute([$challenge]);
        throw $error;
    }
    $_SESSION['mfa_pending_user_id'] = $user['id'];
    $_SESSION['mfa_pending_challenge'] = $challenge;
    unset($_SESSION['user_id'], $_SESSION['csrf']);
    authEvent('mfa_code_sent', (string) $user['id'], $email);
    return [
        'ok' => true,
        'mfaRequired' => true,
        'challenge' => $challenge,
        'maskedEmail' => maskedEmail($email),
        'expiresIn' => 600,
    ];
}

function completeLogin(array $user): never
{
    session_regenerate_id(true);
    unset($_SESSION['mfa_pending_user_id'], $_SESSION['mfa_pending_challenge']);
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['session_version'] = (int) ($user['session_version'] ?? 0);
    $_SESSION['csrf'] = bin2hex(random_bytes(24));
    $_SESSION['session_started_at'] = time();
    $_SESSION['last_activity'] = time();
    $_SESSION['last_rotation'] = time();
    $_SESSION['authenticated_at'] = time();
    authEvent('login_success', (string) $user['id'], (string) $user['email']);
    respond(['ok' => true, 'session' => sessionData($user), 'state' => stateFor($user)]);
}

const TRUSTED_DEVICE_COOKIE = 'reckoner_trusted_device';
const TRUSTED_DEVICE_SECONDS = 2592000;

function trustedDeviceCookie(string $value, int $expires): void
{
    global $isHttps;
    setcookie(TRUSTED_DEVICE_COOKIE, $value, [
        'expires' => $expires,
        'path' => APP_COOKIE_PATH,
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function trustedDeviceMatches(array $user): bool
{
    $cookie = (string) ($_COOKIE[TRUSTED_DEVICE_COOKIE] ?? '');
    if (!preg_match('/^([a-f0-9]{32})\.([a-f0-9]{64})$/D', $cookie, $parts)) {
        return false;
    }
    $stmt = db()->prepare(
        'SELECT token_hash,session_version,expires_at FROM trusted_devices WHERE selector=? AND user_id=? LIMIT 1',
    );
    $stmt->execute([$parts[1], $user['id']]);
    $device = $stmt->fetch();
    if (
        !$device ||
        strtotime((string) $device['expires_at']) <= time() ||
        (int) $device['session_version'] !== (int) $user['session_version'] ||
        !hash_equals((string) $device['token_hash'], hash('sha256', $parts[2]))
    ) {
        trustedDeviceCookie('', time() - 3600);
        return false;
    }
    db()
        ->prepare('UPDATE trusted_devices SET last_used_at=NOW() WHERE selector=?')
        ->execute([$parts[1]]);
    return true;
}

function rememberTrustedDevice(array $user): void
{
    if (!empty($user['must_change_password'])) {
        return;
    }
    $selector = bin2hex(random_bytes(16));
    $validator = bin2hex(random_bytes(32));
    $pdo = db();
    $pdo->exec('DELETE FROM trusted_devices WHERE expires_at<NOW()');
    $pdo->prepare(
        'INSERT INTO trusted_devices (selector,user_id,token_hash,session_version,expires_at) VALUES (?,?,?,?,DATE_ADD(NOW(),INTERVAL 30 DAY))',
    )->execute([
        $selector,
        $user['id'],
        hash('sha256', $validator),
        (int) $user['session_version'],
    ]);
    trustedDeviceCookie($selector . '.' . $validator, time() + TRUSTED_DEVICE_SECONDS);
}
function temporaryPassword(): string
{
    return 'Rk!' . substr(strtr(base64_encode(random_bytes(12)), '+/=', 'XYZ'), 0, 13);
}

function passwordHash(string $password): string
{
    return defined('PASSWORD_ARGON2ID')
        ? password_hash($password, PASSWORD_ARGON2ID, [
            'memory_cost' => 19456,
            'time_cost' => 2,
            'threads' => 1,
        ])
        : password_hash($password, PASSWORD_DEFAULT);
}

function clientIp(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
}
function authEvent(string $type, ?string $userId = null, string $email = ''): void
{
    try {
        $stmt = db()->prepare(
            'INSERT INTO auth_events (user_id,email,event_type,ip_address,user_agent) VALUES (?,?,?,?,?)',
        );
        $stmt->execute([
            $userId,
            $email,
            $type,
            clientIp(),
            substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
        ]);
    } catch (Throwable $ignored) {
    }
}
function enforceLoginRate(string $email): void
{
    $stmt = db()->prepare(
        "SELECT COUNT(*) FROM auth_events WHERE event_type='login_failed' AND created_at>DATE_SUB(NOW(),INTERVAL 15 MINUTE) AND (email=? OR ip_address=?)",
    );
    $stmt->execute([$email, clientIp()]);
    if ((int) $stmt->fetchColumn() >= 10) {
        respond(
            ['ok' => false, 'error' => 'Too many sign-in attempts. Try again in 15 minutes.'],
            429,
        );
    }
}
function requireRecentAuthentication(): void
{
    if (time() - (int) ($_SESSION['authenticated_at'] ?? 0) > 3600) {
        respond(
            [
                'ok' => false,
                'error' =>
                    'For security, sign out and complete MFA again before performing this action.',
            ],
            403,
        );
    }
}
function enforcePasswordResetRate(string $email): void
{
    $stmt = db()->prepare(
        "SELECT COUNT(*) FROM auth_events WHERE event_type='password_reset_requested' AND created_at>DATE_SUB(NOW(),INTERVAL 15 MINUTE) AND (email=? OR ip_address=?)",
    );
    $stmt->execute([$email, clientIp()]);
    if ((int) $stmt->fetchColumn() >= 5) {
        respond(
            ['ok' => false, 'error' => 'Too many reset requests. Try again in 15 minutes.'],
            429,
        );
    }
}

try {
    installDatabase();
    $request = body();
    $action = (string) ($request['action'] ?? 'bootstrap');
    $payload = (array) ($request['payload'] ?? []);

    if ($action === 'bootstrap') {
        $user = currentUser();
        if ($user) {
            respond(['ok' => true, 'session' => sessionData($user), 'state' => stateFor($user)]);
        }
        respond(['ok' => true]);
    }
    if ($action === 'login') {
        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        enforceLoginRate($email);
        $password = (string) ($payload['password'] ?? '');
        if (strlen($password) > 256) {
            respond(['ok' => false, 'error' => 'Invalid email or password'], 401);
        }
        $stmt = db()->prepare('SELECT * FROM users WHERE LOWER(email)=? AND active=1');
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        if (!$user || !password_verify($password, $user['password_hash'])) {
            authEvent('login_failed', $user['id'] ?? null, $email);
            respond(['ok' => false, 'error' => 'Invalid email or password'], 401);
        }
        if (trustedDeviceMatches($user)) {
            completeLogin($user);
        }
        respond(issueMfaChallenge($user));
    }
    if ($action === 'resendMfa') {
        $pending = (string) ($_SESSION['mfa_pending_user_id'] ?? '');
        if ($pending === '') {
            respond(['ok' => false, 'error' => 'Start sign-in again.'], 401);
        }
        $stmt = db()->prepare('SELECT * FROM users WHERE id=? AND active=1');
        $stmt->execute([$pending]);
        $user = $stmt->fetch();
        if (!$user) {
            respond(['ok' => false, 'error' => 'Start sign-in again.'], 401);
        }
        respond(issueMfaChallenge($user, true));
    }
    if ($action === 'verifyMfa') {
        $challenge = (string) ($payload['challenge'] ?? '');
        $code = preg_replace('/\D/', '', (string) ($payload['code'] ?? ''));
        $pending = (string) ($_SESSION['mfa_pending_user_id'] ?? '');
        if (
            $pending === '' ||
            $challenge === '' ||
            !hash_equals((string) ($_SESSION['mfa_pending_challenge'] ?? ''), $challenge)
        ) {
            respond(
                [
                    'ok' => false,
                    'error' => 'This verification request is no longer valid. Sign in again.',
                ],
                401,
            );
        }
        $stmt = db()->prepare(
            'SELECT c.*,u.*,c.expires_at < NOW() AS code_expired FROM mfa_challenges c JOIN users u ON u.id=c.user_id WHERE c.challenge_id=? AND c.user_id=? AND u.active=1 LIMIT 1',
        );
        $stmt->execute([$challenge, $pending]);
        $row = $stmt->fetch();
        if (
            !$row ||
            $row['consumed_at'] !== null ||
            (int) $row['code_expired'] === 1 ||
            (int) $row['attempts'] >= 5
        ) {
            authEvent('mfa_expired', $pending, '');
            respond(['ok' => false, 'error' => 'This code has expired. Request a new code.'], 401);
        }
        if (strlen($code) !== 6 || !password_verify($code, (string) $row['code_hash'])) {
            $pdo = db();
            $pdo->prepare(
                'UPDATE mfa_challenges SET attempts=attempts+1 WHERE challenge_id=?',
            )->execute([$challenge]);
            authEvent('mfa_failed', $pending, (string) ($row['email'] ?? ''));
            respond(['ok' => false, 'error' => 'Incorrect verification code.'], 401);
        }
        db()
            ->prepare('UPDATE mfa_challenges SET consumed_at=NOW() WHERE challenge_id=?')
            ->execute([$challenge]);
        if (!empty($payload['rememberDevice'])) {
            rememberTrustedDevice($row);
        }
        completeLogin($row);
    }
    if ($action === 'requestPasswordReset') {
        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        enforcePasswordResetRate($email);
        authEvent('password_reset_requested', null, $email);
        $challenge = bin2hex(random_bytes(32));
        $stmt = db()->prepare('SELECT * FROM users WHERE LOWER(email)=? AND active=1');
        $stmt->execute([$email]);
        $resetUser = $stmt->fetch();
        if ($resetUser && filter_var($resetUser['email'], FILTER_VALIDATE_EMAIL)) {
            $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $pdo = db();
            $pdo->exec(
                'DELETE FROM password_reset_challenges WHERE expires_at<DATE_SUB(NOW(),INTERVAL 1 DAY)',
            );
            $pdo->prepare(
                'UPDATE password_reset_challenges SET consumed_at=NOW() WHERE user_id=? AND consumed_at IS NULL',
            )->execute([$resetUser['id']]);
            $pdo->prepare(
                'INSERT INTO password_reset_challenges (challenge_id,user_id,code_hash,expires_at,requested_ip) VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 10 MINUTE),?)',
            )->execute([
                $challenge,
                $resetUser['id'],
                password_hash($code, PASSWORD_DEFAULT),
                clientIp(),
            ]);
            try {
                sendPasswordResetCode(
                    (string) $resetUser['email'],
                    (string) $resetUser['name'],
                    $code,
                );
            } catch (Throwable $mailError) {
                $pdo->prepare(
                    'DELETE FROM password_reset_challenges WHERE challenge_id=?',
                )->execute([$challenge]);
                $detail = $mailError->getMessage();
                $reason = 'unknown';
                if (preg_match('/\(([A-Za-z0-9_.-]+)\)/', $detail, $match)) {
                    $reason = strtolower($match[1]);
                } elseif (str_contains($detail, 'not configured')) {
                    $reason = 'not_configured';
                } elseif (str_contains($detail, 'cURL extension')) {
                    $reason = 'curl_missing';
                } elseif (str_contains($detail, 'could not be reached')) {
                    $reason = 'network';
                } elseif (str_contains($detail, 'Could not initialise')) {
                    $reason = 'curl_init_failed';
                }
                authEvent(
                    'reset_mail_' . substr($reason, 0, 29),
                    (string) $resetUser['id'],
                    (string) $resetUser['email'],
                );
                error_log('Password reset email failed: ' . $detail);
                $challenge = bin2hex(random_bytes(32));
            }
        } else {
            password_hash(
                str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT),
                PASSWORD_DEFAULT,
            );
        }
        respond([
            'ok' => true,
            'challenge' => $challenge,
            'message' => 'If an active account uses that email, a reset code has been sent.',
        ]);
    }
    if ($action === 'resetForgottenPassword') {
        $challenge = (string) ($payload['challenge'] ?? '');
        $code = preg_replace('/\D/', '', (string) ($payload['code'] ?? ''));
        $new = (string) ($payload['password'] ?? '');
        if (strlen($new) < 8 || strlen($new) > 256) {
            respond(
                ['ok' => false, 'error' => 'Use 8 to 256 characters for the new password.'],
                422,
            );
        }
        $stmt = db()->prepare(
            'SELECT c.*,u.email,c.expires_at < NOW() AS code_expired FROM password_reset_challenges c JOIN users u ON u.id=c.user_id WHERE c.challenge_id=? AND u.active=1 LIMIT 1',
        );
        $stmt->execute([$challenge]);
        $reset = $stmt->fetch();
        if (
            !$reset ||
            $reset['consumed_at'] !== null ||
            (int) $reset['code_expired'] === 1 ||
            (int) $reset['attempts'] >= 5
        ) {
            respond(
                [
                    'ok' => false,
                    'error' => 'The reset code is invalid or expired. Request a new one.',
                ],
                401,
            );
        }
        if (strlen($code) !== 6 || !password_verify($code, (string) $reset['code_hash'])) {
            db()
                ->prepare(
                    'UPDATE password_reset_challenges SET attempts=attempts+1 WHERE challenge_id=?',
                )
                ->execute([$challenge]);
            authEvent(
                'password_reset_code_failed',
                (string) $reset['user_id'],
                (string) $reset['email'],
            );
            respond(['ok' => false, 'error' => 'The reset code is incorrect.'], 401);
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'UPDATE users SET password_hash=?,must_change_password=0,password_changed_at=NOW(),session_version=session_version+1 WHERE id=?',
            )->execute([passwordHash($new), $reset['user_id']]);
            $pdo->prepare(
                'UPDATE password_reset_challenges SET consumed_at=NOW() WHERE challenge_id=?',
            )->execute([$challenge]);
            $pdo->prepare('DELETE FROM mfa_challenges WHERE user_id=?')->execute([
                $reset['user_id'],
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
        authEvent('password_reset_completed', (string) $reset['user_id'], (string) $reset['email']);
        respond(['ok' => true]);
    }
    if ($action === 'logout') {
        $active = currentUser();
        if ($active) {
            authEvent('logout', (string) $active['id'], (string) $active['email']);
        }
        $_SESSION = [];
        session_destroy();
        setcookie(session_name(), '', [
            'expires' => time() - 3600,
            'path' => APP_COOKIE_PATH,
            'secure' => $isHttps,
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        header('Clear-Site-Data: "cache", "storage"');
        respond(['ok' => true]);
    }

    $user = requireUser();
    if ($action === 'getAll') {
        if (!empty($user['must_change_password'])) {
            respond(
                ['ok' => false, 'error' => 'Change your temporary password before continuing'],
                403,
            );
        }
        respond(stateFor($user));
    }
    checkCsrf($request);
    if (!empty($user['must_change_password']) && !in_array($action, ['changePassword'], true)) {
        respond(
            ['ok' => false, 'error' => 'Change your temporary password before continuing'],
            403,
        );
    }
    $pdo = db();

    if ($action === 'addPod') {
        if (!isAdmin($user)) {
            respond(['ok' => false, 'error' => 'Administrator access required'], 403);
        }
        $name = trim(preg_replace('/\s+/u', ' ', (string) ($payload['name'] ?? '')));
        if ($name === '' || mb_strlen($name) > 120) {
            respond(['ok' => false, 'error' => 'Enter a pod name of at most 120 characters'], 422);
        }
        try {
            $pdo->prepare('INSERT INTO pods (name) VALUES (?)')->execute([$name]);
        } catch (PDOException $error) {
            if (($error->errorInfo[1] ?? 0) === 1062) {
                respond(['ok' => false, 'error' => 'That pod already exists'], 409);
            }
            throw $error;
        }
        respond(['ok' => true, 'name' => $name]);
    }
    if ($action === 'createAdmin') {
        if (!isAdmin($user)) {
            respond(['ok' => false, 'error' => 'Administrator access required'], 403);
        }
        requireRecentAuthentication();
        $name = trim((string) ($payload['name'] ?? ''));
        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        if ($name === '' || mb_strlen($name) > 120) {
            respond(
                ['ok' => false, 'error' => 'Enter an administrator name of at most 120 characters'],
                422,
            );
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
            respond(['ok' => false, 'error' => 'Enter a valid administrator email address'], 422);
        }
        $id = 'ADMIN-' . strtoupper(bin2hex(random_bytes(4)));
        $password = temporaryPassword();
        try {
            $pdo->prepare(
                "INSERT INTO users (id,name,email,pod,job_title,access_role,password_hash,mfa_enabled,must_change_password,active) VALUES (?,?,?,'Administration','System Administrator','admin',?,1,1,1)",
            )->execute([$id, $name, $email, passwordHash($password)]);
        } catch (PDOException $error) {
            if (($error->errorInfo[1] ?? 0) === 1062) {
                respond(
                    ['ok' => false, 'error' => 'That administrator email is already in use.'],
                    409,
                );
            }
            throw $error;
        }
        authEvent('admin_created', (string) $user['id'], (string) $user['email']);
        respond(['ok' => true, 'id' => $id, 'temporaryPassword' => $password]);
    }
    if ($action === 'importEntries') {
        $incoming = (array) ($payload['entries'] ?? []);
        if (!$incoming || count($incoming) > 20000) {
            respond(
                ['ok' => false, 'error' => 'Import must contain between 1 and 20,000 rows'],
                422,
            );
        }
        $fileName = trim(
            basename(str_replace('\\', '/', (string) ($payload['fileName'] ?? 'timesheet.xlsx'))),
        );
        $fileName = substr($fileName ?: 'timesheet.xlsx', 0, 255);
        $people = [];
        foreach (
            $pdo->query("SELECT id,active FROM users WHERE access_role<>'admin'")
            as $personRow
        ) {
            $people[$personRow['id']] = (bool) $personRow['active'];
        }
        $validated = [];
        $importReferences = [];
        $allowNewReferences = isAdmin($user);
        $referenceMap = [];
        if (!$allowNewReferences) {
            foreach (
                $pdo->query('SELECT category,value FROM reference_values WHERE active=1')
                as $choice
            ) {
                $referenceMap[$choice['category']][strtolower((string) $choice['value'])] = true;
            }
        }
        $problems = [];
        foreach ($incoming as $rowIndex => $row) {
            $label =
                substr(trim((string) ($row['sourceRow'] ?? '')), 0, 120) ?:
                'Row ' . ($rowIndex + 1);
            $pid = (string) ($row['personId'] ?? '');
            $billingTo = (string) ($row['billingTo'] ?? $pid);
            $date = (string) ($row['date'] ?? '');
            if (!array_key_exists($pid, $people)) {
                $problems[] = "$label: Unknown employee.";
            }
            if (!array_key_exists($billingTo, $people)) {
                $problems[] = "$label: Unknown Billing To employee.";
            }
            if (!isAdmin($user) && ($pid !== $user['id'] || empty($people[$pid]))) {
                $problems[] = "$label: You may import only your own timesheet.";
            }
            if (
                !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $parts) ||
                !checkdate((int) ($parts[2] ?? 0), (int) ($parts[3] ?? 0), (int) ($parts[1] ?? 0))
            ) {
                $problems[] = "$label: Invalid date.";
            }
            $hours = $row['hours'] ?? '';
            if (
                $hours !== '' &&
                $hours !== null &&
                (!is_numeric($hours) || (float) $hours < 0 || (float) $hours > 24)
            ) {
                $problems[] = "$label: Hours must be between 0 and 24.";
            }
            foreach (
                [
                    'entity' => false,
                    'type' => false,
                    'client' => true,
                    'assignment' => true,
                    'work_area' => true,
                ]
                as $category => $allowBlank
            ) {
                $field = $category === 'work_area' ? 'workArea' : $category;
                $value = trim(str_replace("\xc2\xa0", ' ', (string) ($row[$field] ?? '')));
                if ($value === '') {
                    if (!$allowBlank) {
                        $problems[] = "$label: Select a $category value.";
                    }
                    continue;
                }
                if (!$allowNewReferences && !isset($referenceMap[$category][strtolower($value)])) {
                    $problems[] = "$label: \"$value\" is not in the $category dropdown.";
                }
            }
        }
        if ($problems) {
            respond(
                [
                    'ok' => false,
                    'error' => count($problems) . ' import error(s) found; no rows were saved.',
                    'errors' => $problems,
                ],
                422,
            );
        }
        foreach ($incoming as $rowIndex => $row) {
            $pid = (string) ($row['personId'] ?? '');
            $billingTo = (string) ($row['billingTo'] ?? $pid);
            $date = (string) ($row['date'] ?? '');
            if (!array_key_exists($pid, $people) || !array_key_exists($billingTo, $people)) {
                respond(
                    ['ok' => false, 'error' => 'The workbook contains an unknown employee'],
                    422,
                );
            }
            if (!isAdmin($user) && ($pid !== $user['id'] || !$people[$pid])) {
                respond(['ok' => false, 'error' => 'You may import only your own timesheet'], 403);
            }
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                respond(['ok' => false, 'error' => 'The workbook contains an invalid date'], 422);
            }
            $entity = referenceChoice(
                $pdo,
                'entity',
                $row['entity'] ?? '',
                false,
                $allowNewReferences,
                $rowIndex + 1,
            );
            $type = referenceChoice(
                $pdo,
                'type',
                $row['type'] ?? '',
                false,
                $allowNewReferences,
                $rowIndex + 1,
            );
            $client = referenceChoice(
                $pdo,
                'client',
                $row['client'] ?? '',
                true,
                $allowNewReferences,
                $rowIndex + 1,
            );
            $assignment = referenceChoice(
                $pdo,
                'assignment',
                $row['assignment'] ?? '',
                true,
                $allowNewReferences,
                $rowIndex + 1,
            );
            $workArea = referenceChoice(
                $pdo,
                'work_area',
                $row['workArea'] ?? '',
                true,
                $allowNewReferences,
                $rowIndex + 1,
            );
            $hours = ($row['hours'] ?? '') === '' ? null : (float) $row['hours'];
            if ($hours !== null && ($hours < 0 || $hours > 24)) {
                respond(
                    [
                        'ok' => false,
                        'error' => 'Every imported hours value must be between 0 and 24',
                    ],
                    422,
                );
            }
            $start = (string) ($row['start'] ?? '');
            $end = (string) ($row['end'] ?? '');
            $notes = (string) ($row['notes'] ?? '');
            $identity = implode('|', [
                $pid,
                $billingTo,
                $date,
                $start,
                $end,
                $entity,
                $type,
                $client,
                $assignment,
                $workArea,
                $notes,
            ]);
            $id = 'imp_' . substr(hash('sha256', $identity), 0, 36);
            if ($allowNewReferences) {
                foreach (
                    [
                        'entity' => $entity,
                        'type' => $type,
                        'client' => $client,
                        'assignment' => $assignment,
                        'work_area' => $workArea,
                    ]
                    as $category => $value
                ) {
                    if ($value !== '') {
                        $importReferences[$category . "\0" . $value] = [$category, $value];
                    }
                }
            }
            $validated[] = [
                'id' => $id,
                'personId' => $pid,
                'billingTo' => $billingTo,
                'date' => $date,
                'entity' => $entity,
                'type' => $type,
                'start' => $start,
                'end' => $end,
                'hours' => $hours,
                'client' => $client,
                'assignment' => $assignment,
                'workArea' => $workArea,
                'notes' => $notes,
            ];
        }
        $batch = bin2hex(random_bytes(16));
        $employeeCount = count(array_unique(array_column($validated, 'personId')));
        $pdo->beginTransaction();
        try {
            if ($allowNewReferences) {
                foreach (array_chunk(array_values($importReferences), 100) as $chunk) {
                    $placeholders = implode(',', array_fill(0, count($chunk), '(?,?,1)'));
                    $parameters = [];
                    foreach ($chunk as [$category, $value]) {
                        array_push($parameters, $category, $value);
                    }
                    $pdo->prepare(
                        "INSERT INTO reference_values (category,value,active) VALUES $placeholders ON DUPLICATE KEY UPDATE active=1",
                    )->execute($parameters);
                }
            }
            $pdo->prepare(
                'INSERT INTO timesheet_import_batches (batch_id,imported_by,file_name,row_count,employee_count) VALUES (?,?,?,?,?)',
            )->execute([$batch, $user['id'], $fileName, count($validated), $employeeCount]);
            $existing = $pdo->prepare('SELECT * FROM timesheet_entries WHERE id=?');
            $change = $pdo->prepare(
                'INSERT INTO timesheet_import_changes (batch_id,entry_id,previous_json) VALUES (?,?,?)',
            );
            $insert = $pdo->prepare(
                "INSERT INTO timesheet_entries (id,person_id,billing_to_id,booking_id,entity,charge_type,work_date,start_time,end_time,hours,client_name,assignment,work_area,work_done,source,import_batch_id) VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,'import',?) ON DUPLICATE KEY UPDATE billing_to_id=VALUES(billing_to_id),entity=VALUES(entity),charge_type=VALUES(charge_type),work_date=VALUES(work_date),start_time=VALUES(start_time),end_time=VALUES(end_time),hours=VALUES(hours),client_name=VALUES(client_name),assignment=VALUES(assignment),work_area=VALUES(work_area),work_done=VALUES(work_done),source='import',import_batch_id=VALUES(import_batch_id)",
            );
            foreach ($validated as $row) {
                $existing->execute([$row['id']]);
                $before = $existing->fetch();
                if (
                    $before &&
                    ($before['person_id'] !== $row['personId'] ||
                        !canEditTimesheet($user, (string) $before['person_id']))
                ) {
                    respond(
                        [
                            'ok' => false,
                            'error' => 'An imported row matches another employee entry ID',
                        ],
                        403,
                    );
                }
                $change->execute([
                    $batch,
                    $row['id'],
                    $before
                        ? json_encode(
                            $before,
                            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
                        )
                        : null,
                ]);
                $insert->execute([
                    $row['id'],
                    $row['personId'],
                    $row['billingTo'],
                    $row['entity'],
                    $row['type'],
                    $row['date'],
                    $row['start'] ?: null,
                    $row['end'] ?: null,
                    $row['hours'],
                    $row['client'],
                    $row['assignment'],
                    $row['workArea'],
                    $row['notes'],
                    $batch,
                ]);
            }
            $pdo->commit();
            authEvent('timesheet_import', (string) $user['id'], (string) $user['email']);
            respond(['ok' => true, 'saved' => count($validated), 'batchId' => $batch]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
    } elseif ($action === 'undoTimesheetImport') {
        $batch = (string) ($payload['batchId'] ?? '');
        $stmt = $pdo->prepare('SELECT * FROM timesheet_import_batches WHERE batch_id=?');
        $stmt->execute([$batch]);
        $import = $stmt->fetch();
        if (!$import || $import['status'] !== 'active') {
            respond(
                ['ok' => false, 'error' => 'That import is unavailable or has already been undone'],
                404,
            );
        }
        if (!isAdmin($user) && (string) $import['imported_by'] !== (string) $user['id']) {
            respond(['ok' => false, 'error' => 'You may undo only your own imports'], 403);
        }
        $changes = $pdo->prepare('SELECT * FROM timesheet_import_changes WHERE batch_id=?');
        $changes->execute([$batch]);
        $current = $pdo->prepare('SELECT import_batch_id FROM timesheet_entries WHERE id=?');
        $delete = $pdo->prepare('DELETE FROM timesheet_entries WHERE id=? AND import_batch_id=?');
        $restore = $pdo->prepare(
            'UPDATE timesheet_entries SET person_id=?,billing_to_id=?,booking_id=?,entity=?,charge_type=?,work_date=?,start_time=?,end_time=?,hours=?,client_name=?,assignment=?,work_area=?,work_done=?,source=?,import_batch_id=? WHERE id=? AND import_batch_id=?',
        );
        $restored = 0;
        $pdo->beginTransaction();
        try {
            foreach ($changes as $changeRow) {
                $current->execute([$changeRow['entry_id']]);
                if ((string) $current->fetchColumn() !== $batch) {
                    continue;
                }
                $previous =
                    $changeRow['previous_json'] === null
                        ? null
                        : json_decode(
                            (string) $changeRow['previous_json'],
                            true,
                            512,
                            JSON_THROW_ON_ERROR,
                        );
                if ($previous === null) {
                    $delete->execute([$changeRow['entry_id'], $batch]);
                    $restored += $delete->rowCount();
                } else {
                    $restore->execute([
                        $previous['person_id'],
                        $previous['billing_to_id'],
                        $previous['booking_id'],
                        $previous['entity'],
                        $previous['charge_type'],
                        $previous['work_date'],
                        $previous['start_time'],
                        $previous['end_time'],
                        $previous['hours'],
                        $previous['client_name'],
                        $previous['assignment'],
                        $previous['work_area'],
                        $previous['work_done'],
                        $previous['source'],
                        $previous['import_batch_id'],
                        $changeRow['entry_id'],
                        $batch,
                    ]);
                    $restored += $restore->rowCount();
                }
            }
            $pdo->prepare(
                "UPDATE timesheet_import_batches SET status='undone',undone_at=NOW(),undone_by=? WHERE batch_id=?",
            )->execute([$user['id'], $batch]);
            $pdo->commit();
            authEvent('timesheet_import_undone', (string) $user['id'], (string) $user['email']);
            respond(['ok' => true, 'restored' => $restored]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
    } elseif ($action === 'batchEntries') {
        $upserts = (array) ($payload['upsert'] ?? []);
        $deleteIds = (array) ($payload['deleteIds'] ?? []);
        if ((!$upserts && !$deleteIds) || count($upserts) + count($deleteIds) > 366) {
            respond(['ok' => false, 'error' => 'Choose between 1 and 366 timesheet rows'], 422);
        }
        $seen = [];
        foreach ($upserts as $row) {
            if (!is_array($row)) {
                respond(['ok' => false, 'error' => 'Invalid timesheet row'], 422);
            }
            $id = (string) ($row['id'] ?? '');
            if ($id === '' || isset($seen[$id])) {
                respond(['ok' => false, 'error' => 'Each timesheet row needs a unique ID'], 422);
            }
            $seen[$id] = true;
        }
        foreach ($deleteIds as $id) {
            $id = (string) $id;
            if ($id === '' || isset($seen[$id])) {
                respond(['ok' => false, 'error' => 'Each timesheet row needs a unique ID'], 422);
            }
            $seen[$id] = true;
        }
        $owner = $pdo->prepare('SELECT person_id FROM timesheet_entries WHERE id=?');
        $billingCheck = $pdo->prepare(
            "SELECT COUNT(*) FROM users WHERE id=? AND access_role<>'admin'",
        );
        $bookingCheck = $pdo->prepare('SELECT COUNT(*) FROM bookings WHERE id=?');
        $write = $pdo->prepare(
            'INSERT INTO timesheet_entries (id,person_id,billing_to_id,booking_id,entity,charge_type,work_date,start_time,end_time,hours,client_name,assignment,work_area,work_done,source,import_batch_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL) ON DUPLICATE KEY UPDATE billing_to_id=VALUES(billing_to_id),booking_id=VALUES(booking_id),entity=VALUES(entity),charge_type=VALUES(charge_type),work_date=VALUES(work_date),start_time=VALUES(start_time),end_time=VALUES(end_time),hours=VALUES(hours),client_name=VALUES(client_name),assignment=VALUES(assignment),work_area=VALUES(work_area),work_done=VALUES(work_done),source=VALUES(source),import_batch_id=NULL',
        );
        $delete = $pdo->prepare('DELETE FROM timesheet_entries WHERE id=?');
        $pdo->beginTransaction();
        try {
            foreach ($upserts as $row) {
                $pid = requirePersonScope($user, $row);
                if (!canEditTimesheet($user, $pid)) {
                    respond(
                        ['ok' => false, 'error' => 'Managers may edit only their own timesheet'],
                        403,
                    );
                }
                $id = (string) $row['id'];
                $owner->execute([$id]);
                $existingPid = $owner->fetchColumn();
                if (
                    $existingPid !== false &&
                    ((string) $existingPid !== $pid ||
                        !canEditTimesheet($user, (string) $existingPid))
                ) {
                    respond(
                        ['ok' => false, 'error' => 'A timesheet row belongs to another employee'],
                        403,
                    );
                }
                $billingTo = (string) ($row['billingTo'] ?? $pid);
                $billingCheck->execute([$billingTo]);
                if (!(int) $billingCheck->fetchColumn()) {
                    respond(['ok' => false, 'error' => 'Select a valid Billing To employee'], 422);
                }
                $entity = referenceChoice($pdo, 'entity', $row['entity'] ?? '', false);
                $type = referenceChoice($pdo, 'type', $row['type'] ?? '', false);
                $client = referenceChoice($pdo, 'client', $row['client'] ?? '', true);
                $assignment = referenceChoice($pdo, 'assignment', $row['assignment'] ?? '', true);
                $workArea = referenceChoice($pdo, 'work_area', $row['workArea'] ?? '', true);
                $date = (string) ($row['date'] ?? '');
                if (
                    !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $parts) ||
                    !checkdate(
                        (int) ($parts[2] ?? 0),
                        (int) ($parts[3] ?? 0),
                        (int) ($parts[1] ?? 0),
                    )
                ) {
                    respond(['ok' => false, 'error' => 'Invalid timesheet date'], 422);
                }
                $hours = $row['hours'] ?? null;
                if (
                    $hours !== null &&
                    $hours !== '' &&
                    (!is_numeric($hours) || (float) $hours < 0 || (float) $hours > 24)
                ) {
                    respond(['ok' => false, 'error' => 'Hours must be between 0 and 24'], 422);
                }
                $bookingId = (string) ($row['bookingId'] ?? '');
                if ($bookingId !== '') {
                    $bookingCheck->execute([$bookingId]);
                    if (!(int) $bookingCheck->fetchColumn()) {
                        respond(
                            [
                                'ok' => false,
                                'error' => 'Select a valid Linked Booking from the dropdown',
                            ],
                            422,
                        );
                    }
                }
                $write->execute([
                    $id,
                    $pid,
                    $billingTo,
                    $bookingId ?: null,
                    $entity,
                    $type,
                    $date,
                    $row['start'] ?? '' ?: null,
                    $row['end'] ?? '' ?: null,
                    $hours === '' ? null : $hours,
                    $client,
                    $assignment,
                    $workArea,
                    (string) ($row['notes'] ?? ''),
                    (string) ($row['source'] ?? 'self'),
                ]);
            }
            foreach ($deleteIds as $id) {
                $owner->execute([(string) $id]);
                $pid = $owner->fetchColumn();
                if (
                    $pid === false ||
                    !canAccessPerson($user, (string) $pid) ||
                    !canEditTimesheet($user, (string) $pid)
                ) {
                    respond(
                        [
                            'ok' => false,
                            'error' => 'You may delete only your own timesheet entries',
                        ],
                        403,
                    );
                }
                $delete->execute([(string) $id]);
            }
            $pdo->commit();
            respond(['ok' => true, 'saved' => count($upserts), 'deleted' => count($deleteIds)]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
    } elseif ($action === 'upsertEntry') {
        $pid = requirePersonScope($user, $payload);
        if (!canEditTimesheet($user, $pid)) {
            respond(['ok' => false, 'error' => 'Managers may edit only their own timesheet'], 403);
        }
        requireExistingRecordOwner(
            $pdo,
            $user,
            'timesheet_entries',
            (string) ($payload['id'] ?? ''),
            $pid,
            true,
        );
        $billingTo = (string) ($payload['billingTo'] ?? $pid);
        $check = $pdo->prepare("SELECT COUNT(*) FROM users WHERE id=? AND access_role<>'admin'");
        $check->execute([$billingTo]);
        if (!(int) $check->fetchColumn()) {
            respond(['ok' => false, 'error' => 'Select a valid Billing To employee'], 422);
        }
        $entity = referenceChoice($pdo, 'entity', $payload['entity'] ?? '', false);
        $type = referenceChoice($pdo, 'type', $payload['type'] ?? '', false);
        $client = referenceChoice($pdo, 'client', $payload['client'] ?? '', true);
        $assignment = referenceChoice($pdo, 'assignment', $payload['assignment'] ?? '', true);
        $workArea = referenceChoice($pdo, 'work_area', $payload['workArea'] ?? '', true);
        $bookingId = (string) ($payload['bookingId'] ?? '');
        if ($bookingId !== '') {
            $bookingCheck = $pdo->prepare('SELECT COUNT(*) FROM bookings WHERE id=?');
            $bookingCheck->execute([$bookingId]);
            if (!(int) $bookingCheck->fetchColumn()) {
                respond(
                    ['ok' => false, 'error' => 'Select a valid Linked Booking from the dropdown'],
                    422,
                );
            }
        }
        $sql =
            'INSERT INTO timesheet_entries (id,person_id,billing_to_id,booking_id,entity,charge_type,work_date,start_time,end_time,hours,client_name,assignment,work_area,work_done,source,import_batch_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL) ON DUPLICATE KEY UPDATE billing_to_id=VALUES(billing_to_id),booking_id=VALUES(booking_id),entity=VALUES(entity),charge_type=VALUES(charge_type),work_date=VALUES(work_date),start_time=VALUES(start_time),end_time=VALUES(end_time),hours=VALUES(hours),client_name=VALUES(client_name),assignment=VALUES(assignment),work_area=VALUES(work_area),work_done=VALUES(work_done),source=VALUES(source),import_batch_id=NULL';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            (string) $payload['id'],
            $pid,
            $billingTo,
            $bookingId ?: null,
            $entity,
            $type,
            (string) $payload['date'],
            $payload['start'] ?? '' ?: null,
            $payload['end'] ?? '' ?: null,
            ($payload['hours'] ?? '') === '' ? null : $payload['hours'],
            $client,
            $assignment,
            $workArea,
            (string) ($payload['notes'] ?? ''),
            (string) ($payload['source'] ?? 'self'),
        ]);
    } elseif ($action === 'deleteEntry') {
        $stmt = $pdo->prepare('SELECT person_id FROM timesheet_entries WHERE id=?');
        $stmt->execute([(string) $payload['id']]);
        $pid = (string) $stmt->fetchColumn();
        if (!$pid || !canAccessPerson($user, $pid) || !canEditTimesheet($user, $pid)) {
            respond(
                ['ok' => false, 'error' => 'Managers may delete only their own timesheet entries'],
                403,
            );
        }
        $pdo->prepare('DELETE FROM timesheet_entries WHERE id=?')->execute([
            (string) $payload['id'],
        ]);
    } elseif ($action === 'upsertBooking') {
        $pid = requirePersonScope($user, $payload, true);
        requireExistingRecordOwner($pdo, $user, 'bookings', (string) ($payload['id'] ?? ''), $pid);
        $stmt = $pdo->prepare(
            'INSERT INTO bookings (id,person_id,firm,client,status,stage,start_date,end_date,note,color) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE person_id=VALUES(person_id),firm=VALUES(firm),client=VALUES(client),status=VALUES(status),stage=VALUES(stage),start_date=VALUES(start_date),end_date=VALUES(end_date),note=VALUES(note),color=VALUES(color)',
        );
        $stmt->execute([
            (string) $payload['id'],
            $pid,
            (string) ($payload['firm'] ?? 'Reckoner'),
            (string) $payload['client'],
            ($payload['status'] ?? 'confirmed') === 'potential' ? 'potential' : 'confirmed',
            (string) ($payload['stage'] ?? ''),
            (string) $payload['start'],
            (string) $payload['end'],
            (string) ($payload['note'] ?? ''),
            (string) ($payload['color'] ?? '#2e5984'),
        ]);
    } elseif ($action === 'deleteBooking') {
        if (!isManager($user)) {
            respond(['ok' => false, 'error' => 'Manager access required'], 403);
        }
        $stmt = $pdo->prepare('SELECT person_id FROM bookings WHERE id=?');
        $stmt->execute([(string) $payload['id']]);
        $pid = (string) $stmt->fetchColumn();
        if (!$pid || !canAccessPerson($user, $pid)) {
            respond(['ok' => false, 'error' => 'Not permitted'], 403);
        }
        $pdo->prepare('DELETE FROM bookings WHERE id=?')->execute([(string) $payload['id']]);
    } elseif ($action === 'upsertLeave') {
        $pid = requirePersonScope($user, $payload, true);
        requireExistingRecordOwner($pdo, $user, 'leaves', (string) ($payload['id'] ?? ''), $pid);
        $stmt = $pdo->prepare(
            'INSERT INTO leaves (id,person_id,leave_type,start_date,end_date,note) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE person_id=VALUES(person_id),leave_type=VALUES(leave_type),start_date=VALUES(start_date),end_date=VALUES(end_date),note=VALUES(note)',
        );
        $stmt->execute([
            (string) $payload['id'],
            $pid,
            (string) ($payload['type'] ?? 'Other'),
            (string) $payload['start'],
            (string) $payload['end'],
            (string) ($payload['note'] ?? ''),
        ]);
    } elseif ($action === 'deleteLeave') {
        if (!isManager($user)) {
            respond(['ok' => false, 'error' => 'Manager access required'], 403);
        }
        $stmt = $pdo->prepare('SELECT person_id FROM leaves WHERE id=?');
        $stmt->execute([(string) $payload['id']]);
        $pid = (string) $stmt->fetchColumn();
        if (!$pid || !canAccessPerson($user, $pid)) {
            respond(['ok' => false, 'error' => 'Not permitted'], 403);
        }
        $pdo->prepare('DELETE FROM leaves WHERE id=?')->execute([(string) $payload['id']]);
    } elseif (in_array($action, ['addPerson', 'updatePerson'], true)) {
        if (!canConfig($user, 'employees')) {
            respond(['ok' => false, 'error' => 'Employee configuration access required'], 403);
        }
        $id = strtoupper(trim((string) ($payload['id'] ?? '')));
        if ($id === '' || strlen($id) > 24) {
            respond(['ok' => false, 'error' => 'A valid employee number is required'], 422);
        }
        $name = trim((string) ($payload['name'] ?? ''));
        if ($name === '') {
            respond(['ok' => false, 'error' => 'A name is required'], 422);
        }
        $email = strtolower(trim((string) ($payload['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            respond(['ok' => false, 'error' => 'A valid email address is required for MFA'], 422);
        }
        if (!isAdmin($user)) {
            $payload['pod'] = $user['pod'];
            $payload['accessRole'] = 'employee';
            if ($action === 'updatePerson' && !canAccessPerson($user, $id)) {
                respond(['ok' => false, 'error' => 'Not permitted'], 403);
            }
        }
        $existing = $pdo->prepare('SELECT password_hash,email,active FROM users WHERE id=?');
        $existing->execute([$id]);
        $existingRow = $existing->fetch();
        if ($existingRow && !isAdmin($user) && !canAccessPerson($user, $id)) {
            respond(
                ['ok' => false, 'error' => 'That employee is outside your permitted scope'],
                403,
            );
        }
        $old = $existingRow['password_hash'] ?? false;
        $isNew = $old === false;
        $temporary = null;
        $supplied = (string) ($payload['newPassword'] ?? '');
        if (!$isNew && !isAdmin($user) && strtolower((string) $existingRow['email']) !== $email) {
            respond(
                [
                    'ok' => false,
                    'error' => 'Only an administrator can change an existing user email address',
                ],
                403,
            );
        }
        if ($supplied !== '' && strlen($supplied) < 8) {
            respond(
                ['ok' => false, 'error' => 'Use at least 8 characters for the temporary password'],
                422,
            );
        }
        if ($isNew && $supplied === '') {
            $temporary = temporaryPassword();
            $supplied = $temporary;
        }
        $hash = $isNew ? passwordHash($supplied) : (string) $old;
        $mustChange = $isNew ? 1 : 0;
        if ($supplied !== '' && !$isNew) {
            $hash = passwordHash($supplied);
            $mustChange = 1;
        }
        $access = in_array($payload['accessRole'] ?? '', ['employee', 'manager'], true)
            ? $payload['accessRole']
            : 'employee';
        $rate = $payload['billingRate'] ?? null;
        $active = $isNew ? 0 : (int) ($existingRow['active'] ?? 0);
        if (isAdmin($user) && array_key_exists('active', $payload)) {
            $active = !empty($payload['active']) ? 1 : 0;
        }
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO users (id,name,email,pod,job_title,access_role,entity,monthly_target,billing_rate,password_hash,mfa_enabled,must_change_password,active) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email),pod=VALUES(pod),job_title=VALUES(job_title),access_role=VALUES(access_role),entity=VALUES(entity),monthly_target=VALUES(monthly_target),billing_rate=VALUES(billing_rate),password_hash=VALUES(password_hash),mfa_enabled=1,must_change_password=IF(VALUES(must_change_password)=1,1,must_change_password),session_version=IF(active<>VALUES(active),session_version+1,session_version),active=VALUES(active)',
            );
            $stmt->execute([
                $id,
                $name,
                $email,
                (string) $payload['pod'],
                (string) $payload['role'],
                $access,
                (string) ($payload['entity'] ?? 'Reckoner'),
                max(0, (float) ($payload['monthlyTarget'] ?? 160)),
                $rate === '' ? null : $rate,
                $hash,
                $mustChange,
                $active,
            ]);
        } catch (PDOException $error) {
            if (($error->errorInfo[1] ?? 0) === 1062) {
                respond(
                    [
                        'ok' => false,
                        'error' => 'That email address or employee number is already in use',
                    ],
                    409,
                );
            }
            throw $error;
        }
        if (!$isNew && $supplied !== '') {
            $pdo->prepare('UPDATE users SET session_version=session_version+1 WHERE id=?')->execute(
                [$id],
            );
        }
        authEvent(
            $isNew ? 'user_created' : 'user_updated',
            (string) $user['id'],
            (string) $user['email'],
        );
        respond(['ok' => true, 'temporaryPassword' => $temporary]);
    } elseif ($action === 'setUserActive') {
        if (!isAdmin($user)) {
            respond(['ok' => false, 'error' => 'Administrator access required'], 403);
        }
        $id = (string) ($payload['id'] ?? '');
        $active = !empty($payload['active']) ? 1 : 0;
        $stmt = $pdo->prepare(
            "UPDATE users SET active=?,session_version=session_version+1 WHERE id=? AND access_role<>'admin'",
        );
        $stmt->execute([$active, $id]);
        if (!$stmt->rowCount()) {
            respond(['ok' => false, 'error' => 'User not found or already has that status'], 404);
        }
        $pdo->prepare('DELETE FROM mfa_challenges WHERE user_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM password_reset_challenges WHERE user_id=?')->execute([$id]);
        authEvent($active ? 'user_activated' : 'user_deactivated', $id, (string) $user['email']);
        respond(['ok' => true]);
    } elseif ($action === 'deletePerson') {
        if (!isAdmin($user)) {
            respond(['ok' => false, 'error' => 'Administrator access required'], 403);
        }
        $id = (string) ($payload['id'] ?? '');
        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'UPDATE timesheet_entries SET billing_to_id=person_id WHERE billing_to_id=? AND person_id<>?',
            )->execute([$id, $id]);
            $stmt = $pdo->prepare("DELETE FROM users WHERE id=? AND access_role<>'admin'");
            $stmt->execute([$id]);
            if (!$stmt->rowCount()) {
                $pdo->rollBack();
                respond(['ok' => false, 'error' => 'Employee ID not found'], 404);
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
        authEvent('user_deleted', $id, (string) $user['email']);
        respond(['ok' => true]);
    } elseif ($action === 'resetPassword') {
        if (!isAdmin($user)) {
            respond(['ok' => false, 'error' => 'Administrator access required'], 403);
        }
        requireRecentAuthentication();
        $new = trim((string) ($payload['password'] ?? ''));
        if ($new === '') {
            $new = temporaryPassword();
        }
        if (strlen($new) < 8 || strlen($new) > 256) {
            respond(['ok' => false, 'error' => 'Password must contain 8 to 256 characters'], 422);
        }
        $id = (string) $payload['id'];
        $stmt = $pdo->prepare(
            "UPDATE users SET password_hash=?,must_change_password=1,mfa_enabled=1,session_version=session_version+1 WHERE id=? AND access_role<>'admin'",
        );
        $stmt->execute([passwordHash($new), $id]);
        if (!$stmt->rowCount()) {
            respond(['ok' => false, 'error' => 'User not found'], 404);
        }
        $pdo->prepare('DELETE FROM mfa_challenges WHERE user_id=?')->execute([$id]);
        $pdo->prepare('DELETE FROM password_reset_challenges WHERE user_id=?')->execute([$id]);
        authEvent('password_reset', $id, '');
        respond(['ok' => true, 'temporaryPassword' => $new]);
    } elseif ($action === 'saveSettings') {
        if (!isAdmin($user)) {
            respond(['ok' => false, 'error' => 'Administrator access required'], 403);
        }
        $stmt = $pdo->prepare(
            'INSERT INTO app_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
        );
        foreach ($payload as $k => $v) {
            if (
                in_array(
                    $k,
                    [
                        'start',
                        'end',
                        'asOf',
                        'soonDays',
                        'capMode',
                        'hoursPerDay',
                        'billingTarget',
                        'amberThreshold',
                        'firmName',
                        'reviewDay',
                        'reviewTime',
                        'auditMinHours',
                        'defaultMonthlyTarget',
                        'reportingYear',
                    ],
                    true,
                )
            ) {
                $stmt->execute([$k, (string) $v]);
            }
        }
    } elseif ($action === 'changePassword') {
        $new = (string) ($payload['password'] ?? '');
        if (strlen($new) < 8 || strlen($new) > 256) {
            respond(['ok' => false, 'error' => 'Use 8 to 256 characters'], 422);
        }
        if (
            empty($user['must_change_password']) &&
            !password_verify(
                (string) ($payload['currentPassword'] ?? ''),
                (string) $user['password_hash'],
            )
        ) {
            respond(['ok' => false, 'error' => 'Your current password is incorrect'], 403);
        }
        $pdo->prepare(
            'UPDATE users SET password_hash=?,must_change_password=0,password_changed_at=NOW(),session_version=session_version+1 WHERE id=?',
        )->execute([passwordHash($new), $user['id']]);
        $_SESSION['session_version'] = (int) ($user['session_version'] ?? 0) + 1;
        session_regenerate_id(true);
        $_SESSION['last_rotation'] = time();
        authEvent('password_changed', (string) $user['id'], (string) $user['email']);
    } elseif ($action === 'saveHoliday') {
        if (!canConfig($user, 'holidays')) {
            respond(['ok' => false, 'error' => 'Holiday configuration access required'], 403);
        }
        $name = trim((string) ($payload['name'] ?? ''));
        $date = (string) ($payload['date'] ?? '');
        if ($name === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            respond(['ok' => false, 'error' => 'Holiday name and date are required'], 422);
        }
        if (!empty($payload['id'])) {
            $pdo->prepare(
                'UPDATE public_holidays SET holiday_name=?,holiday_date=? WHERE id=?',
            )->execute([$name, $date, (int) $payload['id']]);
        } else {
            $pdo->prepare(
                'INSERT INTO public_holidays (holiday_name,holiday_date) VALUES (?,?)',
            )->execute([$name, $date]);
        }
    } elseif ($action === 'deleteHoliday') {
        if (!canConfig($user, 'holidays')) {
            respond(['ok' => false, 'error' => 'Holiday configuration access required'], 403);
        }
        $pdo->prepare('DELETE FROM public_holidays WHERE id=?')->execute([(int) $payload['id']]);
    } elseif ($action === 'upsertReference') {
        if (!canConfig($user, 'references')) {
            respond(['ok' => false, 'error' => 'Reference-list access required'], 403);
        }
        $category = (string) ($payload['category'] ?? '');
        $value = trim((string) ($payload['value'] ?? ''));
        if (
            !in_array($category, ['entity', 'type', 'assignment', 'work_area', 'client'], true) ||
            $value === ''
        ) {
            respond(['ok' => false, 'error' => 'A valid category and value are required'], 422);
        }
        $pdo->prepare(
            'INSERT INTO reference_values (category,value) VALUES (?,?) ON DUPLICATE KEY UPDATE active=1',
        )->execute([$category, $value]);
    } elseif ($action === 'deleteReference') {
        if (!canConfig($user, 'references')) {
            respond(['ok' => false, 'error' => 'Reference-list access required'], 403);
        }
        $pdo->prepare('UPDATE reference_values SET active=0 WHERE category=? AND value=?')->execute(
            [(string) $payload['category'], (string) $payload['value']],
        );
    } elseif ($action === 'saveEntityPricingBlock') {
        if (!canConfig($user, 'pricing')) {
            respond(['ok' => false, 'error' => 'Entity-pricing access required'], 403);
        }
        $entity = trim((string) ($payload['entity'] ?? ''));
        $rates = (array) ($payload['rates'] ?? []);
        if ($entity === '') {
            respond(['ok' => false, 'error' => 'Select an entity'], 422);
        }
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM entity_pricing WHERE entity_name=?')->execute([$entity]);
            $insert = $pdo->prepare(
                'INSERT INTO entity_pricing (entity_name,designation,hourly_rate) VALUES (?,?,?)',
            );
            $seen = [];
            foreach ($rates as $row) {
                $designation = trim((string) ($row['designation'] ?? ''));
                $rate = $row['rate'] ?? null;
                if ($designation === '' || $rate === null || $rate === '') {
                    continue;
                }
                if (isset($seen[$designation])) {
                    continue;
                }
                if (!is_numeric($rate) || (float) $rate < 0) {
                    throw new RuntimeException('Every rate must be zero or greater');
                }
                $seen[$designation] = true;
                $insert->execute([$entity, $designation, round((float) $rate, 2)]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    } elseif ($action === 'saveEntityPrice') {
        if (!canConfig($user, 'pricing')) {
            respond(['ok' => false, 'error' => 'Entity-pricing access required'], 403);
        }
        $entity = trim((string) ($payload['entity'] ?? ''));
        $designation = trim((string) ($payload['designation'] ?? ''));
        $rate = max(0, (float) ($payload['rate'] ?? 0));
        if ($entity === '' || $designation === '') {
            respond(['ok' => false, 'error' => 'Entity and designation are required'], 422);
        }
        $pdo->prepare(
            'INSERT INTO entity_pricing (entity_name,designation,hourly_rate) VALUES (?,?,?) ON DUPLICATE KEY UPDATE hourly_rate=VALUES(hourly_rate)',
        )->execute([$entity, $designation, $rate]);
    } elseif ($action === 'deleteEntityPrice') {
        if (!canConfig($user, 'pricing')) {
            respond(['ok' => false, 'error' => 'Entity-pricing access required'], 403);
        }
        $pdo->prepare('DELETE FROM entity_pricing WHERE entity_name=? AND designation=?')->execute([
            (string) $payload['entity'],
            (string) $payload['designation'],
        ]);
    } elseif ($action === 'saveManagerPermissions') {
        if (!isAdmin($user)) {
            respond(['ok' => false, 'error' => 'Administrator access required'], 403);
        }
        $allowed = ['employees', 'holidays', 'references', 'pricing'];
        $perms = array_values(array_intersect($allowed, (array) ($payload['permissions'] ?? [])));
        $pdo->prepare(
            "UPDATE users SET config_permissions=? WHERE id=? AND access_role='manager'",
        )->execute([implode(',', $perms), (string) $payload['id']]);
    } elseif ($action === 'saveThreshold') {
        if (!isAdmin($user)) {
            respond(['ok' => false, 'error' => 'Administrator access required'], 403);
        }
        $client = trim((string) ($payload['client'] ?? ''));
        $hours = max(0, (float) ($payload['hours'] ?? 0));
        if ($client === '') {
            respond(['ok' => false, 'error' => 'Client is required'], 422);
        }
        $pdo->prepare(
            'INSERT INTO audit_thresholds (client_name,minimum_hours) VALUES (?,?) ON DUPLICATE KEY UPDATE minimum_hours=VALUES(minimum_hours)',
        )->execute([$client, $hours]);
    } else {
        respond(['ok' => false, 'error' => 'Unknown action'], 400);
    }
    respond(['ok' => true]);
} catch (Throwable $e) {
    error_log(
        'Reckoner portal error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine(),
    );
    respond(
        [
            'ok' => false,
            'error' =>
                APP_ENV === 'production'
                    ? 'The server could not complete that request. Please try again or contact the administrator.'
                    : 'Server error: ' . $e->getMessage(),
        ],
        500,
    );
}
