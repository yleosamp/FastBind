"use strict";
// Local-only profile transport. Never executes archive content or opens its projects.
const Z = require("./vendor/fflate.js"), C = require("./core.js");
const LIMIT = 256 * 1024 * 1024, XML_LIMIT = 32 * 1024 * 1024, MAX_FILES = 2048;
const fail = () => { throw new Error("Pacote FastBind inválido, incompleto ou grande demais (limite: 256 MB)."); };
const bytes = data => data instanceof Uint8Array ? data : new Uint8Array(data);
const xmlEscape = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function xmlText(text) {
  return text.replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === "x" ? parseInt(n.slice(1),16) : Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
const absolute = p => /^(?:[a-z]:[\\/]|\\\\|\/|file:)/i.test(p);
function nativeReference(value) {
  if (!/^file:/i.test(value)) return value;
  let p; try { p = decodeURIComponent(value.slice(5)); } catch (_) { fail(); }
  p = p.replace(/^\/\/localhost\//i,"/").replace(/^\/\/\//,"/");
  if (/^\/[a-z]:\//i.test(p)) p = p.slice(1);
  if (!absolute(p) || /^file:/i.test(p)) fail(); return p;
}
const normalize = p => {
  let s = p.replace(/\\/g, "/");
  s = s.replace(/^\/\/\?\/UNC\//i,"//").replace(/^\/\/\?\//,"");
  return /^[a-z]:\//i.test(s) || s.startsWith("//") ? s.toLowerCase() : s;
};
const leaf = /<([A-Za-z_][\w.:-]*)(\s[^<>]*?)?>([^<>]*)<\/\1>/g;
const discard = /^(?:RelativePath|ConformedAudioPath|PeakFilePath|ProxyFilePath|PresetPath|project\.settings\..*path.*)$/i;
const supported = /\.(?:wav|wave|mp3|aif|aiff|aac|m4a|flac|ogg|mp4|mov|mxf|avi|mkv|m4v|webm|mts|m2ts|mpg|mpeg|png|jpe?g|gif|webp|bmp|tiff?|psd|exr|dpx|cube|look|lut|mogrt)$/i;
// Installed effects/fonts are requirements, never media payloads. Preserve
// their native references and settings instead of distributing their binaries.
function installedReference(tag,value) {
  return /(?:FontFile|FontPath|PluginPath|PluginFile|EffectPath|EffectFile|InstallPath)$/i.test(tag) ||
    /\.(?:aex|prm|dll|vst3?|ofx|plugin|bundle|ttf|otf|ttc|woff2?)$/i.test(value);
}
function generatedPaths(xml) {
  const result = new Set();
  for (const block of xml.matchAll(/<Media\b(?![^>]*\/>)[^>]*>[\s\S]*?<\/Media>/g)) {
    if (!/<Infinite>\s*true\s*<\/Infinite>/i.test(block[0]) ||
        !/<ImplementationID>\s*42008e7a-de6f-4270-96de-7e287abb9b4b\s*<\/ImplementationID>/i.test(block[0])) continue;
    for (const field of block[0].matchAll(/<(?:FilePath|ActualMediaFilePath)>\s*(\d{1,20})\s*<\/(?:FilePath|ActualMediaFilePath)>/g)) result.add(field[1]);
  }
  return result;
}
function mediaError(tag,value) {
  const error = new Error("Não foi possível coletar a mídia: " + value + " (" + tag + ").");
  error.code = "FASTBIND_MEDIA_REFERENCE"; error.evidence = { field: tag, reference: value }; throw error;
}
function readProject(data) {
  const b = bytes(data); if (!b.length || b.length > XML_LIMIT) fail();
  let raw = b;
  if (b[0] === 31 && b[1] === 139) {
    const size = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(b.length - 4, true);
    if (!size || size > XML_LIMIT) fail();
    raw = Z.gunzipSync(b, { out: new Uint8Array(size) });
    if (raw.length !== size) fail();
  }
  const text = Z.strFromU8(raw);
  if (!text.includes("<PremiereData") || !text.includes("</PremiereData>") || /<!DOCTYPE|<!ENTITY/i.test(text)) fail();
  return text;
}
function writeProject(xml) { return Z.gzipSync(Z.strToU8(xml), { level: 6 }); }
function inspectProject(data) {
  const xml = readProject(data), paths = new Map(), effects = new Set(), fonts = new Set(), generators = generatedPaths(xml);
  // Image sequences and Dynamic Link require more than one ordinary media file.
  // Refuse rather than quietly send a broken, partially collected profile.
  if (/<(?:IsImageSequence|ImageSequence)\b[^>]*>\s*(?:true|1)\s*</i.test(xml) || /\.aep(?:x)?(?:<|&|["'])/i.test(xml))
    throw new Error("Dynamic Link e sequências de imagens precisam ser convertidos em mídia antes de exportar o perfil.");
  for (const match of xml.matchAll(leaf)) {
    const tag = match[1], value = xmlText(match[3]);
    if (discard.test(tag)) continue;
    if (/font(?:name|family|postscriptname)?$/i.test(tag) && value && value.length < 200) fonts.add(value);
    if (/(?:MatchName|EffectMatchName)$/i.test(tag) && value && value.length < 200) effects.add(value);
    if (installedReference(tag,value) || generators.has(value)) continue;
    if (!absolute(value)) {
      if (/^(?:FilePath|ActualMediaFilePath)$/i.test(tag) && value.trim()) mediaError(tag,value);
      continue;
    }
    const native = nativeReference(value);
    if (!supported.test(native)) mediaError(tag,value);
    paths.set(normalize(native), native);
  }
  return { xml, paths: Array.from(paths.values()), effects: Array.from(effects), fonts: Array.from(fonts), generators };
}
function transportProject(xml, resources) {
  const paths = new Map(resources.map(r => [normalize(r.source), r.entry]));
  return writeProject(xml.replace(leaf, (whole, tag, attrs, value) => {
    if (discard.test(tag)) return "<" + tag + (attrs || "") + "></" + tag + ">";
    const path = xmlText(value);
    if (installedReference(tag,path)) return whole;
    if (!absolute(path)) return whole;
    const entry = paths.get(normalize(nativeReference(path))); if (!entry) fail();
    return "<" + tag + (attrs || "") + ">fastbind-resource:" + entry + "</" + tag + ">";
  }));
}
function localProject(data, paths) {
  const xml = readProject(data);
  return writeProject(xml.replace(leaf, (whole, tag, attrs, value) => {
    const path = xmlText(value);
    if (installedReference(tag,path)) return whole;
    if (absolute(path)) fail(); // Import must never refer back to the sender's disk.
    if (!path.startsWith("fastbind-resource:")) return whole;
    const local = paths[path.slice(18)]; if (!local || !absolute(local)) fail();
    return "<" + tag + (attrs || "") + ">" + xmlEscape(local) + "</" + tag + ">";
  }));
}
function validateProfile(profile, files) {
  if (!profile || typeof profile.name !== "string" || !Array.isArray(profile.items) || !profile.items.length || profile.items.length > 500) fail();
  C.name(profile.name);
  for (const item of profile.items) {
    C.name(item.name);
    if (!["selection", "mogrt"].includes(item.type) || !files[item.entry]) fail();
    if (item.type === "mogrt") { if (!/^mogrt\/[a-z0-9-]+\.mogrt$/.test(item.entry)) fail(); }
    else {
      if (item.entry !== "project/library.prproj" || typeof item.sequenceId !== "string" || !/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\})$/i.test(item.sequenceId) ||
          typeof item.sequenceName !== "string" || !Array.isArray(item.clips) || !item.clips.length || item.clips.length > 10000) fail();
      C.tick(item.anchor); C.tick(item.duration);
      if (C.cmp(item.duration, "0") <= 0) fail();
      item.clips.forEach(c => {
        if (!["video", "audio"].includes(c.kind) || !Number.isInteger(c.track) || c.track < 0 || typeof c.name !== "string" || !Array.isArray(c.components)) fail();
        [c.start,c.end,c.in,c.out].forEach(C.tick); if (C.cmp(c.end,c.start) <= 0) fail();
      });
    }
    if (item.color !== undefined && item.color !== null && !/^#[0-9a-f]{6}$/i.test(item.color)) fail();
  }
}
function safeEntry(name) {
  return /^(?:manifest\.json|requirements\.txt|project\/library\.prproj|mogrt\/[a-z0-9-]+\.mogrt)$/.test(name) ||
    /^media\/[a-z0-9-]+\.[a-z0-9]{1,8}$/.test(name) && supported.test(name);
}
function pack(profile, files, requirements) {
  validateProfile(profile, files);
  let total = 0;
  const records = Object.keys(files).map(entry => {
    const data = bytes(files[entry]); total += data.length;
    if (!safeEntry(entry) || !data.length || total > LIMIT || entry === "manifest.json") fail();
    return { entry, size: data.length, check: C.checksum(data) };
  });
  if (records.length > MAX_FILES) fail();
  const manifest = { format: "FastBind", schema: 1, profile, files: records, requirements };
  const zip = Object.assign(Object.create(null), files, { "manifest.json": Z.strToU8(JSON.stringify(manifest)) });
  const result = Z.zipSync(zip, { level: 0 }); // Media is already compressed; bounded memory, no worker/native dependency.
  if (result.length > LIMIT) fail(); return result;
}
function unpackInternal(data) {
  const input = bytes(data); if (!input.length || input.length > LIMIT) fail();
  let total = 0, count = 0; const seen = new Set();
  const files = Z.unzipSync(input, { filter: entry => {
    total += entry.originalSize; count++;
    if (!safeEntry(entry.name) || seen.has(entry.name) || !entry.originalSize || total > LIMIT || count > MAX_FILES ||
        entry.name === "manifest.json" && entry.originalSize > 2*1024*1024) fail();
    seen.add(entry.name); return true;
  } });
  let m; try { m = JSON.parse(Z.strFromU8(files["manifest.json"])); } catch (_) { fail(); }
  if (!m || m.format !== "FastBind" || m.schema !== 1 || !Array.isArray(m.files) || m.files.length !== count - 1 || !Array.isArray(m.requirements) || m.requirements.length > 5000) fail();
  const names = new Set();
  m.files.forEach(f => {
    if (f.entry === "manifest.json" || names.has(f.entry) || !files[f.entry] || files[f.entry].length !== f.size || C.checksum(files[f.entry]) !== f.check) fail();
    names.add(f.entry);
  });
  validateProfile(m.profile, files);
  m.requirements.forEach(s => { if (typeof s !== "string" || s.length > 1000) fail(); });
  // Validate and resolve all references BEFORE writing or committing anything.
  const paths = Object.fromEntries(Object.keys(files).map(k => [k, "/validated/" + k]));
  if (files["project/library.prproj"]) localProject(files["project/library.prproj"], paths);
  return { manifest: m, files };
}
function unpack(data) {
  try { return unpackInternal(data); }
  catch (_) { fail(); }
}
function cleanAsset(asset) {
  const out = {};
  ["name","type","created","color","sequenceId","sequenceName","anchor","clips","transitions","duration","parameterStamp","warnings"].forEach(k => {
    if (asset[k] !== undefined) out[k] = JSON.parse(JSON.stringify(asset[k]));
  });
  return out;
}
async function read(io, file, limit = LIMIT) {
  const meta = await file.getMetadata(); if (!meta || !meta.size || meta.size > limit) fail();
  const data = bytes(await file.read({ format: io.storage.formats.binary }));
  if (data.length !== meta.size) fail(); return data;
}
async function write(io, file, data) {
  await file.write(bytes(data), { format: io.storage.formats.binary });
  if (C.checksum(await read(io,file)) !== C.checksum(data)) throw new Error("Falha ao verificar os arquivos do perfil. A biblioteca anterior foi preservada.");
}
async function exportProfile(io, host, profile, destination, progress) {
  if (!profile.items.length) throw new Error("Este perfil está vazio.");
  const folder = await io.folder(C.uid()), files = Object.create(null), resources = [], requirements = new Set([
    "Editable presets: required third-party effects and fonts must be installed separately. / Presets editáveis: instale separadamente os efeitos de terceiros e as fontes necessários.",
    "Opaque effect data and MOGRTs can reference external resources not exposed by Premiere. / Dados internos de efeitos e MOGRTs podem referenciar recursos não expostos pelo Premiere."
  ]);
  const copy = { name: profile.name, items: profile.items.map(cleanAsset) };
  const selected = profile.items.filter(a => a.type === "selection");
  let size = 0;
  if (selected.length) {
    const project = await folder.createFile("library.prproj", { overwrite: false });
    const prepared = await host.exportProfileProject(selected, project.nativePath, progress);
    const identities = prepared.sequences;
    const inspected = inspectProject(await read(io,project,XML_LIMIT));
    const found = new Set(inspected.paths.map(p => normalize(nativeReference(p))));
    for (const media of prepared.media) if (!inspected.generators.has(media) && !found.has(normalize(nativeReference(media)))) mediaError("getMediaFilePath",media);
    for (const source of inspected.paths) {
      progress("Coletando mídias do perfil…");
      const data = await read(io,await io.entry(source)); size += data.length; if (size > LIMIT) fail();
      const ext = source.match(/\.([a-z0-9]{1,8})$/i)[1].toLowerCase(), entry = "media/" + C.uid() + "." + ext;
      files[entry] = data; resources.push({ source, entry });
    }
    files["project/library.prproj"] = transportProject(inspected.xml, resources);
    copy.items.forEach((item,i) => {
      if (item.type !== "selection") return;
      const identity = identities[profile.items[i].id]; if (!identity) fail();
      item.sequenceId = identity.id; item.sequenceName = identity.name; item.entry = "project/library.prproj";
    });
    inspected.effects.forEach(x => requirements.add("Effect / Efeito: " + x));
    inspected.fonts.forEach(x => requirements.add("Font / Fonte: " + x));
  }
  for (let i = 0; i < copy.items.length; i++) {
    const item = copy.items[i], original = profile.items[i];
    if (item.type === "mogrt") {
      const data = await read(io,await io.checkPayload(original)); size += data.length; if (size > LIMIT) fail();
      item.entry = "mogrt/" + C.uid() + ".mogrt"; files[item.entry] = data;
    }
    for (const c of item.clips || []) for (const comp of c.components || []) requirements.add("Effect / Efeito: " + comp[0]);
  }
  const notes = Array.from(requirements); files["requirements.txt"] = Z.strToU8(notes.join("\r\n"));
  progress("Montando pacote portátil…");
  const archive = pack(copy,files,notes); await write(io,destination,archive);
  unpack(await read(io,destination));
  return notes;
}
async function importProfile(io, library, source, progress) {
  progress("Conferindo pacote portátil…");
  const { manifest, files } = unpack(await read(io,source));
  const generators = files["project/library.prproj"] ? Array.from(generatedPaths(readProject(files["project/library.prproj"]))) : [];
  const folder = await io.folder(C.uid()), paths = Object.create(null), entries = Object.create(null);
  // Flatten only validated, unique generated names into our new private folder.
  for (const name of Object.keys(files)) {
    if (name === "manifest.json" || name === "requirements.txt") continue;
    const entry = await folder.createFile(name.replace(/\//g,"-"), { overwrite: false });
    entries[name] = entry; paths[name] = entry.nativePath;
  }
  for (const name of Object.keys(entries)) {
    progress("Copiando perfil para a biblioteca…");
    const data = name === "project/library.prproj" ? localProject(files[name],paths) : files[name];
    await write(io,entries[name],data);
  }
  const profile = { name: manifest.profile.name, items: manifest.profile.items.map(item => {
    const asset = cleanAsset(item);
    asset.file = paths[item.entry]; asset.portable = true;
    asset.portableMedia = Object.keys(paths).filter(name => name.startsWith("media/")).map(name => paths[name]);
    asset.portableGenerators = generators.slice();
    asset.requirements = manifest.requirements.slice();
    return asset;
  }) };
  for (const asset of profile.items) asset.check = C.checksum(await read(io,await io.entry(asset.file)));
  await library.importProfile(profile); // Journal commit LAST: no partial profiles.
  return manifest.requirements;
}
async function inspectArchive(io,file) { return unpack(await read(io,file)); }
module.exports = { LIMIT, pack, unpack, readProject, writeProject, inspectProject, transportProject, localProject, exportProfile, importProfile, inspectArchive };
