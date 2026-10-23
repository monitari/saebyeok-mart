import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../web/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const port = Number(process.env.PORT ?? 4173);
// Optional same-origin proxy to a local model server, so the browser needs no CORS setup.
// Only loopback targets are accepted; nothing is forwarded off this machine.
const aiTarget = new URL(process.env.LOCAL_AI_TARGET ?? 'http://127.0.0.1:11434');
const lmTarget = new URL(process.env.LOCAL_LM_TARGET ?? 'http://127.0.0.1:1234');
const isLoopback = url => ['http:','https:'].includes(url.protocol)&&['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);

async function proxy(req, res, pathname) {
  const base=pathname.startsWith('/local-lm/')?lmTarget:aiTarget;
  if (!isLoopback(base)) { res.writeHead(403); res.end('Model target must be a loopback address'); return; }
  const endpoint=pathname.replace(/^\/local-(ai|lm)/,'');
  const allowed={GET:['/api/tags','/v1/models'],POST:['/api/chat','/v1/chat/completions']};
  if(!allowed[req.method]?.includes(endpoint)){res.writeHead(404);res.end('Unsupported model endpoint');return;}
  const target = new URL(endpoint, base),ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),35000);
  res.once('close',()=>ctrl.abort());
  const chunks = [];
  try {
    let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>256000){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
    const r = await fetch(target, { method: req.method, headers: { 'Content-Type': req.headers['content-type'] ?? 'application/json' }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),signal:ctrl.signal,redirect:'error' });
    res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') ?? 'application/json' });
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch { if(!res.destroyed){res.writeHead(502); res.end(JSON.stringify({ error: 'local model server not reachable' }));} }
  finally{clearTimeout(timer);}
}

http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (/^\/local-(ai|lm)\//.test(pathname)) {await proxy(req, res, pathname);return;}
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root) || file === root.replace(/[\\/]$/, '')) throw new Error('Invalid path');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
