const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
function clip(kind = 'video', track = 0, start = '0', end = '100', extra = {}) {
  return Object.assign({ kind, track, start, end, in: '0', out: C.sub(end, start), name: 'Ajuste', disabled: false,
    adjustment: kind === 'video', speed: 1, reversed: 0, components: [['Motion', 3], ['Transform', 7]] }, extra);
}
const track = (clips = [], extra = {}) => Object.assign({ clips, muted: false, transitions: [] }, extra);
const empty = () => ({ video: [], audio: [], transitions: [] });

test('ticks acima de 2^53 mantêm precisão exata', () => {
  assert.equal(C.add('9007199254740993', '1'), '9007199254740994');
  assert.equal(C.sub('9007199254740993', '9007199254740992'), '1');
  assert.equal(C.add('-99999999999999999999', '1'), '-99999999999999999998');
});
test('aritmética decimal cobre sinais/zeros e rejeita NaN', () => {
  for (let a = -30; a < 30; a++) for (let b = -30; b < 30; b++) {
    assert.equal(C.add(String(a), String(b)), String(a + b));
    assert.equal(C.sub(String(a), String(b)), String(a - b));
    assert.equal(Math.sign(C.cmp(String(a), String(b))), Math.sign(a - b));
  }
  assert.equal(C.tick('-0000'), '0');
  ['1.2', 'NaN', '1e6', '', null].forEach(x => assert.throws(() => C.tick(x)));
});
test('intervalos semiabertos aceitam cortes encostados', () => {
  assert.equal(C.overlap(clip('video', 0, '0', '100'), clip('video', 0, '100', '200')), false);
  assert.equal(C.overlap(clip('video', 0, '0', '100'), clip('video', 0, '99', '200')), true);
});
test('vídeo acima do último ocupado; áudio abaixo do último ocupado', () => {
  const existing = { video: [track([clip()]), track([clip('video', 1)])], audio: [track([clip('audio')])], transitions: [] };
  const p = C.plan([clip('video', 4), clip('audio', 7)], '0', '0', existing);
  assert.deepEqual(p.placements.map(x => x.track), [2, 1]);
});
test('detecta obstáculo depois do playhead, durante o pacote', () => {
  const s = { video: [track([]), track([clip('video', 1, '80', '200')])], audio: [], transitions: [] };
  assert.equal(C.plan([clip()], '0', '0', s).placements[0].track, 2);
});
test('silêncio/gap entre partes do pacote também é protegido', () => {
  const s = { video: [track([clip('video', 0, '40', '60')])], audio: [], transitions: [] };
  const p = C.plan([clip('video', 0, '0', '20'), clip('video', 0, '80', '100')], '0', '0', s);
  assert.deepEqual(p.placements.map(x => x.track), [1, 1]);
});
test('preserva ordem das camadas, compactando faixas vazias', () => {
  const p = C.plan([clip('video', 11), clip('video', 2), clip('audio', 5), clip('audio', 1)], '0', '0', empty());
  assert.deepEqual(p.placements.map(x => x.track), [1, 0, 1, 0]);
});
test('reutiliza faixas livres sem criar faixas a cada clique', () => {
  const s = { video: [track([clip()]), track([]), track([])], audio: [track([])], transitions: [] };
  const p = C.plan([clip()], '0', '0', s);
  assert.equal(p.placements[0].track, 1);
});
test('ignora faixa mutada e trata clipe desativado como ocupado', () => {
  const s = { video: [track([clip('video', 0, '0', '100', { disabled: true })]), track([], { muted: true }), track([])], audio: [], transitions: [] };
  assert.equal(C.plan([clip()], '0', '0', s).placements[0].track, 2);
});
test('âncora interna do playhead e offsets de áudio preservados', () => {
  const clips = [clip('video', 0, '100', '200'), clip('audio', 0, '80', '120')];
  assert.equal(C.anchor(clips, '110'), '110');
  assert.equal(C.anchor(clips, '1000'), '80');
  const p = C.plan(clips, '110', '1000', empty());
  assert.deepEqual(p.expected.map(x => x.start), ['990', '970']);
});
test('não trunca pacote que começa antes de zero', () => {
  assert.throws(() => C.plan([clip()], '50', '10', empty()), /antes/);
});
test('transições na faixa destino e fora do intervalo do clipe protegem a faixa', () => {
  const transition = { kind: 'video', track: 1, start: '140', end: '180' };
  const s = { video: [track([]), track([], { transitions: [transition] })], audio: [], transitions: [transition] };
  const p = C.plan([clip()], '0', '0', s, false, [{ kind: 'video', track: 0, start: '90', end: '150' }]);
  assert.equal(p.placements[0].track, 2);
  assert.equal(p.span.end, '150');
});
test('verificação detecta overwrite, ripple, truncamento, duplicação e extra vinculado', () => {
  const before = { video: [track([clip()])], audio: [], transitions: [] }, expected = [clip('video', 1)];
  const good = { video: [track([clip()]), track(expected)], audio: [], transitions: [] };
  assert(C.verify(before, good, expected));
  const bad = JSON.parse(JSON.stringify(good)); bad.video[0].clips[0].end = '50';
  assert(!C.verify(before, bad, expected));
  bad.video[0].clips = []; assert(!C.verify(before, bad, expected));
  const ripple = JSON.parse(JSON.stringify(good)); ripple.video[0].clips[0].start = '100';
  assert(!C.verify(before, ripple, expected));
  good.audio = [track([clip('audio')])]; assert(!C.verify(before, good, expected));
});
test('verificação exige mesmos componentes, speed e ajuste', () => {
  const before = empty(), expected = [clip()];
  const s = { video: [track([clip()])], audio: [], transitions: [] };
  s.video[0].clips[0].components = []; assert(!C.verify(before, s, expected));
});
test('limites contra seleção vazia, duração zero e faixa inválida', () => {
  assert.throws(() => C.bounds([])); assert.throws(() => C.bounds([clip('video', -1)]));
  assert.throws(() => C.bounds([clip('video', 0, '0', '0')]));
});
test('checksum UTF8 e nomes com acento, sem path como ID', () => {
  assert.equal(C.textChecksum('Transições'), C.checksum(Buffer.from('Transições')));
  assert.equal(C.name('  Explosão  '), 'Explosão'); assert.throws(() => C.name(''));
});
test('mil planejamentos aleatórios não colidem nem ficam abaixo/acima do ocupado', () => {
  let seed = 41; const rnd = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let n = 0; n < 1000; n++) {
    const s = empty();
    for (const kind of ['video', 'audio']) for (let i = 0, count = rnd(8); i < count; i++) {
      const clips = []; for (let j = 0, len = rnd(4); j < len; j++) { const start = rnd(1000); clips.push(clip(kind, i, String(start), String(start + 10 + rnd(200)))); }
      s[kind].push(track(clips));
    }
    const p = C.plan([clip('video'), clip('audio')], '0', String(rnd(700)), s);
    p.expected.forEach(c => {
      s[c.kind].forEach((t, i) => { if (t.clips.some(x => C.overlap(x, p.span))) assert(c.track > i); });
      assert(!(s[c.kind][c.track] || track()).clips.some(x => C.overlap(x, c)));
    });
  }
});
module.exports = { clip, track, empty };
