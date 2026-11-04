<?php
declare(strict_types=1);

$portalConfigFile = __DIR__ . '/config.local.php';
$portalConfig = is_file($portalConfigFile) ? (array) require $portalConfigFile : [];

function portalConfigValue(string $name, mixed $default = null): mixed
{
    global $portalConfig;
    $environment = getenv($name);
    if ($environment !== false && $environment !== '') {
        return $environment;
    }
    return $portalConfig[$name] ?? $default;
}

define('APP_ENV', (string) portalConfigValue('APP_ENV', 'development'));
define('APP_NAME', (string) portalConfigValue('APP_NAME', 'Reckoner Resource & Timesheet Portal'));
define('APP_COOKIE_PATH', (string) portalConfigValue('APP_COOKIE_PATH', '/'));
define('DB_HOST', (string) portalConfigValue('DB_HOST', '127.0.0.1'));
define('DB_PORT', (int) portalConfigValue('DB_PORT', 3306));
define('DB_NAME', (string) portalConfigValue('DB_NAME', 'booking_portal'));
define('DB_USER', (string) portalConfigValue('DB_USER', 'root'));
define('DB_PASS', (string) portalConfigValue('DB_PASS', ''));
define(
    'DB_AUTO_CREATE',
    filter_var(portalConfigValue('DB_AUTO_CREATE', APP_ENV !== 'production'), FILTER_VALIDATE_BOOL),
);
define(
    'MAIL_TRANSPORT',
    strtolower(
        (string) portalConfigValue('MAIL_TRANSPORT', APP_ENV === 'production' ? 'graph' : 'log'),
    ),
);
define(
    'MAIL_FROM_ADDRESS',
    (string) portalConfigValue('MAIL_FROM_ADDRESS', 'no-reply@thereckoner.co.uk'),
);
define('MAIL_FROM_NAME', (string) portalConfigValue('MAIL_FROM_NAME', 'Reckoner Portal'));
define('GRAPH_TENANT_ID', (string) portalConfigValue('GRAPH_TENANT_ID', ''));
define('GRAPH_CLIENT_ID', (string) portalConfigValue('GRAPH_CLIENT_ID', ''));
define('GRAPH_CLIENT_SECRET', (string) portalConfigValue('GRAPH_CLIENT_SECRET', ''));
define('GRAPH_SENDER', (string) portalConfigValue('GRAPH_SENDER', MAIL_FROM_ADDRESS));
define('GRAPH_SHAREPOINT_SITE_ID', (string) portalConfigValue('GRAPH_SHAREPOINT_SITE_ID', ''));
define('GRAPH_SHAREPOINT_DRIVE_ID', (string) portalConfigValue('GRAPH_SHAREPOINT_DRIVE_ID', ''));
define(
    'GRAPH_SHAREPOINT_BACKUP_FOLDER',
    trim((string) portalConfigValue('GRAPH_SHAREPOINT_BACKUP_FOLDER', 'Timesheet Backups'), '/'),
);

function db(bool $withDatabase = true): PDO
{
    static $connections = [];
    $key = $withDatabase ? 'database' : 'server';
    if (isset($connections[$key])) {
        return $connections[$key];
    }

    $dsn =
        'mysql:host=' .
        DB_HOST .
        ';port=' .
        DB_PORT .
        ($withDatabase ? ';dbname=' . DB_NAME : '') .
        ';charset=utf8mb4';
    $connections[$key] = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $connections[$key];
}
