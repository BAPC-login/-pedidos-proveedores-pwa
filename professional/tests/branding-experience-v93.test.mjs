import assert from 'node:assert/strict';
import fs from 'node:fs';

const navigation=fs.readFileSync(new URL('../web/app-navigation-v14.js',import.meta.url),'utf8');
const suppliers=fs.readFileSync(new URL('../web/app-suppliers-v94.js',import.meta.url),'utf8');
const settings=fs.readFileSync(new URL('../web/app-experience-settings.js',import.meta.url),'utf8');
const companyProfile=fs.readFileSync(new URL('../web/app-company-profile-v94.js',import.meta.url),'utf8');
const branding=fs.readFileSync(new URL('../web/app-branding.js',import.meta.url),'utf8');
const companyLogo=fs.readFileSync(new URL('../web/app-company-logo.js',import.meta.url),'utf8');
const core=fs.readFileSync(new URL('../web/app-core.js',import.meta.url),'utf8');
const screenState=fs.readFileSync(new URL('../web/app-screen-state.js',import.meta.url),'utf8');
const brandCss=fs.readFileSync(new URL('../web/brand-v21.css',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../web/sw.js',import.meta.url),'utf8');

assert.match(navigation,/renderSuppliersWorkspaceV94/,'active suppliers route must use the canonical supplier workspace');
assert.match(suppliers,/api\('\/api\/supplier-assets/,'canonical supplier workspace must load supplier identity assets');
assert.match(suppliers,/hydrateProtectedImages/,'supplier logos must hydrate through authenticated file access');
assert.match(suppliers,/\/identity/,'supplier profile must expose logo management inside Proveedores');
assert.match(settings,/Perfil de empresa/,'settings must expose the unified company profile');
assert.match(settings,/settings-company-logo/,'settings must visibly preview the configured company logo');
assert.match(settings,/Perfil de local/,'settings must expose the unified local profile');
assert.doesNotMatch(settings,/Proveedores e identidad/,'supplier identity must no longer be duplicated in settings');
assert.match(companyProfile,/protectedAssetUrl/,'company profile must load the logo through authenticated asset handling');
assert.match(companyProfile,/Paleta y documentos/,'company profile must combine logo, palette and document identity');
assert.match(branding,/state\.organizationLogoUrl/,'company branding refresh must publish the workspace logo');
assert.match(companyLogo,/refreshBranding\(true\)/,'legacy company logo save path must still refresh visible branding immediately');
assert.match(core,/organizationLogoUrl/,'workspace state must retain the company logo');
assert.match(core,/renderWorkspaceIdentity/,'showApp must render tenant identity rather than initials only');
assert.match(core,/launch-exit/,'startup handoff must use a fade transition instead of instant hiding');
assert.match(screenState,/launchOverlay/,'screen arbitration must preserve the launch overlay during fade-out');
assert.doesNotMatch(brandCss,/scale\(24\)/,'launch animation must never use the previous violent 24x zoom');
assert.match(brandCss,/nuvastoLaunchFade/,'launch animation must end with a controlled fade');
assert.match(brandCss,/1\.28s cubic-bezier\(\.16,1,\.3,1\)/,'launch motion must use the smoother cinematic timing');
assert.match(sw,/CACHE_VERSION='nuvasto-v96-release-coherence'/,'service worker must carry the v94 menu/branding assets through the v96 coherent shell');
assert.match(sw,/PREVIOUS_CACHE_VERSION='nuvasto-v95-safe-area-contract'/,'v96 must preserve v95 as the direct predecessor');
assert.match(sw,/LEGACY_CACHE_VERSION_V94='nuvasto-v94-menu-information-architecture'/,'v96 must preserve v94 menu and supplier ownership lineage');

console.log('v93-v96 branding experience: OK · company/local profiles unified · supplier identity stays in Proveedores · launch handoff smooth');
