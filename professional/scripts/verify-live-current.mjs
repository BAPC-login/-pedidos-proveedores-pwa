import assert from 'node:assert/strict';
import fs from 'node:fs';

const canonical=JSON.parse(fs.readFileSync(new URL('../release.json',import.meta.url),'utf8'));
const expectedRelease=String(canonical.release||'').trim();
const generation=Number(canonical.generation||0);
const expectedCache=String(canonical.cache||`nuvasto-current-${generation}`);
const base=String(process.env.NUVASTO_BASE_URL||'').replace(/\/$/,'');
const expectedEnvironment=String(process.env.NUVASTO_EXPECT_ENV||'development').toLowerCase();
assert.match(expectedRelease,/^\d{4}\.\d{2}\.\d{2}\.\d+$/,'release.json must define the current release');
assert.ok(generation>0,'release.json must define the current architecture generation');
assert.ok(/^https:\/\//.test(base),'NUVASTO_BASE_URL is required');
assert.ok(['development','production'].includes(expectedEnvironment),'NUVASTO_EXPECT_ENV must be development or production');

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function text(path){
  const join=path.includes('?')?'&':'?';
  const response=await fetch(`${base}${path}${join}current=${Date.now()}-${generation}`,{cache:'no-store',headers:{'Cache-Control':'no-cache, no-store'}});
  assert.equal(response.ok,true,`live asset ${path} must be readable`);
  return response.text();
}
async function json(path){return JSON.parse(await text(path))}
function runtimeReady(health){
  const common=health.ok===true&&health.r2Configured===true&&health.r2Required===true&&health.r2Ready===true&&health.storageBackend==='r2'&&health.productionStabilityV91===true&&health.reservedOrdersAdvancedV91===true&&health.transientInvoiceRetryV91===true&&health.verifiedAiUsageV91===true;
  if(!common)return false;
  if(expectedEnvironment==='development')return health.environment==='development'&&health.developmentEnvironment===true;
  return health.environment!=='development'&&health.developmentEnvironment!==true&&health.nativePerformanceV45===true&&health.requestCoalescingV45===true&&health.operationsBootstrapV45===true&&health.directR2StreamingV45===true&&health.redirectSafeNavigationV50===true&&health.receptionRequiredForClosure===true&&health.invoiceRequiredForClosure===false&&health.paymentRequiredForClosure===false&&health.reconciliationRequiredForClosure===false;
}

let liveRelease={},health={};
for(let attempt=1;attempt<=24;attempt++){
  try{
    [liveRelease,health]=await Promise.all([json('/platform/release'),json('/platform/health')]);
    if(liveRelease.release===expectedRelease&&runtimeReady(health))break;
  }catch{}
  if(attempt===24)throw new Error(`live current generation did not become ready: release=${liveRelease?.release||'unknown'} expected=${expectedRelease} environment=${health?.environment||'unknown'}`);
  console.log(`waiting for ${expectedEnvironment} current generation ${attempt}/24 · live=${liveRelease?.release||'unknown'} · expected=${expectedRelease}`);
  await sleep(10_000);
}

const paths=['/index.html','/app.js','/app-release.js','/app-session-bootstrap.js','/app-release-guard.js','/app-router.js','/app-navigation.js','/app-suppliers.js','/app-experience-settings.js','/app-company-profile.js','/app-current.css','/sw.js','/sw-release.js','/app-suppliers-v94.js','/app-router-v14.js','/app-navigation-v14.js'];
const values=await Promise.all(paths.map(text));
const live=Object.fromEntries(paths.map((path,index)=>[path,values[index]]));

assert.ok(live['/index.html'].includes('id="nuvastoCurrentStyles"')&&live['/index.html'].includes('app-current.css'),'shell must expose the single current stylesheet');
assert.ok(live['/app-release.js'].includes(`CLIENT_RELEASE='${expectedRelease}'`),'client release must match release.json');
assert.ok(live['/app-release.js'].includes(`ARCHITECTURE_GENERATION=${generation}`),'client architecture generation must match release.json');
assert.ok(live['/app-release.js'].includes(`CURRENT_CACHE='${expectedCache}'`),'client cache identity must match release.json');
assert.ok(live['/app.js'].includes("from './app-navigation.js'")&&live['/app.js'].includes("from './app-release.js'"),'app must use canonical navigation and release sources');
assert.ok(live['/app-session-bootstrap.js'].includes("from './app-release-guard.js'"),'session bootstrap must run the release guard before hydration');
assert.ok(live['/app-release-guard.js'].includes('purgeStaleRuntime')&&live['/app-release-guard.js'].includes('getRegistrations')&&live['/app-release-guard.js'].includes('caches.delete')&&live['/app-release-guard.js'].includes('location.replace'),'release mismatch must purge stale workers/caches and reload');
assert.ok(live['/app-router.js'].includes('duplicate_route_owner')&&live['/app-router.js'].includes('route_registration_blocked'),'router must reject competing route owners');
assert.ok(live['/app-navigation.js'].includes("registerRouteRenderer('suppliers',renderSuppliersRoute)"),'Proveedores must have the current explicit route owner');
assert.ok(live['/app-suppliers.js'].includes('Pago pactado')&&live['/app-suppliers.js'].includes('Editar perfil')&&live['/app-suppliers.js'].includes('Identidad visual')&&live['/app-suppliers.js'].includes('/payment-terms'),'live supplier workspace must expose profile, logo and agreed payment terms');
assert.ok(live['/app-experience-settings.js'].includes('Perfil de empresa')&&live['/app-experience-settings.js'].includes('Perfil de local'),'settings must expose unified company and local profiles');
assert.ok(live['/app-company-profile.js'].includes('Paleta y documentos'),'company profile must own palette and document identity');
assert.ok(live['/sw.js'].includes("importScripts('./sw-release.js')")&&live['/sw.js'].includes('deleteStaleNuvastoCaches')&&live['/sw.js'].includes('client.navigate(client.url)'),'service worker must use generated identity, remove stale caches and refresh open clients');
assert.ok(!/PREVIOUS_CACHE_VERSION|LEGACY_CACHE_VERSION|PREVIOUS_VERSION/.test(live['/sw.js']),'service worker must not preserve historical generations');
assert.ok(live['/sw-release.js'].includes(`self.NUVASTO_RELEASE='${expectedRelease}'`)&&live['/sw-release.js'].includes(`self.NUVASTO_ARCHITECTURE_GENERATION=${generation}`)&&live['/sw-release.js'].includes(`self.NUVASTO_CACHE='${expectedCache}'`),'generated service-worker identity must match release.json');
assert.ok(live['/app-suppliers-v94.js'].includes("export * from './app-suppliers.js'"),'historical supplier URL must be only a compatibility alias to current code');
assert.ok(live['/app-router-v14.js'].includes("export * from './app-router.js'"),'historical router URL must be only a compatibility alias to current code');
assert.ok(live['/app-navigation-v14.js'].includes("from './app-navigation.js'"),'historical navigation URL must be only a compatibility alias to current code');

console.log(`live current verification: OK · ${expectedEnvironment} · ${expectedRelease} · generation ${generation} · suppliers/profile/SW aliases current`);
