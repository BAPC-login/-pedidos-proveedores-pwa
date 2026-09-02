import assert from 'node:assert/strict';

const base=(process.env.NUVASTO_BASE_URL||'https://pedidos-pro-ai-dev.botreservasmultilocal.workers.dev').replace(/\/$/,'');
const MAX_CANARY_ATTEMPTS=3;
const RETRYABLE_CANARY_ERRORS=new Set([
  'invoice_pricing_unverified',
  'invoice_math_unverified',
  'gemini_http_429',
  'gemini_http_500',
  'gemini_http_502',
  'gemini_http_503',
  'gemini_http_504',
  'ai_timeout',
  'analysis_timeout'
]);
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
function makeInvoicePdf(lines){
  const stream=['BT','/F1 11 Tf','16 TL','42 790 Td',...lines.flatMap((line,index)=>index===0?[`(${escapePdf(line)}) Tj`]:['T*',`(${escapePdf(line)}) Tj`]),'ET'].join('\n');
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
assert.ok(supplier?.id,'AI canary requires seeded supplier');

const productByName=name=>{
  const product=(productsPayload.products||[]).find(item=>item.name===name);
  assert.ok(product?.id,`AI canary requires seeded product: ${name}`);
  return product;
};
const products={
  simple:productByName('Producto E2E'),
  fernet:productByName('Fernet Branca E2E 1000 ml'),
  mistral:productByName('Mistral 35 E2E 1000 ml'),
  wine:productByName('Vino Cabernet E2E 750 ml')
};

function contextProduct(product,orderedQty=1){
  const relation=(product.suppliers||[]).find(item=>item.supplierId===supplier.id)||{};
  return {
    productId:product.id,
    description:product.name,
    catalogName:product.name,
    supplierProductName:relation.supplierProductName||product.name,
    supplierSku:relation.supplierSku||'',
    unit:relation.orderUnit||'UNIDAD',
    orderedQty,
    unitsPerOrderUnit:Math.max(1,Number(relation.unitsPerOrderUnit||1)),
    ordered:true,
    supplierCatalog:true
  };
}
const catalog=[contextProduct(products.simple,2),contextProduct(products.fernet,1),contextProduct(products.mistral,1),contextProduct(products.wine,1)];
const baseContext={documentNature:'invoice',supplierId:supplier.id,providerName:supplier.name,products:catalog,aliases:[]};
const compact=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const close=(a,b,tolerance=2)=>Math.abs(Number(a||0)-Number(b||0))<=tolerance;
const lineText=line=>String(line.description||line.sourceDescription||line.descriptionOriginal||'').toLowerCase();

const cases=[
  {
    id:'simple-net-vat',folio:'E2E-AI-SIMPLE-0001',expectedTotal:2380,expectedLines:1,
    pdf:[
      'FACTURA ELECTRONICA','Proveedor: Proveedor E2E','RUT: 76.123.456-7','Folio: E2E-AI-SIMPLE-0001','Fecha: 20-08-2026','',
      'CANT  DESCRIPCION               PRECIO UNITARIO NETO   VALOR TOTAL','2     Producto E2E             1000                   2000','',
      'NETO                           2000','IVA 19%                         380','TOTAL                           2380'
    ],
    check(invoice,lines){
      assert.ok(lines.some(line=>line.productId===products.simple.id),'simple invoice must reconcile Producto E2E');
      const line=lines.find(item=>item.productId===products.simple.id)||lines[0];
      assert.ok(close(line.grossUnitPrice,1190,1),`simple invoice final unit expected 1190, got ${line.grossUnitPrice}`);
    }
  },
  {
    id:'physical-total-x-unidad',folio:'E2E-AI-PHYS-0002',expectedTotal:84631,expectedLines:1,
    pdf:[
      'FACTURA ELECTRONICA','Proveedor: Proveedor E2E','RUT: 76.123.456-7','Folio: E2E-AI-PHYS-0002','Fecha: 20-08-2026','',
      'CANT  DESCRIPCION                         NETO LINEA   TOTAL X UNIDAD',
      '1     FERNET BRANCA E2E 1000CC X 6       54652        14105,2','',
      'NETO                                      54652','IVA                                       10384','ILA                                       19595','TOTAL                                     84631'
    ],
    check(invoice,lines){
      const line=lines.find(item=>item.productId===products.fernet.id)||lines[0];
      assert.equal(line.productId,products.fernet.id,'Total x Unidad invoice must reconcile Fernet');
      assert.equal(invoice.pricingSummary?.sourceFinalPriceBasis,'physical_units','Total x Unidad must resolve as physical-unit price');
      assert.equal(line.finalQuantityBasis,'physical_units','canonical price must remain per physical unit');
      assert.ok(close(line.sourcePrintedFinalUnitPrice,14105.2,.01),`printed physical unit price expected 14105.2, got ${line.sourcePrintedFinalUnitPrice}`);
      assert.ok(close(line.grossUnitPrice,84631/6,.001),`canonical physical unit expected ${84631/6}, got ${line.grossUnitPrice}`);
      assert.ok(String(line.priceSource||'').includes('printed-final'),'physical final unit must retain printed-price provenance');
    }
  },
  {
    id:'billed-price-final',folio:'E2E-AI-BILLED-0003',expectedTotal:93600,expectedLines:1,
    pdf:[
      'FACTURA ELECTRONICA','Proveedor: Proveedor E2E','RUT: 76.123.456-7','Folio: E2E-AI-BILLED-0003','Fecha: 20-08-2026','',
      'CANT  UNIDAD  DESCRIPCION                      PRECIO UNIT. BRUTO FINAL',
      '1     CA      VINO CABERNET E2E 750CC X 6      93600','',
      'NETO                                           78655','IVA                                            14945','TOTAL                                          93600'
    ],
    check(invoice,lines){
      const line=lines.find(item=>item.productId===products.wine.id)||lines[0];
      assert.equal(line.productId,products.wine.id,'billed-unit invoice must reconcile wine product');
      assert.equal(invoice.pricingSummary?.sourceFinalPriceBasis,'invoice_quantity','Precio Unit. Bruto Final must resolve against billed quantity');
      assert.equal(line.finalQuantityBasis,'physical_units','billed source price must be converted to canonical physical-unit price');
      assert.ok(close(line.sourcePrintedFinalUnitPrice,93600,.01),`source printed final price expected 93600, got ${line.sourcePrintedFinalUnitPrice}`);
      assert.ok(close(line.grossUnitPrice,15600,.01),`canonical bottle price expected 15600, got ${line.grossUnitPrice}`);
    }
  },
  {
    id:'freight-split-additional-taxes',folio:'E2E-AI-TAX-0004',expectedTotal:139950,expectedLines:2,
    pdf:[
      'FACTURA ELECTRONICA','Proveedor: Proveedor E2E','RUT: 76.123.456-7','Folio: E2E-AI-TAX-0004','Fecha: 20-08-2026','',
      'CANT  DESCRIPCION                       PRECIO UNITARIO NETO   VALOR TOTAL NETO',
      '1     MISTRAL 35 E2E 1000CC X 12       50000                  50000',
      '2     Producto E2E                      25000                  50000','',
      'NETO                                    100000','FLETE                                     5000','IABA                                      10000','ILA                                        5000','IVA 19%                                   19950','TOTAL                                    139950'
    ],
    check(invoice,lines){
      assert.ok(lines.some(line=>line.productId===products.mistral.id),'tax matrix must reconcile Mistral product');
      assert.ok(lines.some(line=>line.productId===products.simple.id),'tax matrix must reconcile Producto E2E');
      assert.ok(close(invoice.totals?.additionalTax,15000,1),`split additional taxes expected 15000, got ${invoice.totals?.additionalTax}`);
      assert.ok(close(invoice.totals?.freight,5000,1),`freight expected 5000, got ${invoice.totals?.freight}`);
      assert.ok(['printed-line-sum-matrix','invoice-column-matrix-reconciled','printed-final-line-totals'].includes(String(invoice.pricingSummary?.method||'')),`unexpected tax matrix method ${invoice.pricingSummary?.method}`);
    }
  }
];

const results=[];
for(const testCase of cases){
  const started=Date.now();
  let analysis={};
  for(let attempt=1;attempt<=MAX_CANARY_ATTEMPTS;attempt++){
    const form=new FormData();
    form.append('file',new Blob([makeInvoicePdf(testCase.pdf)],{type:'application/pdf'}),`nuvasto-${testCase.id}.pdf`);
    form.append('context',JSON.stringify(baseContext));
    const response=await fetch(`${base}/api/invoices/analyze`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||payload.ok===false)throw new Error(`POST /api/invoices/analyze ${testCase.id} · ${response.status} · ${payload.error||'request failed'}`);
    analysis=payload.analysis||{};
    if(analysis.degraded===false)break;
    const retryable=RETRYABLE_CANARY_ERRORS.has(String(analysis.providerErrorCode||''));
    if(!retryable||attempt===MAX_CANARY_ATTEMPTS)break;
    console.warn(`development AI E2E ${testCase.id}: lectura transitoria no verificada; reintentando sin aceptar datos degradados`);
    await new Promise(resolve=>setTimeout(resolve,750));
  }
  assert.equal(analysis.degraded,false,`${testCase.id}: AI must be verified; provider error=${analysis.providerErrorCode||'none'}`);
  assert.equal(analysis.resilienceV91,true,`${testCase.id}: must use v91 resilience`);
  assert.equal(analysis.usagePolicyV91,'verified-documents-only',`${testCase.id}: must use verified-document accounting`);
  assert.equal(analysis.documentMathVerified,true,`${testCase.id}: document math must verify`);
  const invoice=analysis.invoice||{};
  assert.ok(compact(invoice.invoiceNumber).includes(compact(testCase.folio)),`${testCase.id}: folio not read correctly (${invoice.invoiceNumber||'empty'})`);
  assert.ok(close(invoice.totals?.total,testCase.expectedTotal,2),`${testCase.id}: total expected ${testCase.expectedTotal}, got ${invoice.totals?.total}`);
  const lines=invoice.lines||invoice.items||[];
  assert.equal(lines.length,testCase.expectedLines,`${testCase.id}: expected ${testCase.expectedLines} commercial lines, got ${lines.length} (${lines.map(lineText).join(' | ')})`);
  assert.equal(invoice.pricingSummary?.verified,true,`${testCase.id}: pricing summary must verify`);
  assert.ok(close(invoice.pricingSummary?.formulaExtendedTotal,testCase.expectedTotal,2),`${testCase.id}: product checksum must close to invoice total`);
  assert.ok(Math.abs(Number(invoice.pricingSummary?.checksumDelta||0))<=2,`${testCase.id}: checksum delta too high (${invoice.pricingSummary?.checksumDelta})`);
  testCase.check(invoice,lines);
  results.push({id:testCase.id,model:analysis.model||'model',stage:analysis.verificationStage||'verified',elapsedMs:analysis.elapsedMs||Date.now()-started,total:invoice.totals?.total,method:invoice.pricingSummary?.method||'unknown'});
  console.log(`development AI E2E ${testCase.id}: OK · ${analysis.model||'model'} · ${invoice.pricingSummary?.method||'unknown'} · ${analysis.elapsedMs||Date.now()-started} ms`);
}

assert.equal(results.length,cases.length,'all DEV invoice structures must execute');
console.log(`development AI canary matrix: OK · ${results.length}/${cases.length} structures · ${results.map(item=>item.id).join(', ')}`);
