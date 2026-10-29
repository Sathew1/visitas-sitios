<?php

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método no permitido.']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$username = isset($input['username']) ? $input['username'] : '';
$password = isset($input['password']) ? $input['password'] : '';

$users = rv_users();

if (
    !isset($users[$username]) ||
    !password_verify($password, $users[$username]['password_hash'])
) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'message' => 'Usuario o clave incorrectos.'
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

rv_start_session();
session_regenerate_id(true);
$_SESSION['rv_username'] = $username;

echo json_encode([
    'success' => true,
    'auth' => rv_auth_context()
], JSON_UNESCAPED_UNICODE);