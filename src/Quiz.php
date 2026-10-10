<?php
declare(strict_types=1);

namespace Tai;

/**
 * Tests, repasos, supuestos y simulacros: selección de preguntas, persistencia de la
 * sesión (para poder retomarla tras recargar) y corrección.
 *
 * Una sesión (tabla exams) guarda un «layout»: secciones → grupos → qids. Un test normal
 * tiene una sección con un grupo; el simulacro oficial tiene la Parte 1 y dos secciones de
 * Parte 2 (Bloque III y Bloque IV) de las que se elige UNA, como en el examen real.
 */
final class Quiz
{
    // -------------------------------------------------------------- selección

    /** @return array<string,array<string,mixed>> qid => fila de qstate */
    public static function stateMap(): array
    {
        $m = [];
        foreach (Db::all('SELECT qid,topic,seen,n_ok,n_ko,n_blank,last,streak,reps,ease,ivl,due,flagged FROM qstate') as $r) {
            $m[$r['qid']] = $r;
        }
        return $m;
    }

    public static function weight(?array $st, string $today): float
    {
        if (!$st || (int)$st['seen'] === 0) {
            return 2.5;
        }
        $w = 1.0;
        if ($st['last'] !== null && (int)$st['last'] === 0) {
            $w *= 4.0;
        }
        if ($st['due'] !== null && $st['due'] <= $today) {
            $w *= 2.5;
        }
        if ((int)$st['streak'] >= 3) {
            $w *= 0.35;
        }
        return $w;
    }

    public static function matches(string $origen, ?array $st, string $today): bool
    {
        $seen = $st ? (int)$st['seen'] : 0;
        return match ($origen) {
            'nuevas' => $seen === 0,
            'falladas' => $st !== null && $st['last'] !== null && (int)$st['last'] === 0,
            'pendientes' => $seen > 0 && $st['due'] !== null && $st['due'] <= $today,
            'marcadas' => $st !== null && (int)$st['flagged'] === 1,
            default => true,
        };
    }

    private static function rnd(): float
    {
        return (random_int(1, PHP_INT_MAX - 1)) / PHP_INT_MAX;
    }

    /**
     * Ordena aleatoriamente favoreciendo (por peso) lo nuevo, lo fallado y lo vencido.
     *
     * @param array<int,array<string,mixed>> $qs
     * @param array<string,array<string,mixed>> $state
     * @return array<int,array<string,mixed>>
     */
    public static function weightedOrder(array $qs, array $state, string $today): array
    {
        $keyed = [];
        foreach ($qs as $q) {
            $w = self::weight($state[$q['id']] ?? null, $today);
            $keyed[] = [log(self::rnd()) / $w, $q];
        }
        usort($keyed, fn($a, $b) => $b[0] <=> $a[0]);
        return array_column($keyed, 1);
    }

    /** @return string[] ids de los temas resueltos a partir de la configuración */
    public static function resolveTopics(array $cfg): array
    {
        $all = Content::topics();
        if (!empty($cfg['topics']) && is_array($cfg['topics'])) {
            return array_values(array_filter($cfg['topics'], fn($t) => isset($all[$t])));
        }
        if (!empty($cfg['blocks']) && is_array($cfg['blocks'])) {
            return array_keys(array_filter($all, fn($t) => in_array($t['block'], $cfg['blocks'], true)));
        }
        return array_keys($all);
    }

    /** Preguntas de tema (excluye las de supuestos, que necesitan su enunciado). */
    public static function topicPool(array $topics): array
    {
        $pool = [];
        foreach ($topics as $tid) {
            foreach (Content::questions($tid) as $q) {
                $pool[] = $q;
            }
        }
        return $pool;
    }

    // --------------------------------------------------------------- creación

    /** @return int id de la sesión */
    public static function create(array $cfg): int
    {
        $kind = (string)($cfg['kind'] ?? 'test');
        $today = State::today();
        $state = self::stateMap();
        $settings = State::settings();
        $mode = ($cfg['mode'] ?? 'estudio') === 'examen' ? 'examen' : 'estudio';
        $duration = null;
        $title = '';
        $layout = [];

        if ($kind === 'simulacro') {
            $mode = 'examen';
            $n1 = max(10, min(80, (int)($cfg['n1'] ?? 80)));
            $n2 = max(0, min(20, (int)($cfg['n2'] ?? 20)));
            $layout = self::simulacroLayout($n1, $n2, $state, $today);
            $duration = max(5, (int)($cfg['minutes'] ?? (int)round(($n1 + $n2) * 1.2))) * 60;
            $title = $n1 === 80 && $n2 === 20 ? 'Simulacro oficial (80 + 20)' : "Simulacro reducido ($n1 + $n2)";
        } elseif ($kind === 'supuesto') {
            $sup = Content::supuestos()[(string)($cfg['supuesto'] ?? '')] ?? null;
            if (!$sup) {
                throw new ApiError(404, 'Supuesto no encontrado');
            }
            $layout = [[
                'id' => 'p1', 'title' => $sup['title'], 'block' => $sup['block'],
                'groups' => [['title' => $sup['title'], 'enunciado' => $sup['enunciado'], 'qids' => array_column($sup['questions'], 'id')]],
            ]];
            $title = 'Supuesto: ' . $sup['title'];
            if ($mode === 'examen') {
                $duration = max(5, (int)round(count($sup['questions']) * 1.5)) * 60;
            }
        } else {
            $origen = (string)($cfg['origen'] ?? 'todas');
            if ($kind === 'repaso') {
                $origen = 'pendientes';
                $mode = 'estudio';
            }
            $topics = self::resolveTopics($cfg);
            if (!empty($cfg['qids']) && is_array($cfg['qids'])) {
                // lista explícita (p. ej. «repetir falladas»): solo preguntas de tema, sin filtro de origen
                $pool = [];
                foreach (array_slice($cfg['qids'], 0, 400) as $qid) {
                    $q = Content::question((string)$qid);
                    if ($q && !isset($q['sup']) && !empty($q['topic'])) {
                        $pool[] = $q;
                    }
                }
                $topics = array_values(array_unique(array_column($pool, 'topic')));
                $origen = 'todas';
            } else {
                $pool = array_values(array_filter(
                    self::topicPool($topics),
                    fn($q) => self::matches($origen, $state[$q['id']] ?? null, $today)
                ));
            }
            if (!$pool) {
                throw new ApiError(409, match ($origen) {
                    'nuevas' => 'No quedan preguntas nuevas con esos filtros.',
                    'falladas' => 'No tienes preguntas falladas pendientes con esos filtros.',
                    'pendientes' => 'No hay repasos pendientes para hoy. ¡Buen trabajo!',
                    'marcadas' => 'No tienes preguntas marcadas con esos filtros.',
                    default => 'No hay preguntas para esa selección todavía.',
                });
            }
            $n = max(1, min(200, (int)($cfg['n'] ?? 20)));
            $picked = array_slice(self::weightedOrder($pool, $state, $today), 0, $n);
            $layout = [[
                'id' => 'p1', 'title' => 'Preguntas',
                'groups' => [['qids' => array_column($picked, 'id')]],
            ]];
            if (!empty($cfg['minutes']) && $mode === 'examen') {
                $duration = max(1, min(240, (int)$cfg['minutes'])) * 60;
            }
            $title = match (true) {
                $kind === 'repaso' => 'Repaso del día',
                !empty($cfg['qids']) => 'Repetición de falladas',
                count($topics) === 1 => 'Test: ' . (Content::topic($topics[0])['short'] ?? $topics[0]),
                !empty($cfg['blocks']) && count($cfg['blocks']) === 1 => 'Test del Bloque ' . (Content::topic($topics[0])['blockNum'] ?? ''),
                default => 'Test mixto',
            };
        }

        $qids = [];
        foreach ($layout as $s) {
            foreach ($s['groups'] as $g) {
                foreach ($g['qids'] as $qid) {
                    $qids[] = $qid;
                }
            }
        }
        if (!$qids) {
            throw new ApiError(409, 'No se han podido seleccionar preguntas.');
        }
        $meta = ['layout' => $layout, 'marks' => new \stdClass(), 'choice' => null, 'cut' => (int)$settings['cut_pct'],
            'shuffle' => (bool)$settings['shuffle']];
        Db::run(
            'INSERT INTO exams(kind,title,config,qids,meta,started,duration) VALUES(?,?,?,?,?,?,?)',
            [$kind, $title, json_encode($cfg + ['mode' => $mode]), json_encode($qids), json_encode($meta), time(), $duration]
        );
        return Db::lastId();
    }

    /**
     * @param array<string,array<string,mixed>> $state
     * @return array<int,array<string,mixed>>
     */
    private static function simulacroLayout(int $n1, int $n2, array $state, string $today): array
    {
        $dist = Content::temario()['examen']['distribucion_parte1'] ?? ['b1' => 22, 'b2' => 12, 'b3' => 22, 'b4' => 24];
        $quota = self::scale($dist, $n1);
        $p1 = [];
        foreach ($quota as $block => $q) {
            $topics = array_keys(array_filter(Content::topics(), fn($t) => $t['block'] === $block));
            $queues = [];
            foreach ($topics as $tid) {
                $qs = Content::questions($tid);
                if ($qs) {
                    $queues[$tid] = self::weightedOrder($qs, $state, $today);
                }
            }
            $keys = array_keys($queues);
            shuffle($keys);
            $got = 0;
            while ($got < $q && $queues) {
                foreach ($keys as $k) {
                    if ($got >= $q) {
                        break;
                    }
                    if (!empty($queues[$k])) {
                        $p1[] = array_shift($queues[$k])['id'];
                        $got++;
                    }
                }
                $queues = array_filter($queues);
                $keys = array_values(array_intersect($keys, array_keys($queues)));
                if (!$keys) {
                    break;
                }
            }
        }
        shuffle($p1);
        $layout = [['id' => 'p1', 'title' => 'Parte 1 · Cuestionario', 'groups' => [['qids' => $p1]]]];

        if ($n2 > 0) {
            foreach (['b3' => 'III', 'b4' => 'IV'] as $block => $roman) {
                $groups = self::pickSupuestos($block, $n2, $state);
                if ($groups) {
                    $layout[] = [
                        'id' => "p2-$block", 'title' => "Parte 2 · Supuesto práctico del Bloque $roman",
                        'block' => $block, 'optional' => true, 'groups' => $groups,
                    ];
                }
            }
        }
        return $layout;
    }

    /**
     * @param array<string,int> $dist
     * @return array<string,int> reparto que suma exactamente $total (método del mayor resto)
     */
    public static function scale(array $dist, int $total): array
    {
        $sum = array_sum($dist) ?: 1;
        $out = [];
        $rem = [];
        foreach ($dist as $k => $v) {
            $x = $v * $total / $sum;
            $out[$k] = (int)floor($x);
            $rem[$k] = $x - floor($x);
        }
        arsort($rem);
        $left = $total - array_sum($out);
        foreach (array_keys($rem) as $k) {
            if ($left-- <= 0) {
                break;
            }
            $out[$k]++;
        }
        return $out;
    }

    /**
     * Elige supuestos del bloque (los menos practicados primero) hasta sumar $n2 preguntas.
     *
     * @param array<string,array<string,mixed>> $state
     * @return array<int,array<string,mixed>> grupos
     */
    private static function pickSupuestos(string $block, int $n2, array $state): array
    {
        $cands = array_values(array_filter(Content::supuestos(), fn($s) => $s['block'] === $block && $s['questions']));
        $scored = [];
        foreach ($cands as $s) {
            $seen = 0;
            foreach ($s['questions'] as $q) {
                $seen += (int)($state[$q['id']]['seen'] ?? 0);
            }
            $scored[] = [$seen / max(1, count($s['questions'])) + self::rnd() * 0.9, $s];
        }
        usort($scored, fn($a, $b) => $a[0] <=> $b[0]);
        $groups = [];
        $total = 0;
        foreach ($scored as [, $s]) {
            $room = $n2 - $total;
            if ($room <= 0) {
                break;
            }
            $qs = $s['questions'];
            if (count($qs) > $room) {
                if ($room < 4) {
                    continue;
                }
                $idx = array_rand($qs, $room);
                $idx = (array)$idx;
                sort($idx);
                $qs = array_map(fn($i) => $qs[$i], $idx);
            }
            $groups[] = ['title' => $s['title'], 'enunciado' => $s['enunciado'], 'qids' => array_column($qs, 'id')];
            $total += count($qs);
        }
        return $groups;
    }

    // ---------------------------------------------------------------- lectura

    public static function load(int $id): array
    {
        $row = Db::one('SELECT * FROM exams WHERE id = ?', [$id]);
        if (!$row) {
            throw new ApiError(404, 'Sesión no encontrada');
        }
        return $row;
    }

    /** Contenido de la sesión para el cliente. Las soluciones solo se envían si $reveal. */
    public static function payload(array $row, bool $reveal): array
    {
        $meta = json_decode($row['meta'], true) ?: [];
        $cfg = json_decode($row['config'], true) ?: [];
        $answers = json_decode($row['answers'], true) ?: [];
        $state = self::stateMap();
        $questions = [];
        foreach (json_decode($row['qids'], true) as $qid) {
            $q = Content::question($qid);
            if (!$q) {
                continue;
            }
            $item = [
                'id' => $q['id'], 'q' => $q['q'], 'o' => $q['o'], 'ns' => $q['ns'], 'topic' => $q['topic'] ?? '',
                'flag' => (int)($state[$qid]['flagged'] ?? 0),
            ];
            $revealThis = $reveal || (($cfg['mode'] ?? '') === 'estudio' && array_key_exists($qid, $answers));
            if ($revealThis) {
                $item['a'] = $q['a'];
                $item['e'] = $q['e'];
                $item['ref'] = $q['ref'];
            }
            $questions[$qid] = $item;
        }
        $now = time();
        return [
            'id' => (int)$row['id'], 'kind' => $row['kind'], 'title' => $row['title'], 'mode' => $cfg['mode'] ?? 'estudio',
            'started' => (int)$row['started'], 'duration' => $row['duration'] !== null ? (int)$row['duration'] : null,
            'remaining' => $row['duration'] !== null && $row['finished'] === null
                ? max(0, (int)$row['started'] + (int)$row['duration'] - $now) : null,
            'finished' => $row['finished'] !== null ? (int)$row['finished'] : null,
            'layout' => $meta['layout'] ?? [], 'questions' => $questions, 'answers' => (object)$answers,
            'marks' => (object)($meta['marks'] ?? []), 'choice' => $meta['choice'] ?? null,
            'shuffle' => (bool)($meta['shuffle'] ?? true), 'cut' => (int)($meta['cut'] ?? 50),
            'result' => $row['result'] !== null ? json_decode($row['result'], true) : null,
        ];
    }

    // -------------------------------------------------------------- respuestas

    /** Modo estudio: corrige una pregunta y devuelve la solución al instante. */
    public static function answer(int $id, string $qid, ?int $chosen, int $ms): array
    {
        $row = self::load($id);
        if ($row['finished'] !== null) {
            throw new ApiError(409, 'La sesión ya ha terminado');
        }
        $q = Content::question($qid);
        if (!$q || !in_array($qid, json_decode($row['qids'], true), true)) {
            throw new ApiError(404, 'Pregunta no encontrada en la sesión');
        }
        if ($chosen !== null && ($chosen < 0 || $chosen > 3)) {
            throw new ApiError(400, 'Opción no válida');
        }
        $answers = json_decode($row['answers'], true) ?: [];
        if (!array_key_exists($qid, $answers)) {
            $answers[$qid] = $chosen;
            Db::run('UPDATE exams SET answers = ? WHERE id = ?', [json_encode($answers), $id]);
            State::recordAnswer($q, $chosen, $ms, $row['kind'] === 'repaso' ? 'repaso' : 'estudio', $id);
        } else {
            $chosen = $answers[$qid];
        }
        return ['chosen' => $chosen, 'a' => $q['a'], 'e' => $q['e'], 'ref' => $q['ref'], 'ok' => $chosen === null ? null : $chosen === $q['a']];
    }

    /** Autoguardado de una sesión en curso (modo examen). */
    public static function save(int $id, array $answers, array $marks, ?string $choice): void
    {
        $row = self::load($id);
        if ($row['finished'] !== null) {
            return;
        }
        $clean = [];
        foreach ($answers as $qid => $v) {
            $clean[(string)$qid] = ($v === null || $v === '') ? null : max(0, min(3, (int)$v));
        }
        $meta = json_decode($row['meta'], true) ?: [];
        $meta['marks'] = array_filter(array_map('intval', $marks));
        $meta['choice'] = in_array($choice, ['p2-b3', 'p2-b4'], true) ? $choice : null;
        Db::run('UPDATE exams SET answers = ?, meta = ? WHERE id = ?', [json_encode((object)$clean), json_encode($meta), $id]);
    }

    // -------------------------------------------------------------- corrección

    public static function finish(int $id, ?array $answers, ?array $marks, ?string $choice): array
    {
        $row = self::load($id);
        if ($row['finished'] !== null) {
            return json_decode((string)$row['result'], true) ?: [];
        }
        if ($answers !== null) {
            self::save($id, $answers, $marks ?? [], $choice);
            $row = self::load($id);
        }
        $cfg = json_decode($row['config'], true) ?: [];
        $meta = json_decode($row['meta'], true) ?: [];
        $stored = json_decode($row['answers'], true) ?: [];
        $isExam = ($cfg['mode'] ?? 'estudio') === 'examen';
        $layout = $meta['layout'] ?? [];
        $choice = $meta['choice'] ?? null;
        $cut = (float)($meta['cut'] ?? 50);

        $sections = [];
        $byTopic = [];
        $record = [];
        foreach ($layout as $s) {
            $ok = $ko = $blank = $n = 0;
            $isP2 = str_starts_with((string)$s['id'], 'p2-');
            $active = !$isP2 || $choice === $s['id'];
            foreach ($s['groups'] as $g) {
                foreach ($g['qids'] as $qid) {
                    $q = Content::question($qid);
                    if (!$q) {
                        continue;
                    }
                    $has = array_key_exists($qid, $stored) && $stored[$qid] !== null;
                    $n++;
                    if ($has) {
                        (int)$stored[$qid] === $q['a'] ? $ok++ : $ko++;
                    } else {
                        $blank++;
                    }
                    // En una sección de Parte 2 no elegida, solo cuenta lo que se haya contestado.
                    if ($has || $active) {
                        $t = $q['topic'] ?? '';
                        $byTopic[$t] ??= ['ok' => 0, 'ko' => 0, 'blank' => 0, 'n' => 0];
                        $byTopic[$t]['n']++;
                        $byTopic[$t][!$has ? 'blank' : ((int)$stored[$qid] === $q['a'] ? 'ok' : 'ko')]++;
                        if ($isExam) {
                            $record[] = [$q, $has ? (int)$stored[$qid] : null];
                        }
                    }
                }
            }
            $sections[$s['id']] = ['id' => $s['id'], 'title' => $s['title'], 'ok' => $ok, 'ko' => $ko, 'blank' => $blank, 'n' => $n, 'active' => $active];
        }

        $result = ['sections' => $sections, 'byTopic' => $byTopic, 'cut' => $cut, 'choice' => $choice];
        if ($row['kind'] === 'simulacro') {
            $p1 = $sections['p1'];
            $result['p1'] = Scoring::part($p1['ok'], $p1['ko'], $p1['n'], $cut);
            $p2 = null;
            if ($choice && isset($sections[$choice])) {
                $c = $sections[$choice];
                $p2 = Scoring::part($c['ok'], $c['ko'], $c['n'], $cut);
            }
            $result['p2'] = $p2;
            $result['points'] = round($result['p1']['points'] + ($p2['points'] ?? 0), 2);
            $result['passed'] = $p2 !== null && $result['p1']['pass'] && $p2['pass'];
            $result['uncorrectedP2'] = $p2 === null && count($sections) > 1;
        }
        // El total solo suma secciones realmente realizadas (una Parte 2 sin elegir ni contestar no cuenta).
        $done = array_filter($sections, fn($s) => $s['active'] || $s['ok'] + $s['ko'] > 0);
        $ok = array_sum(array_column($done, 'ok'));
        $ko = array_sum(array_column($done, 'ko'));
        $n = array_sum(array_column($done, 'n'));
        $result['total'] = [
            'ok' => $ok, 'ko' => $ko, 'blank' => $n - $ok - $ko, 'n' => $n,
            'direct' => Scoring::direct($ok, $ko), 'outOfTen' => Scoring::outOfTen($ok, $ko, $n),
        ];
        $elapsed = time() - (int)$row['started'];
        if ($row['duration'] !== null) {
            $elapsed = min($elapsed, (int)$row['duration']);
        }
        $result['elapsed'] = $elapsed;

        Db::tx(function () use ($id, $record, $result, $elapsed, $row) {
            $per = $record ? (int)round($elapsed * 1000 / count($record)) : 0;
            foreach ($record as [$q, $chosen]) {
                State::recordAnswer($q, $chosen, $per, $row['kind'] === 'simulacro' ? 'simulacro' : 'examen', $id);
            }
            Db::run('UPDATE exams SET finished = ?, result = ? WHERE id = ?', [time(), json_encode($result), $id]);
        });
        return $result;
    }
}
