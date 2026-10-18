const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Library } = require('../library');
class IO {
  constructor() { this.files = new Map(); }
  async exists(n) { return this.files.has(n); }
  async readJSON(n) { return JSON.parse(this.files.get(n)); }
  async writeJSON(n,v) { this.files.set(n,JSON.stringify(v)); }
}
async function fixture() {
  const io = new IO(), lib = new Library(io); await lib.load();
  for (const id of ['a','b','c','d']) await lib.add({id,name:id,file:'/owned/'+id,clips:[{name:'áudio'}],color:'#123456'});
  await lib.addProfile('Amigos'); const destination = lib.profile().id; await lib.select('default');
  return {io,lib,destination};
}
test('drag reorder moves before/after, preserves payload/color/content, persists reload', async () => {
  const {io,lib} = await fixture(), original = JSON.stringify(lib.profile().items[0]);
  await lib.reorderItem('a','c',true); assert.deepEqual(lib.profile().items.map(i=>i.id),['b','c','a','d']);
  await lib.reorderItem('d','b',false); assert.deepEqual(lib.profile().items.map(i=>i.id),['d','b','c','a']);
  assert.equal(JSON.stringify(lib.profile().items[3]),original);
  const reloaded = new Library(io); await reloaded.load(); assert.deepEqual(reloaded.data,lib.data);
});
test('reorder filtered targets leaves all hidden items present, self-drop is a no-op', async () => {
  const {lib} = await fixture(); await lib.reorderItem('d','a',true);
  assert.deepEqual(lib.profile().items.map(i=>i.id),['a','d','b','c']);
  const revision=lib.revision; await lib.reorderItem('a','a',false); assert.equal(lib.revision,revision);
  await assert.rejects(lib.reorderItem('a','missing',false)); assert.equal(lib.revision,revision);
});
test('move changes only membership and preserves every saved field and item order', async () => {
  const {io,lib,destination} = await fixture(), item=JSON.stringify(lib.profile().items[1]);
  await lib.moveItem('b',destination);
  assert.deepEqual(lib.profile().items.map(i=>i.id),['a','c','d']);
  assert.equal(JSON.stringify(lib.data.profiles[1].items[0]),item);
  const reload=new Library(io); await reload.load(); await reload.select(destination);
  assert.equal(reload.profile().items[0].id,'b');
});
test('invalid move or failed disk commit never removes the original selection', async () => {
  const {io,lib,destination} = await fixture(); const before=JSON.stringify(lib.data);
  await assert.rejects(lib.moveItem('a','missing')); assert.equal(JSON.stringify(lib.data),before);
  io.writeJSON=async()=>{throw Error('disk full');};
  await assert.rejects(lib.moveItem('a',destination),/disk full/); assert.equal(JSON.stringify(lib.data),before);
  await assert.rejects(lib.reorderItem('a','d',true),/disk full/); assert.equal(JSON.stringify(lib.data),before);
});
test('import allocates independent profile/item IDs and collision-safe name, without mutating sender data', async () => {
  const {lib} = await fixture(), source={id:'default',name:'Geral',items:[{id:'a',name:'A',file:'/private/copied.wav'}]};
  const original=JSON.stringify(source); const profile=await lib.importProfile(source);
  assert.equal(profile.name,'Geral (2)'); assert.notEqual(profile.id,'default'); assert.notEqual(profile.items[0].id,'a');
  assert.equal(JSON.stringify(source),original); assert.equal(lib.data.profiles[0].items.length,4);
  await lib.importProfile(source); assert.equal(lib.profile().name,'Geral (3)');
});
