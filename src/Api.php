<?php
declare(strict_types=1);

namespace Tai;

/** API JSON (todas las rutas bajo /api/). Sin sesiones ni cookies: es una herramienta personal. */
final class Api
{
    /** @var array<string,mixed> */
    private static array $body = [];

    public static function handle(string $method, string $path): never
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        try {
            if ($method === 'POST' || $method === 'PUT') {
                $raw = file_get_contents('php://input', false, null, 0, 26 * 1024 * 1024) ?: '';
                $b = $raw === '' ? [] : json_decode($raw, true);
                if (!is_array($b)) {
                    throw new ApiError(400, 'Cuerpo JSON no válido');
                }
                self::$body = $b;
            }
            foreach (self::routes() as [$m, $re, $fn]) {
                if ($m === $method && preg_match($re, $path, $mm)) {
                    $out = $fn(...array_slice($mm, 1));
                    echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR);
                    exit;
                }
            }
            throw new ApiError(404, 'Ruta no encontrada');
        } catch (ApiError $e) {
            http_response_code($e->status);
            echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
        } catch (\RuntimeException $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
        } catch (\Throwable $e) {
            error_log('[tai] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            http_response_code(500);
            echo json_encode(['error' => 'Error interno'], JSON_UNESCAPED_UNICODE);
        }
        exit;
    }

    private static function in(string $k, mixed $default = null): mixed
    {
        return self::$body[$k] ?? $default;
    }

    /** @return array<int,array{0:string,1:string,2:callable}> */
    private static function routes(): array
    {
        return [
            ['GET', '#^/api/health$#', fn() => ['ok' => true, 'rev' => Version::rev(), 'php' => PHP_VERSION, 'data' => TAI_DATA, 'db' => (int)Db::val('PRAGMA user_version')]],
            ['GET', '#^/api/bootstrap$#', [self::class, 'bootstrap']],
            ['GET', '#^/api/topic/(b\dt\d+)$#', [self::class, 'topic']],
            ['POST', '#^/api/topic/(b\dt\d+)$#', [self::class, 'topicSave']],
            ['POST', '#^/api/quiz$#', fn() => ['id' => Quiz::create(self::$body)]],
            ['GET', '#^/api/exam/(\d+)$#', fn($id) => self::exam((int)$id)],
            ['POST', '#^/api/exam/(\d+)/answer$#', fn($id) => Quiz::answer(
                (int)$id,
                (string)self::in('qid', ''),
                self::in('chosen') === null ? null : (int)self::in('chosen'),
                (int)self::in('ms', 0)
            )],
            ['POST', '#^/api/exam/(\d+)/save$#', function ($id) {
                Quiz::save((int)$id, (array)self::in('answers', []), (array)self::in('marks', []), self::in('choice'));
                return ['ok' => true];
            }],
            ['POST', '#^/api/exam/(\d+)/finish$#', function ($id) {
                $res = Quiz::finish(
                    (int)$id,
                    array_key_exists('answers', self::$body) ? (array)self::$body['answers'] : null,
                    array_key_exists('marks', self::$body) ? (array)self::$body['marks'] : null,
                    self::in('choice')
                );
                return ['result' => $res];
            }],
            ['GET', '#^/api/cards$#', [self::class, 'cards']],
            ['POST', '#^/api/cards/grade$#', function () {
                $c = Content::allCards()[(string)self::in('cid', '')] ?? null;
                if (!$c) {
                    throw new ApiError(404, 'Tarjeta no encontrada');
                }
                return State::gradeCard($c, (int)self::in('grade', 3));
            }],
            ['GET', '#^/api/stats$#', fn() => Stats::overview(max(7, min(400, (int)($_GET['days'] ?? 120)))) + ['topics' => Stats::topics()]],
            ['GET', '#^/api/settings$#', fn() => State::settings()],
            ['POST', '#^/api/settings$#', fn() => State::saveSettings(self::$body)],
            ['GET', '#^/api/plan$#', fn() => Plan::build(State::settings())],
            ['POST', '#^/api/plan/done$#', function () {
                $k = (string)self::in('key', '');
                if (!preg_match('/^\d{4}-\d{2}-\d{2}:\d+$/', $k)) {
                    throw new ApiError(400, 'Clave no válida');
                }
                if (self::in('done')) {
                    Db::run('INSERT OR REPLACE INTO plan_done(k,ts) VALUES(?,?)', [$k, time()]);
                } else {
                    Db::run('DELETE FROM plan_done WHERE k = ?', [$k]);
                }
                return ['ok' => true];
            }],
            ['GET', '#^/api/search$#', fn() => self::search((string)($_GET['q'] ?? ''))],
            ['GET', '#^/api/glosario$#', fn() => ['items' => Content::glossary()]],
            ['GET', '#^/api/chuletas$#', fn() => ['items' => array_map(fn($c) => ['slug' => $c['slug'], 'title' => $c['title']], Content::cheats())]],
            ['GET', '#^/api/chuleta/([\w\-]+)$#', function ($slug) {
                foreach (Content::cheats() as $c) {
                    if ($c['slug'] === $slug) {
                        return $c;
                    }
                }
                throw new ApiError(404, 'Chuleta no encontrada');
            }],
            ['GET', '#^/api/normativa$#', fn() => ['items' => Content::normativa()]],
            ['GET', '#^/api/supuestos$#', [self::class, 'supuestos']],
            ['POST', '#^/api/flag$#', function () {
                $q = Content::question((string)self::in('qid', ''));
                if (!$q) {
                    throw new ApiError(404, 'Pregunta no encontrada');
                }
                Db::run(
                    'INSERT INTO qstate(qid,topic,flagged,updated) VALUES(?,?,?,?)
                     ON CONFLICT(qid) DO UPDATE SET flagged=excluded.flagged, updated=excluded.updated',
                    [$q['id'], $q['topic'] ?? '', self::in('flagged') ? 1 : 0, time()]
                );
                return ['ok' => true];
            }],
            ['POST', '#^/api/report$#', function () {
                $qid = (string)self::in('qid', '');
                if (!Content::question($qid)) {
                    throw new ApiError(404, 'Pregunta no encontrada');
                }
                Db::run('INSERT INTO reports(ts,qid,kind,msg) VALUES(?,?,?,?)', [
                    time(), $qid, substr((string)self::in('kind', 'error'), 0, 20), substr((string)self::in('msg', ''), 0, 2000),
                ]);
                return ['ok' => true];
            }],
            ['GET', '#^/api/reports$#', function () {
                $out = [];
                foreach (Db::all('SELECT * FROM reports ORDER BY done ASC, ts DESC LIMIT 300') as $r) {
                    $q = Content::question($r['qid']);
                    $out[] = $r + ['q' => $q ? ['q' => $q['q'], 'o' => $q['o'], 'a' => $q['a'], 'topic' => $q['topic'] ?? ''] : null];
                }
                return ['items' => $out];
            }],
            ['POST', '#^/api/reports/(\d+)/done$#', function ($id) {
                Db::run('UPDATE reports SET done = ? WHERE id = ?', [self::in('done', true) ? 1 : 0, (int)$id]);
                return ['ok' => true];
            }],
            ['GET', '#^/api/export$#', [self::class, 'export']],
            ['POST', '#^/api/import$#', [self::class, 'import']],
        ];
    }

    // ---------------------------------------------------------------- handlers

    private static function bootstrap(): array
    {
        $t = Content::temario();
        $stats = Stats::overview(30);
        $cards = 0;
        foreach (array_keys(Content::topics()) as $tid) {
            $cards += count(Content::cards($tid));
        }
        return [
            'today' => State::today(),
            'settings' => State::settings(),
            'temario' => $t,
            'progress' => Stats::topics(),
            'due' => Stats::dueCounts(),
            'streak' => $stats['streak'],
            'todayStats' => $stats['today'],
            'totals' => $stats['totals'],
            'lastExam' => $stats['exams'][0] ?? null,
            'supuestos' => self::supuestos()['items'],
            'bank' => ['cards' => $cards, 'supuestos' => count(Content::supuestos())],
            'plan' => self::planToday(),
        ];
    }

    private static function planToday(): ?array
    {
        $p = Plan::build(State::settings());
        if (!$p['ready']) {
            return ['ready' => false, 'reason' => $p['reason']];
        }
        $today = State::today();
        $days = array_values(array_filter($p['days'], fn($d) => $d['date'] === $today));
        return [
            'ready' => true, 'daysLeft' => $p['daysLeft'], 'exam' => $p['exam'], 'tight' => $p['tight'],
            'day' => $days[0] ?? null, 'done' => $p['done'],
            'phase' => $days[0]['phase'] ?? null,
        ];
    }

    private static function topic(string $id): array
    {
        $t = Content::topic($id);
        if (!$t) {
            throw new ApiError(404, 'Tema no encontrado');
        }
        $row = Db::one('SELECT status, notes FROM topics WHERE topic = ?', [$id]) ?? ['status' => 'pendiente', 'notes' => ''];
        $norms = array_values(array_filter(Content::normativa(), fn($n) => in_array($id, $n['topics'] ?? [], true)));
        $sups = [];
        foreach (Content::supuestos() as $s) {
            if (in_array($id, $s['topics'], true)) {
                $sups[] = ['id' => $s['id'], 'title' => $s['title'], 'n' => count($s['questions'])];
            }
        }
        return [
            'topic' => $t, 'md' => Content::notes($id), 'state' => $row, 'normativa' => $norms,
            'stats' => Stats::topics()[$id] ?? null, 'cards' => Content::cards($id), 'supuestos' => $sups,
            'prev' => self::neighbour($id, -1), 'next' => self::neighbour($id, 1),
        ];
    }

    private static function neighbour(string $id, int $d): ?array
    {
        $ids = array_keys(Content::topics());
        $i = array_search($id, $ids, true);
        $j = $i + $d;
        if ($i === false || !isset($ids[$j])) {
            return null;
        }
        $t = Content::topics()[$ids[$j]];
        return ['id' => $t['id'], 'global' => $t['global'], 'short' => $t['short']];
    }

    private static function topicSave(string $id): array
    {
        if (!Content::topic($id)) {
            throw new ApiError(404, 'Tema no encontrado');
        }
        $cur = Db::one('SELECT status, notes FROM topics WHERE topic = ?', [$id]) ?? ['status' => 'pendiente', 'notes' => ''];
        $status = self::in('status', $cur['status']);
        if (!in_array($status, ['pendiente', 'estudiando', 'repasar', 'dominado'], true)) {
            throw new ApiError(400, 'Estado no válido');
        }
        $notes = substr((string)self::in('notes', $cur['notes']), 0, 20000);
        Db::run(
            'INSERT INTO topics(topic,status,notes,updated) VALUES(?,?,?,?)
             ON CONFLICT(topic) DO UPDATE SET status=excluded.status, notes=excluded.notes, updated=excluded.updated',
            [$id, $status, $notes, time()]
        );
        return ['status' => $status, 'notes' => $notes];
    }

    private static function exam(int $id): array
    {
        $row = Quiz::load($id);
        return Quiz::payload($row, $row['finished'] !== null);
    }

    private static function cards(): array
    {
        $scope = (string)($_GET['scope'] ?? 'due');
        $limit = max(1, min(200, (int)($_GET['limit'] ?? 30)));
        $today = State::today();
        $cstate = [];
        foreach (Db::all('SELECT * FROM cstate') as $r) {
            $cstate[$r['cid']] = $r;
        }
        $topics = [];
        if (!empty($_GET['topics'])) {
            $topics = array_filter(explode(',', (string)$_GET['topics']), fn($t) => Content::topic($t));
        } elseif (!empty($_GET['block'])) {
            $topics = array_keys(array_filter(Content::topics(), fn($t) => $t['block'] === $_GET['block']));
        }
        $pool = [];
        foreach (Content::allCards() as $c) {
            if ($topics && !in_array($c['topic'], $topics, true)) {
                continue;
            }
            $st = $cstate[$c['id']] ?? null;
            $isDue = $st && $st['due'] !== null && $st['due'] <= $today;
            $isNew = !$st;
            $keep = match ($scope) {
                'due' => $isDue,
                'new' => $isNew,
                'learn' => $isDue || $isNew,
                default => true,
            };
            if ($keep) {
                $pool[] = $c + ['new' => $isNew, 'due' => $st['due'] ?? null, 'lapses' => (int)($st['lapses'] ?? 0)];
            }
        }
        shuffle($pool);
        // vencidas primero, después nuevas, el resto al final
        usort($pool, fn($a, $b) => ($a['new'] <=> $b['new']));
        $total = count($pool);
        return ['items' => array_slice($pool, 0, $limit), 'total' => $total];
    }

    private static function supuestos(): array
    {
        $state = Quiz::stateMap();
        $items = [];
        foreach (Content::supuestos() as $s) {
            $seen = $ok = $ko = 0;
            foreach ($s['questions'] as $q) {
                $st = $state[$q['id']] ?? null;
                if ($st && (int)$st['seen'] > 0) {
                    $seen++;
                    $ok += (int)$st['n_ok'];
                    $ko += (int)$st['n_ko'];
                }
            }
            $items[] = [
                'id' => $s['id'], 'title' => $s['title'], 'block' => $s['block'], 'topics' => $s['topics'],
                'n' => count($s['questions']), 'seen' => $seen, 'acc' => $ok + $ko > 0 ? round(100 * $ok / ($ok + $ko), 1) : null,
            ];
        }
        return ['items' => $items];
    }

    // ------------------------------------------------------------------ búsqueda

    private static function search(string $raw): array
    {
        $q = trim($raw);
        if (mb_strlen_safe($q) < 2) {
            return ['q' => $q, 'results' => []];
        }
        $tokens = array_values(array_filter(preg_split('/\s+/u', Content::fold($q)) ?: [], fn($t) => $t !== ''));
        $hit = fn(string $text) => self::hasAll(Content::fold($text), $tokens);
        $res = [];

        foreach (Content::topics() as $t) {
            if ($hit($t['title'] . ' ' . $t['short'])) {
                $res[] = ['type' => 'tema', 'title' => "Tema {$t['global']}: {$t['short']}", 'text' => $t['blockTitle'], 'href' => "#/tema/{$t['id']}"];
            }
        }
        $n = 0;
        foreach (Content::topics() as $tid => $t) {
            foreach (preg_split('/\R/u', Content::notes($tid)) ?: [] as $line) {
                if (strlen($line) > 8 && $hit($line)) {
                    $res[] = ['type' => 'apuntes', 'title' => "Tema {$t['global']}: {$t['short']}", 'text' => self::clip($line, 200), 'href' => "#/tema/$tid"];
                    if (++$n >= 25) {
                        break 2;
                    }
                    break;
                }
            }
        }
        $n = 0;
        foreach (Content::glossary() as $g) {
            if ($hit($g['t'] . ' ' . $g['d'])) {
                $res[] = ['type' => 'glosario', 'title' => $g['t'], 'text' => self::clip($g['d'], 220), 'href' => '#/glosario?q=' . rawurlencode($g['t'])];
                if (++$n >= 12) {
                    break;
                }
            }
        }
        $n = 0;
        foreach (Content::cheats() as $c) {
            foreach (preg_split('/\R/u', $c['md']) ?: [] as $line) {
                if (strlen($line) > 4 && $hit($line)) {
                    $res[] = ['type' => 'chuleta', 'title' => $c['title'], 'text' => self::clip($line, 200), 'href' => '#/chuleta/' . $c['slug']];
                    if (++$n >= 10) {
                        break 2;
                    }
                    break;
                }
            }
        }
        $n = 0;
        foreach (Content::allQuestions() as $qq) {
            if ($hit($qq['q'] . ' ' . implode(' ', $qq['o']))) {
                $tid = $qq['topic'] ?? '';
                $res[] = [
                    'type' => 'pregunta', 'title' => self::clip($qq['q'], 160),
                    'text' => 'Correcta: ' . $qq['o'][$qq['a']], 'href' => $tid ? "#/tema/$tid" : '#/supuestos',
                ];
                if (++$n >= 15) {
                    break;
                }
            }
        }
        return ['q' => $q, 'results' => $res];
    }

    /** @param string[] $tokens */
    private static function hasAll(string $folded, array $tokens): bool
    {
        foreach ($tokens as $t) {
            if (!str_contains($folded, $t)) {
                return false;
            }
        }
        return $tokens !== [];
    }

    private static function clip(string $s, int $n): string
    {
        $s = trim(preg_replace('/\s+/u', ' ', $s) ?? '');
        return preg_match('/^.{0,' . $n . '}(?=\s|$)/su', $s, $m) && strlen($m[0]) < strlen($s) ? $m[0] . '…' : $s;
    }

    // ------------------------------------------------------- copia de seguridad

    private const TABLES = ['settings', 'qstate', 'answers', 'cstate', 'creviews', 'exams', 'topics', 'reports', 'plan_done'];

    private static function export(): array
    {
        $out = ['app' => 'tai', 'version' => 1, 'exported' => date('c'), 'tables' => []];
        foreach (self::TABLES as $t) {
            $out['tables'][$t] = Db::all("SELECT * FROM $t");
        }
        return $out;
    }

    private static function import(): array
    {
        $data = self::$body;
        if (($data['app'] ?? '') !== 'tai' || !is_array($data['tables'] ?? null)) {
            throw new ApiError(400, 'El archivo no es una copia de seguridad de TAI');
        }
        $n = 0;
        Db::tx(function () use ($data, &$n) {
            foreach (self::TABLES as $t) {
                $cols = array_column(Db::all("PRAGMA table_info($t)"), 'name');
                Db::run("DELETE FROM $t");
                foreach ((array)($data['tables'][$t] ?? []) as $row) {
                    $row = array_intersect_key((array)$row, array_flip($cols));
                    if (!$row) {
                        continue;
                    }
                    $names = array_keys($row);
                    Db::run(
                        "INSERT INTO $t(" . implode(',', $names) . ') VALUES(' . implode(',', array_fill(0, count($names), '?')) . ')',
                        array_values($row)
                    );
                    $n++;
                }
            }
        });
        return ['ok' => true, 'rows' => $n];
    }
}

/** strlen UTF-8 sin exigir mbstring. */
function mb_strlen_safe(string $s): int
{
    return preg_match_all('/./su', $s) ?: 0;
}
