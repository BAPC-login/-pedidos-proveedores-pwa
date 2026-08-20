import assert from 'node:assert/strict';

const base=(process.env.NUVASTO_BASE_URL||'https://pedidos-pro-ai-dev.botreservasmultilocal.workers.dev').replace(/\/$/,'');
const url=new URL(base);
assert.match(url.hostname,/^pedidos-pro-ai-dev\./,'destructive E2E refuses to run outside Nuvasto DEV');
assert.ok(!/pedidos-pro-ai\.botreservasmultilocal\.workers\.dev$/.test(url.hostname),'destructive E2E must never target production');

process.env.NUVASTO_BASE_URL=base;
await import('./development-e2e-current.mjs');
