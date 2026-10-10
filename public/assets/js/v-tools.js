// Herramientas: subredes (calculadora + entrenador), bases numéricas, RAID, nota del examen y transferencia.
import { h, icon, num, toast } from './dom.js';
import { S, settings } from './state.js';

const TOOLS = [
  ['subredes', 'Calculadora de subredes IPv4', 'Red, broadcast, rango de hosts, máscara, binario y división en subredes.', 'wrench'],
  ['entrenador', 'Entrenador de subnetting', 'Ejercicios aleatorios con corrección paso a paso: red, broadcast, hosts, máscara…', 'target'],
  ['bases', 'Conversor de bases y complemento a 2', 'Decimal, binario, octal y hexadecimal; enteros con signo.', 'zap'],
  ['raid', 'Calculadora RAID', 'Capacidad útil y tolerancia a fallos de RAID 0, 1, 5, 6 y 10.', 'layers'],
  ['nota', 'Calculadora de nota del examen', 'Aciertos y errores → nota directa y puntos estimados de cada parte.', 'trophy'],
  ['transferencia', 'Tiempos de transferencia y unidades', 'Tamaño y ancho de banda → tiempo; KB vs KiB.', 'timer'],
];

export async function herramientas(ctx) {
  const id = ctx.params[0];
  const tool = { subredes, entrenador, bases, raid, nota, transferencia }[id];
  if (!tool) {
    return h('div', null, h('h1', null, 'Herramientas'), h('p', { class: 'muted' }, 'Útiles para el supuesto práctico del Bloque IV y para practicar cálculos que se repiten en los exámenes.'),
      h('div', { class: 'grid g-auto' }, TOOLS.map(([k, t, d, ic]) => h('a', { class: 'topic-card', href: '#/herramientas/' + k, style: { '--c': 'var(--primary)' } }, h('div', { class: 'row' }, icon(ic), h('h3', null, t)), h('p', { class: 'muted small mb0' }, d)))));
  }
  const meta = TOOLS.find((t) => t[0] === id);
  return h('div', null, h('div', { class: 'row mb' }, h('a', { class: 'btn ghost sm', href: '#/herramientas' }, icon('back'), 'Herramientas')), h('h1', null, meta[1]), tool());
}

// ---------------------------------------------------------------- IPv4
const ip2n = (s) => {
  const p = String(s).trim().split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const x of p) { if (!/^\d{1,3}$/.test(x) || +x > 255) return null; n = n * 256 + +x; }
  return n;
};
const n2ip = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
const maskOf = (p) => (p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0);
const prefixOfMask = (m) => { const inv = (~m) >>> 0; return (inv & (inv + 1)) === 0 || inv === 0xFFFFFFFF ? 32 - Math.log2(inv + 1) : null; };
const bin32 = (n) => (n >>> 0).toString(2).padStart(32, '0');

export function subnetInfo(ip, p) {
  const m = maskOf(p), net = (ip & m) >>> 0, bc = (net | (~m >>> 0)) >>> 0, total = 2 ** (32 - p);
  let hosts = total - 2, first = net + 1, last = bc - 1;
  if (p === 31) { hosts = 2; first = net; last = bc; } else if (p === 32) { hosts = 1; first = net; last = net; }
  const a = ip >>> 24;
  const cls = a < 128 ? 'A' : a < 192 ? 'B' : a < 224 ? 'C' : a < 240 ? 'D (multicast)' : 'E (reservada)';
  const inR = (base, bits) => ((ip & maskOf(bits)) >>> 0) === (base >>> 0);
  const kind = inR(ip2n('10.0.0.0'), 8) || inR(ip2n('172.16.0.0'), 12) || inR(ip2n('192.168.0.0'), 16) ? 'Privada (RFC 1918)'
    : inR(ip2n('127.0.0.0'), 8) ? 'Loopback' : inR(ip2n('169.254.0.0'), 16) ? 'Link-local / APIPA' : inR(ip2n('100.64.0.0'), 10) ? 'CGNAT (RFC 6598)'
      : a >= 224 && a < 240 ? 'Multicast' : a >= 240 ? 'Reservada' : a === 0 ? '“Esta red”' : 'Pública';
  return { m, net, bc, hosts, first, last, cls, kind, total, wild: (~m) >>> 0 };
}

function parseCidr(txt) {
  const t = txt.trim().replace(/\s+/g, ' ');
  let m = /^(\d+\.\d+\.\d+\.\d+)\s*\/\s*(\d{1,2})$/.exec(t);
  if (m) { const ip = ip2n(m[1]); const p = +m[2]; return ip == null || p > 32 ? null : { ip, p }; }
  m = /^(\d+\.\d+\.\d+\.\d+)\s+(?:\/(\d{1,2})|(\d+\.\d+\.\d+\.\d+))$/.exec(t);
  if (m) {
    const ip = ip2n(m[1]);
    if (ip == null) return null;
    if (m[2] != null) return +m[2] <= 32 ? { ip, p: +m[2] } : null;
    const mk = ip2n(m[3]); if (mk == null) return null;
    const p = prefixOfMask(mk); return p == null ? null : { ip, p };
  }
  return null;
}

function subredes() {
  const out = h('div'), split = h('div');
  const input = h('input', { type: 'text', value: '192.168.10.130/26', placeholder: '192.168.1.0/24  ó  10.0.0.5 255.255.0.0', 'aria-label': 'Dirección IP con prefijo o máscara', style: { fontFamily: 'var(--mono)' } });
  const nsub = h('input', { type: 'number', min: 2, max: 4096, value: 4, style: { width: '7rem' } });
  const nhost = h('input', { type: 'number', min: 1, max: 1000000, value: 50, style: { width: '7rem' } });

  const calc = () => {
    const r = parseCidr(input.value);
    if (!r) { out.replaceChildren(h('div', { class: 'callout ko' }, 'Formato no válido. Ejemplos: 192.168.1.10/24 · 10.0.0.5 255.255.255.0')); split.replaceChildren(); return; }
    const s = subnetInfo(r.ip, r.p);
    const bits = (n) => { const b = bin32(n).match(/.{8}/g); let c = 0; return b.map((o) => o.split('').map((ch) => { const cls = c++ < r.p ? 'net' : 'host'; return h('span', { class: cls }, ch); })); };
    const dotted = (n) => bin32(n).match(/.{8}/g).map((o, i) => h('span', { style: { marginRight: '.7rem' } }, o));
    const bitRow = (n) => { const b = bin32(n).match(/.{8}/g); let c = 0; return b.map((o) => h('span', { style: { marginRight: '.7rem', display: 'inline-block' } }, o.split('').map((ch) => h('span', { class: c++ < r.p ? 'net' : 'host' }, ch)))); };
    out.replaceChildren(h('div', { class: 'card' },
      h('dl', { class: 'kv' },
        h('dt', null, 'Dirección'), h('dd', null, n2ip(r.ip) + '/' + r.p),
        h('dt', null, 'Máscara'), h('dd', null, n2ip(s.m)), h('dt', null, 'Wildcard'), h('dd', null, n2ip(s.wild)),
        h('dt', null, 'Red'), h('dd', null, n2ip(s.net)), h('dt', null, 'Broadcast'), h('dd', null, n2ip(s.bc)),
        h('dt', null, 'Primer host'), h('dd', null, n2ip(s.first)), h('dt', null, 'Último host'), h('dd', null, n2ip(s.last)),
        h('dt', null, 'Hosts útiles'), h('dd', null, s.hosts.toLocaleString('es-ES') + (r.p >= 31 ? ' (caso especial /' + r.p + ')' : ` (2^${32 - r.p} − 2)`)),
        h('dt', null, 'Clase'), h('dd', null, s.cls), h('dt', null, 'Tipo'), h('dd', null, s.kind)),
      h('h3', { class: 'mt' }, 'Binario (', h('span', { class: 'bits' }, h('span', { class: 'net' }, 'red'), ' / ', h('span', { class: 'host' }, 'host')), ')'),
      h('div', { class: 'bits' }, h('div', null, 'IP      ', bitRow(r.ip)), h('div', null, 'Máscara ', bitRow(s.m)), h('div', null, 'Red     ', bitRow(s.net)))));
    drawSplit(r, s);
  };

  const drawSplit = (r) => {
    const rows = (p2, label) => {
      const sz = 2 ** (32 - p2), base = (r.ip & maskOf(r.p)) >>> 0, count = 2 ** (p2 - r.p), show = Math.min(count, 16);
      const trs = [];
      for (let i = 0; i < show; i++) { const net = base + i * sz, bc = net + sz - 1; trs.push(h('tr', null, h('td', null, i + 1), h('td', { class: 'mono' }, n2ip(net) + '/' + p2), h('td', { class: 'mono' }, p2 >= 31 ? n2ip(net) + ' – ' + n2ip(bc) : n2ip(net + 1) + ' – ' + n2ip(bc - 1)), h('td', { class: 'mono' }, n2ip(bc)))); }
      return h('div', { class: 'mt' }, h('p', null, label, ` ${count} subredes de /${p2} (${Math.max(0, sz - 2)} hosts útiles cada una)${count > 16 ? ' · se muestran las 16 primeras' : ''}.`),
        h('div', { class: 'scroll-x' }, h('table', { class: 't' }, h('thead', null, h('tr', null, ['#', 'Subred', 'Rango de hosts', 'Broadcast'].map((x) => h('th', null, x)))), h('tbody', null, trs))));
    };
    const doSplit = (mode) => {
      let p2;
      if (mode === 'n') { const n = Math.max(2, +nsub.value || 2); p2 = r.p + Math.ceil(Math.log2(n)); }
      else { const hh = Math.max(1, +nhost.value || 1); p2 = 32 - Math.ceil(Math.log2(hh + 2)); }
      if (p2 > 32 || p2 < r.p) { holder.replaceChildren(h('div', { class: 'callout ko' }, 'No es posible con esa red (el prefijo resultante queda fuera de rango).')); return; }
      holder.replaceChildren(rows(p2, mode === 'n' ? `Para ${nsub.value} subredes necesitas ${p2 - r.p} bits más:` : `Para ${nhost.value} hosts por subred necesitas /${p2}:`));
    };
    const holder = h('div');
    split.replaceChildren(h('div', { class: 'card mt' }, h('h3', null, 'Dividir en subredes'),
      h('div', { class: 'row' }, h('label', null, 'Nº de subredes ', nsub), h('button', { class: 'btn sm', onclick: () => doSplit('n') }, 'Calcular'),
        h('span', { class: 'muted' }, 'ó'), h('label', null, 'Hosts por subred ', nhost), h('button', { class: 'btn sm', onclick: () => doSplit('h') }, 'Calcular')), holder));
  };

  input.addEventListener('input', calc);
  calc();
  return h('div', null, h('div', { class: 'card' }, h('div', { class: 'field mb0' }, h('label', null, 'IP con prefijo o máscara'), input,
    h('span', { class: 'hint' }, 'Admite 192.168.1.10/24, 10.0.0.1 /8 y 172.16.5.9 255.255.240.0'))), out, split);
}

// ------------------------------------------------------------ entrenador
function rndInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randomIp() {
  const t = rndInt(0, 2);
  const ip = t === 0 ? [10, rndInt(0, 255), rndInt(0, 255), rndInt(1, 254)] : t === 1 ? [172, rndInt(16, 31), rndInt(0, 255), rndInt(1, 254)] : [192, 168, rndInt(0, 255), rndInt(1, 254)];
  return ip2n(ip.join('.'));
}
function genExercise() {
  const type = ['red', 'broadcast', 'hosts', 'mascara', 'misma', 'prefijo'][rndInt(0, 5)];
  const ip = randomIp();
  if (type === 'red' || type === 'broadcast') {
    const p = rndInt(17, 29), s = subnetInfo(ip, p), want = type === 'red' ? s.net : s.bc;
    return { q: `¿Cuál es la dirección de ${type === 'red' ? 'red' : 'broadcast'} de ${n2ip(ip)}/${p}?`, a: n2ip(want), kind: 'text',
      why: `Máscara ${n2ip(s.m)}. Red = IP AND máscara = ${n2ip(s.net)}. Broadcast = red OR wildcard (${n2ip(s.wild)}) = ${n2ip(s.bc)}. Tamaño de bloque: ${2 ** (32 - p)}.` };
  }
  if (type === 'hosts') { const p = rndInt(16, 30); return { q: `¿Cuántos hosts útiles tiene una red /${p}?`, a: String(2 ** (32 - p) - 2), kind: 'text', why: `2^(32−${p}) − 2 = ${2 ** (32 - p)} − 2 = ${2 ** (32 - p) - 2}.` }; }
  if (type === 'mascara') { const p = rndInt(9, 30); return { q: `¿Qué máscara en notación decimal corresponde a /${p}?`, a: n2ip(maskOf(p)), kind: 'text', why: `${p} unos seguidos: ${bin32(maskOf(p)).match(/.{8}/g).join('.')} = ${n2ip(maskOf(p))}.` }; }
  if (type === 'misma') {
    const p = rndInt(20, 28), s = subnetInfo(ip, p), same = Math.random() < 0.5;
    const other = same ? s.net + rndInt(1, Math.max(1, s.total - 2)) : (s.net + s.total + rndInt(0, 3)) >>> 0;
    const s2 = subnetInfo(other >>> 0, p);
    return { q: `Con máscara /${p}, ¿están ${n2ip(ip)} y ${n2ip(other >>> 0)} en la misma red?`, a: s.net === s2.net ? 'sí' : 'no', kind: 'yn',
      why: `Red de la primera: ${n2ip(s.net)}. Red de la segunda: ${n2ip(s2.net)}. ${s.net === s2.net ? 'Coinciden' : 'Son distintas'}.` };
  }
  const n = rndInt(5, 1500), p = 32 - Math.ceil(Math.log2(n + 2));
  return { q: `¿Cuál es el prefijo más largo (máscara más restrictiva) que permite al menos ${n} hosts útiles?`, a: '/' + p, kind: 'text', why: `Necesitas ${n}+2 = ${n + 2} direcciones → ${Math.ceil(Math.log2(n + 2))} bits de host → /${p} (${2 ** (32 - p) - 2} hosts útiles).` };
}

function entrenador() {
  let ex = genExercise(), ok = 0, tot = 0, streak = 0;
  const host = h('div');
  const draw = (feedback) => {
    const input = ex.kind === 'yn' ? null : h('input', { type: 'text', 'aria-label': 'Respuesta', autocomplete: 'off', style: { fontFamily: 'var(--mono)', maxWidth: '22rem' }, onkeydown: (e) => { if (e.key === 'Enter') check(e.target.value); } });
    host.replaceChildren(h('div', { class: 'card' },
      h('div', { class: 'row between mb' }, h('span', { class: 'chip primary' }, `${ok} / ${tot} correctas`), h('span', { class: 'chip warn' }, icon('flame'), `Racha ${streak}`)),
      h('p', { class: 'qtext' }, ex.q),
      feedback ? h('div', null, h('div', { class: 'callout ' + (feedback.right ? 'ok' : 'ko') }, h('strong', null, feedback.right ? '¡Correcto! ' : 'Incorrecto. '), 'Respuesta: ', h('span', { class: 'mono' }, ex.a)), h('p', { class: 'muted' }, ex.why),
        h('button', { class: 'btn primary', onclick: () => { ex = genExercise(); draw(); } }, 'Siguiente ejercicio', icon('right')))
        : ex.kind === 'yn' ? h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => check('sí') }, 'Sí'), h('button', { class: 'btn', onclick: () => check('no') }, 'No'))
          : h('div', { class: 'row' }, input, h('button', { class: 'btn primary', onclick: () => check(input.value) }, 'Comprobar'))));
    input?.focus();
  };
  const check = (v) => {
    const norm = (x) => x.trim().toLowerCase().replace(/^\/?/, ex.a.startsWith('/') ? '/' : '').replace('si', 'sí');
    const right = norm(v) === norm(ex.a);
    tot++; if (right) { ok++; streak++; } else streak = 0;
    draw({ right });
  };
  draw();
  return h('div', null, h('p', { class: 'muted' }, 'Calcula de cabeza (o con papel): en el examen no hay calculadora. Pulsa Enter para comprobar.'), host);
}

// ------------------------------------------------------------------ bases
function bases() {
  const f = {};
  const mk = (id, label, radix) => { f[id] = h('input', { type: 'text', class: 'mono', id: 'b-' + id, 'aria-label': label, autocomplete: 'off', oninput: () => fromField(id, radix) }); return h('div', { class: 'field' }, h('label', { for: 'b-' + id }, label), f[id]); };
  const fields = [mk('dec', 'Decimal', 10), mk('bin', 'Binario', 2), mk('oct', 'Octal', 8), mk('hex', 'Hexadecimal', 16)];
  const width = h('select', { onchange: () => fromField('dec', 10, true), style: { width: 'auto' } }, [8, 16, 32].map((w) => h('option', { value: w }, w + ' bits')));
  const tc = h('div', { class: 'card mt' });
  const fromField = (id, radix, keep) => {
    const raw = f[id].value.trim().replace(/\s|_/g, '');
    if (!raw) { for (const k in f) if (k !== id) f[k].value = ''; tc.replaceChildren(); return; }
    const valid = { 10: /^-?\d+$/, 2: /^[01]+$/, 8: /^[0-7]+$/, 16: /^[0-9a-f]+$/i }[radix];
    if (!valid.test(raw)) { for (const k in f) if (k !== id) f[k].value = '—'; tc.replaceChildren(); return; }
    let v;
    try { v = radix === 10 ? BigInt(raw) : BigInt((radix === 16 ? '0x' : radix === 8 ? '0o' : '0b') + raw); } catch { return; }
    const abs = v < 0n ? -v : v, sign = v < 0n ? '-' : '';
    if (id !== 'dec') f.dec.value = v.toString();
    if (id !== 'bin') f.bin.value = sign + abs.toString(2);
    if (id !== 'oct') f.oct.value = sign + abs.toString(8);
    if (id !== 'hex') f.hex.value = sign + abs.toString(16).toUpperCase();
    const w = BigInt(width.value), min = -(1n << (w - 1n)), max = (1n << (w - 1n)) - 1n, umax = (1n << w) - 1n;
    const fits = v >= min && v <= umax;
    const twos = fits ? (v < 0n ? (1n << w) + v : v) : null;
    tc.replaceChildren(h('div', { class: 'row between' }, h('h3', { class: 'mb0' }, 'Representación con ', width), h('span', { class: 'hint' }, `Con signo: ${min} … ${max} · Sin signo: 0 … ${umax}`)),
      twos == null ? h('p', { class: 'callout ko mt' }, 'No cabe en ese número de bits.') : h('dl', { class: 'kv mt' },
        h('dt', null, 'Complemento a 2'), h('dd', null, twos.toString(2).padStart(Number(w), '0').replace(/(.{8})(?=.)/g, '$1 ')), h('dt', null, 'Hexadecimal'), h('dd', null, '0x' + twos.toString(16).toUpperCase().padStart(Number(w) / 4, '0')),
        h('dt', null, 'Como sin signo'), h('dd', null, twos.toString()), h('dt', null, 'Como con signo'), h('dd', null, (twos > max ? twos - (1n << w) : twos).toString())));
  };
  f.dec.value = '-37'; fromField('dec', 10);
  return h('div', null, h('div', { class: 'card' }, h('div', { class: 'grid g2' }, fields), h('p', { class: 'hint mb0' }, 'Escribe en cualquier campo. Admite enteros grandes y negativos.')), tc,
    h('div', { class: 'callout mt' }, h('strong', null, 'Recuerda: '), 'complemento a 2 = invertir los bits y sumar 1. Rango con n bits: −2^(n−1) … 2^(n−1)−1. Con 8 bits: −128…127.'));
}

// ------------------------------------------------------------------- RAID
function raid() {
  const level = h('select', { onchange: calc }, [['0', 'RAID 0 (striping)'], ['1', 'RAID 1 (espejo)'], ['5', 'RAID 5 (paridad distribuida)'], ['6', 'RAID 6 (doble paridad)'], ['10', 'RAID 10 (espejo + striping)']].map(([v, l]) => h('option', { value: v, selected: v === '5' || null }, l)));
  const n = h('input', { type: 'number', min: 2, max: 64, value: 4, oninput: calc });
  const size = h('input', { type: 'number', min: 0.1, step: 0.1, value: 4, oninput: calc });
  const out = h('div', { class: 'card mt' });
  function calc() {
    const L = level.value, N = +n.value, S = +size.value, min = { 0: 2, 1: 2, 5: 3, 6: 4, 10: 4 }[L];
    if (N < min || (L === '10' && N % 2)) { out.replaceChildren(h('div', { class: 'callout ko' }, `RAID ${L} necesita al menos ${min} discos${L === '10' ? ' y un número par' : ''}.`)); return; }
    const usable = { 0: N * S, 1: S, 5: (N - 1) * S, 6: (N - 2) * S, 10: (N / 2) * S }[L];
    const tol = { 0: '0 discos (cualquier fallo pierde todo)', 1: `${N - 1} discos`, 5: '1 disco', 6: '2 discos', 10: '1 disco por cada espejo (mínimo 1, hasta ' + N / 2 + ' si son de pares distintos)' }[L];
    out.replaceChildren(h('dl', { class: 'kv' }, h('dt', null, 'Capacidad bruta'), h('dd', null, num(N * S, 2) + ' TB'), h('dt', null, 'Capacidad útil'), h('dd', null, num(usable, 2) + ' TB'),
      h('dt', null, 'Eficiencia'), h('dd', null, num((100 * usable) / (N * S), 1) + ' %'), h('dt', null, 'Tolerancia a fallos'), h('dd', { style: { fontFamily: 'inherit' } }, tol), h('dt', null, 'Mínimo de discos'), h('dd', null, min)));
  }
  calc();
  return h('div', null, h('div', { class: 'card' }, h('div', { class: 'grid g3' }, h('div', { class: 'field mb0' }, h('label', null, 'Nivel'), level), h('div', { class: 'field mb0' }, h('label', null, 'Nº de discos'), n), h('div', { class: 'field mb0' }, h('label', null, 'Tamaño por disco (TB)'), size))), out,
    h('div', { class: 'callout mt' }, 'RAID no es una copia de seguridad: protege frente a fallos de disco, no frente a borrados, ransomware o corrupción lógica.'));
}

// -------------------------------------------------------------------- nota
function nota() {
  const cut = h('input', { type: 'number', min: 30, max: 95, value: settings().cut_pct, oninput: calc });
  const F = (v) => h('input', { type: 'number', min: 0, value: v, oninput: calc });
  const a1 = F(55), e1 = F(12), a2 = F(14), e2 = F(3);
  const out = h('div', { class: 'card mt' });
  const part = (ok, ko, total, c) => {
    c = Math.max(30, c); const direct = ok - ko / 3, min = (total * c) / 100;
    const pts = direct <= 0 ? 0 : direct < min ? 25 * direct / min : 25 + 25 * (direct - min) / (total - min);
    return { direct, min, pts: Math.min(50, pts), pass: direct >= min, pct: Math.max(0, 100 * direct / total) };
  };
  function calc() {
    const c = +cut.value || 50;
    const p1 = part(+a1.value || 0, +e1.value || 0, 80, c), p2 = part(+a2.value || 0, +e2.value || 0, 20, c);
    const row = (t, p, tot) => h('div', { class: 'card flat' }, h('strong', null, t), h('dl', { class: 'kv mt' }, h('dt', null, 'Nota directa'), h('dd', null, num(p.direct, 2) + ' / ' + tot), h('dt', null, 'Porcentaje'), h('dd', null, num(p.pct, 1) + ' %'),
      h('dt', null, 'Corte (directa)'), h('dd', null, num(p.min, 1)), h('dt', null, 'Puntos estimados'), h('dd', null, num(p.pts, 1) + ' / 50'), h('dt', null, 'Resultado'), h('dd', null, p.pass ? '✔ supera el corte' : '✘ por debajo del corte')));
    out.replaceChildren(h('div', { class: 'grid g2' }, row('Parte 1 · 80 preguntas', p1, 80), row('Parte 2 · 20 preguntas', p2, 20)),
      h('div', { class: 'mt center' }, h('div', { class: 'score-big' }, num(p1.pts + p2.pts, 1), h('small', { class: 'muted', style: { fontSize: '1.1rem' } }, ' / 100')), h('span', { class: 'chip ' + (p1.pass && p2.pass ? 'ok' : 'ko') }, p1.pass && p2.pass ? 'Apto (estimado)' : 'No apto (estimado)')));
  }
  calc();
  return h('div', null, h('div', { class: 'card' }, h('div', { class: 'grid g4' },
    h('div', { class: 'field mb0' }, h('label', null, 'P1 · aciertos'), a1), h('div', { class: 'field mb0' }, h('label', null, 'P1 · errores'), e1), h('div', { class: 'field mb0' }, h('label', null, 'P2 · aciertos'), a2), h('div', { class: 'field mb0' }, h('label', null, 'P2 · errores'), e2)),
    h('div', { class: 'field mt mb0', style: { maxWidth: '16rem' } }, h('label', null, 'Corte supuesto (% de la directa)'), cut)), out,
    h('div', { class: 'callout mt' }, 'Reglas: error = −1/3, blanco = 0. Cada parte vale 50 puntos y hay que llegar a 25 en ambas. El Tribunal fija la directa mínima (≥ 30 % de la máxima). La conversión es una estimación lineal a tramos.'));
}

// ---------------------------------------------------------- transferencia
function transferencia() {
  const U = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4 };
  const size = h('input', { type: 'number', min: 0, step: 'any', value: 4.7, oninput: calc });
  const su = h('select', { onchange: calc }, Object.keys(U).map((u) => h('option', { value: u, selected: u === 'GB' || null }, u)));
  const bw = h('input', { type: 'number', min: 0, step: 'any', value: 100, oninput: calc });
  const bu = h('select', { onchange: calc }, [['kbps', 1e3], ['Mbps', 1e6], ['Gbps', 1e9]].map(([u, v]) => h('option', { value: v, selected: u === 'Mbps' || null }, u)));
  const eff = h('input', { type: 'number', min: 1, max: 100, value: 90, oninput: calc });
  const out = h('div', { class: 'card mt' });
  function calc() {
    const bits = (+size.value || 0) * U[su.value] * 8, rate = (+bw.value || 0) * +bu.value * ((+eff.value || 100) / 100);
    if (!rate) { out.replaceChildren(); return; }
    const s = bits / rate, d = (x) => { const hh = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), ss = Math.round(x % 60); return `${hh ? hh + ' h ' : ''}${m || hh ? m + ' min ' : ''}${ss} s`; };
    out.replaceChildren(h('div', { class: 'stat' }, h('span', { class: 'l' }, 'Tiempo estimado'), h('span', { class: 'v' }, d(s))), h('p', { class: 'hint mb0 mt' }, `${num(bits / 8 / 1e6, 2)} MB a ${num(rate / 1e6, 2)} Mbps efectivos. Recuerda: 1 byte = 8 bits.`));
  }
  calc();
  return h('div', null, h('div', { class: 'card' }, h('div', { class: 'grid g3' },
    h('div', { class: 'field mb0' }, h('label', null, 'Tamaño'), h('div', { class: 'row nowrap' }, size, su)), h('div', { class: 'field mb0' }, h('label', null, 'Ancho de banda'), h('div', { class: 'row nowrap' }, bw, bu)), h('div', { class: 'field mb0' }, h('label', null, 'Eficiencia (%)'), eff))), out,
    h('div', { class: 'card mt' }, h('h3', null, 'Prefijos decimales (SI) vs binarios (IEC)'), h('div', { class: 'scroll-x' }, h('table', { class: 't' }, h('thead', null, h('tr', null, ['Decimal', 'Bytes', 'Binario', 'Bytes'].map((x) => h('th', null, x)))),
      h('tbody', null, [['KB', '10³ = 1 000', 'KiB', '2¹⁰ = 1 024'], ['MB', '10⁶', 'MiB', '2²⁰ = 1 048 576'], ['GB', '10⁹', 'GiB', '2³⁰ = 1 073 741 824'], ['TB', '10¹²', 'TiB', '2⁴⁰']].map((r) => h('tr', null, r.map((x) => h('td', null, x)))))))));
}
