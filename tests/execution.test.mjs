import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../htdocs/luci-static/resources/view/system/package-manager-modern.js',import.meta.url),'utf8');
const modelSource=await readFile(new URL('../htdocs/luci-static/resources/package-manager-modern/model.js',import.meta.url),'utf8');
const model=new Function('baseclass',modelSource)({extend:x=>x});
const parse=x=>model.parse(x.map(name=>({name,version:'1'})));
const all=model.merge(parse(['a','b','c']),parse(['b','c']),model.parse([{name:'b',version:'2'}]));
function setup(responses,{readonly=false,reloadFailure=false}={}){
 const calls=[];
 const base=new Function('view','ui','dom','model','backend','L','E','_','window',source)(
  {extend:x=>x},{menu:{flushCache(){}}},{content(){}},model,
  {async mutate(action,names){calls.push([action,names]);const result=responses.shift();if(result instanceof Error)throw result;return result;}},
  {hasViewPermission:()=>!readonly},()=>({classList:{remove(){}},textContent:''}),x=>x,{addEventListener(){},removeEventListener(){}});
 const ctx=Object.create(base);Object.assign(ctx,{queue:new Map([['a','install'],['b','upgrade'],['c','remove']]),selected:new Set(),data:{packages:all},busy:false,stale:false,draw(){},modal(){}});
 let reloads=0;ctx.reload=async()=>{reloads++;if(reloadFailure&&reloads>1)throw Error('read unavailable');ctx.stale=false;};
 return {ctx,calls};
}
test('a failed group stops later groups and keeps the uncertain and unexecuted queue entries',async()=>{
 const {ctx,calls}=setup([{code:0},{code:3,stderr:'solver failed'}]);await ctx.execute(model.groups(ctx.queue));
 assert.deepEqual(calls.map(c=>c[0]),['install','upgrade']);assert.deepEqual([...ctx.queue],[['b','upgrade'],['c','remove']]);assert.match(ctx.log,/Exit code: 3/);assert.equal(ctx.busy,false);
});
test('transport failure never removes entries or automatically retries',async()=>{
 const {ctx,calls}=setup([new Error('connection lost')]);await ctx.execute(model.groups(ctx.queue));assert.equal(calls.length,1);assert.equal(ctx.queue.size,3);assert.match(ctx.log,/result may be incomplete/);
});
test('success clears the queue, but a final reload failure keeps write operations disabled',async()=>{
 const {ctx,calls}=setup([{code:0},{code:0},{code:0}],{reloadFailure:true});await ctx.execute(model.groups(ctx.queue));assert.equal(calls.length,3);assert.equal(ctx.queue.size,0);assert.equal(ctx.canWrite(),false);assert.match(ctx.log,/Unable to reload/);
});
test('a read-only view never starts any backend mutation',async()=>{
 const {ctx,calls}=setup([],{readonly:true});await ctx.execute(model.groups(ctx.queue));assert.equal(calls.length,0);assert.equal(ctx.queue.size,3);
});
