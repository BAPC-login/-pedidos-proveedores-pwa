import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const index=read('web/index.html');
const safe=read('web/safe-area-v95.css');
const native=read('web/native-performance.css');
const mobile=read('web/app-mobile-runtime.js');
const sw=read('web/sw.js');

assert.match(index,/viewport-fit=cover/,'PWA viewport must expose device safe-area insets');
assert.match(native,/@import url\('\.\/safe-area-v95\.css'\)/,'safe-area contract must load before native runtime chrome');
assert.match(safe,/--nuvasto-safe-top:env\(safe-area-inset-top,0px\)/,'global safe top variable is required');
assert.match(safe,/--nuvasto-safe-bottom:env\(safe-area-inset-bottom,0px\)/,'global safe bottom variable is required');
assert.match(safe,/\.auth-screen:not\(#startupScreen\)/,'login/auth screens must respect the status-bar safe area');
assert.match(safe,/#startupScreen/,'launch screen must remain inside safe bounds');
assert.match(safe,/\.topbar\{[\s\S]*?padding-top:calc\(var\(--nuvasto-safe-top\) \+ 10px\)!important/,'mobile top bar content must start below the full status-bar inset plus breathing room');
assert.match(safe,/\.content\{[\s\S]*?padding-bottom:calc\(104px \+ var\(--nuvasto-safe-bottom\)\)!important/,'page content must clear the home indicator and floating navigation');
assert.match(safe,/\.bottom-nav\{[\s\S]*?bottom:max\(8px,var\(--nuvasto-safe-bottom\)\)!important/,'bottom navigation must clear the home indicator');
assert.match(safe,/\.modal\{[\s\S]*?padding-top:calc\(var\(--nuvasto-safe-top\) \+ 8px\)!important/,'all modal sheets must clear the status bar');
assert.match(safe,/\.command-menu\{[\s\S]*?var\(--nuvasto-safe-top\)/,'command/search overlay must respect the top safe area');
assert.match(safe,/\.toast-region\{[\s\S]*?var\(--nuvasto-safe-bottom\)/,'toast notifications must respect device chrome');

assert.match(mobile,/RELEASE='r95-canonical-safe-area'/,'mobile runtime must identify the v95 safe-area cutover');
assert.match(mobile,/padding-top:calc\(var\(--nuvasto-safe-top\) \+ 10px\)!important/,'runtime topbar must add spacing after the safe inset instead of replacing it');
assert.doesNotMatch(mobile,/padding-top:max\(10px,var\(--nuvasto-safe-top\)\)/,'old max-only topbar rule could place controls directly on the status-area boundary');
assert.match(mobile,/\.auth-screen:not\(#startupScreen\)/,'runtime must also protect authentication after hydration');
assert.match(mobile,/\.modal-frame\{[^}]*100dvh - var\(--nuvasto-safe-top\) - var\(--nuvasto-safe-bottom\)/s,'runtime modal height must subtract both unsafe areas');
assert.match(mobile,/\.toast-region\{[^}]*safe-bottom/s,'runtime toast placement must stay above bottom device chrome');

assert.match(sw,/CACHE_VERSION='nuvasto-v96-release-coherence'/,'installed PWAs must rotate to the v96 coherent shell while retaining the v95 safe-area contract');
assert.match(sw,/PREVIOUS_CACHE_VERSION='nuvasto-v95-safe-area-contract'/,'v96 must preserve the safe-area shell as its direct predecessor');
assert.match(sw,/LEGACY_CACHE_VERSION_V94='nuvasto-v94-menu-information-architecture'/,'v96 must preserve the menu architecture cache lineage');
assert.match(sw,/LEGACY_CACHE_VERSION_V93='nuvasto-v93-branding-launch'/,'v96 must preserve v93 cache lineage');
assert.match(sw,/'\.\/safe-area-v95\.css'/,'safe-area stylesheet must be precached for offline startup');

console.log('v95-v96 safe-area contract: OK · auth, app chrome, content, sheets, search, toasts and bottom navigation stay outside device bars');
