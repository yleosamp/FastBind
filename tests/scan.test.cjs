const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Host } = require('../host.js');
const C = require('../core.js');
const TYPES = { CLIP: 1, TRANSITION: 2 };
function nativeClip(options = {}) {
  const c = { start: '0', end: '100', in: '0', out: '100', kind: 'video', name: 'Ajuste', selected: true, ...options };
  return { c, getStartTime: async () => ({ ticks: c.start }), getEndTime: async () => ({ ticks: c.end }),
    getInPoint: async () => ({ ticks: c.in }), getOutPoint: async () => ({ ticks: c.out }),
    getName: async () => c.name, isDisabled: async () => false, isAdjustmentLayer: async () => c.kind === 'video',
    getSpeed: async () => 1, isSpeedReversed: async () => 0, getIsSelected: async () => c.selected,
    getComponentChain: async () => ({ getComponentCount: () => 0 }) };
}
function nativeTrack(kind, clips = [], transitions = [], asyncResult = false) {
  return { name: kind, clips, transitions, isMuted: async () => false, getTrackItems(type, includeEmpty) {
    assert.equal(includeEmpty, false);
    const result = type === TYPES.CLIP ? this.clips : this.transitions;
    return asyncResult ? Promise.resolve(result) : result;
  } };
}
function nativeSequence(video = [], audio = []) {
  return { guid: 'seq', name: 'Edição', video, audio, getVideoTrackCount: async () => video.length,
    getAudioTrackCount: async () => audio.length, getVideoTrack: async i => video[i], getAudioTrack: async i => audio[i],
    getPlayerPosition: async () => ({ ticks: '0' }) };
}
function capture(original) {
  let stage, cloned = 0, saved = 0;
  const project = { guid: 'project', path: 'C:\\Test.prproj', getActiveSequence: async () => original, save: async () => { saved++; return true; } };
  const io = { preflightProject: async () => {}, copyProject: async () => ({ file: 'C:\\saved.prproj', check: 'x' }) };
  const host = new Host({ Constants: { TrackItemType: TYPES }, Project: { getActiveProject: async () => project } }, io);
  host.audioQuantum = async () => '1'; // Abstract tick fixtures; physical rates have separate regression tests.
  host.createStage = async () => { stage = nativeSequence([], []); stage.guid = 'scratch'; return stage; };
  host.organize = async () => {};
  host.restoreActive = async () => {};
  host.clone = (p, destination, sources, placements) => {
    cloned++;
    for (const placement of placements) {
      const source = sources[placement.sourceIndex].item;
      const target = placement.expected;
      while (destination[target.kind].length <= target.track) destination[target.kind].push(nativeTrack(target.kind));
      destination[target.kind][target.track].clips.push(nativeClip({ ...source.c, start: target.start, end: target.end, in: target.in, out: target.out }));
    }
  };
  return { host, get cloned() { return cloned; }, get saved() { return saved; } };
}
test('regressão getStartTime: scan real lida com null em fades, sem mock de scan', async () => {
  const sequence = nativeSequence([nativeTrack('video', [nativeClip()])], [nativeTrack('audio', [nativeClip({ kind: 'audio' })], [null, null])]);
  const h = new Host({ Constants: { TrackItemType: TYPES } }, {}), result = await h.stableScan(sequence);
  assert.equal(result.refs.length, 2); assert.equal(result.data.audio[0].opaqueTransitions, 2);
  assert.equal(result.data.transitions.length, 0);
});
test('scan aceita coleções retornadas de forma assíncrona', async () => {
  const sequence = nativeSequence([nativeTrack('video', [nativeClip()], [], true)]);
  const h = new Host({ Constants: { TrackItemType: TYPES } }, {});
  assert.equal((await h.scan(sequence)).refs.length, 1);
});
test('transição legível ainda mantém intervalo exato', async () => {
  const transition = { getStartTime: async () => ({ ticks: '10' }), getEndTime: async () => ({ ticks: '20' }) };
  const sequence = nativeSequence([nativeTrack('video', [], [transition])]);
  const h = new Host({ Constants: { TrackItemType: TYPES } }, {}), r = await h.scan(sequence);
  assert.deepEqual(r.data.transitions, [{ kind: 'video', track: 0, start: '10', end: '20' }]);
  assert.equal(r.data.video[0].opaqueTransitions, 0);
});
test('falha de getter ou duração nula de transição reserva faixa, não vira gap', async () => {
  const transitions = [{ getStartTime() { throw new Error('opaque'); }, getEndTime() {} },
    { getStartTime: async () => ({ ticks: '0' }), getEndTime: async () => ({ ticks: '0' }) }];
  const h = new Host({ Constants: { TrackItemType: TYPES } }, {});
  const r = await h.scan(nativeSequence([], [nativeTrack('audio', [], transitions)]));
  assert.equal(r.data.audio[0].opaqueTransitions, 2);
});
test('null na lista de CLIP não é ignorado nem tratado como espaço vazio', async () => {
  const f = capture(nativeSequence([nativeTrack('video', [null])]));
  await assert.rejects(f.host.saveSelection('id', 'FX', () => {}), /clipe inválido em V1/);
  assert.equal(f.cloned, 0); assert.equal(f.saved, 0);
});
test('fade em outra faixa não bloqueia captura da seleção de ajustes', async () => {
  const selected = nativeClip(), voice = nativeClip({ kind: 'audio', selected: false });
  const f = capture(nativeSequence([nativeTrack('video', [selected])], [nativeTrack('audio', [voice], [null])]));
  const item = await f.host.saveSelection('id', 'FX', () => {});
  assert.equal(item.clips.length, 1); assert.equal(item.warnings, undefined);
  assert.equal(f.cloned, 1); assert.equal(f.saved, 1);
});
test('fade opaco em faixa selecionada pede consentimento antes de qualquer escrita', async () => {
  const f = capture(nativeSequence([], [nativeTrack('audio', [nativeClip({ kind: 'audio' })], [null])]));
  let warning;
  await assert.rejects(f.host.saveSelection('id', 'SFX', () => {}), error => {
    warning = error; return error.code === 'PILHA_OPAQUE_TRANSITIONS' && !!error.approvalKey;
  });
  assert.equal(f.cloned, 0); assert.equal(f.saved, 0);
  const item = await f.host.saveSelection('id', 'SFX', () => {}, { allowOpaqueTransitions: warning.approvalKey });
  assert.equal(item.clips.length, 1); assert.equal(item.warnings.length, 1);
});
test('consentimento sobre fades é vinculado à mesma seleção, não outra', async () => {
  const source = nativeClip({ kind: 'audio' }), f = capture(nativeSequence([], [nativeTrack('audio', [source], [null])]));
  let key;
  try { await f.host.saveSelection('id', 'SFX', () => {}); } catch (error) { key = error.approvalKey; }
  source.c.end = '200'; source.c.out = '200';
  await assert.rejects(f.host.saveSelection('id', 'SFX', () => {}, { allowOpaqueTransitions: key }), e => e.code === 'PILHA_OPAQUE_TRANSITIONS');
  assert.equal(f.cloned, 0); assert.equal(f.saved, 0);
});
test('inserção nunca reutiliza uma faixa com fade sem limites conhecidos', async () => {
  const source = { kind: 'audio', track: 0, start: '0', end: '100', in: '0', out: '100' };
  const s = { video: [], audio: [{ clips: [], transitions: [], opaqueTransitions: 1 }, { clips: [], transitions: [], opaqueTransitions: 0 }], transitions: [] };
  const plan = C.plan([source], '0', '1000', s);
  assert.equal(plan.placements[0].track, 1);
  const after = JSON.parse(JSON.stringify(s)); after.audio[0].opaqueTransitions = 0;
  assert.equal(C.verify(s, after, []), false);
});
test('captura usa as faixas vazias existentes do scratch, sem exigir faixas novas', async () => {
  const sequence = nativeSequence([nativeTrack('video', [nativeClip()])], [nativeTrack('audio', [nativeClip({ kind: 'audio' })])]);
  const f = capture(sequence), originalClone = f.host.clone.bind(f.host);
  f.host.createStage = async () => {
    const stage = nativeSequence([nativeTrack('video'), nativeTrack('video'), nativeTrack('video')], [nativeTrack('audio'), nativeTrack('audio'), nativeTrack('audio')]);
    stage.guid = 'scratch'; return stage;
  };
  f.host.clone = (project, destination, sources, placements) => {
    assert.deepEqual(placements.map(p => p.track), [0, 0]);
    return originalClone(project, destination, sources, placements);
  };
  const item = await f.host.saveSelection('id', 'FX', () => {});
  assert.equal(item.clips.length, 2);
});
test('cópia divergente mantém a recusa e registra diferenças antes de limpar scratch', async () => {
  const sequence = nativeSequence([nativeTrack('video', [nativeClip()])]), f = capture(sequence);
  const originalClone = f.host.clone.bind(f.host), diagnostics = [];
  f.host.io.recordDiagnostic = async (error, scope) => diagnostics.push({ error, scope });
  f.host.clone = (project, destination, sources, placements) => {
    originalClone(project, destination, sources, placements);
    destination.video[0].clips[0].c.end = '90';
  };
  await assert.rejects(f.host.saveSelection('id', 'FX', () => {}), e => e.code === 'PILHA_CAPTURE_MISMATCH');
  assert.equal(f.saved, 0); assert.equal(diagnostics[0].scope, 'save-selection');
  assert.equal(diagnostics[0].error.evidence.missing[0].end, '100');
  assert.equal(diagnostics[0].error.evidence.unexpected[0].end, '90');
});
test('captura inteira aceita o readback físico observado dos dois áudios em 48 kHz', async () => {
  const input = [
    { name: 'Riser', start: '93232339200', end: '385642857600', in: '173751177600', out: '466161696000' },
    { name: 'Punch', start: '385642857600', end: '461923862400', in: '8475667200', out: '84756672000' }
  ];
  const readback = [
    { start: '93234456000', end: '385643916000', in: '173752236000', out: '466161696000' },
    { start: '385643916000', end: '461922804000', in: '8477784000', out: '84756672000' }
  ];
  const sequence = nativeSequence([nativeTrack('video', [nativeClip({ end: '508032000000', out: '508032000000' })])],
    [nativeTrack('audio', input.map(c => nativeClip({ ...c, kind: 'audio' })))]);
  const f = capture(sequence); delete f.host.audioQuantum;
  const create = f.host.createStage.bind(f.host);
  f.host.createStage = async (...args) => {
    const stage = await create(...args);
    stage.getSettings = async () => ({ getAudioSampleRate: async () => ({ ticksPerFrame: 5292000, value: 48000 }) });
    return stage;
  };
  f.host.clone = (project, destination, sources, placements) => {
    for (const p of placements) {
      const raw = sources[p.sourceIndex].item.c;
      const physical = raw.kind === 'audio' ? readback[input.findIndex(c => c.name === raw.name)] : {};
      while (destination[raw.kind].length <= p.track) destination[raw.kind].push(nativeTrack(raw.kind));
      // Independent native readback: do NOT generate this from plan.expected.
      destination[raw.kind][p.track].clips.push(nativeClip({ ...raw, ...physical }));
    }
  };
  const asset = await f.host.saveSelection('id', 'FX', () => {});
  assert.equal(asset.clips.length, 3); assert.equal(asset.clips[1].start, readback[0].start);
  assert.equal(f.saved, 1);
});
