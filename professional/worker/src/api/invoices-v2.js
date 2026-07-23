import {
  HttpError,
  ROLES,
  assertMinimumRole,
  integer,
  nowIso,
  number,
  optionalText,
  readJson,
  requireText,
  uuid
} from '../core.js';
import {writeAudit} from '../auth.js';
import {linkExistingFile, recordSnapshot} from '../storage.js';

function locationAllowed(actor, locationId) {
  return actor.locationScope?.includes?.('*') || actor.locationScope?.includes?.(locationId);
}

function freeSignal(raw = {}) {
  const description = String(raw.sourceDescription || raw.sourceLine || raw.descriptionOriginal || raw.description || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const explicit = raw.isFree === true || raw.isFree === 1 || String(raw.isFree).toLowerCase() === 'true';
  const discount = Number(raw.discountPct || 0) >= 99.5;
  const zeroValue = Number(raw.units ?? raw.totalUnits ?? 0) > 0 && Number(raw.grossLineTotal || 0) === 0 && Number(raw.netLineTotal || 0) === 0;
  const keyword = /\b(SIN CARGO|BONIFICACION|BONIF|GRATIS|MUESTRA|PROMOCIONAL|CORTESIA)\b/.test(description);
  return explicit || discount || zeroValue || keyword;
}

export async function createInvoiceV2(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.RECEIVER);
  const body = await readJson(request);
  const supplierId = String(body.supplierId || '');
  const supplier = await env.DB.prepare('SELECT id, name FROM suppliers WHERE id = ? AND org_id = ? AND active = 1')
    .bind(supplierId, actor.orgId).first();
  if (!supplier) throw new HttpError(400, 'Proveedor inválido', 'invalid_supplier');
  const invoiceNumber = requireText(body.invoiceNumber, 'Número de documento', {max: 80});
  const documentType = optionalText(body.documentType || '33', {max: 10});
  const invoiceDate = requireText(body.invoiceDate, 'Fecha del documento', {max: 20});
  const duplicate = await env.DB.prepare(`
    SELECT id FROM invoices WHERE org_id = ? AND supplier_id = ? AND document_type = ? AND invoice_number = ?
  `).bind(actor.orgId, supplierId, documentType, invoiceNumber).first();
  if (duplicate) throw new HttpError(409, 'Este documento ya fue registrado', 'duplicate_invoice');
  const sourceLines = Array.isArray(body.lines) ? body.lines : [];
  if (!sourceLines.length) throw new HttpError(400, 'El documento no contiene líneas', 'empty_invoice');
  if (sourceLines.length > 1000) throw new HttpError(400, 'El documento supera 1.000 líneas', 'too_many_items');
  const totals = body.totals || {};
  const orderIds = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map(String).filter(Boolean))];
  const locationIds = new Set();
  if (!orderIds.length) {
    const locationId=String(body.locationId||'');
    const location=await env.DB.prepare('SELECT id FROM locations WHERE id = ? AND org_id = ? AND active = 1').bind(locationId,actor.orgId).first();
    if (!location || !locationAllowed(actor,location.id)) throw new HttpError(400,'Selecciona un local válido','invalid_location');
    locationIds.add(location.id);
  }
  const invoiceId = uuid();
  const timestamp = nowIso();
  const statements = [env.DB.prepare(`
    INSERT INTO invoices
      (id, org_id, supplier_id, invoice_number, document_type, invoice_date, currency,
       net_total, tax_total, additional_tax_total, freight_total, gross_total, status,
       ai_model, ai_confidence, reviewed_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'review', ?, ?, ?, ?, ?)
  `).bind(
    invoiceId, actor.orgId, supplierId, invoiceNumber, documentType, invoiceDate,
    optionalText(body.currency || 'CLP', {max: 10}),
    integer(totals.net, {min: 0, max: 9999999999}),
    integer(totals.vat ?? totals.tax, {min: 0, max: 9999999999}),
    integer(totals.additionalTax, {min: 0, max: 9999999999}),
    integer(totals.freight, {min: 0, max: 9999999999}),
    integer(totals.total, {min: 0, max: 9999999999}),
    optionalText(body.aiModel, {max: 100}),
    number(body.aiConfidence, {min: 0, max: 1}), actor.userId, timestamp, timestamp
  )];
  let freeLineCount = 0;
  for (const [index, raw] of sourceLines.entries()) {
    const lineId = uuid();
    const productId = raw.productId ? String(raw.productId) : null;
    if (productId) {
      const product = await env.DB.prepare('SELECT id FROM products WHERE id = ? AND org_id = ?').bind(productId, actor.orgId).first();
      if (!product) throw new HttpError(400, `Producto inválido en línea ${index + 1}`, 'invalid_product');
    }
    const isFree = freeSignal(raw);
    if (isFree) freeLineCount += 1;
    const totalUnits = number(raw.units ?? raw.totalUnits, {min: 0, max: 10000000});
    const grossLineTotal = isFree ? 0 : integer(raw.grossLineTotal, {min: 0, max: 9999999999});
    const grossUnitPrice = isFree ? 0 : integer(raw.grossUnitPrice || (totalUnits ? grossLineTotal / totalUnits : 0), {min: 0, max: 999999999});
    const reviewStatus = productId ? (isFree ? 'free-confirmed' : 'confirmed') : (isFree ? 'free-unmatched' : 'unmatched');
    const freeReason = isFree ? optionalText(raw.freeReason || raw.notes || 'Producto sin cargo o bonificado', {max: 240}) : '';
    statements.push(env.DB.prepare(`
      INSERT INTO invoice_lines
        (id, invoice_id, supplier_product_id, product_id, source_description, supplier_sku,
         package_quantity, units_per_package, total_units, net_line_total, tax_line_total,
         additional_tax_line_total, gross_line_total, gross_unit_price, match_confidence,
         match_method, review_status, is_free, free_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      lineId, invoiceId, raw.supplierProductId || null, productId,
      requireText(raw.sourceDescription || raw.sourceLine || raw.descriptionOriginal || raw.description, `Descripción línea ${index + 1}`, {max: 500}),
      optionalText(raw.supplierSku || raw.code, {max: 100}),
      number(raw.packageQty ?? raw.invoiceQuantity, {min: 0, max: 1000000}),
      number(raw.packSize, {min: 0.001, max: 100000, fallback: 1}), totalUnits,
      isFree ? 0 : integer(raw.netLineTotal, {min: 0, max: 9999999999}),
      isFree ? 0 : integer(raw.vatLine ?? raw.taxLineTotal, {min: 0, max: 9999999999}),
      isFree ? 0 : integer(raw.additionalTaxLine ?? raw.additionalTaxLineTotal, {min: 0, max: 9999999999}),
      grossLineTotal, grossUnitPrice,
      number(raw.confidence ?? raw.matchConfidence, {min: 0, max: 1}),
      optionalText(raw.matchMethod || 'manual-review', {max: 80}), reviewStatus, isFree ? 1 : 0, freeReason, timestamp, timestamp
    ));
    if (productId && grossUnitPrice > 0 && !isFree) {
      statements.push(env.DB.prepare(`
        INSERT INTO price_history (id, org_id, supplier_id, product_id, invoice_id, gross_unit_price, currency, observed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(uuid(), actor.orgId, supplierId, productId, invoiceId, grossUnitPrice, optionalText(body.currency || 'CLP', {max: 10}), invoiceDate, timestamp));
      statements.push(env.DB.prepare(`
        UPDATE supplier_products SET last_gross_unit_price = ?, last_purchased_at = ?, updated_at = ?
        WHERE org_id = ? AND supplier_id = ? AND product_id = ?
      `).bind(grossUnitPrice, invoiceDate, timestamp, actor.orgId, supplierId, productId));
    }
  }
  for (const orderId of orderIds) {
    const order = await env.DB.prepare('SELECT id, location_id FROM orders WHERE id = ? AND org_id = ? AND supplier_id = ?')
      .bind(orderId, actor.orgId, supplierId).first();
    if (!order || !locationAllowed(actor,order.location_id)) throw new HttpError(400, 'Pedido relacionado inválido', 'invalid_order');
    locationIds.add(order.location_id);
    statements.push(env.DB.prepare(`INSERT INTO invoice_order_links (id, org_id, invoice_id, order_id, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(uuid(), actor.orgId, invoiceId, orderId, timestamp));
  }
  for (const locationId of locationIds) {
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO invoice_location_links (invoice_id, org_id, location_id, created_at) VALUES (?, ?, ?, ?)').bind(invoiceId,actor.orgId,locationId,timestamp));
  }
  await env.DB.batch(statements);
  if (body.sourceFileId) {
    await env.DB.prepare('UPDATE invoices SET pdf_file_id = ?, updated_at = ? WHERE id = ? AND org_id = ?').bind(String(body.sourceFileId), nowIso(), invoiceId, actor.orgId).run();
    await linkExistingFile(env, actor, {fileId: String(body.sourceFileId), entityType: 'invoice', entityId: invoiceId, documentKind: 'invoice_original', revision: 1, metadata: {invoiceNumber,documentType,freeLineCount}});
  }
  await recordSnapshot(env, actor, {entityType: 'invoice', entityId: invoiceId, locationId: [...locationIds][0] || null, revision: 1, snapshot: {...body, id: invoiceId, supplierName: supplier.name, locationIds:[...locationIds],freeLineCount}});
  await writeAudit(env, actor, request, 'invoice.create', 'invoice', invoiceId, {supplierId, invoiceNumber, documentType, lines: sourceLines.length, freeLineCount, orderIds});
  return {id: invoiceId, supplierId, supplierName: supplier.name, invoiceNumber, documentType, invoiceDate, status: 'review', grossTotal: integer(totals.total, {min: 0}), lineCount: sourceLines.length, freeLineCount};
}
