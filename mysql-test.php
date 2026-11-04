<?php

header('Content-Type: text/plain');

$host = '115.186.137.226';
$port = 43306;
$db   = 'Timecaptain';
$user = 'timecaptain_app';
$pass = 'AcScAdmin@1010';

try {
    $pdo = new PDO(
        "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4",
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 10
        ]
    );

    echo "SUCCESS\n";
    echo "Connected to Timecaptain database on local Windows Server.\n";

} catch (PDOException $e) {
    echo "CONNECTION FAILED\n";
    echo "Error: " . $e->getMessage();
}