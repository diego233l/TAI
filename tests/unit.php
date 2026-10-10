<?php
declare(strict_types=1);

/** Pruebas unitarias sin dependencias. Uso:  php tests/unit.php  (código 1 si algo falla). */

require __DIR__ . '/../src/bootstrap.php';

use Tai\Plan;
use Tai\Scoring;
use Tai\Srs;

$fail = 0;
$n = 0;
function check(string $name, bool $ok): void
{
    global $fail, $n;
    $n++;
    if (!$ok) {
        $fail++;
        echo "FALLO: $name\n";
    }
}
function near(float $a, float $b, float $eps = 0.01): bool
{
    return abs($a - $b) <= $eps;
}

// ---- Puntuación: error = -1/3, blanco = 0
check('directa 60 ok, 12 ko = 56', near(Scoring::direct(60, 12), 56));
check('directa sin errores', near(Scoring::direct(10, 0), 10));
$p = Scoring::part(80, 0, 80, 30);
check('todo acertado = 50 puntos y aprobado', near($p['points'], 50) && $p['pass']);
$p = Scoring::part(0, 0, 80, 30);
check('en blanco = 0 puntos y suspenso', near($p['points'], 0) && !$p['pass']);
$p = Scoring::part(24, 0, 80, 30);
check('justo en el mínimo = 25 puntos', near($p['points'], 25) && $p['pass']);
$p = Scoring::part(23, 0, 80, 30);
check('bajo el mínimo = suspenso', !$p['pass'] && $p['points'] < 25);
$p = Scoring::part(0, 30, 80, 30);
check('solo errores no da puntos negativos', near($p['points'], 0));
$p = Scoring::part(40, 0, 80, 10);
check('el corte nunca baja del 30 %', near($p['minDirect'], 24));
check('nota sobre 10', near(Scoring::outOfTen(8, 3, 10), 7.0));

// ---- Repaso espaciado
$s0 = ['reps' => 0, 'ease' => 2.5, 'ivl' => 0.0, 'due' => null];
$a = Srs::next($s0, Srs::Q_GOOD, '2026-01-01');
check('primer acierto: 1 día', $a['reps'] === 1 && $a['due'] === '2026-01-02');
$b = Srs::next($a, Srs::Q_GOOD, '2026-01-02');
check('segundo acierto: 3 días', $b['reps'] === 2 && $b['due'] === '2026-01-05');
$c = Srs::next($b, Srs::Q_GOOD, '2026-01-05');
check('tercero crece con la facilidad', $c['ivl'] > 3.0 && $c['reps'] === 3);
$f = Srs::next($b, Srs::Q_FAIL, '2026-01-05');
check('fallo: vuelve hoy y baja la facilidad', $f['due'] === '2026-01-05' && $f['reps'] === 0 && $f['ease'] < $b['ease'] && $f['lapse']);
$bl = Srs::next($b, Srs::Q_BLANK, '2026-01-05');
check('en blanco: mañana y sin fallo', $bl['due'] === '2026-01-06' && !$bl['lapse']);
$early = Srs::next($b, Srs::Q_GOOD, '2026-01-03');
check('repaso anticipado no mueve el calendario', $early['due'] === $b['due'] && $early['reps'] === $b['reps']);
$lim = Srs::next($c, Srs::Q_EASY, '2026-01-10', '2026-01-20');
check('el intervalo respeta la fecha del examen', strtotime($lim['due']) < strtotime('2026-01-20'));
check('facilidad mínima 1.3', Srs::next(['reps' => 0, 'ease' => 1.3, 'ivl' => 0.0, 'due' => null], Srs::Q_FAIL, '2026-01-01')['ease'] >= 1.3);
check('dominada', Srs::mastered(1, 7.0, 3) && !Srs::mastered(0, 7.0, 3) && !Srs::mastered(1, 1.0, 1));

// ---- Plan de estudio
$settings = ['exam_date' => '2026-12-20', 'study_days' => [1, 2, 3, 4, 5, 6, 7], 'daily_minutes' => 120];
$plan = Plan::build($settings, '2026-10-10');
check('plan listo', $plan['ready'] === true && $plan['studyDays'] === 71);
$topicsInPlan = [];
foreach ($plan['days'] as $d) {
    foreach ($d['tasks'] as $t) {
        if ($t['type'] === 'estudio') {
            $topicsInPlan[$t['topic']] = true;
        }
    }
}
check('el plan cubre los 33 temas', count($topicsInPlan) === 33);
check('el plan no pasa del día previo al examen', end($plan['days'])['date'] < '2026-12-20');
check('sin fecha no hay plan', Plan::build(['exam_date' => null, 'study_days' => [1]], '2026-10-10')['ready'] === false);
check('examen pasado no hay plan', Plan::build(['exam_date' => '2026-01-01', 'study_days' => [1]], '2026-10-10')['ready'] === false);
$short = Plan::build(['exam_date' => '2026-10-14', 'study_days' => [1, 2, 3, 4, 5, 6, 7], 'daily_minutes' => 60], '2026-10-10');
check('plan corto sigue siendo válido', $short['ready'] === true && count($short['days']) === 4);

echo $fail ? "$fail de $n pruebas fallan\n" : "Todas las pruebas pasan ($n)\n";
exit($fail ? 1 : 0);
