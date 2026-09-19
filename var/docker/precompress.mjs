// Pre-compress Next's immutable static files once, at image build time, so nginx
// serves ready-made .br / .gz from disk (brotli_static / gzip_static) instead of
// the Node frontend gzip-compressing every JS file on every request. The server
// is CPU-starved, so compression must not happen per request.
// Usage: node var/docker/precompress.mjs apps/frontend/.next/static
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const root = process.argv[2];
if (!root) throw new Error('usage: precompress.mjs <dir>');
const EXT = /\.(js|css|svg|json|txt|html|map)$/;
let files = 0, before = 0, br = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    if (!EXT.test(name) || st.size < 1024) continue;
    const buf = readFileSync(p);
    const b = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
    writeFileSync(p + '.br', b);
    writeFileSync(p + '.gz', gzipSync(buf, { level: 9 }));
    files++; before += buf.length; br += b.length;
  }
};
walk(root);
console.log(`precompressed ${files} files: ${(before / 1048576).toFixed(1)} MB -> brotli ${(br / 1048576).toFixed(1)} MB`);
