const {test}=require('node:test'),assert=require('node:assert/strict');
const {Host}=require('../host');
const clip={kind:'audio',track:0,start:'0',end:'100',in:'0',out:'100',name:'hit',components:[],disabled:false,adjustment:false,speed:1,reversed:0};
function fixture(options={}){
  const calls=[], edit={guid:'edit'}, original={guid:'original',path:'C:/Edit.prproj',async save(){calls.push('save-original');return true;},async getActiveSequence(){return edit;},async getSequences(){return[edit];},async setActiveSequence(s){calls.push('restore-sequence:'+s.guid);}};
  let sequences=[];
  const isolated={guid:'isolated',path:'C:/Private/library.prproj',async getSequences(){return sequences;},async importSequences(file,ids){calls.push(['import',file,ids]);if(options.failImport)throw Error('native failure');sequences.push({guid:'copied',name:'library'});return true;},
    async getRootItem(){return{async getItems(){return[{offline:!!options.offline}];}};},async save(){calls.push('save-isolated');return true;},async close(){calls.push('close-isolated');return true;}};
  class Close{setPromptIfDirty(v){assert.equal(v,false);}setSaveWorkspace(v){assert.equal(v,false);}}
  class Open{setAddToMRUList(v){assert.equal(v,false);}setShowLocateFileDialog(v){assert.equal(v,false);}}
  const api={Project:{async getActiveProject(){return original;},async createProject(p){calls.push('create-isolated');assert.equal(p,isolated.path);return isolated;},async open(p){calls.push('restore-original');assert.equal(p,original.path);return original;}},
    CloseProjectOptions:Close,OpenProjectOptions:Open,Guid:{fromString:x=>x},FolderItem:{cast(){return null;}},ClipProjectItem:{cast:item=>({async isSequence(){return false;},async isOffline(){return item.offline;},async getMediaFilePath(){return 'C:/hit.wav';}})}};
  const io={async checkPayload(){calls.push('check-payload');}},host=new Host(api,io);
  host.stableScan=async()=>({data:{video:[],audio:[{clips:[clip]}],transitions:[]}});
  const asset={id:'preset',file:'C:/Snapshot.prproj',sequenceId:'source-id',sequenceName:'library',clips:[clip],transitions:[]};
  return{calls,host,asset,original,isolated};
}
test('native contract: profile export imports only saved sequences into a separate new project, then restores original',async()=>{
  const f=fixture();f.host.cache.set('old',{});
  const result=await f.host.exportProfileProject([f.asset],f.isolated.path,()=>{});
  assert.deepEqual(result.sequences.preset,{id:'copied',name:'library'});assert.deepEqual(result.media,['C:/hit.wav']);
  assert.deepEqual(f.calls,['save-original','create-isolated','check-payload',['import','C:/Snapshot.prproj',['source-id']],'save-isolated','close-isolated','restore-original','restore-sequence:edit']);
  assert.equal(f.original.path,'C:/Edit.prproj');assert.equal(f.host.cache.size,0);
});
test('native contract: import failure still closes only owned scratch and restores original sequence',async()=>{
  const f=fixture({failImport:true});await assert.rejects(f.host.exportProfileProject([f.asset],f.isolated.path,()=>{}),/native failure/);
  assert.deepEqual(f.calls.slice(-3),['close-isolated','restore-original','restore-sequence:edit']);assert.equal(f.calls.includes('save-isolated'),false);
});
test('native contract: offline dependencies refuse export without modifying or relinking original media',async()=>{
  const f=fixture({offline:true});await assert.rejects(f.host.exportProfileProject([f.asset],f.isolated.path,()=>{}),/offline/);
  assert.equal(f.calls.includes('save-isolated'),false);assert.equal(f.calls.at(-1),'restore-sequence:edit');
});
test('native contract: host returning original instead of new project is rejected, original is never closed',async()=>{
  const f=fixture();f.host.ppro.Project.createProject=async()=>f.original;
  await assert.rejects(f.host.exportProfileProject([f.asset],f.isolated.path,()=>{}),/isolado/);
  assert.equal(f.calls.includes('close-isolated'),false);assert.equal(f.calls.at(-1),'restore-sequence:edit');
});
test('native contract: unsaved originals stop before creating anything',async()=>{
  const f=fixture();f.original.path='';await assert.rejects(f.host.exportProfileProject([f.asset],f.isolated.path,()=>{}),/Salve/);assert.deepEqual(f.calls,[]);
});
test('portable insert accepts only its own collected media, including nested sequences',async()=>{
  const f=fixture(),seq={guid:'top'},nested={guid:'nested'},asset={portable:true,portableMedia:['C:/Private/hit.wav']};
  const media={async isSequence(){return false;},async getMediaFilePath(){return 'C:\\Private\\hit.wav';},async isOffline(){return false;}};
  const nest={async isSequence(){return true;},async getSequence(){return nested;}};
  f.host.ppro.ClipProjectItem.cast=x=>x;
  const scan=item=>({refs:[{clip:{adjustment:false},item:{async getProjectItem(){return item;}}}]});
  f.host.stableScan=async()=>scan(media);
  await f.host.checkPortableMedia(asset,seq,scan(nest));
  media.getMediaFilePath=async()=> 'C:/Sender/hit.wav';
  await assert.rejects(f.host.checkPortableMedia(asset,seq,scan(nest)),/fora do perfil/);
});
test('portable insert rejects offline collected media; ordinary existing presets are unchanged',async()=>{
  const f=fixture();f.host.ppro.ClipProjectItem.cast=x=>x;
  const scan={refs:[{clip:{adjustment:false},item:{async getProjectItem(){return {async isSequence(){return false;},async getMediaFilePath(){return 'C:/Private/hit.wav';},async isOffline(){return true;}};}}}]};
  await assert.rejects(f.host.checkPortableMedia({portable:true,portableMedia:['C:/Private/hit.wav']},{guid:'top'},scan),/fora do perfil/);
  await f.host.checkPortableMedia({portable:false},null,null);
});
test('portable insert permits verified Black Video generators without expecting a disk media file',async()=>{
  const f=fixture();f.host.ppro.ClipProjectItem.cast=x=>x;
  const scan={refs:[{clip:{adjustment:false},item:{async getProjectItem(){return {async isSequence(){return false;},async getMediaFilePath(){return '1112293707';},async isOffline(){return false;}};}}}]};
  await f.host.checkPortableMedia({portable:true,portableMedia:[],portableGenerators:['1112293707']},{guid:'top'},scan);
  await assert.rejects(f.host.checkPortableMedia({portable:true,portableMedia:[]},{guid:'top'},scan),/fora do perfil/);
});
