import assert from 'node:assert/strict';
import fs from 'node:fs';

const prod=fs.readFileSync('wrangler.toml','utf8');
const dev=fs.readFileSync('wrangler.develop.toml','utf8');
const worker=fs.readFileSync('worker/src/worker-core-v91.js','utf8');
const prodWorkflow=fs.readFileSync('../.github/workflows/deploy-cloudflare.yml','utf8');
const verifyWorkflow=fs.readFileSync('../.github/workflows/verify.yml','utf8');

assert.match(prod,/name = "pedidos-pro-ai"/,'production Worker name must stay canonical');
assert.match(prod,/ENVIRONMENT = "production"/,'production environment must stay production');
assert.match(prod,/bucket_name = "nuvasto-files"/,'production R2 must stay on the production bucket');
assert.doesNotMatch(prod,/pedidos-pro-ai-dev|ENVIRONMENT = "development"/,'production config must not reference development resources');

assert.match(dev,/name = "pedidos-pro-ai-dev"/,'development must deploy to a separate Worker');
assert.match(dev,/ENVIRONMENT = "development"/,'development Worker must identify itself as development');
assert.match(dev,/PRODUCT_NAME = "Nuvasto DEV"/,'development product label must be explicit');
assert.match(dev,/AI_ENDPOINT = "https:\/\/pedidos-pro-ai-dev\.botreservasmultilocal\.workers\.dev"/,'development AI endpoint must be isolated');
assert.match(dev,/\[\[d1_databases\]\]\s*binding = "DB"/s,'development must have its own D1 binding');
assert.match(dev,/\[\[r2_buckets\]\]\s*binding = "FILES"/s,'development must have its own R2 binding');
assert.doesNotMatch(dev,/bucket_name = "nuvasto-files"/,'development must never bind the production R2 bucket');

assert.match(worker,/environment,developmentEnvironment:environment==='development'/,'health must expose the runtime environment');
assert.match(worker,/url\.pathname==='\/platform\/health'/,'platform health must be environment-aware');
assert.match(prodWorkflow,/branches: \[main\]/,'production deployment must remain main-only');
assert.doesNotMatch(prodWorkflow,/branches: \[develop\]/,'production workflow must never deploy develop');
assert.match(verifyWorkflow,/branches: \[main\]/,'PR verification must continue to target main');

console.log('environment isolation: OK · develop and production resources are separated');
