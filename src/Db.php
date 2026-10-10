<?php
declare(strict_types=1);

namespace Tai;

use PDO;
use RuntimeException;

/**
 * SQLite en TAI_DATA/tai.sqlite. El esquema se crea y se migra solo, de forma
 * perezosa, en la primera petición tras un `git pull` (no hay script de despliegue).
 *
 * Para cambiar el esquema: AÑADE un elemento al final de migrations(). Nunca edites
 * los existentes. PRAGMA user_version guarda cuántos se han aplicado.
 */
final class Db
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }
        if (!extension_loaded('pdo_sqlite')) {
            throw new RuntimeException('Falta la extensión pdo_sqlite de PHP (paquete php-sqlite3).');
        }
        if (!is_dir(TAI_DATA)) {
            @mkdir(TAI_DATA, 0750, true);
        }
        if (!is_dir(TAI_DATA) || !is_writable(TAI_DATA)) {
            throw new RuntimeException('El directorio de datos no existe o no es escribible: ' . TAI_DATA
                . ' (debe pertenecer a www-data).');
        }
        $pdo = new PDO('sqlite:' . TAI_DATA . '/tai.sqlite', null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec('PRAGMA busy_timeout = 8000');
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA synchronous = NORMAL');
        self::migrate($pdo);
        return self::$pdo = $pdo;
    }

    private static function migrate(PDO $pdo): void
    {
        $steps = self::migrations();
        $current = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
        if ($current >= count($steps)) {
            return;
        }
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            // Relee dentro del bloqueo: otra petición pudo migrar mientras esperábamos.
            $current = (int)$pdo->query('PRAGMA user_version')->fetchColumn();
            for ($i = $current; $i < count($steps); $i++) {
                $pdo->exec($steps[$i]);
            }
            $pdo->exec('PRAGMA user_version = ' . count($steps));
            $pdo->exec('COMMIT');
        } catch (\Throwable $e) {
            $pdo->exec('ROLLBACK');
            throw $e;
        }
    }

    /** @return string[] */
    private static function migrations(): array
    {
        return [
            // 1 — esquema inicial
            <<<'SQL'
CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);

CREATE TABLE qstate (
  qid TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  n_ok INTEGER NOT NULL DEFAULT 0,
  n_ko INTEGER NOT NULL DEFAULT 0,
  n_blank INTEGER NOT NULL DEFAULT 0,
  last INTEGER,
  streak INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  ease REAL NOT NULL DEFAULT 2.5,
  ivl REAL NOT NULL DEFAULT 0,
  due TEXT,
  flagged INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  updated INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX qstate_topic ON qstate(topic);
CREATE INDEX qstate_due ON qstate(due);

CREATE TABLE answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  qid TEXT NOT NULL,
  topic TEXT NOT NULL,
  chosen INTEGER,
  ok INTEGER,
  ms INTEGER NOT NULL DEFAULT 0,
  mode TEXT NOT NULL,
  exam_id INTEGER
);
CREATE INDEX answers_day ON answers(day);
CREATE INDEX answers_topic ON answers(topic);
CREATE INDEX answers_q ON answers(qid);

CREATE TABLE cstate (
  cid TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  ease REAL NOT NULL DEFAULT 2.5,
  ivl REAL NOT NULL DEFAULT 0,
  due TEXT,
  last INTEGER,
  updated INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX cstate_due ON cstate(due);

CREATE TABLE creviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  cid TEXT NOT NULL,
  topic TEXT NOT NULL,
  grade INTEGER NOT NULL
);
CREATE INDEX creviews_day ON creviews(day);

CREATE TABLE exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}',
  qids TEXT NOT NULL DEFAULT '[]',
  answers TEXT NOT NULL DEFAULT '{}',
  meta TEXT NOT NULL DEFAULT '{}',
  started INTEGER NOT NULL,
  duration INTEGER,
  finished INTEGER,
  result TEXT
);
CREATE INDEX exams_finished ON exams(finished);

CREATE TABLE topics (
  topic TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pendiente',
  notes TEXT NOT NULL DEFAULT '',
  updated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  qid TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'error',
  msg TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE plan_done (k TEXT PRIMARY KEY, ts INTEGER NOT NULL);
SQL,
        ];
    }

    /** @return array<int,array<string,mixed>> */
    public static function all(string $sql, array $args = []): array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($args);
        return $st->fetchAll();
    }

    /** @return array<string,mixed>|null */
    public static function one(string $sql, array $args = []): ?array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($args);
        $r = $st->fetch();
        return $r === false ? null : $r;
    }

    public static function val(string $sql, array $args = []): mixed
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($args);
        $r = $st->fetchColumn();
        return $r === false ? null : $r;
    }

    public static function run(string $sql, array $args = []): int
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($args);
        return $st->rowCount();
    }

    public static function lastId(): int
    {
        return (int)self::pdo()->lastInsertId();
    }

    private static int $depth = 0;

    /** Transacción reentrante: las llamadas anidadas se unen a la exterior. */
    public static function tx(callable $fn): mixed
    {
        $pdo = self::pdo();
        if (self::$depth > 0) {
            return $fn();
        }
        $pdo->exec('BEGIN IMMEDIATE');
        self::$depth = 1;
        try {
            $r = $fn();
            $pdo->exec('COMMIT');
            return $r;
        } catch (\Throwable $e) {
            $pdo->exec('ROLLBACK');
            throw $e;
        } finally {
            self::$depth = 0;
        }
    }
}
