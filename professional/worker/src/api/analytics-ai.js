import {HttpError, ROLES, assertMinimumRole} from '../core.js';
import {writeAudit} from '../auth.js';
import {getDashboardAnalytics} from './analytics.js';

const DEFAULT_MODEL = 'gemini-3.5-flash';
const FALLBACK_MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash'];
const TIMEOUT_MS = 45000;

const responseSchema = {
  type: 'OBJECT',
  properties: {
    summary: {type: 'STRING'},
    recommendations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          priority: {type: 'STRING'},
          title: {type: 'STRING'},
          detail: {type: 'STRING'},
          action: {type: 'STRING'}
        },
        required: ['priority', 'title', 'detail', 'action']
      }
    }
  },
  required: ['summary', 'recommendations']
};

function promptFor(organization, analytics) {
  const compact = {
    filters: analytics.filters,
    metrics: analytics.metrics,
    descriptive: analytics.descriptive,
    monthly: analytics.monthly,
    topSuppliers: analytics.topSuppliers,
    categorySpend: analytics.categorySpend,
    statusBreakdown: analytics.statusBreakdown,
    dataQuality: analytics.dataQuality
  };
  return `Actúa como analista senior de abastecimiento para ${organization || 'la empresa'}.
Analiza exclusivamente estos datos de compras y pedidos: ${JSON.stringify(compact)}.
Entrega un resumen ejecutivo breve y entre 3 y 6 recomendaciones concretas, priorizadas y aplicables.
No inventes causas ni cifras. Si faltan facturas o precios, dilo expresamente.
priority debe ser high, medium o low. action debe indicar el siguiente paso operativo.`;
}

async function callModel(env, model, organization, analytics) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: {'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY},
      body: JSON.stringify({
        contents: [{role: 'user', parts: [{text: promptFor(organization, analytics)}]}],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema,
          maxOutputTokens: 2048
        }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
    if (!text) throw new Error('Gemini no devolvió recomendaciones');
    return {model, usage: payload.usageMetadata || null, ...JSON.parse(text)};
  } finally {
    clearTimeout(timeout);
  }
}

export async function getGeminiDashboardInsights(request, env, actor, url) {
  assertMinimumRole(actor.role, ROLES.READONLY);
  if (!env.GEMINI_API_KEY) throw new HttpError(503, 'Gemini no está configurado', 'missing_api_key');
  const analytics = await getDashboardAnalytics(env, actor, url);
  const models = [env.GEMINI_MODEL || DEFAULT_MODEL, ...FALLBACK_MODELS]
    .filter((value, index, list) => value && list.indexOf(value) === index);
  const attempts = [];
  let result = null;
  for (const model of models) {
    try {
      result = await callModel(env, model, actor.organization?.name || '', analytics);
      break;
    } catch (error) {
      attempts.push({model, error: String(error.message || error), status: error.status || 0});
      if (error.status && error.status < 500 && ![400, 404].includes(error.status)) break;
    }
  }
  if (!result) throw new HttpError(502, 'Gemini no pudo generar el análisis', 'gemini_failed', attempts);
  await writeAudit(env, actor, request, 'dashboard.gemini_insights', 'analytics', actor.orgId, {
    model: result.model,
    months: analytics.filters.months,
    recommendations: result.recommendations?.length || 0
  });
  return {analytics, ai: result};
}
