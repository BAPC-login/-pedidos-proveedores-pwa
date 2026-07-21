const DEFAULT_MODEL = 'gemini-3.5-flash';
const FALLBACK_MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash'];
const MAX_INVOICE_BYTES = 12 * 1024 * 1024;
const MAX_ORDER_BYTES = 3 * 1024 * 1024;
const MAX_COMBINED_BYTES = 16 * 1024 * 1024;
const GEMINI_TIMEOUT_MS = 72000;

const STOP_WORDS = new Set([
  'DE','DEL','LA','LAS','EL','LOS','Y','CON','SIN','UN','UNA','UND','UNID','UNIDAD','UNIDADES',
  'CAJA','CAJAS','BOT','BOTELLA','BOTELLAS','BEB','BEBIDA','BEBIDAS','PROD','PRODUCTO','PACK',
  'FORMATO','VID','VIDRIO','VNR','PET','DISPLAY','RETORNABLE','RET','TR','TAPA','ROSCA',
  'LICOR','PISCO','WHIS','WHISKY','GIN','TEQUILA','VODKA','RON','CERVEZA','BEBESTIBLE'
]);

const CHARGE_WORDS = [
  'FLETE','FLETES','DESPACHO','TRANSPORTE','MERCADERIAS','RECARGO','SUBTOTAL','TOTAL','NETO',
  'IVA','I V A','IABA','I B A','IMPUESTO','ADICIONAL','DESCUENTO','DEPOSITO','GARANTIA','CUOTA'
];

const corsHeaders = origin => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Pedidos-Client',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin'
});

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || 'https://bapc-login.github.io,http://localhost:8788,http://127.0.0.1:8788')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (!origin) return allowed[0] || '*';
  return allowed.some(value => origin === value || origin.startsWith(`${value}:`)) ? origin : '';
}

function json(payload, status = 200, origin = '*') {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(origin)}
  });
}

function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let text = String(value ?? '').trim().replace(/\s/g, '').replace(/\$/g, '');
  if (!text) return 0;
  if (text.includes(',') && text.includes('.')) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (text.includes(',')) text = text.replace(',', '.');
  else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/×/g, 'X').replace(/[^A-Z0-9.,%°X]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function expandAbbreviations(value) {
  return normalize(value)
    .replace(/\bS\s*[/.-]?\s*AZ(?:UCAR)?\b/g, ' SIN AZUCAR ')
    .replace(/\bZERO\b|\bLIGHT\b|\bSUGAR FREE\b/g, ' SIN AZUCAR ')
    .replace(/\bESP(?:EC)?\.?\b/g, ' ESPECIAL ')
    .replace(/\bTRANSP(?:ARENTE)?\.?\b|\bTRANS\.?\b/g, ' TRANSPARENTE ')
    .replace(/\bNOB\.?\b/g, ' NOBEL ')
    .replace(/\bJW\b|\bJOHNNIE\b/g, ' JOHNNIE WALKER ')
    .replace(/\bCOCA\s+COLA\s+SIN\s+AZUCAR\b/g, ' COCA COLA ZERO ')
    .replace(/\s+/g, ' ').trim();
}

function contentMl(value) {
  const text = expandAbbreviations(value);
  const matches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(ML|CC|LTS?|LT|LITROS?)/g)];
  if (matches.length) {
    const match = matches[matches.length - 1];
    const amount = Number(match[1].replace(',', '.')) || 0;
    if (/^(L|LT|LTS|LITRO)/.test(match[2])) {
      if (amount >= 20 && amount <= 60 && /\bLITRO\b/.test(text)) return 1000;
      return Math.round(amount * 1000);
    }
    return Math.round(amount);
  }
  if (/\b1[.,]5\b/.test(text)) return 1500;
  if (/\bLITRO\b|\b1L\b/.test(text)) return 1000;
  const standalone = text.match(/(?:^|\s)(250|330|350|500|600|700|750|900|1000|1500|2000)(?=\s|$)/);
  return standalone ? Number(standalone[1]) : 0;
}

function alcoholDegree(value) {
  const text = expandAbbreviations(value)
    .replace(/\d+(?:[.,]\d+)?\s*(?:ML|CC|LTS?|LT|LITROS?)/g, ' ')
    .replace(/(?:^|\s)\d{1,3}\s*X\s*\d{2,4}(?=\s*(?:ML|CC))/g, ' ')
    .replace(/(?:ML|CC)\s*X\s*0?\d{1,3}/g, ' ');
  const explicit = text.match(/(?:^|\s)(\d{2}(?:[.,]\d)?)\s*(?:GL|GRADOS?|°)(?=\s|$)/);
  if (explicit) return Number(explicit[1].replace(',', '.')) || 0;
  const values = [...text.matchAll(/(?:^|\s)(\d{2}(?:[.,]\d)?)(?=\s|$)/g)]
    .map(match => Number(match[1].replace(',', '.')))
    .filter(number => number >= 15 && number <= 60);
  return values[0] || 0;
}

function isOnePointFive(value) {
  const ml = contentMl(value);
  return ml >= 1450 && ml <= 1550;
}

function orderPackSize(unit, description = '') {
  const label = normalize(unit);
  const parenthesized = String(unit || '').match(/\((\d+)\)/);
  if (parenthesized) return Math.max(1, Number(parenthesized[1]) || 1);
  if (label.includes('DISPLAY')) return isOnePointFive(description) ? 6 : 24;
  return 1;
}

function explicitPackFromDescription(value) {
  const text = expandAbbreviations(value);
  let match = text.match(/(?:^|\s)(\d{1,3})\s*X\s*\d{2,4}\s*(?:ML|CC)\b/);
  if (match) return Math.max(1, Number(match[1]) || 1);
  match = text.match(/(?:ML|CC)\s*X\s*0?(\d{1,3})\b/);
  if (match) return Math.max(1, Number(match[1]) || 1);
  match = text.match(/(?:^|\s)X\s*0?(\d{1,3})(?=\s|$)/);
  if (match) return Math.max(1, Number(match[1]) || 1);
  match = text.match(/(?:DISPLAY|CAJA|PACK)\s*(?:DE\s*)?(\d{1,3})\b/);
  return match ? Math.max(1, Number(match[1]) || 1) : 0;
}

function parseQuantityCell(raw, fallback = 0) {
  const text = String(raw || '').trim();
  if (!text) return Math.max(0, numeric(fallback));
  const normalized = text.replace(',', '.');
  const fractionLike = normalized.match(/^\s*(\d+(?:\.\d+)?)\s*[/\-]\s*0+(?:\.0+)?\s*$/);
  if (fractionLike) return Math.max(0, Number(fractionLike[1]) || 0);
  const first = normalized.match(/\d+(?:\.\d+)?/);
  return first ? Math.max(0, Number(first[0]) || 0) : Math.max(0, numeric(fallback));
}

function isChargeLine(value) {
  const text = expandAbbreviations(value);
  if (!text) return false;
  const productSignals = ['COCA','FANTA','MISTRAL','RAMAZZOTTI','OLMECA','KAHLUA','TANQUERAY','WALKER','CARMEN'];
  if (productSignals.some(word => text.includes(word))) return false;
  return CHARGE_WORDS.some(word => text === word || text.startsWith(`${word} `) || text.includes(` ${word} `));
}

function stripped(value) {
  return expandAbbreviations(value)
    .replace(/\d+(?:[.,]\d+)?\s*(?:ML|CC|LTS?|LT|LITROS?)/g, ' ')
    .replace(/(?:^|\s)\d{1,3}\s*X\s*\d{2,4}(?=\s*(?:ML|CC))/g, ' ')
    .replace(/(?:ML|CC)\s*X\s*0?\d{1,3}/g, ' ')
    .replace(/(?:^|\s)X\s*0?\d{1,3}(?=\s|$)/g, ' ')
    .replace(/\b\d{2}(?:[.,]\d)?\s*(?:GL|GRADOS?|°)?\b/g, ' ')
    .replace(/\b(?:VNR|VID|VIDRIO|PET|RETORNABLE|RET|TR|BOT|BOTELLA|BOTELLAS|CAJA|CAJAS|PACK|DISPLAY)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function tokens(value) {
  return stripped(value).split(' ').filter(token => token.length > 1 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

function tokenSimilarity(left, right) {
  if (left === right) return 1;
  if (left.length >= 3 && right.length >= 3 && (left.startsWith(right) || right.startsWith(left))) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length) * .92 + .08;
  }
  const a = new Set(left), b = new Set(right);
  let overlap = 0;
  for (const char of a) if (b.has(char)) overlap++;
  return overlap / Math.max(a.size, b.size, 1) * .55;
}

function trigramSet(value) {
  const compact = stripped(value).replace(/\s/g, '');
  const set = new Set();
  if (compact.length < 3) { if (compact) set.add(compact); return set; }
  for (let index = 0; index <= compact.length - 3; index++) set.add(compact.slice(index, index + 3));
  return set;
}

function trigramSimilarity(left, right) {
  const a = trigramSet(left), b = trigramSet(right);
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const gram of a) if (b.has(gram)) hits++;
  return hits / new Set([...a, ...b]).size;
}

function variantFlags(value) {
  const text = expandAbbreviations(value);
  return {
    zero: /\bZERO\b|\bSIN AZUCAR\b/.test(text),
    normal: /\bNORMAL\b|\bORIGINAL\b/.test(text),
    transparent: /\bTRANSPARENTE\b/.test(text),
    special: /\bESPECIAL\b/.test(text),
    nobel: /\bNOBEL\b/.test(text),
    silver: /\bSILVER\b/.test(text),
    black: /\bBLACK\b/.test(text),
    red: /\bRED\b/.test(text)
  };
}

function variantAdjustment(source, product) {
  const a = variantFlags(source), b = variantFlags(product);
  let score = 0;
  const exclusive = [['zero','normal'],['black','red']];
  for (const [left, right] of exclusive) {
    if ((a[left] && b[right]) || (a[right] && b[left])) score -= .48;
  }
  for (const key of ['zero','normal','transparent','special','nobel','silver','black','red']) {
    if (a[key] && b[key]) score += .08;
  }
  return score;
}

function textSimilarity(source, product) {
  const sourceTokens = tokens(source), productTokens = tokens(product);
  if (!sourceTokens.length || !productTokens.length) return 0;
  let productCoverage = 0;
  for (const productToken of productTokens) {
    productCoverage += Math.max(0, ...sourceTokens.map(sourceToken => tokenSimilarity(sourceToken, productToken)));
  }
  productCoverage /= productTokens.length;
  let sourceCoverage = 0;
  for (const sourceToken of sourceTokens) {
    sourceCoverage += Math.max(0, ...productTokens.map(productToken => tokenSimilarity(sourceToken, productToken)));
  }
  sourceCoverage /= sourceTokens.length;
  return Math.min(1, productCoverage * .56 + sourceCoverage * .24 + trigramSimilarity(source, product) * .20);
}

function rankProducts(line, products) {
  const source = line.descriptionOriginal || line.sourceLine || line.description || '';
  const sourceMl = contentMl(source);
  const sourceDegree = alcoholDegree(source);
  const requestedId = String(line.matchedOrderProductId || line.productId || '');
  return (products || []).map(product => {
    const productMl = contentMl(product.description);
    const productDegree = alcoholDegree(product.description);
    let score = textSimilarity(source, product.description);
    const reasons = [];
    if (sourceMl && productMl) {
      if (sourceMl === productMl) { score += .22; reasons.push('mismo volumen'); }
      else { score -= .42; reasons.push(`volumen ${sourceMl} ml vs ${productMl} ml`); }
    }
    if (sourceDegree && productDegree) {
      if (Math.abs(sourceDegree - productDegree) <= 1.1) { score += .04; reasons.push('graduación compatible'); }
      else { score -= .07; reasons.push(`graduación informativa ${sourceDegree}° vs ${productDegree}°`); }
    }
    score += variantAdjustment(source, product.description);
    if (String(product.productId) === requestedId) { score += .18; reasons.push('selección sugerida por Gemini'); }
    return {product, score: Math.max(0, Math.min(1, score)), reasons};
  }).sort((a, b) => b.score - a.score);
}

function chooseProduct(line, products) {
  const requestedId = String(line.matchedOrderProductId || line.productId || '');
  const ranked = rankProducts(line, products);
  const best = ranked[0] || {product: null, score: 0, reasons: []};
  const second = ranked[1]?.score || 0;
  const requested = ranked.find(entry => String(entry.product.productId) === requestedId);
  if (requested && requested.score >= .34) {
    return {product: requested.product, candidate: requested.product, score: requested.score, method: 'gemini+catalog-validation', reason: requested.reasons.join(', ')};
  }
  const unique = best.score >= .47 || (best.score >= .38 && best.score - second >= .08);
  return {product: unique ? best.product : null, candidate: best.product, score: best.score, method: unique ? 'catalog-resolver' : 'unmatched', reason: best.reasons.join(', ')};
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

const responseSchema = {
  type: 'OBJECT',
  properties: {
    supplierName: {type: 'STRING'}, supplierRut: {type: 'STRING'}, invoiceNumber: {type: 'STRING'}, invoiceDate: {type: 'STRING'}, currency: {type: 'STRING'},
    totals: {
      type: 'OBJECT',
      properties: {net: {type: 'NUMBER'}, freight: {type: 'NUMBER'}, additionalTax: {type: 'NUMBER'}, vat: {type: 'NUMBER'}, other: {type: 'NUMBER'}, total: {type: 'NUMBER'}},
      required: ['net','freight','additionalTax','vat','other','total']
    },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          code: {type: 'STRING'}, descriptionOriginal: {type: 'STRING'}, quantityCellRaw: {type: 'STRING'}, invoiceQuantity: {type: 'NUMBER'},
          packSize: {type: 'NUMBER'}, units: {type: 'NUMBER'}, contentMl: {type: 'NUMBER'}, alcoholDegree: {type: 'NUMBER'},
          unitPriceNet: {type: 'NUMBER'}, discountPct: {type: 'NUMBER'}, netLineTotal: {type: 'NUMBER'}, freightLine: {type: 'NUMBER'},
          vatLine: {type: 'NUMBER'}, additionalTaxLine: {type: 'NUMBER'}, otherLineCharges: {type: 'NUMBER'}, grossLineTotal: {type: 'NUMBER'},
          matchedOrderProductId: {type: 'STRING'}, matchConfidence: {type: 'NUMBER'}, matchReason: {type: 'STRING'}, notes: {type: 'STRING'}
        },
        required: ['code','descriptionOriginal','quantityCellRaw','invoiceQuantity','packSize','units','contentMl','alcoholDegree','unitPriceNet','discountPct','netLineTotal','freightLine','vatLine','additionalTaxLine','otherLineCharges','grossLineTotal','matchedOrderProductId','matchConfidence','matchReason','notes']
      }
    },
    warnings: {type: 'ARRAY', items: {type: 'STRING'}}
  },
  required: ['supplierName','invoiceNumber','totals','items','warnings']
};

function buildPrompt(context) {
  const products = (context.products || []).map(product => ({id: String(product.productId), d: String(product.description), u: String(product.unit || 'UNIDAD'), q: numeric(product.orderedQty), pack: orderPackSize(product.unit, product.description)}));
  return `<task>Extrae y coteja factura A contra pedido B y CAT. Responde solo según JSON Schema.</task>
<CAT>${JSON.stringify(products)}</CAT>
<context>proveedor=${String(context.providerName || '')};folio=${String(context.folio || '')}</context>
<rules>
- Una salida por producto. Excluye flete, impuestos, descuentos, depósitos, garantías y totales.
- quantityCellRaw copia Cantidad; invoiceQuantity sale solo de esa celda.
- packSize sale de X06/X6/1000CCX6/6X350CC. units=invoiceQuantity*packSize.
- Match por marca, familia, variante y volumen. Volumen distinto invalida. ESP=ESPECIAL; TRANS=TRANSPARENTE; ZERO=SIN AZUCAR.
- matchedOrderProductId es un id exacto de CAT o vacío. Nunca inventes.
- DISPLAY=24; 1.5L=6, salvo pack explícito.
- Lee neto, descuento, flete, IVA, impuesto adicional, otros y total final por línea.
- Números sin símbolos. Ilegible=0 y warning breve.
</rules>`;
}

async function parseGeminiResponse(response, model) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
    error.status = response.status; error.model = model; throw error;
  }
  const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
  if (!text) throw new Error(`Gemini (${model}) no devolvió contenido estructurado`);
  try { return {data: JSON.parse(text), usage: payload.usageMetadata || null, model}; }
  catch { throw new Error(`Gemini (${model}) devolvió JSON inválido`); }
}

async function callGemini(env, model, invoiceMime, invoiceData, orderMime, orderData, context) {
  const parts = [{text: 'DOCUMENTO A — FACTURA'}, {inline_data: {mime_type: invoiceMime, data: invoiceData}}];
  if (orderData) parts.push({text: 'DOCUMENTO B — PEDIDO PDF'}, {inline_data: {mime_type: orderMime || 'application/pdf', data: orderData}});
  parts.push({text: buildPrompt(context)});
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', signal: controller.signal,
      headers: {'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY},
      body: JSON.stringify({
        contents: [{role: 'user', parts}],
        generationConfig: {temperature: 0, responseMimeType: 'application/json', responseSchema, maxOutputTokens: 8192}
      })
    });
    return await parseGeminiResponse(response, model);
  } finally { clearTimeout(timeout); }
}

async function callWithFallbacks(env, invoiceMime, invoiceData, orderMime, orderData, context) {
  const models = [env.GEMINI_MODEL || DEFAULT_MODEL, ...FALLBACK_MODELS].filter((value, index, all) => value && all.indexOf(value) === index);
  const attempts = [];
  for (const model of models) {
    try { return await callGemini(env, model, invoiceMime, invoiceData, orderMime, orderData, context); }
    catch (error) {
      attempts.push({model, error: String(error.message || error), status: error.status || 0});
      const canFallback = !error.status || error.status === 404 || error.status === 400 || error.status >= 500;
      if (!canFallback) break;
    }
  }
  const error = new Error(attempts.map(item => `${item.model}: ${item.error}`).join(' | ') || 'Gemini no respondió');
  error.attempts = attempts; throw error;
}

function distributeResidual(lines, targetTotal) {
  const current = lines.reduce((sum, line) => sum + line.grossLineTotal, 0);
  const residual = Math.round(targetTotal - current);
  if (!targetTotal || !lines.length || Math.abs(residual) <= 1) return;
  const basis = lines.reduce((sum, line) => sum + Math.max(0, line.netLineTotal), 0) || lines.length;
  let assigned = 0;
  lines.forEach((line, index) => {
    const share = index === lines.length - 1 ? residual - assigned : Math.round(residual * ((Math.max(0, line.netLineTotal) || 1) / basis));
    line.grossLineTotal = Math.max(0, line.grossLineTotal + share); assigned += share;
  });
}

function validateInvoice(raw, context) {
  const products = context.products || [];
  const totals = {
    net: Math.max(0, numeric(raw.totals?.net)), freight: Math.max(0, numeric(raw.totals?.freight)),
    additionalTax: Math.max(0, numeric(raw.totals?.additionalTax)), vat: Math.max(0, numeric(raw.totals?.vat)),
    other: Math.max(0, numeric(raw.totals?.other)), total: Math.max(0, numeric(raw.totals?.total))
  };
  const warnings = [...(Array.isArray(raw.warnings) ? raw.warnings : [])];
  const sourceItems = Array.isArray(raw.items) ? raw.items : [];
  const productItems = sourceItems.filter(line => {
    const source = String(line.descriptionOriginal || '').trim();
    if (!isChargeLine(source)) return true;
    warnings.push(`Cargo separado del listado de productos: ${source}`);
    if (!totals.freight && /FLETE|DESPACHO|TRANSPORTE/.test(expandAbbreviations(source))) totals.freight += Math.max(0, Math.round(numeric(line.grossLineTotal) || numeric(line.netLineTotal)));
    return false;
  });

  const lines = productItems.map((line, index) => {
    const sourceLine = String(line.descriptionOriginal || '').trim();
    const invoiceQuantity = parseQuantityCell(line.quantityCellRaw, line.invoiceQuantity);
    const match = chooseProduct(line, products);
    const product = match.product;
    const candidate = match.candidate;
    const explicitPack = explicitPackFromDescription(sourceLine);
    const expectedOrderPack = product ? orderPackSize(product.unit, product.description) : 1;
    let packSize = explicitPack || Math.max(1, numeric(line.packSize) || 1);
    if (product && normalize(product.unit).includes('DISPLAY') && !explicitPack) packSize = expectedOrderPack;
    const units = Math.max(0, invoiceQuantity * packSize);
    const netLineTotal = Math.max(0, Math.round(numeric(line.netLineTotal)));
    const freightLine = Math.max(0, Math.round(numeric(line.freightLine)));
    const vatLine = Math.max(0, Math.round(numeric(line.vatLine)));
    const additionalTaxLine = Math.max(0, Math.round(numeric(line.additionalTaxLine)));
    const otherLineCharges = Math.max(0, Math.round(numeric(line.otherLineCharges)));
    const componentTotal = netLineTotal + freightLine + vatLine + additionalTaxLine + otherLineCharges;
    let grossLineTotal = Math.max(0, Math.round(numeric(line.grossLineTotal)));
    if (!grossLineTotal || Math.abs(grossLineTotal - componentTotal) > Math.max(3, componentTotal * .03)) grossLineTotal = componentTotal;
    const receivedOrderQty = product ? units / expectedOrderPack : 0;
    if (!product) warnings.push(`Sin coincidencia segura con el pedido: ${sourceLine || `línea ${index + 1}`}`);
    return {
      id: `gemini-${index + 1}`, code: String(line.code || ''), sourceLine, descriptionOriginal: sourceLine,
      quantityCellRaw: String(line.quantityCellRaw || ''), invoiceQuantity, packageQty: invoiceQuantity, packSize, units,
      contentMl: contentMl(sourceLine) || Math.max(0, numeric(line.contentMl)), alcoholDegree: alcoholDegree(sourceLine) || Math.max(0, numeric(line.alcoholDegree)),
      unitPriceNet: Math.max(0, Math.round(numeric(line.unitPriceNet))), discountPct: Math.max(0, numeric(line.discountPct)),
      netLineTotal, freightLine, vatLine, additionalTaxLine, otherLineCharges, grossLineTotal,
      grossPackPrice: invoiceQuantity ? Math.round(grossLineTotal / invoiceQuantity) : 0,
      grossUnitPrice: units ? Math.round(grossLineTotal / units) : 0,
      productId: product?.productId || '', suggestedProductId: !product && candidate?.productId ? String(candidate.productId) : '',
      description: product?.description || sourceLine, receivedOrderQty: Number(receivedOrderQty.toFixed(3)), orderPackSize: expectedOrderPack,
      confidence: Math.max(0, Math.min(1, Math.max(numeric(line.matchConfidence), match.score || 0))),
      matchMethod: match.method, matchScore: Number((match.score || 0).toFixed(4)),
      matchReason: String(line.matchReason || match.reason || ''), notes: String(line.notes || ''), engine: 'gemini'
    };
  }).filter(line => line.sourceLine || line.invoiceQuantity || line.netLineTotal || line.grossLineTotal);

  distributeResidual(lines, totals.total);
  for (const line of lines) {
    line.grossUnitPrice = line.units ? Math.round(line.grossLineTotal / line.units) : 0;
    line.grossPackPrice = line.invoiceQuantity ? Math.round(line.grossLineTotal / line.invoiceQuantity) : 0;
  }
  if (!lines.length) warnings.push('Gemini no detectó líneas de productos.');
  const matched = lines.filter(line => line.productId).length;
  return {
    supplierName: String(raw.supplierName || ''), supplierRut: String(raw.supplierRut || ''), invoiceNumber: String(raw.invoiceNumber || ''),
    invoiceDate: String(raw.invoiceDate || ''), currency: String(raw.currency || 'CLP'), totals, lines,
    matchSummary: {matched, unmatched: lines.length - matched, totalInvoiceLines: lines.length},
    warnings: [...new Set(warnings.filter(Boolean))], rawText: JSON.stringify(raw)
  };
}

async function analyze(request, env, origin) {
  if (!env.GEMINI_API_KEY) return json({ok: false, error: 'GEMINI_API_KEY no está configurada', code: 'missing_api_key'}, 503, origin);
  const form = await request.formData();
  const invoice = form.get('file');
  const order = form.get('orderFile');
  if (!(invoice instanceof File)) return json({ok: false, error: 'Debes adjuntar la factura', code: 'missing_file'}, 400, origin);
  if (invoice.size > MAX_INVOICE_BYTES) return json({ok: false, error: 'La factura supera 12 MB', code: 'file_too_large'}, 413, origin);
  if (order instanceof File && order.size > MAX_ORDER_BYTES) return json({ok: false, error: 'El PDF del pedido supera 3 MB', code: 'order_too_large'}, 413, origin);
  if (invoice.size + (order instanceof File ? order.size : 0) > MAX_COMBINED_BYTES) return json({ok: false, error: 'Factura y pedido superan 16 MB', code: 'combined_too_large'}, 413, origin);
  let context = {};
  try { context = JSON.parse(String(form.get('context') || '{}')); }
  catch { return json({ok: false, error: 'Contexto de pedido inválido', code: 'invalid_context'}, 400, origin); }
  const invoiceMime = invoice.type || (/\.pdf$/i.test(invoice.name) ? 'application/pdf' : 'image/jpeg');
  if (!/^image\//.test(invoiceMime) && invoiceMime !== 'application/pdf') return json({ok: false, error: 'Usa una imagen o PDF', code: 'unsupported_type'}, 415, origin);
  const invoiceData = toBase64(await invoice.arrayBuffer());
  const orderData = order instanceof File ? toBase64(await order.arrayBuffer()) : '';
  const result = await callWithFallbacks(env, invoiceMime, invoiceData, order?.type || 'application/pdf', orderData, context);
  return json({ok: true, model: result.model, usage: result.usage, comparedOrderPdf: !!orderData, invoice: validateInvoice(result.data, context)}, 200, origin);
}

async function probeGemini(env) {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY},
    body: JSON.stringify({contents: [{parts: [{text: 'Responde exactamente OK'}]}], generationConfig: {temperature: 0, maxOutputTokens: 8}})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
  return {model, ok: !!payload?.candidates?.length};
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (!origin) return json({ok: false, error: 'Origen no autorizado'}, 403, 'null');
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders(origin)});
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      const base = {ok: true, service: 'pedidos-pro-ai', geminiConfigured: !!env.GEMINI_API_KEY, model: env.GEMINI_MODEL || DEFAULT_MODEL, resolver: 'catalog-v22'};
      if (url.searchParams.get('probe') !== '1' || !env.GEMINI_API_KEY) return json(base, 200, origin);
      try { return json({...base, probe: await probeGemini(env)}, 200, origin); }
      catch (error) { return json({...base, ok: false, probe: {ok: false, error: String(error.message || error)}}, 502, origin); }
    }
    if (request.method === 'POST' && url.pathname === '/v1/invoices/analyze') {
      try { return await analyze(request, env, origin); }
      catch (error) {
        console.error(error);
        return json({ok: false, error: String(error.message || 'No se pudo analizar la factura'), code: 'gemini_failed', attempts: error.attempts || []}, 502, origin);
      }
    }
    return json({ok: false, error: 'Ruta no encontrada'}, 404, origin);
  }
};
