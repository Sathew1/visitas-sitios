<?php
require_once __DIR__ . '/auth.php';
rv_require_editor();
ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

function respond($status, $data)
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Devuelve un mensaje JSON si PHP termina por un error fatal.
register_shutdown_function(function () {
    $error = error_get_last();

    if ($error && in_array($error['type'], array(E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR), true)) {
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }

        echo json_encode(array(
            'success' => false,
            'message' => 'Error PHP: ' . $error['message']
        ), JSON_UNESCAPED_UNICODE);
    }
});

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, array(
        'success' => false,
        'message' => 'Método no permitido.'
    ));
}

$visit = isset($_POST['visit']) ? $_POST['visit'] : '';
$company = isset($_POST['company']) ? $_POST['company'] : '';

if (!in_array($visit, array('inicio', 'final'), true)) {
    respond(400, array('success' => false, 'message' => 'Turno inválido.'));
}

$allowedCompanies = array('procomit', 'pascom', 'goldfields');

if (!in_array($company, $allowedCompanies, true)) {
    respond(400, array('success' => false, 'message' => 'Empresa inválida.'));
}

if (!isset($_FILES['photo'])) {
    respond(400, array(
        'success' => false,
        'message' => 'PHP no recibió la foto. Revisa el tamaño máximo permitido para cargas.'
    ));
}

$file = $_FILES['photo'];

if (!isset($file['error']) || $file['error'] !== UPLOAD_ERR_OK) {
    $uploadError = isset($file['error']) ? $file['error'] : -1;
    respond(400, array(
        'success' => false,
        'message' => 'La carga de la foto falló. Código PHP: ' . $uploadError
    ));
}

$maxSize = 10 * 1024 * 1024;

if (isset($file['size']) && $file['size'] > $maxSize) {
    respond(413, array(
        'success' => false,
        'message' => 'La foto supera el límite de 10 MB.'
    ));
}

$tmpPath = isset($file['tmp_name']) ? $file['tmp_name'] : '';

if (!$tmpPath || !is_uploaded_file($tmpPath)) {
    respond(400, array('success' => false, 'message' => 'Archivo de carga inválido.'));
}

// Comprueba el tipo real del archivo por su contenido.
$imageInfo = @getimagesize($tmpPath);

if ($imageInfo === false || empty($imageInfo['mime'])) {
    respond(415, array(
        'success' => false,
        'message' => 'El archivo recibido no parece ser una imagen válida.'
    ));
}

$allowedTypes = array(
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
    'image/gif' => 'gif'
);

$mimeType = $imageInfo['mime'];

if (!isset($allowedTypes[$mimeType])) {
    respond(415, array(
        'success' => false,
        'message' => 'Formato no admitido. Usa JPG, PNG, WEBP o GIF.'
    ));
}

$photoDirectory = dirname(__DIR__) . DIRECTORY_SEPARATOR
    . 'fotos' . DIRECTORY_SEPARATOR
    . $visit;

if (!is_dir($photoDirectory)) {
    if (!@mkdir($photoDirectory, 0775, true) && !is_dir($photoDirectory)) {
        respond(500, array(
            'success' => false,
            'message' => 'No se pudo crear fotos/' . $visit . '. Revisa los permisos de la carpeta del proyecto.'
        ));
    }
}

$fileName = bin2hex(random_bytes(16)) . '.' . $allowedTypes[$mimeType];
$destination = $photoDirectory . DIRECTORY_SEPARATOR . $fileName;

if (!move_uploaded_file($tmpPath, $destination)) {
    respond(500, array(
        'success' => false,
        'message' => 'PHP recibió la foto, pero no pudo guardarla en fotos/' . $visit . '. Revisa los permisos de escritura.'
    ));
}

respond(200, array(
    'success' => true,
    'path' => './fotos/' . $visit . '/' . $fileName
));