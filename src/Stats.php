<?php
declare(strict_types=1);

namespace Tai;

/** Agregados de progreso por tema/bloque, actividad diaria e histórico de simulacros. */
final class Stats
{
    /**
     * @return array<string,array<string,mixed>> tema => métricas
     */
    public static function topics(): array
    {
        $today = State::today();
        $state = Quiz::stateMap();
        $cstate = [];
        foreach (Db::all('SELECT cid,due,reps FROM cstate') as $r) {
            $cstate[$r['cid']] = $r;
        }
        $status = [];
        foreach (Db::all('SELECT topic,status FROM topics') as $r) {
            $status[$r['topic']] = $r['status'];
        }

        $out = [];
        foreach (Content::topics() as $tid => $t) {
            $qs = Content::questions($tid);
            $total = count($qs);
            $seen = $ok = $ko = $mastered = $due = $wrongNow = 0;
            $score = 0.0;
            foreach ($qs as $q) {
                $st = $state[$q['id']] ?? null;
                if (!$st || (int)$st['seen'] === 0) {
                    continue;
                }
                $seen++;
                $ok += (int)$st['n_ok'];
                $ko += (int)$st['n_ko'];
                $m = Srs::mastered($st['last'] === null ? null : (int)$st['last'], (float)$st['ivl'], (int)$st['reps']);
                if ($m) {
                    $mastered++;
                    $score += 1.0;
                } elseif ($st['last'] !== null && (int)$st['last'] === 1) {
                    $score += 0.6;
                } elseif ($st['last'] !== null) {
                    $score += 0.15;
                    $wrongNow++;
                } else {
                    $score += 0.2;
                }
                if ($st['due'] !== null && $st['due'] <= $today) {
                    $due++;
                }
            }
            $cards = Content::cards($tid);
            $cDue = $cSeen = 0;
            foreach ($cards as $c) {
                if (isset($cstate[$c['id']])) {
                    $cSeen++;
                    if ($cstate[$c['id']]['due'] !== null && $cstate[$c['id']]['due'] <= $today) {
                        $cDue++;
                    }
                }
            }
            $att = $ok + $ko;
            $out[$tid] = [
                'q' => $total, 'seen' => $seen, 'ok' => $ok, 'ko' => $ko,
                'acc' => $att > 0 ? round(100 * $ok / $att, 1) : null,
                'mastered' => $mastered, 'wrong' => $wrongNow, 'due' => $due,
                'mastery' => $total > 0 ? round(100 * $score / $total) : 0,
                'cards' => count($cards), 'cardsSeen' => $cSeen, 'cardsDue' => $cDue,
                'status' => $status[$tid] ?? 'pendiente',
                'notes' => Content::notes($tid) !== '',
            ];
        }
        return $out;
    }

    /** @return array{questions:int,cards:int} pendientes de repaso hoy */
    public static function dueCounts(): array
    {
        $today = State::today();
        $valid = Content::allQuestions();
        $q = 0;
        foreach (Db::all('SELECT qid FROM qstate WHERE seen > 0 AND due IS NOT NULL AND due <= ?', [$today]) as $r) {
            if (isset($valid[$r['qid']]) && !isset($valid[$r['qid']]['sup'])) {
                $q++;
            }
        }
        $c = 0;
        $cards = Content::allCards();
        foreach (Db::all('SELECT cid FROM cstate WHERE due IS NOT NULL AND due <= ?', [$today]) as $r) {
            if (isset($cards[$r['cid']])) {
                $c++;
            }
        }
        return ['questions' => $q, 'cards' => $c];
    }

    /** @return array<string,mixed> */
    public static function overview(int $days = 120): array
    {
        $from = date('Y-m-d', strtotime('-' . ($days - 1) . ' day'));
        $daily = [];
        foreach (Db::all(
            'SELECT day, COUNT(*) n, SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) ok, SUM(ms) ms FROM answers WHERE day >= ? GROUP BY day',
            [$from]
        ) as $r) {
            $daily[$r['day']] = ['q' => (int)$r['n'], 'ok' => (int)$r['ok'], 'c' => 0, 'ms' => (int)$r['ms']];
        }
        foreach (Db::all('SELECT day, COUNT(*) n FROM creviews WHERE day >= ? GROUP BY day', [$from]) as $r) {
            $daily[$r['day']] ??= ['q' => 0, 'ok' => 0, 'c' => 0, 'ms' => 0];
            $daily[$r['day']]['c'] = (int)$r['n'];
        }
        ksort($daily);

        $exams = [];
        foreach (Db::all(
            "SELECT id,kind,title,started,finished,result FROM exams WHERE finished IS NOT NULL ORDER BY finished DESC LIMIT 60"
        ) as $r) {
            $res = json_decode((string)$r['result'], true) ?: [];
            $exams[] = [
                'id' => (int)$r['id'], 'kind' => $r['kind'], 'title' => $r['title'], 'finished' => (int)$r['finished'],
                'total' => $res['total'] ?? null, 'points' => $res['points'] ?? null, 'passed' => $res['passed'] ?? null,
                'p1' => isset($res['p1']) ? ['pct' => $res['p1']['pct'], 'points' => $res['p1']['points']] : null,
                'p2' => isset($res['p2']) ? ['pct' => $res['p2']['pct'], 'points' => $res['p2']['points']] : null,
            ];
        }
        $tot = Db::one('SELECT COUNT(*) n, SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) ok, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) ko, SUM(ms) ms FROM answers');
        $today = State::today();
        $todayRow = $daily[$today] ?? ['q' => 0, 'ok' => 0, 'c' => 0, 'ms' => 0];
        return [
            'daily' => $daily, 'exams' => $exams, 'streak' => State::streak(),
            'totals' => [
                'answers' => (int)$tot['n'], 'ok' => (int)$tot['ok'], 'ko' => (int)$tot['ko'], 'ms' => (int)$tot['ms'],
                'distinct' => (int)Db::val('SELECT COUNT(*) FROM qstate WHERE seen > 0'),
                'bank' => count(Content::allQuestions()),
                'cardReviews' => (int)Db::val('SELECT COUNT(*) FROM creviews'),
            ],
            'today' => $todayRow,
        ];
    }
}
