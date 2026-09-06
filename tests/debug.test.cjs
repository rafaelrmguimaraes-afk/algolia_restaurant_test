const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const vm = require('node:vm');
const assert = require('node:assert/strict');
// A tiny fake DOM lets Node run the debugger without a browser or real API credentials.
class Element {
  constructor() { this.children=[]; this.listeners={}; this.value=''; this.textContent=''; this.scrollTop=0; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children=children; }
  addEventListener(event, callback) { this.listeners[event]=callback; }
  setAttribute() {}
  focus() {}
}
const nodes=new Map();
const node=selector => { if(!nodes.has(selector)) nodes.set(selector,new Element()); return nodes.get(selector); };
const document={querySelector:node,createElement:()=>new Element(),activeElement:null};
// Mock fetch queues pending requests so tests control response order and HTTP outcomes.
const queue=[];
// Run the actual application scripts in an isolated context; replace only browser/network services.
const context=vm.createContext({document,performance,Date,JSON,Set,AbortController,setTimeout,clearTimeout,console,
 fetch:(url,options)=>new Promise((resolve,reject)=>queue.push({url,options,resolve,reject}))});
context.window=context;
context.restaurantLocation={init:()=>{}, parameters:()=>({}), debugParameters:value=>value, distanceText:()=>'', clear:()=>{}, active:()=>false};
vm.runInContext(fs.readFileSync(path.join(root, 'sentence-search.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root, 'debug.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root, 'index.js'),'utf8').replace(/init\(\);\s*$/, ''),context);
vm.runInContext("state.config={appId:'APP',indexName:'restaurants',searchApiKey:'SECRET_SEARCH_KEY'}; renderCards=()=>{}; renderCuisines=()=>{};",context);
for (const size of [20,50,100]) {
 node('#page-size').value=String(size);
 assert.equal(vm.runInContext('searchParameters(0).hitsPerPage',context),size);
}
node('#page-size').value='20';
const result={hits:[{objectID:'1'}],nbHits:12,nbPages:2,page:0,processingTimeMS:2,facets:{food_type:{Italian:12}}};
const respond=(item, data=result, status=200)=>item.resolve({ok:status===200,status,json:async()=>data});
const text=element=>element.textContent+' '+element.children.map(text).join(' ');
(async()=>{
 let run=vm.runInContext("runSearch(false,'Page loaded')",context);
 assert.equal(queue.length,1);respond(queue.shift());await run;
 assert.match(text(node('#api-log')),/Applied to page/);
 vm.runInContext("state.cuisines.add('Italian')",context);
 run=vm.runInContext("runSearch(false,'Cuisine changed')",context);
 assert.equal(queue.length,2);
 const [hits,facets]=queue.splice(0);
 assert.equal(JSON.parse(hits.options.body).facetFilters[0][0],'food_type:Italian');
 assert.equal(JSON.parse(facets.options.body).facetFilters.length,0);
 assert.equal(JSON.parse(facets.options.body).hitsPerPage,0);
 respond(hits);respond(facets);await run;
 run=vm.runInContext("runSearch(true,'Show more')",context);
 assert.equal(queue.length,1);assert.equal(JSON.parse(queue[0].options.body).page,1);
 respond(queue.shift(),{...result,page:1});await run;
 // Location parameters must reach both parallel requests, and the debugger must redact device coordinates.
 context.restaurantLocation.parameters=()=>({aroundLatLng:'37.77,-122.42',aroundRadius:40234,aroundPrecision:1000,getRankingInfo:true});
 context.restaurantLocation.debugParameters=params=>({...params,aroundLatLng:'[device coordinates hidden]'});
 run=vm.runInContext("runSearch(false,'Geo integration test')",context);
 assert.equal(queue.length,2);
 for(const pending of queue.splice(0)) { assert.equal(JSON.parse(pending.options.body).aroundRadius,40234); assert.equal(JSON.parse(pending.options.body).aroundLatLng,'37.77,-122.42'); respond(pending); }
 await run;
 assert.ok(!text(node('#api-log')).includes('37.77,-122.42'));
 assert.match(text(node('#api-log')),/device coordinates hidden/);
 context.restaurantLocation.parameters=()=>({});
 context.restaurantLocation.debugParameters=value=>value;
 vm.runInContext('state.cuisines.clear()',context);
 // Complete the newer request first to verify that a late older response cannot overwrite it.
 const old=vm.runInContext("runSearch(false,'Old query')",context);
 const newer=vm.runInContext("runSearch(false,'New query')",context);
 const stale=queue.shift(),fresh=queue.shift();
 respond(fresh,{...result,nbHits:7});await newer;
 respond(stale,{...result,nbHits:99});await old;
 assert.match(node('#results-count').textContent,/7 restaurants/);
 assert.match(text(node('#api-log')),/Superseded/);
 run=vm.runInContext("runSearch(false,'Failure test')",context);
 respond(queue.shift(),{},403);await run;
 assert.match(text(node('#api-log')),/HTTP 403/);
 assert.match(text(node('#api-log')),/Not applied: search failed/);
 run=vm.runInContext("runSearch(false,'Cancellation test')",context);
 const error=new Error('cancelled');error.name='AbortError';queue.shift().reject(error);await run;
 assert.match(text(node('#api-log')),/Cancelled in browser/);
 vm.runInContext("state.cuisines.add('Pizzeria'); searchInput.value='Italian';",context);
 const italian=vm.runInContext('searchParameters(0)',context);
 assert.ok(italian.facetFilters.includes('food_type:Italian'));
 assert.ok(!JSON.stringify(italian.facetFilters).includes('Pizzeria'));
 node('#price').value='$50 and over';
 // Cheapest probes the whole matching set before choosing a band for the result request.
 vm.runInContext("state.cuisines.clear(); searchInput.value='cheapest brazilian steak house';",context);
 run=vm.runInContext("runSearch(false,'Cheapest')",context);
 assert.equal(queue.length,3);
 assert.ok(!JSON.parse(queue[0].options.body).facetFilters.includes('price_range:$50 and over'));
 const probes=queue.splice(0);
 assert.ok(JSON.parse(probes[0].options.body).facetFilters.includes('food_type:Brazilian Steakhouse'));
 probes.forEach((probe,i)=>respond(probe,{...result,hits:[],nbHits:i===0?0:4}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(queue.length,1);
 assert.ok(JSON.parse(queue[0].options.body).facetFilters.includes('price_range:$31 to $50'));
 respond(queue.shift());await run;
 // Check that the secret used in request headers never appears in the visible teaching log.
 assert.ok(!text(node('#api-log')).includes('SECRET_SEARCH_KEY'));
 for(let i=0;i<35;i++)vm.runInContext("apiDebug.start({group:100,trigger:'Test',purpose:'Test',method:'GET',endpoint:'/test'})",context);
 assert.equal(node('#api-log').children.length,30);
 node('#clear-api-log').listeners.click();assert.equal(node('#api-log').children.length,0);
 console.log('PASS: result/facet request bodies, pagination, stale responses, HTTP failures, cancellation, key omission, 30-entry cap and clear log.');
})().catch(error=>{console.error(error);process.exitCode=1});
