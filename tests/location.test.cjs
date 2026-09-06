// Exercise location choices with synthetic coordinates, never the tester's actual location.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
class Element {
  constructor() { this.value=''; this.children=[]; this.listeners={}; this.textContent=''; this.disabled=false; }
  replaceChildren() { this.children=[]; }
  append(child) { this.children.push(child); }
  addEventListener(name, callback) { this.listeners[name]=callback; }
  focus() {}
  setAttribute(name,value) { this[name]=value; }
  get selectedOptions() { return [{textContent:'25 miles'}]; }
}
const nodes=new Map();
const node=selector=>{if(!nodes.has(selector)) nodes.set(selector,new Element()); return nodes.get(selector);};
node('#location-radius').value='40234';
let success, failure, requests=0, callbacks=[];
const events=[];
const pending=[];
const context=vm.createContext({console,AbortController, document:{querySelector:node,createElement:()=>new Element()},
 navigator:{geolocation:{getCurrentPosition:(ok,bad)=>{requests++;success=ok;failure=bad;callbacks.push(ok);}}},
 apiDebug:{start:()=>({}),finish:()=>{},markGroup:()=>{}},
 fetch:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))});
context.window=context;context.isSecureContext=true;
vm.runInContext(fs.readFileSync(path.join(__dirname,'../location.js'),'utf8'),context);
const location=context.restaurantLocation;
(async()=>{
 await location.init(trigger=>events.push(trigger));
 assert.equal(requests,0,'No automatic geolocation prompt');
 assert.equal(Object.keys(location.parameters()).length,0);
 node('#location-address').value='123 Example St, Test City, CA';
 node('#address-form').listeners.submit({preventDefault(){}});
 pending.shift().resolve({ok:true,status:200,json:async()=>({matches:[{label:'123 EXAMPLE ST, TEST CITY, CA',lat:37.77,lng:-122.42}]})});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(location.active(),false,'Address requires selection');
 node('#address-matches').children[0].listeners.click();
 assert.equal(location.parameters().aroundLatLng,'37.77,-122.42');
 assert.equal(location.parameters().aroundRadius,40234);
 assert.equal(location.parameters().aroundPrecision,1000);
 assert.equal(location.parameters().getRankingInfo,true);
 node('#location-radius').value='all';node('#location-radius').listeners.change();assert.equal(location.parameters().aroundRadius,'all');
 node('#use-location').listeners.click();failure({code:1});
 assert.match(node('#location-status').textContent,/declined/);
 assert.equal(location.parameters().aroundLatLng,'37.77,-122.42','Denial preserves address choice');
 node('#use-location').listeners.click();failure({code:3});assert.match(node('#location-status').textContent,/timed out/);
 node('#use-location').listeners.click();success({coords:{latitude:40.71281,longitude:-74.00601,accuracy:25}});
 assert.equal(location.parameters().aroundLatLng,'40.71,-74.01');
 assert.equal(location.debugParameters(location.parameters()).aroundLatLng,'[device coordinates hidden]');
 assert.equal(location.distanceText({_rankingInfo:{matchedGeoLocation:{distance:1609.344}}}),'≈ 1.0 mi from your approximate location');
 node('#use-location').listeners.click();const stale=success;
 node('#location-address').value='123 Example St, Test City, CA';
 node('#address-form').listeners.submit({preventDefault(){}});
 pending.shift().resolve({ok:true,status:200,json:async()=>({matches:[{label:'123 EXAMPLE ST, TEST CITY, CA',lat:37.77,lng:-122.42}]})});
 await new Promise(resolve=>setImmediate(resolve));
 node('#address-matches').children[0].listeners.click();
 stale({coords:{latitude:0,longitude:0,accuracy:25}});assert.equal(location.parameters().aroundLatLng,'37.77,-122.42');
 location.clear(false);assert.equal(location.active(),false);assert.equal(Object.keys(location.parameters()).length,0);
 context.isSecureContext=false;node('#use-location').listeners.click();assert.match(node('#location-status').textContent,/unavailable/);
 assert.ok(!events.some(event=>event.includes('40.71')));
 node('#location-address').value='Unmatched address, CA';
 node('#address-form').listeners.submit({preventDefault(){}});
 pending.shift().resolve({ok:true,status:200,json:async()=>({matches:[]})});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(node('#location-status').textContent,/No location match/);
 console.log('PASS: no automatic location prompt, address confirmation/fallback, radius, denial/timeout, device rounding/redaction, distances, stale callback and reset.');
})().catch(error=>{console.error(error);process.exitCode=1;});
