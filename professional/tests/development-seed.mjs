import assert from 'node:assert/strict';

const base=(process.env.NUVASTO_BASE_URL||'https://pedidos-pro-ai-dev.botreservasmultilocal.workers.dev').replace(/\/$/,'');
const email=String(process.env.NUVASTO_E2E_EMAIL||'e2e@nuvasto.dev').trim().toLowerCase();
const password=String(process.env.NUVASTO_E2E_PASSWORD||'');
const bootstrapToken=String(process.env.NUVASTO_BOOTSTRAP_TOKEN||'');
const host=new URL(base).hostname;

assert.ok(/pedidos-pro-ai-dev\./.test(host),'development seed refuses to run outside the DEV Worker');
assert.equal(email,'e2e@nuvasto.dev','development seed only accepts the reserved QA identity');
if(!password||!bootstrapToken){console.log('development seed NOT CONFIGURED');process.exit(0)}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function raw(path,{method='GET',json,headers={}}={}){
  const response=await fetch(`${base}${path}`,{method,headers:{...(json?{'Content-Type':'application/json'}:{}),...headers},body:json?JSON.stringify(json):undefined});
  const payload=await response.json().catch(()=>({}));
  return {response,payload};
}

async function bootstrapWithPropagationRetry(){
  let result;
  for(let attempt=1;attempt<=15;attempt++){
    result=await raw('/api/bootstrap',{method:'POST',headers:{'X-Bootstrap-Token':bootstrapToken},json:{organizationName:'Nuvasto QA',organizationSlug:'nuvasto-qa',locationName:'Laboratorio',displayName:'Nuvasto E2E',email,password}});
    if(result.response.status!==403)return result;
    if(attempt<15)await sleep(1000);
  }
  return result;
}

const bootstrap=await bootstrapWithPropagationRetry();
if(!bootstrap.response.ok&&bootstrap.response.status!==409)throw new Error(`bootstrap DEV ${bootstrap.response.status} · ${bootstrap.payload.error||'request failed'}`);

if(bootstrap.response.status===409){
  const ensured=await raw('/api/dev/qa/ensure',{method:'POST',headers:{'X-Bootstrap-Token':bootstrapToken},json:{email,password}});
  if(!ensured.response.ok)throw new Error(`DEV QA ensure ${ensured.response.status} · ${ensured.payload.error||'request failed'}`);
}

let token=String(bootstrap.payload.token||'');
if(!token){
  const login=await raw('/api/auth/login',{method:'POST',json:{email,password}});
  if(!login.response.ok)throw new Error(`POST /api/auth/login · ${login.response.status} · ${login.payload.error||'request failed'}`);
  token=String(login.payload.token||'');
}
assert.ok(token,'DEV seed login token');

async function call(path,{method='GET',json,headers={}}={}){
  const response=await fetch(`${base}${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(json?{'Content-Type':'application/json'}:{}),...headers},body:json?JSON.stringify(json):undefined});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.ok===false)throw new Error(`${method} ${path} · ${response.status} · ${payload.error||'request failed'}`);
  return payload;
}

const me=await call('/api/me');assert.equal(me.organization?.name,'Nuvasto QA','seed must remain in QA organization');

const locationsPayload=await call('/api/locations');
let location=(locationsPayload.locations||[]).find(item=>item.name==='Laboratorio')||(locationsPayload.locations||[])[0];
assert.ok(location?.id,'DEV seed needs a location');

let centersPayload=await call('/api/cost-centers');
let center=(centersPayload.costCenters||[]).find(item=>item.locationId===location.id&&item.name==='E2E');
if(!center){const created=await call('/api/cost-centers',{method:'POST',json:{locationId:location.id,name:'E2E',code:'E2E'}});center=created.costCenter||created}
assert.ok(center?.id,'DEV seed cost center');

let suppliersPayload=await call('/api/suppliers?active=all');
let supplier=(suppliersPayload.suppliers||[]).find(item=>item.name==='Proveedor E2E');
if(!supplier){const created=await call('/api/suppliers',{method:'POST',json:{name:'Proveedor E2E',legalName:'Proveedor E2E QA',paymentTerms:'Pruebas automáticas'}});supplier=created.supplier||created}
assert.ok(supplier?.id,'DEV seed supplier');

const productDefinitions=[
  {name:'Producto E2E',brand:'Nuvasto QA',variant:'Synthetic',contentValue:1,contentUnit:'un',baseUnit:'unidad',supplierProductName:'Producto E2E',supplierSku:'E2E-001',orderUnit:'UNIDAD',unitsPerOrderUnit:1},
  {name:'Fernet Branca E2E 1000 ml',brand:'Nuvasto QA',variant:'Botella 1000 ml',contentValue:1000,contentUnit:'ml',baseUnit:'botella',supplierProductName:'FERNET BRANCA E2E 1000CC X 6',supplierSku:'E2E-FERNET-6',orderUnit:'CAJA (6)',unitsPerOrderUnit:6},
  {name:'Mistral 35 E2E 1000 ml',brand:'Nuvasto QA',variant:'Botella 1000 ml',contentValue:1000,contentUnit:'ml',baseUnit:'botella',supplierProductName:'MISTRAL 35 E2E 1000CC X 12',supplierSku:'E2E-M35-12',orderUnit:'CAJA (12)',unitsPerOrderUnit:12},
  {name:'Vino Cabernet E2E 750 ml',brand:'Nuvasto QA',variant:'Botella 750 ml',contentValue:750,contentUnit:'ml',baseUnit:'botella',supplierProductName:'VINO CABERNET E2E 750CC X 6',supplierSku:'E2E-VINO-6',orderUnit:'CAJA (6)',unitsPerOrderUnit:6}
];

async function ensureProduct(definition){
  let productsPayload=await call('/api/products');
  let product=(productsPayload.products||[]).find(item=>item.name===definition.name);
  if(!product){
    const created=await call('/api/products',{method:'POST',json:{name:definition.name,brand:definition.brand,variant:definition.variant,contentValue:definition.contentValue,contentUnit:definition.contentUnit,baseUnit:definition.baseUnit,costCenterIds:[center.id]}});
    product=created.product||created;
  }
  productsPayload=await call('/api/products');
  product=(productsPayload.products||[]).find(item=>item.id===product.id)||product;
  if(!(product.costCenters||[]).some(item=>item.id===center.id))await call(`/api/products/${encodeURIComponent(product.id)}/cost-centers`,{method:'PUT',json:{costCenterIds:[center.id]}});
  if(!(product.suppliers||[]).some(item=>item.supplierId===supplier.id))await call(`/api/products/${encodeURIComponent(product.id)}/suppliers`,{method:'POST',json:{supplierId:supplier.id,supplierProductName:definition.supplierProductName,supplierSku:definition.supplierSku,orderUnit:definition.orderUnit,unitsPerOrderUnit:definition.unitsPerOrderUnit,minimumQuantity:1,quantityMultiple:1}});
  const refreshed=await call('/api/products');
  const seeded=(refreshed.products||[]).find(item=>item.id===product.id);
  assert.ok(seeded?.costCenters?.some(item=>item.id===center.id),`seeded product center relation: ${definition.name}`);
  assert.ok(seeded?.suppliers?.some(item=>item.supplierId===supplier.id),`seeded product supplier relation: ${definition.name}`);
  return seeded;
}

const seededProducts=[];
for(const definition of productDefinitions)seededProducts.push(await ensureProduct(definition));

console.log(`development seed: OK · ${email} · ${location.name}/${center.name} · ${supplier.name} · ${seededProducts.length} invoice products`);
