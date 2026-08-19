import assert from 'node:assert/strict';

const base=(process.env.NUVASTO_BASE_URL||'https://pedidos-pro-ai.botreservasmultilocal.workers.dev').replace(/\/$/,'');
const email=String(process.env.NUVASTO_E2E_EMAIL||'').trim();
const password=String(process.env.NUVASTO_E2E_PASSWORD||'');
const host=new URL(base).hostname;
assert.ok(!/^pedidos-pro-ai-dev\./.test(host),'production read-only smoke must not target DEV');

const healthResponse=await fetch(`${base}/platform/health?readonly=${Date.now()}`,{headers:{'Cache-Control':'no-cache'}});
assert.equal(healthResponse.ok,true,'production health');
const health=await healthResponse.json();
assert.notEqual(health.environment,'development','production health must not identify as development');

if(!email||!password){
  console.log('production authenticated read-only smoke NOT CONFIGURED');
  process.exit(0);
}

let token='';
async function call(path,{method='GET',json}={}){
  const response=await fetch(`${base}${path}`,{
    method,
    headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(json?{'Content-Type':'application/json'}:{})},
    body:json?JSON.stringify(json):undefined
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.ok===false)throw new Error(`${method} ${path} · ${response.status} · ${payload.error||'request failed'}`);
  return payload;
}

const login=await call('/api/auth/login',{method:'POST',json:{email,password}});
token=login.token;
assert.ok(token,'production read-only login token');

const [me,locations,centers,products,suppliers,activeOrders,historyOrders,paymentMethods]=await Promise.all([
  call('/api/me'),
  call('/api/locations'),
  call('/api/cost-centers'),
  call('/api/products'),
  call('/api/suppliers?active=all'),
  call('/api/orders/advanced?view=active&limit=1'),
  call('/api/orders/advanced?view=history&limit=1'),
  call('/api/finance/payment-methods')
]);

assert.ok(me.user?.id&&me.organization?.id,'production identity readable');
assert.ok(Array.isArray(locations.locations),'locations readable');
assert.ok(Array.isArray(centers.costCenters),'cost centers readable');
assert.ok(Array.isArray(products.products),'products readable');
assert.ok(Array.isArray(suppliers.suppliers),'suppliers readable');
assert.ok(Array.isArray(activeOrders.orders),'active orders readable');
assert.ok(Array.isArray(historyOrders.orders),'history orders readable');
assert.ok(Array.isArray(paymentMethods.methods),'payment methods readable');

console.log(`production authenticated read-only smoke: OK · ${me.organization.name||me.organization.id}`);
