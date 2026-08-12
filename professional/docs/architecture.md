# Nuvasto architecture

## Runtime ownership

The production PWA has one shared API/cache layer (`web/app-core.js`), one canonical professional bootstrap (`web/app-professional.js`), one application runtime (`web/app-runtime.js`) and one mobile runtime (`web/app-mobile-runtime.js`). Historical filenames that remain are compatibility facades or feature modules with real domain ownership; they must not install competing global fetch wrappers or body-wide patch observers.

## Worker routing

`worker/src/combined.js` sends platform traffic to `professional/worker/src/router.js`. The router is organized by domains under `professional/worker/src/routes/`: catalog, procurement and enterprise. Versioned worker implementations remain temporarily behind that boundary to preserve proven business logic, but version-selection no longer lives in the production gateway.

## CI rules

`npm run verify` validates JavaScript syntax plus core, canonical-runtime and architecture gates. Production additionally runs the dedicated procurement synthetic journey after Cloudflare deployment. Historical string-marker workflow tests are intentionally excluded from production gates.

## Refactor rule

A feature must have one owner. New work should modify the canonical owner instead of adding a new versioned patch layer. Compatibility facades may re-export a canonical module but may not contain runtime behavior.
