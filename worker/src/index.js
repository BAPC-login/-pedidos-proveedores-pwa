const DEFAULT_MODEL = 'gemini-3.5-flash';
const FALLBACK_MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash'];
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_COMBINED_BYTES = 16 * 1024 * 1024;
const STOP_WORDS = new Set([
  'DE','DEL','LA','LAS','EL','LOS','UN','UNA','UND','UNID','UNIDAD','UNIDADES','CAJA','CAJAS',
  'BOT','BOTELLA','BOTELLAS','BEB','BEBIDA','BEBIDAS','PROD','PRODUCTO','PACK','FORMATO','VID','PET','WHIS','WHISKY','WALKER'
]);

const corsHeaders = origin => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Pedidos-Client',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin'
});

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const configured = String(env.ALLOWED_ORIGINS || 'https://bapc-login.github.io,http://localhost:8788,http://127.0.0.1:8788')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (!origin) return configured[0] || '*';
  return configured.some(value => origin === value || origin.startsWith(`${value}:`)) ? origin : '';
}

function json(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(origin)}
  });
}

function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let text = String(value ?? '').trim().replace(/\s/g, '');
  if (!text) return 0;
  if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) text = text.replace(',', '.');
  else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9.,]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function contentMl(text) {
  const value = normalize(text);
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*(ML|CC|LTS?|LT|LITROS?)/);
  if (match) {
    const amount = Number(match[1].replace(',', '.')) || 0;
    if (/^(?:L|LT)/.test(match[2])) {
      if (amount >= 20 && amount <= 60 && /\bLITRO\b/.test(value)) return 1000;
      return Math.round(amount * 1000);
    }
    return Math.round(amount);
  }
  if (/\bLITRO\b|\b1L\b/.test(value)) return 1000;
  const standalone = value.match(/(?:^|\s)(250|330|350|500|600|700|750|900|1000|1500|2000)(?=\s|$)/);
  return standalone ? Number(standalone[1]) : 0;
}

function alcoholDegree(text) {
  const value = normalize(text)
    .replace(/\d+(?:[.,]\d+)?\s*(?:ML|CC|LTS?|LT|LITROS?)/g, ' ')
    .replace(/(?:^|\s)\d{1,2}\s*X\s*\d{2,4}(?=\s*(?:ML|CC))/g, ' ')
    .replace(/X\s*0?\d{1,2}(?=\s*(?:VID|BOT|UN|$))/g, ' ');
  const matches = [...value.matchAll(/(?:^|\s)(\d{2}(?:[.,]\d)?)(?=\s|$)/g)]
    .map(match => Number(match[1].replace(',', '.')))
    .filter(value => value >= 20 && value <= 60);
  return matches.length ? matches[0] : 0;
}

function packFromUnit(unit) {
  const match = String(unit || '').match(/\((\d+)\)/);
  return match ? Math.max(1, Number(match[1])) : 1;
}

function packFromDescription(text) {
  const value = normalize(text);
  let match = value.match(/(?:^|\s)(\d{1,2})\s*X\s*\d{2,4}\s*(?:ML|CC)/);
  if (match) return Math.max(1, Number(match[1]));
  match = value.match(/X\s*0?(\d{1,2})(?=\s*(?:VID|BOT|UN|UND|$))/);
  if (match) return Math.max(1, Number(match[1]));
  match = value.match(/(?:CAJA|PACK)\s*(?:DE)?\s*(\d{1,2})/);
  return match ? Math.max(1, Number(match[1])) : 1;
}

function parseQuantityCell(raw, fallback = 0) {
  const text = String(raw || '').trim();
  if (!text) return Math.max(0, number(fallback));
  const normalized = text.replace(',', '.');
  const fractionLike = normalized.match(/^\s*(\d+(?:\.\d+)?)\s*[/\\-]\s*0+(?:\.0+)?\s*$/);
  if (fractionLike) return Math.max(0, Number(fractionLike[1]) || 0);
  const first = normalized.match(/\d+(?:\.\d+)?/);
  return first ? Math.max(0, Number(first[0]) || 0) : Math.max(0, number(fallback));
}

function canonical(value) {
  let text = normalize(value);
  const ml = contentMl(text);
  text = text.replace(/(\d+(?:[.,]\d+)?)\s*(ML|CC|LTS?|LT|LITROS?)/g, ml ? ` ${ml}ML ` : ' ');
  return text
    .replace(/\bZERO\b/g, 'SIN AZUCAR')
    .replace(/\bLIGHT\b/g, 'SIN AZUCAR')
    .replace(/\bSUGAR FREE\b/g, 'SIN AZUCAR')
    .replace(/\bJOHNNIE\b/g, 'JW')
    .replace(/\bWHISKY\b/g, 'WHIS')
    .replace(/\s+/g, ' ').trim();
}

function tokens(value) {
  return canonical(value).split(' ').filter(token => token.length > 1 && !STOP_WORDS.has(token) && !/^\d+(?:[.,]\d+)?(?:ML)?$/.test(token));
}

function similarity(a, b) {
  const at = tokens(a), bt = tokens(b);
  if (!at.length || !bt.length) return 0;
  const aa = new Set(at), bb = new Set(bt);
  let hit = 0;
  for (const token of aa) if (bb.has(token)) hit++;
  const union = new Set([...aa, ...bb]).size || 1;
  const jaccard = hit / union;
  const coverage = hit / Math.min(aa.size, bb.size);
  const ac = canonical(a).replace(/\s+/g, ''), bc = canonical(b).replace(/\s+/g, '');
  const substring = ac && bc && (ac.includes(bc) || bc.includes(ac)) ? 1 : 0;
  const aml = contentMl(a), bml = contentMl(b);
  const volume = aml && bml ? (aml === bml ? 1 : 0) : 0.45;
  return Math.min(1, jaccard * 0.45 + coverage * 0.34 + substring * 0.12 + volume * 0.09);
}

function rankProducts(line, products) {
  const source = line.descriptionOriginal || line.description || '';
  const lineMl = contentMl(source);
  const lineDegree = alcoholDegree(source);
  return (products || []).map(product => {
    const productMl = contentMl(product.description);
    const productDegree = alcoholDegree(product.description);
    let score = similarity(source, product.description);
    const reasons = [];
    if (lineMl && productMl) {
      if (lineMl === productMl) { score += 0.14; reasons.push('mismo formato'); }
      else { score -= 0.32; reasons.push('formato distinto'); }
    }
    if (lineDegree && productDegree) {
      if (Math.abs(lineDegree - productDegree) <= 0.6) { score += 0.12; reasons.push('misma graduación'); }
      else { score -= 0.42; reasons.push(`graduación ${lineDegree}° vs ${productDegree}°`); }
    }
    return {product, score: Math.max(0, Math.min(1, score)), reasons, lineMl, productMl, lineDegree, productDegree};
  }).sort((a, b) => b.score - a.score);
}

function bestProduct(line, products) {
  const requested = String(line.matchedOrderProductId || line.productId || '');
  const requestedProduct = products.find(product => String(product.productId) === requested);
  const ranked = rankProducts(line, products);
  const best = ranked[0] || {product: null, score: 0, reasons: []};
  const second = ranked[1]?.score || 0;

  if (requestedProduct) {
    const requestedRank = ranked.find(entry => String(entry.product.productId) === requested);
    if (requestedRank && requestedRank.score >= 0.46) {
      return {product: requestedProduct, candidate: requestedProduct, score: requestedRank.score, method: 'gemini+validated', reason: requestedRank.reasons.join(', ')};
    }
  }

  const safe = best.score >= 0.58 || (best.score >= 0.50 && best.score - second >= 0.12);
  return {
    product: safe ? best.product : null,
    candidate: best.product,
    score: best.score,
    method: safe ? 'deterministic' : 'unmatched',
    reason: best.reasons.join(', ')
  };
}

function toBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

const responseSchema = {
  type: 'OBJECT',
  properties: {
    supplierName: {type: 'STRING'},
    supplierRut: {type: 'STRING'},
    invoiceNumber: {type: 'STRING'},
    invoiceDate: {type: 'STRING'},
    currency: {type: 'STRING'},
    totals: {
      type: 'OBJECT',
      properties: {
        net: {type: 'NUMBER'},
        freight: {type: 'NUMBER'},
        additionalTax: {type: 'NUMBER'},
        vat: {type: 'NUMBER'},
        other: {type: 'NUMBER'},
        total: {type: 'NUMBER'}
      },
      required: ['net', 'freight', 'additionalTax', 'vat', 'other', 'total']
    },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          code: {type: 'STRING'},
          descriptionOriginal: {type: 'STRING'},
          quantityCellRaw: {type: 'STRING'},
          invoiceQuantity: {type: 'NUMBER'},
          packSize: {type: 'NUMBER'},
          units: {type: 'NUMBER'},
          contentMl: {type: 'NUMBER'},
          alcoholDegree: {type: 'NUMBER'},
          unitPriceNet: {type: 'NUMBER'},
          discountPct: {type: 'NUMBER'},
          netLineTotal: {type: 'NUMBER'},
          freightLine: {type: 'NUMBER'},
          vatLine: {type: 'NUMBER'},
          additionalTaxLine: {type: 'NUMBER'},
          otherLineCharges: {type: 'NUMBER'},
          grossLineTotal: {type: 'NUMBER'},
          matchedOrderProductId: {type: 'STRING'},
          matchConfidence: {type: 'NUMBER'},
          matchReason: {type: 'STRING'},
          notes: {type: 'STRING'}
        },
        required: [
          'code','descriptionOriginal','quantityCellRaw','invoiceQuantity','packSize','units','contentMl','alcoholDegree',
          'unitPriceNet','discountPct','netLineTotal','freightLine','vatLine','additionalTaxLine','otherLineCharges',
          'grossLineTotal','matchedOrderProductId','matchConfidence','matchReason','notes'
        ]
      }
    },
    warnings: {type: 'ARRAY', items: {type: 'STRING'}}
  },
  required: ['supplierName', 'invoiceNumber', 'totals', 'items', 'warnings']
};

function buildPrompt(context) {
  const products = (context.products || []).map(product => ({
    productId: String(product.productId),
    description: String(product.description),
    unit: String(product.unit || 'UNIDAD'),
    orderedQty: number(product.orderedQty),
    orderPackSize: packFromUnit(product.unit)
  }));
  return `Compara visualmente DOS documentos del mismo proveedor:
- DOCUMENTO A: factura recibida.
- DOCUMENTO B: pedido PDF emitido por el cliente.

Tu trabajo es extraer TODAS las líneas reales de la factura y cotejarlas contra el pedido. No inventes productos ni cantidades.

PEDIDO ESTRUCTURADO DE APOYO:
${JSON.stringify(products)}

REGLAS CRÍTICAS DE LECTURA:
1. La cantidad facturada sale EXCLUSIVAMENTE de la columna "Cantidad" de la factura. Devuelve además el texto literal de esa celda en quantityCellRaw.
2. Números dentro de la descripción como 35, 40 o 43.1 suelen ser graduación alcohólica; NUNCA son cantidad.
3. En "ALTO DEL CARMEN ESPEC 35 X06 VID 1000CC", 35 es graduación, X06 significa 6 botellas por caja y 1000CC es el contenido. Si Cantidad dice 1, son 1 caja y 6 unidades.
4. En "ALTO DEL CARMEN TRANSP 40 X01 VID 750CC", 40 es graduación, X01 significa una botella por unidad y 750CC es contenido. Si Cantidad dice 9, son 9 unidades.
5. En "1X750ML 40 BOT", el primer 1 es pack de una unidad, 750ML es volumen y 40 es graduación; no son 40 botellas.
6. packSize debe venir del formato X01, X06, X12, 1X750ML, etc. units = invoiceQuantity * packSize.
7. Lee por línea: precio unitario neto, descuento, neto total, flete, IVA, impuesto adicional y cualquier otro cargo. grossLineTotal debe ser el total final de esa línea después de impuestos y cargos.
8. El total final por botella/unidad es grossLineTotal / units.
9. Compara descripción, marca, variante, volumen y graduación con el pedido PDF y el pedido estructurado.
10. Si la factura dice graduación 40 y el pedido dice 35, NO es coincidencia exacta: deja matchedOrderProductId vacío y explica la diferencia.
11. Una línea de factura no pedida también debe conservarse, con matchedOrderProductId vacío.
12. No descartes líneas. Debes devolver una entrada por cada producto facturado.
13. Si una celda no puede leerse, usa 0 o cadena vacía y agrega una advertencia.
14. Los números se devuelven sin símbolos de moneda ni separadores de miles.

PROVEEDOR ESPERADO: ${String(context.providerName || 'no informado')}
FOLIO DEL PEDIDO: ${String(context.folio || 'no informado')}`;
}

async function parseGeminiResponse(response, model) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Gemini HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.model = model;
    throw error;
  }
  const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
  if (!text) throw new Error(`Gemini (${model}) no devolvió contenido estructurado`);
  try { return {data: JSON.parse(text), usage: payload.usageMetadata || null, model}; }
  catch { throw new Error(`Gemini (${model}) devolvió JSON inválido`); }
}

async function callGemini(env, model, invoiceMime, invoiceData, orderMime, orderData, context) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const parts = [
    {text: 'DOCUMENTO A — FACTURA A ANALIZAR'},
    {inline_data: {mime_type: invoiceMime, data: invoiceData}}
  ];
  if (orderData) {
    parts.push({text: 'DOCUMENTO B — PEDIDO PDF EMITIDO POR EL CLIENTE'});
    parts.push({inline_data: {mime_type: orderMime || 'application/pdf', data: orderData}});
  }
  parts.push({text: buildPrompt(context)});
  const body = {
    contents: [{role: 'user', parts}],
    generationConfig: {
      temperature: 0.05,
      responseMimeType: 'application/json',
      responseSchema,
      maxOutputTokens: 16384
    }
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY},
    body: JSON.stringify(body)
  });
  return parseGeminiResponse(response, model);
}

async function probeGemini(env) {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY},
    body: JSON.stringify({contents: [{parts: [{text: 'Responde exactamente OK'}]}], generationConfig: {temperature: 0, maxOutputTokens: 8}})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
  return {model, ok: !!payload?.candidates?.length};
}

async function callWithFallbacks(env, invoiceMime, invoiceData, orderMime, orderData, context) {
  const models = [env.GEMINI_MODEL || DEFAULT_MODEL, ...FALLBACK_MODELS]
    .filter((value, index, array) => value && array.indexOf(value) === index);
  const attempts = [];
  for (const model of models) {
    try { return await callGemini(env, model, invoiceMime, invoiceData, orderMime, orderData, context); }
    catch (error) { attempts.push({model, error: String(error.message || error), status: error.status || 0}); }
  }
  const combined = attempts.map(item => `${item.model}: ${item.error}`).join(' | ');
  const error = new Error(combined || 'Gemini no respondió');
  error.attempts = attempts;
  throw error;
}

function distributeResidual(lines, targetTotal) {
  const current = lines.reduce((sum, line) => sum + line.grossLineTotal, 0);
  const residual = Math.round(targetTotal - current);
  if (!targetTotal || !lines.length || Math.abs(residual) <= 1) return;
  const basis = lines.reduce((sum, line) => sum + Math.max(0, line.netLineTotal), 0) || lines.length;
  let assigned = 0;
  lines.forEach((line, index) => {
    const delta = index === lines.length - 1
      ? residual - assigned
      : Math.round(residual * ((Math.max(0, line.netLineTotal) || 1) / basis));
    line.grossLineTotal = Math.max(0, line.grossLineTotal + delta);
    assigned += delta;
  });
}

function validateInvoice(raw, context) {
  const products = context.products || [];
  const totals = {
    net: Math.max(0, number(raw.totals?.net)),
    freight: Math.max(0, number(raw.totals?.freight)),
    additionalTax: Math.max(0, number(raw.totals?.additionalTax)),
    vat: Math.max(0, number(raw.totals?.vat)),
    other: Math.max(0, number(raw.totals?.other)),
    total: Math.max(0, number(raw.totals?.total))
  };
  const warnings = [...(Array.isArray(raw.warnings) ? raw.warnings : [])];

  const lines = (Array.isArray(raw.items) ? raw.items : []).map((line, index) => {
    const sourceLine = String(line.descriptionOriginal || '').trim();
    const invoiceQuantity = parseQuantityCell(line.quantityCellRaw, line.invoiceQuantity);
    const inferredPack = packFromDescription(sourceLine);
    const packSize = Math.max(1, inferredPack || number(line.packSize) || 1);
    const units = Math.max(0, invoiceQuantity * packSize);
    const netLineTotal = Math.max(0, Math.round(number(line.netLineTotal)));
    const freightLine = Math.max(0, Math.round(number(line.freightLine)));
    const vatLine = Math.max(0, Math.round(number(line.vatLine)));
    const additionalTaxLine = Math.max(0, Math.round(number(line.additionalTaxLine)));
    const otherLineCharges = Math.max(0, Math.round(number(line.otherLineCharges)));
    let grossLineTotal = Math.max(0, Math.round(number(line.grossLineTotal)));
    const componentTotal = netLineTotal + freightLine + vatLine + additionalTaxLine + otherLineCharges;
    if (!grossLineTotal || Math.abs(grossLineTotal - componentTotal) > Math.max(3, componentTotal * 0.02)) {
      grossLineTotal = componentTotal;
    }

    const matched = bestProduct(line, products);
    const product = matched.product;
    const candidate = matched.candidate;
    const orderPack = packFromUnit(product?.unit || 'UNIDAD');
    const receivedOrderQty = product ? (orderPack > 1 ? units / orderPack : units) : 0;
    const grossUnitPrice = units ? Math.round(grossLineTotal / units) : 0;
    const grossPackPrice = invoiceQuantity ? Math.round(grossLineTotal / invoiceQuantity) : 0;
    const degree = alcoholDegree(sourceLine) || Math.max(0, number(line.alcoholDegree));
    const ml = contentMl(sourceLine) || Math.max(0, number(line.contentMl));

    if (!product) {
      warnings.push(`Producto facturado sin coincidencia segura en el pedido: ${sourceLine || `línea ${index + 1}`}`);
    }
    if (invoiceQuantity >= 20 && /(?:35|40|43[.,]1)/.test(sourceLine)) {
      warnings.push(`Cantidad alta revisada en ${sourceLine}: se usó la columna Cantidad (${invoiceQuantity}), no la graduación del nombre.`);
    }

    return {
      id: `gemini-${index + 1}`,
      code: String(line.code || ''),
      sourceLine,
      descriptionOriginal: sourceLine,
      quantityCellRaw: String(line.quantityCellRaw || ''),
      invoiceQuantity,
      packageQty: invoiceQuantity,
      packSize,
      units,
      contentMl: ml,
      alcoholDegree: degree,
      unitPriceNet: Math.max(0, Math.round(number(line.unitPriceNet))),
      discountPct: Math.max(0, number(line.discountPct)),
      netLineTotal,
      freightLine,
      vatLine,
      additionalTaxLine,
      otherLineCharges,
      grossLineTotal,
      grossPackPrice,
      grossUnitPrice,
      productId: product?.productId || '',
      suggestedProductId: !product && candidate?.productId ? String(candidate.productId) : '',
      description: product?.description || sourceLine,
      receivedOrderQty: Number(receivedOrderQty.toFixed(3)),
      confidence: Math.max(0, Math.min(1, Math.max(number(line.matchConfidence), matched.score || 0))),
      matchMethod: matched.method,
      matchScore: Number((matched.score || 0).toFixed(4)),
      matchReason: String(line.matchReason || matched.reason || ''),
      notes: String(line.notes || ''),
      engine: 'gemini'
    };
  }).filter(line => line.sourceLine || line.invoiceQuantity || line.netLineTotal || line.grossLineTotal);

  distributeResidual(lines, totals.total);
  for (const line of lines) {
    line.grossUnitPrice = line.units ? Math.round(line.grossLineTotal / line.units) : 0;
    line.grossPackPrice = line.invoiceQuantity ? Math.round(line.grossLineTotal / line.invoiceQuantity) : 0;
  }

  const lineGross = lines.reduce((sum, line) => sum + line.grossLineTotal, 0);
  if (totals.total && lineGross && Math.abs(lineGross - totals.total) > 2) {
    warnings.push(`La suma final de líneas (${lineGross}) no coincide con el total de la factura (${totals.total}).`);
  }
  if (!lines.length) warnings.push('Gemini no detectó líneas de productos en el documento.');

  const matchedCount = lines.filter(line => line.productId).length;
  const unmatchedCount = lines.length - matchedCount;
  return {
    supplierName: String(raw.supplierName || ''),
    supplierRut: String(raw.supplierRut || ''),
    invoiceNumber: String(raw.invoiceNumber || ''),
    invoiceDate: String(raw.invoiceDate || ''),
    currency: String(raw.currency || 'CLP'),
    totals,
    lines,
    matchSummary: {matched: matchedCount, unmatched: unmatchedCount, totalInvoiceLines: lines.length},
    warnings: [...new Set(warnings.filter(Boolean))],
    rawText: JSON.stringify(raw)
  };
}

async function analyze(request, env, origin) {
  if (!env.GEMINI_API_KEY) return json({ok: false, error: 'GEMINI_API_KEY no está configurada en el Worker', code: 'missing_api_key'}, 503, origin);
  const form = await request.formData();
  const file = form.get('file');
  const orderFile = form.get('orderFile');
  if (!(file instanceof File)) return json({ok: false, error: 'Debes adjuntar una imagen o PDF', code: 'missing_file'}, 400, origin);
  if (file.size > MAX_FILE_BYTES) return json({ok: false, error: 'La factura supera el máximo seguro de 12 MB', code: 'file_too_large'}, 413, origin);
  if (orderFile instanceof File && orderFile.size > 3 * 1024 * 1024) return json({ok: false, error: 'El PDF del pedido supera 3 MB', code: 'order_file_too_large'}, 413, origin);
  if (file.size + (orderFile instanceof File ? orderFile.size : 0) > MAX_COMBINED_BYTES) {
    return json({ok: false, error: 'Factura y pedido superan el máximo combinado de 16 MB', code: 'combined_too_large'}, 413, origin);
  }
  let context = {};
  try { context = JSON.parse(String(form.get('context') || '{}')); }
  catch { return json({ok: false, error: 'Contexto de pedido inválido', code: 'invalid_context'}, 400, origin); }

  const invoiceMime = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'image/jpeg');
  if (!/^image\//.test(invoiceMime) && invoiceMime !== 'application/pdf') {
    return json({ok: false, error: 'Formato no compatible. Usa imagen o PDF.', code: 'unsupported_type'}, 415, origin);
  }
  const invoiceData = toBase64(await file.arrayBuffer());
  let orderData = '';
  let orderMime = 'application/pdf';
  if (orderFile instanceof File) {
    orderMime = orderFile.type || 'application/pdf';
    orderData = toBase64(await orderFile.arrayBuffer());
  }
  const result = await callWithFallbacks(env, invoiceMime, invoiceData, orderMime, orderData, context);
  return json({ok: true, model: result.model, usage: result.usage, comparedOrderPdf: !!orderData, invoice: validateInvoice(result.data, context)}, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (!origin) return json({ok: false, error: 'Origen no autorizado'}, 403, 'null');
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: corsHeaders(origin)});
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      const base = {ok: true, service: 'pedidos-pro-ai', geminiConfigured: !!env.GEMINI_API_KEY, model: env.GEMINI_MODEL || DEFAULT_MODEL};
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
