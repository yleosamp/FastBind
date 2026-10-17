const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const { Host } = require('../host.js');
const Q48K = '5292000';
const clip = (kind, fields = {}) => ({ kind, track: 0, start: '0', end: '508032000000', in: '0', out: '508032000000',
  name: 'FX', disabled: false, adjustment: kind === 'video', speed: 1, reversed: 0, components: [], ...fields });
const track = clips => ({ clips, muted: false, transitions: [], opaqueTransitions: 0 });
const empty = () => ({ video: [], audio: [], transitions: [] });
// Exact timestamps from the reported native readback; names anonymized.
const requested = [
  clip('audio', { name: 'Riser', start: '93232339200', end: '385642857600', in: '173751177600', out: '466161696000' }),
  clip('audio', { name: 'Punch', start: '385642857600', end: '461923862400', in: '8475667200', out: '84756672000' })
];
const observed = [
  clip('audio', { name: 'Riser', start: '93234456000', end: '385643916000', in: '173752236000', out: '466161696000' }),
  clip('audio', { name: 'Punch', start: '385643916000', end: '461922804000', in: '8477784000', out: '84756672000' })
];
test('replay do erro real: os oito tempos nativos são previstos pela grade de 48 kHz', () => {
  const p = C.plan(requested, '0', '0', empty(), false, [], Q48K);
  assert.deepEqual(p.expected, observed);
  const after = { video: [], audio: [track(observed)], transitions: [] };
  assert.equal(C.verify(empty(), after, p.expected), true);
  assert.equal(C.verify(empty(), after, requested), false); // reproduces 0.1.2
});
test('grade é aplicada só a áudios novos; vídeo permanece com igualdade exata', () => {
  const video = clip('video', { start: '1', in: '3' });
  const p = C.plan([video, ...requested], '0', '0', empty(), false, [], Q48K);
  assert.deepEqual(p.expected[0], video);
  const before = { video: [], audio: [track([requested[0]])], transitions: [] };
  const incoming = observed.map(c => ({ ...c, track: 1 }));
  const after = { video: [], audio: [track([requested[0]]), track(incoming)], transitions: [] };
  assert(C.verify(before, after, incoming));
  after.audio[0].clips = [{ ...requested[0], start: C.add(requested[0].start, '1') }];
  assert(!C.verify(before, after, incoming)); // even ONE tick on old clip fails
});
test('não há tolerância ampla: nova cópia errada em uma amostra ainda falha', () => {
  const p = C.plan(requested, '0', '0', empty(), false, [], Q48K);
  const after = { video: [], audio: [track(observed.map(c => ({ ...c })))], transitions: [] };
  after.audio[0].clips[0].start = C.add(observed[0].start, Q48K);
  assert(!C.verify(empty(), after, p.expected));
  after.audio[0].clips = observed.map(c => ({ ...c })); after.audio[0].clips[0].speed = 2;
  assert(!C.verify(empty(), after, p.expected));
});
test('ocupação inclui arredondamento que estende o final do áudio', () => {
  const source = clip('audio', { start: '0', end: '195', in: '0', out: '195' });
  const obstacle = clip('audio', { track: 1, start: '198', end: '300' });
  const s = { video: [], audio: [track([]), track([obstacle])], transitions: [] };
  const p = C.plan([source], '0', '0', s, false, [], '10');
  assert.equal(p.expected[0].end, '200'); assert.equal(p.span.end, '200');
  assert.equal(p.placements[0].track, 2);
});
test('precisão decimal em 44,1/48/96/192 kHz e timestamps maiores que 2^53', () => {
  for (const hz of [44100, 48000, 96000, 192000]) {
    const q = String(254016000000 / hz);
    for (const text of ['0', '1', '900719925474099312345', '-900719925474099312345']) {
      const t = BigInt(text), quantum = BigInt(q), negative = t < 0n, magnitude = negative ? -t : t;
      const expected = ((magnitude + quantum / 2n) / quantum) * quantum;
      assert.equal(C.snapTicks(text, q), String(negative ? -expected : expected));
    }
  }
  assert.equal(C.snapTicks('15', '10'), '20'); assert.equal(C.snapTicks('-15', '10'), '-20');
  assert.equal(C.snapTicks('999999999999999999999', '10'), '1000000000000000000000');
});
test('grades inválidas e clipes menores que uma amostra são recusados', () => {
  for (const q of ['0', '-1', 'NaN', '1.5', '9007199254740993']) assert.throws(() => C.snapTicks('100', q));
  assert.throws(() => C.plan([clip('audio', { end: '1', out: '1' })], '0', '0', empty(), false, [], Q48K), /menor que uma amostra/);
});
test('só áudio que arredonda exatamente para a amostra zero pode cruzar o zero bruto', () => {
  const c = clip('audio', { start: '99', end: '199', in: '0', out: '100' });
  const p = C.plan([c], '100', '0', empty(), false, [], '10');
  assert.equal(p.expected[0].start, '0'); assert.equal(p.expected[0].end, '100');
  assert.equal(p.span.start, '0'); assert.equal(p.expected[0].in, '0'); assert.equal(p.expected[0].out, '100');
  assert.throws(() => C.plan([{ ...c, start: '95' }], '100', '0', empty(), false, [], '10'), /antes do início/);
  assert.throws(() => C.plan([{ ...c, kind: 'video' }], '100', '0', empty(), false, [], '10'), /antes do início/);
  assert.throws(() => C.plan([c], '100', '0', empty(), false, []), /antes do início/);
});
test('Host lê ticksPerFrame da taxa real de áudio da sequência, sem fixar 48 kHz', async () => {
  const h = new Host({}, {});
  for (const hz of [44100, 48000, 96000]) {
    const q = 254016000000 / hz;
    const seq = { getSettings: async () => ({ getAudioSampleRate: async () => ({ ticksPerFrame: q, value: hz }) }) };
    assert.equal(await h.audioQuantum(seq), String(q));
  }
  await assert.rejects(h.audioQuantum({ getSettings: async () => ({}) }), /taxa de áudio/);
  await assert.rejects(h.audioQuantum({ getSettings: async () => ({ getAudioSampleRate: async () => null }) }), /grade válida/);
});
