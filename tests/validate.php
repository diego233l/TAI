<?php
declare(strict_types=1);

/**
 * Validador del contenido de estudio. Uso:  php tests/validate.php [--quiet]
 * Sale con código 1 si hay errores (formato roto, duplicados, referencias a temas inexistentes…).
 * Es solo una herramienta de edición: no forma parte del despliegue.
 */

require __DIR__ . '/../src/bootstrap.php';

use Tai\Content;

$quiet = in_array('--quiet', $argv, true);
$errors = [];
$warnings = [];
$topics = Content::topics();
if (!$topics) {
    fwrite(STDERR, "content/temario.json vacío o ilegible\n");
    exit(1);
}

// ---- Preguntas de tema
$ids = [];
$stems = [];
$rows = [];
$letters = [0, 0, 0, 0];
foreach (glob(TAI_CONTENT . '/preguntas/*.txt') ?: [] as $f) {
    $tid = basename($f, '.txt');
    if (!isset($topics[$tid])) {
        $errors[] = "preguntas/$tid.txt: el tema «$tid» no existe en temario.json";
        continue;
    }
    $errs = [];
    $qs = Content::parseQuestions((string)file_get_contents($f), $tid, $errs, "preguntas/$tid.txt");
    array_push($errors, ...$errs);
    $dist = [0, 0, 0, 0];
    foreach ($qs as $q) {
        if (isset($ids[$q['id']])) {
            $errors[] = "preguntas/$tid.txt:{$q['line']}: id duplicado «{$q['id']}» (también en {$ids[$q['id']]})";
        }
        $ids[$q['id']] = "$tid:{$q['line']}";
        $norm = preg_replace('/\s+/u', ' ', Content::fold($q['q']));
        if (isset($stems[$norm])) {
            $errors[] = "preguntas/$tid.txt:{$q['line']}: enunciado repetido (también en {$stems[$norm]})";
        }
        $stems[$norm] = "$tid:{$q['line']}";
        if ($q['e'] === '') {
            $warnings[] = "preguntas/$tid.txt:{$q['line']}: sin explicación";
        }
        if ($q['ref'] === '') {
            $warnings[] = "preguntas/$tid.txt:{$q['line']}: sin referencia (@)";
        }
        foreach ($q['o'] as $o) {
            if (strlen($o) > 400) {
                $warnings[] = "preguntas/$tid.txt:{$q['line']}: opción muy larga";
            }
        }
        $dist[$q['a']]++;
        $letters[$q['a']]++;
    }
    $rows[$tid] = ['q' => count($qs), 'dist' => $dist];
}

// ---- Supuestos
$sup = ['b3' => 0, 'b4' => 0];
foreach (glob(TAI_CONTENT . '/supuestos/*.txt') ?: [] as $f) {
    $id = basename($f, '.txt');
    $errs = [];
    $s = Content::parseSupuesto((string)file_get_contents($f), $id, $errs, "supuestos/$id.txt");
    array_push($errors, ...$errs);
    if (!$s) {
        continue;
    }
    if (!in_array($s['block'], ['b3', 'b4'], true)) {
        $errors[] = "supuestos/$id.txt: @block debe ser b3 o b4";
    }
    foreach ($s['topics'] as $t) {
        if (!isset($topics[$t])) {
            $errors[] = "supuestos/$id.txt: tema inexistente «$t» en @topics";
        }
    }
    if (count($s['questions']) < 4) {
        $warnings[] = "supuestos/$id.txt: tiene menos de 4 preguntas";
    }
    foreach ($s['questions'] as $q) {
        if (isset($ids[$q['id']])) {
            $errors[] = "supuestos/$id.txt:{$q['line']}: id duplicado «{$q['id']}»";
        }
        $ids[$q['id']] = "$id:{$q['line']}";
        $norm = preg_replace('/\s+/u', ' ', Content::fold($q['q']));
        if (isset($stems[$norm])) {
            $errors[] = "supuestos/$id.txt:{$q['line']}: enunciado repetido (también en {$stems[$norm]})";
        }
        $stems[$norm] = "$id:{$q['line']}";
        if ($q['e'] === '') {
            $warnings[] = "supuestos/$id.txt:{$q['line']}: sin explicación";
        }
        $letters[$q['a']]++;
    }
    if (isset($sup[$s['block']])) {
        $sup[$s['block']] += count($s['questions']);
    }
}

// ---- Tarjetas
$cardTotal = 0;
$cardSeen = [];
foreach (glob(TAI_CONTENT . '/tarjetas/*.txt') ?: [] as $f) {
    $tid = basename($f, '.txt');
    if (!isset($topics[$tid])) {
        $errors[] = "tarjetas/$tid.txt: el tema «$tid» no existe";
        continue;
    }
    foreach (preg_split('/\R/u', (string)file_get_contents($f)) ?: [] as $n => $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '//') || str_starts_with($line, '#')) {
            continue;
        }
        if (!str_contains($line, ' :: ')) {
            $errors[] = "tarjetas/$tid.txt:" . ($n + 1) . ': falta el separador « :: »';
        }
    }
    $cards = Content::cards($tid);
    $cardTotal += count($cards);
    foreach ($cards as $c) {
        if (isset($cardSeen[$c['id']])) {
            $errors[] = "tarjetas/$tid.txt: tarjeta duplicada «" . substr($c['f'], 0, 50) . '»';
        }
        $cardSeen[$c['id']] = true;
    }
    $rows[$tid]['c'] = count($cards);
}

// ---- Apuntes
foreach ($topics as $tid => $t) {
    $md = Content::notes($tid);
    $rows[$tid]['w'] = preg_match_all('/\pL+/u', $md);
    if ($md !== '' && substr_count($md, "\n```") % 2 !== 0 && !str_ends_with(trim($md), '```')) {
        $warnings[] = "temas/$tid.md: bloques de código sin cerrar";
    }
    if ($md !== '' && preg_match('/\]\((?!https?:|#\/|mailto:)[^)]*\)/', $md, $m)) {
        $warnings[] = "temas/$tid.md: enlace no permitido: {$m[0]}";
    }
}

// ---- Glosario
$terms = [];
foreach (Content::glossary() as $g) {
    $k = Content::fold($g['t']);
    if (isset($terms[$k])) {
        $warnings[] = "glosario.txt: término repetido «{$g['t']}»";
    }
    $terms[$k] = true;
}

// ---- Normativa
foreach (Content::normativa() as $i => $n) {
    foreach ($n['topics'] ?? [] as $t) {
        if (!isset($topics[$t])) {
            $errors[] = "normativa.json[$i]: tema inexistente «$t»";
        }
    }
    if (empty($n['title'])) {
        $errors[] = "normativa.json[$i]: falta title";
    }
    if (!empty($n['url']) && !preg_match('#^https://#', $n['url'])) {
        $errors[] = "normativa.json[$i]: url debe ser https";
    }
}

// ---- Informe
if (!$quiet) {
    printf("%-6s %-52s %6s %5s %5s  %s\n", 'Tema', 'Título', 'Palab.', 'Preg.', 'Tarj.', 'a/b/c/d');
    $tq = $tc = $tw = 0;
    foreach ($topics as $tid => $t) {
        $r = $rows[$tid] ?? ['q' => 0, 'c' => 0, 'w' => 0, 'dist' => [0, 0, 0, 0]];
        $r += ['q' => 0, 'c' => 0, 'w' => 0, 'dist' => [0, 0, 0, 0]];
        printf("%-6s %-52s %6d %5d %5d  %s\n", $tid, mb_substr_safe($t['short'], 52), $r['w'], $r['q'], $r['c'], implode('/', $r['dist']));
        $tq += $r['q'];
        $tc += $r['c'];
        $tw += $r['w'];
    }
    printf("%-59s %6d %5d %5d\n", 'TOTAL temas', $tw, $tq, $tc);
    printf("Supuestos: Bloque III %d preguntas · Bloque IV %d preguntas · %d supuestos\n", $sup['b3'], $sup['b4'], count(Content::supuestos()));
    printf("Banco total: %d preguntas · respuestas correctas a/b/c/d = %s · glosario: %d entradas · chuletas: %d\n",
        count($ids), implode('/', $letters), count(Content::glossary()), count(Content::cheats()));
}
foreach ($errors as $e) {
    echo "ERROR: $e\n";
}
if (!$quiet) {
    foreach (array_slice($warnings, 0, 40) as $w) {
        echo "aviso: $w\n";
    }
    if (count($warnings) > 40) {
        echo 'aviso: … y ' . (count($warnings) - 40) . " más\n";
    }
}
echo $errors ? "\n" . count($errors) . " error(es)\n" : "\nContenido válido (" . count($warnings) . " avisos)\n";
exit($errors ? 1 : 0);

function mb_substr_safe(string $s, int $n): string
{
    return preg_match('/^.{0,' . $n . '}/su', $s, $m) ? $m[0] : $s;
}
