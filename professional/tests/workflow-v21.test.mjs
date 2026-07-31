import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [schema,migration,brandApi,indexV21,combined,index,manifest,icon,mark,brandCss,brandJs,app,sw,pkg,wranglerR2,readme]=await Promise.all([
  readFile(new URL('../worker/src/schema.js',import.meta.url),'utf8'),
  readFile(new URL('../migrations/0009_nuvasto_brand_v21.sql',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/api/brand-v21.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v21.js',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../web/index.html',import.meta.url),'utf8'),
  readFile(new URL('../web/manifest.webmanifest',import.meta.url),'utf8'),
  readFile(new URL('../web/icon.svg',import.meta.url),'utf8'),
  readFile(new URL('../web/nuvasto-mark.svg',import.meta.url),'utf8'),
  readFile(new URL('../web/brand-v21.css',import.meta.url),'utf8'),
  readFile(new URL('../web/app-nuvasto-v21.js',import.meta.url),'utf8'),
  readFile(new URL('../web/app.js',import.meta.url),'utf8'),
  readFile(new URL('../web/sw.js',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8'),
  readFile(new URL('../wrangler.r2.toml',import.meta.url),'utf8'),
  readFile(new URL('../../README.md',import.meta.url),'utf8')
]);

assert.match(schema,/SCHEMA_VERSION='21'/);
assert.match(schema,/0009_nuvasto_brand_v21\.sql/);
assert.match(schema,/nuvasto-brand-v21/);
assert.match(migration,/UPDATE brand_workspaces/);
assert.match(migration,/Documento generado por Nuvasto/);
assert.match(migration,/Compras claras\. Abastecimiento inteligente\./);
assert.match(brandApi,/ensureNuvastoBrandV21/);
assert.match(brandApi,/productName:'Nuvasto'/);
assert.match(brandApi,/Procurement OS/);
assert.match(brandApi,/#2BD6A0/);
assert.match(indexV21,/2\.0\.0-alpha\.21/);
assert.match(indexV21,/X-Nuvasto-Version/);
assert.match(combined,/index-v(?:21|22)\.js/);
assert.match(combined,/X-Nuvasto-Release/);
assert.match(index,/<title>Nuvasto<\/title>/);
assert.match(index,/nuvasto-mark\.svg/);
assert.match(index,/brand-v21\.css/);
assert.match(index,/rel="apple-touch-icon" href="\.\/icon\.svg"/);
assert.match(index,/Compras claras\. Abastecimiento inteligente\./);
assert.match(manifest,/"name": "Nuvasto"/);
assert.match(manifest,/"src":"\.\/icon\.svg"/);
assert.match(icon,/Nuvasto/);
assert.match(mark,/nuvastoGradient/);
assert.match(brandCss,/--nuvasto-mint:#2bd6a0/i);
assert.match(brandJs,/initializeNuvastoV21/);
assert.match(brandJs,/replaceAll\('pedidos-pro-files','nuvasto-files'\)/);
assert.match(app,/initializeNuvastoV21/);
assert.match(sw,/(?:nuvasto-v21-brand-platform|nuvasto-v22-orders-pdf-motion|nuvasto-v23-auth-keyboard)/);
assert.match(sw,/app-nuvasto-v21\.js/);
assert.match(sw,/nuvasto-logo\.svg/);
assert.match(pkg,/"name": "nuvasto-platform"/);
assert.match(pkg,/2\.0\.0-alpha\.(?:21|22|23)/);
assert.match(pkg,/nuvasto-files/);
assert.match(wranglerR2,/bucket_name = "nuvasto-files"/);
assert.match(readme,/# Nuvasto/);

console.log('workflow v21 Nuvasto brand compatibility: OK');