import assert from 'node:assert/strict';

const base=(process.env.NUVASTO_BASE_URL||'https://pedidos-pro-ai-dev.botreservasmultilocal.workers.dev').replace(/\/$/,'');
const email=String(process.env.NUVASTO_E2E_EMAIL||'e2e@nuvasto.dev').trim().toLowerCase();
const password=String(process.env.NUVASTO_E2E_PASSWORD||'');
const host=new URL(base).hostname;
assert.match(host,/^pedidos-pro-ai-dev\./,'AI canary refuses to run outside Nuvasto DEV');
if(!password){console.log('development AI canary NOT CONFIGURED');process.exit(0)}

let token='';
async function call(path,{method='GET',json}={}){
  const response=await fetch(`${base}${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(json?{'Content-Type':'application/json'}:{})},body:json?JSON.stringify(json):undefined});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.ok===false)throw new Error(`${method} ${path} · ${response.status} · ${payload.error||'request failed'}`);
  return payload;
}

function escapePdf(value){return String(value).replace(/([\\()])/g,'\\$1')}
function makeInvoicePdf(){
  const lines=[
    'FACTURA ELECTRONICA',
    'Proveedor: Proveedor E2E',
    'RUT: 76.123.456-7',
    'Folio: E2E-AI-0001',
    'Fecha: 19-08-2026',
    '',
    'CANT  DESCRIPCION                     VALOR TOTAL',
    '1     Producto E2E                    840',
    '',
    'NETO                                  840',
    'IVA                                   160',
    'TOTAL                                 1000'
  ];
  const stream=['BT','/F1 12 Tf','18 TL','50 790 Td',...lines.flatMap((line,index)=>index===0?[`(${escapePdf(line)}) Tj`]:['T*',`(${escapePdf(line)}) Tj`]),'ET'].join('\n');
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf='%PDF-1.4\n',offsets=[0];
  objects.forEach((object,index)=>{offsets[index+1]=Buffer.byteLength(pdf);pdf+=`${index+1} 0 obj\n${object}\nendobj\n`});
  const xref=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let index=1;index<=objects.length;index++)pdf+=`${String(offsets[index]).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf,'utf8');
}

const login=await call('/api/auth/login',{method:'POST',json:{email,password}});token=login.token;assert.ok(token,'DEV AI canary login token');
const [me,suppliersPayload,productsPayload]=await Promise.all([call('/api/me'),call('/api/suppliers?active=all'),call('/api/products')]);
assert.equal(me.organization?.name,'Nuvasto QA','AI canary must remain in QA organization');
const supplier=(suppliersPayload.suppliers||[]).find(item=>item.name==='Proveedor E2E');
const product=(productsPayload.products||[]).find(item=>item.name==='Producto E2E');
assert.ok(supplier?.id&&product?.id,'AI canary requires seeded supplier and product');

const context={
  documentNature:'invoice',
  supplierId:supplier.id,
  providerName:supplier.name,
  products:[{productId:product.id,description:product.name,catalogName:product.name,unit:'UNIDAD',orderedQty:1,unitsPerOrderUnit:1,ordered:true,supplierCatalog:true}],
  aliases:[]
};
const form=new FormData();
form.append('file',new Blob([makeInvoicePdf()],{type:'application/pdf'}),'nuvasto-e2e-ai-invoice.pdf');
form.append('context',JSON.stringify(context));
const response=await fetch(`${base}/api/invoices/analyze`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});
const payload=await response.json().catch(()=>({}));
if(!response.ok||payload.ok===false)throw new Error(`POST /api/invoices/analyze · ${response.status} · ${payload.error||'request failed'}`);
const analysis=payload.analysis||{};
assert.equal(analysis.degraded,false,`AI canary must be verified; provider error=${analysis.providerErrorCode||'none'}`);
assert.equal(analysis.resilienceV91,true,'AI canary must use v91 resilience');
assert.equal(analysis.usagePolicyV91,'verified-documents-only','AI canary must use verified-document accounting');
assert.equal(analysis.documentMathVerified,true,'AI canary document math must verify');
const invoice=analysis.invoice||{};
assert.ok(String(invoice.invoiceNumber||'').toUpperCase().replace(/[^A-Z0-9]/g,'').includes('E2EAI0001'),'AI canary must read the synthetic folio');
assert.ok(Math.abs(Number(invoice.totals?.total||0)-1000)<=2,'AI canary must read total 1000');
const lines=invoice.lines||invoice.items||[];
assert.ok(lines.some(line=>String(line.description||line.sourceDescription||'').toLowerCase().includes('producto e2e')),'AI canary must read Producto E2E');

console.log(`development AI canary: OK · ${analysis.model||'model'} · ${analysis.verificationStage||'verified'} · ${analysis.elapsedMs||0} ms`);
