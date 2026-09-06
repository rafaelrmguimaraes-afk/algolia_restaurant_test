const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const context={window:{}}; vm.runInNewContext(fs.readFileSync('sentence-search.js','utf8'),context);
const parse=context.window.sentenceSearch.parse;
let p=parse('Best Japanese under "$30" accepting Visa');
assert.equal(p.query,'');
assert.deepEqual(Array.from(p.tokens,t=>t.value).sort(),['$30 and under','Best','Japanese','Visa'].sort());
for(const t of p.tokens) assert.ok(t.end>t.start);
p=parse('Italian accepting American Express');assert.ok(p.tokens.some(t=>t.value==='AMEX'));assert.equal(p.query,'');
p=parse('Japanese under $20');assert.match(p.query,/20/);assert.ok(p.notes.length);
p=parse('Japanese without Visa');assert.equal(p.tokens.length,0);
p=parse('Pazza Notte');assert.equal(p.query,'Pazza Notte');
p=parse('Japanese under $300');assert.ok(!p.tokens.some(t=>t.kind==='price'));
console.log('PASS: combinations, aliases, offsets, unsupported prices, negation, restaurant names.');

p=parse('cheapest brazilian steak house');assert.equal(p.query,'');assert.ok(p.tokens.some(t=>t.value==='Brazilian Steakhouse'));assert.ok(p.tokens.some(t=>t.kind==='cheapest'));

for (const [word,band] of [['cheap','$30 and under'],['moderate','$31 to $50'],['expensive','$50 and over']]) {
 const parsed=parse(word+' Italian');
 assert.equal(parsed.query,'');
 assert.ok(parsed.tokens.some(t=>t.kind==='price' && t.value===band));
}

for (const word of ['pizza','Pizzeria','pizzaria','pizzeira']) {
 const parsed=parse(word); assert.equal(parsed.query,'');
 assert.ok(parsed.tokens.some(t=>t.kind==='cuisine' && t.value==='Pizzeria'));
}
