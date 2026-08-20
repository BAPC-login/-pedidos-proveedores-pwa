import assert from 'node:assert/strict';
import fs from 'node:fs';
import {reconcileInvoicePricing} from '../worker/src/invoice-pricing-matrix.js';

const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const mobile=read('../web/app-mobile-runtime.js');
const auth=read('../web/app-auth-experience.js');
const index=read('../web/index.html');
const currentCss=read('../web/app-current.css');
const copy=read('../web/app-copy-policy.js');
const sw=read('../web/sw.js');

assert.match(mobile,/removeAttribute\('capture'\)/,'product photo picker must not force camera capture');
assert.match(mobile,/select\[data-order-relation\][^`]+font-size:10px!important/s,'supplier dropdown must match static supplier size');
assert.match(mobile,/safe-area-inset-top/,'mobile modal must honor the native top safe area');
assert.doesNotMatch(auth,/location\.reload\(\)/,'biometric login must complete in-place without a full reload');
assert.match(auth,/completeBiometricLogin/,'biometric login must reuse the authenticated app runtime');
assert.match(auth,/biometricIcon\(\)/,'biometric login must be an icon control');
assert.match(index,/localStorage\.getItem\('pp:theme'\)/,'theme must be resolved before first paint');
assert.match(index,/id="nuvastoCurrentStyles"[^>]+app-current\.css/,'the shell must load one current stylesheet before authentication');
assert.doesNotMatch(index,/href="\.\/(?:styles|pro-ui|experience|design-system-|brand-v|native-performance)/,'the shell must not mount parallel historical style entries');
assert.match(currentCss,/design-system-native-v80\.css/,'current cascade must retain validated native design rules');
assert.match(currentCss,/design-system-native-v82\.css/,'current cascade must retain validated dark contrast rules');
assert.match(copy,/netLineTotal/,'copy policy must recognize implementation tokens');
assert.match(copy,/Observaciones de lectura/i,'technical reading notes must be removed from user-facing checkout');
assert.match(sw,/importScripts\('\.\/sw-release\.js'\)/,'mobile shell must consume the current generated release');
assert.doesNotMatch(sw,/LEGACY_CACHE_VERSION|PREVIOUS_CACHE_VERSION/,'mobile shell must not retain historical cache generations');

const grossLines=[
  {invoiceQuantity:1,totalUnits:1,netLineTotal:100},
  {invoiceQuantity:1,totalUnits:1,netLineTotal:200}
];
const gross=reconcileInvoicePricing(grossLines,{total:300,vat:48},[]);
assert.equal(gross.verified,true);
assert.equal(gross.method,'printed-line-sum-matrix');
assert.equal(gross.documentTotalComputed,300);
assert.equal(grossLines[0].grossLineTotal,100);
assert.equal(grossLines[1].grossLineTotal,200);

const warnings=[];
const netLines=[
  {invoiceQuantity:1,totalUnits:1,netLineTotal:100},
  {invoiceQuantity:1,totalUnits:1,netLineTotal:200}
];
const net=reconcileInvoicePricing(netLines,{net:300,vat:57,total:357},warnings);
assert.equal(net.verified,true);
assert.equal(net.method,'printed-line-sum-matrix');
assert.equal(net.documentTotalComputed,357);
assert.equal(netLines[0].grossLineTotal,119);
assert.equal(netLines[1].grossLineTotal,238);
assert.equal(warnings.some(value=>/netLineTotal|freightLine|additionalTaxLine|invoice-column|proportional/i.test(value)),false);

console.log('mobile/auth/invoice contracts: OK');
