<?php
declare(strict_types=1);

/**
 * Único script PHP expuesto. nginx envía aquí todo lo que no sea un fichero estático de /assets.
 * - /api/*  → API JSON
 * - resto   → la aplicación (SPA) con las versiones de los recursos calculadas por mtime,
 *             de modo que tras un `git pull` el navegador descarga lo nuevo sin tocar nada.
 */

require __DIR__ . '/../src/bootstrap.php';

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = rawurldecode($path);

// Servidor embebido de PHP (desarrollo): deja pasar los ficheros estáticos.
if (PHP_SAPI === 'cli-server' && $path !== '/' && is_file(__DIR__ . $path) && !str_ends_with($path, '.php')) {
    return false;
}

if (str_starts_with($path, '/api/')) {
    Tai\Api::handle($_SERVER['REQUEST_METHOD'] ?? 'GET', $path);
}

if (str_starts_with($path, '/assets/') || str_contains($path, '..')) {
    http_response_code(404);
    exit('No encontrado');
}

// Mapa de importación: versiona cada módulo JS por mtime (caché fiable sin paso de build).
$map = [];
foreach (glob(__DIR__ . '/assets/js/*.js') ?: [] as $f) {
    $map['/assets/js/' . basename($f)] = '/assets/js/' . basename($f) . '?v=' . filemtime($f);
}
$css = '/assets/app.css?v=' . (int)@filemtime(__DIR__ . '/assets/app.css');
$nonce = base64_encode(random_bytes(16));

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-$nonce'; style-src 'self' 'unsafe-inline'; "
    . "img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");

$importMap = json_encode(['imports' => $map], JSON_UNESCAPED_SLASHES);
$entry = $map['/assets/js/app.js'] ?? '/assets/js/app.js';
?>
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#1d4ed8">
<title>TAI C1 · Preparación de la oposición</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%231d4ed8'/%3E%3Cpath d='M8 10h16M16 10v14' stroke='white' stroke-width='3.2' stroke-linecap='round'/%3E%3C/svg%3E">
<link rel="stylesheet" href="<?= htmlspecialchars($css, ENT_QUOTES) ?>">
<script type="importmap" nonce="<?= $nonce ?>"><?= $importMap ?></script>
</head>
<body>
<div id="app"><p class="boot">Cargando…</p></div>
<noscript><p style="padding:2rem">Esta aplicación necesita JavaScript.</p></noscript>
<script type="module" src="<?= htmlspecialchars($entry, ENT_QUOTES) ?>"></script>
</body>
</html>
