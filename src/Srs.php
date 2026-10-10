<?php
declare(strict_types=1);

namespace Tai;

/**
 * Repetición espaciada (variante de SM-2 adaptada a una oposición con fecha fija).
 *
 *  - Fallo: vuelve hoy mismo (ivl 0) y baja la facilidad.
 *  - En blanco: se repasa mañana (no cuenta como fallo).
 *  - Acierto: 1 día → 3 días → ivl × facilidad. Si hay fecha de examen, el intervalo
 *    se limita al 40 % de los días que faltan, para que siempre haya un repaso previo.
 *  - Un acierto fuera de plazo (pregunta aún no vencida) no hace avanzar el calendario.
 */
final class Srs
{
    public const Q_FAIL = 1;
    public const Q_BLANK = 2;
    public const Q_HARD = 3;
    public const Q_GOOD = 4;
    public const Q_EASY = 5;

    /**
     * @param array{reps:int,ease:float,ivl:float,due:?string} $s estado actual
     * @return array{reps:int,ease:float,ivl:float,due:string,lapse:bool}
     */
    public static function next(array $s, int $quality, string $today, ?string $examDate = null): array
    {
        $reps = (int)$s['reps'];
        $ease = (float)$s['ease'];
        $ivl = (float)$s['ivl'];
        $due = $s['due'] ?? null;
        $lapse = false;

        if ($quality < 3) {
            $lapse = $quality === self::Q_FAIL;
            $reps = 0;
            $ivl = $quality === self::Q_FAIL ? 0.0 : 1.0;
            $ease = max(1.3, $ease - ($quality === self::Q_FAIL ? 0.2 : 0.05));
        } else {
            $isDue = $due === null || $due <= $today;
            if ($isDue) {
                $reps++;
                $ivl = match (true) {
                    $reps === 1 => 1.0,
                    $reps === 2 => 3.0,
                    default => max($ivl, 3.0) * $ease,
                };
                if ($quality === self::Q_HARD) {
                    $ivl = max(1.0, $ivl * 0.8);
                } elseif ($quality === self::Q_EASY) {
                    $ivl *= 1.3;
                }
                $ease = max(1.3, $ease + 0.1 - (5 - $quality) * (0.08 + (5 - $quality) * 0.02));
            } else {
                // repaso anticipado: se conserva el calendario actual
                return ['reps' => $reps, 'ease' => $ease, 'ivl' => $ivl, 'due' => (string)$due, 'lapse' => false];
            }
        }

        if ($examDate !== null && $examDate > $today) {
            $left = (int)((strtotime($examDate) - strtotime($today)) / 86400);
            $ivl = min($ivl, max(1.0, floor($left * 0.4)));
        }
        $ivl = round($ivl, 2);
        $days = (int)ceil($ivl);
        $newDue = date('Y-m-d', strtotime($today . " +$days day"));
        return ['reps' => $reps, 'ease' => round($ease, 3), 'ivl' => $ivl, 'due' => $newDue, 'lapse' => $lapse];
    }

    /** Una pregunta se considera «dominada» si la última vez se acertó y ya superó dos repasos. */
    public static function mastered(?int $last, float $ivl, int $reps): bool
    {
        return $last === 1 && $reps >= 2 && $ivl >= 3.0;
    }
}
