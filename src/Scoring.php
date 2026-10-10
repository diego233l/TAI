<?php
declare(strict_types=1);

namespace Tai;

/**
 * Puntuación según el Anexo V de la convocatoria BOE-A-2025-26262:
 *  - cada error resta 1/3 de un acierto; en blanco no penaliza;
 *  - cada parte se califica de 0 a 50 y hay que sacar al menos 25;
 *  - la «puntuación directa mínima» la fija el Tribunal (nunca por debajo del 30 % del máximo)
 *    y equivale a los 25 puntos; la directa máxima equivale a 50.
 *
 * La transformación entre directa y nota no está publicada: aquí se aproxima con una
 * interpolación lineal a tramos. Es una ESTIMACIÓN para entrenar, no la nota oficial.
 */
final class Scoring
{
    public const PENALTY = 1 / 3;

    public static function direct(int $ok, int $ko): float
    {
        return round($ok - $ko * self::PENALTY, 4);
    }

    /**
     * @return array{ok:int,ko:int,blank:int,n:int,direct:float,max:int,pct:float,minDirect:float,points:float,pass:bool}
     */
    public static function part(int $ok, int $ko, int $total, float $cutPct, float $maxPoints = 50.0): array
    {
        $cutPct = max(30.0, min(95.0, $cutPct));
        $blank = max(0, $total - $ok - $ko);
        $direct = self::direct($ok, $ko);
        $minDirect = $total * $cutPct / 100;
        $half = $maxPoints / 2;
        if ($direct <= 0 || $total <= 0) {
            $pts = 0.0;
        } elseif ($direct < $minDirect) {
            $pts = $half * $direct / $minDirect;
        } else {
            $span = max(0.0001, $total - $minDirect);
            $pts = $half + $half * ($direct - $minDirect) / $span;
        }
        return [
            'ok' => $ok, 'ko' => $ko, 'blank' => $blank, 'n' => $total,
            'direct' => $direct, 'max' => $total,
            'pct' => $total > 0 ? round(100 * max(0.0, $direct) / $total, 1) : 0.0,
            'minDirect' => round($minDirect, 2),
            'points' => round(min($maxPoints, $pts), 2),
            'pass' => $direct >= $minDirect && $total > 0,
        ];
    }

    /** Nota simple de un test suelto, sobre 10, con penalización. */
    public static function outOfTen(int $ok, int $ko, int $total): float
    {
        return $total > 0 ? round(max(0.0, 10 * self::direct($ok, $ko) / $total), 2) : 0.0;
    }
}
