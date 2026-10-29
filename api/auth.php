<?php

function rv_start_session()
{
    if (session_status() === PHP_SESSION_NONE) {
        $isHttps = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';

        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => $isHttps,
            'httponly' => true,
            'samesite' => 'Strict'
        ]);

        session_start();
    }
}

function rv_users()
{
    return require __DIR__ . '/users.php';
}

function rv_active_shift()
{
    $timezone = new DateTimeZone('America/Santiago');
    $now = new DateTimeImmutable('now', $timezone);
    $anchor = new DateTimeImmutable('2026-10-06 15:00:00', $timezone);

    if ($now < $anchor) {
        return null;
    }

    $elapsedDays = (int)$anchor
        ->setTime(0, 0)
        ->diff($now->setTime(0, 0))
        ->format('%r%a');

    $block = (int)floor($elapsedDays / 7);
    $candidates = array_unique([max(0, $block - 1), $block]);

    foreach ($candidates as $index) {
        $start = $anchor->modify('+' . ($index * 7) . ' days');
        $end = $anchor
            ->modify('+' . (($index + 1) * 7) . ' days')
            ->setTime(13, 0, 0);

        if ($now >= $start && $now < $end) {
            return [
                'shift' => ($index % 2 === 0) ? 'A' : 'B',
                'start' => $start->format(DateTimeInterface::ATOM),
                'end' => $end->format(DateTimeInterface::ATOM)
            ];
        }
    }

    // Fuera del turno, incluido el cambio de turno de 13:00 a 15:00.
    return null;
}

function rv_auth_context()
{
    rv_start_session();

    $users = rv_users();
    $username = isset($_SESSION['rv_username'])
        ? $_SESSION['rv_username']
        : null;

    $user = ($username && isset($users[$username]))
        ? $users[$username]
        : null;

    $active = rv_active_shift();
    $canEdit = $user && $active && $user['shift'] === $active['shift'];

    return [
        'authenticated' => (bool)$user,
        'username' => $username,
        'name' => $user ? $user['name'] : null,
        'shift' => $user ? $user['shift'] : null,
        'activeShift' => $active ? $active['shift'] : null,
        'canEdit' => (bool)$canEdit
    ];
}

function rv_require_editor()
{
    $context = rv_auth_context();

    if (!$context['authenticated']) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => false,
            'message' => 'Inicia sesión para editar.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!$context['canEdit']) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => false,
            'message' => 'Tu turno no está habilitado para editar en este horario.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}