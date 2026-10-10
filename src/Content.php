<?php
declare(strict_types=1);

namespace Tai;

/**
 * Lee el contenido de estudio (content/) directamente del repositorio.
 *
 * Formato de preguntas (content/preguntas/<tema>.txt):
 *
 *   ? Enunciado (puede ocupar varias líneas y llevar bloques ``` de código)
 *   a) Opción
 *   b) Opción
 *   c) Opción
 *   d) Opción
 *   = c                  <- letra correcta
 *   > Explicación (varias líneas con '>')
 *   @ Ref: CE art. 53    <- referencia normativa / fuente
 *   ~ fijo               <- opcional: no barajar las opciones (p. ej. «a y b son correctas»)
 *
 * El id de una pregunta es el hash de su enunciado (estable mientras no se edite el
 * texto). Para conservar el progreso al editarla, fija un id: «?#mi-id Enunciado…».
 */
final class Content
{
    /** @var array<string,mixed> */
    private static array $memo = [];

    // ---------------------------------------------------------------- utilidades

    private static function memo(string $key, callable $build): mixed
    {
        if (!array_key_exists($key, self::$memo)) {
            self::$memo[$key] = $build();
        }
        return self::$memo[$key];
    }

    /** Minúsculas sin acentos (sin depender de mbstring/intl). */
    public static function fold(string $s): string
    {
        static $map = null;
        $map ??= [
            'á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a', 'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e',
            'í' => 'i', 'ì' => 'i', 'ï' => 'i', 'î' => 'i', 'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o',
            'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'û' => 'u', 'ñ' => 'n', 'ç' => 'c',
            'Á' => 'a', 'À' => 'a', 'Ä' => 'a', 'Â' => 'a', 'É' => 'e', 'È' => 'e', 'Ë' => 'e', 'Ê' => 'e',
            'Í' => 'i', 'Ì' => 'i', 'Ï' => 'i', 'Î' => 'i', 'Ó' => 'o', 'Ò' => 'o', 'Ö' => 'o', 'Ô' => 'o',
            'Ú' => 'u', 'Ù' => 'u', 'Ü' => 'u', 'Û' => 'u', 'Ñ' => 'n', 'Ç' => 'c',
        ];
        return strtolower(strtr($s, $map));
    }

    private static function readJson(string $rel): array
    {
        $f = TAI_CONTENT . '/' . $rel;
        if (!is_file($f)) {
            return [];
        }
        $d = json_decode((string)file_get_contents($f), true);
        if (!is_array($d)) {
            throw new \RuntimeException("JSON inválido en content/$rel: " . json_last_error_msg());
        }
        return $d;
    }

    // ------------------------------------------------------------------- temario

    public static function temario(): array
    {
        return self::memo('temario', fn() => self::readJson('temario.json'));
    }

    /** @return array<string,array<string,mixed>> id => tema (con 'block' y 'blockTitle') */
    public static function topics(): array
    {
        return self::memo('topics', function () {
            $out = [];
            foreach (self::temario()['bloques'] ?? [] as $b) {
                foreach ($b['topics'] as $t) {
                    $t['block'] = $b['id'];
                    $t['blockNum'] = $b['num'];
                    $t['blockTitle'] = $b['title'];
                    $t['practico'] = (bool)$b['practico'];
                    $out[$t['id']] = $t;
                }
            }
            return $out;
        });
    }

    public static function topic(string $id): ?array
    {
        return self::topics()[$id] ?? null;
    }

    public static function notes(string $tid): string
    {
        if (!preg_match('/^b\dt\d+$/', $tid)) {
            return '';
        }
        $f = TAI_CONTENT . "/temas/$tid.md";
        return is_file($f) ? (string)file_get_contents($f) : '';
    }

    public static function normativa(): array
    {
        return self::memo('normativa', fn() => self::readJson('normativa.json'));
    }

    // ----------------------------------------------------------------- preguntas

    /** @return array<int,array<string,mixed>> */
    public static function questions(string $tid): array
    {
        return self::memo("q:$tid", function () use ($tid) {
            if (!preg_match('/^b\dt\d+$/', $tid)) {
                return [];
            }
            $f = TAI_CONTENT . "/preguntas/$tid.txt";
            if (!is_file($f)) {
                return [];
            }
            $errors = [];
            $qs = self::parseQuestions((string)file_get_contents($f), $tid, $errors, "preguntas/$tid.txt");
            foreach ($qs as &$q) {
                $q['topic'] = $tid;
            }
            return $qs;
        });
    }

    /** @return array<string,array<string,mixed>> qid => pregunta (preguntas de tema + de supuestos) */
    public static function allQuestions(): array
    {
        return self::memo('allq', function () {
            $idx = [];
            foreach (array_keys(self::topics()) as $tid) {
                foreach (self::questions($tid) as $q) {
                    $idx[$q['id']] = $q;
                }
            }
            foreach (self::supuestos() as $s) {
                foreach ($s['questions'] as $q) {
                    $idx[$q['id']] = $q;
                }
            }
            return $idx;
        });
    }

    public static function question(string $qid): ?array
    {
        return self::allQuestions()[$qid] ?? null;
    }

    /**
     * @param array<int,string> $errors se rellena con los problemas encontrados
     * @return array<int,array<string,mixed>>
     */
    public static function parseQuestions(string $text, string $prefix, array &$errors = [], string $file = ''): array
    {
        $out = [];
        $cur = null;
        $state = 'out';
        $fence = false;
        $lastEl = '';
        $where = $file !== '' ? $file : $prefix;

        $flush = function () use (&$cur, &$out, &$errors, $prefix, $where, &$state) {
            if ($cur === null) {
                return;
            }
            $ln = $cur['line'];
            $stem = trim($cur['q']);
            $opts = $cur['o'];
            if ($stem === '') {
                $errors[] = "$where:$ln: enunciado vacío";
            } elseif (count($opts) !== 4) {
                $errors[] = "$where:$ln: la pregunta debe tener exactamente 4 opciones (tiene " . count($opts) . ')';
            } elseif ($cur['a'] === null) {
                $errors[] = "$where:$ln: falta la línea «= x» con la respuesta correcta";
            } else {
                $opts = array_map('trim', $opts);
                if (in_array('', $opts, true) || count(array_unique(array_map([self::class, 'fold'], $opts))) < 4) {
                    $errors[] = "$where:$ln: opciones vacías o repetidas";
                } else {
                    $norm = preg_replace('/\s+/u', ' ', self::fold($stem));
                    $id = $cur['id'] !== '' ? $cur['id'] : $prefix . '-' . substr(sha1((string)$norm), 0, 8);
                    $joined = implode(' | ', $opts);
                    $auto = (bool)preg_match(
                        '/\b(anteriores|ambas|ninguna de|todas las|las dos|los dos)\b|(?<![\w])[abcd]\)?\s+(y|e|o)\s+[abcd]\)?(?![\w])/iu',
                        $joined
                    );
                    $out[] = [
                        'id' => $id,
                        'q' => $stem,
                        'o' => $opts,
                        'a' => $cur['a'],
                        'e' => trim(implode("\n", $cur['e'])),
                        'ref' => trim($cur['ref']),
                        'ns' => $cur['fixed'] || $auto,
                        'd' => $cur['d'],
                        'line' => $ln,
                    ];
                }
            }
            $cur = null;
            $state = 'out';
        };

        $lines = preg_split('/\R/u', $text) ?: [];
        foreach ($lines as $n => $raw) {
            $line = rtrim($raw);
            $trim = ltrim($line);
            $ln = $n + 1;

            if (!$fence && str_starts_with($trim, '//')) {
                continue;
            }
            if (!$fence && preg_match('/^\?(?:#([\w.\-]+))?(?:\s+(.*))?$/u', $trim, $m)) {
                $flush();
                $cur = ['id' => $m[1] ?? '', 'q' => $m[2] ?? '', 'o' => [], 'a' => null, 'e' => [], 'ref' => '',
                    'fixed' => false, 'd' => 0, 'line' => $ln];
                $state = 'stem';
                $fence = false;
                $lastEl = 'q';
                continue;
            }
            if ($cur === null) {
                if ($trim !== '') {
                    $errors[] = "$where:$ln: texto fuera de una pregunta: «" . substr($trim, 0, 40) . '»';
                }
                continue;
            }
            if ($state === 'stem') {
                if (str_starts_with($trim, '```')) {
                    $fence = !$fence;
                }
                if (!$fence && preg_match('/^a\)\s+(.*)$/u', $trim, $m)) {
                    $cur['o'][] = $m[1];
                    $state = 'opts';
                    $lastEl = 'o';
                    continue;
                }
                $cur['q'] .= "\n" . $line;
                continue;
            }
            // state === 'opts'
            if ($trim === '') {
                continue;
            }
            if (preg_match('/^([a-d])\)\s+(.*)$/u', $trim, $m) && ord($m[1]) - 97 === count($cur['o'])) {
                $cur['o'][] = $m[2];
                $lastEl = 'o';
            } elseif (preg_match('/^=\s*([a-dA-D])\s*$/', $trim, $m)) {
                $cur['a'] = ord(strtolower($m[1])) - 97;
                $lastEl = '';
            } elseif ($trim[0] === '>') {
                $cur['e'][] = ltrim(substr($trim, 1));
                $lastEl = 'e';
            } elseif ($trim[0] === '@') {
                $cur['ref'] = ltrim(substr($trim, 1));
                $lastEl = 'ref';
            } elseif ($trim[0] === '~') {
                $flag = strtolower(trim(substr($trim, 1)));
                if ($flag === 'fijo') {
                    $cur['fixed'] = true;
                } elseif (ctype_digit($flag)) {
                    $cur['d'] = (int)$flag;
                }
            } else {
                // continuación de la última opción o de la explicación
                if ($lastEl === 'o') {
                    $i = count($cur['o']) - 1;
                    $cur['o'][$i] .= ' ' . $trim;
                } elseif ($lastEl === 'e') {
                    $cur['e'][count($cur['e']) - 1] .= ' ' . $trim;
                } else {
                    $errors[] = "$where:$ln: línea no reconocida: «" . substr($trim, 0, 40) . '»';
                }
            }
        }
        $flush();
        return $out;
    }

    // ------------------------------------------------------------------ supuestos

    /**
     * Supuestos prácticos (content/supuestos/*.txt). Cabecera con @title, @block, @topics,
     * enunciado entre @enunciado y @fin, y a continuación las preguntas.
     *
     * @return array<string,array<string,mixed>> id => supuesto
     */
    public static function supuestos(): array
    {
        return self::memo('supuestos', function () {
            $out = [];
            $files = glob(TAI_CONTENT . '/supuestos/*.txt') ?: [];
            sort($files);
            foreach ($files as $f) {
                $id = basename($f, '.txt');
                $errors = [];
                $s = self::parseSupuesto((string)file_get_contents($f), $id, $errors, 'supuestos/' . basename($f));
                if ($s !== null) {
                    $out[$id] = $s;
                }
            }
            return $out;
        });
    }

    /** @param array<int,string> $errors */
    public static function parseSupuesto(string $text, string $id, array &$errors = [], string $file = ''): ?array
    {
        $lines = preg_split('/\R/u', $text) ?: [];
        $meta = ['title' => $id, 'block' => '', 'topics' => []];
        $enun = [];
        $mode = 'head';
        $rest = [];
        foreach ($lines as $line) {
            if ($mode === 'head') {
                if (preg_match('/^@(title|block|topics)\s+(.+)$/u', $line, $m)) {
                    $meta[$m[1]] = $m[1] === 'topics' ? array_values(array_filter(array_map('trim', explode(',', $m[2])))) : trim($m[2]);
                } elseif (trim($line) === '@enunciado') {
                    $mode = 'enun';
                }
            } elseif ($mode === 'enun') {
                if (trim($line) === '@fin') {
                    $mode = 'qs';
                } else {
                    $enun[] = rtrim($line);
                }
            } else {
                $rest[] = $line;
            }
        }
        if ($mode !== 'qs') {
            $errors[] = ($file ?: $id) . ': faltan @enunciado / @fin';
            return null;
        }
        $qs = self::parseQuestions(implode("\n", $rest), $id, $errors, $file ?: $id);
        $topic = $meta['topics'][0] ?? '';
        foreach ($qs as &$q) {
            $q['topic'] = $topic;
            $q['sup'] = $id;
        }
        return [
            'id' => $id,
            'title' => $meta['title'],
            'block' => $meta['block'],
            'topics' => $meta['topics'],
            'enunciado' => trim(implode("\n", $enun)),
            'questions' => $qs,
        ];
    }

    // ------------------------------------------------------------------ tarjetas

    /** @return array<int,array<string,string>> */
    public static function cards(string $tid): array
    {
        return self::memo("c:$tid", function () use ($tid) {
            if (!preg_match('/^b\dt\d+$/', $tid)) {
                return [];
            }
            $f = TAI_CONTENT . "/tarjetas/$tid.txt";
            if (!is_file($f)) {
                return [];
            }
            $out = [];
            foreach (preg_split('/\R/u', (string)file_get_contents($f)) ?: [] as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '//') || str_starts_with($line, '#')) {
                    continue;
                }
                $p = strpos($line, ' :: ');
                if ($p === false) {
                    continue;
                }
                $front = trim(substr($line, 0, $p));
                $back = trim(substr($line, $p + 4));
                $out[] = [
                    'id' => $tid . '-c' . substr(sha1(self::fold($front)), 0, 8),
                    'f' => str_replace('\n', "\n", $front),
                    'b' => str_replace('\n', "\n", $back),
                    'topic' => $tid,
                ];
            }
            return $out;
        });
    }

    /** @return array<string,array<string,string>> */
    public static function allCards(): array
    {
        return self::memo('allc', function () {
            $idx = [];
            foreach (array_keys(self::topics()) as $tid) {
                foreach (self::cards($tid) as $c) {
                    $idx[$c['id']] = $c;
                }
            }
            return $idx;
        });
    }

    // ------------------------------------------------------ glosario y chuletas

    /** @return array<int,array<string,string>> */
    public static function glossary(): array
    {
        return self::memo('glosario', function () {
            $f = TAI_CONTENT . '/glosario.txt';
            if (!is_file($f)) {
                return [];
            }
            $out = [];
            $cat = 'General';
            foreach (preg_split('/\R/u', (string)file_get_contents($f)) ?: [] as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '//')) {
                    continue;
                }
                if (str_starts_with($line, '## ')) {
                    $cat = trim(substr($line, 3));
                    continue;
                }
                $p = strpos($line, ' :: ');
                if ($p === false) {
                    continue;
                }
                $out[] = ['t' => trim(substr($line, 0, $p)), 'd' => trim(substr($line, $p + 4)), 'c' => $cat];
            }
            return $out;
        });
    }

    /** @return array<int,array<string,string>> slug, title, md */
    public static function cheats(): array
    {
        return self::memo('cheats', function () {
            $files = glob(TAI_CONTENT . '/chuletas/*.md') ?: [];
            sort($files);
            $out = [];
            foreach ($files as $f) {
                $md = (string)file_get_contents($f);
                $slug = preg_replace('/^\d+-/', '', basename($f, '.md'));
                $title = $slug;
                if (preg_match('/^#\s+(.+)$/m', $md, $m)) {
                    $title = trim($m[1]);
                }
                $out[] = ['slug' => $slug, 'title' => $title, 'md' => $md];
            }
            return $out;
        });
    }
}
