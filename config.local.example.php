<?php
declare(strict_types=1);

// Copy to config.local.php. Environment variables override these values.
// Use development only on your local machine; use production on a live host.
return [
    'APP_ENV' => 'development',
    'APP_NAME' => 'Reckoner Resource & Timesheet Portal',
    'APP_COOKIE_PATH' => '/', // Use /Booking/ if installed under that path.
    'DB_HOST' => '127.0.0.1',
    'DB_PORT' => 3306,
    'DB_NAME' => 'booking_portal',
    'DB_USER' => 'root',
    'DB_PASS' => '',
    'DB_AUTO_CREATE' => true, // Set false in production; import the schema first.
    'MAIL_TRANSPORT' => 'log', // Set graph in production. Local codes go to PHP's error log.
    'MAIL_FROM_ADDRESS' => 'no-reply@example.com',
    'MAIL_FROM_NAME' => 'Reckoner Portal',
    'GRAPH_TENANT_ID' => '',
    'GRAPH_CLIENT_ID' => '',
    'GRAPH_CLIENT_SECRET' => '',
    'GRAPH_SENDER' => 'no-reply@example.com',
    'GRAPH_SHAREPOINT_SITE_ID' => '',
    'GRAPH_SHAREPOINT_DRIVE_ID' => '',
    'GRAPH_SHAREPOINT_BACKUP_FOLDER' => 'Timesheet Backups',
];
