const { test } = require('node:test');
const assert = require('node:assert/strict');
const V = require('../view.js');
test('cor legada é estável; cor explícita e sem cor não dependem da ordem da lista', () => {
  assert.equal(V.itemColor({ id: 'same' }), V.itemColor({ id: 'same', name: 'renamed' }));
  assert(V.PALETTE.includes(V.itemColor({ id: 'legacy' })));
  assert.equal(V.itemColor({ id: 'same', color: '#aAbbCC' }), '#aAbbCC');
  assert.equal(V.itemColor({ id: 'same', color: null }), '#414141');
  assert(V.PALETTE.includes(V.itemColor({ id: 'same', color: 'red; background:url(bad)' })));
});
test('conteúdo mantém todos os clipes repetidos e separa vídeo e áudio sem editar o asset', () => {
  const item = { id: 'a', clips: [{ name: 'SHAKE', kind: 'video', adjustment: true }, { name: 'same.wav', kind: 'audio' }, { name: 'same.wav', kind: 'audio' }] };
  const before = JSON.stringify(item), groups = V.groups(item);
  assert.deepEqual(groups.map(g => g.label), ['Vídeo', 'Áudio']);
  assert.equal(groups[1].clips.length, 2); assert.equal(JSON.stringify(item), before);
});
test('MOGRT mostra arquivo sem fingir conhecer camadas internas', () => {
  const groups = V.groups({ type: 'mogrt', name: 'Titulo', file: 'C:\\Templates\\Título.mogrt' });
  assert.equal(groups.length, 1); assert.equal(groups[0].label, 'MOGRT');
  assert.equal(groups[0].clips[0].name, 'Título.mogrt');
});
test('busca encontra nome do preset ou arquivo dentro dele, sem diferenciar caixa', () => {
  const a = { name: 'HIT CRACK', clips: [{ kind: 'audio', name: 'BOOM.wav' }] };
  assert(V.matches(a, 'hit')); assert(V.matches(a, ' boom.WAV ')); assert(!V.matches(a, 'Outro'));
  assert(V.matches(a, '')); assert.equal(V.clipInfo({ kind: 'audio', track: 2 }).track, 'A3');
  assert.equal(V.clipInfo({ kind: 'video', track: 0, adjustment: true }).hint, 'Adjustment layer • V1');
});
