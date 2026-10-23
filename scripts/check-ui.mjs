import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const html=readFileSync('dist/index.html','utf8'),app=readFileSync('dist/app.js','utf8'),ui=readFileSync('dist/ui.js','utf8'),css=readFileSync('dist/style.css','utf8')+readFileSync('dist/dashboard.css','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),dynamic=[...ui.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(ids.length,new Set(ids).size,'Duplicate HTML ID');
for(const m of app.matchAll(/\$\('([^']+)'\)/g))assert.ok([...ids,...dynamic].includes(m[1]),'Missing element '+m[1]);
const voids=new Set('area base br col embed hr img input link meta param source track wbr'.split(' ')),stack=[];
for(const m of html.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<(\/?)([a-z][\w-]*)\b[^>]*>/gi)){
  const tag=m[2].toLowerCase();if(voids.has(tag))continue;if(m[1])assert.equal(stack.pop(),tag,'HTML nesting');else stack.push(tag);
}
assert.equal(stack.length,0,'Unclosed HTML tags');
assert.equal((css.match(/\{/g)??[]).length,(css.match(/\}/g)??[]).length,'CSS brace balance');
console.log('HTML structure and UI references OK (not a browser layout test)');
