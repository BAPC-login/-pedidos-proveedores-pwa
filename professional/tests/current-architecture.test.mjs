import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const root=path=>fs.readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');
const release=JSON.parse(read('release.json'));
const app=read('web/app.js');
const generatedClient=read('web/app-release.js');
const generatedWorker=root('worker/src/release.js');
const combined=root('worker/src/combined.js');
const sw=read('web/sw.js');
const guard=read('web/app-release-guard.js');
const bootstrap=read('web/app-bootstrap.js');
const professional=read('web/app-professional.js');
const router=read('web/app-router.js');
const navigation=read('web/app-navigation.js');
const catalogCurrent=read('web/app-catalog-current.js');
const legacyCatalog=read('web/app-catalog.js');
const suppliers=read('web/app-suppliers.js');
const legacySupplier=read('web/app-suppliers-v94.js');
const legacyRouter=read('web/app-router-v14.js');
const legacyNavigation=read('web/app-navigation-v14.js');
const packageJson=JSON.parse(read('package.json'));
const prod=read('wrangler.toml');
const dev=read('wrangler.develop.toml');

assert.match(release.release,/^\d{4}\.\d{2}\.\d{2}\.\d+$/,'release manifest must be explicit');
assert.ok(generatedClient.includes(`CLIENT_RELEASE='${release.release}'`),'client release must be generated from release.json');
assert.ok(generatedWorker.includes(`PLATFORM_RELEASE='${release.release}'`),'platform release must be generated from release.json');
assert.match(app,/from '\.\/app-release\.js'/,'runtime must consume generated client release state');
assert.doesNotMatch(app,/const CLIENT_RELEASE=|const OFFLINE_WARM_KEY=/,'runtime source must not duplicate generated release literals');
assert.doesNotMatch(app,/verifyClientRelease|releaseCheckPromise|releaseFetch/,'release mismatch logic must exist only in the pre-hydration release guard');
assert.match(app,/from '\.\/app-navigation\.js'/,'runtime must use semantic navigation directly');
assert.doesNotMatch(app,/app-navigation-v14\.js|openInitialRouteV14/,'runtime must not execute the versioned navigation facade');
assert.match(combined,/from '\.\/release\.js'/,'combined worker must consume generated release state');
assert.doesNotMatch(combined,/const PLATFORM_RELEASE='[^']+'/,'combined worker must not own a second release literal');

assert.match(sw,/importScripts\('\.\/sw-release\.js'\)/,'service worker must consume the generated release manifest');
assert.match(sw,/deleteStaleNuvastoCaches/,'activation must delete stale Nuvasto caches');
assert.match(sw,/key\.startsWith\('nuvasto-'\).*key!==CACHE_VERSION.*key!==DATA_CACHE/s,'only the current shell and current data cache may survive activation');
assert.doesNotMatch(sw,/PREVIOUS_CACHE_VERSION|LEGACY_CACHE_VERSION|PREVIOUS_VERSION/,'old cache generations must not be retained or referenced');
assert.match(sw,/client\.navigate\(client\.url\)/,'activated releases must replace already-open stale clients');
assert.match(sw,/Promise\.all\(PRECACHE\.map/,'current shell installation must remain atomic');
assert.match(sw,/app-release-guard\.js/,'release guard must be available offline with the current shell');

assert.match(guard,/ensureCurrentRelease/,'startup must verify release before UI hydration');
assert.match(guard,/purgeStaleRuntime/,'a release mismatch must purge stale worker/cache state');
assert.match(guard,/location\.replace/,'a mismatch must reload into the server release');
assert.match(guard,/app-current\.css/,'startup must consolidate the active stylesheet cascade');
assert.match(bootstrap,/from '\.\/app-navigation\.js'/,'bootstrap must use current navigation directly');
assert.doesNotMatch(bootstrap,/app-navigation-v14|initializeProfessionalV20|app-professional-v20/,'bootstrap must not initialize legacy navigation or professional control versions');
assert.doesNotMatch(professional,/setTimeout\(initializeProfessional/,'authenticated runtime must never auto-initialize outside session validation');
assert.match(professional,/app-catalog-current\.js/,'authenticated runtime must use the catalog entry that cannot own suppliers');
assert.doesNotMatch(professional,/initializeCatalogV32/,'legacy catalog initializer must not be reachable from the authenticated runtime');

assert.match(router,/duplicate_route_owner/,'route registry must block accidental competing owners');
assert.match(router,/route_registration_blocked/,'preferred route ownership must reject later overrides');
assert.match(navigation,/app-suppliers\.js/,'Proveedores must resolve to the current supplier workspace');
assert.match(navigation,/registerRouteRenderer\('suppliers',renderSuppliersRoute\)/,'supplier route must have one explicit current owner');
assert.match(catalogCurrent,/registerRouteRenderer\('catalog',renderCatalog\)/,'catalog current entry must own only catalog');
assert.doesNotMatch(catalogCurrent,/suppliers/,'catalog current entry must never register the supplier route');
assert.match(legacyCatalog,/renderSuppliersV32/,'legacy supplier renderer remains identifiable only inside the retired catalog implementation');
assert.doesNotMatch(professional,/renderSuppliersV32|renderSuppliersV94/,'professional runtime must not import any supplier renderer from the legacy catalog');
assert.match(suppliers,/Editar perfil/,'current supplier workspace must expose profile management');
assert.match(suppliers,/Pago pactado/,'current supplier workspace must expose agreed payment terms');
assert.match(suppliers,/\/payment-terms/,'current supplier workspace must persist payment terms');
assert.match(legacySupplier,/export \* from '\.\/app-suppliers\.js'/,'old supplier URL must be a harmless alias to current code');
assert.match(legacyRouter,/export \* from '\.\/app-router\.js'/,'old router URL must be a harmless alias to current code');
assert.match(legacyNavigation,/from '\.\/app-navigation\.js'/,'old navigation URL must be a harmless alias to current code');

assert.ok(String(packageJson.scripts.verify).startsWith('npm run build:current && npm run check:release-sync &&'),'verification must regenerate and prove release artifacts were already committed in sync');
assert.ok(String(packageJson.scripts['check:release-sync']).includes('git diff --exit-code'),'release sync gate must fail stale generated artifacts');
for(const config of [prod,dev]){
  assert.match(config,/"\/", "\/index\.html", "\/sw\.js", "\/sw-release\.js", "\/app-release\.js", "\/manifest\.webmanifest"/,'current shell must pass through the release-aware worker');
}

console.log(`current architecture gate: OK · ${release.release} · one supplier owner · one release owner · latest-only caches`);
