// Exercise the real card renderer without making booking or network requests.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');
class Node {
  constructor() { this.children=[]; this.hidden=true; this.attributes={}; }
  append(node) { this.children.push(node); }
  replaceChildren() { this.children=[]; }
  setAttribute(name,value) { this.attributes[name]=value; }
  addEventListener() {}
  remove() { this.removed=true; }
}
function card() {
  const nodes=new Map();
  return { querySelector(selector) { if(!nodes.has(selector)) nodes.set(selector,new Node()); return nodes.get(selector); } };
}
const list=new Node();
const context=vm.createContext({URL,document:{createElement:()=>new Node()},
 restaurantLocation:{distanceText:()=>''},
 $:selector=>selector==='#results-list' ? list : {content:{cloneNode:card}},
 state:{hits:[]}});
vm.runInContext(source.slice(source.indexOf('function reservationUrl'), source.indexOf('// Algolia returns a map')),context);
const safe=context.reservationUrl;
assert.equal(safe('http://www.opentable.com/single.aspx?rid=123'),'https://www.opentable.com/single.aspx?rid=123');
for (const url of [null, '', 'javascript:alert(1)','https://opentable.com.evil.example','https://evil.example','https://user:pass@opentable.com','https://opentable.com:444/path','/relative']) assert.equal(safe(url),null);
context.state.hits=[{name:'Sample Restaurant',stars_count:4.5,payment_options:['Visa','MasterCard','Visa','Cash Only'],reserve_url:'http://www.opentable.com/single.aspx?rid=123'}, {name:'No booking',payment_options:null,reserve_url:'javascript:alert(1)'}];
context.renderCards();
const first=list.children[0], second=list.children[1];
assert.deepEqual(first.querySelector('.result__payments').children.map(x=>x.textContent),['Visa','Mastercard','Cash Only']);
assert.equal(first.querySelector('.result__payments').hidden,false);
assert.equal(first.querySelector('.result__reserve').hidden,false);
assert.equal(first.querySelector('.result__reserve').href,'https://www.opentable.com/single.aspx?rid=123');
assert.match(first.querySelector('.result__reserve').attributes['aria-label'],/Sample Restaurant.*new tab/);
assert.equal(second.querySelector('.result__payments').hidden,true);
assert.equal(second.querySelector('.result__reserve').hidden,true);
console.log('PASS: card brands, duplicate removal, booking rendering, URL validation, and missing-field fallbacks.');
