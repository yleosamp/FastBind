const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { UxpIO } = require('../library.js');

// Real disk I/O under an isolated temporary directory. This adapter models
// the RAW-path file:/ contract, not Adobe's implementation or Premiere.
async function diskFixture(t) {
  const parent = path.resolve(os.tmpdir()), root = await fs.mkdtemp(path.join(parent, 'pilha-fs-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), parent);
    assert(path.basename(root).startsWith('pilha-fs-'));
    await fs.rm(root, { recursive: true }); // Only this mkdtemp-owned fixture.
  });
  const binary = Symbol('binary'), calls = [], state = { corruptCopy: false };
  async function entry(nativePath) {
    const stat = await fs.stat(nativePath);
    const result = { nativePath, name: path.basename(nativePath), isFile: stat.isFile() };
    if (result.isFile) {
      result.read = async options => {
        assert.equal(options.format, binary);
        const data = await fs.readFile(nativePath);
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      };
      result.copyTo = async (folder, options) => {
        assert.equal(options.overwrite, false);
        const dest = path.join(folder.nativePath, result.name);
        await fs.copyFile(nativePath, dest, constants.COPYFILE_EXCL);
        if (state.corruptCopy) await fs.writeFile(dest, Buffer.alloc(128, 0));
        return entry(dest);
      };
    } else {
      result.getEntry = name => entry(path.join(nativePath, name));
      result.createFolder = async name => {
        const dest = path.join(nativePath, name); await fs.mkdir(dest); return entry(dest);
      };
    }
    return result;
  }
  const dataPath = path.join(root, 'Biblioteca Pós #1 50%'); await fs.mkdir(dataPath);
  const storage = { formats: { binary }, localFileSystem: {
    getDataFolder: () => entry(dataPath),
    getEntryWithUrl: async url => {
      calls.push(url); assert(url.startsWith('file:/'));
      // Deliberately NOT new URL()/decodeURI(): %20 can be literal in a name.
      let raw = url.slice(5);
      if (process.platform === 'win32' && /^\/[a-z]:\//i.test(raw)) raw = raw.slice(1);
      return entry(raw);
    }
  } };
  const io = await new UxpIO(storage).init();
  return { root, dataPath, io, calls, state, entry };
}
test('disco real: confere, copia e reabre projeto com espaços, acentos, # e %', async t => {
  const f = await diskFixture(t), source = path.join(f.root, 'Projeto Pós #1 50% A%20B.prproj');
  const data = Buffer.from(Array.from({ length: 1024 }, (_, i) => i % 256));
  await fs.writeFile(source, data);
  const input = process.platform === 'win32' ? '\\\\?\\' + source : source;
  await f.io.preflightProject(input);
  const asset = await f.io.copyProject(input, 'asset-1');
  assert.equal(asset.file, path.join(f.dataPath, 'payloads', 'asset-1', path.basename(source)));
  assert.deepEqual(await fs.readFile(asset.file), data);
  assert.equal((await f.io.checkPayload(asset)).nativePath, asset.file.replace(/\\/g, '/'));
  assert.deepEqual(await fs.readFile(source), data); // Original remains identical.
  assert(f.calls.every(url => !url.includes('%2520') && !url.includes('%3F')));
});
test('disco real: percentual literal não é confundido com espaço', async t => {
  const f = await diskFixture(t), a = path.join(f.root, 'A B.prproj'), b = path.join(f.root, 'A%20B.prproj');
  await fs.writeFile(a, Buffer.alloc(128, 1)); await fs.writeFile(b, Buffer.alloc(128, 2));
  const first = await f.io.copyProject(a, 'space'), second = await f.io.copyProject(b, 'percent');
  assert.notEqual(first.check, second.check);
  await f.io.checkPayload(first); await f.io.checkPayload(second);
});
test('disco real: MOGRT copiado é reaberto e conteúdo alterado é recusado', async t => {
  const f = await diskFixture(t), source = path.join(f.root, 'Títuló #1 100%.mogrt');
  await fs.writeFile(source, Buffer.alloc(256, 42));
  const asset = await f.io.importMogrt(await f.entry(source), 'mogrt-1');
  await f.io.checkPayload(asset);
  await fs.writeFile(asset.file, Buffer.alloc(256, 43));
  await assert.rejects(f.io.checkPayload(asset), /alterado/);
  assert.deepEqual(await fs.readFile(source), Buffer.alloc(256, 42));
});
test('disco real: cópia divergente não é aceita nem sobrescreve payload anterior', async t => {
  const f = await diskFixture(t), source = path.join(f.root, 'Source.prproj');
  await fs.writeFile(source, Buffer.alloc(128, 42));
  f.state.corruptCopy = true;
  await assert.rejects(f.io.copyProject(source, 'bad-copy'), /diferente da origem/);
  f.state.corruptCopy = false;
  await assert.rejects(f.io.copyProject(source, 'bad-copy'), /EEXIST/);
  assert.deepEqual(await fs.readFile(source), Buffer.alloc(128, 42));
});
test('disco real: preflight recusa arquivo ausente, diretório, extensão ou conteúdo inválido', async t => {
  const f = await diskFixture(t), short = path.join(f.root, 'Vazio.prproj'), other = path.join(f.root, 'Outro.zip');
  await fs.writeFile(short, Buffer.alloc(4)); await fs.writeFile(other, Buffer.alloc(128));
  await assert.rejects(f.io.preflightProject(path.join(f.root, 'Ausente.prproj')), e => e.code === 'PILHA_FILE_ACCESS');
  await assert.rejects(f.io.preflightProject(short), /incompleto/);
  await assert.rejects(f.io.preflightProject(other), /\.prproj/);
  const folder = path.join(f.root, 'pasta.prproj'); await fs.mkdir(folder);
  await assert.rejects(f.io.preflightProject(folder), /não aponta para um arquivo/);
});
