import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const settings=read('web/app-experience-settings.js');
const settingsPanels=read('web/app-settings-panels-v13.js');
const navigation=read('web/app-navigation-v14.js');
const suppliers=read('web/app-suppliers-v94.js');
const locationIdentity=read('web/app-location-identity.js');
const settingsApi=read('worker/src/api/settings.js');
const sessionPolicy=read('worker/src/session-policy-v87.js');
const router=read('worker/src/router.js');
const master=read('web/app-master-order.js');
const masterCss=read('web/master-order.css');
const procurement=read('web/app-procurement-settings.js');
const bootstrap=read('web/app-bootstrap.js');
const sw=read('web/sw.js');

assert.match(settings,/<h3>Empresa<\/h3>/,'Configuración must expose Empresa');
assert.match(settings,/<h3>Operación<\/h3>/,'Configuración must expose Operación');
assert.match(settings,/<h3>Seguridad<\/h3>/,'Configuración must expose Seguridad');
assert.doesNotMatch(settings,/Catálogo y recorrido|data-procurement-settings/,'procurement traversal must not live inside Configuración');
assert.doesNotMatch(settings,/data-action=\"new-supplier\"/,'supplier creation must live only inside Proveedores');
assert.doesNotMatch(settings,/data-operations-tab=\"suppliers\"/,'Configuración must not duplicate supplier management');
assert.match(settings,/data-company-profile-v94/,'Configuración must expose the unified company profile');
assert.match(settings,/data-location-identity/,'Configuración must expose local logo identity');
assert.match(settingsPanels,/pdf:openCompanyLogoUploader/,'legacy corporate logo action must remain compatible even though it is no longer a top-level settings card');
assert.match(navigation,/registerRouteRenderer\('suppliers'/,'Proveedores must own its canonical route');
assert.match(suppliers,/id=\"newSupplierV94\"/,'canonical supplier workspace must own supplier creation');
assert.match(suppliers,/supplierProfileLogoFile/,'canonical supplier workspace must own supplier logo editing');
assert.match(suppliers,/paymentTermType/,'canonical supplier workspace must own agreed payment terms');

assert.match(bootstrap,/initializeLocationIdentity/,'location identity must initialize from canonical bootstrap');
assert.match(locationIdentity,/purpose:'location-logo'/,'local logos must use a dedicated storage purpose');
assert.match(locationIdentity,/location:\{id:selectedId,details:/,'local logos must persist through settings location details');
assert.match(settingsApi,/logoKey: text\(raw\.logoKey \?\? previous\.logoKey/,'location settings must preserve logo key');
assert.match(settingsApi,/verifyLocationLogo/,'local logo ownership/type must be validated server-side');
assert.match(settingsApi,/'location-logo'/,'local logo validation must require the proper file purpose');

assert.match(sessionPolicy,/SESSION_IDLE_TIMEOUT_DAYS=30/,'inactive sessions must expire after a long inactivity window');
assert.match(sessionPolicy,/session_expired/,'expired tokens must return a dedicated session expiry code');
assert.match(sessionPolicy,/UPDATE sessions SET revoked_at=/,'stale sessions must be revoked instead of remaining active forever');
assert.match(sessionPolicy,/slice\(0,50\)/,'active session list must stay bounded');
assert.match(router,/enforceSessionIdlePolicy/,'session idle policy must run at the canonical gateway');
assert.match(router,/filterActiveSessionsResponse/,'session list must hide revoked/stale entries');

assert.match(master,/toast\('Archivo guardado en el sistema'\);closeModal\('saved'\);await openRoute\('orders',''\);return response/,'Guardar archivo must route directly to Pedidos');
assert.doesNotMatch(master,/setTimeout\(\(\)=>showSavedFile\(batch\)/,'Guardar archivo must not reopen the legacy saved-file checkout');
assert.match(masterCss,/\.order-file-supplier select\[data-order-relation\]\{font-size:10px!important/,'multi-supplier dropdown text must match the static supplier size');

assert.match(procurement,/data-unit-position/,'format ordering must use direct position controls');
assert.match(procurement,/moveTo\(array,from,to\)/,'position changes must reorder canonically');
assert.doesNotMatch(procurement,/data-unit-up|data-unit-down/,'legacy tiny up/down format buttons must stay retired');
assert.match(procurement,/Formatos de compra/,'format editor must use the modern canonical panel');
assert.match(procurement,/Unidades por formato/,'format semantics must remain explicit');

assert.match(sw,/CACHE_VERSION='nuvasto-v\d+-/,'installed PWA cache must remain explicitly versioned');
assert.match(sw,/app-location-identity\.js/,'local identity must be available to installed PWAs');
console.log('v87-v94 navigation, sessions and master-order contracts: OK');
