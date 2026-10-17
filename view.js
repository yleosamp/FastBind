"use strict";
// Presentation only. Never edits native clips, package files or host settings.
const PALETTE = ["#729CCB", "#22CE9A", "#23BCD6", "#F365A0", "#48B650", "#D4C797", "#A38BDC", "#EDA830", "#E37DDD", "#D85C57", "#749483", "#A0A0A0"];
function validColor(value) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value); }
function itemColor(item) {
  if (item.color === null) return "#414141";
  if (validColor(item.color)) return item.color;
  let hash = 0;
  for (const c of String(item.id || item.name || "")) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
function clipColor(clip) { return clip.kind === "audio" ? "#EDA830" : clip.adjustment ? "#F365A0" : "#23BCD6"; }
function duration(ticks) { const n = Number(ticks); return Number.isFinite(n) && n > 0 ? (n / 254016000000).toFixed(2) + " s" : ""; }
function groups(item) {
  if (item.type === "mogrt" && !Array.isArray(item.clips)) {
    const name = String(item.file || item.name || "Template").split(/[\\/]/).pop();
    return [{ label: "MOGRT", kind: "mogrt", clips: [{ name, kind: "mogrt" }] }];
  }
  return ["video", "audio"].map(kind => ({ kind, label: kind === "video" ? "Vídeo" : "Áudio",
    clips: (item.clips || []).filter(c => c.kind === kind) })).filter(g => g.clips.length);
}
function matches(item, query) {
  const q = String(query || "").trim().toLocaleLowerCase();
  return !q || String(item.name || "").toLocaleLowerCase().includes(q) || groups(item).some(g => g.clips.some(c => String(c.name || "").toLocaleLowerCase().includes(q)));
}
function clipInfo(clip) {
  const track = Number.isInteger(clip.track) ? (clip.kind === "audio" ? "A" : "V") + (clip.track + 1) : "";
  const label = clip.kind === "mogrt" ? "Modelo MOGRT" : clip.kind === "audio" ? "Áudio" : clip.adjustment ? "Adjustment layer" : "Vídeo";
  const effects = (clip.components || []).map(c => c[0]).filter(Boolean).join(", ");
  return { track, hint: [label, track, effects, clip.disabled ? "Desativado" : ""].filter(Boolean).join(" • ") };
}
module.exports = { PALETTE, validColor, itemColor, clipColor, duration, groups, matches, clipInfo };
