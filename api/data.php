<?php

header('Content-Type: application/json; charset=utf-8');

$file = __DIR__ . '/../data/turno.json';

if (!file_exists($file)) {
    http_response_code(404);

    echo json_encode([
        'success' => false,
        'message' => 'No existe turno.json'
    ]);

    exit;
}

echo file_get_contents($file);