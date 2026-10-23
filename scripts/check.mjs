// Syntax check for every browser module and the server.
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const files = [...readdirSync('dist').filter(f => f.endsWith('.js')).map(f => 'dist/' + f), 'server.mjs'];
for (const f of files) execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });
console.log(`${files.length} files OK`);
await import('./check-ui.mjs');
