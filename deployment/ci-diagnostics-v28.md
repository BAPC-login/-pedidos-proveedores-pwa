# Nuvasto v28 CI diagnostics

- Production checks derive the expected version from `professional/package.json`.
- Release checks derive the expected release from `worker/src/combined.js`.
- Root Wrangler now binds `FILES` to `nuvasto-files` and requires R2.
- Live health verification no longer commits generated diagnostics back to `main`.
- Browser E2E now validates Nuvasto instead of the retired Pedidos Pro v15 shell.
