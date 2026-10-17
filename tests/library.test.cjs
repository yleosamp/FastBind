const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Library, UxpIO, nativeFileUrl } = require('../library.js');
class MemoryIO {
  constructor() { this.files = new Map(); }
  async readJSON(n) { return JSON.parse(this.files.get(n)); }
  async writeJSON(n, v) { this.files.set(n, JSON.stringify(v)); }
  async exists(n) { return this.files.has(n); }
}
test('perfis isolados persistem e renomear não perde itens', async () => {
  const io = new MemoryIO(), a = new Library(io); await a.load();
  await a.add({ id: 'a', name: 'Zoom' }); await a.addProfile('SFX');
  await a.add({ id: 'b', name: 'Impacto' }); await a.renameProfile('Sons');
  const b = new Library(io); await b.load(); assert.equal(b.profile().name, 'Sons');
  assert.deepEqual(b.profile().items.map(x => x.id), ['b']);
  await b.select('default'); assert.deepEqual(b.profile().items.map(x => x.id), ['a']);
  await b.renameItem('a', 'Zoom rápido'); assert.equal(b.profile().items[0].name, 'Zoom rápido');
});
test('nomes repetidos de perfil são rejeitados sem commit', async () => {
  const a = new Library(new MemoryIO()); await a.load();
  await assert.rejects(a.addProfile('geral'), /existe/); assert.equal(a.revision, 0);
});
test('item arquivado é recuperável, sem excluir payload', async () => {
  const a = new Library(new MemoryIO()); await a.load(); await a.add({ id: 'a', file: 'original.prproj' });
  await a.archive('a'); assert.equal(a.profile().items.length, 0); assert.equal(a.data.trash.length, 1);
  await a.restoreLast(); assert.equal(a.profile().items[0].file, 'original.prproj');
});
test('journal alternado recupera último slot íntegro', async () => {
  const io = new MemoryIO(), a = new Library(io); await a.load();
  await a.add({ id: 'a' }); await a.add({ id: 'b' });
  io.files.set('library-b.json', '{ incomplete');
  const b = new Library(io); await b.load(); assert.equal(b.revision, 1); assert.deepEqual(b.profile().items.map(x => x.id), ['a']);
});
test('checksum detecta JSON válido alterado', async () => {
  const io = new MemoryIO(), a = new Library(io); await a.load(); await a.add({ id: 'a' });
  const corrupt = await io.readJSON('library-a.json'); corrupt.data.profiles[0].name = 'Alterado';
  await io.writeJSON('library-a.json', corrupt);
  await assert.rejects(new Library(io).load(), /danificada/);
});
test('falha de escrita não altera estado em memória', async () => {
  const io = new MemoryIO(), a = new Library(io); await a.load(); await a.add({ id: 'a' });
  io.writeJSON = async () => { throw new Error('disco cheio'); };
  await assert.rejects(a.add({ id: 'b' }), /cheio/); assert.equal(a.profile().items.length, 1);
});
test('dois slots quebrados nunca são substituídos por biblioteca vazia', async () => {
  const io = new MemoryIO(); io.files.set('library-a.json', 'xxx'); io.files.set('library-b.json', '{}');
  await assert.rejects(new Library(io).load(), /preservados/); assert.equal(io.files.get('library-a.json'), 'xxx');
});
test('caminhos nativos chegam crus ao provedor UXP, sem codificação duplicada', async () => {
  const urls = [], io = new UxpIO({ localFileSystem: { getEntryWithUrl: async url => urls.push(url) } });
  await io.entry('C:\\Pós Produção\\Clipe #1.prproj');
  await io.entry('\\\\server\\share\\Pós.prproj');
  assert.equal(urls[0], 'file:/C:/Pós Produção/Clipe #1.prproj');
  assert.equal(urls[1], 'file://server/share/Pós.prproj');
});
test('regressão do caminho real: prefixo estendido não vira servidor chamado interrogação', () => {
  const input = String.raw`\\?\E:\!! -- EXAMPLE MEDIA 2025\! VIDEOS\! 2026\DEMO PROJECT\TEMPLATES.prproj`;
  assert.equal(nativeFileUrl(input), 'file:/E:/!! -- EXAMPLE MEDIA 2025/! VIDEOS/! 2026/DEMO PROJECT/TEMPLATES.prproj');
});
test('normalização cobre drive, UNC estendido, macOS e porcentagens literais', () => {
  const cases = [
    [String.raw`\\?\c:\Pós\100% #1\A%20B.prproj`, 'file:/c:/Pós/100% #1/A%20B.prproj'],
    ['//?/D:/A B/test.prproj', 'file:/D:/A B/test.prproj'],
    [String.raw`\\?\UNC\server\share\Pós #1\50%.prproj`, 'file://server/share/Pós #1/50%.prproj'],
    [String.raw`\\?\unc\server\share\x.prproj`, 'file://server/share/x.prproj'],
    ['/Users/editor/Pós/A%20B.prproj', 'file:/Users/editor/Pós/A%20B.prproj']
  ];
  for (const [input, expected] of cases) assert.equal(nativeFileUrl(input), expected);
});
test('namespace de dispositivo, URLs e caminhos relativos não são reinterpretados', () => {
  for (const input of [null, '', 'C:relative.prproj', '../foo.prproj', 'file:///C:/A%20B.prproj',
    String.raw`\\.\pipe\test`, String.raw`\\?\GLOBALROOT\Device\test`, '//server', 'C:/bad\0name']) {
    assert.throws(() => nativeFileUrl(input));
  }
});
test('erro de acesso guarda caminho normalizado e causa original no diagnóstico', async () => {
  const io = new UxpIO({ localFileSystem: { getEntryWithUrl: async () => { throw new Error('drive offline'); } } });
  await assert.rejects(io.entry(String.raw`\\?\E:\A B\test.prproj`), error => {
    assert.equal(error.code, 'PILHA_FILE_ACCESS');
    assert.equal(error.evidence.providerUrl, 'file:/E:/A B/test.prproj');
    assert.equal(error.evidence.reason, 'drive offline');
    return true;
  });
});
test('ID externo não pode escapar da pasta payloads', async () => {
  const io = new UxpIO({}); await assert.rejects(io.folder('../..'), /ID/);
});
test('cor é persistida sem mudar clipes, âncora ou payload do preset existente', async () => {
  const io = new MemoryIO(), a = new Library(io); await a.load();
  const asset = { id: 'a', file: 'C:\\original.prproj', check: 'xyz', anchor: '12345678901234567', clips: [{ name: 'SFX', kind: 'audio' }] };
  await a.add(asset); await a.setColor('a', '#f365a0');
  const b = new Library(io); await b.load(); const saved = { ...b.profile().items[0] };
  assert.equal(saved.color, '#F365A0'); delete saved.color; assert.deepEqual(saved, asset);
  await b.setColor('a', null); const c = new Library(io); await c.load(); assert.equal(c.profile().items[0].color, null);
});
test('cor inválida ou ID de outro perfil não modifica journals', async () => {
  const io = new MemoryIO(), a = new Library(io); await a.load(); await a.add({ id: 'a' });
  const revision = a.revision;
  for (const value of ['red', '#abc', '#ffffff; color:red', {}, undefined]) await assert.rejects(a.setColor('a', value), /Cor inválida/);
  assert.equal(a.revision, revision);
  await a.addProfile('Outro'); await assert.rejects(a.setColor('a', '#FFFFFF'), /não encontrado/);
});
test('falha na escrita da cor mantém estado anterior e remoção continua recuperável', async () => {
  const io = new MemoryIO(), a = new Library(io); await a.load(); await a.add({ id: 'a', color: '#F365A0' });
  const write = io.writeJSON.bind(io); io.writeJSON = async () => { throw new Error('disco cheio'); };
  await assert.rejects(a.setColor('a', '#729CCB'), /disco cheio/); assert.equal(a.profile().items[0].color, '#F365A0');
  io.writeJSON = write; await a.archive('a'); await a.restoreLast(); assert.equal(a.profile().items[0].color, '#F365A0');
});
test('histórico de diagnósticos preserva erro anterior quando outra falha vem depois', async () => {
  const io = new UxpIO({}), memory = new MemoryIO();
  io.readJSON = memory.readJSON.bind(memory); io.writeJSON = memory.writeJSON.bind(memory);
  const a = new Error('cópia divergente'); a.code = 'PILHA_CAPTURE_MISMATCH'; a.evidence = { missing: 1 };
  await io.recordDiagnostic(a, 'save-selection'); await io.recordDiagnostic(new Error('modal falhou'), 'panel');
  const history = await memory.readJSON('diagnostics.json');
  assert.equal(history.length, 2); assert.equal(history[0].code, 'PILHA_CAPTURE_MISMATCH');
  assert.equal((await memory.readJSON('last-error.json')).message, 'modal falhou');
  for (let i = 0; i < 35; i++) await io.recordDiagnostic(new Error(String(i)), 'test');
  assert.equal((await memory.readJSON('diagnostics.json')).length, 30);
});
module.exports = { MemoryIO };
