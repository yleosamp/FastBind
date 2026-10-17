// Isolated headless UI QA. No Premiere connection, projects or user library.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.FASTBIND_PLAYWRIGHT_MODULE || process.env.PILHA_PLAYWRIGHT_MODULE || 'playwright');
const source = path.resolve(__dirname, '..');
const version = require('../manifest.json').version;
const screenshotName = name => 'FastBind-' + version + '-' + name + '.png';
const output = path.resolve(process.argv[2] || path.join(source, '..', 'dist', 'preview'));
const modules = Object.fromEntries(['core', 'view', 'library', 'locale', 'updates'].map(name => ['./' + name + '.js', fs.readFileSync(path.join(source, name + '.js'), 'utf8')]));
modules['./manifest.json'] = fs.readFileSync(path.join(source, 'manifest.json'), 'utf8');
const clip = (kind, name, track = 0) => ({ kind, name, track, adjustment: kind === 'video' });
const item = (id, name, color, clips) => ({ id, name, color, type: 'selection', duration: '508032000000', clips });
const data = { active: 'main', profiles: [{ id: 'main', name: 'MAIN', items: [
  item('slow', 'ZOOM SLOW', '#23BCD6', [clip('video', 'Zoom slow')]),
  item('goal', 'GOAL', '#F365A0', [clip('video', 'GOAL')]),
  item('hit', 'HIT CRACK', '#48B650', [clip('video', 'SHAKE'), clip('audio', 'CRACK 1.wav'), clip('audio', 'BODY 1.wav', 1)]),
  item('top', 'TOP R SLOW', '#D4C797', [clip('video', 'TOP RIGHT')]),
  item('fade', 'FADE OUT', '#A38BDC', [clip('video', 'FADE')]),
  item('bass', 'BASS IMPACT', '#A38BDC', [clip('audio', 'Bass impact demo.mp3')]),
  item('vignette', 'vignette', '#23BCD6', [clip('video', 'Nested Sequence 01')]),
  item('big-hit', 'HIT', '#729CCB', [clip('video', 'SHAKE'), clip('video', 'SHAKE', 1),
    clip('audio', 'Demo short swoosh.wav'),
    clip('audio', 'PUNCH 1.mp3', 1), clip('audio', 'CASH REGISTER.mp3', 2), clip('audio', 'PUNCH 2.mp3', 1)]),
  { id: 'mogrt', name: 'Logo', type: 'mogrt', file: 'C:\\Preview\\Logo.mogrt', color: null }
] }, { id: 'sfx', name: 'SFX', items: [] }], trash: [] };
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.FASTBIND_BROWSER_PATH || process.env.PILHA_BROWSER_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1050, height: 1100 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ modules, data, version }) => {
      const cache = {}, io = { files: new Map(), async exists(n) { return this.files.has(n); },
        async readJSON(n) { if (!this.files.has(n)) throw new Error('missing'); return JSON.parse(this.files.get(n)); },
        async writeJSON(n, v) { this.files.set(n, JSON.stringify(v)); } };
      function load(name) {
        if (cache[name]) return cache[name].exports;
        const module = { exports: {} }; cache[name] = module;
        if (name === './manifest.json') { module.exports = JSON.parse(modules[name]); return module.exports; }
        new Function('require', 'module', 'exports', modules[name])(load, module, module.exports); return module.exports;
      }
      const core = load('./core.js'), RealLibrary = load('./library.js').Library;
      io.files.set('library-a.json', JSON.stringify({ schema: 1, revision: 1, data, check: core.textChecksum(JSON.stringify(data)) }));
      window.previewCalls = [];
      window.previewOpened = []; window.previewRequests = [];
      window.previewRelease = { tag_name: 'v' + version, draft: false, prerelease: false };
      window.fetch = async function (url, options) {
        if (this !== window) throw new Error('Host fetch must retain its global receiver');
        if (url !== 'https://api.github.com/repos/yleosamp/FastBind/releases/latest') throw new Error('Unexpected preview request');
        window.previewRequests.push({ url, credentials: options.credentials });
        return { ok: true, status: 200, async json() { return window.previewRelease; } };
      };
      window.previewSettings = () => io.readJSON('settings.json');
      class Library extends RealLibrary { constructor() { super(io); } }
      class UxpIO {
        async init() { this.root = { nativePath: 'Prévia isolada, em memória' }; return this; }
        async exists(n) { return io.exists(n); }
        async readJSON(n) { return io.readJSON(n); }
        async writeJSON(n, value) { return io.writeJSON(n, value); }
        async recordDiagnostic() {}
      }
      class Host {
        constructor() { this.review = null; } async init() {}
        async insert(item) { window.previewCalls.push(item.id); return { count: item.clips ? item.clips.length : 1 }; }
      }
      window.require = name => {
        if (name === 'uxp') return { shell: { async openExternal(url) { window.previewOpened.push(url); return ''; } }, entrypoints: { setup() {} }, storage: {}, host: { uiLocale: 'pt_BR' } };
        if (name === 'premierepro') return {};
        if (name === './library.js') return { Library, UxpIO };
        if (name === './host.js') return { Host };
        return load(name);
      };
      HTMLDialogElement.prototype.uxpShowModal = function () {
        this.showModal(); return new Promise(resolve => this.addEventListener('close', () => resolve(this.returnValue), { once: true }));
      };
    }, { modules, data, version });
    await page.goto(pathToFileURL(path.join(source, 'index.html')).href);
    await page.locator('.item').first().waitFor();
    await page.waitForFunction(() => document.querySelector('#check-updates').getAttribute('aria-disabled') === 'false');
    assert.equal(await page.locator('#update-available').isVisible(), false);
    assert.equal((await page.evaluate(() => window.previewRequests)).length, 1);
    assert.deepEqual(await page.evaluate(() => window.previewOpened), []);
    for (const id of ['slow', 'hit', 'bass', 'vignette', 'big-hit']) await page.locator('[data-id="' + id + '"] .chevron-button').click();
    await page.screenshot({ path: path.join(output, screenshotName('ampla')) });
    await page.locator('[data-id="hit"] .color-button').click();
    await page.locator('[data-id="hit"] [data-color="#F365A0"]').click();
    await page.waitForFunction(() => document.querySelector('[data-id="hit"]').style.borderColor === 'rgb(243, 101, 160)');
    await page.locator('#search').fill('BODY 1.wav'); assert.equal(await page.locator('.item').count(), 1);
    await page.locator('#search-clear').click();
    assert.equal(await page.locator('#search').inputValue(), '');
    assert.equal(await page.locator('.item').count(), 9);
    assert.deepEqual(await page.evaluate(() => window.previewCalls), []);
    for (const [name, width, height] of [['lateral', 320, 760], ['horizontal', 1040, 240], ['minima', 230, 300], ['minima-180', 230, 180]]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({ path: path.join(output, screenshotName(name)) });
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, bodyHeight: document.body.scrollHeight, height: innerHeight }));
      assert(dimensions.width <= width, name + ' não pode ter overflow horizontal: ' + JSON.stringify(dimensions));
      assert(dimensions.bodyHeight <= height, name + ' deve rolar só a lista: ' + JSON.stringify(dimensions));
      for (const [trigger, menu] of [['#profile', '#profiles-menu'], ['#menu-toggle', '#menu']]) {
        await page.locator(trigger).click();
        const box = await page.locator(menu).boundingBox();
        assert(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= height, 'Menu deve caber em ' + name);
        await page.locator(trigger).click();
      }
    }
    // Dialog controls must remain visible and usable, including after cancel/reopen.
    await page.setViewportSize({ width: 440, height: 700 });
    await page.locator('#save').click();
    await page.locator('#name-dialog[open]').waitFor();
    await page.locator('#dialog-input').fill('Impact');
    assert.equal(await page.locator('#dialog-ok').getAttribute('aria-disabled'), 'false');
    for (const id of ['dialog-ok', 'dialog-cancel']) {
      const control = page.locator('#' + id);
      assert(await control.isVisible(), 'Modal action must be visible: ' + id);
      const box = await control.boundingBox();
      assert(box.width >= 60 && box.height >= 28, 'Modal action must have a usable hit target: ' + id);
    }
    await page.screenshot({ path: path.join(output, screenshotName('salvar-pt')) });
    await page.locator('#dialog-cancel').click();
    await page.locator('#name-dialog[open]').waitFor({ state: 'detached' });
    await page.locator('#menu-toggle').click();
    await page.locator('#language-en').click();
    await page.waitForFunction(() => document.querySelector('#save').textContent.trim() === 'Save selection');
    assert.equal((await page.evaluate(() => window.previewSettings())).language, 'en');
    await page.screenshot({ path: path.join(output, screenshotName('english')) });
    await page.locator('#save').click();
    await page.locator('#name-dialog[open]').waitFor();
    await page.locator('#dialog-input').fill('Impact');
    assert.equal(await page.locator('#dialog-ok').getAttribute('aria-disabled'), 'false');
    await page.screenshot({ path: path.join(output, screenshotName('save-en')) });
    await page.locator('#dialog-cancel').click();
    await page.locator('#name-dialog[open]').waitFor({ state: 'detached' });
    // Future-release metadata is simulated, never fetched from a real service.
    await page.evaluate(() => { window.previewRelease = { tag_name: 'v99.0.0', draft: false, prerelease: false }; });
    await page.locator('#menu-toggle').click(); await page.locator('#check-updates').click();
    await page.locator('#update-available').waitFor({ state: 'visible' });
    assert.deepEqual(await page.evaluate(() => window.previewOpened), []);
    await page.locator('#menu-toggle').click();
    for (const [name, width, height] of [['update-lateral', 320, 760], ['update-minima', 230, 180], ['update-horizontal', 1040, 240]]) {
      await page.setViewportSize({ width, height });
      const metrics = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.body.scrollHeight }));
      assert(metrics.width <= width && metrics.height <= height, 'Update notice must not overflow ' + name);
      const footerBox = await page.locator('#update-available').boundingBox();
      assert(footerBox && footerBox.x >= 0 && footerBox.x + footerBox.width <= width && footerBox.y + footerBox.height <= height);
      await page.screenshot({ path: path.join(output, screenshotName(name)) });
    }
    await page.locator('#update-available').click();
    assert.deepEqual(await page.evaluate(() => window.previewOpened), ['https://github.com/yleosamp/FastBind/releases/tag/v99.0.0']);
    assert.equal((await page.evaluate(() => window.previewRequests)).length, 2);
    assert((await page.evaluate(() => window.previewRequests)).every(r => r.credentials === 'omit'));
    await page.setViewportSize({ width: 440, height: 700 });
    await page.locator('[data-id="hit"] .row-insert').click();
    await page.waitForFunction(() => window.previewCalls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.previewCalls), ['hit']); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ screenshots: output, errors, nativePremiereUsed: false, actualMainJs: true }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
