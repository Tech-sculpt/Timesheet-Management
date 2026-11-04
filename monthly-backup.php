<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

ini_set('display_errors', '0');
ini_set('log_errors', '1');

function backupLog(string $message): void
{
    $line = '[' . date('Y-m-d H:i:s') . '] ' . $message;
    if (PHP_SAPI === 'cli') {
        fwrite(STDOUT, $line . PHP_EOL);
    }
    error_log($line);
}

function graphBackupAccessToken(): string
{
    if (GRAPH_TENANT_ID === '' || GRAPH_CLIENT_ID === '' || GRAPH_CLIENT_SECRET === '') {
        throw new RuntimeException('Microsoft Graph credentials are not configured.');
    }
    if (!function_exists('curl_init')) {
        throw new RuntimeException('The PHP cURL extension is required for SharePoint backup.');
    }

    $url =
        'https://login.microsoftonline.com/' . rawurlencode(GRAPH_TENANT_ID) . '/oauth2/v2.0/token';
    $ch = curl_init($url);
    if ($ch === false) {
        throw new RuntimeException('Could not initialise Microsoft Graph authentication.');
    }

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'client_id' => GRAPH_CLIENT_ID,
            'client_secret' => GRAPH_CLIENT_SECRET,
            'scope' => 'https://graph.microsoft.com/.default',
            'grant_type' => 'client_credentials',
        ]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
    ]);

    $body = curl_exec($ch);
    if ($body === false) {
        $message = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('Microsoft Graph authentication failed: ' . $message);
    }

    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $data = json_decode((string) $body, true);

    if ($status < 200 || $status >= 300 || !is_array($data) || empty($data['access_token'])) {
        $detail = is_array($data)
            ? (string) ($data['error_description'] ?? ($data['error'] ?? ''))
            : (string) $body;
        throw new RuntimeException(
            'Microsoft Graph authentication failed' .
                ($detail !== '' ? ': ' . substr($detail, 0, 300) : '.'),
        );
    }

    return (string) $data['access_token'];
}

function graphBackupRequest(
    string $method,
    string $url,
    string $token,
    ?string $body = null,
    array $headers = [],
): array {
    $ch = curl_init($url);
    if ($ch === false) {
        throw new RuntimeException('Could not initialise Microsoft Graph request.');
    }

    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_HTTPHEADER => array_merge(['Authorization: Bearer ' . $token], $headers),
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    $response = curl_exec($ch);
    if ($response === false) {
        $message = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException('SharePoint request failed: ' . $message);
    }

    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $decoded = $response === '' ? [] : json_decode((string) $response, true);

    if ($status < 200 || $status >= 300) {
        $detail = is_array($decoded)
            ? (string) ($decoded['error']['message'] ?? ($decoded['error_description'] ?? ''))
            : (string) $response;
        throw new RuntimeException(
            'SharePoint request failed with HTTP ' .
                $status .
                ($detail !== '' ? ': ' . substr($detail, 0, 300) : ''),
        );
    }

    return is_array($decoded) ? $decoded : [];
}

function graphBackupEncodePath(string $path): string
{
    $parts = array_values(
        array_filter(explode('/', trim($path, '/')), static fn($part) => $part !== ''),
    );
    return implode('/', array_map('rawurlencode', $parts));
}

function ensureSharePointBackupFolder(string $token, string $folderPath): void
{
    if (GRAPH_SHAREPOINT_DRIVE_ID === '') {
        throw new RuntimeException('GRAPH_SHAREPOINT_DRIVE_ID is not configured.');
    }

    $segments = array_values(
        array_filter(explode('/', trim($folderPath, '/')), static fn($part) => $part !== ''),
    );
    $current = '';

    foreach ($segments as $segment) {
        $parent = $current;
        $candidate = $current === '' ? $segment : $current . '/' . $segment;
        $get =
            'https://graph.microsoft.com/v1.0/drives/' .
            rawurlencode(GRAPH_SHAREPOINT_DRIVE_ID) .
            '/root:/' .
            graphBackupEncodePath($candidate);

        $ch = curl_init($get);
        if ($ch === false) {
            throw new RuntimeException('Could not initialise SharePoint folder check.');
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $token],
        ]);

        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $message = $response === false ? curl_error($ch) : '';
        curl_close($ch);

        if ($response === false) {
            throw new RuntimeException('SharePoint folder check failed: ' . $message);
        }

        if ($status === 404) {
            $url =
                $parent === ''
                    ? 'https://graph.microsoft.com/v1.0/drives/' .
                        rawurlencode(GRAPH_SHAREPOINT_DRIVE_ID) .
                        '/root/children'
                    : 'https://graph.microsoft.com/v1.0/drives/' .
                        rawurlencode(GRAPH_SHAREPOINT_DRIVE_ID) .
                        '/root:/' .
                        graphBackupEncodePath($parent) .
                        ':/children';

            graphBackupRequest(
                'POST',
                $url,
                $token,
                json_encode(
                    [
                        'name' => $segment,
                        'folder' => (object) [],
                        '@microsoft.graph.conflictBehavior' => 'fail',
                    ],
                    JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
                ),
                ['Content-Type: application/json'],
            );
        } elseif ($status < 200 || $status >= 300) {
            $decoded = json_decode((string) $response, true);
            $detail = is_array($decoded) ? (string) ($decoded['error']['message'] ?? '') : '';
            throw new RuntimeException(
                'Could not check SharePoint folder ' .
                    $candidate .
                    ' (HTTP ' .
                    $status .
                    ')' .
                    ($detail !== '' ? ': ' . substr($detail, 0, 250) : ''),
            );
        }

        $current = $candidate;
    }
}

function uploadSharePointBackupFile(string $token, string $localFile, string $remotePath): array
{
    if (!is_file($localFile)) {
        throw new RuntimeException('Backup file was not created: ' . $localFile);
    }
    if (GRAPH_SHAREPOINT_DRIVE_ID === '') {
        throw new RuntimeException('GRAPH_SHAREPOINT_DRIVE_ID is not configured.');
    }

    $contents = file_get_contents($localFile);
    if ($contents === false) {
        throw new RuntimeException('Could not read the generated backup file.');
    }

    $url =
        'https://graph.microsoft.com/v1.0/drives/' .
        rawurlencode(GRAPH_SHAREPOINT_DRIVE_ID) .
        '/root:/' .
        graphBackupEncodePath($remotePath) .
        ':/content';
    return graphBackupRequest('PUT', $url, $token, $contents, [
        'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]);
}

function xlsxXml(string $value): string
{
    return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

function xlsxColumnName(int $number): string
{
    $name = '';
    while ($number > 0) {
        $number--;
        $name = chr(65 + ($number % 26)) . $name;
        $number = intdiv($number, 26);
    }
    return $name;
}

function uniqueBackupSheetName(string $name, array &$used): string
{
    $cleaned = preg_replace('/[\\\/\?\*\[\]:]+/', ' ', $name);
    $base = trim(is_string($cleaned) ? $cleaned : $name);
    $collapsed = preg_replace('/\s+/', ' ', $base);
    $base = is_string($collapsed) && $collapsed !== '' ? $collapsed : 'Employee';
    $base = mb_substr($base, 0, 31);
    $candidate = $base;
    $n = 2;

    while (isset($used[mb_strtolower($candidate)])) {
        $suffix = ' ' . $n++;
        $candidate = mb_substr($base, 0, max(1, 31 - mb_strlen($suffix))) . $suffix;
    }

    $used[mb_strtolower($candidate)] = true;
    return $candidate;
}

function createPodTimesheetWorkbook(
    PDO $pdo,
    string $pod,
    string $from,
    string $toExclusive,
    string $month,
    string $outputFile,
): array {
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException(
            'The PHP ZipArchive extension is required to create Excel backups.',
        );
    }

    $peopleStmt = $pdo->prepare(
        "SELECT id,name,pod FROM users WHERE access_role<>'admin' AND pod=? ORDER BY name",
    );
    $peopleStmt->execute([$pod]);
    $people = $peopleStmt->fetchAll();
    if (!$people) {
        return ['rows' => 0, 'employees' => 0];
    }

    $entryStmt = $pdo->prepare(
        'SELECT t.*,COALESCE(bu.name,u.name) billing_as_name FROM timesheet_entries t JOIN users u ON u.id=t.person_id LEFT JOIN users bu ON bu.id=t.billing_to_id WHERE t.person_id=? AND t.work_date>=? AND t.work_date<? ORDER BY t.work_date,t.start_time,t.updated_at',
    );
    $headers = [
        'Employee Name',
        'Employee No',
        'Entity',
        'Type',
        'Billing As',
        'Date',
        'Start',
        'End',
        'Hours',
        'Client',
        'Assignment',
        'Work Area',
        'Work Done',
        'Linked Booking',
    ];
    $sheets = [];
    $used = [];
    $totalRows = 0;

    foreach ($people as $person) {
        $entryStmt->execute([$person['id'], $from, $toExclusive]);
        $entries = $entryStmt->fetchAll();
        $totalRows += count($entries);

        $rows = [$headers];
        foreach ($entries as $entry) {
            $rows[] = [
                (string) $person['name'],
                (string) $person['id'],
                (string) $entry['entity'],
                (string) $entry['charge_type'],
                (string) ($entry['billing_as_name'] ?: $person['name']),
                (string) $entry['work_date'],
                $entry['start_time'] ? substr((string) $entry['start_time'], 0, 5) : '',
                $entry['end_time'] ? substr((string) $entry['end_time'], 0, 5) : '',
                $entry['hours'] === null ? '' : (string) $entry['hours'],
                (string) $entry['client_name'],
                (string) $entry['assignment'],
                (string) $entry['work_area'],
                (string) $entry['work_done'],
                (string) ($entry['booking_id'] ?? ''),
            ];
        }

        $sheets[] = [
            'name' => uniqueBackupSheetName((string) $person['name'], $used),
            'rows' => $rows,
        ];
    }

    $zip = new ZipArchive();
    if ($zip->open($outputFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        throw new RuntimeException('Could not create Excel backup file.');
    }

    $sheetOverrides = [];
    $workbookSheets = [];
    $workbookRels = [];

    foreach ($sheets as $index => $sheet) {
        $sheetNo = $index + 1;
        $workbookSheets[] =
            '<sheet name="' .
            xlsxXml($sheet['name']) .
            '" sheetId="' .
            $sheetNo .
            '" r:id="rId' .
            $sheetNo .
            '"/>';
        $workbookRels[] =
            '<Relationship Id="rId' .
            $sheetNo .
            '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' .
            $sheetNo .
            '.xml"/>';
        $sheetOverrides[] =
            '<Override PartName="/xl/worksheets/sheet' .
            $sheetNo .
            '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';

        $sheetData = '';
        foreach ($sheet['rows'] as $rIndex => $row) {
            $rowNo = $rIndex + 1;
            $cells = '';
            foreach ($row as $cIndex => $value) {
                $ref = xlsxColumnName($cIndex + 1) . $rowNo;
                $style = $rIndex === 0 ? ' s="1"' : '';
                if ($rIndex > 0 && $cIndex === 8 && $value !== '' && is_numeric($value)) {
                    $cells .=
                        '<c r="' .
                        $ref .
                        '"' .
                        $style .
                        '><v>' .
                        xlsxXml((string) $value) .
                        '</v></c>';
                } else {
                    $cells .=
                        '<c r="' .
                        $ref .
                        '" t="inlineStr"' .
                        $style .
                        '><is><t xml:space="preserve">' .
                        xlsxXml((string) $value) .
                        '</t></is></c>';
                }
            }
            $sheetData .= '<row r="' . $rowNo . '">' . $cells . '</row>';
        }

        $cols =
            '<cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/><col min="3" max="5" width="20" customWidth="1"/><col min="6" max="9" width="14" customWidth="1"/><col min="10" max="14" width="28" customWidth="1"/></cols>';
        $sheetXml =
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet
    xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' .
    $cols .
    '<sheetData>' .
        $sheetData .
        '</sheetData>
    <autoFilter ref="A1:N' .
            max(1, count($sheet['rows'])) .
            '" />
</worksheet>';
$zip->addFromString('xl/worksheets/sheet' . $sheetNo . '.xml', $sheetXml);
}

$zip->addFromString(
'[Content_Types].xml',
'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels"
        ContentType="application/vnd.openxmlformats-package.relationships+xml" />
    <Default Extension="xml" ContentType="application/xml" />
    <Override PartName="/xl/workbook.xml"
        ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" />
    <Override PartName="/xl/styles.xml"
        ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml" />' .
    implode('', $sheetOverrides) .
    '
</Types>',
);
$zip->addFromString(
'_rels/.rels',
'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1"
        Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
        Target="xl/workbook.xml" />
</Relationships>',
);
$zip->addFromString(
'xl/workbook.xml',
'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <sheets>' .
        implode('', $workbookSheets) .
        '</sheets>
</workbook>',
);
$workbookRels[] =
'
<Relationship Id="rId' .
        (count($sheets) + 1) .
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"
    Target="styles.xml" />';
$zip->addFromString(
'xl/_rels/workbook.xml.rels',
'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' .
    implode('', $workbookRels) .
    '</Relationships>',
);
$zip->addFromString(
'xl/styles.xml',
'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
    <fonts count="2">
        <font>
            <sz val="11" />
            <name val="Calibri" />
        </font>
        <font>
            <b />
            <color rgb="FFFFFFFF" />
            <sz val="11" />
            <name val="Calibri" />
        </font>
    </fonts>
    <fills count="3">
        <fill>
            <patternFill patternType="none" />
        </fill>
        <fill>
            <patternFill patternType="gray125" />
        </fill>
        <fill>
            <patternFill patternType="solid">
                <fgColor rgb="FFF26A21" />
                <bgColor indexed="64" />
            </patternFill>
        </fill>
    </fills>
    <borders count="1">
        <border>
            <left />
            <right />
            <top />
            <bottom />
            <diagonal />
        </border>
    </borders>
    <cellStyleXfs count="1">
        <xf numFmtId="0" fontId="0" fillId="0" borderId="0" />
    </cellStyleXfs>
    <cellXfs count="2">
        <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" />
        <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" />
    </cellXfs>
    <cellStyles count="1">
        <cellStyle name="Normal" xfId="0" builtinId="0" />
    </cellStyles>
</styleSheet>',
);
$zip->close();

return ['rows' => $totalRows, 'employees' => count($people), 'month' => $month];
}

function ensureBackupTrackingTable(PDO $pdo): void
{
$pdo->exec("CREATE TABLE IF NOT EXISTS sharepoint_backups (
backup_month CHAR(7) PRIMARY KEY,
file_name VARCHAR(255) NOT NULL,
row_count INT UNSIGNED NOT NULL,
graph_item_id VARCHAR(255) NOT NULL DEFAULT '',
status ENUM('completed','failed') NOT NULL,
error_message VARCHAR(500) NOT NULL DEFAULT '',
created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB");
}

function runMonthlySharePointBackup(string $month): array
{
if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
throw new InvalidArgumentException('Backup month must use YYYY-MM format.');
}

$start = DateTimeImmutable::createFromFormat('!Y-m-d', $month . '-01');
if (!$start || $start->format('Y-m') !== $month) {
throw new InvalidArgumentException('Invalid backup month.');
}

$end = $start->modify('first day of next month');
$pdo = db();
ensureBackupTrackingTable($pdo);

if (GRAPH_SHAREPOINT_SITE_ID === '' || GRAPH_SHAREPOINT_DRIVE_ID === '') {
throw new RuntimeException('SharePoint site and drive IDs are not configured.');
}
if (GRAPH_SHAREPOINT_BACKUP_FOLDER === '') {
throw new RuntimeException('SharePoint backup folder is not configured.');
}

$already = $pdo->prepare('SELECT status FROM sharepoint_backups WHERE backup_month=? LIMIT 1');
$already->execute([$month]);
if ($already->fetchColumn() === 'completed') {
return [
'month' => $month,
'skipped' => true,
'message' => 'A completed SharePoint backup already exists for this month.',
];
}

$token = graphBackupAccessToken();
$year = $start->format('Y');
$monthFolder = $start->format('m - F');
$root = GRAPH_SHAREPOINT_BACKUP_FOLDER . '/' . $year . '/' . $monthFolder;
ensureSharePointBackupFolder($token, $root);

$pods = $pdo
->query(
"SELECT DISTINCT pod FROM users WHERE access_role<>'admin' AND pod<>'' ORDER BY pod",
        )
        ->fetchAll(PDO::FETCH_COLUMN);
        $uploaded = [];
        $totalRows = 0;
        $lastItemId = '';

        try {
        foreach ($pods as $pod) {
        $safeName = trim(preg_replace('/[^A-Za-z0-9 _-]+/u', '', (string) $pod));
        $safeName = preg_replace('/\s+/u', ' ', $safeName) ?: 'Pod';
        $fileName = $safeName . '-' . $month . '.xlsx';
        $localFile =
        sys_get_temp_dir() .
        DIRECTORY_SEPARATOR .
        'reckoner-' .
        bin2hex(random_bytes(6)) .
        '.xlsx';

        backupLog('Creating workbook for pod: ' . $pod);

        try {
        $stats = createPodTimesheetWorkbook(
        $pdo,
        (string) $pod,
        $start->format('Y-m-d'),
        $end->format('Y-m-d'),
        $month,
        $localFile,
        );

        $item = uploadSharePointBackupFile($token, $localFile, $root . '/' . $fileName);
        $lastItemId = (string) ($item['id'] ?? $lastItemId);
        $totalRows += (int) $stats['rows'];

        $uploaded[] = [
        'pod' => (string) $pod,
        'file' => $fileName,
        'employees' => (int) $stats['employees'],
        'rows' => (int) $stats['rows'],
        'itemId' => (string) ($item['id'] ?? ''),
        ];

        backupLog(
        'Uploaded ' .
        $fileName .
        ' (' .
        $stats['employees'] .
        ' employee sheets, ' .
        $stats['rows'] .
        ' rows).',
        );
        } finally {
        if (is_file($localFile)) {
        @unlink($localFile);
        }
        }
        }

        $stmt = $pdo->prepare(
        "INSERT INTO sharepoint_backups
        (backup_month,file_name,row_count,graph_item_id,status,error_message) VALUES (?,?,?,?,
        'completed','') ON DUPLICATE KEY UPDATE
        file_name=VALUES(file_name),row_count=VALUES(row_count),graph_item_id=VALUES(graph_item_id),status='completed',error_message='',updated_at=CURRENT_TIMESTAMP",
        );
        $stmt->execute([$month, 'Pod timesheets - ' . $month, $totalRows, $lastItemId]);

        return [
        'month' => $month,
        'skipped' => false,
        'folder' => $root,
        'podCount' => count($uploaded),
        'rowCount' => $totalRows,
        'files' => $uploaded,
        ];
        } catch (Throwable $error) {
        try {
        $stmt = $pdo->prepare(
        "INSERT INTO sharepoint_backups
        (backup_month,file_name,row_count,graph_item_id,status,error_message) VALUES (?,?,?,?,
        'failed',?) ON DUPLICATE KEY UPDATE
        file_name=VALUES(file_name),row_count=VALUES(row_count),graph_item_id=VALUES(graph_item_id),status='failed',error_message=VALUES(error_message),updated_at=CURRENT_TIMESTAMP",
        );
        $stmt->execute([
        $month,
        'Pod timesheets - ' . $month,
        $totalRows,
        $lastItemId,
        substr($error->getMessage(), 0, 500),
        ]);
        } catch (Throwable $ignored) {
        }
        throw $error;
        }
        }

        try {
        if (PHP_SAPI !== 'cli') {
        http_response_code(403);
        exit('This backup script may only be run from the command line.');
        }

        // Normal cron run: back up the complete previous calendar month.
        // Optional manual CLI test: php monthly-backup.php 2026-09
        $month =
        isset($argv[1]) && preg_match('/^\d{4}-\d{2}$/', (string) $argv[1])
        ? (string) $argv[1]
        : (new DateTimeImmutable('first day of last month'))->format('Y-m');

        backupLog('Starting SharePoint timesheet backup for ' . $month . '.');
        $result = runMonthlySharePointBackup($month);

        if (!empty($result['skipped'])) {
        backupLog('Skipped: ' . $result['message']);
        exit(0);
        }

        backupLog(
        'Backup complete. ' .
        $result['podCount'] .
        ' pod workbook(s), ' .
        $result['rowCount'] .
        ' timesheet row(s).',
        );
        exit(0);
        } catch (Throwable $error) {
        backupLog('BACKUP FAILED: ' . $error->getMessage());
        exit(1);
        }
