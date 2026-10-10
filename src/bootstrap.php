<?php
declare(strict_types=1);

/**
 * Arranque común. Sin dependencias externas (ni composer): el código se lee
 * del repositorio en cada petición, así que `git pull` basta para actualizar.
 *
 * Requisitos de PHP: pdo_sqlite (paquete php-sqlite3). Nada más fuera del núcleo.
 */

define('TAI_ROOT', dirname(__DIR__));
define('TAI_CONTENT', TAI_ROOT . '/content');
// Los datos viven FUERA del repositorio. Se configuran con la variable TAI_DATA_DIR
// (nginx la pasa con fastcgi_param) y por defecto es /var/lib/tai.
define('TAI_DATA', rtrim((string)(getenv('TAI_DATA_DIR') ?: ($_SERVER['TAI_DATA_DIR'] ?? '/var/lib/tai')), '/'));

date_default_timezone_set('Europe/Madrid');
mb_internal_encoding_safe();

spl_autoload_register(static function (string $class): void {
    if (str_starts_with($class, 'Tai\\')) {
        $file = __DIR__ . '/' . substr($class, 4) . '.php';
        if (is_file($file)) {
            require $file;
        }
    }
});

function mb_internal_encoding_safe(): void
{
    if (function_exists('mb_internal_encoding')) {
        mb_internal_encoding('UTF-8');
    }
}
