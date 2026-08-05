import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [rootWrangler,professionalWrangler,deployRedirect,combined,indexCurrent,deployWorkflow,verifyWorkflow,browserWorkflow,browserTest,pkg]=await Promise.all([
  readFile(new URL('../../wrangler.jsonc',import.meta.url),'utf8'),
  readFile(new URL('../wrangler.toml',import.meta.url),'utf8'),
  readFile(new URL('../../.wrangler/deploy/config.json',import.meta.url),'utf8'),
  readFile(new URL('../../worker/src/combined.js',import.meta.url),'utf8'),
  readFile(new URL('../worker/src/index-v30.js',import.meta.url),'utf8'),
  readFile(new URL('../../.github/workflows/deploy-cloudflare.yml',import.meta.url),'utf8'),
  readFile(new URL('../../.github/workflows/verify-live-platform.yml',import.meta.url),'utf8'),
  readFile(new URL('../../.github/workflows/e2e-live-v15.yml',import.meta.url),'utf8'),
  readFile(new URL('./live-browser-v15.mjs',import.meta.url),'utf8'),
  readFile(new URL('../package.json',import.meta.url),'utf8')
]);

const rootConfig=JSON.parse(rootWrangler);
const redirectConfig=JSON.parse(deployRedirect);
assert.equal(rootConfig.vars.PRODUCT_NAME,'Nuvasto');
assert.equal(rootConfig.vars.REQUIRE_R2,'true');
assert.ok(rootConfig.r2_buckets?.some(binding=>binding.binding==='FILES'&&binding.bucket_name==='nuvasto-files'));
assert.equal(redirectConfig.configPath,'../../professional/wrangler.toml');
assert.match(professionalWrangler,/binding = "FILES"/);
assert.match(professionalWrangler,/bucket_name = "nuvasto-files"/);
assert.match(professionalWrangler,/REQUIRE_R2 = "true"/);

assert.match(combined,/index-v30\.js/);
assert.match(combined,/2026\.08\.05\.31/);
assert.match(indexCurrent,/2\.0\.0-alpha\.30/);
assert.match(indexCurrent,/invoiceFlowVersion:30/);
assert.match(indexCurrent,/invoiceFallbackReview:true/);
assert.match(indexCurrent,/capabilityMatrixVersion:30/);
assert.match(indexCurrent,/responsiveOperationalModals:true/);

assert.match(deployWorkflow,/cloudflare\/wrangler-action@v3/);
assert.match(deployWorkflow,/CLOUDFLARE_API_TOKEN/);
assert.match(deployWorkflow,/workingDirectory: professional/);
assert.match(deployWorkflow,/deploy --config wrangler\.toml --keep-vars/);
assert.match(deployWorkflow,/r2Configured/);
assert.match(deployWorkflow,/r2Ready/);
assert.match(deployWorkflow,/workflow_dispatch/);
assert.match(deployWorkflow,/\n\s*push:/);
assert.match(deployWorkflow,/branches: \[main\]/);

for(const workflow of [verifyWorkflow,browserWorkflow]){
  assert.doesNotMatch(workflow,/2\.0\.0-alpha\.15/);
  assert.doesNotMatch(workflow,/schemaVersion\\?\"?:\\?\"15/);
  assert.doesNotMatch(workflow,/<title>Pedidos Pro<\/title>/);
  assert.match(workflow,/EXPECTED_VERSION/);
  assert.match(workflow,/EXPECTED_RELEASE/);
  assert.match(workflow,/r2Configured/);
  assert.match(workflow,/r2Ready/);
  assert.match(workflow,/workflow_dispatch/);
  assert.doesNotMatch(workflow,/\n\s*push:/);
}
assert.doesNotMatch(verifyWorkflow,/git push/);
assert.doesNotMatch(verifyWorkflow,/contents: write/);
assert.match(verifyWorkflow,/<title>Nuvasto<\/title>/);
assert.match(browserWorkflow,/actions\/checkout@v5/);
assert.match(browserWorkflow,/actions\/setup-node@v5/);
assert.match(browserWorkflow,/working-directory: professional/);
assert.match(browserTest,/page\.title\(\),'Nuvasto'/);
assert.match(browserTest,/analyze-invoice/);
assert.match(browserTest,/data-view=.*orders/);
assert.match(pkg,/2\.0\.0-alpha\.30/);

console.log('workflow v30 automatic Cloudflare deploy, R2 and manual live checks alignment: OK');
