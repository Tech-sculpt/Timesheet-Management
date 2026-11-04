<?php
require_once dirname(__DIR__) . '/config.php';
$portalView = $portalView ?? 'mysheet';
$portalConfigPage = $portalConfigPage ?? '';
$isHttps =
    (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
    ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
if (APP_ENV === 'production' && !$isHttps) {
    $host = preg_replace('/[^A-Za-z0-9.:-]/', '', (string) ($_SERVER['HTTP_HOST'] ?? ''));
    $path = (string) ($_SERVER['REQUEST_URI'] ?? '/');
    header('Location: https://' . $host . $path, true, 301);
    exit();
}
$cspNonce = base64_encode(random_bytes(18));
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()');
header('Cross-Origin-Opener-Policy: same-origin');
header('Cross-Origin-Resource-Policy: same-origin');
header(
    "Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'nonce-{$cspNonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'",
);
if ($isHttps) {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}
?>
