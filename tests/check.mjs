import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
async function walk(url){const all=[];for(const e of await readdir(url,{withFileTypes:true})){const p=new URL(e.name+(e.isDirectory()?'/':''),url);if(e.isDirectory())all.push(...await walk(p));else all.push(p);}return all;}
const strings=new Set(['Modern Package Manager']);
for(const file of await walk(new URL('htdocs/',root))){const src=await readFile(file,'utf8');if(file.pathname.endsWith('.js')){new Function(src);for(const m of src.matchAll(/_\('([^']*)'\)/g))strings.add(m[1]);assert.ok(!/innerHTML\s*=/.test(src));}}
for(const file of await walk(new URL('root/usr/share/',root)))if(file.pathname.endsWith('.json'))JSON.parse(await readFile(file,'utf8'));
const po=await readFile(new URL('po/zh_Hans/package-manager-modern.po',root),'utf8');
for(const str of strings)assert.ok(po.includes('msgid '+JSON.stringify(str)),`Missing translation: ${str}`);
const acl=JSON.parse(await readFile(new URL('root/usr/share/rpcd/acl.d/luci-app-package-manager-modern.json',root),'utf8'))['luci-app-package-manager-modern'];
assert.ok(!Object.keys(acl.read.file).some(path=>/ (install|upgrade|remove|update)( |$)/.test(path)));
assert.ok(Object.keys(acl.write.file).every(path=>path.startsWith('/usr/libexec/package-manager-modern ')));
assert.ok(!acl.write.file['/usr/libexec/package-manager-modern upgrade']);
console.log('JavaScript, JSON, translation coverage and least-privilege ACL checks passed.');
