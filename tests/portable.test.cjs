const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const P = require('../portable'), Z = require('../vendor/fflate'), C = require('../core');
const { Library, UxpIO } = require('../library');
const guid='12345678-1234-1234-1234-123456789abc';
const text=s=>Z.strToU8(s);
const project=xml=>P.writeProject('<PremiereData Version="3">'+xml+'</PremiereData>');
const profile=()=>({name:'Meu perfil',items:[{name:'Hit',type:'selection',entry:'project/library.prproj',sequenceId:guid,sequenceName:'[FastBind source]',anchor:'0',duration:'100',transitions:[],clips:[{kind:'audio',track:0,start:'0',end:'100',in:'0',out:'100',name:'A.wav',components:[['Volume',1]]}]}]});
function bundle() {
  return {profile:profile(),files:{'project/library.prproj':project('<FilePath>fastbind-resource:media/a.wav</FilePath>'),'media/a.wav':text('sound bytes'),'requirements.txt':text('Requires a font')},requirements:['Requires a font']};
}
test('XML media collector deduplicates paths and clears caches/relative paths, preserves native effects/keyframes',()=>{
  const p=project('<FilePath>C:\\Pós &amp; som\\hit.wav</FilePath><ActualMediaFilePath>c:/pós &amp; som/hit.wav</ActualMediaFilePath><RelativePath>../../hit.wav</RelativePath><ConformedAudioPath>C:\\cache.cfa</ConformedAudioPath><MatchName>Transform</MatchName><FontName>Barlow</FontName><Keyframe time="0">0.5</Keyframe>');
  const info=P.inspectProject(p); assert.equal(info.paths.length,1); assert.deepEqual(info.fonts,['Barlow']); assert.deepEqual(info.effects,['Transform']);
  const transported=P.transportProject(info.xml,[{source:info.paths[0],entry:'media/a.wav'}]);
  const xml=P.readProject(transported); assert.ok(!xml.includes('C:')); assert.ok(!xml.includes('../../')); assert.ok(xml.includes('<Keyframe time="0">0.5</Keyframe>'));
  const local=P.readProject(P.localProject(transported,{'media/a.wav':'/Users/amigo/Som & ícone/a.wav'}));
  assert.ok(local.includes('/Users/amigo/Som &amp; ícone/a.wav')); assert.ok(!local.includes('fastbind-resource:'));
});
test('project rebase handles Windows paths, UTF8, literal percent, # and XML entities',()=>{
  const p=project('<FilePath>fastbind-resource:media/a.wav</FilePath>');
  const xml=P.readProject(P.localProject(p,{'media/a.wav':'D:\\100% #1\\A & B.wav'}));
  assert.ok(xml.includes('D:\\100% #1\\A &amp; B.wav'));
});
test('file URIs decode once while native percent names remain literal, no double-encoding',()=>{
  const p=project('<FilePath>file:///C:/P%C3%B3s/A%20%23%2520.wav</FilePath><ActualMediaFilePath>C:\\Pós\\A #%20.wav</ActualMediaFilePath>');
  const info=P.inspectProject(p);assert.deepEqual(info.paths,['C:\\Pós\\A #%20.wav']);
  const xml=P.readProject(P.transportProject(info.xml,[{source:info.paths[0],entry:'media/a.wav'}]));
  assert.equal((xml.match(/fastbind-resource:media\/a.wav/g)||[]).length,2);
  assert.throws(()=>P.localProject(p,{}));
  assert.throws(()=>P.inspectProject(project('<FilePath>../relative.wav</FilePath>')));
});
test('transport refuses uncollected media, imported project refuses sender paths or unresolved tokens',()=>{
  assert.throws(()=>P.transportProject(P.readProject(project('<FilePath>C:\\missing.wav</FilePath>')),[]));
  assert.throws(()=>P.localProject(project('<FilePath>C:\\sender.wav</FilePath>'),{}));
  assert.throws(()=>P.localProject(project('<FilePath>fastbind-resource:media/missing.wav</FilePath>'),{}));
});
test('portable ZIP roundtrip preserves native metadata, media bytes and requirements',()=>{
  const b=bundle(), out=P.unpack(P.pack(b.profile,b.files,b.requirements));
  assert.deepEqual(out.manifest.profile,b.profile); assert.deepEqual(out.manifest.requirements,b.requirements);
  assert.deepEqual(out.files['media/a.wav'],b.files['media/a.wav']);
});
test('MOGRT-only profile packages without a Premiere project',()=>{
  const profile={name:'MOGRT',items:[{name:'Logo',type:'mogrt',entry:'mogrt/a.mogrt'}]}, files={'mogrt/a.mogrt':text('mogrt bytes')};
  assert.equal(P.unpack(P.pack(profile,files,[])).manifest.profile.items[0].name,'Logo');
});
test('corruption, missing entries and manifest mismatch are rejected',()=>{
  const b=bundle(), good=P.pack(b.profile,b.files,b.requirements), raw=Z.unzipSync(good);
  raw['media/a.wav'][0]^=1; assert.throws(()=>P.unpack(Z.zipSync(raw)));
  delete raw['media/a.wav']; assert.throws(()=>P.unpack(Z.zipSync(raw)));
  raw['manifest.json']=text('null'); assert.throws(()=>P.unpack(Z.zipSync(raw)));
  assert.throws(()=>P.unpack(text('not a zip')));
});
test('archive traversal, absolute paths, backslashes, executable files and extra entries are refused',()=>{
  const b=bundle(),raw=Z.unzipSync(P.pack(b.profile,b.files,b.requirements));
  for(const name of ['../evil.wav','/absolute.wav','C:\\evil.wav','media/evil.exe','unexpected.txt','media/../evil.wav']) {
    assert.throws(()=>P.unpack(Z.zipSync({...raw,[name]:text('bad')})),name);
  }
});
test('zip bomb declared size is rejected before decompression allocation',()=>{
  const raw=P.pack(...(()=>{const b=bundle();return[b.profile,b.files,b.requirements];})());
  const b=new Uint8Array(raw); const view=new DataView(b.buffer); let found=false;
  for(let i=0;i<b.length-46;i++) if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,P.LIMIT+1,true);found=true;break;}
  assert.ok(found); assert.throws(()=>P.unpack(b));
});
test('XML entities/DOCTYPE, oversized gzip, truncated project and unsupported external dependencies fail safely',()=>{
  assert.throws(()=>P.readProject(text('<!DOCTYPE x><PremiereData></PremiereData>')));
  assert.throws(()=>P.readProject(text('<PremiereData>')));
  const bomb=project('');new DataView(bomb.buffer,bomb.byteOffset,bomb.byteLength).setUint32(bomb.length-4,0x70000000,true);assert.throws(()=>P.readProject(bomb));
  assert.throws(()=>P.inspectProject(project('<FilePath>C:\\animation.aep</FilePath>')),/Dynamic Link/);
  assert.throws(()=>P.inspectProject(project('<IsImageSequence>true</IsImageSequence>')),/sequências/);
  assert.throws(()=>P.inspectProject(project('<FilePath>C:\\asset.unknown</FilePath>')),error=>error.code==='FASTBIND_MEDIA_REFERENCE'&&error.evidence.reference==='C:\\asset.unknown'&&error.message.includes('FilePath'));
});
const blackVideo='<Media ObjectUID="black"><FilePath>1112293707</FilePath><ImplementationID>42008e7a-de6f-4270-96de-7e287abb9b4b</ImplementationID><Title>Black Video</Title><Infinite>true</Infinite><ActualMediaFilePath>1112293707</ActualMediaFilePath></Media>';
test('regression: native Black Video IDs are generated media, not missing external files',()=>{
  const info=P.inspectProject(project(blackVideo.repeat(6)+'<FilePath>C:\\som.wav</FilePath>'));
  assert.deepEqual(info.paths,['C:\\som.wav']);assert.deepEqual(Array.from(info.generators),['1112293707']);
  const copy=P.transportProject(info.xml,[{source:'C:\\som.wav',entry:'media/a.wav'}]);
  const xml=P.readProject(P.localProject(copy,{'media/a.wav':'/Users/friend/som.wav'}));
  assert.equal((xml.match(/<FilePath>1112293707<\/FilePath>/g)||[]).length,6);
  assert.ok(xml.includes(blackVideo));assert.ok(xml.includes('/Users/friend/som.wav'));
});
test('numeric relative paths without a verified native generator are still diagnosed, not silently discarded',()=>{
  assert.throws(()=>P.inspectProject(project('<Media><FilePath>1234567890</FilePath></Media>')),error=>error.code==='FASTBIND_MEDIA_REFERENCE'&&error.evidence.reference==='1234567890');
});
test('installed plugins/fonts never block collection and keep editable effect parameters, without bundling binaries',()=>{
  const content='<PluginPath>C:\\Plugins\\Deep Glow.aex</PluginPath><FontFile>/Library/Fonts/Barlow.otf</FontFile><FilePath>C:\\Fonts\\Barlow.ttf</FilePath><MatchName>Deep Glow</MatchName><Radius>117</Radius><Keyframe time="0">0.99</Keyframe>';
  const info=P.inspectProject(project(content+blackVideo));assert.deepEqual(info.paths,[]);
  const transported=P.transportProject(info.xml,[]),local=P.readProject(P.localProject(transported,{}));
  assert.ok(local.includes(content));assert.ok(local.includes(blackVideo));assert.deepEqual(info.effects,['Deep Glow']);
  const b=profile();const zip=P.unpack(P.pack(b,{'project/library.prproj':transported},[]));
  assert.deepEqual(zip.manifest.requirements,[]);assert.equal(Object.keys(zip.files).filter(n=>/\.(aex|otf|ttf)$/.test(n)).length,0);
});
test('real disk: imported native Black Video generator identity persists with the independent profile',async t=>{
  const {root,io,lib,file}=await diskFixture(t),b=bundle(),incoming=path.join(root,'generated.fastbind');
  b.files['project/library.prproj']=project(blackVideo+'<FilePath>fastbind-resource:media/a.wav</FilePath>');
  await fs.writeFile(incoming,P.pack(b.profile,b.files,[]));await P.importProfile(io,lib,file(incoming),()=>{});await fs.unlink(incoming);
  assert.deepEqual(lib.profile().items[0].portableGenerators,['1112293707']);
  assert.ok(P.readProject(await fs.readFile(lib.profile().items[0].file)).includes(blackVideo));
});
test('invalid profiles are rejected before they can become library items',()=>{
  const b=bundle();
  for(const change of [p=>p.items[0].sequenceId='../../evil',p=>p.items[0].clips[0].end='-1',p=>p.items[0].clips[0].track=-1,p=>p.items[0].entry='../evil',p=>p.items[0].color='red']){
    const p=profile();change(p);assert.throws(()=>P.pack(p,b.files,[]));
  }
});
// Real disk, isolated temp directories only. No Premiere APIs or user library.
async function diskFixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fastbind-share-')); t.after(()=>fs.rm(root,{recursive:true,force:true}));
  function file(p){return {nativePath:p,name:path.basename(p),isFile:true,async getMetadata(){return fs.stat(p);},async read(){return new Uint8Array(await fs.readFile(p));},async write(b){await fs.writeFile(p,b);}};}
  const io=new UxpIO({formats:{binary:'binary'}});io.root={nativePath:root};
  io.entry=async p=>file(p);io.folder=async id=>{const p=path.join(root,id);await fs.mkdir(p);return {nativePath:p,async createFile(n){const f=path.join(p,n);await fs.writeFile(f,'',{flag:'wx'});return file(f);}};};
  io.exists=async n=>{try{await fs.stat(path.join(root,n));return true;}catch(_){return false;}};
  io.readJSON=async n=>JSON.parse(await fs.readFile(path.join(root,n),'utf8'));
  io.writeJSON=async(n,v)=>fs.writeFile(path.join(root,n),JSON.stringify(v));
  const lib=new Library(io);await lib.load();
  return{root,io,lib,file};
}
test('real disk: imported media survives deleting the received archive and reloading the library',async t=>{
  const {root,io,lib,file}=await diskFixture(t),b=bundle(),incoming=path.join(root,'incoming.fastbind');
  await fs.writeFile(incoming,P.pack(b.profile,b.files,b.requirements));
  await P.importProfile(io,lib,file(incoming),()=>{});await fs.unlink(incoming);
  const reload=new Library(io);await reload.load();const item=reload.profile().items[0];
  assert.equal(item.portable,true);assert.equal(item.requirements[0],'Requires a font');
  const xml=P.readProject(await fs.readFile(item.file));assert.ok(!xml.includes('fastbind-resource:'));
  const localPath=xml.match(/<FilePath>([^<]+)<\/FilePath>/)[1];
  assert.deepEqual(new Uint8Array(await fs.readFile(localPath)),b.files['media/a.wav']);
  assert.equal(C.checksum(await fs.readFile(item.file)),item.check);assert.notEqual(item.id,b.profile.items[0].id);
});
test('real disk: failed write or corrupt archive never commits a partial profile',async t=>{
  const {root,io,lib,file}=await diskFixture(t),b=bundle(),incoming=path.join(root,'incoming.fastbind');
  await fs.writeFile(incoming,P.pack(b.profile,b.files,b.requirements));
  io.writeJSON=async()=>{throw Error('disk full');};
  await assert.rejects(P.importProfile(io,lib,file(incoming),()=>{}),/disk full/);assert.equal(lib.data.profiles.length,1);
  await fs.writeFile(incoming,'broken');await assert.rejects(P.importProfile(io,lib,file(incoming),()=>{}));assert.equal(lib.profile().items.length,0);
});
test('real disk: exporting collects original media and strips sender paths, not original whole project',async t=>{
  const {root,io,file}=await diskFixture(t),media=path.join(root,'Hit & som.wav'),scratch=path.join(root,'saved.prproj'),dest=path.join(root,'export.fastbind');
  await fs.writeFile(media,'sample audio');await fs.writeFile(scratch,Buffer.alloc(80,1));await fs.writeFile(dest,'');
  const source=profile().items[0];source.id='source';source.file=scratch;source.check=C.checksum(await fs.readFile(scratch));
  let nativeCalls=0;const host={async exportProfileProject(assets,target){nativeCalls++;await fs.writeFile(target,project('<FilePath>'+media.replace(/&/g,'&amp;')+'</FilePath><FontName>Barlow</FontName>'));return {sequences:{source:{id:guid,name:source.sequenceName}},media:[media]};}};
  await P.exportProfile(io,host,{name:'Perfil',items:[source]},file(dest),()=>{});
  const out=P.unpack(await fs.readFile(dest));assert.equal(nativeCalls,1);assert.equal(out.manifest.profile.items[0].file,undefined);
  assert.ok(!P.readProject(out.files['project/library.prproj']).includes(root));
  assert.ok(out.manifest.requirements.includes('Font / Fonte: Barlow'));
  const entry=Object.keys(out.files).find(x=>x.startsWith('media/'));assert.equal(Z.strFromU8(out.files[entry]),'sample audio');
});
