"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const I = require("../locale.js");

test("auto follows actual Premiere UI locale: Portuguese variants only", () => {
  for (const locale of ["pt_BR", "pt-PT", "PT_br", "pt", " pt-BR "]) assert.equal(I.languageFor("auto", locale), "pt", locale);
  for (const locale of ["en_US", "es_ES", "fr_FR", "de_DE", "ja_JP", "Português", "ptx_BR", "", null, undefined]) assert.equal(I.languageFor("auto", locale), "en", String(locale));
});
test("host locale uses documented uxp.host.uiLocale and fails safely without browser locale", () => {
  assert.equal(I.detectHostLocale({ host: { uiLocale: "pt_BR" }, navigator: { language: "en" } }), "pt_BR");
  assert.equal(I.detectHostLocale({ navigator: { language: "pt-BR" } }), "");
  assert.equal(I.detectHostLocale(), "");
  assert.equal(I.detectHostLocale({ host: { get uiLocale() { throw new Error("unavailable"); } } }), "");
});
test("explicit preference overrides host and can return to automatic", () => {
  const pt = I.create({ preference: "auto", hostLocale: "pt_BR" });
  assert.equal(pt.language, "pt"); assert.equal(pt.t("Salvar seleção"), "Salvar seleção");
  assert.equal(pt.setPreference("en"), "en"); assert.equal(pt.preference, "en");
  assert.equal(pt.t("Salvar seleção"), "Save selection");
  assert.equal(pt.setPreference("auto"), "pt");
  assert.equal(pt.setPreference("not-a-language"), "pt"); assert.equal(pt.preference, "auto");
  const en = I.create({ preference: "pt", hostLocale: "en_US" });
  assert.equal(en.language, "pt"); assert.equal(en.setPreference("auto"), "en");
});
test("unrecognized settings default to auto without trusting object prototypes", () => {
  for (const value of [null, undefined, {}, [], 17, "toString", "__proto__"]) assert.equal(I.normalizePreference(value), "auto");
  assert.equal(I.normalizePreference(" EN "), "en");
  assert.equal(I.create().t("toString"), "toString");
  assert.equal(I.create().t("__proto__"), "__proto__");
});
test("labels and interpolated names localize without changing user content", () => {
  const en = I.create({ hostLocale: "en_US" }), pt = I.create({ hostLocale: "pt_BR" });
  const name = "ZOOM • Salvar {count} + [A] $&";
  assert.equal(en.t("Ver conteúdo de {name}", { name }), "Show contents of " + name);
  assert.equal(pt.t("Ver conteúdo de {name}", { name }), "Ver conteúdo de " + name);
  assert.equal(en.t("Inserido • {count} clipes em faixas livres.", { count: 3 }), "Inserted • 3 clips on free tracks.");
  assert.equal(en.t("{name}. Duplo clique ou Enter para inserir.", { name }), name + ". Double-click or press Enter to insert.");
  assert.equal(en.t("Ver conteúdo de {name}"), "Show contents of {name}");
});
test("English presentation covers backend errors, progress and composed status", () => {
  const en = I.create({ preference: "en" });
  assert.equal(en.message("Conferindo arquivo do projeto…"), "Checking the project file…");
  assert.equal(en.message("A timeline está mudando. Pare a reprodução e tente novamente."), "The timeline is changing. Stop playback and try again.");
  assert.equal(en.message("Inserido • 4 clipes em faixas livres. Confira os fades nativos deste pacote."), "Inserted • 4 clips on free tracks. Check this package's native fades.");
  assert.equal(en.message("Não foi possível iniciar: Biblioteca danificada. Os arquivos foram preservados; não vou substituir seus perfis."), "Could not start: The library is damaged. Files were preserved; your profiles will not be overwritten.");
  assert.equal(en.message("Áudio • A3 • AE.NativeEffect • Desativado"), "Audio • A3 • AE.NativeEffect • Disabled");
  assert.equal(en.t(" Confira os fades nativos deste pacote."), " Check this package's native fades.");
  assert.equal(en.t(" — Faça backup desta pasta para guardar seus perfis e pacotes."), " — Back up this folder to keep your profiles and packages safe.");
  assert.equal(en.t("Não foi possível iniciar: {message}", { message: "Test" }), "Could not start: Test");
  assert.equal(en.message("Inserção enviada ao Premiere."), "Insertion sent to Premiere.");
  assert.match(en.message("A inserção foi confirmada na timeline. O Premiere ou o registro de confirmação emitiu um aviso; não é necessário inserir novamente."), /you do not need to insert again\.$/);
});
test("dynamic errors preserve special characters in names and disk paths", () => {
  const en = I.create({ preference: "en" }), path = "E:\\Ação %25\\[pasta]\\Salvar seleção.prproj";
  assert.equal(en.message("Não foi possível acessar o arquivo no disco: " + path + ". Confira se a unidade está disponível."), "Could not access the file on disk: " + path + ". Check that the drive is available.");
  assert.equal(en.message("Não foi possível ler a faixa A17. Nenhuma inserção foi solicitada."), "Could not read track A17. No insertion was requested.");
  assert.equal(en.message("Tempo inválido: -1.5"), "Invalid time: -1.5");
  assert.equal(en.message("Importando Áudio de verão.mogrt…"), "Importing Áudio de verão.mogrt…");
  assert.equal(en.message("Ver conteúdo de ZOOM • Áudio"), "Show contents of ZOOM • Áudio");
  assert.equal(en.message("My preset • Áudio"), "My preset • Áudio");
  const nativeError = "Error: [Premiere] script object is no longer valid";
  assert.equal(en.message(nativeError), nativeError);
});
test("Portuguese presentation returns original backend errors verbatim", () => {
  const pt = I.create({ preference: "pt" });
  const message = "Não foi possível acessar o arquivo no disco: E:\\áudio.wav. Confira se a unidade está disponível.";
  assert.equal(pt.message(message), message);
  assert.equal(pt.message("Unknown native error"), "Unknown native error");
});
test("all source catalog keys have nonempty English values and matching interpolation fields", () => {
  for (const [pt, en] of Object.entries(I.EN)) {
    assert.equal(typeof en, "string", pt); assert.ok(en.length, pt);
    const fields = s => (s.match(/\{\w+\}/g) || []).sort();
    assert.deepEqual(fields(en), fields(pt), pt);
  }
});
test("all literal backend errors/progress and direct UI translation calls have catalog entries", () => {
  for (const file of ["main.js", "host.js", "library.js", "core.js", "portable.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    const patterns = [/(?:new Error|progress)\("((?:\\.|[^"\\])*)"\)/g, /must\([^\n]*,\s*"((?:\\.|[^"\\])*)"\)/g, /warning:\s*"((?:\\.|[^"\\])*)"/g];
    if (file === "main.js") patterns.push(/tr\("((?:\\.|[^"\\])*)"/g);
    for (const pattern of patterns) for (const match of source.matchAll(pattern)) {
      const key = JSON.parse('"' + match[1] + '"');
      assert.ok(Object.prototype.hasOwnProperty.call(I.EN, key), file + ": missing translation for " + key);
    }
  }
});
