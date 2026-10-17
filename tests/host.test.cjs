const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Host } = require('../host.js');
const C = require('../core.js');
const { Library } = require('../library.js');

// Contract double only: this cannot prove Adobe's native clone/render behavior.
const clone = x => JSON.parse(JSON.stringify(x));
function clip(kind = 'video', track = 0, start = '0', end = '100', extra = {}) {
  return Object.assign({ kind, track, start, end, in: '0', out: C.sub(end, start), name: 'Ajuste',
    disabled: false, adjustment: kind === 'video', speed: 1, reversed: 0, components: [['Transform', 7]] }, extra);
}
const track = (clips = [], extra = {}) => Object.assign({ clips, muted: false, transitions: [] }, extra);
const snapshot = (video = [], audio = []) => ({ video, audio, transitions: [] });
class IO {
  constructor() { this.files = new Map(); this.onWrite = null; }
  async exists(n) { return this.files.has(n); }
  async readJSON(n) { if (!this.files.has(n)) throw new Error('missing'); return JSON.parse(this.files.get(n)); }
  async writeJSON(n, v) { if (this.onWrite) await this.onWrite(n, v); this.files.set(n, JSON.stringify(v)); }
}
function fixture() {
  const io = new IO(), sequence = { guid: 'edit', name: 'Edição', playhead: '0',
    state: snapshot([track([clip('video', 0, '0', '200', { name: 'MEU VIDEO' })])], [track([clip('audio', 0, '0', '200', { name: 'MINHA VOZ' })])]),
    async getPlayerPosition() { return { ticks: this.playhead }; } };
  const project = { guid: 'project', path: 'C:\\Edit.prproj', active: sequence,
    async getActiveSequence() { return this.active; },
    lockedAccess(fn) { fn(); },
    executeTransaction(fn, label) { const actions = []; fn({ addAction(a) { actions.push(a); return true; } }); actions.forEach(a => a()); this.label = label; return true; } };
  const calls = [];
  const ppro = { Project: { getActiveProject: async () => project }, TickTime: { createWithTicks: ticks => ({ ticks }) },
    SequenceEditor: { getEditor: destination => ({ createCloneTrackItemAction(item, time, v, a, align, insert) {
      calls.push({ destination, item, time, v, a, align, insert });
      return () => {
        const c = clone(item.clip); c.track += c.kind === 'video' ? v : a;
        c.start = C.add(c.start, time.ticks); c.end = C.add(c.end, time.ticks);
        while (destination.state[c.kind].length <= c.track) destination.state[c.kind].push(track());
        destination.state[c.kind][c.track].clips.push(c);
      };
    } }) } };
  const host = new Host(ppro, io);
  // Most orchestration tests use abstract 1-tick units, not physical samples.
  host.audioQuantum = async () => '1';
  host.stableScan = async seq => ({ data: clone(seq.state), refs: C.allClips(seq.state).map(c => ({ item: { clip: clone(c) }, clip: clone(c) })) });
  const source = { guid: 'template', state: snapshot([track([clip()])], [track([clip('audio')])]) };
  host.template = async () => ({ sequence: source, scan: await host.stableScan(source) });
  host.mogrtTemplate = host.template;
  return { host, project, sequence, source, io, calls, asset: { id: 'asset', type: 'selection', name: 'Zoom', anchor: '0' } };
}
test('integração simulada insere V2/A2 sem alterar os clipes anteriores', async () => {
  const f = fixture(), before = clone(f.sequence.state);
  const r = await f.host.insert(f.asset, () => {});
  assert.deepEqual(r, { count: 2, video: 1, audio: 1 });
  assert.deepEqual(f.sequence.state.video[0], before.video[0]);
  assert.deepEqual(f.sequence.state.audio[0], before.audio[0]);
  assert(f.calls.every(c => !c.insert && !c.align));
  assert.equal((await f.io.readJSON('operation.json')).phase, 'verified');
  assert.equal(f.host.review, null);
});
test('segunda inserção no mesmo lugar procura outro banco de faixas', async () => {
  const f = fixture(); await f.host.insert(f.asset, () => {});
  const r = await f.host.insert(f.asset, () => {});
  assert.equal(r.video, 2); assert.equal(r.audio, 2);
  assert.equal(C.allClips(f.sequence.state).length, 6);
});
test('MOGRT com áudio usa o mesmo planejamento seguro e não sua trilha original', async () => {
  const f = fixture(); f.asset.type = 'mogrt';
  const r = await f.host.insert(f.asset, () => {});
  assert.equal(r.video, 1); assert.equal(r.audio, 1);
});
test('falha de journal impede qualquer transação', async () => {
  const f = fixture(); f.io.onWrite = async () => { throw new Error('disco cheio'); };
  await assert.rejects(f.host.insert(f.asset, () => {}), /cheio/);
  assert.equal(f.calls.length, 0);
});
test('mudança na timeline durante a preparação cancela antes de criar ações', async () => {
  const f = fixture(); f.io.onWrite = async (n, v) => {
    if (v.phase === 'pending') f.sequence.state.video.push(track([clip('video', 1)]));
  };
  await assert.rejects(f.host.insert(f.asset, () => {}), /timeline mudou/);
  assert.equal(f.calls.length, 0); assert.equal(f.host.review, null);
  assert.equal((await f.io.readJSON('operation.json')).phase, 'cancelled');
});
test('trocar a sequência depois do journal impede aplicar em um alvo antigo', async () => {
  const f = fixture(); f.io.onWrite = async (n, v) => { if (v.phase === 'pending') f.project.active = { guid: 'outro' }; };
  await assert.rejects(f.host.insert(f.asset, () => {}), /mudou de projeto ou sequência/);
  assert.equal(f.calls.length, 0);
});
test('mover playhead durante preparação cancela sem inserir no tempo antigo', async () => {
  const f = fixture(); f.io.onWrite = async (n, v) => { if (v.phase === 'pending') f.sequence.playhead = '500'; };
  await assert.rejects(f.host.insert(f.asset, () => {}), /playhead mudou/);
  assert.equal(f.calls.length, 0);
});
test('resultado incorreto bloqueia só a sequência afetada e Undo libera automaticamente', async () => {
  const f = fixture(), before = clone(f.sequence.state), originalClone = f.host.clone.bind(f.host);
  f.host.clone = (...args) => { originalClone(...args); f.sequence.state.video[0].clips[0].end = '50'; };
  await assert.rejects(f.host.insert(f.asset, () => {}), /verificação/);
  assert.equal(f.host.review.phase, 'unverified');
  const count = f.calls.length;
  await assert.rejects(f.host.insert(f.asset, () => {}), error => error.code === 'PILHA_RECOVERY_REQUIRED');
  assert.equal(f.calls.length, count);
  const reopened = new Host(f.host.ppro, f.io); reopened.stableScan = f.host.stableScan.bind(f.host); await reopened.init();
  assert.equal(reopened.review.phase, 'unverified');
  f.sequence.state = before;
  // Premiere can retain newly created empty tracks after Undo.
  f.sequence.state.video.push(track()); f.sequence.state.audio.push(track());
  assert.equal((await reopened.reconcile()).state, 'clear'); assert.equal(reopened.review, null);
  assert.equal((await f.io.readJSON('operation.json')).phase, 'cancelled');
  assert.equal((await f.host.reconcile()).state, 'clear');
  f.host.clone = originalClone;
  await f.host.insert(f.asset, () => {});
  assert.equal(f.calls.length, count + 2);
});
test('journal antigo sem contexto ou quebrado fica registrado sem bloqueio global', async () => {
  const io = new IO(); await io.writeJSON('operation.json', { phase: 'pending' });
  let h = new Host({}, io); await h.init(); assert(h.review); assert.equal(h.recoveryState.state, 'deferred');
  io.files.set('operation.json', '{ incompleto'); h = new Host({}, io); await h.init(); assert(h.review);
  assert.equal(h.review.code, 'PILHA_CORRUPT_OPERATION');
});
test('journal verificado não cria bloqueio após reiniciar', async () => {
  const io = new IO(); await io.writeJSON('operation.json', { phase: 'verified' });
  const h = new Host({}, io); await h.init(); assert.equal(h.review, null);
});
test('falha de confirmação não pede nova inserção quando readback exato comprova o commit', async () => {
  const f = fixture(); f.io.onWrite = async (n, v) => { if (v.phase === 'verified') throw new Error('falha de confirmação'); };
  const result = await f.host.insert(f.asset, () => {});
  assert.equal(result.count, 2); assert.match(result.warning, /confirmada/);
  assert.equal(f.host.review, null);
  assert.equal(C.allClips(f.sequence.state).length, 4);
  // The durable pending record has its plan, so restart recovers without a
  // manual acknowledgement even though the confirmation could not be written.
  const reopened = new Host(f.host.ppro, f.io); reopened.stableScan = f.host.stableScan.bind(f.host); await reopened.init();
  assert.equal(reopened.review, null); assert.equal(reopened.recoveryState.state, 'clear');
});
test('recusa sem mutação é cancelada automaticamente, sem repetir a transação', async () => {
  const f = fixture(); f.project.executeTransaction = () => false;
  await assert.rejects(f.host.insert(f.asset, () => {}), /recusou/);
  assert.equal(f.host.review, null);
  assert.equal((await f.io.readJSON('operation.json')).phase, 'cancelled');
  assert.equal(C.allClips(f.sequence.state).length, 2);
});
test('erro construindo ação nativa com estado intacto não trava inserções seguintes', async () => {
  const f = fixture(), getEditor = f.host.ppro.SequenceEditor.getEditor;
  f.host.ppro.SequenceEditor.getEditor = () => ({ createCloneTrackItemAction() { throw new Error('The script object is no longer valid.'); } });
  await assert.rejects(f.host.insert(f.asset, () => {}), /no longer valid/);
  assert.equal(f.host.review, null); assert.equal((await f.io.readJSON('operation.json')).phase, 'cancelled');
  f.host.ppro.SequenceEditor.getEditor = getEditor;
  await f.host.insert(f.asset, () => {});
  assert.equal(C.allClips(f.sequence.state).length, 4);
});
test('Ctrl+Z depois de inserção verificada nunca cria bloqueio de revisão', async () => {
  const f = fixture(), before = clone(f.sequence.state);
  await f.host.insert(f.asset, () => {}); f.sequence.state = before;
  await f.host.insert(f.asset, () => {});
  assert.equal(C.allClips(f.sequence.state).length, 4); assert.equal(f.host.review, null);
});
test('crash pending sem mutação se resolve pelo estado anterior sem clonar novamente', async () => {
  const f = fixture(), before = clone(f.sequence.state);
  await f.io.writeJSON('operation.json', { phase: 'pending', date: 'crash', project: f.project.path,
    sequenceId: f.sequence.guid, before });
  await f.host.init();
  assert.equal(f.host.review, null); assert.equal(f.calls.length, 0);
  assert.equal((await f.io.readJSON('operation.json')).recovery, 'before-state-restored');
});
test('pending legado usa caminho Win32 normalizado e não confunde outro projeto', async () => {
  const f = fixture();
  await f.io.writeJSON('operation.json', { phase: 'pending', date: 'crash', project: String.raw`\\?\C:\Edit.prproj`,
    sequenceId: f.sequence.guid, before: clone(f.sequence.state) });
  await f.host.init(); assert.equal(f.host.review, null);
  await f.io.writeJSON('operation.json', { phase: 'pending', date: 'other', project: 'D:\\Other.prproj',
    sequenceId: f.sequence.guid, before: clone(f.sequence.state) });
  const h = new Host(f.host.ppro, f.io); h.stableScan = f.host.stableScan.bind(f.host); await h.init();
  assert(h.review); assert.equal(h.recoveryState.state, 'other-sequence');
});
test('falha parcial preserva pendência ao inserir em outra sequência e após reiniciar', async () => {
  const f = fixture(), original = f.sequence, before = clone(original.state), cloneNative = f.host.clone.bind(f.host);
  f.host.clone = (...args) => { cloneNative(...args); original.state.video[0].clips[0].end = '50'; };
  await assert.rejects(f.host.insert(f.asset, () => {}), /verificação/);
  const other = { ...original, guid: 'other-edit', state: before };
  f.project.active = other; f.host.clone = cloneNative;
  await f.host.insert(f.asset, () => {});
  const op = await f.io.readJSON('operation.json');
  assert.equal(op.phase, 'verified'); assert.equal(op.unresolved.length, 1); assert.equal(op.unresolved[0].sequenceId, 'edit');
  const h = new Host(f.host.ppro, f.io); h.stableScan = f.host.stableScan.bind(f.host); await h.init();
  assert.equal(h.recoveryState.state, 'other-sequence');
  f.project.active = original;
  assert.equal((await h.reconcile()).state, 'blocked');
  original.state = clone(op.unresolved[0].before);
  assert.equal((await h.reconcile()).state, 'clear');
  assert.equal((await f.io.readJSON('operation.json')).unresolved.length, 0);
});
test('Undo parcial que muda clipe antigo ou transição não é aprovado por contagem', async () => {
  const f = fixture(), before = clone(f.sequence.state);
  await f.io.writeJSON('operation.json', { phase: 'pending', projectId: f.project.guid,
    sequenceId: f.sequence.guid, date: 'partial', before });
  f.sequence.state.video[0].clips[0].end = '100';
  await f.host.init(); assert.equal(f.host.recoveryState.state, 'blocked');
  f.sequence.state = clone(before); f.sequence.state.transitions.push({ kind: 'video', track: 0, start: '0', end: '1' });
  assert.equal((await f.host.reconcile()).state, 'blocked');
  f.sequence.state = clone(before); f.sequence.state.audio[0].opaqueTransitions = 1;
  assert.equal((await f.host.reconcile()).state, 'blocked');
});
test('journal inclui plano antes da transação e fonte é relida depois da preparação', async () => {
  const f = fixture(), scan = f.host.stableScan.bind(f.host); let epoch = 0;
  f.host.stableScan = async seq => { const result = await scan(seq); result.refs.forEach(r => { r.item.epoch = epoch; }); return result; };
  f.io.onWrite = async (n, op) => { if (op.phase === 'pending') { assert.equal(op.plan.expected.length, 2); assert.deepEqual(op.expectedTransitions, []); epoch++; } };
  const nativeClone = f.host.clone.bind(f.host);
  f.host.clone = (project, destination, refs, ...rest) => {
    assert(refs.every(r => r.item.epoch === epoch)); return nativeClone(project, destination, refs, ...rest);
  };
  await f.host.insert(f.asset, () => {});
});
test('importação e journal não carregam wrapper antigo do destino para a transação', async () => {
  const f = fixture(), originalTemplate = f.host.template, initial = f.sequence;
  let prepared, final;
  f.host.template = async (...args) => {
    const result = await originalTemplate(...args);
    prepared = { ...initial }; f.project.active = prepared; return result;
  };
  f.io.onWrite = async (n, op) => { if (op.phase === 'pending') { final = { ...prepared }; f.project.active = final; } };
  await f.host.insert(f.asset, () => {});
  assert(f.calls.every(c => c.destination === final));
  assert.notEqual(initial, prepared); assert.notEqual(prepared, final);
});
test('restaurar sequência não toma foco se usuário abriu outra edição', async () => {
  const f = fixture(), ctx = await f.host.active(); f.project.active = { guid: 'manual' };
  f.project.setActiveSequence = async () => { throw new Error('não deveria chamar'); };
  await f.host.restoreActive(ctx, { guid: 'scratch' });
});
test('FastBind reutiliza pasta legada sem renomear nem duplicar a biblioteca', async () => {
  const f = fixture(), folder = { name: 'Pilha - Biblioteca', folder: true }, moved = [];
  const root = { getItems: async () => [folder], createBinAction() { assert.fail('não deve duplicar biblioteca'); },
    createMoveItemAction(item, target) { assert.equal(target, folder); return () => moved.push(item); } };
  f.project.getRootItem = async () => root;
  f.host.ppro.FolderItem = { cast: item => item.folder ? item : null };
  const item = { name: 'native project item' };
  await f.host.organize(f.project, [{ getProjectItem: async () => item }]);
  assert.deepEqual(moved, [item]); assert.equal(folder.name, 'Pilha - Biblioteca');
  assert.equal(f.project.label, 'FastBind: organizar biblioteca');
});
test('projeto sem biblioteca recebe pasta FastBind; duplicata continua recusada', async () => {
  const f = fixture(), folders = [];
  const root = { getItems: async () => folders, createBinAction(name) { return () => folders.push({ name, folder: true }); },
    createMoveItemAction() { return () => {}; } };
  f.project.getRootItem = async () => root;
  f.host.ppro.FolderItem = { cast: item => item.folder ? item : null };
  await f.host.organize(f.project, []);
  assert.equal(folders[0].name, 'FastBind - Biblioteca');
  folders.push({ name: 'FastBind - Biblioteca', folder: true });
  await assert.rejects(f.host.organize(f.project, []), /duplicada/);
});
function captureFixture() {
  const f = fixture(), originalScan = f.host.stableScan.bind(f.host);
  f.stage = { guid: 'owned-stage', name: '[Pilha id]', state: snapshot() };
  f.project.setActiveSequence = async s => { f.project.active = s; return true; };
  f.project.closeSequence = async () => true;
  f.project.deleteSequence = async s => { f.deleted = s; return true; };
  f.project.save = async () => { f.saved = true; return true; };
  f.io.preflightProject = async () => {};
  f.io.copyProject = async () => ({ file: 'C:\\payload\\saved.prproj', check: '1234:abcd' });
  f.host.stableScan = async seq => {
    const s = await originalScan(seq);
    s.refs.forEach(r => { r.item.getIsSelected = async () => true; });
    return s;
  };
  f.host.createStage = async () => f.stage;
  f.host.organize = async () => {};
  return f;
}
test('captura adjustment + áudio preserva origem e registra cópia própria', async () => {
  const f = captureFixture(), before = clone(f.sequence.state);
  const asset = await f.host.saveSelection('id', 'Meu zoom', () => {});
  assert.deepEqual(f.sequence.state, before);
  assert.equal(asset.type, 'selection'); assert.equal(asset.clips.length, 2);
  assert.equal(asset.sequenceId, 'owned-stage'); assert.equal(asset.file, 'C:\\payload\\saved.prproj');
  assert(f.saved); assert.equal(f.deleted, undefined);
});
test('recuperação de inserção não bloqueia salvar uma seleção independente', async () => {
  const f = captureFixture();
  f.host.remember({ phase: 'unverified', operationId: 'prior', date: 'partial', projectId: f.project.guid,
    sequenceId: f.sequence.guid, before: snapshot() });
  f.host.updateReview(); assert(f.host.review);
  const asset = await f.host.saveSelection('independent', 'Salvo durante recuperação', () => {});
  assert.equal(asset.clips.length, 2); assert.equal(f.host.review.operationId, 'prior');
});
test('falha ao copiar projeto remove apenas scratch criado, nunca a origem', async () => {
  const f = captureFixture(), before = clone(f.sequence.state);
  f.io.copyProject = async () => { throw new Error('cópia falhou'); };
  await assert.rejects(f.host.saveSelection('id', 'Zoom', () => {}), /cópia/);
  assert.equal(f.deleted, f.stage); assert.deepEqual(f.sequence.state, before);
});
test('projeto inacessível falha antes de criar sequência, clonar ou salvar', async () => {
  const f = captureFixture(), before = clone(f.sequence.state);
  f.project.path = String.raw`\\?\E:\! VIDEOS\TEMPLATES.prproj`;
  f.io.preflightProject = async path => { assert.equal(path, f.project.path); throw new Error('unidade indisponível'); };
  f.host.createStage = async () => { assert.fail('não deve criar scratch'); };
  await assert.rejects(f.host.saveSelection('id', 'Zoom', () => {}), /unidade indisponível/);
  assert.equal(f.calls.length, 0); assert.equal(f.saved, undefined); assert.equal(f.deleted, undefined);
  assert.deepEqual(f.sequence.state, before);
});
test('trocar de sequência durante a conferência de disco cancela a captura', async () => {
  const f = captureFixture();
  f.io.preflightProject = async () => { f.project.active = { guid: 'outra' }; };
  f.host.createStage = async () => { assert.fail('não deve criar scratch'); };
  await assert.rejects(f.host.saveSelection('id', 'Zoom', () => {}), /mudou de projeto ou sequência/);
  assert.equal(f.calls.length, 0); assert.equal(f.saved, undefined);
});

// Replay the reported session-dependent audio clone behavior. The first
// capture honors its offset; later audio clones keep the source timestamp.
// This double is NOT proof of Adobe's internal implementation.
function repeatCaptureFixture() {
  const f = captureFixture(); f.stages = []; f.captureCount = 0;
  f.host.audioQuantum = async () => '5292000';
  f.host.createStage = async () => {
    f.captureCount++;
    const stage = { guid: 'stage-' + f.captureCount, name: '[Pilha ' + f.captureCount + ']', state: snapshot() };
    f.stages.push(stage); return stage;
  };
  // Independent sample-grid readback, not generated from plan.expected.
  const sample = text => String((BigInt(text) + 2646000n) / 5292000n * 5292000n);
  f.ppro = f.host.ppro;
  f.ppro.SequenceEditor.getEditor = destination => ({ createCloneTrackItemAction(item, time, v, a, align, insert) {
    f.calls.push({ destination, time, align, insert });
    return () => {
      const c = clone(item.clip), applied = c.kind === 'audio' && f.captureCount > 1 ? '0' : time.ticks;
      c.start = C.add(c.start, applied); c.end = C.add(c.end, applied);
      if (c.kind === 'audio') for (const field of ['start', 'end', 'in', 'out']) c[field] = sample(c[field]);
      c.track += c.kind === 'video' ? v : a;
      while (destination.state[c.kind].length <= c.track) destination.state[c.kind].push(track());
      destination.state[c.kind][c.track].clips.push(c);
    };
  } });
  return f;
}
function selectPackage(f, start, end, audioExtra = {}, video = true) {
  f.sequence.state = snapshot(video ? [track([clip('video', 0, start, end)])] : [],
    [track([clip('audio', 0, start, end, audioExtra)])]);
  f.sequence.playhead = start;
}
test('regressão: salva seleções sucessivas na mesma sessão sem deslocar áudio no scratch', async () => {
  const f = repeatCaptureFixture(), library = new Library(f.io); await library.load();
  const cases = [
    { start: '2462181321600', end: '2754591840000', readStart: '2462182380000', readEnd: '2754591840000' },
    { start: '8191732348800', end: '9276617750400', readStart: '8191730232000', readEnd: '9276616692000', in: '16950276000', out: '1101836736000', video: false },
    { start: '6157572220800', end: '6589831248000', readStart: '6157570104000', readEnd: '6589831248000', in: '0', out: '432261144000' },
    { start: '5441378342400', end: '5814307699200', readStart: '5441377284000', readEnd: '5814309816000', in: '1216260360000', out: '1589187600000' }
  ];
  const assets = [];
  for (const [i, c] of cases.entries()) {
    selectPackage(f, c.start, c.end, c.in ? { in: c.in, out: c.out } : {}, c.video !== false);
    const before = clone(f.sequence.state);
    const asset = await f.host.saveSelection('asset-' + i, 'Pacote ' + i, () => {});
    await library.add(asset); assets.push(asset);
    assert.deepEqual(f.sequence.state, before); assert.equal(f.deleted, undefined);
  }
  // The last three pairs are the observed readbacks from the report. The
  // first pair is source-grid rounding, independent from the plan.
  for (const [i, c] of cases.entries()) {
    const audio = assets[i].clips.find(c => c.kind === 'audio');
    assert.equal(audio.start, c.readStart); assert.equal(audio.end, c.readEnd);
    assert.equal(assets[i].anchor, c.start);
    assert.equal(assets[i].duration, C.sub(c.end, c.start));
  }
  assert(f.calls.every(c => c.time.ticks === '0' && !c.insert && !c.align));
  const reopened = new Library(f.io); await reopened.load();
  assert.equal(reopened.profile().items.length, 4);
  assert.equal(reopened.profile().items[3].anchor, cases[3].start);
});
test('âncora absoluta do pacote novo e âncora relativa antiga planejam o mesmo destino', async () => {
  const f = repeatCaptureFixture(); selectPackage(f, '2540160000000', '5080320000000');
  f.sequence.playhead = '3810240000000';
  const asset = await f.host.saveSelection('new', 'FX', () => {});
  const origin = '2540160000000', old = { anchor: C.sub(asset.anchor, origin), clips: asset.clips.map(c => ({ ...c,
    start: C.sub(c.start, origin), end: C.sub(c.end, origin) })) };
  const destination = snapshot([track([clip('video', 0, '0', '5000000000000')])], [track([clip('audio', 0, '0', '5000000000000')])]);
  const a = C.plan(asset.clips, asset.anchor, '3000000000000', destination, false, [], '5292000');
  const b = C.plan(old.clips, old.anchor, '3000000000000', destination, false, [], '5292000');
  assert.deepEqual(a.expected, b.expected); assert.deepEqual(a.bases, { video: 1, audio: 1 });
  assert.throws(() => C.plan(asset.clips, asset.anchor, '0', snapshot(), false, [], '5292000'), /antes do início/);
});
test('captura relê objetos nativos depois de criar/configurar a sequência isolada', async () => {
  const f = captureFixture(), scan = f.host.stableScan.bind(f.host); let epoch = 0;
  f.host.stableScan = async seq => { const result = await scan(seq); result.refs.forEach(r => { r.item.epoch = epoch; }); return result; };
  f.host.createStage = async () => { epoch++; return f.stage; };
  const cloneNative = f.host.clone.bind(f.host);
  f.host.clone = (project, stage, sources, ...rest) => {
    assert(sources.every(r => r.item.epoch === epoch), 'não reutilizar wrappers anteriores à criação do scratch');
    return cloneNative(project, stage, sources, ...rest);
  };
  await f.host.saveSelection('new', 'FX', () => {});
});
test('mudança real na origem enquanto cria scratch cancela sem tentar clonar', async () => {
  const f = captureFixture();
  f.host.createStage = async () => { f.sequence.state.video[0].clips[0].name = 'EDITADO'; return f.stage; };
  await assert.rejects(f.host.saveSelection('new', 'FX', () => {}), /origem mudou/);
  assert.equal(f.calls.length, 0); assert.equal(f.saved, undefined); assert.equal(f.deleted, f.stage);
});
test('pacote não zerado com áudio arredondado antes da âncora ainda insere no início', async () => {
  const f = repeatCaptureFixture();
  selectPackage(f, '5441378342400', '5814307699200', { in: '1216260360000', out: '1589187600000' });
  const asset = await f.host.saveSelection('aligned', 'FX', () => {});
  const p = C.plan(asset.clips, asset.anchor, '0', snapshot(), false, [], '5292000');
  assert.equal(p.expected.find(c => c.kind === 'video').start, '0');
  assert.equal(p.expected.find(c => c.kind === 'audio').start, '0');
  assert.equal(p.span.start, '0');
});
test('capturas sucessivas não acumulam clipes de seleções anteriores', async () => {
  const f = repeatCaptureFixture();
  for (let i = 1; i <= 20; i++) {
    const start = String(BigInt(i) * 254016000000n), end = String(BigInt(start) + 508032000000n);
    selectPackage(f, start, end, { name: 'SFX ' + i });
    const asset = await f.host.saveSelection('capture-' + i, 'Preset ' + i, () => {});
    assert.equal(asset.clips.length, 2); assert.equal(asset.clips.find(c => c.kind === 'audio').name, 'SFX ' + i);
    assert.equal(asset.anchor, start);
  }
  assert.equal(new Set(f.stages.map(s => s.guid)).size, 20);
  assert(f.stages.every(s => C.allClips(s.state).length === 2));
});
test('reler wrappers não captura vizinhos nem troca a seleção original por outra', async () => {
  const f = captureFixture(), scan = f.host.stableScan.bind(f.host);
  f.sequence.state.video.push(track([clip('video', 1, '0', '200', { name: 'NÃO SELECIONADO' })]));
  let prepared = false;
  f.host.stableScan = async seq => {
    const result = await scan(seq);
    result.refs.forEach(r => { r.item.getIsSelected = async () => !prepared && r.clip.name === 'MINHA VOZ'; });
    return result;
  };
  f.host.createStage = async () => { prepared = true; return f.stage; };
  const asset = await f.host.saveSelection('selection', 'SFX', () => {});
  assert.deepEqual(asset.clips.map(c => c.name), ['MINHA VOZ']);
  assert.equal(f.sequence.state.video[1].clips[0].name, 'NÃO SELECIONADO');
});
test('MOGRT abre em sequência isolada e retorna à edição antes da aplicação', async () => {
  const f = fixture(), before = clone(f.sequence.state);
  delete f.host.mogrtTemplate;
  const stage = { guid: 'mogrt-scratch', state: snapshot() };
  f.io.checkPayload = async () => {};
  f.host.createStage = async () => stage;
  f.host.organize = async () => {};
  f.host.restoreActive = async (ctx, owned) => { assert.equal(owned, stage); f.restored = true; };
  f.host.ppro.SequenceEditor.getEditor = destination => ({ insertMogrtFromPath: async () => {
    assert.equal(destination, stage);
    stage.state = snapshot([track([clip()])], [track([clip('audio')])]);
    return [{}];
  } });
  const result = await f.host.mogrtTemplate(await f.host.active(), { id: 'm', file: 'C:\\x.mogrt' }, () => {});
  assert(f.restored); assert.equal(result.scan.refs.length, 2);
  assert.deepEqual(f.sequence.state, before);
});
function stampScan(state) {
  const param = { isTimeVarying: () => state.varying || false,
    getKeyframeListAsTickTimes: () => [{ ticks: '9007199254740993' }],
    getKeyframePtr: () => ({ value: { value: state.key }, getTemporalInterpolationMode: async () => state.mode || 0 }),
    getStartValue: async () => ({ value: { value: state.value } }) };
  const component = { getParamCount: () => 1, getParam: () => param, getMatchName: async () => 'Transform' };
  return { refs: [{ item: { getComponentChain: async () => ({ getComponentCount: () => 1, getComponentAtIndex: () => component }) } }] };
}
test('assinatura nativa detecta mudar valor de efeito sem alterar número de parâmetros', async () => {
  const h = new Host({}, {}), state = { value: 100 }, scan = stampScan(state);
  const a = await h.parameterStamp(scan); state.value = 200; const b = await h.parameterStamp(scan);
  assert(a.complete && b.complete); assert.notEqual(a.value, b.value);
});
test('assinatura inclui keyframes, precisão de ticks e interpolação', async () => {
  const h = new Host({}, {}), state = { value: 100, varying: true, key: 20, mode: 0 }, scan = stampScan(state);
  const a = await h.parameterStamp(scan); state.key = 30; const b = await h.parameterStamp(scan);
  state.mode = 3; const c = await h.parameterStamp(scan);
  assert.notEqual(a.value, b.value); assert.notEqual(b.value, c.value);
});
test('PointF e Color com campos nativos não enumeráveis não viram objeto vazio', async () => {
  const h = new Host({}, {}), point = {};
  Object.defineProperties(point, { x: { value: 2, writable: true }, y: { value: 3, writable: true } });
  const scan = stampScan({ value: point }), a = await h.parameterStamp(scan); point.x = 4;
  assert.notEqual(a.value, (await h.parameterStamp(scan)).value);
  const color = {}; for (const k of ['red', 'green', 'blue', 'alpha']) Object.defineProperty(color, k, { value: 1, writable: true });
  const scanColor = stampScan({ value: color }), b = await h.parameterStamp(scanColor); color.red = 0.5;
  assert.notEqual(b.value, (await h.parameterStamp(scanColor)).value);
});
test('parâmetro opaco desliga cache, sem declarar valores verificados', async () => {
  const h = new Host({}, {}); assert.deepEqual(await h.parameterStamp(stampScan({ value: {} })), { complete: false });
});
test('biblioteca existente intacta é reutilizada após reiniciar o painel', async () => {
  const f = fixture(); delete f.host.template;
  f.asset.sequenceId = f.source.guid; f.asset.clips = C.allClips(f.source.state); f.asset.transitions = [];
  f.asset.parameterStamp = { complete: true, value: 'saved' };
  f.host.parameterStamp = async () => ({ complete: true, value: 'saved' });
  f.project.getSequences = async () => [f.sequence, f.source];
  f.project.importSequences = async () => { throw new Error('não deveria reimportar'); };
  const result = await f.host.template(await f.host.active(), f.asset, () => {});
  assert.equal(result.sequence, f.source);
});
test('cache usa wrapper atual da sequência após Undo, nunca o objeto antigo', async () => {
  for (const method of ['template', 'mogrtTemplate']) {
    const f = fixture(); delete f.host[method];
    const stale = { guid: 'template', old: true }, fresh = { ...f.source };
    f.host.cache.set('project:asset', { sequence: stale, data: f.source.state, stamp: { complete: true, value: 'saved' } });
    f.project.getSequences = async () => [f.sequence, fresh];
    f.host.reusable = async sequence => { assert.equal(sequence, fresh); assert(!sequence.old); return { sequence, scan: await f.host.stableScan(sequence) }; };
    const result = await f.host[method](await f.host.active(), f.asset, () => {});
    assert.equal(result.sequence, fresh);
  }
});
test('efeito editado na sequência da biblioteca não reutiliza cache', async () => {
  const f = fixture(), data = clone(f.source.state);
  f.host.parameterStamp = async () => ({ complete: true, value: 'editado' });
  assert.equal(await f.host.reusable(f.source, data, { complete: true, value: 'salvo' }), null);
  assert.equal(await f.host.reusable(f.source, data, { complete: false }), null);
});
