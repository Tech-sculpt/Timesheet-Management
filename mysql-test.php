<?php
declare(strict_types=1);

// Keep connection diagnostics off the public website.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit();
}

require __DIR__ . '/config.php';

try {
    db()->query('SELECT 1');
    fwrite(STDOUT, "Database connection successful.\n");
} catch (Throwable $error) {
    // Connection exceptions can contain hostnames and credentials.
    fwrite(
        STDERR,
        "Database connection failed. Check your local database configuration and service.\n",
    );
    exit(1);
}
