"use strict";
const core = require("./core.js");

function nativeFileUrl(path) {
  // Inputs here are Project.path / Entry.nativePath, NOT encoded web URIs.
  // UXP's file provider encodes them itself. Encoding '%' or spaces here
  // changes the actual filename (the reported failure contained %2520).
  if (typeof path !== "string" || !path || /[\x00-\x1f]/.test(path)) throw new Error("Caminho de arquivo inválido.");
  let p = path.replace(/\\/g, "/");
  // Premiere can return Win32 extended paths. Their '?' is a namespace
  // prefix, not a network server named '?' and not part of the filename.
  if (/^\/\/\?\/UNC\//i.test(p)) p = "//" + p.slice(8);
  else if (/^\/\/\?\/[a-z]:\//i.test(p)) p = p.slice(4);
  else if (/^\/\/[?.]\//.test(p)) throw new Error("Namespace de arquivo do Windows não suportado.");
  if (/^[a-z]:\//i.test(p)) return "file:/" + p;
  if (/^\/\/[^/]+\/[^/]+(?:\/|$)/.test(p)) return "file:" + p;
  if (p[0] === "/" && p[1] !== "/") return "file:" + p;
  throw new Error("O arquivo precisa ter um caminho nativo absoluto, não uma URL ou um caminho relativo.");
}

class Library {
  constructor(io) { this.io = io; this.data = null; this.revision = 0; }
  async load() {
    const slots = await Promise.all(["a", "b"].map(async slot => {
      try {
        const raw = await this.io.readJSON("library-" + slot + ".json");
        if (raw.schema !== 1 || !Number.isInteger(raw.revision) || !raw.data || !Array.isArray(raw.data.profiles) || !raw.data.profiles.length) return null;
        if (raw.check !== core.textChecksum(JSON.stringify(raw.data))) return null;
        return raw;
      } catch (_) { return null; }
    }));
    const valid = slots.filter(Boolean).sort((a, b) => b.revision - a.revision);
    if (valid.length) { this.data = valid[0].data; this.revision = valid[0].revision; }
    else {
      if (await this.io.exists("library-a.json") || await this.io.exists("library-b.json")) throw new Error("Biblioteca danificada. Os arquivos foram preservados; não vou substituir seus perfis.");
      this.data = { active: "default", profiles: [{ id: "default", name: "Geral", items: [] }], trash: [] };
    }
    return this.data;
  }
  async commit(next) {
    // Two alternating journals: a failed write leaves the previous slot intact.
    const revision = this.revision + 1;
    const raw = { schema: 1, revision, data: next, check: core.textChecksum(JSON.stringify(next)) };
    const file = "library-" + (revision % 2 ? "a" : "b") + ".json";
    await this.io.writeJSON(file, raw);
    const check = await this.io.readJSON(file);
    if (JSON.stringify(check) !== JSON.stringify(raw)) throw new Error("Falha ao verificar a biblioteca salva.");
    this.data = next; this.revision = revision;
  }
  async mutate(fn) { const next = JSON.parse(JSON.stringify(this.data)); fn(next); await this.commit(next); }
  profile() { return this.data.profiles.find(p => p.id === this.data.active) || this.data.profiles[0]; }
  async select(id) { await this.mutate(d => { if (!d.profiles.some(p => p.id === id)) throw new Error("Perfil não encontrado."); d.active = id; }); }
  async addProfile(value) {
    const n = core.name(value), id = core.uid();
    await this.mutate(d => {
      if (d.profiles.some(p => p.name.toLowerCase() === n.toLowerCase())) throw new Error("Já existe um perfil com esse nome.");
      d.profiles.push({ id, name: n, items: [] }); d.active = id;
    });
  }
  async renameProfile(value) { const n = core.name(value); await this.mutate(d => {
    if (d.profiles.some(p => p.id !== d.active && p.name.toLowerCase() === n.toLowerCase())) throw new Error("Nome de perfil repetido.");
    d.profiles.find(p => p.id === d.active).name = n;
  }); }
  async add(item) { await this.mutate(d => d.profiles.find(p => p.id === d.active).items.push(item)); }
  async renameItem(id, value) { const n = core.name(value); await this.mutate(d => {
    const item = d.profiles.find(p => p.id === d.active).items.find(a => a.id === id);
    if (!item) throw new Error("Item não encontrado."); item.name = n;
  }); }
  async setColor(id, value) {
    if (value !== null && (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))) throw new Error("Cor inválida.");
    await this.mutate(d => {
      const item = d.profiles.find(p => p.id === d.active).items.find(a => a.id === id);
      if (!item) throw new Error("Item não encontrado.");
      item.color = value === null ? null : value.toUpperCase();
    });
  }
  async archive(id) { await this.mutate(d => {
    const p = d.profiles.find(p => p.id === d.active), index = p.items.findIndex(a => a.id === id);
    if (index < 0) throw new Error("Item não encontrado.");
    d.trash.push({ profileId: p.id, item: p.items.splice(index, 1)[0] });
  }); }
  async restoreLast() { await this.mutate(d => {
    const last = d.trash.pop(); if (!last) throw new Error("Nenhum item arquivado.");
    (d.profiles.find(p => p.id === last.profileId) || d.profiles[0]).items.push(last.item);
  }); }
}

class UxpIO {
  constructor(storage) { this.storage = storage; this.root = null; }
  async init() { this.root = await this.storage.localFileSystem.getDataFolder(); return this; }
  async exists(n) { try { await this.root.getEntry(n); return true; } catch (_) { return false; } }
  async readJSON(n) { return JSON.parse(await (await this.root.getEntry(n)).read()); }
  async writeJSON(n, value) { await (await this.root.createFile(n, { overwrite: true })).write(JSON.stringify(value)); }
  async recordDiagnostic(error, scope) {
    const entry = { date: new Date().toISOString(), scope, message: error.message || String(error),
      code: error.code || null, stack: String(error.stack || ""), evidence: error.evidence || null };
    let history;
    try { history = await this.readJSON("diagnostics.json"); } catch (_) { history = []; }
    if (!Array.isArray(history)) history = [];
    // Keep the antecedent error when a second UI error follows it.
    await this.writeJSON("diagnostics.json", history.slice(-29).concat([entry]));
    await this.writeJSON("last-error.json", entry);
  }
  async folder(id) {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error("ID de biblioteca inválido.");
    let payloads; try { payloads = await this.root.getEntry("payloads"); } catch (_) { payloads = await this.root.createFolder("payloads"); }
    try { return await payloads.getEntry(id); } catch (_) { return payloads.createFolder(id); }
  }
  async entry(path) {
    const url = nativeFileUrl(path);
    try { return await this.storage.localFileSystem.getEntryWithUrl(url); }
    catch (cause) {
      const error = new Error("Não foi possível acessar o arquivo no disco: " + path + ". Confira se a unidade está disponível.");
      error.code = "PILHA_FILE_ACCESS";
      error.evidence = { nativePath: path, providerUrl: url, reason: cause.message || String(cause) };
      throw error;
    }
  }
  async binary(file) {
    if (!file || !file.isFile) throw new Error("O caminho não aponta para um arquivo.");
    const data = await file.read({ format: this.storage.formats.binary });
    if (!data || data.byteLength < 64) throw new Error("Arquivo vazio ou incompleto; o pacote não foi registrado.");
    return data;
  }
  async preflightProject(path) {
    // Fail on unavailable drives, bad paths or unreadable files BEFORE
    // asking Premiere to create a scratch sequence or save the project.
    const file = await this.entry(path);
    if (!/\.prproj$/i.test(file.name)) throw new Error("Salve o projeto como .prproj antes de guardar a seleção.");
    await this.binary(file);
  }
  async copyFile(source, id) {
    const check = core.checksum(await this.binary(source));
    const copy = await source.copyTo(await this.folder(id), { overwrite: false });
    if (core.checksum(await this.binary(copy)) !== check) throw new Error("A cópia do arquivo ficou diferente da origem; o pacote não foi registrado.");
    return { file: copy.nativePath, check };
  }
  async copyProject(path, id) {
    return this.copyFile(await this.entry(path), id);
  }
  async importMogrt(file, id) {
    if (!/\.mogrt$/i.test(file.name)) throw new Error("Escolha um arquivo .mogrt.");
    return this.copyFile(file, id);
  }
  async checkPayload(asset) {
    const f = await this.entry(asset.file);
    if (core.checksum(await this.binary(f)) !== asset.check) throw new Error("O arquivo salvo foi alterado ou está incompleto. A timeline não foi modificada.");
    return f;
  }
}
module.exports = { Library, UxpIO, nativeFileUrl };
