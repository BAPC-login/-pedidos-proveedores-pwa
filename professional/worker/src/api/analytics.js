import {HttpError, ROLES, assertMinimumRole, nowIso} from '../core.js';
import {writeAudit} from '../auth.js';

function rows(result) {
  return result?.results || [];
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function monthKey(value) {
  return String(value || '').slice(0, 7);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length);
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function startDateForMonths(months) {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCMonth(date.getUTCMonth() - months + 1);
  return date.toISOString().slice(0, 10);
}

function monthSeries(months) {
  const values = [];
  const current = new Date();
  current.setUTCDate(1);
  current.setUTCHours(0, 0, 0, 0);
  for (let offset = months - 1; offset >= 0; offset--) {
    const date = new Date(current);
    date.setUTCMonth(date.getUTCMonth() - offset);
    values.push(date.toISOString().slice(0, 7));
  }
  return values;
}

function recommendationsFor(analytics) {
  const recommendations = [];
  const {metrics, descriptive, topSuppliers, monthly, dataQuality} = analytics;
  if (!metrics.invoiceCount) {
    recommendations.push({priority: 'high', title: 'Cargar facturas para medir costos reales', detail: 'El tablero solo puede estimar compras desde pedidos mientras no existan facturas cotejadas.'});
  }
  if (metrics.pendingRate >= 0.35) {
    recommendations.push({priority: 'high', title: 'Reducir pedidos pendientes', detail: `${round(metrics.pendingRate * 100)}% de los pedidos del período sigue pendiente. Revisa aprobaciones, envíos y confirmaciones.`});
  }
  if (metrics.cancelledRate >= 0.12) {
    recommendations.push({priority: 'medium', title: 'Revisar causas de anulación', detail: `${round(metrics.cancelledRate * 100)}% de los pedidos fue anulado. Conviene separar errores de carga, falta de stock y cambios operativos.`});
  }
  const leader = topSuppliers[0];
  if (leader && leader.share >= 0.55) {
    recommendations.push({priority: 'medium', title: 'Alta concentración en un proveedor', detail: `${leader.name} representa ${round(leader.share * 100)}% del gasto medido. Evalúa alternativas y condiciones comerciales.`});
  }
  if (monthly.length >= 2) {
    const previous = monthly[monthly.length - 2]?.spend || 0;
    const current = monthly[monthly.length - 1]?.spend || 0;
    if (previous > 0 && current > previous * 1.2) {
      recommendations.push({priority: 'medium', title: 'Aumento relevante del gasto', detail: `El gasto del mes actual subió ${round((current / previous - 1) * 100)}% respecto del mes anterior.`});
    }
  }
  if (descriptive.coefficientOfVariation >= 0.8 && metrics.invoiceCount >= 4) {
    recommendations.push({priority: 'low', title: 'Montos de factura muy variables', detail: 'La dispersión es alta. Se recomienda analizar por proveedor y categoría para detectar compras extraordinarias.'});
  }
  if (dataQuality.productsWithoutPrice > 0) {
    recommendations.push({priority: 'medium', title: 'Completar precios faltantes', detail: `${dataQuality.productsWithoutPrice} relaciones producto–proveedor no tienen precio histórico, por lo que algunos totales de pedido quedan en cero.`});
  }
  if (!recommendations.length) {
    recommendations.push({priority: 'low', title: 'Operación estable', detail: 'No se detectaron alertas relevantes con los datos del período. Mantén el cotejo de facturas y cierre de estados al día.'});
  }
  return recommendations;
}

export async function getDashboardAnalytics(env, actor, url) {
  const months = Math.round(clamp(url.searchParams.get('months'), 1, 24, 6));
  const locationId = String(url.searchParams.get('locationId') || '');
  const supplierId = String(url.searchParams.get('supplierId') || '');
  const costCenterId = String(url.searchParams.get('costCenterId') || '');
  const fromDate = startDateForMonths(months);

  const [orderResult, invoiceResult, categoryResult, priceResult] = await Promise.all([
    env.DB.prepare(`
      SELECT o.id, o.status, o.created_at, o.gross_total, o.location_id, o.supplier_id,
        s.name AS supplier_name, l.name AS location_name,
        cc.id AS cost_center_id, cc.name AS cost_center_name
      FROM orders o
      JOIN suppliers s ON s.id = o.supplier_id
      JOIN locations l ON l.id = o.location_id
      LEFT JOIN order_cost_centers occ ON occ.order_id = o.id
      LEFT JOIN cost_centers cc ON cc.id = occ.cost_center_id
      WHERE o.org_id = ? AND date(o.created_at) >= date(?)
        AND (? = '' OR o.location_id = ?)
        AND (? = '' OR o.supplier_id = ?)
        AND (? = '' OR occ.cost_center_id = ?)
      ORDER BY o.created_at
    `).bind(actor.orgId, fromDate, locationId, locationId, supplierId, supplierId, costCenterId, costCenterId).all(),
    env.DB.prepare(`
      SELECT i.id, i.invoice_date, i.gross_total, i.supplier_id, s.name AS supplier_name,
        GROUP_CONCAT(DISTINCT il.location_id) AS location_ids
      FROM invoices i
      JOIN suppliers s ON s.id = i.supplier_id
      LEFT JOIN invoice_location_links il ON il.invoice_id = i.id
      WHERE i.org_id = ? AND date(i.invoice_date) >= date(?) AND i.status != 'void'
        AND (? = '' OR i.supplier_id = ?)
      GROUP BY i.id
      ORDER BY i.invoice_date
    `).bind(actor.orgId, fromDate, supplierId, supplierId).all(),
    env.DB.prepare(`
      SELECT COALESCE(c.name, 'Sin categoría') AS category_name,
        COALESCE(SUM(il.gross_line_total), 0) AS spend
      FROM invoice_lines il
      JOIN invoices i ON i.id = il.invoice_id
      LEFT JOIN products p ON p.id = il.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE i.org_id = ? AND date(i.invoice_date) >= date(?) AND i.status != 'void'
        AND (? = '' OR i.supplier_id = ?)
        AND (? = '' OR EXISTS (
          SELECT 1 FROM invoice_location_links ill WHERE ill.invoice_id = i.id AND ill.location_id = ?
        ))
      GROUP BY COALESCE(c.name, 'Sin categoría')
      ORDER BY spend DESC
      LIMIT 12
    `).bind(actor.orgId, fromDate, supplierId, supplierId, locationId, locationId).all(),
    env.DB.prepare(`
      SELECT COUNT(*) AS total FROM supplier_products
      WHERE org_id = ? AND active = 1 AND last_gross_unit_price <= 0
    `).bind(actor.orgId).first()
  ]);

  const orders = rows(orderResult);
  const invoices = rows(invoiceResult).filter(invoice => {
    if (!locationId) return true;
    return String(invoice.location_ids || '').split(',').includes(locationId);
  });
  const invoiceValues = invoices.map(invoice => Number(invoice.gross_total || 0)).filter(value => value > 0);
  const orderValues = orders.map(order => Number(order.gross_total || 0)).filter(value => value > 0);
  const statusCounts = {};
  orders.forEach(order => { statusCounts[order.status] = (statusCounts[order.status] || 0) + 1; });
  const pendingStatuses = new Set(['requested', 'approved', 'sent', 'confirmed', 'partially_received']);
  const pending = orders.filter(order => pendingStatuses.has(order.status)).length;
  const cancelled = orders.filter(order => order.status === 'cancelled').length;
  const received = orders.filter(order => ['received', 'reconciled', 'closed'].includes(order.status)).length;
  const spend = invoiceValues.reduce((sum, value) => sum + value, 0);
  const estimatedSpend = orderValues.reduce((sum, value) => sum + value, 0);

  const supplierMap = new Map();
  const supplierSource = invoices.length ? invoices.map(invoice => ({...invoice, value: Number(invoice.gross_total || 0)})) : orders.map(order => ({...order, value: Number(order.gross_total || 0)}));
  supplierSource.forEach(row => {
    const current = supplierMap.get(row.supplier_id) || {id: row.supplier_id, name: row.supplier_name, spend: 0, documents: 0};
    current.spend += row.value;
    current.documents += 1;
    supplierMap.set(row.supplier_id, current);
  });
  const supplierTotal = [...supplierMap.values()].reduce((sum, item) => sum + item.spend, 0);
  const topSuppliers = [...supplierMap.values()]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 10)
    .map(item => ({...item, share: supplierTotal ? item.spend / supplierTotal : 0}));

  const monthMap = new Map(monthSeries(months).map(month => [month, {month, orders: 0, spend: 0, estimatedSpend: 0}]));
  orders.forEach(order => {
    const item = monthMap.get(monthKey(order.created_at));
    if (item) { item.orders += 1; item.estimatedSpend += Number(order.gross_total || 0); }
  });
  invoices.forEach(invoice => {
    const item = monthMap.get(monthKey(invoice.invoice_date));
    if (item) item.spend += Number(invoice.gross_total || 0);
  });
  const monthly = [...monthMap.values()];

  const average = mean(invoiceValues);
  const deviation = standardDeviation(invoiceValues);
  const analytics = {
    generatedAt: nowIso(),
    filters: {months, locationId, supplierId, costCenterId, fromDate},
    metrics: {
      orders: orders.length,
      pending,
      received,
      cancelled,
      invoiceCount: invoices.length,
      spend,
      estimatedSpend,
      averageOrder: mean(orderValues),
      averageInvoice: average,
      pendingRate: orders.length ? pending / orders.length : 0,
      cancelledRate: orders.length ? cancelled / orders.length : 0,
      completionRate: orders.length ? received / orders.length : 0,
      suppliersUsed: supplierMap.size
    },
    descriptive: {
      count: invoiceValues.length,
      mean: round(average),
      median: round(median(invoiceValues)),
      minimum: invoiceValues.length ? Math.min(...invoiceValues) : 0,
      maximum: invoiceValues.length ? Math.max(...invoiceValues) : 0,
      standardDeviation: round(deviation),
      coefficientOfVariation: average ? round(deviation / average, 3) : 0
    },
    statusBreakdown: Object.entries(statusCounts).map(([status, total]) => ({status, total})),
    monthly,
    topSuppliers,
    categorySpend: rows(categoryResult).map(row => ({category: row.category_name, spend: Number(row.spend || 0)})),
    dataQuality: {productsWithoutPrice: Number(priceResult?.total || 0)}
  };
  analytics.recommendations = recommendationsFor(analytics);
  return analytics;
}

export async function getAiDashboardInsights(request, env, actor, url) {
  assertMinimumRole(actor.role, ROLES.READONLY);
  const analytics = await getDashboardAnalytics(env, actor, url);
  const endpoint = String(env.AI_ENDPOINT || 'https://pedidos-pro-ai.botreservasmultilocal.workers.dev').replace(/\/$/, '');
  let ai = null;
  let aiError = '';
  try {
    const response = await fetch(`${endpoint}/v1/analytics/recommend`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Pedidos-Client': 'professional-v3'},
      body: JSON.stringify({organization: actor.organization?.name || '', analytics})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'La IA no pudo generar recomendaciones');
    ai = {model: payload.model, recommendations: payload.recommendations || [], summary: payload.summary || ''};
  } catch (error) {
    aiError = String(error.message || error);
  }
  await writeAudit(env, actor, request, 'dashboard.ai_insights', 'analytics', actor.orgId, {
    months: analytics.filters.months,
    generated: Boolean(ai),
    error: aiError
  });
  return {analytics, ai, aiError, fallbackRecommendations: analytics.recommendations};
}
