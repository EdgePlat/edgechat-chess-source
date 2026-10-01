// Builds the Chess game: bundles src/main.tsx into chess.js and chess.css, writes game.html and
// credits.html, and copies this source beside them in package/assets/source/.
//
//   CHESS_OUT           output directory (default: ./dist)
//   CHESS_LICENSES      directory holding ATTRIBUTION.md and the licence texts (default: ./licenses)
//   CHESS_DEPENDENCIES  directory whose node_modules holds the dependencies (default: this directory)
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.env.CHESS_OUT || resolve(here, 'dist'));
const licenses = resolve(process.env.CHESS_LICENSES || resolve(here, 'licenses'));
const dependencies = resolve(process.env.CHESS_DEPENDENCIES || here);
const require = createRequire(resolve(dependencies, 'package.json'));
const { build } = require('esbuild');
const assets = resolve(out, 'package/assets');
mkdirSync(assets, { recursive: true });
await build({ entryPoints: [resolve(here, 'src/main.tsx')], bundle: true, minify: true, jsx: 'automatic', format: 'iife', nodePaths: [resolve(dependencies, 'node_modules')], outfile: resolve(assets, 'chess.js'), define: {'process.env.NODE_ENV': '"production"'}, loader: {'.jpg': 'file'}, external: ['./assets/*', './wood.jpg'] });
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="edgechat-game-runtime" content="chess-desktop-package"><title>Chess</title><link rel="stylesheet" href="./assets/chess.css"></head><body><div id="root"></div><script src="./assets/chess.js"></script><script data-edgechat-chess-adapter>/* Lifecycle bridge is bundled in chess.js: addEventListener('message'), 'pause', 'resume', 'restart'. */</script></body></html>`;
writeFileSync(resolve(out, 'game.html'), html);
// The source rides beside the program it builds (GPL-3.0 / AGPL-3.0 corresponding source).
const source = resolve(assets, 'source');
rmSync(source, { recursive: true, force: true });
for (const name of ['src', 'build.mjs', 'package.json', 'package-lock.json', 'README.md']) cpSync(resolve(here, name), resolve(source, name), { recursive: true });
if (licenses !== resolve(assets, 'licenses')) cpSync(licenses, resolve(assets, 'licenses'), { recursive: true });
const credits = readFileSync(resolve(licenses, 'ATTRIBUTION.md'), 'utf8');
writeFileSync(resolve(assets, 'credits.html'), '<!doctype html><meta charset="utf-8"><title>Chess credits</title><pre>' + credits.replaceAll('&','&amp;').replaceAll('<','&lt;') + '</pre>');
console.log('Built Chess into ' + out);
