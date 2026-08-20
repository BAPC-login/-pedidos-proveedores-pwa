# Nuvasto current architecture

This document records the invariants enforced by CI for the active application generation.

- `develop` is the only development integration branch; `main` is production.
- Each semantic route has exactly one owner. `suppliers` belongs only to `web/app-suppliers.js`.
- The UI loads the current entrypoints (`app-router.js`, `app-navigation.js`, `app-suppliers.js`, `app-company-profile.js`, `app-current.css`). Versioned legacy filenames may only act as compatibility aliases and must not contain competing implementations.
- `release.json` is the single source of truth for client, Worker and Service Worker release artifacts.
- The Service Worker keeps only the current Nuvasto generation cache plus explicit offline data; stale `nuvasto-*` caches are removed on activation.
- The release guard runs before application hydration and forces a controlled cutover when client/server generations differ.
- Professional runtime initialization has one authenticated bootstrap path.
- DEV uses its own Worker, D1, R2 and Gemini secret. Destructive E2E is DEV-only; production smoke is read-only.
- CI validates these invariants before any development deployment.

Do not reintroduce parallel route registries, duplicated release constants, historical cache chains, or multiple startup paths.