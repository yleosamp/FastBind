const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class Element {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.events = {}; this.attrs = {}; this.style = {}; this.value = ''; this.hidden = false; this._disabled = false; this.scrollTop = 0; }
  get disabled() { return this._disabled || this.attrs['aria-disabled'] === 'true'; }
  set disabled(v) { this._disabled = v; }
  set innerHTML(v) { this.children.forEach(n => { n.parentElement = null; }); this.children = []; }
  appendChild(n) { this.children.push(n); n.parentElement = this; return n; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(k, fn) { (this.events[k] ||= []).push(fn); }
  dispatch(k, extra = {}) {
    const e = { target: this, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
    let node = this;
    while (node) {
      for (const fn of node.events[k] || []) fn(e);
      if (node['on' + k]) node['on' + k](e);
      if (e.stopped) break; node = node.parentElement;
    }
    return e;
  }
  click() { if (this.tagName !== 'BUTTON' || !this.disabled) this.dispatch('click'); }
  removeAttribute(k) { delete this.attrs[k]; }
  close(value) {
    this.closeCalls = (this.closeCalls || 0) + 1;
    if (!this.open || this.closing) return;
    this.closing = true;
    const finish = () => { this.open = false; this.closing = false; delete this.attrs.open; this.resolveModal(value); };
    if (this.closeGate) this.closeGate.then(finish); else setImmediate(finish);
  }
  showModal() { throw new Error('API genérica showModal não deve ser usada no Premiere'); }
  uxpShowModal(options) {
    this.lastModalOptions = options;
    if (this.rejectNext) { this.rejectNext = false; return Promise.reject(new Error('falha ao abrir diálogo')); }
    if (this.open) throw new Error("element already has an 'open' attribute");
    this.open = true; this.attrs.open = true;
    return new Promise(resolve => { this.resolveModal = resolve; });
  }
  focus() {}
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
async function panel(options = {}) {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const elements = Object.fromEntries([...html.matchAll(/<([a-z-]+)\b[^>]*\bid="([^"]+)"/g)].map(m => [m[2], new Element(m[1])]));
  const calls = [], captures = [], diagnostics = [], updateCalls = [], opened = [], data = { active: 'a', profiles: [{ id: 'a', name: 'Geral', items: [
    { id: 'zoom', name: 'Zoom seguro', type: 'selection', clips: [{ kind: 'video', name: 'SHAKE', adjustment: true, track: 0 },
      { kind: 'audio', name: 'CRACK 1.wav', track: 0 }, { kind: 'audio', name: 'BODY 1.wav', track: 1 }], duration: '254016000000' }
  ] }, { id: 'b', name: 'SFX', items: [] }] };
  class Library {
    constructor() { this.data = data; }
    async load() { if (options.broken) throw new Error('Biblioteca danificada'); }
    profile() { return data.profiles.find(p => p.id === data.active); }
    async select(id) { data.active = id; }
    async add(item) { this.profile().items.push(item); }
    async setColor(id, value) { if (options.colorError) throw new Error('disco cheio'); this.profile().items.find(a => a.id === id).color = value; }
    async archive(id) { const p = this.profile(); const n = p.items.findIndex(a => a.id === id); data.trash = [{ profileId: p.id, item: p.items.splice(n, 1)[0] }]; }
    async restoreLast() { const last = data.trash.pop(); data.profiles.find(p => p.id === last.profileId).items.push(last.item); }
  }
  class UxpIO {
    async init() { return this; }
    async readJSON(name) { if (!options.settings || !(name in options.settings)) throw new Error('not found'); return options.settings[name]; }
    async writeJSON(name, value) { if (options.settingsError) throw new Error('disco cheio'); (options.settings ||= {})[name] = value; }
    async recordDiagnostic(error, scope) { diagnostics.push({ scope, message: error.message, code: error.code }); }
  }
  let host;
  class Host {
    constructor() { this.review = options.review || null; host = this; }
    async init() {}
    async insert(item) { if (this.review) throw new Error('Revisão pendente'); calls.push(item.id); if (options.wait) await options.wait; return { count: 2 }; }
    async saveSelection(id, name, status, consent) {
      captures.push(consent);
      if (options.opaque && (!consent || consent.allowOpaqueTransitions !== 'same-selection')) {
        const e = new Error('Fades não expostos nesta faixa'); e.code = 'PILHA_OPAQUE_TRANSITIONS'; e.approvalKey = 'same-selection'; throw e;
      }
      if (options.captureError) throw new Error('falha teste');
      return { id, name, type: 'selection', clips: [], warnings: options.opaque ? ['Fade não garantido'] : undefined };
    }
  }
  class UpdateChecker {
    constructor() { this.state = options.updateState || { available: false, release: null, error: null }; }
    async init() { if (options.updatesInitError) throw new Error('cache unavailable'); return this.state; }
    async check(request) {
      updateCalls.push(request);
      if (options.updateWait) await options.updateWait;
      if (options.updateError) return { ...this.state, error: 'offline' };
      return this.state;
    }
  }
  if (options.items) data.profiles[0].items = options.items;
  const context = { document: { getElementById: id => elements[id], createElement: tag => new Element(tag) }, console: { error() {} },
    require(name) { if (name === 'uxp') return { shell: { async openExternal(url, reason) { opened.push({ url, reason }); return options.openError || ''; } }, host: { uiLocale: options.hostLocale === undefined ? 'pt_BR' : options.hostLocale }, entrypoints: { setup() {} } }; if (name === 'premierepro') return {};
      if (name === './core.js') return require('../core.js'); if (name === './library.js') return { Library, UxpIO };
      if (name === './view.js') return require('../view.js');
      if (name === './locale.js') return require('../locale.js');
      if (name === './manifest.json') return require('../manifest.json');
      if (name === './updates.js') return { UpdateChecker, releaseURL: require('../updates.js').releaseURL };
      if (name === './host.js') return { Host }; throw new Error(name); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'), context);
  await settle(); return { elements, calls, host, data, captures, diagnostics, updateCalls, opened };
}
test('painel inicia enxuto; inserir só habilita depois de selecionar item', async () => {
  const f = await panel(), e = f.elements;
  assert.equal(e.list.children.length, 1); assert.equal(e.insert.disabled, true);
  e.list.children[0].click(); assert.equal(e.insert.disabled, false);
  e.insert.click(); await settle(); assert.deepEqual(f.calls, ['zoom']);
});
test('primeiro clique não recria linha e duplo clique insere uma única vez', async () => {
  let release; const f = await panel({ wait: new Promise(r => { release = r; }) });
  const row = f.elements.list.children[0]; row.click();
  assert.equal(f.elements.list.children[0], row);
  row.children[0].dispatch('dblclick'); row.children[0].dispatch('dblclick');
  assert.equal(f.elements.insert.disabled, true);
  await settle(); assert.deepEqual(f.calls, ['zoom']);
  release(); await settle(); assert.equal(f.elements.insert.disabled, false);
});
test('busca com item oculto limpa seleção para não inserir coisa invisível', async () => {
  const f = await panel(), e = f.elements; e.list.children[0].click();
  e.search.value = 'inexistente'; e.search.dispatch('input');
  assert.equal(e.list.children.length, 0); assert.equal(e.insert.disabled, true);
  assert.equal(e.empty.hidden, false);
});
test('trocar perfil mostra somente biblioteca daquele perfil', async () => {
  const f = await panel(), e = f.elements; e.list.children[0].click();
  e.profile.click(); e['profile-list'].children[1].click(); await settle();
  assert.equal(f.data.active, 'b'); assert.equal(e.list.children.length, 0); assert.equal(e.insert.disabled, true);
});
test('journal pendente não desabilita globalmente o painel nem captura', async () => {
  const f = await panel({ review: { phase: 'pending' } }), e = f.elements;
  e.list.children[0].click(); assert.equal(e.insert.disabled, false); assert.equal(e.save.disabled, false);
  e.list.children[0].children[0].dispatch('dblclick'); await settle(); assert.equal(f.calls.length, 0);
  assert.equal(e.save.disabled, false); assert.equal(e.review, undefined);
  await startCapture(f); assert.equal(f.captures.length, 1);
});
test('biblioteca quebrada falha fechada, sem habilitar operações', async () => {
  const f = await panel({ broken: true }), e = f.elements;
  assert.match(e.status.textContent, /Biblioteca danificada/);
  assert.equal(e.save.disabled, true); assert.equal(e.insert.disabled, true);
});
async function startCapture(f) {
  const e = f.elements; e.save.click(); await settle();
  e['dialog-input'].value = 'Meu preset'; e['dialog-ok'].click(); await settle();
}
test('fade opaco mostra confirmação; cancelar não repete captura', async () => {
  const f = await panel({ opaque: true }); await startCapture(f);
  assert.equal(f.elements['name-dialog'].open, true);
  assert.match(f.elements['dialog-label'].textContent, /fades nativos/);
  f.elements['dialog-cancel'].click(); await settle();
  assert.equal(f.captures.length, 1); assert.equal(f.data.profiles[0].items.length, 1);
});
test('aceitar aviso de fade usa a mesma seleção e salva com aviso visível', async () => {
  const f = await panel({ opaque: true }); await startCapture(f);
  f.elements['dialog-ok'].click(); await settle();
  assert.equal(f.captures.length, 2); assert.equal(f.captures[1].allowOpaqueTransitions, 'same-selection');
  assert.equal(f.data.profiles[0].items.length, 2);
  assert.match(f.elements.status.textContent, /fades nativos/);
});
test('erro fica em diagnóstico local sem ocultar mensagem original', async () => {
  const f = await panel({ captureError: true }); await startCapture(f);
  assert.match(f.elements.status.textContent, /falha teste/);
  assert.equal(f.diagnostics[0].scope, 'panel');
});
test('não abre confirmação enquanto o fechamento nativo da janela anterior está pendente', async () => {
  const f = await panel({ opaque: true }), e = f.elements;
  let release; e['name-dialog'].closeGate = new Promise(resolve => { release = resolve; });
  e.save.click(); await settle(); e['dialog-input'].value = 'FX'; e['dialog-ok'].click();
  await settle(); assert.equal(f.captures.length, 0); assert.equal(e.save.disabled, true);
  assert.equal(e['name-dialog'].open, true);
  release(); await settle();
  assert.equal(f.captures.length, 1); assert.match(e['dialog-label'].textContent, /fades nativos/);
  assert.equal(f.diagnostics.filter(d => d.scope === 'panel').length, 0);
  e['dialog-cancel'].click(); await settle(); assert.equal(e.save.disabled, false);
});
test('cancelar por X ou Escape libera operação e permite abrir novamente', async () => {
  const f = await panel(), e = f.elements;
  e.save.click(); await settle(); e['name-dialog'].close('reasonCanceled'); await settle();
  assert.equal(f.captures.length, 0); assert.equal(e.save.disabled, false);
  e.save.click(); await settle(); assert.equal(e['name-dialog'].open, true);
  e['name-dialog'].dispatch('cancel'); await settle();
  assert.equal(f.captures.length, 0); assert.equal(e.save.disabled, false);
});
test('Enter repetido só fecha uma vez e não deixa handlers da janela anterior', async () => {
  const f = await panel(), e = f.elements;
  e.save.click(); await settle(); e['dialog-input'].value = 'FX';
  e['dialog-input'].dispatch('keydown', { key: 'Enter' }); e['dialog-input'].dispatch('keydown', { key: 'Enter' });
  await settle(); assert.equal(f.captures.length, 1); assert.equal(e['name-dialog'].closeCalls, 1);
  assert.equal(e['dialog-input'].onkeydown, null); assert.equal(e['dialog-ok'].onclick, null);
});
test('rejeição assíncrona ao abrir diálogo não prende busy nem apaga o diagnóstico', async () => {
  const f = await panel(), e = f.elements; e['name-dialog'].rejectNext = true;
  e.save.click(); await settle(); assert.equal(e.save.disabled, false);
  assert.match(f.diagnostics[0].message, /falha ao abrir/);
  e.save.click(); await settle(); assert.equal(e['name-dialog'].open, true);
  e['dialog-cancel'].click(); await settle();
});
const head = f => f.elements.list.children[0].children[0];
test('setinha expande vídeo/áudio sem inserir nem mudar o pacote', async () => {
  const f = await panel(), before = JSON.stringify(f.data), row = f.elements.list.children[0];
  assert.equal(row.children[2].hidden, true);
  head(f).children[0].click(); assert.equal(row.children[2].hidden, false);
  assert.equal(row.children[2].children.filter(n => n.className === 'clip-row').length, 3);
  assert.deepEqual(f.calls, []); assert.equal(JSON.stringify(f.data), before);
  head(f).children[0].dispatch('dblclick'); assert.deepEqual(f.calls, []);
});
test('clipes só criam elementos ao expandir; recolher e expandir não duplica a lista', async () => {
  const f = await panel(), row = f.elements.list.children[0];
  assert.equal(row.children[2].children.length, 0);
  head(f).children[0].click(); const count = row.children[2].children.length; assert(count > 0);
  head(f).children[0].click(); head(f).children[0].click();
  assert.equal(row.children[2].children.length, count); assert.deepEqual(f.calls, []);
});
test('paleta troca só metadado de cor; clique ou duplo clique não insere', async () => {
  const f = await panel(), row = f.elements.list.children[0]; head(f).children[1].click();
  assert.equal(row.children[1].hidden, false); assert.equal(row.children[1].children.length, 13);
  row.children[1].children[3].click(); await settle();
  assert.equal(f.data.profiles[0].items[0].color, '#F365A0'); assert.deepEqual(f.calls, []);
  assert.equal(f.elements.list.children[0].style.borderColor, '#F365A0');
});
test('falha ao gravar cor não mostra uma cor falsa nem toca no host', async () => {
  const f = await panel({ colorError: true }); head(f).children[1].click();
  f.elements.list.children[0].children[1].children[0].click(); await settle();
  assert.equal(f.data.profiles[0].items[0].color, undefined); assert.match(f.elements.status.textContent, /disco cheio/); assert.deepEqual(f.calls, []);
});
test('Inserir da linha e Enter no botão fazem uma única chamada, não propagam para o nome', async () => {
  const f = await panel(); head(f).children[3].children[0].dispatch('keydown', { key: 'Enter' }); await settle();
  assert.deepEqual(f.calls, ['zoom']);
  head(f).children[3].children[0].dispatch('dblclick'); await settle(); assert.deepEqual(f.calls, ['zoom']);
});
test('segundo clique nativo do botão não duplica nem depois de a primeira operação terminar', async () => {
  const f = await panel(), insert = head(f).children[3].children[0];
  insert.dispatch('click', { detail: 1 }); await settle();
  head(f).children[3].children[0].dispatch('click', { detail: 2 }); await settle();
  assert.deepEqual(f.calls, ['zoom']);
});
test('remover da linha é recuperável sem inserir; perfil e expansão continuam independentes', async () => {
  const f = await panel(); head(f).children[0].click(); head(f).children[3].children[1].click(); await settle();
  assert.equal(f.elements.list.children.length, 0); assert.deepEqual(f.calls, []);
  f.elements['restore-item'].click(); await settle(); assert.equal(f.elements.list.children.length, 1);
  assert.equal(f.elements.list.children[0].children[2].hidden, false);
  f.elements['profile-list'].children[1].click(); await settle(); assert.equal(f.elements.list.children.length, 0);
  f.elements['profile-list'].children[0].click(); await settle(); assert.equal(f.elements.list.children[0].children[2].hidden, false);
});
test('busca pelo nome de áudio encontra o preset e preserva a rolagem ao redesenhar', async () => {
  const f = await panel(); f.elements.scroller.scrollTop = 200;
  f.elements.search.value = 'body 1.wav'; f.elements.search.dispatch('input');
  assert.equal(f.elements.list.children.length, 1); assert.equal(f.elements.scroller.scrollTop, 200);
});
test('expandir todos não ativa presets; recuperação real é delegada ao host, sem travar UI', async () => {
  const f = await panel({ review: { phase: 'unverified' } }); f.elements['expand-all'].click();
  assert.equal(f.elements.list.children[0].children[2].hidden, false);
  assert.equal(head(f).children[3].children[0].disabled, false);
  head(f).children[3].children[0].click(); await settle(); assert.deepEqual(f.calls, []);
  f.elements['expand-all'].click(); assert.equal(f.elements.list.children[0].children[2].hidden, true);
});

test('detecção segue Premiere em português e usa inglês para qualquer outro idioma', async () => {
  const pt = await panel({ hostLocale: 'pt_BR' });
  assert.equal(pt.elements.save.textContent, 'Salvar seleção');
  const en = await panel({ hostLocale: 'de_DE' });
  assert.equal(en.elements.save.textContent, 'Save selection');
  assert.equal(head(en).children[3].children[0].textContent, 'Insert');
  head(en).children[0].click(); assert.equal(en.elements.list.children[0].children[2].children[0].textContent, 'Video');
  assert.equal(head(en).children[2].textContent, 'Zoom seguro'); // User names are never translated.
});

test('troca manual persiste separada da biblioteca e Automático retoma Premiere', async () => {
  const options = { hostLocale: 'pt_BR', settings: {} }, f = await panel(options), before = JSON.stringify(f.data);
  f.elements['language-en'].click(); await settle();
  assert.equal(f.elements.save.textContent, 'Save selection');
  assert.equal(options.settings['settings.json'].language, 'en');
  assert.equal(JSON.stringify(f.data), before); assert.deepEqual(f.calls, []);
  const reopened = await panel(options); assert.equal(reopened.elements.save.textContent, 'Save selection');
  reopened.elements['language-auto'].click(); await settle();
  assert.equal(reopened.elements.save.textContent, 'Salvar seleção');
  assert.equal(options.settings['settings.json'].language, 'auto');
});

test('falha de preferências não mostra troca de idioma falsa', async () => {
  const f = await panel({ settingsError: true }); f.elements['language-en'].click(); await settle();
  assert.equal(f.elements.save.textContent, 'Salvar seleção'); assert.match(f.elements.status.textContent, /disco cheio/);
});

test('botão limpar busca restaura lista sem inserir nem tocar na biblioteca', async () => {
  const f = await panel(), before = JSON.stringify(f.data), e = f.elements;
  e.search.value = 'nada'; e.search.dispatch('input'); assert.equal(e['search-clear'].hidden, false);
  e['search-clear'].click(); assert.equal(e.search.value, ''); assert.equal(e.list.children.length, 1);
  assert.equal(e['search-clear'].hidden, true); assert.equal(JSON.stringify(f.data), before); assert.deepEqual(f.calls, []);
});

test('modal tem botões explícitos, valida nome vazio e aceita teclado no próprio controle', async () => {
  const f = await panel(), e = f.elements; e.save.click(); await settle();
  assert.equal(e['dialog-ok'].tagName, 'DIV'); assert.equal(e['dialog-cancel'].tagName, 'DIV');
  assert.equal(e['dialog-ok'].disabled, true); assert.equal(e['dialog-cancel'].hidden, false);
  e['dialog-ok'].click(); await settle(); assert.equal(f.captures.length, 0);
  e['dialog-input'].value = 'Preset'; e['dialog-input'].dispatch('input'); assert.equal(e['dialog-ok'].disabled, false);
  e['dialog-ok'].dispatch('keydown', { key: 'Enter' }); await settle(); assert.equal(f.captures.length, 1);
  assert.equal(e['dialog-ok'].onkeydown, null);
});

test('modal inglês tem título, campo e ações traduzidos sem alterar o nome salvo', async () => {
  const f = await panel({ hostLocale: 'en_US' }), e = f.elements; e.save.click(); await settle();
  assert.equal(e['dialog-label'].textContent, 'Save selection'); assert.equal(e['dialog-ok'].textContent, 'Save');
  assert.equal(e['dialog-cancel'].textContent, 'Cancel');
  e['dialog-input'].value = 'Meu nome'; e['dialog-ok'].click(); await settle();
  assert.equal(f.data.profiles[0].items[1].name, 'Meu nome');
});

test('janela nativa acompanha a largura do conteúdo, sem faixa vazia lateral', async () => {
  const f = await panel(); f.elements.save.click(); await settle();
  const css = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf8');
  const cssWidth = Number(/^dialog\s*\{[^}]*\bwidth:\s*(\d+)px/m.exec(css)[1]);
  assert.equal(f.elements['name-dialog'].lastModalOptions.size.width, cssWidth);
  assert.equal(f.elements['name-dialog'].lastModalOptions.size.height, 300);
  assert.doesNotMatch(css, /\.dialog-shell\s*\{[^}]*min-height:/);
  f.elements['dialog-cancel'].click(); await settle();
});

const futureUpdate = () => ({ available: true, release: { tag: 'v99.0.0', version: '99.0.0', url: 'https://github.com/yleosamp/FastBind/releases/tag/v99.0.0' }, error: null });

test('consulta de atualização pendente não bloqueia inserir, salvar ou trocar idioma', async () => {
  let release; const f = await panel({ updateWait: new Promise(resolve => { release = resolve; }) });
  assert.equal(f.elements.save.disabled, false); assert.equal(f.elements['check-updates'].disabled, true);
  f.elements.list.children[0].click(); assert.equal(f.elements.insert.disabled, false);
  f.elements.insert.click(); await settle(); assert.deepEqual(f.calls, ['zoom']);
  f.elements['language-en'].click(); await settle(); assert.equal(f.elements.save.textContent, 'Save selection');
  release(); await settle(); assert.equal(f.elements['check-updates'].disabled, false);
});

test('sem nova versão não há aviso; falha automática é silenciosa e manual dá retorno no menu', async () => {
  const f = await panel({ updateError: true }), e = f.elements;
  assert.equal(e['update-available'].hidden, true); assert.doesNotMatch(e.status.textContent, /verificar|conexão/);
  e['check-updates'].click(); await settle();
  assert.match(e['update-state'].textContent, /Não foi possível verificar/); assert.equal(e.save.disabled, false);
  assert.equal(f.updateCalls[1].force, true);
});

test('aviso só abre a release validada por clique; não instala nem chama o Premiere', async () => {
  const f = await panel({ updateState: futureUpdate() }), e = f.elements;
  assert.equal(e['update-available'].hidden, false); assert.deepEqual(f.opened, []);
  assert.match(e['update-available'].title, /99\.0\.0/);
  e['update-available'].click(); await settle();
  assert.equal(f.opened.length, 1); assert.equal(f.opened[0].url, futureUpdate().release.url);
  assert.deepEqual(f.calls, []); assert.deepEqual(f.captures, []);
  e['language-en'].click(); await settle(); assert.equal(e['update-available'].textContent, '↑ Update');
});

test('URL manipulada no estado nunca é aberta, mesmo com available verdadeiro', async () => {
  const state = futureUpdate(); state.release.url = 'https://example.com/untrusted';
  const f = await panel({ updateState: state });
  assert.equal(f.elements['update-available'].hidden, true);
  f.elements['update-available'].click(); await settle(); assert.deepEqual(f.opened, []);
});

test('negação do navegador não bloqueia o painel nem marca atualização como instalada', async () => {
  const f = await panel({ updateState: futureUpdate(), openError: 'User declined' });
  f.elements['update-available'].click(); await settle();
  assert.match(f.elements.status.textContent, /Não foi possível abrir/); assert.equal(f.elements.save.disabled, false);
  assert.equal(f.elements['update-available'].hidden, false); assert.deepEqual(f.calls, []);
});

test('falha ao iniciar checker não impede biblioteca, e check manual bem-sucedido é claro', async () => {
  const broken = await panel({ updatesInitError: true }); assert.equal(broken.elements.save.disabled, false);
  assert.equal(broken.elements['check-updates'].disabled, true);
  const f = await panel(); f.elements['check-updates'].click(); await settle();
  assert.equal(f.elements['update-state'].textContent, 'Você já está na versão mais recente.');
});
test('nomes de arquivos não viram HTML e conteúdo MOGRT não inventa faixas', async () => {
  const f = await panel({ items: [{ id: 'm', name: '<b>Modelo</b>', type: 'mogrt', file: 'C:\\A\\<img onerror=x>.mogrt' }] });
  assert.equal(head(f).children[2].textContent, '<b>Modelo</b>'); head(f).children[0].click();
  const contents = f.elements.list.children[0].children[2];
  assert.equal(contents.children[0].textContent, 'MOGRT');
  assert.equal(contents.children[1].children[1].textContent, '<img onerror=x>.mogrt');
});
