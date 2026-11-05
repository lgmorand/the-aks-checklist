import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fromRoot } from './lib.mjs';

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};
export async function startPreview(port = 0) {
  const directory = fromRoot('src', 'web');
  const server = http.createServer(async (request, response) => {
    try {
      const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = path.resolve(directory, '.' + requested);
      if (file !== directory && !file.startsWith(directory + path.sep)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const info = await stat(file);
      const target = info.isDirectory() ? path.join(file, 'index.html') : file;
      response.writeHead(200, {
        'Content-Type': mime[path.extname(target)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
      });
      response.end(await readFile(target));
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') response.writeHead(404).end('Not found');
      else if (error instanceof URIError) response.writeHead(400).end('Invalid URL');
      else { console.error('Preview request failed:', error); response.writeHead(500).end('Server error'); }
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
if (process.argv[1] === fromRoot('scripts', 'preview.mjs')) {
  const preview = await startPreview(Number(process.env.PORT ?? 4173));
  console.log(`AKS Checklist preview: ${preview.url}`);
}
