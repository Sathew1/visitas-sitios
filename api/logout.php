<?php

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');

rv_start_session();
$_SESSION = [];

if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();

    setcookie(session_name(), '', [
        'expires' => time() - 42000,
        'path' => $params['path'],
        'secure' => $params['secure'],
        'httponly' => $params['httponly'],
        'samesite' => 'Strict'
    ]);
}

session_destroy();

echo json_encode(['success' => true]);