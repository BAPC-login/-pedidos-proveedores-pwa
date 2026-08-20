import assert from 'node:assert/strict';

const base=(process.env.NUVASTO_BASE_URL||'https://pedidos-pro-ai-dev.botreservasmultilocal.workers.dev').replace(/\/$/,'');
const email=String(process.env.NUVASTO_E2E_EMAIL||'e2e@nuvasto.dev').trim().toLowerCase();
const password=String(process.env.NUVASTO_E2E_PASSWORD||'');
const host=new URL(base).hostname;
assert.match(host,/^pedidos-pro-ai-dev\./,'supplier profile E2E refuses to run outside Nuvasto DEV');
assert.ok(!/pedidos-pro-ai\.botreservasmultilocal\.workers\.dev$/.test(host),'supplier profile E2E must never target production');
assert.ok(password,'supplier profile E2E requires the DEV QA password');

let token='';
async function json(path,{method='GET',body}={}){
  const response=await fetch(`${base}${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.ok===false)throw new Error(`${method} ${path} · ${response.status} · ${payload.error||'request failed'}`);
  return payload;
}

const login=await json('/api/auth/login',{method:'POST',body:{email,password}});token=login.token;assert.ok(token,'DEV supplier profile login token');
const me=await json('/api/me');assert.equal(me.organization?.name,'Nuvasto QA','supplier profile E2E must stay inside Nuvasto QA');
const beforePayload=await json('/api/suppliers?active=all'),supplier=(beforePayload.suppliers||[]).find(item=>item.name==='Proveedor E2E');
assert.ok(supplier?.id,'DEV supplier profile E2E needs Proveedor E2E');
const termsBefore=(await json(`/api/suppliers/${encodeURIComponent(supplier.id)}/payment-terms`)).paymentTerms;
const restore={name:supplier.name,legalName:supplier.legalName||'',rut:supplier.rut||'',email:supplier.email||'',phone:supplier.phone||'',contactName:supplier.contactName||'',leadDays:Number(supplier.leadDays||0),cutoffTime:supplier.cutoffTime||'',minimumOrder:Number(supplier.minimumOrder||0),paymentTerms:supplier.paymentTerms||''};

try{
  const update={...restore,legalName:'Proveedor E2E SpA',contactName:'Contacto QA',email:'compras@proveedor-e2e.dev',phone:'+56900000000',leadDays:2,cutoffTime:'16:00',minimumOrder:25000};
  const patched=await json(`/api/suppliers/${encodeURIComponent(supplier.id)}`,{method:'PATCH',body:update});
  assert.equal(patched.supplier?.legalName,'Proveedor E2E SpA','general supplier profile must persist');
  assert.equal(Number(patched.supplier?.leadDays),2,'supplier lead time must persist');
  assert.equal(Number(patched.supplier?.minimumOrder),25000,'supplier minimum order must persist');

  const termsPatched=await json(`/api/suppliers/${encodeURIComponent(supplier.id)}/payment-terms`,{method:'PATCH',body:{type:'days',days:30,anchor:'reception'}});
  assert.equal(termsPatched.paymentTerms?.type,'days','supplier payment term type must persist');
  assert.equal(Number(termsPatched.paymentTerms?.days),30,'supplier credit days must persist');
  assert.equal(termsPatched.paymentTerms?.anchor,'reception','supplier payment anchor must persist');

  const [afterPayload,termsAfter]=await Promise.all([json('/api/suppliers?active=all'),json(`/api/suppliers/${encodeURIComponent(supplier.id)}/payment-terms`)]),after=(afterPayload.suppliers||[]).find(item=>item.id===supplier.id);
  assert.equal(after?.contactName,'Contacto QA','supplier list must reflect profile edits');
  assert.match(String(after?.paymentTerms||''),/30/,'supplier list must expose normalized agreed payment label');
  assert.equal(termsAfter.paymentTerms?.label,'Crédito a 30 días','supplier payment label must be normalized');
  console.log(`development supplier profile E2E: OK · profile + supply terms + 30-day payment agreement · ${supplier.name}`);
} finally {
  await json(`/api/suppliers/${encodeURIComponent(supplier.id)}`,{method:'PATCH',body:restore}).catch(()=>{});
  if(termsBefore)await json(`/api/suppliers/${encodeURIComponent(supplier.id)}/payment-terms`,{method:'PATCH',body:{type:termsBefore.type,days:Number(termsBefore.days||0),day:Number(termsBefore.day||1),anchor:termsBefore.anchor||'reception'}}).catch(()=>{});
}
