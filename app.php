
<?php
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

require_once __DIR__ . '/api/auth.php';

rv_require_auth();
?>

<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Registro de Visitas</title>
    <link rel="icon" type="image/x-icon" href="./favicon.ico?v=3">
    <link rel="stylesheet" href="./style.css?v=6" />
  </head>
  <body>
    <header class="topbar">
      <div class="brand">
        <img src="./logo.png?v=3" alt="NetSoluciones" class="logo">
        <div>
          <h1>Registro de Visitas</h1>
          <p>NetSoluciones</p>
        </div>
      </div>
      <div class="week-selector">
        <label for="currentWeek">Semana</label>
        <input
          id="currentWeek"
          type="number"
          min="1"
          max="53"
          aria-label="Número de semana"
        />
        <span id="currentDate" class="current-date"></span>
      </div>
    </header>

    <main class="container">
      <section class="login-panel">
        

        <div id="loggedInPanel" hidden>
          <span id="authInfo"></span>
          <button id="logoutButton" class="button" type="button">
            Cerrar sesión
          </button>
        </div>

        <p id="authMessage" role="status">Inicia sesión para editar.</p>
      </section>
      <nav class="visit-tabs" aria-label="Turno">
        <button class="visit-tab active" type="button" data-visit="inicio">
          Inicio de turno
        </button>
        <button class="visit-tab" type="button" data-visit="final">
          Final de turno
        </button>
      </nav>
      <div class="export-actions">
        <button id="exportWord" class="button" type="button">
          Descargar Word
        </button>
        <!--<button id="exportPdf" class="button primary" type="button">
          Guardar PDF
        </button>-->
      </div>

      <nav id="companyTabs" class="company-tabs" aria-label="Empresa"></nav>

      <div id="message" class="message" role="status" aria-live="polite"></div>
      <section id="content" aria-live="polite"></section>
    </main>

    <div id="imageModal" class="image-modal" aria-hidden="true">
      <button
        id="closeModal"
        class="modal-close"
        type="button"
        aria-label="Cerrar"
      >
        ×
      </button>
      <img id="modalImage" src="" alt="Foto de la observación" />
    </div>

    <script src="./app.js?v=13" defer></script>
  </body>
</html>
