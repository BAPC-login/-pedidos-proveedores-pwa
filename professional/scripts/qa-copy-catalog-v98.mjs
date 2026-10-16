// Explicit, one-way catalog copy for QA; production is read-only and the destination is isolated DEV.
// Do not log bearer tokens, invoice originals, users, business contact PII or production sessions.
const SOURCE='https://pedidos-pro-ai.botreservasmultilocal.workers.dev';
const TARGET='https://pedidos-pro-ai-dev.botreservasmultilocal.workers.dev';
const secret=String(process.env.NUVASTO_QA_SOURCE_TOKEN||'').trim();
const devPassword=String(process.env.NUVASTO_DEV_E2E_PASSWORD||'');
if(process.env.NUVASTO_QA_COPY_CONFIRM!=='COPIAR_CATALOGO_A_DEV')throw Error('Copia QA no autorizada: falta confirmación explícita');
if(!secret||devPassword.length<10)throw Error('Configura NUVASTO_QA_SOURCE_TOKEN de solo lectura y NUVASTO_DEV_E2E_PASSWORD');
const fail=(message)=>{throw Error(message)};
async function request(base,path,{token='',method='GET',data}={}){
  if(method!=='GET'&&base===SOURCE)fail('Protección QA: producción solo permite GET');
  const url=new URL(path,base);
  if(url.origin!==new URL(base).origin)fail('URL fuera de dominio autorizado');
  const response=await fetch(url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,redirect:'error'});
  if(!response.ok)fail('Error '+response.status+' en '+(base===SOURCE?'lectura producción':'operación DEV')+' '+url.pathname);
  const body=await response.json().catch(()=>fail('Respuesta JSON inválida de '+url.pathname));
  if(body.ok===false)fail(body.error||'Error de API');
  return body;
}
const sourceHealth=await request(SOURCE,'/health'),targetHealth=await request(TARGET,'/health');
if(sourceHealth.environment!=='production'||targetHealth.environment!=='development')fail('Entornos mal identificados; abortado');
if(new URL(SOURCE).hostname===new URL(TARGET).hostname)fail('Fuente y destino no pueden coincidir');
const login=await request(TARGET,'/api/auth/login',{method:'POST',data:{email:'e2e@nuvasto.dev',password:devPassword}});
const devToken=String(login.token||'');
if(!devToken)fail('DEV no devolvió sesión QA');
const me=await request(TARGET,'/api/me',{token:devToken});
if(me.organization?.name!=='Nuvasto QA'||!['owner','admin'].includes(String(me.user?.role||'')))fail('El destino debe ser la organización Nuvasto QA con rol administrador');

const [locData,centerData,supData,prodData]=await Promise.all([
  request(SOURCE,'/api/locations',{token:secret}),
  request(SOURCE,'/api/cost-centers',{token:secret}),
  request(SOURCE,'/api/suppliers?active=all',{token:secret}),
  request(SOURCE,'/api/products',{token:secret})
]);
const locations=(locData.locations||[]).filter(x=>x.active!==false),centers=(centerData.costCenters||[]).filter(x=>x.active!==false),
  suppliers=(supData.suppliers||[]).filter(x=>x.active!==false),products=(prodData.products||[]).filter(x=>x.active!==false);
if(!locations.length||!centers.length||!suppliers.length||!products.length)fail('Catálogo origen vacío o acceso parcial. No se escribirá en DEV');
if(products.length>=1000||suppliers.length>=500)fail('API de origen limitada por paginación. No se realizará copia incompleta');
const centerById=new Map(centers.map(x=>[String(x.id),x])),supplierById=new Map(suppliers.map(x=>[String(x.id),x]));
const locationById=new Map(locations.map(x=>[String(x.id),x]));
const rows=[],unassigned=[],unrelated=[];
for(const product of products){
  const linked=(product.suppliers||[]).filter(rel=>supplierById.has(String(rel.supplierId)));
  const allocated=(product.costCenters||[]).map(item=>centerById.get(String(item.id))).filter(Boolean);
  if(!allocated.length){unassigned.push(String(product.name||'Producto'));continue}
  if(!linked.length){unrelated.push(String(product.name||'Producto'));continue}
  for(const rel of linked)for(const center of allocated){
    const supplier=supplierById.get(String(rel.supplierId)),location=locationById.get(String(center.locationId));
    if(!location)continue;
    rows.push({product:product.name,category:product.categoryName||'Otros',brand:product.brand||'',
      variant:product.variant||'',contentValue:Number(product.contentValue||0),contentUnit:product.contentUnit||'ml',
      baseUnit:product.baseUnit||'unidad',barcode:product.barcode||'',supplier:supplier.name,
      supplierSku:rel.supplierSku||'',supplierProductName:rel.supplierProductName||product.name,
      orderUnit:rel.orderUnit||'UNIDAD',unitsPerOrderUnit:Number(rel.unitsPerOrderUnit||1),
      minimumQuantity:Number(rel.minimumQuantity||0),quantityMultiple:Number(rel.quantityMultiple||1),
      lastGrossUnitPrice:Number(rel.lastGrossUnitPrice||0),location:location.name,costCenter:center.name,
      leadDays:Number(supplier.leadDays||0),cutoffTime:supplier.cutoffTime||'',minimumOrder:Number(supplier.minimumOrder||0),
      paymentTerms:supplier.paymentTerms||''});
  }
}
if(!rows.length||unassigned.length||unrelated.length)fail('Copia incompleta detectada: sin centro='+unassigned.length+', sin proveedor='+unrelated.length+'. Abortado para revisión');
if(rows.length>3000)fail('El importador admite 3000 filas; se requiere partición revisada antes de copiar');
const summary={sourceLocations:locations.length,sourceCenters:centers.length,sourceSuppliers:suppliers.length,sourceProducts:products.length,catalogRows:rows.length};
console.log('Copia QA preparada (sin identificadores personales): '+JSON.stringify(summary));
if(process.env.NUVASTO_QA_DRY_RUN!=='false'){console.log('DRY RUN: no se escribió ningún registro. Ejecuta con NUVASTO_QA_DRY_RUN=false tras verificar cifras.');process.exit(0)}

// Copy supporting locations and centers, preserving only business labels/codes.
const [targetLoc,targetCenters]=await Promise.all([request(TARGET,'/api/locations',{token:devToken}),request(TARGET,'/api/cost-centers',{token:devToken})]);
const currentLocations=[...(targetLoc.locations||[])],currentCenters=[...(targetCenters.costCenters||[])];
for(const location of locations){
  let matched=currentLocations.find(x=>String(x.code||'').toLowerCase()===String(location.code||'').toLowerCase());
  if(!matched){const payload=await request(TARGET,'/api/locations',{token:devToken,method:'POST',data:{name:location.name,code:location.code,timezone:location.timezone||'America/Santiago'}});
    matched=payload.location||payload;currentLocations.push(matched);}
  for(const center of centers.filter(item=>item.locationId===location.id)){
    if(currentCenters.some(item=>String(item.locationId)===String(matched.id)&&String(item.code||'').toLowerCase()===String(center.code||'').toLowerCase()))continue;
    const payload=await request(TARGET,'/api/cost-centers',{token:devToken,method:'POST',data:{locationId:matched.id,name:center.name,code:center.code}});
    currentCenters.push(payload.costCenter||payload);
  }
}
// Merge, never replace: QA seed fixtures and other unrelated DEV data remain intact.
const outcome=await request(TARGET,'/api/catalog/import',{token:devToken,method:'POST',data:{mode:'merge',rows}});
const actual=outcome.result||outcome;
if(Number(actual.rows||0)!==rows.length)fail('La importación DEV no confirma todas las filas');
console.log('Copia de catálogo COMPLETA en DEV: '+JSON.stringify({...summary,imported:actual.rows,products:actual.productCount,suppliers:actual.supplierCount}));
