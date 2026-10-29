<?php
require_once __DIR__ . '/auth.php';
rv_require_editor();
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {

    http_response_code(405);

    echo json_encode([
        'success' => false,
        'message' => 'Método no permitido.'
    ]);

    exit;
}


$input = file_get_contents('php://input');

$data = json_decode($input, true);


if ($data === null) {

    http_response_code(400);

    echo json_encode([
        'success' => false,
        'message' => 'JSON inválido.'
    ]);

    exit;
}


$file = __DIR__ . '/../data/turno.json';


$json = json_encode(
    $data,
    JSON_PRETTY_PRINT |
    JSON_UNESCAPED_UNICODE |
    JSON_UNESCAPED_SLASHES
);


if ($json === false) {

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'No se pudo convertir la información.'
    ]);

    exit;
}


if (file_put_contents($file, $json) === false) {

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'No se pudo guardar turno.json.'
    ]);

    exit;
}


echo json_encode([
    'success' => true,
    'message' => 'Datos guardados correctamente.'
]);