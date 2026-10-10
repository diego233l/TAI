<?php
declare(strict_types=1);

namespace Tai;

/**
 * Plan de estudio automático a partir de la fecha del examen.
 *
 * Fases (sobre los días de estudio disponibles hasta el día previo al examen):
 *   1. Estudio: cada tema recibe días proporcionales a su extensión (los bloques III y IV
 *      pesan más porque además se examinan en el supuesto práctico).
 *   2. Consolidación: tests y tarjetas por temas/bloques.
 *   3. Simulacros: alternando simulacro completo y análisis de fallos.
 *   4. Repaso final: sin temas nuevos.
 */
final class Plan
{
    /** @return array<string,mixed> */
    public static function build(array $settings, ?string $today = null): array
    {
        $today ??= State::today();
        $exam = $settings['exam_date'] ?? null;
        $topics = Content::topics();
        if (!$exam) {
            return ['ready' => false, 'reason' => 'Fija la fecha del examen en Ajustes para generar tu plan.'];
        }
        if ($exam <= $today) {
            return ['ready' => false, 'reason' => 'La fecha del examen ya ha pasado o es hoy. Actualízala en Ajustes.'];
        }
        $studyDays = array_map('intval', (array)$settings['study_days']);

        $days = [];
        for ($d = $today; $d < $exam; $d = date('Y-m-d', strtotime("$d +1 day"))) {
            if (in_array((int)date('N', strtotime($d)), $studyDays, true)) {
                $days[] = $d;
            }
        }
        $n = count($days);
        if ($n === 0) {
            return ['ready' => false, 'reason' => 'No hay días de estudio disponibles antes del examen con tus ajustes.'];
        }

        $final = $n >= 10 ? 2 : ($n >= 5 ? 1 : 0);
        $sim = $n >= 24 ? (int)ceil(0.2 * $n) : ($n >= 14 ? 4 : 0);
        $cons = $n >= 18 ? (int)ceil(0.22 * $n) : 0;
        $study = $n - $final - $sim - $cons;
        while ($study < 1 && ($sim > 0 || $cons > 0)) {
            $cons > 0 ? $cons-- : $sim--;
            $study = $n - $final - $sim - $cons;
        }
        $study = max(1, $study);

        $ids = array_keys($topics);
        $weights = self::weights($ids);
        $alloc = self::allocate($ids, $weights, $study);

        $plan = [];
        $di = 0;
        $addDay = function (string $phase, array $tasks) use (&$plan, &$di, $days) {
            if ($di >= count($days)) {
                return;
            }
            $date = $days[$di++];
            foreach ($tasks as $i => &$t) {
                $t['key'] = "$date:$i";
            }
            $plan[] = ['date' => $date, 'phase' => $phase, 'tasks' => array_values($tasks)];
        };

        // 1) Estudio
        if ($study >= count($ids)) {
            foreach ($ids as $tid) {
                $k = $alloc[$tid];
                for ($j = 0; $j < $k; $j++) {
                    $t = $topics[$tid];
                    $label = "Tema {$t['global']}: {$t['short']}";
                    if ($k === 1) {
                        $tasks = [
                            ['type' => 'estudio', 'topic' => $tid, 'label' => "Estudiar $label"],
                            ['type' => 'test', 'topic' => $tid, 'label' => 'Test del tema (15 preguntas)', 'n' => 15],
                        ];
                    } elseif ($j === 0) {
                        $tasks = [['type' => 'estudio', 'topic' => $tid, 'label' => "Leer y subrayar $label"]];
                    } elseif ($j === 1) {
                        $tasks = [
                            ['type' => 'tarjetas', 'topic' => $tid, 'label' => "Tarjetas del tema {$t['global']}"],
                            ['type' => 'test', 'topic' => $tid, 'label' => 'Test del tema (20 preguntas)', 'n' => 20],
                        ];
                    } else {
                        $tasks = [
                            ['type' => 'estudio', 'topic' => $tid, 'label' => "Esquema propio y repaso del tema {$t['global']}"],
                            ['type' => 'test', 'topic' => $tid, 'label' => 'Test del tema (20 preguntas)', 'n' => 20],
                        ];
                    }
                    $tasks[] = ['type' => 'repaso', 'label' => 'Repaso espaciado del día'];
                    $addDay('estudio', $tasks);
                }
            }
        } else {
            $per = (int)ceil(count($ids) / $study);
            foreach (array_chunk($ids, $per) as $chunk) {
                $tasks = [];
                foreach ($chunk as $tid) {
                    $t = $topics[$tid];
                    $tasks[] = ['type' => 'estudio', 'topic' => $tid, 'label' => "Estudiar tema {$t['global']}: {$t['short']}"];
                }
                $tasks[] = ['type' => 'test', 'topic' => $chunk[0], 'label' => 'Test de los temas del día', 'n' => 25, 'topics' => $chunk];
                $tasks[] = ['type' => 'repaso', 'label' => 'Repaso espaciado del día'];
                $addDay('estudio', $tasks);
            }
        }

        // 2) Consolidación: se recorren los temas en bloques; si sobran días, segunda vuelta.
        if ($cons > 0) {
            $per = (int)ceil(count($ids) / $cons);
            $chunks = array_chunk($ids, max(1, $per));
            for ($i = 0; $i < $cons; $i++) {
                $chunk = $chunks[$i % count($chunks)];
                $lap = intdiv($i, count($chunks)) + 1;
                $names = implode(', ', array_map(fn($t) => 'T' . $topics[$t]['global'], $chunk));
                $suffix = $lap > 1 ? " · {$lap}ª vuelta" : '';
                $tasks = [
                    ['type' => 'test', 'topic' => $chunk[0], 'label' => "Test de repaso ($names)$suffix", 'n' => 30, 'topics' => $chunk],
                    ['type' => 'tarjetas', 'topic' => $chunk[0], 'label' => "Tarjetas ($names)", 'topics' => $chunk],
                    ['type' => 'falladas', 'label' => 'Preguntas falladas pendientes'],
                ];
                $addDay('consolidacion', $tasks);
            }
        }

        // 3) Simulacros: ciclo de 3 días (simulacro → análisis de fallos → refuerzo de temas débiles)
        for ($i = 0; $i < $sim; $i++) {
            $step = $i % 3;
            if ($step === 0) {
                $addDay('simulacros', [
                    ['type' => 'simulacro', 'label' => 'Simulacro oficial (80 + 20, 120 min) en condiciones reales'],
                ]);
            } elseif ($step === 1) {
                $addDay('simulacros', [
                    ['type' => 'falladas', 'label' => 'Analizar los fallos del simulacro y repasar las falladas'],
                    ['type' => 'repaso', 'label' => 'Repaso espaciado del día'],
                ]);
            } else {
                $addDay('simulacros', [
                    ['type' => 'debiles', 'label' => 'Reforzar los 3 temas más débiles (apuntes + test)'],
                    ['type' => 'tarjetas', 'label' => 'Tarjetas pendientes'],
                    ['type' => 'repaso', 'label' => 'Repaso espaciado del día'],
                ]);
            }
        }

        // 4) Repaso final
        for ($i = 0; $i < $final; $i++) {
            $last = $i === $final - 1;
            $addDay('final', $last
                ? [
                    ['type' => 'libre', 'label' => 'Último repaso muy ligero: chuletas, siglas y puertos. Nada nuevo.'],
                    ['type' => 'libre', 'label' => 'Prepara DNI, bolígrafo y ruta al examen. Duerme bien.'],
                ]
                : [
                    ['type' => 'tarjetas', 'label' => 'Tarjetas de todos los temas'],
                    ['type' => 'falladas', 'label' => 'Preguntas falladas pendientes'],
                    ['type' => 'libre', 'label' => 'Repasa tus anotaciones y la estrategia de examen (penalización 1/3)'],
                ]);
        }

        $done = array_column(Db::all('SELECT k FROM plan_done'), 'k');
        $phases = [];
        foreach ($plan as $p) {
            $phases[$p['phase']]['from'] ??= $p['date'];
            $phases[$p['phase']]['to'] = $p['date'];
            $phases[$p['phase']]['days'] = ($phases[$p['phase']]['days'] ?? 0) + 1;
        }
        $left = (int)round((strtotime($exam) - strtotime($today)) / 86400);
        return [
            'ready' => true, 'today' => $today, 'exam' => $exam, 'daysLeft' => $left, 'studyDays' => $n,
            'phases' => $phases, 'days' => $plan, 'done' => $done,
            'tight' => $n < count($ids),
        ];
    }

    /**
     * @param string[] $ids
     * @return array<string,float>
     */
    private static function weights(array $ids): array
    {
        $words = [];
        foreach ($ids as $tid) {
            $words[$tid] = preg_match_all('/\pL+/u', Content::notes($tid));
        }
        $avg = max(1, array_sum($words) / max(1, count(array_filter($words)))) ;
        $w = [];
        foreach ($ids as $tid) {
            $len = $words[$tid] > 0 ? $words[$tid] / $avg : 1.0;
            $w[$tid] = (Content::topic($tid)['practico'] ? 1.25 : 1.0) * max(0.7, min(1.5, $len));
        }
        return $w;
    }

    /**
     * Reparte $days entre los temas (mínimo 1 cada uno) en proporción a su peso.
     *
     * @param string[] $ids
     * @param array<string,float> $w
     * @return array<string,int>
     */
    public static function allocate(array $ids, array $w, int $days): array
    {
        $out = array_fill_keys($ids, 1);
        $extra = $days - count($ids);
        if ($extra <= 0) {
            return $out;
        }
        $sum = array_sum($w) ?: 1;
        $rem = [];
        foreach ($ids as $id) {
            $x = $extra * $w[$id] / $sum;
            $out[$id] += (int)floor($x);
            $rem[$id] = $x - floor($x);
        }
        arsort($rem);
        $left = $days - array_sum($out);
        foreach (array_keys($rem) as $id) {
            if ($left-- <= 0) {
                break;
            }
            $out[$id]++;
        }
        return $out;
    }
}
