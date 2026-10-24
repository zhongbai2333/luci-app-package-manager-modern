import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../htdocs/luci-static/resources/package-manager-modern/backend.js',import.meta.url),'utf8');
function make(exec){return new Function('baseclass','fs','rpc','model',source)({extend:x=>x},{exec_direct:exec},{declare:()=>async()=>[]},{parse:x=>x,merge:(...x)=>x});}
test('mutation passes one validated argv array and preserves nonzero APK result',async()=>{
 let captured;const api=make(async(...args)=>{captured=args;return {code:8,stdout:'partial',stderr:'error'};});
 assert.equal((await api.mutate('install',['tree','less'])).code,8);assert.deepEqual(captured,['/usr/libexec/package-manager-modern',['install','tree','less'],'json']);
});
test('flags, URLs, shell characters, empty batches and invalid actions never reach exec',async()=>{
 let called=0;const api=make(async()=>{called++;return{code:0}});
 for(const [action,names] of [['install',[]],['install',['--force-overwrite']],['remove',['a;id']],['install',['https://example.com/x.apk']],['upgrade',Array(101).fill('a')],['update',['a']],['shell',['a']]]) await assert.rejects(()=>api.mutate(action,names));
 assert.equal(called,0);
});
test('malformed result and transport errors are never promoted to success',async()=>{
 for(const result of [null,{}, {code:'0'}]) await assert.rejects(()=>make(async()=>result).mutate('remove',['tree']));
 await assert.rejects(()=>make(async()=>{throw new Error('timeout')}).mutate('remove',['tree']),/timeout/);
});
test('required read failure fails the load; optional disk/source status remains visible as errors',async()=>{
 await assert.rejects(()=>make(async(_h,[a])=>{if(a==='list-updates')throw Error('denied');return'[]'}).load(),/denied/);
 const loaded=await make(async(_h,[a])=>{if(a==='source-status')throw Error('source unavailable');return'[]'}).load();assert.match(loaded.sources.error,/source unavailable/);
});
