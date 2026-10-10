<?php
declare(strict_types=1);

namespace Tai;

/** Ajustes y registro del progreso (respuestas, SRS de preguntas y tarjetas). */
final class State
{
    public const DEFAULTS = [
        'exam_date' => null,        // YYYY-MM-DD
        'study_days' => [1, 2, 3, 4, 5, 6], // 1 = lunes … 7 = domingo
        'hours_per_day' => 3,
        'daily_goal' => 30,         // preguntas al día
        'cut_pct' => 50,            // corte supuesto (Tribunal: mínimo 30 %)
        'shuffle' => true,
        'theme' => 'auto',
    ];

    /** @return array<string,mixed> */
    public static function settings(): array
    {
        $s = self::DEFAULTS;
        foreach (Db::all('SELECT k, v FROM settings') as $r) {
            if (array_key_exists($r['k'], $s)) {
                $s[$r['k']] = json_decode($r['v'], true);
            }
        }
        return $s;
    }

    /** @param array<string,mixed> $patch */
    public static function saveSettings(array $patch): array
    {
        $clean = [];
        foreach ($patch as $k => $v) {
            if (!array_key_exists($k, self::DEFAULTS)) {
                continue;
            }
            $clean[$k] = match ($k) {
                'exam_date' => ($v === null || $v === '') ? null
                    : (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$v) && strtotime((string)$v) ? (string)$v : null),
                'study_days' => array_values(array_unique(array_filter(array_map('intval', (array)$v), fn($d) => $d >= 1 && $d <= 7))) ?: [1, 2, 3, 4, 5],
                'hours_per_day' => max(0.5, min(16.0, (float)$v)),
                'daily_goal' => max(5, min(500, (int)$v)),
                'cut_pct' => max(30, min(95, (int)$v)),
                'shuffle' => (bool)$v,
                'theme' => in_array($v, ['auto', 'light', 'dark'], true) ? $v : 'auto',
            };
        }
        Db::tx(function () use ($clean) {
            foreach ($clean as $k => $v) {
                Db::run('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', [$k, json_encode($v)]);
            }
        });
        return self::settings();
    }

    public static function today(): string
    {
        return date('Y-m-d');
    }

    /**
     * Registra una respuesta (null = en blanco) y actualiza el calendario de repaso.
     *
     * @param array<string,mixed> $q pregunta del contenido
     * @return array{ok:?int}
     */
    public static function recordAnswer(array $q, ?int $chosen, int $ms, string $mode, ?int $examId): array
    {
        $ok = $chosen === null ? null : ($chosen === $q['a'] ? 1 : 0);
        $today = self::today();
        $exam = self::settings()['exam_date'];
        $topic = (string)($q['topic'] ?? '');

        Db::tx(function () use ($q, $chosen, $ok, $ms, $mode, $examId, $today, $exam, $topic) {
            $st = Db::one('SELECT * FROM qstate WHERE qid = ?', [$q['id']]) ?? [
                'seen' => 0, 'n_ok' => 0, 'n_ko' => 0, 'n_blank' => 0, 'last' => null, 'streak' => 0,
                'reps' => 0, 'ease' => 2.5, 'ivl' => 0, 'due' => null, 'flagged' => 0, 'note' => '',
            ];
            $quality = $ok === null ? Srs::Q_BLANK : ($ok === 1 ? Srs::Q_GOOD : Srs::Q_FAIL);
            $n = Srs::next($st, $quality, $today, $exam);
            $last = $ok === null ? $st['last'] : $ok;
            $streak = $ok === 1 ? (int)$st['streak'] + 1 : ($ok === 0 ? 0 : (int)$st['streak']);
            Db::run(
                'INSERT INTO qstate(qid,topic,seen,n_ok,n_ko,n_blank,last,streak,reps,ease,ivl,due,flagged,note,updated)
                 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                 ON CONFLICT(qid) DO UPDATE SET topic=excluded.topic, seen=excluded.seen, n_ok=excluded.n_ok, n_ko=excluded.n_ko,
                   n_blank=excluded.n_blank, last=excluded.last, streak=excluded.streak, reps=excluded.reps, ease=excluded.ease,
                   ivl=excluded.ivl, due=excluded.due, updated=excluded.updated',
                [
                    $q['id'], $topic, (int)$st['seen'] + 1,
                    (int)$st['n_ok'] + ($ok === 1 ? 1 : 0), (int)$st['n_ko'] + ($ok === 0 ? 1 : 0), (int)$st['n_blank'] + ($ok === null ? 1 : 0),
                    $last, $streak, $n['reps'], $n['ease'], $n['ivl'], $n['due'], (int)$st['flagged'], (string)$st['note'], time(),
                ]
            );
            Db::run(
                'INSERT INTO answers(ts,day,qid,topic,chosen,ok,ms,mode,exam_id) VALUES(?,?,?,?,?,?,?,?,?)',
                [time(), $today, $q['id'], $topic, $chosen, $ok, max(0, min(600000, $ms)), $mode, $examId]
            );
        });
        return ['ok' => $ok];
    }

    /** Valoración de una tarjeta: 1 otra vez, 2 difícil, 3 bien, 4 fácil. */
    public static function gradeCard(array $card, int $grade): array
    {
        $grade = max(1, min(4, $grade));
        $quality = [1 => Srs::Q_FAIL, 2 => Srs::Q_HARD, 3 => Srs::Q_GOOD, 4 => Srs::Q_EASY][$grade];
        $today = self::today();
        $exam = self::settings()['exam_date'];
        return Db::tx(function () use ($card, $grade, $quality, $today, $exam) {
            $st = Db::one('SELECT * FROM cstate WHERE cid = ?', [$card['id']]) ?? ['reps' => 0, 'lapses' => 0, 'ease' => 2.5, 'ivl' => 0, 'due' => null];
            $n = Srs::next($st, $quality, $today, $exam);
            Db::run(
                'INSERT INTO cstate(cid,topic,reps,lapses,ease,ivl,due,last,updated) VALUES(?,?,?,?,?,?,?,?,?)
                 ON CONFLICT(cid) DO UPDATE SET reps=excluded.reps, lapses=excluded.lapses, ease=excluded.ease, ivl=excluded.ivl,
                   due=excluded.due, last=excluded.last, updated=excluded.updated',
                [$card['id'], $card['topic'], $n['reps'], (int)$st['lapses'] + ($n['lapse'] ? 1 : 0), $n['ease'], $n['ivl'], $n['due'], $grade, time()]
            );
            Db::run('INSERT INTO creviews(ts,day,cid,topic,grade) VALUES(?,?,?,?,?)', [time(), $today, $card['id'], $card['topic'], $grade]);
            return ['due' => $n['due'], 'ivl' => $n['ivl']];
        });
    }

    /** Días consecutivos con actividad (hoy no rompe la racha si aún no se ha estudiado). */
    public static function streak(): int
    {
        $days = array_column(Db::all(
            'SELECT day FROM answers UNION SELECT day FROM creviews ORDER BY day DESC LIMIT 400'
        ), 'day');
        if (!$days) {
            return 0;
        }
        $set = array_flip($days);
        $d = self::today();
        if (!isset($set[$d])) {
            $d = date('Y-m-d', strtotime("$d -1 day"));
        }
        $n = 0;
        while (isset($set[$d])) {
            $n++;
            $d = date('Y-m-d', strtotime("$d -1 day"));
        }
        return $n;
    }
}
