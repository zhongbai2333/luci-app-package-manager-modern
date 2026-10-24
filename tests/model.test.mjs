import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../htdocs/luci-static/resources/package-manager-modern/model.js',import.meta.url),'utf8');
const model=new Function('baseclass',source)({extend:x=>x});
const record=(name,version='1.0-r1',extra={})=>({name,version,...extra});
const parse=list=>model.parse(JSON.stringify(list));

test('APK JSON preserves sizes, dependencies, virtual providers and untrusted text as data',()=>{
 const p=parse([record('test','1.0_rc1-r2',{'file-size':1024,'installed-size':4096,description:'<img src=x onerror=alert(1)>',depends:['libc','so:libfoo.so.1'],provides:['virtual=1']})]).get('test');
 assert.equal(p.size,1024);assert.equal(p.installedSize,4096);assert.equal(p.description,'<img src=x onerror=alert(1)>');assert.deepEqual(p.depends,['libc','so:libfoo.so.1']);
});
test('stable helper control format includes final record without trailing blank line',()=>{
 const p=model.parse('Package: tree\nVersion: 2.2.1-r2\nDepends: libc, libx>=1\nDescription: first\n second\nSize: 12\nInstalled-Size: 34').get('tree');
 assert.equal(p.description,'first\nsecond');assert.deepEqual(p.depends,['libc','libx>=1']);assert.equal(p.size,12);assert.equal(p.installedSize,34);
});
test('malformed and empty responses fail instead of showing an empty valid device',()=>{
 for(const raw of ['', 'permission denied', '{}', '[null]', '[{"name":"-x","version":"1"}]','[{"name":"x;touch p","version":"1"}]','[{"name":"x"}]']) assert.throws(()=>model.parse(raw));
 assert.equal(model.parse('[]').size,0);
});
test('missing or negative sizes stay unknown',()=>{
 const all=parse([record('a'),record('b','1',{'file-size':-1})]); assert.equal(all.get('a').size,null);assert.equal(all.get('b').size,null);
});
test('update state follows APK even when version ordering is not numeric',()=>{
 const all=model.merge(parse([record('a','1.0-r0'),record('b','1.0_rc1-r0')]),parse([record('a','1.0_rc9-r0'),record('b','1.0-r0')]),parse([record('a','1.0-r0')]));
 assert.equal(all.get('a').update.version,'1.0-r0');assert.equal(all.get('b').update,null);
});
test('installed packages absent from repositories remain visible and removable',()=>{
 const all=model.merge(parse([]),parse([record('local')]),parse([]));assert.equal(model.filter(all,'installed','','all','name')[0].name,'local');assert.doesNotThrow(()=>model.validate(new Map([['local','remove']]),all));
});
test('query is literal and matches descriptions case-insensitively; status and category intersect',()=>{
 const all=model.merge(parse([record('luci-a','1',{description:'网络 DNS [x]'}),record('kmod-a')]),parse([record('kmod-a')]),parse([]));
 assert.deepEqual(model.filter(all,'available','dns [x]','luci','name').map(p=>p.name),['luci-a']);assert.equal(model.filter(all,'available','','kernel','name').length,0);
});
test('unknown package sizes sort last, with stable name tie-breaking',()=>{
 const all=model.merge(parse([record('z'),record('b','1',{'file-size':4}),record('a','1',{'file-size':4})]),parse([]),parse([]));assert.deepEqual(model.filter(all,'all','','all','size').map(p=>p.name),['a','b','z']);
});
test('an exact package name ranks ahead of matches buried in descriptions',()=>{
 const all=model.merge(parse([record('wireless-tool','1',{description:'less work'}),record('less'),record('less-extra'),record('libless')]),parse([]),parse([]));
 assert.deepEqual(model.filter(all,'all','less','all','relevance').map(p=>p.name),['less','less-extra','libless','wireless-tool']);
});
test('queue validation rejects state changes, arbitrary actions, empty plans and oversized batches',()=>{
 const all=model.merge(parse([record('new')]),parse([record('old')]),parse([]));
 for(const q of [new Map(),new Map([['new','upgrade']]),new Map([['old','install']]),new Map([['new','remove']]),new Map([['new','update']]),new Map([['missing','install']]),new Map(Array.from({length:101},(_,i)=>['p'+i,'install']))]) assert.throws(()=>model.validate(q,all));
});
test('group order installs and upgrades before removals without splitting arguments',()=>{
 assert.deepEqual(model.groups(new Map([['old','remove'],['a','install'],['b','install'],['c','upgrade']])),[{action:'install',names:['a','b']},{action:'upgrade',names:['c']},{action:'remove',names:['old']}]);
});
test('reverse dependency hint supports versioned virtual aliases and excludes conflicts',()=>{
 const all=model.merge(parse([]),parse([record('provider','1',{provides:['virtual=2']}),record('consumer','1',{depends:['virtual>=2']}),record('conflict','1',{depends:['!provider']})]),parse([]));assert.deepEqual(model.reverseDependencies('provider',all),['consumer']);
});
test('12,193 package search remains bounded; rendered pagination is handled separately',()=>{
 const list=Array.from({length:12193},(_,i)=>record('pkg-'+String(i).padStart(5,'0'),'1', {description:'test package'}));
 const start=performance.now();const all=model.merge(parse(list),parse([]),parse([]));assert.equal(model.filter(all,'all','pkg-12','all','name').length,193);assert.ok(performance.now()-start<3000);
});
