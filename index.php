
<?php
require_once __DIR__ . '/api/auth.php';

$auth = rv_auth_context();

if ($auth['authenticated']) {
    header('Location: ./app.php');
    exit;
}

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Acceso - Registro de Visitas</title>
    <link rel="icon" href="./favicon.ico?v=3">
    <style>
        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f1f5f9;
            font-family: Arial, sans-serif;
            padding: 20px;
        }

        .login-card {
            width: 100%;
            max-width: 400px;
            background: white;
            padding: 35px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,.08);
            text-align: center;
        }

        .login-logo {
            width: 100px;
            height: auto;
            object-fit: contain;
            margin-bottom: 12px;
        }

        h1 {
            color: #193f5c;
            font-size: 25px;
            margin: 8px 0;
        }

        .subtitle {
            color: #64748b;
            margin-bottom: 28px;
        }

        .login-form {
            display: flex;
            flex-direction: column;
            gap: 14px;
        }

        .login-form input {
            width: 100%;
            padding: 13px;
            border: 1px solid #cbd5e1;
            border-radius: 7px;
            font-size: 16px;
        }

        .login-form input:focus {
            outline: 2px solid #285d82;
            border-color: #285d82;
        }

        .login-form button {
            padding: 13px;
            border: none;
            border-radius: 7px;
            background: #285d82;
            color: white;
            font-size: 16px;
            cursor: pointer;
        }

        .login-form button:hover {
            background: #193f5c;
        }

        .login-form button:disabled {
            opacity: .6;
            cursor: wait;
        }

        #loginMessage {
            min-height: 20px;
            color: #c62828;
            font-size: 14px;
            margin-top: 15px;
        }

        .footer {
            color: #94a3b8;
            font-size: 12px;
            margin-top: 25px;
        }
    </style>
</head>
<body>

    <main class="login-card">
        <img src="./logo.png?v=3" alt="NetSoluciones" class="login-logo">

        <h1>Registro de Visitas</h1>
        <p class="subtitle">Acceso exclusivo para usuarios autorizados</p>

        <form id="loginForm" class="login-form">
            <input
                id="username"
                type="text"
                placeholder="Usuario"
                autocomplete="username"
                required
            >

            <input
                id="password"
                type="password"
                placeholder="Contraseña"
                autocomplete="current-password"
                required
            >

            <button id="loginButton" type="submit">
                Iniciar sesión
            </button>
        </form>

        <div id="loginMessage" role="alert"></div>

        <div class="footer">
            NetSoluciones · Registro de Visitas
        </div>
    </main>

    <script>
        const form = document.getElementById('loginForm');
        const button = document.getElementById('loginButton');
        const message = document.getElementById('loginMessage');

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            button.disabled = true;
            button.textContent = 'Ingresando...';
            message.textContent = '';

            try {
                const response = await fetch('./api/login.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        username: document.getElementById('username').value.trim(),
                        password: document.getElementById('password').value
                    }),
                    cache: 'no-store'
                });

                const result = await response.json();

                if (!response.ok || !result.success) {
                    throw new Error(result.message || 'No se pudo iniciar sesión.');
                }

                window.location.replace('./app.php');

            } catch (error) {
                message.textContent = error.message;
                button.disabled = false;
                button.textContent = 'Iniciar sesión';
            }
        });
    </script>

</body>
</html>