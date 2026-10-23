// Syntax check for every browser module and the local server.
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const modules = readdirSync('web/js', { recursive: true }).filter(f => f.endsWith('.js')).map(f => 'web/js/' + f.replaceAll('\\', '/'));
const files = [...modules, 'scripts/server.mjs'];
for (const f of files) execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });
console.log(`${files.length} files OK`);
await import('./check-ui.mjs');
