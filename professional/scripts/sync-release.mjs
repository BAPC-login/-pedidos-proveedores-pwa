import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const repo=path.resolve(root,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8'));
const release=String(manifest.release||'').trim();
const generation=Number(manifest.generation||0);
const cache=String(manifest.cache||'').trim();
if(!/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(release))throw new Error(`release.json: release inválido (${release})`);
if(!Number.isInteger(generation)||generation<1)throw new Error('release.json: generation inválido');
if(!/^nuvasto-[a-z0-9-]+$/.test(cache))throw new Error(`release.json: cache inválido (${cache})`);

fs.writeFileSync(path.join(root,'web/app-release.js'),`// GENERATED from professional/release.json. Do not edit by hand.\nexport const CLIENT_RELEASE='${release}';\nexport const ARCHITECTURE_GENERATION=${generation};\nexport const CURRENT_CACHE='${cache}';\nexport const OFFLINE_WARM_KEY='nuvasto:offline-warm-current-${generation}';\n`);
fs.writeFileSync(path.join(root,'web/sw-release.js'),`// GENERATED from professional/release.json. Do not edit by hand.\nself.NUVASTO_RELEASE='${release}';\nself.NUVASTO_ARCHITECTURE_GENERATION=${generation};\nself.NUVASTO_CACHE='${cache}';\n`);
fs.writeFileSync(path.join(repo,'worker/src/release.js'),`// GENERATED from professional/release.json. Do not edit by hand.\nexport const PLATFORM_RELEASE='${release}';\nexport const ARCHITECTURE_GENERATION=${generation};\n`);
console.log(`release synced: ${release} · generation ${generation} · ${cache}`);
