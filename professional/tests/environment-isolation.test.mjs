import assert from 'node:assert/strict';
import fs from 'node:fs';

const prod=fs.readFileSync('wrangler.toml','utf8');
const dev=fs.readFileSync('wrangler.develop.toml','utf8');
const worker=fs.readFileSync('worker/src/worker-core-v91.js','utf8');
const prodWorkflow=fs.readFileSync('../.github/workflows/deploy-cloudflare.yml','utf8');
const devWorkflow=fs.readFileSync('../.github/workflows/deploy-development.yml','utf8');
const verifyWorkflow=fs.readFileSync('../.github/workflows/verify.yml','utf8');
const destructiveDev=fs.readFileSync('tests/development-e2e-v92.mjs','utf8');
const aiCanary=fs.readFileSync('tests/development-ai-canary-v92.mjs','utf8');
const readonlyProd=fs.readFileSync('tests/production-readonly-e2e-v92.mjs','utf8');

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
assert.match(devWorkflow,/branches: \[develop\]/,'development deployment must remain develop-only');
assert.match(devWorkflow,/wrangler\.develop\.toml/,'development workflow must use isolated Cloudflare config');
assert.match(verifyWorkflow,/branches: \[main\]/,'PR verification must continue to target main');

assert.match(destructiveDev,/pedidos-pro-ai-dev\\\./,'destructive E2E must hard-guard the DEV host');
assert.match(destructiveDev,/production-e2e-v44\.mjs/,'legacy full journey may only be reached through the DEV guard');
assert.match(devWorkflow,/development-e2e-v92\.mjs/,'DEV workflow must use the guarded destructive journey');
assert.match(devWorkflow,/development-ai-canary-v92\.mjs/,'DEV workflow must run the real invoice AI canary when Gemini is configured');
assert.match(aiCanary,/pedidos-pro-ai-dev\\\./,'AI canary must hard-guard the DEV host');
assert.match(aiCanary,/\/api\/invoices\/analyze/,'AI canary must exercise the actual invoice analysis route');
assert.match(aiCanary,/application\/pdf/,'AI canary must send a real PDF fixture');

assert.match(prodWorkflow,/production-readonly-e2e-v92\.mjs/,'production must use the read-only authenticated smoke');
assert.doesNotMatch(prodWorkflow,/run: node tests\/production-e2e-v44\.mjs/,'production must never execute the destructive legacy E2E');
for(const forbidden of ['/api/order-batches','/api/invoices','/api/finance/payment-documents','/api/autosave','/receptions'])assert.ok(!readonlyProd.includes(forbidden),`production read-only smoke must not mutate via ${forbidden}`);

console.log('environment isolation: OK · develop is destructive-safe and production smoke is read-only');
