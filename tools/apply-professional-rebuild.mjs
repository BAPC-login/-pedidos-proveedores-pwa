import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
const dir='tools/professional-rebuild-chunks';
const encoded=fs.readdirSync(dir).sort().map(name=>fs.readFileSync(path.join(dir,name),'utf8').trim()).join('');
const payload=JSON.parse(gunzipSync(Buffer.from(encoded,'base64')).toString('utf8'));
for(const [file,content] of Object.entries(payload)){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content,'utf8');console.log('wrote',file,Buffer.byteLength(content));}
