import assert from 'node:assert/strict';

const base=(process.env.NUVASTO_BASE_URL||'https://pedidos-pro-ai-dev.botreservasmultilocal.workers.dev').replace(/\/$/,'');
const email=String(process.env.NUVASTO_E2E_EMAIL||'e2e@nuvasto.dev').trim().toLowerCase();
const password=String(process.env.NUVASTO_E2E_PASSWORD||'');
const host=new URL(base).hostname;
assert.match(host,/^pedidos-pro-ai-dev\./,'branding E2E refuses to run outside Nuvasto DEV');
assert.ok(!/pedidos-pro-ai\.botreservasmultilocal\.workers\.dev$/.test(host),'branding E2E must never target production');
assert.ok(password,'branding E2E requires the DEV QA password');

let token='';
async function json(path,{method='GET',body,headers={}}={}){
  const response=await fetch(`${base}${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.ok===false)throw new Error(`${method} ${path} · ${response.status} · ${payload.error||'request failed'}`);
  return payload;
}
async function file(path){
  const response=await fetch(`${base}${path}`,{headers:{Authorization:`Bearer ${token}`}});
  assert.equal(response.status,200,`protected asset ${path} must be readable`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.length>0,`protected asset ${path} must contain bytes`);
  return bytes;
}
async function upload(purpose,name){
  // Deterministic valid 1×1 PNG. The upload itself is disposable; existing configured logos are preserved.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
  const form=new FormData();
  form.append('file',new Blob([png],{type:'image/png'}),name);
  const response=await fetch(`${base}/api/files?purpose=${encodeURIComponent(purpose)}`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.ok===false)throw new Error(`upload ${purpose} · ${response.status} · ${payload.error||'request failed'}`);
  assert.ok(payload.file?.key,`${purpose} upload must return a file key`);
  await file(`/api/files/${encodeURIComponent(payload.file.key)}`);
  return payload.file;
}

const login=await json('/api/auth/login',{method:'POST',body:{email,password}});token=login.token;assert.ok(token,'DEV branding login token');
const me=await json('/api/me');assert.equal(me.organization?.name,'Nuvasto QA','branding E2E must stay inside Nuvasto QA');

const [settingsBefore,suppliersPayload,assetsBefore]=await Promise.all([json('/api/settings'),json('/api/suppliers?active=all'),json('/api/supplier-assets')]);
const supplier=(suppliersPayload.suppliers||[]).find(item=>item.name==='Proveedor E2E');
assert.ok(supplier?.id,'DEV branding E2E needs Proveedor E2E');
const supplierBefore=(assetsBefore.assets||[]).find(item=>item.supplierId===supplier.id)||{};

const uploadedCompany=await upload('brand-logo','nuvasto-qa-branding-e2e.png');
const companyKey=settingsBefore.organization?.branding?.logoKey||uploadedCompany.key;
const branding=settingsBefore.organization?.branding||{};
await json('/api/settings',{method:'PATCH',body:{branding:{
  logoKey:companyKey,
  logoName:branding.logoName||uploadedCompany.name||'nuvasto-qa-branding-e2e.png',
  logoWidth:Number(branding.logoWidth||1),logoHeight:Number(branding.logoHeight||1),
  logoSize:Number(branding.logoSize||42),logoPosition:branding.logoPosition||'left',logoAlignX:branding.logoAlignX||'center',logoAlignY:branding.logoAlignY||'center'
}}});
const settingsAfter=await json('/api/settings');
assert.equal(settingsAfter.organization?.branding?.logoKey,companyKey,'company logo key must persist through settings');
await file(`/api/files/${encodeURIComponent(companyKey)}`);

const uploadedSupplier=await upload('supplier-logo','proveedor-e2e-branding-e2e.png');
const supplierKey=supplierBefore.logoKey||uploadedSupplier.key;
await json(`/api/suppliers/${encodeURIComponent(supplier.id)}/identity`,{method:'PATCH',body:{
  logoKey:supplierKey,
  logoName:supplierBefore.logoName||uploadedSupplier.name||'proveedor-e2e-branding-e2e.png',
  logoWidth:Number(supplierBefore.logoWidth||1),logoHeight:Number(supplierBefore.logoHeight||1),logoSize:Number(supplierBefore.logoSize||44)
}});
const assetsAfter=await json('/api/supplier-assets');
const supplierAfter=(assetsAfter.assets||[]).find(item=>item.supplierId===supplier.id);
assert.equal(supplierAfter?.logoKey,supplierKey,'supplier logo key must persist through supplier identity');
await file(`/api/files/${encodeURIComponent(supplierKey)}`);

console.log(`development branding E2E: OK · company logo + supplier logo stored, configured and readable · ${supplier.name}`);
