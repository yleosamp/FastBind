/* Pure functions: no Premiere, clipboard, disk or UI. Decimal ticks avoid loss
 * of precision in long sequences and work without BigInt in UXP. */
"use strict";

function tick(value) {
  const s = String(value);
  if (!/^-?\d+$/.test(s)) throw new Error("Tempo inválido: " + s);
  const a = s.replace(/^-/, "").replace(/^0+(?=\d)/, "");
  return s[0] === "-" && a !== "0" ? "-" + a : a;
}
function absCmp(a, b) { return a.length === b.length ? (a === b ? 0 : a < b ? -1 : 1) : a.length < b.length ? -1 : 1; }
function cmp(a, b) {
  a = tick(a); b = tick(b);
  const an = a[0] === "-", bn = b[0] === "-";
  if (an !== bn) return an ? -1 : 1;
  const c = absCmp(an ? a.slice(1) : a, bn ? b.slice(1) : b);
  if (c === 0) return 0;
  return an ? -c : c;
}
function absAdd(a, b) {
  let i = a.length - 1, j = b.length - 1, carry = 0, r = "";
  while (i >= 0 || j >= 0 || carry) {
    const n = (i >= 0 ? Number(a[i--]) : 0) + (j >= 0 ? Number(b[j--]) : 0) + carry;
    r = String(n % 10) + r; carry = Math.floor(n / 10);
  }
  return r;
}
function absSub(a, b) {
  let j = b.length - 1, borrow = 0, r = "";
  for (let i = a.length - 1; i >= 0; i--) {
    let n = Number(a[i]) - borrow - (j >= 0 ? Number(b[j--]) : 0);
    borrow = n < 0 ? 1 : 0; if (borrow) n += 10;
    r = String(n) + r;
  }
  return r.replace(/^0+(?=\d)/, "");
}
function negate(a) { a = tick(a); return a === "0" ? "0" : a[0] === "-" ? a.slice(1) : "-" + a; }
function add(a, b) {
  a = tick(a); b = tick(b);
  const an = a[0] === "-", bn = b[0] === "-";
  const aa = an ? a.slice(1) : a, bb = bn ? b.slice(1) : b;
  if (an === bn) return tick((an ? "-" : "") + absAdd(aa, bb));
  const c = absCmp(aa, bb);
  if (!c) return "0";
  return tick((c > 0 ? (an ? "-" : "") : (bn ? "-" : "")) + (c > 0 ? absSub(aa, bb) : absSub(bb, aa)));
}
function sub(a, b) { return add(a, negate(b)); }
function snapTicks(value, quantum) {
  const s = tick(value), q = Number(tick(quantum));
  if (!Number.isSafeInteger(q) || q <= 0 || q > Math.floor(Number.MAX_SAFE_INTEGER / 10)) throw new Error("Grade de amostras de áudio inválida.");
  const negative = s[0] === "-", digits = negative ? s.slice(1) : s;
  // Only the small remainder is numeric. Absolute sequence ticks may exceed
  // 2^53, so converting the whole timestamp to Number would lose precision.
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % q;
  let snapped = sub(digits, String(remainder));
  if (remainder * 2 >= q) snapped = add(snapped, String(q));
  return negative ? negate(snapped) : snapped;
}
function overlap(a, b) { return cmp(a.start, b.end) < 0 && cmp(b.start, a.end) < 0; }
function validateClip(c) {
  if (!c || !["video", "audio"].includes(c.kind) || !Number.isInteger(c.track) || c.track < 0) throw new Error("Clipe/faixa inválido.");
  ["start", "end", "in", "out"].forEach(k => tick(c[k]));
  if (cmp(c.start, "0") < 0 || cmp(c.end, c.start) <= 0) throw new Error("Duração inválida.");
}
function bounds(clips) {
  if (!Array.isArray(clips) || !clips.length || clips.length > 512) throw new Error("Selecione entre 1 e 512 clipes.");
  clips.forEach(validateClip);
  return { start: clips.reduce((v, c) => cmp(c.start, v) < 0 ? c.start : v, clips[0].start),
    end: clips.reduce((v, c) => cmp(c.end, v) > 0 ? c.end : v, clips[0].end) };
}
function ranks(clips, kind) { return [...new Set(clips.filter(c => c.kind === kind).map(c => c.track))].sort((a, b) => a - b); }
function signature(c) {
  return JSON.stringify([c.kind, c.track, tick(c.start), tick(c.end), tick(c.in), tick(c.out),
    c.name, c.disabled, c.adjustment, c.speed, c.reversed, c.components]);
}
function sameClips(a, b) { return JSON.stringify(a.map(signature).sort()) === JSON.stringify(b.map(signature).sort()); }
function anchor(clips, playhead) {
  const b = bounds(clips);
  return cmp(playhead, b.start) >= 0 && cmp(playhead, b.end) < 0 ? tick(playhead) : b.start;
}
function chooseBase(tracks, count, span, forceFresh) {
  if (!count) return null;
  let highest = -1;
  const obstacles = t => t.clips.concat(t.transitions || []);
  tracks.forEach((t, i) => { if (t.opaqueTransitions || obstacles(t).some(c => overlap(c, span))) highest = i; });
  // Treat muted tracks as occupied choices. Disabled clips and transitions
  // still count as obstacles: they may be enabled in a later revision.
  if (!forceFresh) {
    for (let base = highest + 1; base + count <= tracks.length; base++) {
      const bank = tracks.slice(base, base + count);
      if (bank.every(t => !t.muted && !t.opaqueTransitions && !obstacles(t).some(c => overlap(c, span)))) return base;
    }
  }
  return tracks.length;
}
function plan(clips, sourceAnchor, playhead, snapshot, forceFresh, transitions, audioSampleTicks) {
  bounds(clips);
  const offset = sub(playhead, sourceAnchor);
  const moved = clips.map(c => Object.assign({}, c, { start: add(c.start, offset), end: add(c.end, offset) }));
  // A stored audio sample can precede its video/playhead anchor by less
  // than half a sample. If the requested position rounds EXACTLY to zero,
  // it is a valid first sample, not a truncated pre-roll. Videos and any
  // genuinely negative sample remain forbidden. Existing clips are untouched.
  if (moved.some(c => cmp(c.start, "0") < 0 && !(c.kind === "audio" && audioSampleTicks != null && snapTicks(c.start, audioSampleTicks) === "0"))) throw new Error("O pacote começaria antes do início da sequência. Avance o playhead.");
  const rawSpan = bounds(moved.map(c => cmp(c.start, "0") < 0 ? Object.assign({}, c, { start: "0" }) : c));
  if (audioSampleTicks != null) moved.forEach(c => {
    if (c.kind !== "audio") return;
    ["start", "end", "in", "out"].forEach(k => { c[k] = snapTicks(c[k], audioSampleTicks); });
    if (cmp(c.end, c.start) <= 0 || cmp(c.out, c.in) <= 0) throw new Error("Um áudio ficou menor que uma amostra; nada foi inserido.");
  });
  const span = bounds(moved), bank = {}, bases = {};
  // Protect both requested and sample-rounded bounds. This is NOT a fuzzy
  // comparison or permission to normalize any pre-existing timeline clips.
  if (cmp(rawSpan.start, span.start) < 0) span.start = rawSpan.start;
  if (cmp(rawSpan.end, span.end) > 0) span.end = rawSpan.end;
  (transitions || []).forEach(t => {
    const start = add(t.start, offset), end = add(t.end, offset);
    if (cmp(start, "0") < 0) throw new Error("Uma transição começaria antes da sequência. Avance o playhead.");
    if (cmp(start, span.start) < 0) span.start = start;
    if (cmp(end, span.end) > 0) span.end = end;
  });
  ["video", "audio"].forEach(kind => {
    bank[kind] = ranks(clips, kind);
    if (bank[kind].length > 64) throw new Error("O pacote excede 64 faixas por tipo.");
    bases[kind] = chooseBase(snapshot[kind], bank[kind].length, span, forceFresh);
  });
  const placements = moved.map((c, i) => {
    const track = bases[c.kind] + bank[c.kind].indexOf(c.track);
    const target = Object.assign({}, c, { track });
    const existing = snapshot[c.kind][track];
    if (existing && (existing.opaqueTransitions || existing.clips.some(x => overlap(x, target)))) throw new Error("Colisão detectada; nada foi inserido.");
    return { sourceIndex: i, track, sourceTrack: clips[i].track, kind: c.kind, offset, expected: target };
  });
  return { placements, expected: placements.map(p => p.expected), bases, span, offset, audioSampleTicks: audioSampleTicks == null ? null : tick(audioSampleTicks) };
}
function allClips(snapshot) { return ["video", "audio"].reduce((all, k) => all.concat(...snapshot[k].map(t => t.clips)), []); }
function verify(before, after, expected) {
  // Compare multisets, not just clip counts: catches overwrite, ripple, linked
  // side effects, duplicates, truncation and unexpected extra audio.
  const opaqueUnchanged = ["video", "audio"].every(kind => {
    const count = Math.max(before[kind].length, after[kind].length);
    for (let i = 0; i < count; i++) if (((before[kind][i] || {}).opaqueTransitions || 0) !== ((after[kind][i] || {}).opaqueTransitions || 0)) return false;
    return true;
  });
  return opaqueUnchanged && sameClips(allClips(before).concat(expected), allClips(after));
}
function verificationDiff(before, after, expected) {
  const wanted = allClips(before).concat(expected), actual = allClips(after);
  function subtract(a, b) {
    const bag = new Map();
    b.forEach(c => { const key = signature(c); bag.set(key, (bag.get(key) || 0) + 1); });
    return a.filter(c => { const key = signature(c), n = bag.get(key) || 0; if (n) { bag.set(key, n - 1); return false; } return true; });
  }
  const trackView = s => ["video", "audio"].reduce((all, kind) => all.concat(s[kind].map((t, index) => ({ kind, index,
    clips: t.clips.length, transitions: (t.transitions || []).length, opaqueTransitions: t.opaqueTransitions || 0 }))), []);
  return { expectedCount: wanted.length, actualCount: actual.length,
    missing: subtract(wanted, actual).slice(0, 6), unexpected: subtract(actual, wanted).slice(0, 6),
    beforeTracks: trackView(before), afterTracks: trackView(after) };
}
function uid() { return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10); }
function name(value) {
  const s = String(value || "").trim();
  if (!s || s.length > 100 || /[\x00-\x1f]/.test(s)) throw new Error("Use um nome de 1 a 100 caracteres.");
  return s;
}
function checksum(buffer) {
  const bytes = new Uint8Array(buffer); let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619); }
  return bytes.length + ":" + (h >>> 0).toString(16);
}
function textChecksum(value) {
  // UXP does not provide TextEncoder on all supported builds.
  const s = unescape(encodeURIComponent(value)), bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return checksum(bytes);
}
module.exports = { tick, cmp, add, sub, snapTicks, overlap, bounds, ranks, signature, sameClips, anchor, plan, allClips, verify, verificationDiff, uid, name, checksum, textChecksum };
