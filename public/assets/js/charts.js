// Gráficos SVG propios (sin librerías): anillo, línea, barras y mapa de actividad.
import { h } from './dom.js';

export function ring(value, { size = 96, stroke = 10, label, color } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return h('svg', { class: 'ring', width: size, height: size, viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': `${Math.round(v)} %` },
    h('circle', { class: 'ring-bg', cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke }),
    h('circle', {
      class: 'ring-fg', cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke, 'stroke-linecap': 'round',
      'stroke-dasharray': c, 'stroke-dashoffset': c * (1 - v / 100), transform: `rotate(-90 ${size / 2} ${size / 2})`,
      style: color ? { stroke: color } : undefined,
    }),
    h('text', { x: size / 2, y: size / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': size * 0.24 }, label ?? Math.round(v) + '%'));
}

/** Línea con área. points: [{x:'etiqueta', y:número}] */
export function line(points, { w = 640, hgt = 220, min = 0, max = 100, unit = '', refs = [], color = 'var(--primary)' } = {}) {
  const pad = { l: 36, r: 12, t: 12, b: 26 };
  const iw = w - pad.l - pad.r, ih = hgt - pad.t - pad.b;
  const X = (i) => pad.l + (points.length < 2 ? iw / 2 : (i * iw) / (points.length - 1));
  const Y = (v) => pad.t + ih - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * ih;
  const svg = h('svg', { class: 'chart', viewBox: `0 0 ${w} ${hgt}`, width: '100%', role: 'img' });
  const ticks = 4;
  for (let k = 0; k <= ticks; k++) {
    const v = min + ((max - min) * k) / ticks, y = Y(v);
    svg.append(h('line', { class: 'grid-l', x1: pad.l, x2: w - pad.r, y1: y, y2: y }), h('text', { x: pad.l - 6, y: y + 4, 'text-anchor': 'end' }, Math.round(v) + unit));
  }
  for (const r of refs) {
    svg.append(h('line', { x1: pad.l, x2: w - pad.r, y1: Y(r.y), y2: Y(r.y), stroke: r.color || 'var(--ok)', 'stroke-dasharray': '5 4', 'stroke-width': 1.5 }),
      h('text', { x: w - pad.r, y: Y(r.y) - 4, 'text-anchor': 'end', style: { fill: r.color || 'var(--ok)' } }, r.label));
  }
  if (points.length) {
    const d = points.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
    svg.append(
      h('path', { d: d + ` L${X(points.length - 1)} ${pad.t + ih} L${X(0)} ${pad.t + ih} Z`, fill: color, opacity: 0.12 }),
      h('path', { d, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    points.forEach((p, i) => svg.append(h('circle', { cx: X(i), cy: Y(p.y), r: 4, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 }, h('title', null, `${p.x}: ${p.y}${unit}`))));
    const step = Math.max(1, Math.ceil(points.length / 8));
    points.forEach((p, i) => { if (i % step === 0 || i === points.length - 1) svg.append(h('text', { x: X(i), y: hgt - 6, 'text-anchor': 'middle' }, p.x)); });
  }
  return svg;
}

/** Barras apiladas aciertos/fallos por día. */
export function bars(items, { w = 640, hgt = 200 } = {}) {
  const pad = { l: 30, r: 6, t: 8, b: 24 };
  const iw = w - pad.l - pad.r, ih = hgt - pad.t - pad.b;
  const max = Math.max(10, ...items.map((i) => i.ok + i.ko));
  const bw = iw / Math.max(items.length, 1);
  const svg = h('svg', { class: 'chart', viewBox: `0 0 ${w} ${hgt}`, width: '100%', role: 'img' });
  for (let k = 0; k <= 3; k++) {
    const v = (max * k) / 3, y = pad.t + ih - (v / max) * ih;
    svg.append(h('line', { class: 'grid-l', x1: pad.l, x2: w - pad.r, y1: y, y2: y }), h('text', { x: pad.l - 5, y: y + 4, 'text-anchor': 'end' }, Math.round(v)));
  }
  items.forEach((it, i) => {
    const x = pad.l + i * bw + bw * 0.15, ww = bw * 0.7;
    const hOk = (it.ok / max) * ih, hKo = (it.ko / max) * ih;
    svg.append(
      h('rect', { x, y: pad.t + ih - hOk, width: ww, height: hOk, fill: 'var(--ok)', rx: 2 }, h('title', null, `${it.label}: ${it.ok} aciertos, ${it.ko} fallos`)),
      h('rect', { x, y: pad.t + ih - hOk - hKo, width: ww, height: hKo, fill: 'var(--ko)', rx: 2 }));
    if (i % Math.max(1, Math.ceil(items.length / 10)) === 0) svg.append(h('text', { x: x + ww / 2, y: hgt - 6, 'text-anchor': 'middle' }, it.label));
  });
  return svg;
}

/** Mapa de actividad estilo calendario. daily: {'YYYY-MM-DD': n} */
export function heatmap(daily, { weeks = 26, today = new Date() } = {}) {
  const cell = 14, gap = 3, w = weeks * (cell + gap) + 30, hgt = 7 * (cell + gap) + 18;
  const svg = h('svg', { class: 'heat', viewBox: `0 0 ${w} ${hgt}`, width: '100%', role: 'img', 'aria-label': 'Actividad diaria' });
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dow = (end.getDay() + 6) % 7; // lunes = 0
  const start = new Date(end); start.setDate(end.getDate() - dow - (weeks - 1) * 7);
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  ['L', 'X', 'V'].forEach((l, k) => svg.append(h('text', { x: 0, y: 18 + k * 2 * (cell + gap) + cell - 3, style: { fontSize: '10px', fill: 'var(--muted)' } }, l)));
  let lastMonth = -1;
  for (let wk = 0; wk < weeks; wk++) {
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start); dt.setDate(start.getDate() + wk * 7 + d);
      if (dt > end) continue;
      const k = iso(dt), n = daily[k] || 0;
      const lvl = n === 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4;
      svg.append(h('rect', { class: 'h' + lvl, x: 22 + wk * (cell + gap), y: 14 + d * (cell + gap), width: cell, height: cell }, h('title', null, `${k}: ${n} respuestas`)));
      if (d === 0 && dt.getMonth() !== lastMonth) {
        lastMonth = dt.getMonth();
        svg.append(h('text', { x: 22 + wk * (cell + gap), y: 9, style: { fontSize: '10px', fill: 'var(--muted)' } }, ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][lastMonth]));
      }
    }
  }
  return svg;
}
