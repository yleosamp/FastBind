"use strict";
const C = require("./core.js");

function guid(value) { if (!value) throw new Error("Identidade nativa indisponível."); return value.toString(); }
function must(value, message) { if (value === false || value === null || value === undefined) throw new Error(message); return value; }
function operationKey(op) { return op.operationId || [op.projectId || op.project || "", op.sequenceId || "", op.date || ""].join(":"); }
function projectPath(value) { return String(value || "").replace(/^\\\\\?\\/, "").replace(/\\/g, "/").toLowerCase(); }
function sameTransitions(a, b) { return JSON.stringify((a || []).map(t => JSON.stringify(t)).sort()) === JSON.stringify((b || []).map(t => JSON.stringify(t)).sort()); }
function sameTimeline(a, b) { return !!a && !!b && C.verify(a, b, []) && sameTransitions(a.transitions, b.transitions); }
function plannedTimeline(op, data) {
  return !!op.before && !!op.plan && Array.isArray(op.plan.expected) && Array.isArray(op.expectedTransitions) &&
    C.verify(op.before, data, op.plan.expected) && sameTransitions(op.before.transitions.concat(op.expectedTransitions), data.transitions);
}
function paramValue(value) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && value.value !== undefined) return paramValue(value.value);
  if (value && ["red", "green", "blue", "alpha"].every(k => typeof value[k] === "number")) return ["color", value.red, value.green, value.blue, value.alpha];
  if (value && typeof value.x === "number" && typeof value.y === "number") return ["point", value.x, value.y];
  throw new Error("Parâmetro nativo opaco.");
}

class Host {
  constructor(ppro, io) {
    this.ppro = ppro; this.io = io; this.cache = new Map(); this.review = null;
    this.unresolved = []; this.lastOperation = null; this.recoveryState = { state: "clear", resolved: 0, pending: 0 };
  }
  remember(op) {
    if (!op || !["pending", "unverified"].includes(op.phase)) return;
    const clean = Object.assign({}, op); delete clean.unresolved;
    const key = operationKey(clean), at = this.unresolved.findIndex(x => operationKey(x) === key);
    if (at < 0) this.unresolved.push(clean); else this.unresolved[at] = clean;
  }
  updateReview() { this.review = this.unresolved[this.unresolved.length - 1] || null; }
  async init() {
    try {
      const op = await this.io.readJSON("operation.json");
      if (!op || typeof op !== "object" || Array.isArray(op)) throw new Error("Registro inválido.");
      this.lastOperation = op;
      if (Array.isArray(op.unresolved)) op.unresolved.forEach(x => this.remember(x));
      this.remember(op);
    } catch (_) {
      if (await this.io.exists("operation.json")) this.remember({ phase: "unverified", date: new Date().toISOString(), code: "PILHA_CORRUPT_OPERATION", error: "O registro da última operação não pôde ser lido." });
    }
    this.updateReview();
    await this.reconcile();
  }
  async reconcile(context) {
    // Undo and native failures are observed, never simulated with another Undo
    // or a retry. Only the affected project/sequence can need recovery; saving
    // selections and working in another sequence must not acquire a global latch.
    if (!this.unresolved.length) return (this.recoveryState = { state: "clear", resolved: 0, pending: 0 });
    let ctx;
    try { ctx = context || await this.active(); }
    catch (_) { return (this.recoveryState = { state: "deferred", resolved: 0, pending: 0 }); }
    const matches = op => op.sequenceId === ctx.sequenceId &&
      (op.projectId ? op.projectId === ctx.projectId : !!op.project && projectPath(op.project) === projectPath(ctx.project.path));
    const candidates = this.unresolved.filter(matches);
    if (!candidates.length) return (this.recoveryState = { state: "other-sequence", resolved: 0, pending: 0 });
    let data;
    try { data = (await this.stableScan(ctx.sequence)).data; }
    catch (_) { return (this.recoveryState = { state: "blocked", resolved: 0, pending: candidates.length }); }
    const resolved = new Map();
    for (const op of candidates) {
      try {
        // Extra empty tracks left by Premiere after Undo are harmless. Exact
        // clip multisets and readable/opaque transitions still must match.
        if (sameTimeline(op.before, data)) resolved.set(operationKey(op), "cancelled");
        else if (plannedTimeline(op, data)) resolved.set(operationKey(op), "verified");
      } catch (_) { /* malformed/legacy records are not proof of a safe state */ }
    }
    if (resolved.size) {
      this.cache.clear();
      this.unresolved = this.unresolved.filter(op => !resolved.has(operationKey(op)));
      const latest = Object.assign({}, this.lastOperation || {});
      if (resolved.has(operationKey(latest))) {
        latest.phase = resolved.get(operationKey(latest)); latest.recoveredAt = new Date().toISOString();
        latest.recovery = latest.phase === "cancelled" ? "before-state-restored" : "expected-state-confirmed";
      }
      latest.unresolved = this.unresolved.filter(op => operationKey(op) !== operationKey(latest));
      // A failed bookkeeping write does not invalidate an exact native readback.
      // The old pending journal will simply be reconciled again on next launch.
      try { await this.io.writeJSON("operation.json", latest); this.lastOperation = latest; } catch (_) {}
      this.updateReview();
    }
    const pending = this.unresolved.filter(matches).length;
    return (this.recoveryState = { state: pending ? "blocked" : "clear", resolved: resolved.size, pending });
  }
  recoveryError() {
    const error = new Error("A inserção anterior ficou incompleta nesta sequência. Use Ctrl+Z para desfazê-la e tente novamente; o FastBind reconhece o desfazer automaticamente.");
    error.code = "PILHA_RECOVERY_REQUIRED"; return error;
  }
  async freshTarget(ctx) {
    const project = await this.ppro.Project.getActiveProject();
    if (!project || guid(project.guid) !== ctx.projectId) throw new Error("Projeto de destino indisponível.");
    if (typeof project.getSequences === "function") {
      const sequence = (await project.getSequences()).find(s => guid(s.guid) === ctx.sequenceId);
      if (!sequence) throw new Error("Sequência de destino indisponível.");
      return sequence;
    }
    const active = await project.getActiveSequence();
    if (active && guid(active.guid) === ctx.sequenceId) return active;
    throw new Error("Sequência de destino indisponível.");
  }
  async active() {
    const project = await this.ppro.Project.getActiveProject();
    if (!project) throw new Error("Abra um projeto no Premiere.");
    const sequence = await project.getActiveSequence();
    if (!sequence) throw new Error("Abra uma sequência na timeline.");
    if (!project.path) throw new Error("Salve o projeto do Premiere primeiro.");
    return { project, sequence, projectId: guid(project.guid), sequenceId: guid(sequence.guid) };
  }
  async assertActive(ctx, allowedSequenceId) {
    const now = await this.active();
    if (now.projectId !== ctx.projectId || (now.sequenceId !== ctx.sequenceId && now.sequenceId !== allowedSequenceId)) throw new Error("Você mudou de projeto ou sequência durante a operação. Nada foi inserido na edição.");
    return now;
  }
  async audioQuantum(sequence) {
    const settings = await sequence.getSettings();
    if (!settings || typeof settings.getAudioSampleRate !== "function") throw new Error("Não foi possível consultar a taxa de áudio da sequência. A operação foi cancelada.");
    const rate = await settings.getAudioSampleRate();
    const q = rate && rate.ticksPerFrame;
    if (!Number.isSafeInteger(q) || q <= 0 || q > Math.floor(Number.MAX_SAFE_INTEGER / 10)) throw new Error("O Premiere não retornou uma grade válida de amostras de áudio.");
    return String(q);
  }
  transaction(project, label, build) {
    // Native Actions are constructed inside the lock/transaction, not cached
    // across awaits (important for Premiere 26.3+ object lifetimes).
    let committed = false;
    project.lockedAccess(() => {
      committed = project.executeTransaction(compound => {
        const add = action => {
          must(action, "Premiere não criou a ação nativa.");
          if (compound.addAction(action) === false) throw new Error("Premiere recusou a ação nativa.");
        };
        build(add);
      }, label);
    });
    must(committed, "Premiere recusou a operação. Confira se as faixas estão desbloqueadas.");
  }
  async components(item) {
    const chain = await item.getComponentChain(), result = [];
    const count = chain.getComponentCount();
    for (let i = 0; i < count; i++) {
      const component = chain.getComponentAtIndex(i);
      result.push([await component.getMatchName(), component.getParamCount()]);
    }
    return result;
  }
  async parameterStamp(scan) {
    // Inspect only the small library sequence, never every parameter in the
    // user's edit. Native Color/PointF properties are not JSON-enumerable.
    // Opaque third-party parameters disable cache reuse rather than treating
    // a component-count match as proof that its saved values are unchanged.
    try {
      const values = []; let totalKeys = 0;
      for (const ref of scan.refs) {
        const chain = await ref.item.getComponentChain(), components = [];
        for (let i = 0; i < chain.getComponentCount(); i++) {
          const component = chain.getComponentAtIndex(i), params = [];
          for (let j = 0; j < component.getParamCount(); j++) {
            const param = component.getParam(j), varying = param.isTimeVarying();
            const keys = varying ? param.getKeyframeListAsTickTimes() : [];
            totalKeys += keys.length;
            if (totalKeys > 10000) throw new Error("Cache com muitos keyframes.");
            const keyValues = [];
            for (const time of keys) {
              const key = param.getKeyframePtr(time);
              keyValues.push([C.tick(time.ticks), paramValue(key.value), await key.getTemporalInterpolationMode()]);
            }
            params.push([varying, paramValue((await param.getStartValue()).value), keyValues]);
          }
          components.push([await component.getMatchName(), params]);
        }
        values.push(components);
      }
      return { complete: true, value: C.textChecksum(JSON.stringify(values)) };
    } catch (_) { return { complete: false }; }
  }
  async reusable(sequence, data, stamp) {
    if (!stamp || !stamp.complete) return null;
    const scan = await this.stableScan(sequence);
    if (JSON.stringify(scan.data) !== JSON.stringify(data)) return null;
    const fresh = await this.parameterStamp(scan);
    return fresh.complete && fresh.value === stamp.value ? { sequence, scan } : null;
  }
  async describe(item, kind, track) {
    if (!item || typeof item.getStartTime !== "function") throw new Error("O Premiere devolveu um clipe inválido em " + (kind === "video" ? "V" : "A") + (track + 1) + ". Leitura interrompida para proteger a edição. Reabra o painel e tente novamente.");
    const c = { kind, track, start: C.tick((await item.getStartTime()).ticks), end: C.tick((await item.getEndTime()).ticks),
      in: C.tick((await item.getInPoint()).ticks), out: C.tick((await item.getOutPoint()).ticks),
      name: await item.getName(), disabled: await item.isDisabled(),
      adjustment: kind === "video" ? await item.isAdjustmentLayer() : false,
      speed: await item.getSpeed(), reversed: await item.isSpeedReversed(), components: await this.components(item) };
    C.bounds([c]); return c;
  }
  async scan(sequence) {
    const data = { video: [], audio: [], transitions: [] }, refs = [], transitionRefs = [];
    const types = this.ppro.Constants && this.ppro.Constants.TrackItemType;
    if (!types || types.CLIP == null || types.TRANSITION == null) throw new Error("O Premiere não disponibilizou os tipos de clipe/transição necessários.");
    for (const kind of ["video", "audio"]) {
      const count = await sequence[kind === "video" ? "getVideoTrackCount" : "getAudioTrackCount"]();
      for (let i = 0; i < count; i++) {
        const track = await sequence[kind === "video" ? "getVideoTrack" : "getAudioTrack"](i);
        if (!track || typeof track.getTrackItems !== "function") throw new Error("Não foi possível ler a faixa " + (kind === "video" ? "V" : "A") + (i + 1) + ". Nenhuma inserção foi solicitada.");
        const t = { name: track.name, muted: await track.isMuted(), clips: [], transitions: [], opaqueTransitions: 0 };
        const items = Array.from(await track.getTrackItems(types.CLIP, false) || []);
        for (const item of items) { const c = await this.describe(item, kind, i); t.clips.push(c); refs.push({ item, clip: c }); }
        const transitions = Array.from(await track.getTrackItems(types.TRANSITION, false) || []);
        for (const item of transitions) {
          // Premiere 26.5 can return one null per audio fade. These entries
          // are NOT empty space and cannot be treated as clip objects.
          // Without readable bounds reserve the entire destination track.
          try {
            if (!item || typeof item.getStartTime !== "function" || typeof item.getEndTime !== "function") throw new Error("Transição opaca.");
            const c = { kind, track: i, start: C.tick((await item.getStartTime()).ticks), end: C.tick((await item.getEndTime()).ticks) };
            if (C.cmp(c.end, c.start) <= 0) throw new Error("Transição sem duração legível.");
            t.transitions.push(c); data.transitions.push(c); transitionRefs.push(item);
          } catch (_) { t.opaqueTransitions++; }
        }
        data[kind].push(t);
      }
    }
    return { data, refs, transitionRefs };
  }
  async stableScan(sequence) {
    const a = await this.scan(sequence), b = await this.scan(sequence);
    if (JSON.stringify(a.data) !== JSON.stringify(b.data)) throw new Error("A timeline está mudando. Pare a reprodução e tente novamente.");
    return b;
  }
  clone(project, destination, sources, placements, label) {
    this.transaction(project, label, add => {
      const editor = this.ppro.SequenceEditor.getEditor(destination);
      if (!editor || typeof editor.createCloneTrackItemAction !== "function") throw new Error("Esta versão do Premiere não oferece duplicação nativa UXP.");
      for (const p of placements) {
        const source = sources[p.sourceIndex];
        const delta = p.track - source.clip.track;
        add(editor.createCloneTrackItemAction(source.item, this.ppro.TickTime.createWithTicks(p.offset),
          source.clip.kind === "video" ? delta : 0, source.clip.kind === "audio" ? delta : 0,
          false, false)); // NEVER ripple/insert-edit. Overwrite only in preflighted empty ranges.
      }
    });
  }
  async createStage(ctx, id) {
    const before = new Set((await ctx.project.getSequences()).map(s => guid(s.guid)));
    const stage = await ctx.project.createSequence("[FastBind " + id + "]", "");
    if (!stage || before.has(guid(stage.guid))) throw new Error("Não foi possível criar uma sequência isolada da biblioteca.");
    const settings = await ctx.sequence.getSettings();
    this.transaction(ctx.project, "FastBind: preparar biblioteca", add => add(stage.createSetSettingsAction(settings)));
    if (C.allClips((await this.scan(stage)).data).length) throw new Error("A sequência de trabalho não está vazia. Operação cancelada.");
    return stage;
  }
  async organize(project, sequences) {
    const root = await project.getRootItem(); let name = "FastBind - Biblioteca";
    // Cast is a safer discriminator than a hardcoded host enum.
    let folders = (await root.getItems()).filter(x => x.name === name).filter(x => { try { return !!this.ppro.FolderItem.cast(x); } catch (_) { return false; } });
    // Existing users keep their original bin; do not rename, duplicate or move
    // the whole library just because the panel acquired a new display name.
    if (!folders.length) {
      const legacy = (await root.getItems()).filter(x => x.name === "Pilha - Biblioteca").filter(x => { try { return !!this.ppro.FolderItem.cast(x); } catch (_) { return false; } });
      if (legacy.length) { folders = legacy; name = "Pilha - Biblioteca"; }
    }
    if (folders.length > 1) throw new Error("Há mais de uma pasta de biblioteca do FastBind no projeto. Renomeie a duplicada.");
    if (!folders.length) {
      this.transaction(project, "FastBind: pasta da biblioteca", add => add(root.createBinAction(name, false)));
      folders = (await root.getItems()).filter(x => x.name === name).filter(x => { try { return !!this.ppro.FolderItem.cast(x); } catch (_) { return false; } });
    }
    if (folders.length !== 1) throw new Error("Não foi possível localizar a pasta da biblioteca.");
    const folder = this.ppro.FolderItem.cast(folders[0]);
    const items = [];
    for (const sequence of sequences) items.push(await sequence.getProjectItem());
    this.transaction(project, "FastBind: organizar biblioteca", add => items.forEach(item => add(root.createMoveItemAction(item, folder))));
  }
  async restoreActive(ctx, stage) {
    const project = await this.ppro.Project.getActiveProject();
    if (!project || guid(project.guid) !== ctx.projectId) return;
    const current = await project.getActiveSequence();
    if (!current || guid(current.guid) === guid(stage.guid) || guid(current.guid) === ctx.sequenceId) {
      await project.setActiveSequence(ctx.sequence);
      if (typeof project.closeSequence === "function") await project.closeSequence(stage);
    }
  }
  async removeOwnedStage(ctx, stage) {
    // Only the exact Sequence object created by this operation, never bins,
    // matching names or arbitrary imported/user sequences.
    if (!stage || guid(stage.guid) === ctx.sequenceId) return;
    try { await this.restoreActive(ctx, stage); await ctx.project.deleteSequence(stage); } catch (_) { /* own scratch may remain; never delete broader targets */ }
  }
  async saveSelection(id, name, progress, options) {
    const ctx = await this.active(); let stage = null, captured = false;
    const original = await this.stableScan(ctx.sequence), selected = [];
    for (const r of original.refs) if (await r.item.getIsSelected()) selected.push(r);
    const clips = selected.map(r => r.clip), b = C.bounds(clips);
    const opaqueTracks = ["video", "audio"].reduce((all, kind) => all.concat(original.data[kind]
      .map((t, track) => ({ kind, track, count: t.opaqueTransitions || 0 }))
      .filter(t => t.count && clips.some(c => c.kind === t.kind && c.track === t.track))), []);
    const approvalKey = JSON.stringify([ctx.projectId, ctx.sequenceId, clips.map(C.signature), opaqueTracks]);
    if (opaqueTracks.length && (!options || options.allowOpaqueTransitions !== approvalKey)) {
      const error = new Error("Há fades/transições que o Premiere não expõe nas faixas selecionadas. Eles podem não acompanhar a cópia. Os clipes originais não serão alterados.");
      error.code = "PILHA_OPAQUE_TRANSITIONS"; error.approvalKey = approvalKey;
      throw error; // Before creating scratch, cloning or saving the project.
    }
    const selectedTransitions = original.data.transitions.filter(t => clips.some(c => c.kind === t.kind && c.track === t.track && C.overlap(c, t)));
    for (const t of selectedTransitions) {
      const neighbours = original.refs.filter(r => r.clip.kind === t.kind && r.clip.track === t.track && C.overlap(r.clip, t));
      if (neighbours.some(r => !selected.includes(r))) throw new Error("Selecione os dois lados da transição para preservá-la no pacote.");
      if (C.cmp(t.start, b.start) < 0) b.start = t.start;
      if (C.cmp(t.end, b.end) > 0) b.end = t.end;
    }
    // Keep a meaningful internal playhead offset; otherwise place the start
    // of the package at the new playhead, not minutes off-screen.
    const sourceAnchor = C.anchor(clips, (await ctx.sequence.getPlayerPosition()).ticks);
    try {
      progress("Conferindo arquivo do projeto…");
      await this.io.preflightProject(ctx.project.path);
      await this.assertActive(ctx);
      progress("Copiando seleção nativa…");
      stage = await this.createStage(ctx, id);
      const audioSampleTicks = clips.some(c => c.kind === "audio") ? await this.audioQuantum(stage) : null;
      const empty = await this.stableScan(stage);
      // Keep the source timeline coordinates in the private library sequence.
      // Repeated cross-sequence audio clones can ignore a negative timeOffset
      // after the first capture in a Premiere session. A zero timeOffset avoids
      // that path entirely, without moving/trimming clips or loosening verify.
      // The stored anchor uses these SAME coordinates; insert already computes
      // destination playhead minus anchor (legacy zero-based assets still work).
      const p = C.plan(clips, "0", "0", empty.data, false, selectedTransitions, audioSampleTicks);
      // Creating/configuring a sequence crosses native mutations. Do not pass
      // the earlier TrackItem wrappers across that boundary: read them again
      // and match the original selection, not any new selection in the UI.
      const freshSource = await this.stableScan(ctx.sequence);
      if (JSON.stringify(original.data) !== JSON.stringify(freshSource.data)) throw new Error("A sequência de origem mudou durante a captura. Salve a seleção novamente.");
      const wanted = new Map();
      clips.forEach(c => { const key = C.signature(c); wanted.set(key, (wanted.get(key) || 0) + 1); });
      const sources = freshSource.refs.filter(r => {
        const key = C.signature(r.clip), n = wanted.get(key) || 0;
        if (!n) return false;
        wanted.set(key, n - 1); return true;
      });
      if (!C.sameClips(clips, sources.map(r => r.clip))) throw new Error("Não foi possível reler a seleção original. Nenhum clipe foi copiado.");
      // The scratch already has empty tracks. Use them rather than requiring
      // unnecessary out-of-range track creation just to save a small preset.
      this.clone(ctx.project, stage, sources, p.placements, "FastBind: guardar seleção");
      const staged = await this.stableScan(stage);
      if (!C.verify(empty.data, staged.data, p.expected)) {
        const error = new Error("A cópia do Premiere ficou diferente da seleção. O pacote não foi salvo; a edição original não foi alterada.");
        error.code = "PILHA_CAPTURE_MISMATCH";
        error.evidence = Object.assign(C.verificationDiff(empty.data, staged.data, p.expected), { audioSampleTicks, captureOffset: p.offset, sourceAnchor });
        throw error;
      }
      const savedStamp = await this.parameterStamp(staged);
      const expectedTransitions = selectedTransitions.map(t => {
        const placement = p.placements.find(x => x.kind === t.kind && x.sourceTrack === t.track);
        return { kind: t.kind, track: placement.track, start: C.add(t.start, p.offset), end: C.add(t.end, p.offset) };
      });
      if (JSON.stringify(expectedTransitions.map(t => JSON.stringify(t)).sort()) !== JSON.stringify(staged.data.transitions.map(t => JSON.stringify(t)).sort())) throw new Error("Premiere não preservou uma transição da seleção. A edição original não foi alterada.");
      if (!C.sameClips(C.allClips(original.data), C.allClips((await this.stableScan(ctx.sequence)).data))) throw new Error("A sequência de origem mudou durante a captura. Salve a seleção novamente.");
      await this.organize(ctx.project, [stage]);
      await this.restoreActive(ctx, stage);
      await this.assertActive(ctx);
      progress("Salvando biblioteca…");
      must(await ctx.project.save(), "Não foi possível salvar o projeto. A seleção não foi registrada.");
      const payload = await this.io.copyProject(ctx.project.path, id);
      const after = await this.stableScan(stage);
      if (JSON.stringify(staged.data) !== JSON.stringify(after.data)) throw new Error("O pacote mudou durante o salvamento. Tente novamente.");
      const asset = Object.assign({ id, name, type: "selection", created: new Date().toISOString(),
        sequenceId: guid(stage.guid), sequenceName: stage.name, sourceProject: ctx.project.path,
        anchor: sourceAnchor, clips: C.allClips(staged.data), transitions: staged.data.transitions,
        duration: C.sub(b.end, b.start) }, payload);
      if (opaqueTracks.length) asset.warnings = ["Fades/transições nativas não expostas pelo Premiere não têm preservação garantida neste pacote."];
      const afterStamp = await this.parameterStamp(after);
      if (savedStamp.complete && afterStamp.complete && savedStamp.value !== afterStamp.value) throw new Error("Os efeitos do pacote mudaram durante o salvamento. Salve a seleção novamente.");
      asset.parameterStamp = savedStamp;
      this.cache.set(ctx.projectId + ":" + id, { sequence: stage, data: staged.data, stamp: asset.parameterStamp });
      captured = true; return asset;
    } catch (error) {
      try { if (typeof this.io.recordDiagnostic === "function") await this.io.recordDiagnostic(error, "save-selection"); } catch (_) {}
      throw error;
    } finally {
      if (stage && !captured) await this.removeOwnedStage(ctx, stage);
    }
  }
  async template(ctx, asset, progress) {
    const key = ctx.projectId + ":" + asset.id, cached = this.cache.get(key);
    if (cached) {
      try {
        const current = (await ctx.project.getSequences()).find(s => guid(s.guid) === guid(cached.sequence.guid));
        const reuse = current ? await this.reusable(current, cached.data, cached.stamp) : null;
        if (reuse) return reuse;
      } catch (_) { /* Undo or external edits invalidate only the cache */ }
      this.cache.delete(key);
    }
    // After restarting the panel, an intact library sequence may already be
    // in the project. Reuse it only with both structure AND parameter evidence.
    const existing = (await ctx.project.getSequences()).filter(s => guid(s.guid) === asset.sequenceId && guid(s.guid) !== ctx.sequenceId);
    if (existing.length === 1 && asset.parameterStamp && asset.parameterStamp.complete) {
      const scan = await this.stableScan(existing[0]);
      if (C.sameClips(C.allClips(scan.data), asset.clips) && JSON.stringify(scan.data.transitions) === JSON.stringify(asset.transitions)) {
        const stamp = await this.parameterStamp(scan);
        if (stamp.complete && stamp.value === asset.parameterStamp.value) {
          this.cache.set(key, { sequence: existing[0], data: scan.data, stamp });
          return { sequence: existing[0], scan };
        }
      }
    }
    progress("Carregando pacote…");
    await this.io.checkPayload(asset);
    const before = new Set((await ctx.project.getSequences()).map(s => guid(s.guid)));
    must(await ctx.project.importSequences(asset.file, [this.ppro.Guid.fromString(asset.sequenceId)]), "Premiere não importou o pacote salvo.");
    const imported = (await ctx.project.getSequences()).filter(s => !before.has(guid(s.guid)));
    const candidates = imported.filter(s => s.name === asset.sequenceName);
    if (candidates.length !== 1) throw new Error("Não foi possível identificar com segurança a sequência importada. A edição não foi modificada.");
    const sequence = candidates[0];
    if (guid(sequence.guid) === ctx.sequenceId) throw new Error("A biblioteca não pode ser a própria sequência de destino.");
    const scan = await this.stableScan(sequence);
    if (!C.sameClips(C.allClips(scan.data), asset.clips) || JSON.stringify(scan.data.transitions) !== JSON.stringify(asset.transitions)) throw new Error("O pacote importado difere do que foi salvo. Nenhum clipe foi inserido na edição.");
    await this.organize(ctx.project, imported);
    await this.restoreActive(ctx, sequence);
    this.cache.set(key, { sequence, data: scan.data, stamp: await this.parameterStamp(scan) });
    return { sequence, scan };
  }
  async mogrtTemplate(ctx, asset, progress) {
    const key = ctx.projectId + ":" + asset.id, cached = this.cache.get(key);
    if (cached) {
      try {
        const current = (await ctx.project.getSequences()).find(s => guid(s.guid) === guid(cached.sequence.guid));
        const reuse = current ? await this.reusable(current, cached.data, cached.stamp) : null;
        if (reuse) return reuse;
      } catch (_) { /* native Undo invalidates object handles */ }
      this.cache.delete(key);
    }
    progress("Preparando MOGRT…");
    await this.io.checkPayload(asset);
    let stage = null, ready = false;
    try {
      stage = await this.createStage(ctx, asset.id);
      // Unknown MOGRT duration/audio are discovered only in this empty,
      // isolated sequence. Never import an unknown-length MOGRT onto edits.
      const editor = this.ppro.SequenceEditor.getEditor(stage);
      const returned = await editor.insertMogrtFromPath(asset.file, this.ppro.TickTime.createWithTicks("0"), 0, 0);
      if (!returned || !returned.length) throw new Error("Premiere não conseguiu abrir esse MOGRT. Confira fontes, versão e requisitos do template.");
      const scan = await this.stableScan(stage);
      C.bounds(C.allClips(scan.data));
      await this.organize(ctx.project, [stage]);
      await this.restoreActive(ctx, stage);
      this.cache.set(key, { sequence: stage, data: scan.data, stamp: await this.parameterStamp(scan) }); ready = true;
      return { sequence: stage, scan };
    } finally { if (stage && !ready) await this.removeOwnedStage(ctx, stage); }
  }
  async insert(asset, progress) {
    const ctx = await this.active(), playhead = C.tick((await ctx.sequence.getPlayerPosition()).ticks);
    if ((await this.reconcile(ctx)).state === "blocked") throw this.recoveryError();
    const template = asset.type === "mogrt" ? await this.mogrtTemplate(ctx, asset, progress) : await this.template(ctx, asset, progress);
    const prepared = await this.assertActive(ctx);
    ctx.project = prepared.project; ctx.sequence = prepared.sequence;
    if (guid(template.sequence.guid) === ctx.sequenceId) throw new Error("Abra sua sequência de edição, não a sequência da biblioteca.");
    const clips = C.allClips(template.scan.data);
    const audioSampleTicks = clips.some(c => c.kind === "audio") ? await this.audioQuantum(ctx.sequence) : null;
    const before = await this.stableScan(ctx.sequence);
    const plan = C.plan(clips, asset.type === "mogrt" ? "0" : asset.anchor, playhead, before.data, false, template.scan.data.transitions, audioSampleTicks);
    const expectedTransitions = template.scan.data.transitions.map(t => {
      const corresponding = plan.placements.find(p => p.kind === t.kind && p.sourceTrack === t.track);
      if (!corresponding) throw new Error("Transição sem clipe correspondente no pacote.");
      return { kind: t.kind, track: corresponding.track, start: C.add(t.start, plan.offset), end: C.add(t.end, plan.offset) };
    });
    const pending = { phase: "pending", date: new Date().toISOString(), assetId: asset.id, assetName: asset.name,
      operationId: C.uid(), projectId: ctx.projectId, project: ctx.project.path, sequenceId: ctx.sequenceId,
      sequenceName: ctx.sequence.name, playhead, before: before.data, plan, expectedTransitions, unresolved: this.unresolved.slice() };
    await this.io.writeJSON("operation.json", pending);
    this.lastOperation = pending;
    let attempted = false;
    try {
      progress("Inserindo em faixas livres…");
      // Importing/organizing library sequences and native Undo can invalidate
      // TrackItem wrappers. Re-read the source after all preparation/journaling,
      // and do not carry old handles into the final native transaction.
      const source = await this.stableScan(template.sequence);
      if (JSON.stringify(source.data) !== JSON.stringify(template.scan.data)) throw new Error("O pacote mudou durante a preparação. Tente novamente.");
      const current = await this.assertActive(ctx);
      ctx.project = current.project; ctx.sequence = current.sequence;
      if (C.tick((await ctx.sequence.getPlayerPosition()).ticks) !== playhead) throw new Error("O playhead mudou durante a preparação. Pare a reprodução e tente novamente.");
      // No await between final stable snapshot/plan and the locked transaction.
      // Interval occupancy includes the entire package, not only the playhead.
      const fresh = await this.stableScan(ctx.sequence);
      if (JSON.stringify(before.data) !== JSON.stringify(fresh.data)) throw new Error("A timeline mudou enquanto o pacote era preparado. Tente novamente.");
      attempted = true;
      this.clone(ctx.project, ctx.sequence, source.refs, plan.placements, "FastBind: inserir " + asset.name);
      const after = await this.stableScan(ctx.sequence);
      const wantedTransitions = fresh.data.transitions.concat(expectedTransitions).map(t => JSON.stringify(t)).sort();
      const actualTransitions = after.data.transitions.map(t => JSON.stringify(t)).sort();
      if (!C.verify(fresh.data, after.data, plan.expected) || JSON.stringify(wantedTransitions) !== JSON.stringify(actualTransitions)) {
        const error = new Error("O resultado nativo não passou na verificação. Use Ctrl+Z para desfazer a inserção do FastBind e tente novamente; a recuperação será automática.");
        error.code = "PILHA_INSERT_MISMATCH";
        error.evidence = Object.assign(C.verificationDiff(fresh.data, after.data, plan.expected), { wantedTransitions, actualTransitions, audioSampleTicks });
        throw error;
      }
      const verified = Object.assign({}, pending, { phase: "verified", verifiedAt: new Date().toISOString() });
      await this.io.writeJSON("operation.json", verified);
      this.lastOperation = verified; this.updateReview();
      return { count: clips.length, video: plan.bases.video, audio: plan.bases.audio };
    } catch (error) {
      const outcome = Object.assign({}, pending, { phase: attempted ? "unverified" : "cancelled", error: String(error.message || error) });
      if (attempted) {
        this.cache.clear();
        try {
          const data = (await this.stableScan(await this.freshTarget(ctx))).data;
          if (sameTimeline(before.data, data)) { outcome.phase = "cancelled"; outcome.recovery = "before-state-restored"; }
          else if (plannedTimeline(pending, data)) { outcome.phase = "verified"; outcome.recovery = "expected-state-confirmed"; }
        } catch (_) { /* no reliable readback: keep the scoped recovery record */ }
      }
      if (outcome.phase === "unverified") this.remember(outcome);
      outcome.unresolved = this.unresolved.filter(op => operationKey(op) !== operationKey(outcome));
      try { await this.io.writeJSON("operation.json", outcome); } catch (_) { /* pending record stays recoverable */ }
      this.lastOperation = outcome; this.updateReview();
      if (outcome.phase === "verified") return { count: clips.length, video: plan.bases.video, audio: plan.bases.audio,
        warning: "A inserção foi confirmada na timeline. O Premiere ou o registro de confirmação emitiu um aviso; não é necessário inserir novamente.",
        warningCode: "PILHA_CONFIRMED_WITH_WARNING", warningDetail: String(error.message || error) };
      throw error;
    }
  }
}
module.exports = { Host };
