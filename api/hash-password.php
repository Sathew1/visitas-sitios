<?php

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

fwrite(STDOUT, "Escribe la clave y presiona Enter: ");
$password = trim(fgets(STDIN));

if ($password === '') {
    fwrite(STDERR, "La clave no puede estar vacía.\n");
    exit(1);
}

echo password_hash($password, PASSWORD_DEFAULT) . PHP_EOL;
