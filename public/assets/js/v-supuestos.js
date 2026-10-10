// Supuestos prácticos (Parte 2 del examen: Bloques III y IV).
import { h, icon, pct } from './dom.js';
import { S, reload, startQuiz, topicById } from './state.js';

export async function supuestos() {
  await reload();
  const list = S.boot.supuestos;
  const group = (bid, title, desc) => {
    const items = list.filter((s) => s.block === bid);
    return h('div', { class: 'card' }, h('div', { class: 'block-head', style: { margin: 0 } }, h('div', { class: 'num ' + bid }, bid === 'b3' ? 'III' : 'IV'), h('div', null, h('h2', { class: 'mb0' }, title), h('span', { class: 'hint' }, desc))),
      items.length ? h('div', { class: 'mt' }, items.map((s) => h('div', { class: 'task' },
        h('div', { class: 'task-label' }, h('strong', null, s.title),
          h('div', { class: 'small muted' }, `${s.n} preguntas`, s.seen ? ` · ${s.seen} vistas${s.acc != null ? ' · ' + pct(s.acc) + ' acierto' : ''}` : ' · sin empezar',
            ' · ', s.topics.map((t) => 'T' + (topicById(t)?.global ?? '?')).join(', '))),
        h('button', { class: 'btn sm', onclick: () => startQuiz({ kind: 'supuesto', supuesto: s.id, mode: 'estudio' }) }, icon('play'), 'Estudio'),
        h('button', { class: 'btn sm', title: 'Con temporizador y corrección al final', onclick: () => startQuiz({ kind: 'supuesto', supuesto: s.id, mode: 'examen' }) }, icon('timer'), 'Examen')))) : h('p', { class: 'muted mt' }, 'Aún no hay supuestos en este bloque.'));
  };
  return h('div', null, h('h1', null, 'Supuestos prácticos'),
    h('div', { class: 'callout' }, 'La Parte 2 del examen es un supuesto práctico a elegir entre el Bloque III (desarrollo) y el Bloque IV (sistemas y comunicaciones), con 20 preguntas. Aquí practicas con enunciados completos: SQL, programación, redes, Linux, seguridad…'),
    h('div', { class: 'stack' }, group('b3', 'Bloque III · Desarrollo de sistemas', 'Bases de datos, SQL, programación, orientación a objetos, web…'),
      group('b4', 'Bloque IV · Sistemas y comunicaciones', 'Administración de sistemas, redes, TCP/IP, seguridad, virtualización…')));
}
