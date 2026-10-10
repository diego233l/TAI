<?php
declare(strict_types=1);

namespace Tai;

/** Revisión de git desplegada (lee .git directamente; no ejecuta procesos). */
final class Version
{
    public static function rev(): ?string
    {
        $git = TAI_ROOT . '/.git';
        $head = @file_get_contents("$git/HEAD");
        if ($head === false) {
            return null;
        }
        if (preg_match('/^ref: (.+)$/m', $head, $m)) {
            $f = "$git/" . trim($m[1]);
            if (is_file($f)) {
                return substr(trim((string)file_get_contents($f)), 0, 7);
            }
            $packed = @file_get_contents("$git/packed-refs");
            if ($packed !== false && preg_match('/^([0-9a-f]{40}) ' . preg_quote(trim($m[1]), '/') . '$/m', $packed, $mm)) {
                return substr($mm[1], 0, 7);
            }
            return null;
        }
        return substr(trim($head), 0, 7);
    }
}
