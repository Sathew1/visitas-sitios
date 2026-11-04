<?php

require_once __DIR__ . '/auth.php';

// Solo usuarios autenticados pueden consultar los datos.
rv_require_auth();

header('Content-Type: application/json; charset=utf-8');

$file = __DIR__ . '/../data/turno.json';

if (!file_exists($file)) {
    http_response_code(404);

    echo json_encode([
        'success' => false,
        'message' => 'No existe turno.json'
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

echo file_get_contents($file);
