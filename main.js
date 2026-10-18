/* Premiere UXP entrypoint. Optional release metadata check; no remote code. */
"use strict";
const uxp = require("uxp"), ppro = require("premierepro");
const C = require("./core.js"), V = require("./view.js"), I = require("./locale.js"), { Library, UxpIO } = require("./library.js"), { Host } = require("./host.js");
const U = require("./updates.js"), manifest = require("./manifest.json");
let io, library, host, busy = true, selected = null, ready = false, dialogActive = false, paletteFor = null;
let updateChecker = null, updatesReady = false, updateChecking = false, updateOpening = false, updateManualError = false, updateManualDone = false;
const locale = I.create({ preference: "auto", hostLocale: I.detectHostLocale(uxp) });
const tr = (text, vars) => locale.t(text, vars);
let lastStatus = "Duplo clique no nome para inserir.", lastStatusType = "";
const expanded = new Set(), rows = new Map(), disabled = new WeakSet();
let drag = null, suppressInsertUntil = 0;
const $ = id => document.getElementById(id);
function status(text, type) { lastStatus = text; lastStatusType = type || ""; $("status").textContent = locale.message(text); $("status").className = lastStatusType; }
function localize() {
  const labels = { save: "Salvar seleção", "new-profile": "+ Novo perfil", insert: "Inserir selecionado", "rename-item": "Renomear selecionado",
    "rename-profile": "Renomear perfil", "archive-item": "Remover selecionado", "restore-item": "Restaurar último removido",
    "export-profile": "Exportar perfil…", "import-profile": "Importar perfil…",
    "language-label": "Idioma / Language", "language-auto": "Automático (Premiere)", "dialog-cancel": "Cancelar" };
  Object.keys(labels).forEach(id => { $(id).textContent = tr(labels[id]); });
  const titles = { "expand-all": "Expandir ou recolher todos", mogrt: "Adicionar MOGRT", "open-folder": "Local da biblioteca", "menu-toggle": "Opções", "search-clear": "Limpar busca", profile: "Perfil da biblioteca" };
  Object.keys(titles).forEach(id => { $(id).title = tr(titles[id]); $(id).setAttribute("aria-label", tr(titles[id])); });
  $("save").title = tr("Salva a seleção nativa e também o projeto atual do Premiere.");
  $("search").setAttribute("placeholder", tr("Buscar presets e arquivos…"));
  $("search").setAttribute("aria-label", tr("Buscar presets e arquivos…"));
  $("list").setAttribute("aria-label", tr("Presets salvos"));
  ["pt", "en"].forEach(lang => $("language-" + lang).setAttribute("aria-pressed", String(locale.language === lang)));
  $("language-auto").setAttribute("aria-pressed", String(locale.preference === "auto"));
  $("language-detected").textContent = locale.preference === "auto" ? tr("Premiere: {language}", { language: locale.language === "pt" ? "Português" : "English" }) : tr("Idioma manual");
  if (document.documentElement) document.documentElement.setAttribute("lang", locale.language === "pt" ? "pt-BR" : "en");
  status(lastStatus, lastStatusType); renderUpdates();
}
function availableUpdate() {
  const state = updateChecker && updateChecker.state, release = state && state.available && state.release;
  return release && U.releaseURL(release.tag) === release.url ? release : null;
}
function renderUpdates() {
  const release = availableUpdate();
  $("version").textContent = "FastBind " + manifest.version;
  $("update-available").hidden = !release;
  $("update-available").textContent = tr("↑ Atualizar");
  $("update-available").title = release ? tr("Versão {version} disponível. Abrir release no GitHub.", { version: release.version }) : "";
  $("update-available").setAttribute("aria-label", $("update-available").title);
  $("check-updates").textContent = tr(updateChecking ? "Verificando atualizações…" : "Verificar atualizações");
  $("update-state").textContent = updateManualError ? tr("Não foi possível verificar agora. Tente mais tarde.") :
    release ? tr("Nova versão: {version}", { version: release.version }) : updateManualDone ? tr("Você já está na versão mais recente.") :
    tr("Versão instalada: {version}", { version: manifest.version });
}
async function checkUpdates(force) {
  if (!updatesReady || updateChecking || !updateChecker) return;
  updateChecking = true; updateManualError = false; updateManualDone = false; renderUpdates(); controls();
  try {
    const result = await updateChecker.check({ force: !!force });
    updateManualError = !!force && !!result.error;
    updateManualDone = !!force && !result.error;
  } catch (_) { updateManualError = !!force; /* Advisory only; editing stays available. */ }
  finally { updateChecking = false; renderUpdates(); controls(); }
}
async function startUpdates() {
  try {
    updateChecker = new U.UpdateChecker({ version: manifest.version, io, fetch: typeof fetch === "function" ? ((url, options) => fetch(url, options)) : undefined });
    await updateChecker.init(); updatesReady = true; renderUpdates(); controls();
    // Never await the network from boot or a native editing operation.
    checkUpdates(false);
  } catch (_) { updateChecker = null; updatesReady = false; renderUpdates(); controls(); }
}
async function openUpdate() {
  if (busy || !ready || dialogActive || updateOpening) return;
  const release = availableUpdate(); if (!release) return;
  updateOpening = true; controls();
  try {
    // URL is derived from a strict stable tag in our own repository, never an
    // arbitrary html_url, asset link or executable returned by the network.
    if (!uxp.shell || typeof uxp.shell.openExternal !== "function") throw new Error(tr("Não foi possível abrir o navegador. Tente novamente."));
    const error = await uxp.shell.openExternal(release.url, tr("Abrir a página oficial do FastBind no GitHub para baixar a atualização."));
    if (error) throw new Error(tr("Não foi possível abrir o navegador. Tente novamente."));
  } catch (_) {
    $("update-state").textContent = tr("Não foi possível abrir o navegador. Tente novamente.");
    status("Não foi possível abrir o navegador. Tente novamente.", "error");
  } finally { updateOpening = false; controls(); }
}
async function setLanguage(preference) {
  // Preferences are independent of the library journals: no preset migration.
  await io.writeJSON("settings.json", { schema: 1, language: preference });
  locale.setPreference(preference); localize(); status("Idioma atualizado.");
}
function currentItem() { return library && library.profile().items.find(x => x.id === selected); }
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}
function disable(node, value) {
  if (value) disabled.add(node); else disabled.delete(node);
  node.setAttribute("aria-disabled", String(!!value));
  if (node === $("search")) node.disabled = !!value;
}
function activate(node, fn) {
  node.addEventListener("click", e => {
    e.stopPropagation();
    // The second pointer click of a native double click must not repeat an
    // action that already finished quickly. Header double click is separate.
    if (!(e.detail > 1) && !disabled.has(node)) fn(e);
  });
  node.addEventListener("dblclick", e => e.stopPropagation());
  node.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault(); e.stopPropagation();
    if (!e.repeat && !disabled.has(node)) fn(e);
  });
}
function button(text, className, label, fn) {
  const node = element("div", "button " + className, text);
  node.setAttribute("role", "button"); node.setAttribute("tabindex", "0");
  node.setAttribute("aria-label", label); node.title = label;
  activate(node, fn); return node;
}
function controls() {
  ["save", "mogrt", "profile", "new-profile", "menu-toggle", "open-folder", "expand-all", "search", "search-clear", "language-pt", "language-en", "language-auto", "export-profile", "import-profile"].forEach(id => disable($(id), busy || !ready));
  disable($("insert"), busy || !ready || !currentItem());
  disable($("check-updates"), busy || !ready || !updatesReady || updateChecking);
  disable($("update-available"), busy || !ready || updateOpening || !availableUpdate());
  ["rename-item", "archive-item"].forEach(id => disable($(id), busy || !ready || !currentItem()));
  rows.forEach(ref => {
    [ref.toggle, ref.color, ref.remove].forEach(n => disable(n, busy || !ready));
    disable(ref.insert, busy || !ready);
    Array.from(ref.palette.children).forEach(n => disable(n, busy || !ready));
  });
}
function key(id) { return library.profile().id + ":" + id; }
function closePopups() {
  $("menu").hidden = true; $("profiles-menu").hidden = true;
  $("profile").setAttribute("aria-expanded", "false"); $("menu-toggle").setAttribute("aria-expanded", "false");
}
function selectRow(id) {
  selected = rows.has(id) ? id : null;
  rows.forEach((ref, rowId) => {
    ref.row.className = "item" + (rowId === selected ? " selected" : "");
    ref.row.setAttribute("aria-selected", String(rowId === selected));
  });
  controls();
}
function toggleItem(id, value) {
  const ref = rows.get(id); if (!ref) return;
  const open = value == null ? !expanded.has(key(id)) : value;
  if (open) expanded.add(key(id)); else expanded.delete(key(id));
  if (open && !ref.contentsBuilt) { drawContents(ref.item, ref.contents); ref.contentsBuilt = true; }
  ref.contents.hidden = !open; ref.arrow.textContent = open ? "⌄" : "›";
  ref.toggle.setAttribute("aria-expanded", String(open));
  ref.toggle.title = tr(open ? "Recolher {name}" : "Ver conteúdo de {name}", { name: ref.name });
}
function fillPalette(item, target) {
  target.innerHTML = "";
  V.PALETTE.concat([null]).forEach(color => {
    const choice = button("", "swatch-choice", color || tr("Sem cor"), () => run(async () => {
      await library.setColor(item.id, color); paletteFor = null; status("Cor atualizada.");
    }));
    choice.setAttribute("data-color", color || "none");
    choice.setAttribute("aria-pressed", String(color === null ? item.color === null : V.itemColor(item).toUpperCase() === color));
    const chip = element("span", "color-chip" + (color === null ? " no-color" : ""));
    if (color) chip.style.backgroundColor = color;
    choice.appendChild(chip); target.appendChild(choice);
  });
}
function showPalette(item) {
  if (busy) return;
  selectRow(item.id); closePopups();
  paletteFor = paletteFor === item.id ? null : item.id;
  rows.forEach((ref, id) => {
    ref.palette.hidden = id !== paletteFor;
    if (id === paletteFor) fillPalette(item, ref.palette);
    ref.color.setAttribute("aria-expanded", String(id === paletteFor));
  });
}
function drawContents(item, target) {
  const groups = V.groups(item);
  groups.forEach(group => {
    target.appendChild(element("div", "group-title", locale.message(group.label)));
    group.clips.forEach(clip => {
      const line = element("div", "clip-row"), chip = element("span", "color-chip"), info = V.clipInfo(clip);
      chip.style.backgroundColor = group.kind === "mogrt" ? "#A38BDC" : V.clipColor(clip);
      const name = element("span", "clip-name", clip.name || tr(clip.kind === "audio" ? "Áudio" : "Vídeo"));
      line.title = [String(clip.name || ""), locale.message(info.hint)].filter(Boolean).join(" • ");
      line.appendChild(chip); line.appendChild(name);
      if (info.track) line.appendChild(element("span", "clip-track", info.track));
      target.appendChild(line);
    });
  });
  if (item.type === "mogrt") target.appendChild(element("div", "mogrt-note", tr("O conteúdo interno é definido pelo template.")));
  else if (!groups.length) target.appendChild(element("div", "mogrt-note", tr("Nenhum clipe listado neste pacote.")));
  const destinations = library.data.profiles.filter(p => p.id !== library.profile().id);
  if (item.requirements && item.requirements.length) {
    target.appendChild(button(tr("Ver requisitos…"), "move-item", tr("Fontes e efeitos necessários"), () => run(async () => {
      await ask("Requisitos do perfil", "", item.requirements.join("\n"), "info");
    })));
  }
  if (destinations.length) {
    const choices = element("div", "move-targets"); choices.hidden = true;
    const move = button(tr("Mover para perfil…"), "move-item", tr("Mover para outro perfil"), () => {
      if (!busy) { choices.hidden = !choices.hidden; move.setAttribute("aria-expanded", String(!choices.hidden)); }
    });
    move.setAttribute("aria-expanded", "false");
    destinations.forEach(profile => choices.appendChild(button(profile.name, "menu-entry", profile.name, () => run(async () => {
      const oldKey = key(item.id); await library.moveItem(item.id, profile.id);
      expanded.delete(oldKey); selected = null;
      status(tr("Seleção movida para {name}.", { name: profile.name }), "success");
    }))));
    target.appendChild(move); target.appendChild(choices);
  }
}
function clearDrag() {
  if (drag && drag.slot && drag.slot.parentElement) drag.slot.parentElement.removeChild(drag.slot);
  $("list").removeAttribute("data-reordering");
  rows.forEach(ref => { ref.row.style.transform = ""; ref.row.removeAttribute("data-drop"); ref.row.removeAttribute("data-dragging"); });
  drag = null;
}
function startDrag(item, event) {
  if (busy || event.button !== 0) return;
  drag = { id: item.id, profile: library.profile().id, x: event.clientX, y: event.clientY, active: false, target: null };
}
function moveDrag(event) {
  if (!drag || busy) return;
  if (typeof event.buttons === "number" && event.buttons === 0) { clearDrag(); return; }
  if (!drag.active && Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) < 6) return;
  event.preventDefault();
  suppressInsertUntil = Date.now() + 600;
  const scroller = $("scroller");
  if (!drag.active) {
    // Measure once, before any transforms. Pointer movement then uses only
    // cached geometry + scroll offset; no rebuild, timers or native host calls.
    drag.active = true; drag.scroll = scroller.scrollTop;
    drag.bounds = scroller.getBoundingClientRect();
    drag.listTop = $("list").getBoundingClientRect().y + drag.scroll;
    drag.entries = Array.from(rows.entries()).map(([id,ref]) => {
      const box = ref.row.getBoundingClientRect(); return { id, row: ref.row, top: box.y + drag.scroll, height: box.height };
    });
    drag.sourceIndex = drag.entries.findIndex(entry => entry.id === drag.id);
    const source = drag.entries[drag.sourceIndex], next = drag.entries[drag.sourceIndex + 1], previous = drag.entries[drag.sourceIndex - 1];
    drag.span = source.height + Math.max(0,next ? next.top - source.top - source.height : previous ? source.top - previous.top - previous.height : 5);
    drag.remaining = drag.entries.filter(entry => entry.id !== drag.id).map(entry => Object.assign({},entry, {
      compactTop: entry.top - (entry.top > source.top ? drag.span : 0)
    }));
    drag.slot = element("div", "drag-slot"); drag.slot.setAttribute("aria-hidden","true");
    drag.slot.style.height = source.height + "px"; $("list").appendChild(drag.slot);
    $("list").setAttribute("data-reordering","true"); source.row.setAttribute("data-dragging","true");
  }
  const rect = drag.bounds;
  if (event.clientY < rect.y + 28) scroller.scrollTop -= 16;
  else if (event.clientY > rect.y + rect.height - 28) scroller.scrollTop += 16;
  const contentY = event.clientY + scroller.scrollTop, list = drag.remaining;
  let at = list.findIndex(entry => contentY < entry.compactTop + entry.height / 2);
  if (at < 0) at = list.length;
  drag.target = list.length ? at < list.length ? {id:list[at].id,after:false} : {id:list[list.length-1].id,after:true} : null;
  if (drag.previewIndex !== at) {
    drag.previewIndex = at;
    drag.entries.forEach((entry,index) => {
      if (index === drag.sourceIndex) return;
      const shift = at < drag.sourceIndex && index >= at && index < drag.sourceIndex ? drag.span :
        at > drag.sourceIndex && index > drag.sourceIndex && index <= at ? -drag.span : 0;
      entry.row.style.transform = "translateY(" + shift + "px)";
    });
    const source = drag.entries[drag.sourceIndex];
    const top = at < list.length ? list[at].compactTop : list.length ? list[list.length-1].compactTop + list[list.length-1].height + (drag.span-source.height) : source.top;
    drag.slot.style.top = (top-drag.listTop) + "px";
  }
  drag.entries[drag.sourceIndex].row.style.transform = "translateY(" + (contentY-drag.y-drag.scroll) + "px)";
}
function finishDrag() {
  const dropped = drag; clearDrag();
  if (!dropped || !dropped.active || !dropped.target || dropped.profile !== library.profile().id) return;
  if (dropped.previewIndex === dropped.sourceIndex) return;
  run(async () => { await library.reorderItem(dropped.id, dropped.target.id, dropped.target.after); status("Ordem salva.", "success"); });
}
function render() {
  clearDrag();
  const scroll = $("scroller").scrollTop || 0, profile = library.profile();
  $("profile").textContent = profile.name; $("profile").title = tr("Perfil: {name}", { name: profile.name });
  $("search-clear").hidden = !$("search").value;
  $("profile-list").innerHTML = "";
  library.data.profiles.forEach(p => {
    const option = button(p.name, "menu-entry" + (p.id === profile.id ? " active" : ""), tr("Abrir perfil {name}", { name: p.name }), () => run(async () => {
      await library.select(p.id); selected = null; paletteFor = null;
    }));
    option.setAttribute("data-profile", p.id); $("profile-list").appendChild(option);
  });
  const items = profile.items.filter(x => V.matches(x, $("search").value));
  if (!items.some(item => item.id === selected)) selected = null;
  if (!items.some(item => item.id === paletteFor)) paletteFor = null;
  $("list").innerHTML = ""; rows.clear();
  items.forEach(item => {
    const row = element("div", "item" + (item.id === selected ? " selected" : ""));
    row.style.borderColor = V.itemColor(item);
    row.setAttribute("role", "listitem"); row.setAttribute("data-id", item.id);
    row.setAttribute("aria-selected", String(item.id === selected));
    const head = element("div", "item-head"); head.setAttribute("tabindex", "0");
    head.setAttribute("aria-label", tr("{name}. Duplo clique ou Enter para inserir.", { name: item.name }));
    const toggle = button("", "chevron-button", tr("Ver conteúdo de {name}", { name: item.name }), () => toggleItem(item.id));
    const arrow = element("span", "chevron"); toggle.appendChild(arrow);
    const color = button("", "color-button", tr("Mudar cor de {name}", { name: item.name }), () => showPalette(item));
    const chip = element("span", "color-chip" + (item.color === null ? " no-color" : ""));
    if (item.color !== null) chip.style.backgroundColor = V.itemColor(item);
    color.appendChild(chip); color.setAttribute("aria-expanded", String(paletteFor === item.id));
    const name = element("div", "item-name", item.name);
    name.addEventListener("mousedown", event => startDrag(item, event));
    name.title = [item.name, tr("Arraste o nome para reordenar."), V.duration(item.duration), item.warnings ? item.warnings.join(" ") : ""].filter(Boolean).join(" • ");
    const actions = element("div", "item-actions");
    const insertButton = button(tr("Inserir"), "row-insert", tr("Inserir {name}", { name: item.name }), () => { selectRow(item.id); run(insert); });
    const remove = button(tr("Remover"), "row-remove", tr("Remover {name} da biblioteca (recuperável)", { name: item.name }), () => run(async () => {
      await library.archive(item.id); if (selected === item.id) selected = null;
      if (paletteFor === item.id) paletteFor = null;
      status("Removido da lista. Você pode restaurar nas opções.");
    }));
    actions.appendChild(insertButton); actions.appendChild(remove);
    head.appendChild(toggle); head.appendChild(color); head.appendChild(name); head.appendChild(actions);
    const palette = element("div", "palette"); palette.hidden = paletteFor !== item.id;
    if (!palette.hidden) fillPalette(item, palette);
    const contents = element("div", "item-contents");
    row.appendChild(head); row.appendChild(palette); row.appendChild(contents);
    row.addEventListener("click", () => { if (!busy) { closePopups(); selectRow(item.id); } });
    head.addEventListener("dblclick", e => { e.stopPropagation(); if (!busy && Date.now() >= suppressInsertUntil) { selectRow(item.id); run(insert); } });
    head.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (!e.repeat && !busy) { selectRow(item.id); run(insert); } }
    });
    rows.set(item.id, { row, head, toggle, arrow, color, palette, contents, contentsBuilt: false, item, insert: insertButton, remove, name: item.name });
    $("list").appendChild(row); toggleItem(item.id, expanded.has(key(item.id)));
  });
  $("empty").hidden = items.length > 0;
  $("empty").textContent = tr($("search").value.trim() ? "Nenhum preset ou arquivo encontrado." : "Selecione os ajustes e o áudio na timeline e clique em Salvar seleção.");
  $("scroller").scrollTop = scroll; controls();
}
async function run(fn) {
  if (busy || !ready) return;
  clearDrag();
  busy = true; closePopups(); controls();
  try { await fn(); }
  catch (error) {
    status(error.message || String(error), "error"); console.error("FastBind", error);
    try { await io.recordDiagnostic(error, "panel"); } catch (_) { /* Diagnostics must never hide the original error. */ }
  }
  finally { busy = false; render(); }
}
async function ask(label, initial, hint, confirmation) {
  if (dialogActive) throw new Error(tr("Aguarde o fechamento da janela anterior."));
  dialogActive = true;
  const dialog = $("name-dialog"), input = $("dialog-input");
  let chosen = null, closing = false, nativeClosed = false;
  try {
    $("dialog-label").textContent = locale.message(label); input.value = initial || ""; input.hidden = !!confirmation;
    $("dialog-field-label").textContent = tr(label === "Salvar seleção" ? "Nome do preset" : "Nome");
    $("dialog-field-label").hidden = !!confirmation;
    $("dialog-hint").textContent = locale.message(hint || "");
    $("dialog-ok").textContent = tr(confirmation === "info" ? "Fechar" : confirmation ? "Continuar" : "Salvar");
    $("dialog-cancel").textContent = tr("Cancelar"); $("dialog-cancel").hidden = confirmation === "info";
    const validate = () => disable($("dialog-ok"), !confirmation && !input.value.trim());
    validate(); input.oninput = validate;
    const finish = value => {
      if (closing) return;
      closing = true; chosen = value;
      dialog.close(value === null ? "cancel" : "ok");
    };
    const accept = () => { if (confirmation || input.value.trim()) finish(confirmation ? true : input.value.trim()); };
    $("dialog-ok").onclick = accept;
    $("dialog-cancel").onclick = () => finish(null);
    ["dialog-ok", "dialog-cancel"].forEach(id => {
      $(id).onkeydown = e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault(); e.stopPropagation();
        if (!e.repeat) { if (id === "dialog-ok") accept(); else finish(null); }
      };
    });
    dialog.oncancel = e => { e.preventDefault(); finish(null); };
    input.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (!e.repeat) accept(); } };
    if (typeof dialog.uxpShowModal !== "function") throw new Error("O Premiere não disponibilizou a janela modal UXP. Salve o trabalho e reinicie o Premiere.");
    // Do not resolve on the button click. Adobe closes the native window
    // asynchronously; only this Promise confirms that a next dialog is safe.
    // Keep the native window and CSS dialog at the same width. A wider native
    // container leaves an empty strip beside the content in Premiere UXP.
    const modal = dialog.uxpShowModal({ title: "FastBind", resize: "none", size: { width: 380, height: 300 } });
    if (!confirmation) input.focus(); else $("dialog-ok").focus();
    const dismissed = await modal;
    nativeClosed = true;
    return dismissed === "ok" ? chosen : null;
  } finally {
    $("dialog-ok").onclick = null; $("dialog-cancel").onclick = null;
    input.onkeydown = null; input.oninput = null; dialog.oncancel = null;
    $("dialog-ok").onkeydown = null; $("dialog-cancel").onkeydown = null;
    if (nativeClosed && typeof dialog.removeAttribute === "function") dialog.removeAttribute("open");
    dialogActive = false;
  }
}
async function insert() {
  const item = currentItem(); if (!item) return;
  const result = await host.insert(item, status);
  if (result.verified === false) status("Inserção enviada ao Premiere.");
  else if (result.warning) status(result.warning);
  else status(tr("Inserido • {count} clipes em faixas livres.", { count: result.count }) + (item.warnings ? tr(" Confira os fades nativos deste pacote.") : ""), "success");
}
function bind() {
  if (typeof document.addEventListener === "function") {
    document.addEventListener("mousemove", moveDrag);
    document.addEventListener("mouseup", finishDrag);
    document.addEventListener("keydown", event => { if (event.key === "Escape") clearDrag(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) clearDrag(); });
  }
  activate($("check-updates"), () => checkUpdates(true));
  activate($("update-available"), openUpdate);
  activate($("profile"), () => {
    const open = $("profiles-menu").hidden; closePopups();
    $("profiles-menu").hidden = !open; $("profile").setAttribute("aria-expanded", String(open));
  });
  $("search").addEventListener("input", render);
  $("search").addEventListener("focus", closePopups);
  activate($("search-clear"), () => { $("search").value = ""; render(); $("search").focus(); });
  ["auto", "pt", "en"].forEach(language => activate($("language-" + language), () => run(() => setLanguage(language))));
  $("scroller").addEventListener("click", closePopups);
  activate($("menu-toggle"), () => {
    const open = $("menu").hidden; closePopups();
    $("menu").hidden = !open; $("menu-toggle").setAttribute("aria-expanded", String(open));
  });
  activate($("expand-all"), () => {
    const open = Array.from(rows.keys()).some(id => !expanded.has(key(id)));
    rows.forEach((_, id) => toggleItem(id, open));
  });
  activate($("insert"), () => run(insert));
  activate($("export-profile"), () => run(async () => {
    closePopups();
    if (!library.profile().items.length) throw new Error("Este perfil está vazio.");
    const yes = await ask("Exportar perfil", "", tr("Inclui mídias e MOGRTs, mantendo os presets editáveis. Fontes e plugins externos devem ser instalados separadamente. Salva o projeto atual e prepara um projeto temporário separado. Limite do pacote: 256 MB."), true);
    if (!yes) return;
    const name = library.profile().name.replace(/[^a-z0-9 _-]/gi,"_");
    const file = await uxp.storage.localFileSystem.getFileForSaving(name + ".fastbind", { types: ["fastbind"] });
    if (!file) return;
    const sharing = require("./portable.js");
    await sharing.exportProfile(io,host,library.profile(),file,status);
    status("Perfil exportado com mídias.", "success");
  }));
  activate($("import-profile"), () => run(async () => {
    closePopups();
    const file = await uxp.storage.localFileSystem.getFileForOpening({ types: ["fastbind"], allowMultiple: false });
    if (!file) return;
    const sharing = require("./portable.js");
    // Validate first, without turning optional font/effect metadata into a gate.
    await sharing.inspectArchive(io,file);
    const yes = await ask("Importar perfil", "", tr("As mídias serão copiadas para a biblioteca. Depois você poderá apagar o pacote recebido."), true);
    if (!yes) return;
    await sharing.importProfile(io,library,file,status); selected = null;
    status("Perfil importado. Você já pode apagar o pacote recebido.", "success");
  }));
  activate($("new-profile"), () => run(async () => {
    const name = await ask("Novo perfil", "", "Ex.: Transições, Zooms ou SFX");
    if (name) { await library.addProfile(name); selected = null; }
  }));
  activate($("rename-profile"), () => run(async () => {
    const name = await ask("Renomear perfil", library.profile().name); if (name) await library.renameProfile(name);
  }));
  activate($("rename-item"), () => run(async () => {
    const item = currentItem(); if (!item) throw new Error("Selecione um item da biblioteca.");
    const name = await ask("Renomear item", item.name); if (name) await library.renameItem(item.id, name);
  }));
  activate($("archive-item"), () => run(async () => {
    const item = currentItem(); if (!item) throw new Error("Selecione um item da biblioteca.");
    await library.archive(item.id); selected = null; status("Arquivado. Você pode restaurar pelo menu ⋯.");
  }));
  activate($("restore-item"), () => run(async () => { await library.restoreLast(); status("Item restaurado.", "success"); }));
  activate($("open-folder"), () => run(async () => {
    await ask("Local da biblioteca", "", io.root.nativePath + tr(" — Faça backup desta pasta para guardar seus perfis e pacotes."), "info");
  }));
  activate($("save"), () => run(async () => {
    const name = await ask("Salvar seleção", "", "Preserva os clipes nativos e também salva o projeto atual do Premiere. A mídia original continua referenciada.");
    if (!name) return;
    const id = C.uid(); let item;
    try { item = await host.saveSelection(id, C.name(name), status); }
    catch (error) {
      if (error.code !== "PILHA_OPAQUE_TRANSITIONS") throw error;
      try { await io.recordDiagnostic(error, "capture-warning"); } catch (_) {}
      const yes = await ask("Salvar sem garantia dos fades nativos?", "", error.message + " Salvar mesmo assim?", true);
      if (!yes) { status("Captura cancelada. Sua seleção não foi modificada."); return; }
      item = await host.saveSelection(id, C.name(name), status, { allowOpaqueTransitions: error.approvalKey });
    }
    await library.add(item); selected = item.id;
    status(item.warnings ? "Seleção salva. Confira os fades nativos ao inserir." : "Seleção salva neste perfil.", "success");
  }));
  activate($("mogrt"), () => run(async () => {
    const files = await uxp.storage.localFileSystem.getFileForOpening({ types: ["mogrt"], allowMultiple: true });
    if (!files) return;
    for (const file of (Array.isArray(files) ? files : [files])) {
      status(tr("Importando {name}…", { name: file.name }));
      const id = C.uid(), payload = await io.importMogrt(file, id);
      const item = Object.assign({ id, name: C.name(file.name.replace(/\.mogrt$/i, "")), type: "mogrt", created: new Date().toISOString() }, payload);
      await library.add(item); selected = id;
    }
    status("MOGRT adicionado. Duplo clique para inserir.", "success");
  }));
}
async function boot() {
  try {
    io = await new UxpIO(uxp.storage).init();
    try { locale.setPreference((await io.readJSON("settings.json")).language); } catch (_) { /* Missing/invalid preference means follow Premiere. Library data is separate. */ }
    localize(); library = new Library(io); await library.load();
    host = new Host(ppro, io); await host.init(); bind(); ready = true; busy = false; render(); startUpdates();
  } catch (error) { localize(); status(tr("Não foi possível iniciar: {message}", { message: locale.message(error.message) }), "error"); busy = false; controls(); }
}
uxp.entrypoints.setup({ panels: { pilhaPanel: { show() { if (ready) { render(); checkUpdates(false); } } } } });
boot();
