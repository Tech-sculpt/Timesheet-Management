<?php
declare(strict_types=1);

function graphPost(string $url, string $body, array $headers): array
{
    if (!function_exists('curl_init')) {
        throw new RuntimeException('Microsoft Graph requires the PHP cURL extension.');
    }
    $handle = curl_init($url);
    if ($handle === false) {
        throw new RuntimeException('Could not initialise Microsoft Graph delivery.');
    }
    curl_setopt_array($handle, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
    ]);
    $response = curl_exec($handle);
    $error = curl_error($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    if ($response === false) {
        throw new RuntimeException('Microsoft Graph could not be reached: ' . $error);
    }
    return [$status, (string) $response];
}

function graphAccessToken(): string
{
    static $token = '';
    if ($token !== '') {
        return $token;
    }
    if (GRAPH_TENANT_ID === '' || GRAPH_CLIENT_ID === '' || GRAPH_CLIENT_SECRET === '') {
        throw new RuntimeException('Microsoft Graph email delivery is not configured.');
    }
    $form = http_build_query(
        [
            'client_id' => GRAPH_CLIENT_ID,
            'client_secret' => GRAPH_CLIENT_SECRET,
            'scope' => 'https://graph.microsoft.com/.default',
            'grant_type' => 'client_credentials',
        ],
        '',
        '&',
        PHP_QUERY_RFC3986,
    );
    [$status, $response] = graphPost(
        'https://login.microsoftonline.com/' . rawurlencode(GRAPH_TENANT_ID) . '/oauth2/v2.0/token',
        $form,
        ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json'],
    );
    $data = json_decode($response, true);
    if ($status !== 200 || !is_array($data) || empty($data['access_token'])) {
        $code = is_array($data)
            ? (string) ($data['error'] ?? 'token_request_failed')
            : 'token_request_failed';
        throw new RuntimeException('Microsoft Graph authentication failed (' . $code . ').');
    }
    $token = (string) $data['access_token'];
    return $token;
}

function graphUploadContent(
    string $siteId,
    string $driveId,
    string $path,
    string $content,
    string $contentType,
): array {
    if (!function_exists('curl_init')) {
        throw new RuntimeException('Microsoft Graph requires the PHP cURL extension.');
    }
    if ($siteId === '' || $driveId === '' || trim($path, '/') === '') {
        throw new RuntimeException('SharePoint backup delivery is not configured.');
    }
    $encodedPath = implode('/', array_map('rawurlencode', explode('/', trim($path, '/'))));
    $url =
        'https://graph.microsoft.com/v1.0/sites/' .
        rawurlencode($siteId) .
        '/drives/' .
        rawurlencode($driveId) .
        '/root:/' .
        $encodedPath .
        ':/content';
    $handle = curl_init($url);
    if ($handle === false) {
        throw new RuntimeException('Could not initialise the SharePoint upload.');
    }
    curl_setopt_array($handle, [
        CURLOPT_CUSTOMREQUEST => 'PUT',
        CURLOPT_POSTFIELDS => $content,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . graphAccessToken(),
            'Content-Type: ' . $contentType,
            'Accept: application/json',
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
    ]);
    $response = curl_exec($handle);
    $error = curl_error($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    if ($response === false) {
        throw new RuntimeException('SharePoint could not be reached: ' . $error);
    }
    $data = json_decode((string) $response, true);
    if (!in_array($status, [200, 201], true) || !is_array($data)) {
        $code = is_array($data)
            ? (string) ($data['error']['code'] ?? 'upload_failed')
            : 'upload_failed';
        throw new RuntimeException('SharePoint rejected the backup (' . $code . ').');
    }
    return $data;
}

function sendPortalMail(string $to, string $subject, string $html, string $plain): void
{
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('The user does not have a valid email address.');
    }
    if (MAIL_TRANSPORT === 'log' && APP_ENV !== 'production') {
        error_log(
            '[RECKONER EMAIL] To: ' .
                $to .
                ' | ' .
                $subject .
                ' | ' .
                preg_replace('/\s+/', ' ', $plain),
        );
        return;
    }
    if (MAIL_TRANSPORT !== 'graph' || !filter_var(GRAPH_SENDER, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Microsoft Graph email delivery is not configured.');
    }
    $payload = json_encode(
        [
            'message' => [
                'subject' => $subject,
                'body' => ['contentType' => 'HTML', 'content' => $html],
                'toRecipients' => [['emailAddress' => ['address' => $to]]],
            ],
            'saveToSentItems' => false,
        ],
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
    );
    [$status, $response] = graphPost(
        'https://graph.microsoft.com/v1.0/users/' . rawurlencode(GRAPH_SENDER) . '/sendMail',
        $payload,
        [
            'Authorization: Bearer ' . graphAccessToken(),
            'Content-Type: application/json',
            'Accept: application/json',
        ],
    );
    if ($status !== 202) {
        $data = json_decode($response, true);
        $code = is_array($data)
            ? (string) ($data['error']['code'] ?? 'send_failed')
            : 'send_failed';
        throw new RuntimeException('Microsoft Graph rejected the email (' . $code . ').');
    }
}

function sendMfaCode(string $email, string $name, string $code): void
{
    $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
    $safeCode = htmlspecialchars($code, ENT_QUOTES, 'UTF-8');
    $subject = 'Your Reckoner sign-in code';
    $plain = "Hello {$name},\n\nYour Reckoner Portal sign-in code is {$code}. It expires in 10 minutes.\n\nIf you did not try to sign in, contact your administrator.";
    $html =
        '<div style="font-family:Arial,sans-serif;color:#171717;max-width:520px"><div style="border-top:5px solid #f26a21;padding:24px"><h2 style="margin:0 0 14px">Reckoner sign-in verification</h2><p>Hello ' .
        $safeName .
        ',</p><p>Use this one-time code to finish signing in:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#f26a21">' .
        $safeCode .
        '</p><p>This code expires in 10 minutes. If you did not try to sign in, contact your administrator.</p></div></div>';
    sendPortalMail($email, $subject, $html, $plain);
}

function sendPasswordResetCode(string $email, string $name, string $code): void
{
    $safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
    $safeCode = htmlspecialchars($code, ENT_QUOTES, 'UTF-8');
    $subject = 'Reset your Reckoner Portal password';
    $plain = "Hello {$name},\n\nYour password reset code is {$code}. It expires in 10 minutes.\n\nIf you did not request this, ignore this email and contact your administrator if concerned.";
    $html =
        '<div style="font-family:Arial,sans-serif;color:#171717;max-width:520px"><div style="border-top:5px solid #f26a21;padding:24px"><h2 style="margin:0 0 14px">Reset your Reckoner password</h2><p>Hello ' .
        $safeName .
        ',</p><p>Use this code to set a new password:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#f26a21">' .
        $safeCode .
        '</p><p>The code expires in 10 minutes. If you did not request this, ignore this email.</p></div></div>';
    sendPortalMail($email, $subject, $html, $plain);
}
