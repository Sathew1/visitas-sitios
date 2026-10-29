<?php

require_once __DIR__ . '/auth.php';

header('Content-Type: application/json; charset=utf-8');
echo json_encode(rv_auth_context(), JSON_UNESCAPED_UNICODE);