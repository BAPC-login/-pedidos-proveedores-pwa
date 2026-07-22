var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../../../.npm/_npx/1f00c3a32ed96620/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");

// ../../../../.npm/_npx/1f00c3a32ed96620/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// ../../../../.npm/_npx/1f00c3a32ed96620/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// src/index.js
var DEFAULT_MODEL = "gemini-3.5-flash";
var FALLBACK_MODELS = ["gemini-3.1-flash-lite", "gemini-2.5-flash"];
var MAX_INVOICE_BYTES = 12 * 1024 * 1024;
var MAX_ORDER_BYTES = 3 * 1024 * 1024;
var MAX_COMBINED_BYTES = 16 * 1024 * 1024;
var GEMINI_TIMEOUT_MS = 72e3;
var STOP_WORDS = /* @__PURE__ */ new Set([
  "DE",
  "DEL",
  "LA",
  "LAS",
  "EL",
  "LOS",
  "Y",
  "CON",
  "SIN",
  "UN",
  "UNA",
  "UND",
  "UNID",
  "UNIDAD",
  "UNIDADES",
  "CAJA",
  "CAJAS",
  "BOT",
  "BOTELLA",
  "BOTELLAS",
  "BEB",
  "BEBIDA",
  "BEBIDAS",
  "PROD",
  "PRODUCTO",
  "PACK",
  "FORMATO",
  "VID",
  "VIDRIO",
  "VNR",
  "PET",
  "DISPLAY",
  "RETORNABLE",
  "RET",
  "TR",
  "TAPA",
  "ROSCA",
  "LICOR",
  "PISCO",
  "WHIS",
  "WHISKY",
  "GIN",
  "TEQUILA",
  "VODKA",
  "RON",
  "CERVEZA",
  "BEBESTIBLE"
]);
var CHARGE_WORDS = [
  "FLETE",
  "FLETES",
  "DESPACHO",
  "TRANSPORTE",
  "MERCADERIAS",
  "RECARGO",
  "SUBTOTAL",
  "TOTAL",
  "NETO",
  "IVA",
  "I V A",
  "IABA",
  "I B A",
  "IMPUESTO",
  "ADICIONAL",
  "DESCUENTO",
  "DEPOSITO",
  "GARANTIA",
  "CUOTA"
];
var corsHeaders = /* @__PURE__ */ __name((origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Pedidos-Client",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin"
}), "corsHeaders");
function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "https://bapc-login.github.io,http://localhost:8788,http://127.0.0.1:8788").split(",").map((value) => value.trim()).filter(Boolean);
  if (!origin) return allowed[0] || "*";
  return allowed.some((value) => origin === value || origin.startsWith(`${value}:`)) ? origin : "";
}
__name(allowedOrigin, "allowedOrigin");
function json(payload, status = 200, origin = "*") {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(origin) }
  });
}
__name(json, "json");
function numeric(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let text = String(value ?? "").trim().replace(/\s/g, "").replace(/\$/g, "");
  if (!text) return 0;
  if (text.includes(",") && text.includes(".")) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(/,/g, "");
  } else if (text.includes(",")) text = text.replace(",", ".");
  else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}
__name(numeric, "numeric");
function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/×/g, "X").replace(/[^A-Z0-9.,%°X]+/g, " ").replace(/\s+/g, " ").trim();
}
__name(normalize, "normalize");
function expandAbbreviations(value) {
  return normalize(value).replace(/\bS\s*[/.-]?\s*AZ(?:UCAR)?\b/g, " SIN AZUCAR ").replace(/\bZERO\b|\bLIGHT\b|\bSUGAR FREE\b/g, " SIN AZUCAR ").replace(/\bESP(?:EC)?\.?\b/g, " ESPECIAL ").replace(/\bTRANSP(?:ARENTE)?\.?\b|\bTRANS\.?\b/g, " TRANSPARENTE ").replace(/\bNOB\.?\b/g, " NOBEL ").replace(/\bJW\b|\bJOHNNIE\b/g, " JOHNNIE WALKER ").replace(/\bCOCA\s+COLA\s+SIN\s+AZUCAR\b/g, " COCA COLA ZERO ").replace(/\s+/g, " ").trim();
}
__name(expandAbbreviations, "expandAbbreviations");
function contentMl(value) {
  const text = expandAbbreviations(value);
  const matches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(ML|CC|LTS?|LT|LITROS?)/g)];
  if (matches.length) {
    const match = matches[matches.length - 1];
    const amount = Number(match[1].replace(",", ".")) || 0;
    if (/^(L|LT|LTS|LITRO)/.test(match[2])) {
      if (amount >= 20 && amount <= 60 && /\bLITRO\b/.test(text)) return 1e3;
      return Math.round(amount * 1e3);
    }
    return Math.round(amount);
  }
  if (/\b1[.,]5\b/.test(text)) return 1500;
  if (/\bLITRO\b|\b1L\b/.test(text)) return 1e3;
  const standalone = text.match(/(?:^|\s)(250|330|350|500|600|700|750|900|1000|1500|2000)(?=\s|$)/);
  return standalone ? Number(standalone[1]) : 0;
}
__name(contentMl, "contentMl");
function alcoholDegree(value) {
  const text = expandAbbreviations(value).replace(/\d+(?:[.,]\d+)?\s*(?:ML|CC|LTS?|LT|LITROS?)/g, " ").replace(/(?:^|\s)\d{1,3}\s*X\s*\d{2,4}(?=\s*(?:ML|CC))/g, " ").replace(/(?:ML|CC)\s*X\s*0?\d{1,3}/g, " ");
  const explicit = text.match(/(?:^|\s)(\d{2}(?:[.,]\d)?)\s*(?:GL|GRADOS?|°)(?=\s|$)/);
  if (explicit) return Number(explicit[1].replace(",", ".")) || 0;
  const values = [...text.matchAll(/(?:^|\s)(\d{2}(?:[.,]\d)?)(?=\s|$)/g)].map((match) => Number(match[1].replace(",", "."))).filter((number2) => number2 >= 15 && number2 <= 60);
  return values[0] || 0;
}
__name(alcoholDegree, "alcoholDegree");
function isOnePointFive(value) {
  const ml = contentMl(value);
  return ml >= 1450 && ml <= 1550;
}
__name(isOnePointFive, "isOnePointFive");
function orderPackSize(unit, description = "") {
  const label = normalize(unit);
  const parenthesized = String(unit || "").match(/\((\d+)\)/);
  if (parenthesized) return Math.max(1, Number(parenthesized[1]) || 1);
  if (label.includes("DISPLAY")) return isOnePointFive(description) ? 6 : 24;
  return 1;
}
__name(orderPackSize, "orderPackSize");
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
__name(explicitPackFromDescription, "explicitPackFromDescription");
function parseQuantityCell(raw, fallback = 0) {
  const text = String(raw || "").trim();
  if (!text) return Math.max(0, numeric(fallback));
  const normalized = text.replace(",", ".");
  const fractionLike = normalized.match(/^\s*(\d+(?:\.\d+)?)\s*[/\-]\s*0+(?:\.0+)?\s*$/);
  if (fractionLike) return Math.max(0, Number(fractionLike[1]) || 0);
  const first = normalized.match(/\d+(?:\.\d+)?/);
  return first ? Math.max(0, Number(first[0]) || 0) : Math.max(0, numeric(fallback));
}
__name(parseQuantityCell, "parseQuantityCell");
function isChargeLine(value) {
  const text = expandAbbreviations(value);
  if (!text) return false;
  const productSignals = ["COCA", "FANTA", "MISTRAL", "RAMAZZOTTI", "OLMECA", "KAHLUA", "TANQUERAY", "WALKER", "CARMEN"];
  if (productSignals.some((word) => text.includes(word))) return false;
  return CHARGE_WORDS.some((word) => text === word || text.startsWith(`${word} `) || text.includes(` ${word} `));
}
__name(isChargeLine, "isChargeLine");
function stripped(value) {
  return expandAbbreviations(value).replace(/\d+(?:[.,]\d+)?\s*(?:ML|CC|LTS?|LT|LITROS?)/g, " ").replace(/(?:^|\s)\d{1,3}\s*X\s*\d{2,4}(?=\s*(?:ML|CC))/g, " ").replace(/(?:ML|CC)\s*X\s*0?\d{1,3}/g, " ").replace(/(?:^|\s)X\s*0?\d{1,3}(?=\s|$)/g, " ").replace(/\b\d{2}(?:[.,]\d)?\s*(?:GL|GRADOS?|°)?\b/g, " ").replace(/\b(?:VNR|VID|VIDRIO|PET|RETORNABLE|RET|TR|BOT|BOTELLA|BOTELLAS|CAJA|CAJAS|PACK|DISPLAY)\b/g, " ").replace(/\s+/g, " ").trim();
}
__name(stripped, "stripped");
function tokens(value) {
  return stripped(value).split(" ").filter((token) => token.length > 1 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));
}
__name(tokens, "tokens");
function tokenSimilarity(left, right) {
  if (left === right) return 1;
  if (left.length >= 3 && right.length >= 3 && (left.startsWith(right) || right.startsWith(left))) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length) * 0.92 + 0.08;
  }
  const a = new Set(left), b = new Set(right);
  let overlap = 0;
  for (const char of a) if (b.has(char)) overlap++;
  return overlap / Math.max(a.size, b.size, 1) * 0.55;
}
__name(tokenSimilarity, "tokenSimilarity");
function trigramSet(value) {
  const compact = stripped(value).replace(/\s/g, "");
  const set = /* @__PURE__ */ new Set();
  if (compact.length < 3) {
    if (compact) set.add(compact);
    return set;
  }
  for (let index = 0; index <= compact.length - 3; index++) set.add(compact.slice(index, index + 3));
  return set;
}
__name(trigramSet, "trigramSet");
function trigramSimilarity(left, right) {
  const a = trigramSet(left), b = trigramSet(right);
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const gram of a) if (b.has(gram)) hits++;
  return hits / (/* @__PURE__ */ new Set([...a, ...b])).size;
}
__name(trigramSimilarity, "trigramSimilarity");
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
__name(variantFlags, "variantFlags");
function variantAdjustment(source, product) {
  const a = variantFlags(source), b = variantFlags(product);
  let score = 0;
  const exclusive = [["zero", "normal"], ["black", "red"]];
  for (const [left, right] of exclusive) {
    if (a[left] && b[right] || a[right] && b[left]) score -= 0.48;
  }
  for (const key of ["zero", "normal", "transparent", "special", "nobel", "silver", "black", "red"]) {
    if (a[key] && b[key]) score += 0.08;
  }
  return score;
}
__name(variantAdjustment, "variantAdjustment");
function textSimilarity(source, product) {
  const sourceTokens = tokens(source), productTokens = tokens(product);
  if (!sourceTokens.length || !productTokens.length) return 0;
  let productCoverage = 0;
  for (const productToken of productTokens) {
    productCoverage += Math.max(0, ...sourceTokens.map((sourceToken) => tokenSimilarity(sourceToken, productToken)));
  }
  productCoverage /= productTokens.length;
  let sourceCoverage = 0;
  for (const sourceToken of sourceTokens) {
    sourceCoverage += Math.max(0, ...productTokens.map((productToken) => tokenSimilarity(sourceToken, productToken)));
  }
  sourceCoverage /= sourceTokens.length;
  return Math.min(1, productCoverage * 0.56 + sourceCoverage * 0.24 + trigramSimilarity(source, product) * 0.2);
}
__name(textSimilarity, "textSimilarity");
function rankProducts(line, products) {
  const source = line.descriptionOriginal || line.sourceLine || line.description || "";
  const sourceMl = contentMl(source);
  const sourceDegree = alcoholDegree(source);
  const requestedId = String(line.matchedOrderProductId || line.productId || "");
  return (products || []).map((product) => {
    const productMl = contentMl(product.description);
    const productDegree = alcoholDegree(product.description);
    let score = textSimilarity(source, product.description);
    const reasons = [];
    if (sourceMl && productMl) {
      if (sourceMl === productMl) {
        score += 0.22;
        reasons.push("mismo volumen");
      } else {
        score -= 0.42;
        reasons.push(`volumen ${sourceMl} ml vs ${productMl} ml`);
      }
    }
    if (sourceDegree && productDegree) {
      if (Math.abs(sourceDegree - productDegree) <= 1.1) {
        score += 0.04;
        reasons.push("graduaci\xF3n compatible");
      } else {
        score -= 0.07;
        reasons.push(`graduaci\xF3n informativa ${sourceDegree}\xB0 vs ${productDegree}\xB0`);
      }
    }
    score += variantAdjustment(source, product.description);
    if (String(product.productId) === requestedId) {
      score += 0.18;
      reasons.push("selecci\xF3n sugerida por Gemini");
    }
    return { product, score: Math.max(0, Math.min(1, score)), reasons };
  }).sort((a, b) => b.score - a.score);
}
__name(rankProducts, "rankProducts");
function chooseProduct(line, products) {
  const requestedId = String(line.matchedOrderProductId || line.productId || "");
  const ranked = rankProducts(line, products);
  const best = ranked[0] || { product: null, score: 0, reasons: [] };
  const second = ranked[1]?.score || 0;
  const requested = ranked.find((entry) => String(entry.product.productId) === requestedId);
  if (requested && requested.score >= 0.34) {
    return { product: requested.product, candidate: requested.product, score: requested.score, method: "gemini+catalog-validation", reason: requested.reasons.join(", ") };
  }
  const unique = best.score >= 0.47 || best.score >= 0.38 && best.score - second >= 0.08;
  return { product: unique ? best.product : null, candidate: best.product, score: best.score, method: unique ? "catalog-resolver" : "unmatched", reason: best.reasons.join(", ") };
}
__name(chooseProduct, "chooseProduct");
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}
__name(toBase64, "toBase64");
var responseSchema = {
  type: "OBJECT",
  properties: {
    supplierName: { type: "STRING" },
    supplierRut: { type: "STRING" },
    invoiceNumber: { type: "STRING" },
    invoiceDate: { type: "STRING" },
    currency: { type: "STRING" },
    totals: {
      type: "OBJECT",
      properties: { net: { type: "NUMBER" }, freight: { type: "NUMBER" }, additionalTax: { type: "NUMBER" }, vat: { type: "NUMBER" }, other: { type: "NUMBER" }, total: { type: "NUMBER" } },
      required: ["net", "freight", "additionalTax", "vat", "other", "total"]
    },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          code: { type: "STRING" },
          descriptionOriginal: { type: "STRING" },
          quantityCellRaw: { type: "STRING" },
          invoiceQuantity: { type: "NUMBER" },
          packSize: { type: "NUMBER" },
          units: { type: "NUMBER" },
          contentMl: { type: "NUMBER" },
          alcoholDegree: { type: "NUMBER" },
          unitPriceNet: { type: "NUMBER" },
          discountPct: { type: "NUMBER" },
          netLineTotal: { type: "NUMBER" },
          freightLine: { type: "NUMBER" },
          vatLine: { type: "NUMBER" },
          additionalTaxLine: { type: "NUMBER" },
          otherLineCharges: { type: "NUMBER" },
          grossLineTotal: { type: "NUMBER" },
          matchedOrderProductId: { type: "STRING" },
          matchConfidence: { type: "NUMBER" },
          matchReason: { type: "STRING" },
          notes: { type: "STRING" }
        },
        required: ["code", "descriptionOriginal", "quantityCellRaw", "invoiceQuantity", "packSize", "units", "contentMl", "alcoholDegree", "unitPriceNet", "discountPct", "netLineTotal", "freightLine", "vatLine", "additionalTaxLine", "otherLineCharges", "grossLineTotal", "matchedOrderProductId", "matchConfidence", "matchReason", "notes"]
      }
    },
    warnings: { type: "ARRAY", items: { type: "STRING" } }
  },
  required: ["supplierName", "invoiceNumber", "totals", "items", "warnings"]
};
function buildPrompt(context) {
  const products = (context.products || []).map((product) => ({ id: String(product.productId), d: String(product.description), u: String(product.unit || "UNIDAD"), q: numeric(product.orderedQty), pack: orderPackSize(product.unit, product.description) }));
  return `<task>Extrae y coteja factura A contra pedido B y CAT. Responde solo seg\xFAn JSON Schema.</task>
<CAT>${JSON.stringify(products)}</CAT>
<context>proveedor=${String(context.providerName || "")};folio=${String(context.folio || "")}</context>
<rules>
- Una salida por producto. Excluye flete, impuestos, descuentos, dep\xF3sitos, garant\xEDas y totales.
- quantityCellRaw copia Cantidad; invoiceQuantity sale solo de esa celda.
- packSize sale de X06/X6/1000CCX6/6X350CC. units=invoiceQuantity*packSize.
- Match por marca, familia, variante y volumen. Volumen distinto invalida. ESP=ESPECIAL; TRANS=TRANSPARENTE; ZERO=SIN AZUCAR.
- matchedOrderProductId es un id exacto de CAT o vac\xEDo. Nunca inventes.
- DISPLAY=24; 1.5L=6, salvo pack expl\xEDcito.
- Lee neto, descuento, flete, IVA, impuesto adicional, otros y total final por l\xEDnea.
- N\xFAmeros sin s\xEDmbolos. Ilegible=0 y warning breve.
</rules>`;
}
__name(buildPrompt, "buildPrompt");
async function parseGeminiResponse(response, model) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
    error.status = response.status;
    error.model = model;
    throw error;
  }
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  if (!text) throw new Error(`Gemini (${model}) no devolvi\xF3 contenido estructurado`);
  try {
    return { data: JSON.parse(text), usage: payload.usageMetadata || null, model };
  } catch {
    throw new Error(`Gemini (${model}) devolvi\xF3 JSON inv\xE1lido`);
  }
}
__name(parseGeminiResponse, "parseGeminiResponse");
async function callGemini(env, model, invoiceMime, invoiceData, orderMime, orderData, context) {
  const parts = [{ text: "DOCUMENTO A \u2014 FACTURA" }, { inline_data: { mime_type: invoiceMime, data: invoiceData } }];
  if (orderData) parts.push({ text: "DOCUMENTO B \u2014 PEDIDO PDF" }, { inline_data: { mime_type: orderMime || "application/pdf", data: orderData } });
  parts.push({ text: buildPrompt(context) });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema, maxOutputTokens: 8192 }
      })
    });
    return await parseGeminiResponse(response, model);
  } finally {
    clearTimeout(timeout);
  }
}
__name(callGemini, "callGemini");
async function callWithFallbacks(env, invoiceMime, invoiceData, orderMime, orderData, context) {
  const models = [env.GEMINI_MODEL || DEFAULT_MODEL, ...FALLBACK_MODELS].filter((value, index, all) => value && all.indexOf(value) === index);
  const attempts = [];
  for (const model of models) {
    try {
      return await callGemini(env, model, invoiceMime, invoiceData, orderMime, orderData, context);
    } catch (error2) {
      attempts.push({ model, error: String(error2.message || error2), status: error2.status || 0 });
      const canFallback = !error2.status || error2.status === 404 || error2.status === 400 || error2.status >= 500;
      if (!canFallback) break;
    }
  }
  const error = new Error(attempts.map((item) => `${item.model}: ${item.error}`).join(" | ") || "Gemini no respondi\xF3");
  error.attempts = attempts;
  throw error;
}
__name(callWithFallbacks, "callWithFallbacks");
function distributeResidual(lines, targetTotal) {
  const current = lines.reduce((sum, line) => sum + line.grossLineTotal, 0);
  const residual = Math.round(targetTotal - current);
  if (!targetTotal || !lines.length || Math.abs(residual) <= 1) return;
  const basis = lines.reduce((sum, line) => sum + Math.max(0, line.netLineTotal), 0) || lines.length;
  let assigned = 0;
  lines.forEach((line, index) => {
    const share = index === lines.length - 1 ? residual - assigned : Math.round(residual * ((Math.max(0, line.netLineTotal) || 1) / basis));
    line.grossLineTotal = Math.max(0, line.grossLineTotal + share);
    assigned += share;
  });
}
__name(distributeResidual, "distributeResidual");
function validateInvoice(raw, context) {
  const products = context.products || [];
  const totals = {
    net: Math.max(0, numeric(raw.totals?.net)),
    freight: Math.max(0, numeric(raw.totals?.freight)),
    additionalTax: Math.max(0, numeric(raw.totals?.additionalTax)),
    vat: Math.max(0, numeric(raw.totals?.vat)),
    other: Math.max(0, numeric(raw.totals?.other)),
    total: Math.max(0, numeric(raw.totals?.total))
  };
  const warnings = [...Array.isArray(raw.warnings) ? raw.warnings : []];
  const sourceItems = Array.isArray(raw.items) ? raw.items : [];
  const productItems = sourceItems.filter((line) => {
    const source = String(line.descriptionOriginal || "").trim();
    if (!isChargeLine(source)) return true;
    warnings.push(`Cargo separado del listado de productos: ${source}`);
    if (!totals.freight && /FLETE|DESPACHO|TRANSPORTE/.test(expandAbbreviations(source))) totals.freight += Math.max(0, Math.round(numeric(line.grossLineTotal) || numeric(line.netLineTotal)));
    return false;
  });
  const lines = productItems.map((line, index) => {
    const sourceLine = String(line.descriptionOriginal || "").trim();
    const invoiceQuantity = parseQuantityCell(line.quantityCellRaw, line.invoiceQuantity);
    const match = chooseProduct(line, products);
    const product = match.product;
    const candidate = match.candidate;
    const explicitPack = explicitPackFromDescription(sourceLine);
    const expectedOrderPack = product ? orderPackSize(product.unit, product.description) : 1;
    let packSize = explicitPack || Math.max(1, numeric(line.packSize) || 1);
    if (product && normalize(product.unit).includes("DISPLAY") && !explicitPack) packSize = expectedOrderPack;
    const units = Math.max(0, invoiceQuantity * packSize);
    const netLineTotal = Math.max(0, Math.round(numeric(line.netLineTotal)));
    const freightLine = Math.max(0, Math.round(numeric(line.freightLine)));
    const vatLine = Math.max(0, Math.round(numeric(line.vatLine)));
    const additionalTaxLine = Math.max(0, Math.round(numeric(line.additionalTaxLine)));
    const otherLineCharges = Math.max(0, Math.round(numeric(line.otherLineCharges)));
    const componentTotal = netLineTotal + freightLine + vatLine + additionalTaxLine + otherLineCharges;
    let grossLineTotal = Math.max(0, Math.round(numeric(line.grossLineTotal)));
    if (!grossLineTotal || Math.abs(grossLineTotal - componentTotal) > Math.max(3, componentTotal * 0.03)) grossLineTotal = componentTotal;
    const receivedOrderQty = product ? units / expectedOrderPack : 0;
    if (!product) warnings.push(`Sin coincidencia segura con el pedido: ${sourceLine || `l\xEDnea ${index + 1}`}`);
    return {
      id: `gemini-${index + 1}`,
      code: String(line.code || ""),
      sourceLine,
      descriptionOriginal: sourceLine,
      quantityCellRaw: String(line.quantityCellRaw || ""),
      invoiceQuantity,
      packageQty: invoiceQuantity,
      packSize,
      units,
      contentMl: contentMl(sourceLine) || Math.max(0, numeric(line.contentMl)),
      alcoholDegree: alcoholDegree(sourceLine) || Math.max(0, numeric(line.alcoholDegree)),
      unitPriceNet: Math.max(0, Math.round(numeric(line.unitPriceNet))),
      discountPct: Math.max(0, numeric(line.discountPct)),
      netLineTotal,
      freightLine,
      vatLine,
      additionalTaxLine,
      otherLineCharges,
      grossLineTotal,
      grossPackPrice: invoiceQuantity ? Math.round(grossLineTotal / invoiceQuantity) : 0,
      grossUnitPrice: units ? Math.round(grossLineTotal / units) : 0,
      productId: product?.productId || "",
      suggestedProductId: !product && candidate?.productId ? String(candidate.productId) : "",
      description: product?.description || sourceLine,
      receivedOrderQty: Number(receivedOrderQty.toFixed(3)),
      orderPackSize: expectedOrderPack,
      confidence: Math.max(0, Math.min(1, Math.max(numeric(line.matchConfidence), match.score || 0))),
      matchMethod: match.method,
      matchScore: Number((match.score || 0).toFixed(4)),
      matchReason: String(line.matchReason || match.reason || ""),
      notes: String(line.notes || ""),
      engine: "gemini"
    };
  }).filter((line) => line.sourceLine || line.invoiceQuantity || line.netLineTotal || line.grossLineTotal);
  distributeResidual(lines, totals.total);
  for (const line of lines) {
    line.grossUnitPrice = line.units ? Math.round(line.grossLineTotal / line.units) : 0;
    line.grossPackPrice = line.invoiceQuantity ? Math.round(line.grossLineTotal / line.invoiceQuantity) : 0;
  }
  if (!lines.length) warnings.push("Gemini no detect\xF3 l\xEDneas de productos.");
  const matched = lines.filter((line) => line.productId).length;
  return {
    supplierName: String(raw.supplierName || ""),
    supplierRut: String(raw.supplierRut || ""),
    invoiceNumber: String(raw.invoiceNumber || ""),
    invoiceDate: String(raw.invoiceDate || ""),
    currency: String(raw.currency || "CLP"),
    totals,
    lines,
    matchSummary: { matched, unmatched: lines.length - matched, totalInvoiceLines: lines.length },
    warnings: [...new Set(warnings.filter(Boolean))],
    rawText: JSON.stringify(raw)
  };
}
__name(validateInvoice, "validateInvoice");
async function analyze(request, env, origin) {
  if (!env.GEMINI_API_KEY) return json({ ok: false, error: "GEMINI_API_KEY no est\xE1 configurada", code: "missing_api_key" }, 503, origin);
  const form = await request.formData();
  const invoice = form.get("file");
  const order = form.get("orderFile");
  if (!(invoice instanceof File)) return json({ ok: false, error: "Debes adjuntar la factura", code: "missing_file" }, 400, origin);
  if (invoice.size > MAX_INVOICE_BYTES) return json({ ok: false, error: "La factura supera 12 MB", code: "file_too_large" }, 413, origin);
  if (order instanceof File && order.size > MAX_ORDER_BYTES) return json({ ok: false, error: "El PDF del pedido supera 3 MB", code: "order_too_large" }, 413, origin);
  if (invoice.size + (order instanceof File ? order.size : 0) > MAX_COMBINED_BYTES) return json({ ok: false, error: "Factura y pedido superan 16 MB", code: "combined_too_large" }, 413, origin);
  let context = {};
  try {
    context = JSON.parse(String(form.get("context") || "{}"));
  } catch {
    return json({ ok: false, error: "Contexto de pedido inv\xE1lido", code: "invalid_context" }, 400, origin);
  }
  const invoiceMime = invoice.type || (/\.pdf$/i.test(invoice.name) ? "application/pdf" : "image/jpeg");
  if (!/^image\//.test(invoiceMime) && invoiceMime !== "application/pdf") return json({ ok: false, error: "Usa una imagen o PDF", code: "unsupported_type" }, 415, origin);
  const invoiceData = toBase64(await invoice.arrayBuffer());
  const orderData = order instanceof File ? toBase64(await order.arrayBuffer()) : "";
  const result = await callWithFallbacks(env, invoiceMime, invoiceData, order?.type || "application/pdf", orderData, context);
  return json({ ok: true, model: result.model, usage: result.usage, comparedOrderPdf: !!orderData, invoice: validateInvoice(result.data, context) }, 200, origin);
}
__name(analyze, "analyze");
async function probeGemini(env) {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Responde exactamente OK" }] }], generationConfig: { temperature: 0, maxOutputTokens: 8 } })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
  return { model, ok: !!payload?.candidates?.length };
}
__name(probeGemini, "probeGemini");
var index_default = {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (!origin) return json({ ok: false, error: "Origen no autorizado" }, 403, "null");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const base = { ok: true, service: "pedidos-pro-ai", geminiConfigured: !!env.GEMINI_API_KEY, model: env.GEMINI_MODEL || DEFAULT_MODEL, resolver: "catalog-v22" };
      if (url.searchParams.get("probe") !== "1" || !env.GEMINI_API_KEY) return json(base, 200, origin);
      try {
        return json({ ...base, probe: await probeGemini(env) }, 200, origin);
      } catch (error) {
        return json({ ...base, ok: false, probe: { ok: false, error: String(error.message || error) } }, 502, origin);
      }
    }
    if (request.method === "POST" && url.pathname === "/v1/invoices/analyze") {
      try {
        return await analyze(request, env, origin);
      } catch (error) {
        console.error(error);
        return json({ ok: false, error: String(error.message || "No se pudo analizar la factura"), code: "gemini_failed", attempts: error.attempts || [] }, 502, origin);
      }
    }
    return json({ ok: false, error: "Ruta no encontrada" }, 404, origin);
  }
};

// ../professional/worker/src/core.js
var ROLES = Object.freeze({
  OWNER: "owner",
  ADMIN: "admin",
  PURCHASER: "purchaser",
  APPROVER: "approver",
  RECEIVER: "receiver",
  FINANCE: "finance",
  READONLY: "readonly"
});
var ROLE_WEIGHT = Object.freeze({
  readonly: 10,
  finance: 40,
  receiver: 50,
  purchaser: 60,
  approver: 70,
  admin: 80,
  owner: 100
});
var ORDER_TRANSITIONS = Object.freeze({
  draft: ["requested", "cancelled"],
  requested: ["approved", "rejected", "cancelled"],
  rejected: ["draft", "cancelled"],
  approved: ["sent", "cancelled"],
  sent: ["confirmed", "partially_received", "received", "cancelled"],
  confirmed: ["partially_received", "received", "cancelled"],
  partially_received: ["received", "closed", "cancelled"],
  received: ["reconciled", "closed"],
  reconciled: ["closed"],
  closed: [],
  cancelled: []
});
var PLAN_LIMITS = Object.freeze({
  free: {
    locations: 1,
    users: 5,
    suppliers: 100,
    products: 750,
    ordersPerMonth: 500,
    aiDocumentsPerMonth: 30,
    fileBytes: 250 * 1024 * 1024,
    features: ["orders", "reception", "catalog", "audit", "offline", "ai-basic"]
  },
  pro: {
    locations: 5,
    users: 25,
    suppliers: 500,
    products: 5e3,
    ordersPerMonth: 1e4,
    aiDocumentsPerMonth: 1e3,
    fileBytes: 20 * 1024 * 1024 * 1024,
    features: ["orders", "reception", "catalog", "audit", "offline", "ai", "approvals", "dte", "reports"]
  },
  business: {
    locations: 50,
    users: 250,
    suppliers: 5e3,
    products: 5e4,
    ordersPerMonth: 1e5,
    aiDocumentsPerMonth: 1e4,
    fileBytes: 200 * 1024 * 1024 * 1024,
    features: ["orders", "reception", "catalog", "audit", "offline", "ai", "approvals", "dte", "reports", "integrations", "sso"]
  }
});
var HttpError = class extends Error {
  static {
    __name(this, "HttpError");
  }
  constructor(status, message, code = "request_failed", details = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
};
function corsHeaders2(origin, env = {}) {
  const configured = String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  const allowedOrigin2 = configured.length ? configured.includes(origin) ? origin : configured[0] : origin || "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin2,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,Idempotency-Key,X-Bootstrap-Token,X-Pedidos-Client",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
__name(corsHeaders2, "corsHeaders");
function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "Content-Security-Policy": "default-src 'self'; connect-src 'self' https://pedidos-pro-ai.botreservasmultilocal.workers.dev; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  };
}
__name(securityHeaders, "securityHeaders");
function json2(data, status = 200, request = null, env = {}) {
  const origin = request?.headers?.get?.("Origin") || "";
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders2(origin, env),
      ...securityHeaders()
    }
  });
}
__name(json2, "json");
function ok(data = {}, request = null, env = {}) {
  return json2({ ok: true, ...data }, 200, request, env);
}
__name(ok, "ok");
function errorResponse(error, request = null, env = {}) {
  const status = Number(error?.status) || 500;
  const expose = status < 500 || env.ENVIRONMENT !== "production";
  const payload = {
    ok: false,
    error: expose ? String(error?.message || "Error inesperado") : "No se pudo completar la operaci\xF3n",
    code: error?.code || "internal_error"
  };
  if (expose && error?.details) payload.details = error.details;
  return json2(payload, status, request, env);
}
__name(errorResponse, "errorResponse");
async function readJson(request, { required = true } = {}) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    if (!required) return {};
    throw new HttpError(415, "Se requiere Content-Type application/json", "unsupported_media_type");
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "El cuerpo JSON no es v\xE1lido", "invalid_json");
  }
}
__name(readJson, "readJson");
function requireText(value, field, { min = 1, max = 250 } = {}) {
  const text = String(value ?? "").trim();
  if (text.length < min) throw new HttpError(400, `${field} es obligatorio`, "validation_error", { field });
  if (text.length > max) throw new HttpError(400, `${field} supera ${max} caracteres`, "validation_error", { field });
  return text;
}
__name(requireText, "requireText");
function optionalText(value, { max = 1e3 } = {}) {
  const text = String(value ?? "").trim();
  if (text.length > max) throw new HttpError(400, `El texto supera ${max} caracteres`, "validation_error");
  return text;
}
__name(optionalText, "optionalText");
function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Correo inv\xE1lido", "invalid_email");
  }
  return email;
}
__name(normalizeEmail, "normalizeEmail");
function normalizeRut(value) {
  const rut = String(value || "").toUpperCase().replace(/[^0-9K]/g, "");
  if (!rut) return "";
  if (rut.length < 8 || rut.length > 9) throw new HttpError(400, "RUT inv\xE1lido", "invalid_rut");
  const body = rut.slice(0, -1);
  const verifier = rut.slice(-1);
  let sum = 0;
  let multiplier = 2;
  for (let index = body.length - 1; index >= 0; index--) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const result = 11 - sum % 11;
  const expected = result === 11 ? "0" : result === 10 ? "K" : String(result);
  if (verifier !== expected) throw new HttpError(400, "RUT inv\xE1lido", "invalid_rut");
  return `${Number(body).toLocaleString("es-CL")}-${verifier}`;
}
__name(normalizeRut, "normalizeRut");
function slugify(value) {
  const slug = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return slug || `empresa-${Date.now().toString(36)}`;
}
__name(slugify, "slugify");
function uuid() {
  return crypto.randomUUID();
}
__name(uuid, "uuid");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
function monthKey(date = /* @__PURE__ */ new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
__name(monthKey, "monthKey");
function number(value, { min = -Infinity, max = Infinity, fallback = 0 } = {}) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
__name(number, "number");
function integer(value, options = {}) {
  return Math.round(number(value, options));
}
__name(integer, "integer");
function parseBearer(request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}
__name(parseBearer, "parseBearer");
function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(base64url, "base64url");
function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}
__name(randomToken, "randomToken");
async function sha256(value) {
  const input = value instanceof ArrayBuffer ? value : ArrayBuffer.isView(value) ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) : new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
function assertMinimumRole(role, minimumRole) {
  if ((ROLE_WEIGHT[role] || 0) < (ROLE_WEIGHT[minimumRole] || 0)) {
    throw new HttpError(403, "No tienes permisos para esta acci\xF3n", "forbidden");
  }
}
__name(assertMinimumRole, "assertMinimumRole");
function canTransition(from, to) {
  return Boolean(ORDER_TRANSITIONS[from]?.includes(to));
}
__name(canTransition, "canTransition");
function planFor(name) {
  return PLAN_LIMITS[name] || PLAN_LIMITS.free;
}
__name(planFor, "planFor");
function sanitizeFileName(value) {
  const safe = String(value || "archivo").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return safe || "archivo";
}
__name(sanitizeFileName, "sanitizeFileName");
function routeMatch(pathname, pattern) {
  const pathParts = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  const patternParts = pattern.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (pathParts.length !== patternParts.length) return null;
  const params = {};
  for (let index = 0; index < patternParts.length; index++) {
    const expected = patternParts[index];
    const actual = pathParts[index];
    if (expected.startsWith(":")) params[expected.slice(1)] = decodeURIComponent(actual);
    else if (expected !== actual) return null;
  }
  return params;
}
__name(routeMatch, "routeMatch");

// ../professional/worker/src/schema.js
import identitySchemaModule from "./2dc115ea4c47c28da18325477dc34737fb45ddfa-0001_identity.sql";
import procurementSchemaModule from "./caa834fe0ca009665fbb6e7077bd6a5301b8f476-0002_procurement.sql";
import invoiceSchemaModule from "./ae8a7c8b4b62656432216415c770cafa6ace21ee-0003_invoices.sql";
import platformSchemaModule from "./79acea37922d1747eec54a5fa45f42ea9d33b557-0004_multibrand_r2_history.sql";
import fileChunkSchemaModule from "./3799a097c00f1edd96781af6b6febec409b6afc1-0004_file_chunks.sql";
import costCenterSchemaModule from "./9a06606f69079b6a1b5bd62603715356cb28ec2c-0005_cost_centers.sql";
var SCHEMA_VERSION = "8";
var DEFAULT_ORG_ID = "e73d2d6e-dae8-46c6-87df-43ae05ca81fa";
var DEFAULT_LOCATION_ID = "e263b119-d0bb-484e-b65c-abe2c57f9e86";
var DEFAULT_USER_ID = "80a9afe9-4751-4181-b816-eb78c94619ef";
var DEFAULT_MEMBERSHIP_ID = "128cf0b2-c298-412a-8aad-10bf921bfd37";
var DEFAULT_PASSWORD_SALT = "g5L6Isfimtho-mkugDnCKHTg";
var DEFAULT_PASSWORD_HASH = "92e9ea256a2b2d89e54b2e7b6a7098917110fbb7a771d6cdd3000d0117295dc0";
var DEFAULT_PASSWORD_ALGORITHM = "pbkdf2-sha256-100000";
var LEGACY_PASSWORD_HASH = "83dbb59cdd6371ebb84b7d2271ebc8ade3eaeaa05d85fe50439030e606e4c1f1";
var initializationPromise = null;
function normalizeSql(moduleValue, label) {
  const raw = typeof moduleValue === "string" ? moduleValue : moduleValue?.default;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(`SQL module ${label} did not resolve to text`);
  }
  return raw.replace(/^\s*PRAGMA\s+foreign_keys\s*=\s*ON\s*;\s*/gim, "").trim();
}
__name(normalizeSql, "normalizeSql");
function prepareSchemaStatements(db, sql, label) {
  const statements = sql.split(";").map((statement) => statement.trim()).filter(Boolean).map((statement, index) => {
    try {
      return db.prepare(statement);
    } catch (error) {
      throw new Error(`Could not prepare ${label} statement ${index + 1}: ${error?.message || error}`);
    }
  });
  if (!statements.length) throw new Error(`Schema ${label} has no executable statements`);
  return statements;
}
__name(prepareSchemaStatements, "prepareSchemaStatements");
async function executeSchema(db, sql, label) {
  const statements = prepareSchemaStatements(db, sql, label);
  await db.batch(statements);
  return statements.length;
}
__name(executeSchema, "executeSchema");
var identitySchema = normalizeSql(identitySchemaModule, "identity");
var procurementSchema = normalizeSql(procurementSchemaModule, "procurement");
var invoiceSchema = normalizeSql(invoiceSchemaModule, "invoices");
var platformSchema = normalizeSql(platformSchemaModule, "platform-r2-history");
var fileChunkSchema = normalizeSql(fileChunkSchemaModule, "file-chunks");
var costCenterSchema = normalizeSql(costCenterSchemaModule, "cost-centers");
async function seedDefaultWorkspace(db) {
  const existing = await db.prepare("SELECT COUNT(*) AS total FROM users").first();
  if (Number(existing?.total || 0) > 0) return false;
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const categories = [
    "Bebidas sin alcohol",
    "Cervezas",
    "Vinos",
    "Espumantes",
    "Destilados",
    "Licores",
    "Insumos",
    "Abarrotes",
    "Otros"
  ];
  const statements = [
    db.prepare(`
      INSERT OR IGNORE INTO organizations
        (id, name, slug, plan, status, settings_json, created_at, updated_at)
      VALUES (?, 'Pedidos Pro', 'pedidos-pro', 'free', 'active', '{}', ?, ?)
    `).bind(DEFAULT_ORG_ID, timestamp, timestamp),
    db.prepare(`
      INSERT OR IGNORE INTO locations
        (id, org_id, name, code, timezone, active, created_at, updated_at)
      VALUES (?, ?, 'Principal', 'PRINCIPAL', 'America/Santiago', 1, ?, ?)
    `).bind(DEFAULT_LOCATION_ID, DEFAULT_ORG_ID, timestamp, timestamp),
    db.prepare(`
      INSERT OR IGNORE INTO users
        (id, email, display_name, password_salt, password_hash, password_algorithm, active, created_at, updated_at)
      VALUES (?, 'admin@pedidospro.local', 'Benjam\xEDn Palma', ?, ?, ?, 1, ?, ?)
    `).bind(
      DEFAULT_USER_ID,
      DEFAULT_PASSWORD_SALT,
      DEFAULT_PASSWORD_HASH,
      DEFAULT_PASSWORD_ALGORITHM,
      timestamp,
      timestamp
    ),
    db.prepare(`
      INSERT OR IGNORE INTO memberships
        (id, org_id, user_id, role, location_scope, active, created_at, updated_at)
      VALUES (?, ?, ?, 'owner', '["*"]', 1, ?, ?)
    `).bind(DEFAULT_MEMBERSHIP_ID, DEFAULT_ORG_ID, DEFAULT_USER_ID, timestamp, timestamp)
  ];
  categories.forEach((name, index) => {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO categories
        (id, org_id, name, sort_order, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).bind(`seed-category-${String(index + 1).padStart(2, "0")}`, DEFAULT_ORG_ID, name, index + 1, timestamp, timestamp));
  });
  await db.batch(statements);
  return true;
}
__name(seedDefaultWorkspace, "seedDefaultWorkspace");
async function migrateSeededOwnerPassword(db) {
  const result = await db.prepare(`
    UPDATE users
    SET password_salt = ?, password_hash = ?, password_algorithm = ?, updated_at = ?
    WHERE id = ?
      AND email = 'admin@pedidospro.local'
      AND password_algorithm = 'pbkdf2-sha256-210000'
      AND password_hash = ?
  `).bind(
    DEFAULT_PASSWORD_SALT,
    DEFAULT_PASSWORD_HASH,
    DEFAULT_PASSWORD_ALGORITHM,
    (/* @__PURE__ */ new Date()).toISOString(),
    DEFAULT_USER_ID,
    LEGACY_PASSWORD_HASH
  ).run();
  return Number(result?.meta?.changes || 0) > 0;
}
__name(migrateSeededOwnerPassword, "migrateSeededOwnerPassword");
async function ensureSchema(env) {
  if (!env.DB) throw new Error("D1 binding DB is not available");
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    const identityStatements = await executeSchema(env.DB, identitySchema, "identity");
    const procurementStatements = await executeSchema(env.DB, procurementSchema, "procurement");
    const invoiceStatements = await executeSchema(env.DB, invoiceSchema, "invoices");
    const platformStatements = await executeSchema(env.DB, platformSchema, "platform-r2-history");
    const fileChunkStatements = await executeSchema(env.DB, fileChunkSchema, "file-chunks");
    const seeded = await seedDefaultWorkspace(env.DB);
    const costCenterStatements = await executeSchema(env.DB, costCenterSchema, "cost-centers");
    const ownerPasswordMigrated = await migrateSeededOwnerPassword(env.DB);
    return {
      initialized: true,
      seeded,
      ownerPasswordMigrated,
      version: SCHEMA_VERSION,
      statements: identityStatements + procurementStatements + invoiceStatements + platformStatements + fileChunkStatements + costCenterStatements
    };
  })().catch((error) => {
    initializationPromise = null;
    throw error;
  });
  return initializationPromise;
}
__name(ensureSchema, "ensureSchema");

// ../professional/worker/src/password.js
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { Buffer as Buffer2 } from "node:buffer";
var ITERATIONS = 1e5;
var KEY_BYTES = 32;
var DIGEST = "sha256";
function passwordError(message, code = "weak_password") {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  return error;
}
__name(passwordError, "passwordError");
function normalizePassword(password) {
  const normalized = String(password || "");
  if (normalized.length < 10) throw passwordError("La contrase\xF1a debe tener al menos 10 caracteres");
  if (normalized.length > 128) throw passwordError("La contrase\xF1a es demasiado larga");
  return normalized;
}
__name(normalizePassword, "normalizePassword");
async function hashPassword(password, salt = randomBytes(18).toString("base64url")) {
  const normalized = normalizePassword(password);
  const hash = pbkdf2Sync(normalized, String(salt), ITERATIONS, KEY_BYTES, DIGEST).toString("hex");
  return { salt: String(salt), hash, algorithm: `pbkdf2-sha256-${ITERATIONS}` };
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, salt, expectedHash) {
  const normalized = normalizePassword(password);
  const expected = String(expectedHash || "");
  if (!/^[a-f0-9]{64}$/i.test(expected)) return false;
  const actual = pbkdf2Sync(normalized, String(salt || ""), ITERATIONS, KEY_BYTES, DIGEST);
  const stored = Buffer2.from(expected, "hex");
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}
__name(verifyPassword, "verifyPassword");

// ../professional/worker/src/auth.js
function publicUser(row) {
  return {
    id: row.user_id || row.id,
    email: row.email,
    displayName: row.display_name,
    active: Boolean(row.user_active ?? row.active),
    role: row.role,
    organizationId: row.org_id,
    organizationName: row.org_name,
    organizationSlug: row.org_slug,
    plan: row.plan,
    membershipId: row.membership_id,
    locationScope: safeJson(row.location_scope, [])
  };
}
__name(publicUser, "publicUser");
function safeJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}
__name(safeJson, "safeJson");
async function validateLocationScope(env, actor, requested, role) {
  if (role === ROLES.OWNER) return ["*"];
  const values = [...new Set((Array.isArray(requested) ? requested : []).map(String).filter(Boolean))];
  if (values.includes("*")) throw new HttpError(403, "Solo el owner puede acceder a todos los locales", "owner_scope_required");
  if (!values.length) throw new HttpError(400, "Selecciona al menos un local para este usuario", "location_scope_required");
  for (const locationId of values) {
    const location = await env.DB.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ? AND active = 1").bind(locationId, actor.orgId).first();
    if (!location) throw new HttpError(400, "Uno de los locales seleccionados no es v\xE1lido", "invalid_location_scope");
  }
  return values;
}
__name(validateLocationScope, "validateLocationScope");
async function createSession(env, request, { userId, orgId }) {
  const token = randomToken(36);
  const tokenHash = await sha256(token);
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
  const ipHash = ip ? await sha256(`${env.IP_HASH_SALT || "pedidos-pro"}:${ip}`) : "";
  const session = {
    id: uuid(),
    userId,
    orgId,
    tokenHash,
    userAgent: String(request.headers.get("User-Agent") || "").slice(0, 300),
    ipHash,
    createdAt: nowIso()
  };
  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, org_id, token_hash, user_agent, ip_hash, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(session.id, userId, orgId, tokenHash, session.userAgent, ipHash, session.createdAt, session.createdAt).run();
  return { token, sessionId: session.id };
}
__name(createSession, "createSession");
async function writeAudit(env, actor, request, action, entityType, entityId = "", metadata = {}) {
  try {
    const ip = request?.headers?.get?.("CF-Connecting-IP") || "";
    const ipHash = ip ? await sha256(`${env.IP_HASH_SALT || "pedidos-pro"}:${ip}`) : "";
    await env.DB.prepare(`
      INSERT INTO audit_logs
        (id, org_id, actor_user_id, actor_email, action, entity_type, entity_id, metadata_json, ip_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      uuid(),
      actor?.orgId || null,
      actor?.userId || null,
      actor?.email || "",
      action,
      entityType,
      entityId || "",
      JSON.stringify(metadata || {}),
      ipHash,
      nowIso()
    ).run();
  } catch (error) {
    console.error("audit_failed", action, error);
  }
}
__name(writeAudit, "writeAudit");
async function authenticate(request, env, { optional = false } = {}) {
  const token = parseBearer(request);
  if (!token) {
    if (optional) return null;
    throw new HttpError(401, "Debes iniciar sesi\xF3n", "unauthorized");
  }
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT
      s.id AS session_id, s.user_id, s.org_id, s.created_at AS session_created_at,
      u.email, u.display_name, u.active AS user_active,
      m.id AS membership_id, m.role, m.location_scope, m.active AS membership_active,
      o.name AS org_name, o.slug AS org_slug, o.plan, o.status AS org_status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN memberships m ON m.user_id = s.user_id AND m.org_id = s.org_id
    JOIN organizations o ON o.id = s.org_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND u.active = 1
      AND m.active = 1
      AND o.status = 'active'
    LIMIT 1
  `).bind(tokenHash).first();
  if (!row) throw new HttpError(401, "La sesi\xF3n fue revocada o no es v\xE1lida", "session_revoked");
  env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(nowIso(), row.session_id).run().catch(() => {
  });
  const platformOwner = await env.DB.prepare("SELECT user_id FROM platform_owners WHERE user_id = ?").bind(row.user_id).first();
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    orgId: row.org_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    locationScope: safeJson(row.location_scope, []),
    organization: { id: row.org_id, name: row.org_name, slug: row.org_slug, plan: row.plan },
    isPlatformOwner: Boolean(platformOwner)
  };
}
__name(authenticate, "authenticate");
async function bootstrap(request, env) {
  const configured = String(env.BOOTSTRAP_ADMIN_TOKEN || "");
  const provided = String(request.headers.get("X-Bootstrap-Token") || "");
  if (!configured || provided !== configured) {
    throw new HttpError(403, "Token de inicializaci\xF3n inv\xE1lido", "invalid_bootstrap_token");
  }
  const current = await env.DB.prepare("SELECT COUNT(*) AS total FROM users").first();
  if (Number(current?.total) > 0) {
    throw new HttpError(409, "La plataforma ya fue inicializada", "already_bootstrapped");
  }
  const body = await readJson(request);
  const organizationName = requireText(body.organizationName, "Nombre de la empresa", { max: 120 });
  const locationName = requireText(body.locationName || "Casa matriz", "Nombre del local", { max: 120 });
  const displayName = requireText(body.displayName, "Nombre del usuario", { max: 120 });
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const passwordData = await hashPassword(password);
  const timestamp = nowIso();
  const orgId = uuid();
  const locationId = uuid();
  const userId = uuid();
  const membershipId = uuid();
  const slug = slugify(body.organizationSlug || organizationName);
  const statements = [
    env.DB.prepare(`INSERT INTO organizations (id, name, slug, plan, status, created_at, updated_at) VALUES (?, ?, ?, 'free', 'active', ?, ?)`).bind(orgId, organizationName, slug, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO locations (id, org_id, name, code, timezone, active, created_at, updated_at) VALUES (?, ?, ?, ?, 'America/Santiago', 1, ?, ?)`).bind(locationId, orgId, locationName, "PRINCIPAL", timestamp, timestamp),
    env.DB.prepare(`INSERT INTO users (id, email, display_name, password_salt, password_hash, password_algorithm, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(userId, email, displayName, passwordData.salt, passwordData.hash, passwordData.algorithm, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO memberships (id, org_id, user_id, role, location_scope, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).bind(membershipId, orgId, userId, ROLES.OWNER, JSON.stringify(["*"]), timestamp, timestamp),
    env.DB.prepare("INSERT INTO platform_owners (user_id, created_at) VALUES (?, ?)").bind(userId, timestamp)
  ];
  ["Bebidas sin alcohol", "Cervezas", "Vinos", "Espumantes", "Pisco", "Ron", "Vodka", "Gin", "Whisky", "Tequila", "Licores", "Insumos", "Abarrotes", "Otros"].forEach((name, index) => {
    statements.push(env.DB.prepare(`INSERT INTO categories (id, org_id, name, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`).bind(uuid(), orgId, name, index, timestamp, timestamp));
  });
  await env.DB.batch(statements);
  const session = await createSession(env, request, { userId, orgId });
  const actor = { userId, orgId, email, role: ROLES.OWNER };
  await writeAudit(env, actor, request, "platform.bootstrap", "organization", orgId, { locationId });
  return {
    token: session.token,
    sessionId: session.sessionId,
    user: {
      id: userId,
      email,
      displayName,
      role: ROLES.OWNER,
      organizationId: orgId,
      organizationName,
      organizationSlug: slug,
      plan: "free",
      locationScope: ["*"]
    }
  };
}
__name(bootstrap, "bootstrap");
async function login(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const row = await env.DB.prepare(`
    SELECT
      u.id AS user_id, u.email, u.display_name, u.password_salt, u.password_hash, u.active AS user_active,
      m.id AS membership_id, m.org_id, m.role, m.location_scope, m.active AS membership_active,
      o.name AS org_name, o.slug AS org_slug, o.plan, o.status AS org_status
    FROM users u
    JOIN memberships m ON m.user_id = u.id
    JOIN organizations o ON o.id = m.org_id
    WHERE u.email = ?
      AND u.active = 1 AND m.active = 1 AND o.status = 'active'
    ORDER BY o.created_at ASC, CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
    LIMIT 1
  `).bind(email).first();
  if (!row || !await verifyPassword(String(body.password || ""), row.password_salt, row.password_hash)) {
    await writeAudit(env, null, request, "auth.login_failed", "user", "", { email });
    throw new HttpError(401, "Correo o contrase\xF1a incorrectos", "invalid_credentials");
  }
  const session = await createSession(env, request, { userId: row.user_id, orgId: row.org_id });
  const actor = { userId: row.user_id, orgId: row.org_id, email: row.email, role: row.role };
  await writeAudit(env, actor, request, "auth.login", "session", session.sessionId);
  return { token: session.token, sessionId: session.sessionId, user: publicUser(row) };
}
__name(login, "login");
async function logout(request, env, actor) {
  await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").bind(nowIso(), actor.sessionId).run();
  await writeAudit(env, actor, request, "auth.logout", "session", actor.sessionId);
  return { revoked: true };
}
__name(logout, "logout");
async function me(env, actor) {
  const usageMonth = monthKey();
  const usageRows = await env.DB.prepare(`
    SELECT metric, quantity FROM usage_counters WHERE org_id = ? AND month_key = ?
  `).bind(actor.orgId, usageMonth).all();
  const usage = Object.fromEntries((usageRows.results || []).map((row) => [row.metric, Number(row.quantity)]));
  const limits = planFor(actor.organization.plan);
  return {
    user: {
      id: actor.userId,
      email: actor.email,
      displayName: actor.displayName,
      role: actor.role,
      locationScope: actor.locationScope,
      isPlatformOwner: Boolean(actor.isPlatformOwner)
    },
    organization: actor.organization,
    plan: { name: actor.organization.plan, limits, usage }
  };
}
__name(me, "me");
async function listUsers(env, actor) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  const rows4 = await env.DB.prepare(`
    SELECT u.id, u.email, u.display_name, u.active, m.id AS membership_id, m.role, m.location_scope, m.active AS membership_active,
      COUNT(CASE WHEN s.revoked_at IS NULL THEN 1 END) AS active_sessions,
      MAX(s.last_seen_at) AS last_seen_at
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN sessions s ON s.user_id = u.id AND s.org_id = m.org_id
    WHERE m.org_id = ?
    GROUP BY u.id, m.id
    ORDER BY m.active DESC, u.display_name COLLATE NOCASE
  `).bind(actor.orgId).all();
  return (rows4.results || []).map((row) => ({
    id: row.id,
    membershipId: row.membership_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    active: Boolean(row.active && row.membership_active),
    locationScope: safeJson(row.location_scope, []),
    activeSessions: Number(row.active_sessions || 0),
    lastSeenAt: row.last_seen_at || null
  }));
}
__name(listUsers, "listUsers");
async function createUser(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  const body = await readJson(request);
  const limits = planFor(actor.organization.plan);
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM memberships WHERE org_id = ? AND active = 1").bind(actor.orgId).first();
  if (Number(count?.total) >= limits.users) {
    throw new HttpError(402, `El plan ${actor.organization.plan} permite hasta ${limits.users} usuarios activos`, "plan_limit");
  }
  const email = normalizeEmail(body.email);
  const displayName = requireText(body.displayName, "Nombre", { max: 120 });
  const role = String(body.role || ROLES.READONLY);
  if (!Object.values(ROLES).includes(role)) throw new HttpError(400, "Rol inv\xE1lido", "invalid_role");
  if (role === ROLES.OWNER && actor.role !== ROLES.OWNER) throw new HttpError(403, "Solo el propietario puede crear otro propietario", "forbidden");
  const locationScope = await validateLocationScope(env, actor, body.locationScope, role);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  const timestamp = nowIso();
  let userId = existing?.id;
  const statements = [];
  if (!userId) {
    const passwordData = await hashPassword(String(body.password || ""));
    userId = uuid();
    statements.push(env.DB.prepare(`
      INSERT INTO users (id, email, display_name, password_salt, password_hash, password_algorithm, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(userId, email, displayName, passwordData.salt, passwordData.hash, passwordData.algorithm, timestamp, timestamp));
  }
  const duplicate = await env.DB.prepare("SELECT id FROM memberships WHERE org_id = ? AND user_id = ?").bind(actor.orgId, userId).first();
  if (duplicate) throw new HttpError(409, "El usuario ya pertenece a esta organizaci\xF3n", "duplicate_membership");
  const membershipId = uuid();
  statements.push(env.DB.prepare(`
    INSERT INTO memberships (id, org_id, user_id, role, location_scope, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(membershipId, actor.orgId, userId, role, JSON.stringify(locationScope), timestamp, timestamp));
  await env.DB.batch(statements);
  await writeAudit(env, actor, request, "user.create", "user", userId, { role, email });
  return { id: userId, membershipId, email, displayName, role, locationScope, active: true };
}
__name(createUser, "createUser");
async function updateUser(request, env, actor, userId) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  const body = await readJson(request);
  const membership = await env.DB.prepare(`
    SELECT m.id, m.role, m.active, u.email FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.org_id = ? AND m.user_id = ?
  `).bind(actor.orgId, userId).first();
  if (!membership) throw new HttpError(404, "Usuario no encontrado", "not_found");
  if (membership.role === ROLES.OWNER && actor.role !== ROLES.OWNER) throw new HttpError(403, "No puedes modificar al propietario", "forbidden");
  const role = body.role === void 0 ? membership.role : String(body.role);
  if (!Object.values(ROLES).includes(role)) throw new HttpError(400, "Rol inv\xE1lido", "invalid_role");
  if (role === ROLES.OWNER && actor.role !== ROLES.OWNER) throw new HttpError(403, "Solo el propietario puede asignar ese rol", "forbidden");
  const active = body.active === void 0 ? Number(membership.active) : body.active ? 1 : 0;
  const locationScope = await validateLocationScope(env, actor, body.locationScope, role);
  await env.DB.prepare(`UPDATE memberships SET role = ?, location_scope = ?, active = ?, updated_at = ? WHERE org_id = ? AND user_id = ?`).bind(role, JSON.stringify(locationScope), active, nowIso(), actor.orgId, userId).run();
  if (!active) {
    await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE org_id = ? AND user_id = ? AND revoked_at IS NULL").bind(nowIso(), actor.orgId, userId).run();
  }
  await writeAudit(env, actor, request, active ? "user.update" : "user.revoke", "user", userId, { role, active: Boolean(active) });
  return { id: userId, email: membership.email, role, active: Boolean(active), locationScope };
}
__name(updateUser, "updateUser");
async function resetPassword(request, env, actor, userId) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  const body = await readJson(request);
  const membership = await env.DB.prepare("SELECT role FROM memberships WHERE org_id = ? AND user_id = ?").bind(actor.orgId, userId).first();
  if (!membership) throw new HttpError(404, "Usuario no encontrado", "not_found");
  if (membership.role === ROLES.OWNER && actor.role !== ROLES.OWNER) throw new HttpError(403, "No puedes restablecer al propietario", "forbidden");
  const result = await hashPassword(String(body.password || ""));
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_salt = ?, password_hash = ?, password_algorithm = ?, updated_at = ? WHERE id = ?").bind(result.salt, result.hash, result.algorithm, nowIso(), userId),
    env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND org_id = ? AND revoked_at IS NULL").bind(nowIso(), userId, actor.orgId)
  ]);
  await writeAudit(env, actor, request, "user.password_reset", "user", userId);
  return { reset: true, sessionsRevoked: true };
}
__name(resetPassword, "resetPassword");
async function listSessions(env, actor) {
  const rows4 = await env.DB.prepare(`
    SELECT s.id, s.user_id, s.user_agent, s.created_at, s.last_seen_at, s.revoked_at,
      u.email, u.display_name
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.org_id = ? AND (? IN ('owner','admin') OR s.user_id = ?)
    ORDER BY s.created_at DESC LIMIT 200
  `).bind(actor.orgId, actor.role, actor.userId).all();
  return (rows4.results || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    current: row.id === actor.sessionId
  }));
}
__name(listSessions, "listSessions");
async function revokeSession(request, env, actor, sessionId) {
  const session = await env.DB.prepare("SELECT id, user_id FROM sessions WHERE id = ? AND org_id = ?").bind(sessionId, actor.orgId).first();
  if (!session) throw new HttpError(404, "Sesi\xF3n no encontrada", "not_found");
  if (session.user_id !== actor.userId) assertMinimumRole(actor.role, ROLES.ADMIN);
  await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").bind(nowIso(), sessionId).run();
  await writeAudit(env, actor, request, "session.revoke", "session", sessionId, { userId: session.user_id });
  return { revoked: true };
}
__name(revokeSession, "revokeSession");

// ../professional/worker/src/api/catalog.js
function rows(result) {
  return result?.results || [];
}
__name(rows, "rows");
function locationAllowed(actor, locationId) {
  return actor.locationScope?.includes?.("*") || actor.locationScope?.includes?.(locationId);
}
__name(locationAllowed, "locationAllowed");
async function requireLocation(env, actor, locationId) {
  const location = await env.DB.prepare("SELECT * FROM locations WHERE id = ? AND org_id = ? AND active = 1").bind(locationId, actor.orgId).first();
  if (!location || !locationAllowed(actor, location.id)) throw new HttpError(404, "Local no encontrado", "not_found");
  return location;
}
__name(requireLocation, "requireLocation");
async function enforceCountLimit(env, actor, table, limitKey, extraWhere = "") {
  const limits = planFor(actor.organization.plan);
  const limit = Number(limits[limitKey]);
  if (!Number.isFinite(limit)) return;
  const allowedTables = /* @__PURE__ */ new Set(["locations", "suppliers", "products"]);
  if (!allowedTables.has(table)) throw new HttpError(500, "Configuraci\xF3n de l\xEDmite inv\xE1lida");
  const row = await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE org_id = ? ${extraWhere}`).bind(actor.orgId).first();
  if (Number(row?.total || 0) >= limit) {
    throw new HttpError(402, `El plan ${actor.organization.plan} permite hasta ${limit} ${limitKey}`, "plan_limit");
  }
}
__name(enforceCountLimit, "enforceCountLimit");
async function dashboard(env, actor) {
  const scope = actor.locationScope?.includes?.("*") ? "*" : (actor.locationScope || []).join(",");
  const orderScope = `(? = '*' OR instr(',' || ? || ',', ',' || location_id || ',') > 0)`;
  const invoiceScope = `(? = '*' OR EXISTS (SELECT 1 FROM invoice_location_links il WHERE il.invoice_id = invoices.id AND instr(',' || ? || ',', ',' || il.location_id || ',') > 0))`;
  const [orders, pending, spend, suppliers, products, issues, documents] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM orders WHERE org_id = ? AND created_at >= datetime('now','-30 day') AND ${orderScope}`).bind(actor.orgId, scope, scope).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM orders WHERE org_id = ? AND status IN ('requested','approved','sent','confirmed','partially_received') AND ${orderScope}`).bind(actor.orgId, scope, scope).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(gross_total),0) AS total FROM invoices WHERE org_id = ? AND invoice_date >= date('now','-30 day') AND status != 'void' AND ${invoiceScope}`).bind(actor.orgId, scope, scope).first(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM suppliers WHERE org_id = ? AND active = 1").bind(actor.orgId).first(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM products WHERE org_id = ? AND active = 1").bind(actor.orgId).first(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM reconciliation_issues WHERE org_id = ? AND status = 'open'").bind(actor.orgId).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM document_links dl WHERE dl.org_id = ? AND (? = '*' OR EXISTS (SELECT 1 FROM entity_snapshots es WHERE es.org_id=dl.org_id AND es.entity_type=dl.entity_type AND es.entity_id=dl.entity_id AND instr(',' || ? || ',', ',' || es.location_id || ',') > 0))`).bind(actor.orgId, scope, scope).first()
  ]);
  const recent = await env.DB.prepare(`
    SELECT o.id,o.folio,o.status,o.delivery_date,o.created_at,o.gross_total,o.location_id,
      s.name AS supplier_name,l.name AS location_name,u.display_name AS requested_by_name
    FROM orders o JOIN suppliers s ON s.id=o.supplier_id JOIN locations l ON l.id=o.location_id
    LEFT JOIN users u ON u.id=o.requested_by
    WHERE o.org_id=? AND (?='*' OR instr(',' || ? || ',', ',' || o.location_id || ',') > 0)
    ORDER BY o.created_at DESC LIMIT 8
  `).bind(actor.orgId, scope, scope).all();
  const [orderHistory, spendHistory] = await Promise.all([
    env.DB.prepare(`SELECT substr(created_at,1,7) AS month,COUNT(*) AS total FROM orders WHERE org_id=? AND created_at>=datetime('now','-12 month') AND ${orderScope} GROUP BY month ORDER BY month`).bind(actor.orgId, scope, scope).all(),
    env.DB.prepare(`SELECT substr(invoice_date,1,7) AS month,COALESCE(SUM(gross_total),0) AS total FROM invoices WHERE org_id=? AND invoice_date>=date('now','-12 month') AND status!='void' AND ${invoiceScope} GROUP BY month ORDER BY month`).bind(actor.orgId, scope, scope).all()
  ]);
  return {
    metrics: { orders30d: Number(orders?.total || 0), pendingOrders: Number(pending?.total || 0), spend30d: Number(spend?.total || 0), suppliers: Number(suppliers?.total || 0), products: Number(products?.total || 0), openIssues: Number(issues?.total || 0), archivedDocuments: Number(documents?.total || 0) },
    history: { orders: rows(orderHistory).map((row) => ({ month: row.month, total: Number(row.total || 0) })), spend: rows(spendHistory).map((row) => ({ month: row.month, total: Number(row.total || 0) })) },
    recentOrders: rows(recent).map((order) => ({ id: order.id, folio: order.folio, status: order.status, supplierName: order.supplier_name, locationName: order.location_name, requestedBy: order.requested_by_name, deliveryDate: order.delivery_date, grossTotal: Number(order.gross_total || 0), createdAt: order.created_at }))
  };
}
__name(dashboard, "dashboard");
async function listLocations(env, actor) {
  const result = await env.DB.prepare(`
    SELECT id, name, code, timezone, active, created_at, updated_at
    FROM locations WHERE org_id = ? ORDER BY active DESC, name COLLATE NOCASE
  `).bind(actor.orgId).all();
  return rows(result).filter((location) => locationAllowed(actor, location.id)).map((location) => ({ ...location, active: Boolean(location.active) }));
}
__name(listLocations, "listLocations");
async function createLocation(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  if (!actor.isPlatformOwner) await enforceCountLimit(env, actor, "locations", "locations", "AND active = 1");
  const body = await readJson(request);
  const id = uuid();
  const name = requireText(body.name, "Nombre del local", { max: 120 });
  const code = requireText(body.code || slugify(name).slice(0, 10).toUpperCase(), "C\xF3digo", { max: 12 }).toUpperCase();
  const timezone = String(body.timezone || "America/Santiago").slice(0, 60);
  const timestamp = nowIso();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO locations (id, org_id, name, code, timezone, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).bind(id, actor.orgId, name, code, timezone, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, 'Barra', 'BARRA', 1, ?, ?)`).bind(`${id}-cc-barra`, actor.orgId, id, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, 'Sal\xF3n', 'SALON', 1, ?, ?)`).bind(`${id}-cc-salon`, actor.orgId, id, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, 'Cocina', 'COCINA', 1, ?, ?)`).bind(`${id}-cc-cocina`, actor.orgId, id, timestamp, timestamp)
  ]);
  await writeAudit(env, actor, request, "location.create", "location", id, { name, code });
  return { id, name, code, timezone, active: true };
}
__name(createLocation, "createLocation");
async function listSuppliers(env, actor, url) {
  const query = String(url.searchParams.get("q") || "").trim();
  const activeOnly = url.searchParams.get("active") !== "all";
  const result = await env.DB.prepare(`
    SELECT s.*,
      COUNT(DISTINCT sp.product_id) AS product_count,
      MAX(i.invoice_date) AS last_invoice_date
    FROM suppliers s
    LEFT JOIN supplier_products sp ON sp.supplier_id = s.id AND sp.active = 1
    LEFT JOIN invoices i ON i.supplier_id = s.id AND i.status != 'void'
    WHERE s.org_id = ?
      AND (? = '' OR s.name LIKE '%' || ? || '%' OR s.rut LIKE '%' || ? || '%')
      AND (? = 0 OR s.active = 1)
    GROUP BY s.id
    ORDER BY s.active DESC, s.name COLLATE NOCASE
    LIMIT 500
  `).bind(actor.orgId, query, query, query, activeOnly ? 1 : 0).all();
  return rows(result).map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    legalName: supplier.legal_name,
    rut: supplier.rut,
    email: supplier.email,
    phone: supplier.phone,
    contactName: supplier.contact_name,
    leadDays: Number(supplier.lead_days || 0),
    cutoffTime: supplier.cutoff_time,
    minimumOrder: Number(supplier.minimum_order || 0),
    paymentTerms: supplier.payment_terms,
    active: Boolean(supplier.active),
    productCount: Number(supplier.product_count || 0),
    lastInvoiceDate: supplier.last_invoice_date
  }));
}
__name(listSuppliers, "listSuppliers");
async function createSupplier(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  await enforceCountLimit(env, actor, "suppliers", "suppliers", "AND active = 1");
  const body = await readJson(request);
  const id = uuid();
  const name = requireText(body.name, "Nombre del proveedor", { max: 160 });
  const data = {
    legalName: optionalText(body.legalName, { max: 180 }),
    rut: body.rut ? normalizeRut(body.rut) : "",
    email: optionalText(body.email, { max: 180 }).toLowerCase(),
    phone: optionalText(body.phone, { max: 40 }),
    contactName: optionalText(body.contactName, { max: 120 }),
    leadDays: integer(body.leadDays, { min: 0, max: 365 }),
    cutoffTime: optionalText(body.cutoffTime, { max: 10 }),
    minimumOrder: integer(body.minimumOrder, { min: 0, max: 999999999 }),
    paymentTerms: optionalText(body.paymentTerms, { max: 240 })
  };
  await env.DB.prepare(`
    INSERT INTO suppliers
      (id, org_id, name, legal_name, rut, email, phone, contact_name, lead_days, cutoff_time, minimum_order, payment_terms, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(id, actor.orgId, name, data.legalName, data.rut, data.email, data.phone, data.contactName, data.leadDays, data.cutoffTime, data.minimumOrder, data.paymentTerms, nowIso(), nowIso()).run();
  await writeAudit(env, actor, request, "supplier.create", "supplier", id, { name, rut: data.rut });
  return { id, name, ...data, active: true };
}
__name(createSupplier, "createSupplier");
async function listCategories(env, actor) {
  const result = await env.DB.prepare("SELECT id, name, sort_order, active FROM categories WHERE org_id = ? ORDER BY sort_order, name COLLATE NOCASE").bind(actor.orgId).all();
  return rows(result).map((category) => ({ id: category.id, name: category.name, sortOrder: Number(category.sort_order), active: Boolean(category.active) }));
}
__name(listCategories, "listCategories");
async function validateCostCenterIds(env, actor, requested, { locationId = "" } = {}) {
  const all = rows(await env.DB.prepare(`
    SELECT id, location_id, name, code FROM cost_centers
    WHERE org_id = ? AND active = 1
    ORDER BY CASE code WHEN 'BARRA' THEN 0 WHEN 'SALON' THEN 1 WHEN 'COCINA' THEN 2 ELSE 3 END, name COLLATE NOCASE
  `).bind(actor.orgId).all()).filter((center) => locationAllowed(actor, center.location_id));
  const values = [...new Set((Array.isArray(requested) ? requested : []).map(String).filter(Boolean))];
  if (!values.length) {
    const preferred = all.find((center) => (!locationId || center.location_id === locationId) && center.code === "BARRA") || all.find((center) => !locationId || center.location_id === locationId);
    if (!preferred) throw new HttpError(400, "No hay centros de costo disponibles", "missing_cost_center");
    return [preferred.id];
  }
  const valid = new Set(all.filter((center) => !locationId || center.location_id === locationId).map((center) => center.id));
  if (values.some((id) => !valid.has(id))) throw new HttpError(400, "Centro de costo inv\xE1lido", "invalid_cost_center");
  return values;
}
__name(validateCostCenterIds, "validateCostCenterIds");
async function listCostCenters(env, actor, url) {
  const locationId = String(url.searchParams.get("locationId") || "");
  const result = await env.DB.prepare(`
    SELECT cc.id, cc.location_id, cc.name, cc.code, cc.active, l.name AS location_name,
      COUNT(DISTINCT pcc.product_id) AS product_count,
      COUNT(DISTINCT occ.order_id) AS order_count
    FROM cost_centers cc
    JOIN locations l ON l.id = cc.location_id
    LEFT JOIN product_cost_centers pcc ON pcc.cost_center_id = cc.id
    LEFT JOIN order_cost_centers occ ON occ.cost_center_id = cc.id
    WHERE cc.org_id = ? AND (? = '' OR cc.location_id = ?)
    GROUP BY cc.id
    ORDER BY l.name COLLATE NOCASE, CASE cc.code WHEN 'BARRA' THEN 0 WHEN 'SALON' THEN 1 WHEN 'COCINA' THEN 2 ELSE 3 END, cc.name COLLATE NOCASE
  `).bind(actor.orgId, locationId, locationId).all();
  return rows(result).filter((center) => locationAllowed(actor, center.location_id)).map((center) => ({
    id: center.id,
    locationId: center.location_id,
    locationName: center.location_name,
    name: center.name,
    code: center.code,
    active: Boolean(center.active),
    productCount: Number(center.product_count || 0),
    orderCount: Number(center.order_count || 0)
  }));
}
__name(listCostCenters, "listCostCenters");
async function createCostCenter(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  const body = await readJson(request);
  const location = await requireLocation(env, actor, String(body.locationId || ""));
  const name = requireText(body.name, "Nombre del centro de costo", { max: 100 });
  const code = requireText(body.code || slugify(name).replace(/-/g, "").slice(0, 12).toUpperCase(), "C\xF3digo", { max: 12 }).toUpperCase();
  const id = uuid();
  const timestamp = nowIso();
  try {
    await env.DB.prepare(`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).bind(id, actor.orgId, location.id, name, code, timestamp, timestamp).run();
  } catch (error) {
    if (/UNIQUE/i.test(String(error?.message || error))) throw new HttpError(409, "Ya existe un centro con ese nombre o c\xF3digo", "duplicate_cost_center");
    throw error;
  }
  await writeAudit(env, actor, request, "cost_center.create", "cost_center", id, { locationId: location.id, name, code });
  return { id, locationId: location.id, locationName: location.name, name, code, active: true, productCount: 0, orderCount: 0 };
}
__name(createCostCenter, "createCostCenter");
async function setProductCostCenters(request, env, actor, productId) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  const product = await env.DB.prepare("SELECT id FROM products WHERE id = ? AND org_id = ?").bind(productId, actor.orgId).first();
  if (!product) throw new HttpError(404, "Producto no encontrado", "not_found");
  const body = await readJson(request);
  const ids = await validateCostCenterIds(env, actor, body.costCenterIds);
  const timestamp = nowIso();
  const statements = [env.DB.prepare("DELETE FROM product_cost_centers WHERE org_id = ? AND product_id = ?").bind(actor.orgId, productId)];
  ids.forEach((id) => statements.push(env.DB.prepare("INSERT INTO product_cost_centers (org_id, product_id, cost_center_id, created_at) VALUES (?, ?, ?, ?)").bind(actor.orgId, productId, id, timestamp)));
  await env.DB.batch(statements);
  await writeAudit(env, actor, request, "product.cost_centers", "product", productId, { costCenterIds: ids });
  return { productId, costCenterIds: ids };
}
__name(setProductCostCenters, "setProductCostCenters");
async function listProducts(env, actor, url) {
  const query = String(url.searchParams.get("q") || "").trim();
  const supplierId = String(url.searchParams.get("supplierId") || "");
  const costCenterId = String(url.searchParams.get("costCenterId") || "");
  const result = await env.DB.prepare(`
    SELECT p.id, p.name, p.brand, p.variant, p.content_value, p.content_unit, p.base_unit, p.barcode, p.active,
      c.id AS category_id, c.name AS category_name,
      sp.id AS supplier_product_id, sp.supplier_id, sp.supplier_sku, sp.supplier_name, sp.order_unit,
      sp.units_per_order_unit, sp.minimum_quantity, sp.quantity_multiple, sp.last_gross_unit_price,
      s.name AS supplier_name_display
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN supplier_products sp ON sp.product_id = p.id AND sp.active = 1 AND (? = '' OR sp.supplier_id = ?)
    LEFT JOIN suppliers s ON s.id = sp.supplier_id
    WHERE p.org_id = ?
      AND (? = '' OR p.name LIKE '%' || ? || '%' OR p.brand LIKE '%' || ? || '%' OR p.barcode LIKE '%' || ? || '%')
      AND (? = '' OR sp.supplier_id = ?)
      AND (? = '' OR EXISTS (SELECT 1 FROM product_cost_centers pccf WHERE pccf.product_id = p.id AND pccf.cost_center_id = ?))
    ORDER BY p.active DESC, c.sort_order, p.name COLLATE NOCASE
    LIMIT 1000
  `).bind(supplierId, supplierId, actor.orgId, query, query, query, query, supplierId, supplierId, costCenterId, costCenterId).all();
  const map = /* @__PURE__ */ new Map();
  for (const row of rows(result)) {
    if (!map.has(row.id)) map.set(row.id, {
      id: row.id,
      name: row.name,
      brand: row.brand,
      variant: row.variant,
      categoryId: row.category_id,
      categoryName: row.category_name,
      contentValue: Number(row.content_value || 0),
      contentUnit: row.content_unit,
      baseUnit: row.base_unit,
      barcode: row.barcode,
      active: Boolean(row.active),
      suppliers: [],
      costCenters: []
    });
    if (row.supplier_product_id) map.get(row.id).suppliers.push({
      id: row.supplier_product_id,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name_display,
      supplierSku: row.supplier_sku,
      supplierProductName: row.supplier_name,
      orderUnit: row.order_unit,
      unitsPerOrderUnit: Number(row.units_per_order_unit || 1),
      minimumQuantity: Number(row.minimum_quantity || 0),
      quantityMultiple: Number(row.quantity_multiple || 1),
      lastGrossUnitPrice: Number(row.last_gross_unit_price || 0)
    });
  }
  const centerRows = await env.DB.prepare(`
    SELECT pcc.product_id, cc.id, cc.location_id, cc.name, cc.code, l.name AS location_name
    FROM product_cost_centers pcc
    JOIN cost_centers cc ON cc.id = pcc.cost_center_id AND cc.active = 1
    JOIN locations l ON l.id = cc.location_id
    WHERE pcc.org_id = ?
    ORDER BY l.name COLLATE NOCASE, cc.name COLLATE NOCASE
  `).bind(actor.orgId).all();
  for (const center of rows(centerRows)) {
    const product = map.get(center.product_id);
    if (product && locationAllowed(actor, center.location_id)) product.costCenters.push({ id: center.id, locationId: center.location_id, locationName: center.location_name, name: center.name, code: center.code });
  }
  return [...map.values()];
}
__name(listProducts, "listProducts");
async function createProduct(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  await enforceCountLimit(env, actor, "products", "products", "AND active = 1");
  const body = await readJson(request);
  const id = uuid();
  const name = requireText(body.name, "Nombre del producto", { max: 200 });
  const categoryId = body.categoryId ? String(body.categoryId) : null;
  if (categoryId) {
    const category = await env.DB.prepare("SELECT id FROM categories WHERE id = ? AND org_id = ?").bind(categoryId, actor.orgId).first();
    if (!category) throw new HttpError(400, "Categor\xEDa inv\xE1lida", "invalid_category");
  }
  const costCenterIds = await validateCostCenterIds(env, actor, body.costCenterIds);
  const timestamp = nowIso();
  const statements = [env.DB.prepare(`
    INSERT INTO products
      (id, org_id, category_id, name, brand, variant, content_value, content_unit, base_unit, barcode, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(
    id,
    actor.orgId,
    categoryId,
    name,
    optionalText(body.brand, { max: 100 }),
    optionalText(body.variant, { max: 100 }),
    number(body.contentValue, { min: 0, max: 999999 }),
    optionalText(body.contentUnit || "ml", { max: 20 }),
    optionalText(body.baseUnit || "unidad", { max: 30 }),
    optionalText(body.barcode, { max: 80 }),
    timestamp,
    timestamp
  )];
  costCenterIds.forEach((centerId) => statements.push(env.DB.prepare("INSERT INTO product_cost_centers (org_id, product_id, cost_center_id, created_at) VALUES (?, ?, ?, ?)").bind(actor.orgId, id, centerId, timestamp)));
  await env.DB.batch(statements);
  await writeAudit(env, actor, request, "product.create", "product", id, { name, costCenterIds });
  return { id, name, categoryId, costCenterIds, active: true };
}
__name(createProduct, "createProduct");
async function linkSupplierProduct(request, env, actor, productId) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  const body = await readJson(request);
  const [product, supplier] = await Promise.all([
    env.DB.prepare("SELECT id, name FROM products WHERE id = ? AND org_id = ?").bind(productId, actor.orgId).first(),
    env.DB.prepare("SELECT id, name FROM suppliers WHERE id = ? AND org_id = ?").bind(String(body.supplierId || ""), actor.orgId).first()
  ]);
  if (!product || !supplier) throw new HttpError(400, "Producto o proveedor inv\xE1lido", "invalid_relation");
  const id = uuid();
  const units = number(body.unitsPerOrderUnit, { min: 1e-3, max: 1e5, fallback: 1 });
  const multiple = number(body.quantityMultiple, { min: 1e-3, max: 1e5, fallback: 1 });
  await env.DB.prepare(`
    INSERT INTO supplier_products
      (id, org_id, supplier_id, product_id, supplier_sku, supplier_name, order_unit, units_per_order_unit, minimum_quantity, quantity_multiple, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(supplier_id, product_id)
    DO UPDATE SET supplier_sku = excluded.supplier_sku, supplier_name = excluded.supplier_name,
      order_unit = excluded.order_unit, units_per_order_unit = excluded.units_per_order_unit,
      minimum_quantity = excluded.minimum_quantity, quantity_multiple = excluded.quantity_multiple,
      active = 1, updated_at = excluded.updated_at
  `).bind(
    id,
    actor.orgId,
    supplier.id,
    product.id,
    optionalText(body.supplierSku, { max: 100 }),
    optionalText(body.supplierProductName || product.name, { max: 220 }),
    optionalText(body.orderUnit || "unidad", { max: 60 }),
    units,
    number(body.minimumQuantity, { min: 0, max: 1e5 }),
    multiple,
    nowIso(),
    nowIso()
  ).run();
  await writeAudit(env, actor, request, "supplier_product.link", "product", productId, { supplierId: supplier.id, unitsPerOrderUnit: units });
  return { productId, supplierId: supplier.id, unitsPerOrderUnit: units };
}
__name(linkSupplierProduct, "linkSupplierProduct");

// ../professional/worker/src/storage.js
import { Buffer as Buffer3 } from "node:buffer";
var encoder = new TextEncoder();
var CHUNK_BYTES = 192 * 1024;
var CHUNK_BATCH = 20;
function ascii(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, " ").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
__name(ascii, "ascii");
function minimalPdf(lines) {
  const content = ["BT", "/F1 10 Tf", "42 800 Td"];
  lines.slice(0, 52).forEach((line, index) => {
    if (index) content.push("0 -14 Td");
    content.push(`(${ascii(line).slice(0, 105)}) Tj`);
  });
  content.push("ET");
  const stream = content.join("\n");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${encoder.encode(stream).byteLength} >>
stream
${stream}
endstream`];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(output).byteLength);
    output += `${index + 1} 0 obj
${object}
endobj
`;
  });
  const xref = encoder.encode(output).byteLength;
  output += `xref
0 ${objects.length + 1}
0000000000 65535 f 
`;
  offsets.slice(1).forEach((offset) => {
    output += `${String(offset).padStart(10, "0")} 00000 n 
`;
  });
  output += `trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xref}
%%EOF`;
  return encoder.encode(output);
}
__name(minimalPdf, "minimalPdf");
async function storeD1Chunks(env, fileId, data, createdAt) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const pending = [];
  for (let offset = 0, index = 0; offset < bytes.length; offset += CHUNK_BYTES, index++) {
    const encoded = Buffer3.from(bytes.subarray(offset, Math.min(offset + CHUNK_BYTES, bytes.length))).toString("base64");
    pending.push(env.DB.prepare("INSERT INTO file_chunks (file_id, chunk_index, data_base64, created_at) VALUES (?, ?, ?, ?)").bind(fileId, index, encoded, createdAt));
    if (pending.length === CHUNK_BATCH) await env.DB.batch(pending.splice(0));
  }
  if (pending.length) await env.DB.batch(pending);
}
__name(storeD1Chunks, "storeD1Chunks");
async function storeBytes(env, actor, { bytes, fileName, contentType = "application/octet-stream", purpose = "general", entityType = "", entityId = "", documentKind = "", revision = 1, metadata = {} }) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const fileId = uuid();
  const safeName = sanitizeFileName(fileName || "archivo");
  const backend = env.FILES ? "r2" : "d1";
  const key = `${backend}/${actor.orgId}/${purpose}/${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}/${fileId}-${safeName}`;
  const digest = await sha256(data);
  const createdAt = nowIso();
  if (env.FILES) {
    await env.FILES.put(key, data, { httpMetadata: { contentType }, customMetadata: { orgId: actor.orgId, uploadedBy: actor.userId, sha256: digest, purpose, entityType, entityId } });
  }
  try {
    const statements = [env.DB.prepare(`INSERT INTO files (id, org_id, storage_key, file_name, content_type, size_bytes, sha256, purpose, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(fileId, actor.orgId, key, fileName || safeName, contentType, data.byteLength, digest, purpose, actor.userId, createdAt)];
    if (entityType && entityId && documentKind) statements.push(env.DB.prepare(`INSERT INTO document_links (id, org_id, file_id, entity_type, entity_id, document_kind, revision, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(uuid(), actor.orgId, fileId, entityType, entityId, documentKind, Number(revision || 1), JSON.stringify(metadata || {}), createdAt));
    await env.DB.batch(statements);
    if (!env.FILES) await storeD1Chunks(env, fileId, data, createdAt);
  } catch (error) {
    if (env.FILES) await env.FILES.delete(key).catch(() => {
    });
    await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(fileId).run().catch(() => {
    });
    throw error;
  }
  return { id: fileId, key, name: fileName || safeName, size: data.byteLength, contentType, sha256: digest, purpose, documentKind, revision: Number(revision || 1), backend, createdAt };
}
__name(storeBytes, "storeBytes");
async function storeFile(env, actor, file, options = {}) {
  if (!(file instanceof File)) throw new HttpError(400, "Adjunta un archivo", "missing_file");
  return storeBytes(env, actor, { ...options, bytes: await file.arrayBuffer(), fileName: file.name || options.fileName || "archivo", contentType: file.type || options.contentType || "application/octet-stream" });
}
__name(storeFile, "storeFile");
async function linkExistingFile(env, actor, { fileId, entityType, entityId, documentKind, revision = 1, metadata = {} }) {
  const file = await env.DB.prepare("SELECT id FROM files WHERE id = ? AND org_id = ?").bind(fileId, actor.orgId).first();
  if (!file) throw new HttpError(404, "Archivo no encontrado", "not_found");
  await env.DB.prepare(`INSERT OR IGNORE INTO document_links (id, org_id, file_id, entity_type, entity_id, document_kind, revision, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(uuid(), actor.orgId, fileId, entityType, entityId, documentKind, Number(revision || 1), JSON.stringify(metadata || {}), nowIso()).run();
  return { linked: true };
}
__name(linkExistingFile, "linkExistingFile");
async function listDocuments(env, actor, { entityType = "", entityId = "", kind = "" } = {}) {
  const result = await env.DB.prepare(`SELECT dl.id,dl.entity_type,dl.entity_id,dl.document_kind,dl.revision,dl.metadata_json,dl.created_at,f.id AS file_id,f.storage_key,f.file_name,f.content_type,f.size_bytes,f.sha256 FROM document_links dl JOIN files f ON f.id=dl.file_id WHERE dl.org_id=? AND (?='' OR dl.entity_type=?) AND (?='' OR dl.entity_id=?) AND (?='' OR dl.document_kind=?) ORDER BY dl.created_at DESC LIMIT 1000`).bind(actor.orgId, entityType, entityType, entityId, entityId, kind, kind).all();
  return (result.results || []).map((row) => ({ id: row.id, fileId: row.file_id, key: row.storage_key, name: row.file_name, contentType: row.content_type, size: Number(row.size_bytes || 0), sha256: row.sha256, entityType: row.entity_type, entityId: row.entity_id, kind: row.document_kind, revision: Number(row.revision || 1), metadata: JSON.parse(row.metadata_json || "{}"), createdAt: row.created_at }));
}
__name(listDocuments, "listDocuments");
async function recordSnapshot(env, actor, { entityType, entityId, locationId = null, revision = 1, snapshot }) {
  await env.DB.prepare("INSERT INTO entity_snapshots (id, org_id, location_id, entity_type, entity_id, revision, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(uuid(), actor.orgId, locationId, entityType, entityId, Number(revision || 1), JSON.stringify(snapshot), nowIso()).run();
}
__name(recordSnapshot, "recordSnapshot");
async function archiveOrderPdf(env, actor, order) {
  const lines = ["PEDIDOS PRO", `Folio: ${order.folio}`, `Marca: ${actor.organization?.name || ""}`, `Local: ${order.locationName || ""}`, `Centro de costo: ${order.costCenterName || "Barra"}`, `Proveedor: ${order.supplierName || ""}`, `Estado: ${order.status}`, `Revision: ${order.revision}`, `Entrega: ${order.deliveryDate || "-"}`, `Total: CLP ${Number(order.grossTotal || 0).toLocaleString("es-CL")}`, "", "Productos:"];
  (order.items || []).forEach((item, index) => lines.push(`${index + 1}. ${item.description} | ${item.quantityOrdered} ${item.orderUnit} | CLP ${Number(item.expectedGrossTotal || 0).toLocaleString("es-CL")}`));
  if (order.notes) lines.push("", `Notas: ${order.notes}`);
  lines.push("", `Generado: ${(/* @__PURE__ */ new Date()).toISOString()}`);
  const file = await storeBytes(env, actor, { bytes: minimalPdf(lines), fileName: `${order.folio}-r${order.revision}-${order.status}.pdf`, contentType: "application/pdf", purpose: "order-pdf", entityType: "order", entityId: order.id, documentKind: "order_pdf", revision: order.revision, metadata: { folio: order.folio, status: order.status, locationId: order.locationId } });
  await recordSnapshot(env, actor, { entityType: "order", entityId: order.id, locationId: order.locationId, revision: order.revision, snapshot: order });
  return file;
}
__name(archiveOrderPdf, "archiveOrderPdf");

// ../professional/worker/src/api/orders.js
function rows2(result) {
  return result?.results || [];
}
__name(rows2, "rows");
function locationAllowed2(actor, locationId) {
  return actor.locationScope?.includes?.("*") || actor.locationScope?.includes?.(locationId);
}
__name(locationAllowed2, "locationAllowed");
async function requireLocation2(env, actor, locationId) {
  const location = await env.DB.prepare("SELECT * FROM locations WHERE id = ? AND org_id = ? AND active = 1").bind(locationId, actor.orgId).first();
  if (!location || !locationAllowed2(actor, location.id)) throw new HttpError(404, "Local no encontrado", "not_found");
  return location;
}
__name(requireLocation2, "requireLocation");
async function requireCostCenter(env, actor, costCenterId, locationId) {
  const center = await env.DB.prepare("SELECT id, name, code, location_id FROM cost_centers WHERE id = ? AND org_id = ? AND location_id = ? AND active = 1").bind(costCenterId, actor.orgId, locationId).first();
  if (!center || !locationAllowed2(actor, center.location_id)) throw new HttpError(400, "Centro de costo inv\xE1lido para este local", "invalid_cost_center");
  return center;
}
__name(requireCostCenter, "requireCostCenter");
async function incrementUsage(env, orgId, metric, amount = 1) {
  const key = monthKey();
  await env.DB.prepare(`
    INSERT INTO usage_counters (org_id, month_key, metric, quantity, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(org_id, month_key, metric)
    DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at
  `).bind(orgId, key, metric, amount, nowIso()).run();
}
__name(incrementUsage, "incrementUsage");
async function usageValue(env, orgId, metric) {
  const row = await env.DB.prepare("SELECT quantity FROM usage_counters WHERE org_id = ? AND month_key = ? AND metric = ?").bind(orgId, monthKey(), metric).first();
  return Number(row?.quantity || 0);
}
__name(usageValue, "usageValue");
async function allocateFolio(env, actor, location, date = /* @__PURE__ */ new Date()) {
  const y = String(date.getUTCFullYear()).slice(-2);
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const prefix = String(location.code || "PED").replace(/[^A-Z0-9]/g, "").slice(0, 8) || "PED";
  const base = `${prefix}-${y}${m}${d}-`;
  const current = await env.DB.prepare(`SELECT folio FROM orders WHERE org_id = ? AND folio LIKE ? ORDER BY folio DESC LIMIT 1`).bind(actor.orgId, `${base}%`).first();
  const next = current?.folio ? Number(current.folio.slice(base.length)) + 1 : 1;
  return `${base}${String(next).padStart(3, "0")}`;
}
__name(allocateFolio, "allocateFolio");
function orderItemPayload(item) {
  return {
    supplierProductId: String(item.supplierProductId || ""),
    productId: String(item.productId || ""),
    description: requireText(item.description, "Descripci\xF3n del producto", { max: 240 }),
    quantity: number(item.quantity, { min: 1e-3, max: 1e5 }),
    orderUnit: optionalText(item.orderUnit || "unidad", { max: 60 }),
    unitsPerOrderUnit: number(item.unitsPerOrderUnit, { min: 1e-3, max: 1e5, fallback: 1 }),
    expectedGrossUnitPrice: integer(item.expectedGrossUnitPrice, { min: 0, max: 999999999 })
  };
}
__name(orderItemPayload, "orderItemPayload");
async function listOrders(env, actor, url) {
  const status = String(url.searchParams.get("status") || "");
  const query = String(url.searchParams.get("q") || "").trim();
  const costCenterId = String(url.searchParams.get("costCenterId") || "");
  const result = await env.DB.prepare(`
    SELECT o.id, o.folio, o.status, o.delivery_date, o.notes, o.currency, o.net_total, o.tax_total, o.gross_total,
      o.created_at, o.updated_at, o.sent_at, o.revision,
      s.id AS supplier_id, s.name AS supplier_name,
      l.id AS location_id, l.name AS location_name,
      cc.id AS cost_center_id, cc.name AS cost_center_name,
      u.display_name AS requested_by_name,
      COUNT(oi.id) AS item_count
    FROM orders o
    JOIN suppliers s ON s.id = o.supplier_id
    JOIN locations l ON l.id = o.location_id
    LEFT JOIN users u ON u.id = o.requested_by
    LEFT JOIN order_cost_centers occ ON occ.order_id = o.id
    LEFT JOIN cost_centers cc ON cc.id = occ.cost_center_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.org_id = ?
      AND (? = '' OR o.status = ?)
      AND (? = '' OR o.folio LIKE '%' || ? || '%' OR s.name LIKE '%' || ? || '%')
      AND (? = '' OR occ.cost_center_id = ?)
    GROUP BY o.id
    ORDER BY o.created_at DESC
    LIMIT 500
  `).bind(actor.orgId, status, status, query, query, query, costCenterId, costCenterId).all();
  return rows2(result).filter((order) => locationAllowed2(actor, order.location_id)).map((order) => ({
    id: order.id,
    folio: order.folio,
    status: order.status,
    supplierId: order.supplier_id,
    supplierName: order.supplier_name,
    locationId: order.location_id,
    locationName: order.location_name,
    costCenterId: order.cost_center_id,
    costCenterName: order.cost_center_name || "Barra",
    requestedBy: order.requested_by_name,
    deliveryDate: order.delivery_date,
    notes: order.notes,
    currency: order.currency,
    netTotal: Number(order.net_total || 0),
    taxTotal: Number(order.tax_total || 0),
    grossTotal: Number(order.gross_total || 0),
    itemCount: Number(order.item_count || 0),
    revision: Number(order.revision || 1),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    sentAt: order.sent_at
  }));
}
__name(listOrders, "listOrders");
async function getOrder(env, actor, orderId) {
  const order = await env.DB.prepare(`
    SELECT o.*, s.name AS supplier_name, l.name AS location_name,
      cc.id AS cost_center_id, cc.name AS cost_center_name,
      requester.display_name AS requested_by_name, approver.display_name AS approved_by_name
    FROM orders o
    JOIN suppliers s ON s.id = o.supplier_id
    JOIN locations l ON l.id = o.location_id
    LEFT JOIN order_cost_centers occ ON occ.order_id = o.id
    LEFT JOIN cost_centers cc ON cc.id = occ.cost_center_id
    LEFT JOIN users requester ON requester.id = o.requested_by
    LEFT JOIN users approver ON approver.id = o.approved_by
    WHERE o.id = ? AND o.org_id = ?
  `).bind(orderId, actor.orgId).first();
  if (!order || !locationAllowed2(actor, order.location_id)) throw new HttpError(404, "Pedido no encontrado", "not_found");
  const [items, events, receptions] = await Promise.all([
    env.DB.prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order, created_at`).bind(orderId).all(),
    env.DB.prepare(`SELECT e.*, u.display_name AS actor_name FROM order_events e LEFT JOIN users u ON u.id = e.actor_user_id WHERE e.order_id = ? ORDER BY e.created_at DESC`).bind(orderId).all(),
    env.DB.prepare(`SELECT id, status, received_at, created_at, notes FROM receptions WHERE order_id = ? ORDER BY created_at DESC`).bind(orderId).all()
  ]);
  return {
    id: order.id,
    folio: order.folio,
    status: order.status,
    supplierId: order.supplier_id,
    supplierName: order.supplier_name,
    locationId: order.location_id,
    locationName: order.location_name,
    costCenterId: order.cost_center_id,
    costCenterName: order.cost_center_name || "Barra",
    requestedBy: order.requested_by_name,
    approvedBy: order.approved_by_name,
    deliveryDate: order.delivery_date,
    notes: order.notes,
    currency: order.currency,
    netTotal: Number(order.net_total || 0),
    taxTotal: Number(order.tax_total || 0),
    grossTotal: Number(order.gross_total || 0),
    revision: Number(order.revision || 1),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: rows2(items).map((item) => ({
      id: item.id,
      supplierProductId: item.supplier_product_id,
      productId: item.product_id,
      description: item.description_snapshot,
      quantityOrdered: Number(item.quantity_ordered),
      orderUnit: item.order_unit_snapshot,
      unitsPerOrderUnit: Number(item.units_per_order_unit),
      expectedGrossUnitPrice: Number(item.expected_gross_unit_price || 0),
      expectedGrossTotal: Number(item.expected_gross_total || 0),
      quantityReceived: Number(item.quantity_received || 0),
      quantityRejected: Number(item.quantity_rejected || 0)
    })),
    events: rows2(events).map((event) => ({ id: event.id, from: event.from_status, to: event.to_status, reason: event.reason, actor: event.actor_name, createdAt: event.created_at })),
    receptions: rows2(receptions).map((reception) => ({ id: reception.id, status: reception.status, receivedAt: reception.received_at, notes: reception.notes, createdAt: reception.created_at }))
  };
}
__name(getOrder, "getOrder");
async function createOrder(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  const idempotencyKey = String(request.headers.get("Idempotency-Key") || "").trim().slice(0, 120);
  if (idempotencyKey) {
    const previous = await env.DB.prepare("SELECT response_json FROM idempotency_keys WHERE org_id = ? AND idempotency_key = ?").bind(actor.orgId, idempotencyKey).first();
    if (previous?.response_json) return JSON.parse(previous.response_json);
  }
  const limits = planFor(actor.organization.plan);
  const used = await usageValue(env, actor.orgId, "orders_created");
  if (used >= limits.ordersPerMonth) throw new HttpError(402, "L\xEDmite mensual de pedidos alcanzado", "plan_limit");
  const body = await readJson(request);
  const location = await requireLocation2(env, actor, String(body.locationId || ""));
  const costCenter = await requireCostCenter(env, actor, String(body.costCenterId || ""), location.id);
  const supplier = await env.DB.prepare("SELECT id, name FROM suppliers WHERE id = ? AND org_id = ? AND active = 1").bind(String(body.supplierId || ""), actor.orgId).first();
  if (!supplier) throw new HttpError(400, "Proveedor inv\xE1lido", "invalid_supplier");
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) throw new HttpError(400, "Agrega al menos un producto", "empty_order");
  if (rawItems.length > 500) throw new HttpError(400, "El pedido supera 500 l\xEDneas", "too_many_items");
  const items = rawItems.map(orderItemPayload);
  const id = uuid();
  const timestamp = nowIso();
  const folio = await allocateFolio(env, actor, location);
  const grossTotal = items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitsPerOrderUnit * item.expectedGrossUnitPrice), 0);
  const statements = [
    env.DB.prepare(`
      INSERT INTO orders
        (id, org_id, location_id, supplier_id, folio, status, requested_by, delivery_date, notes, currency, gross_total, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, 'CLP', ?, 1, ?, ?)
    `).bind(id, actor.orgId, location.id, supplier.id, folio, actor.userId, body.deliveryDate || null, optionalText(body.notes, { max: 2e3 }), grossTotal, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO order_events (id, org_id, order_id, actor_user_id, from_status, to_status, reason, created_at) VALUES (?, ?, ?, ?, '', 'draft', 'Pedido creado', ?)`).bind(uuid(), actor.orgId, id, actor.userId, timestamp),
    env.DB.prepare("INSERT INTO order_cost_centers (order_id, org_id, cost_center_id, created_at) VALUES (?, ?, ?, ?)").bind(id, actor.orgId, costCenter.id, timestamp)
  ];
  items.forEach((item, index) => {
    statements.push(env.DB.prepare(`
      INSERT INTO order_items
        (id, order_id, supplier_product_id, product_id, description_snapshot, quantity_ordered, order_unit_snapshot,
         units_per_order_unit, expected_gross_unit_price, expected_gross_total, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      uuid(),
      id,
      item.supplierProductId || null,
      item.productId || null,
      item.description,
      item.quantity,
      item.orderUnit,
      item.unitsPerOrderUnit,
      item.expectedGrossUnitPrice,
      Math.round(item.quantity * item.unitsPerOrderUnit * item.expectedGrossUnitPrice),
      index,
      timestamp,
      timestamp
    ));
  });
  await env.DB.batch(statements);
  await incrementUsage(env, actor.orgId, "orders_created", 1);
  await writeAudit(env, actor, request, "order.create", "order", id, { folio, supplierId: supplier.id, costCenterId: costCenter.id, items: items.length });
  const created = await getOrder(env, actor, id);
  created.pdfDocument = await archiveOrderPdf(env, actor, created);
  if (idempotencyKey) {
    await env.DB.prepare(`INSERT OR IGNORE INTO idempotency_keys (org_id, idempotency_key, request_hash, status_code, response_json, created_at) VALUES (?, ?, '', 200, ?, ?)`).bind(actor.orgId, idempotencyKey, JSON.stringify(created), nowIso()).run();
  }
  return created;
}
__name(createOrder, "createOrder");
async function updateOrder(request, env, actor, orderId) {
  assertMinimumRole(actor.role, ROLES.PURCHASER);
  const current = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND org_id = ?").bind(orderId, actor.orgId).first();
  if (!current || !locationAllowed2(actor, current.location_id)) throw new HttpError(404, "Pedido no encontrado", "not_found");
  if (!["draft", "rejected"].includes(current.status)) throw new HttpError(409, "Solo se pueden editar pedidos en borrador o rechazados", "invalid_state");
  const body = await readJson(request);
  const items = Array.isArray(body.items) ? body.items.map(orderItemPayload) : null;
  if (items && !items.length) throw new HttpError(400, "El pedido no puede quedar sin productos", "empty_order");
  const costCenter = body.costCenterId === void 0 ? null : await requireCostCenter(env, actor, String(body.costCenterId || ""), current.location_id);
  const statements = [];
  if (costCenter) statements.push(env.DB.prepare(`INSERT INTO order_cost_centers (order_id, org_id, cost_center_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(order_id) DO UPDATE SET cost_center_id = excluded.cost_center_id`).bind(orderId, actor.orgId, costCenter.id, nowIso()));
  let grossTotal = Number(current.gross_total || 0);
  if (items) {
    grossTotal = items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitsPerOrderUnit * item.expectedGrossUnitPrice), 0);
    statements.push(env.DB.prepare("DELETE FROM order_items WHERE order_id = ?").bind(orderId));
    items.forEach((item, index) => statements.push(env.DB.prepare(`
      INSERT INTO order_items
        (id, order_id, supplier_product_id, product_id, description_snapshot, quantity_ordered, order_unit_snapshot,
         units_per_order_unit, expected_gross_unit_price, expected_gross_total, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      uuid(),
      orderId,
      item.supplierProductId || null,
      item.productId || null,
      item.description,
      item.quantity,
      item.orderUnit,
      item.unitsPerOrderUnit,
      item.expectedGrossUnitPrice,
      Math.round(item.quantity * item.unitsPerOrderUnit * item.expectedGrossUnitPrice),
      index,
      nowIso(),
      nowIso()
    )));
  }
  statements.push(env.DB.prepare(`UPDATE orders SET delivery_date = ?, notes = ?, gross_total = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND org_id = ?`).bind(body.deliveryDate === void 0 ? current.delivery_date : body.deliveryDate || null, body.notes === void 0 ? current.notes : optionalText(body.notes, { max: 2e3 }), grossTotal, nowIso(), orderId, actor.orgId));
  await env.DB.batch(statements);
  await writeAudit(env, actor, request, "order.update", "order", orderId, { revision: Number(current.revision || 1) + 1 });
  const updated = await getOrder(env, actor, orderId);
  updated.pdfDocument = await archiveOrderPdf(env, actor, updated);
  return updated;
}
__name(updateOrder, "updateOrder");
function transitionPermission(to) {
  if (["requested", "sent", "confirmed", "cancelled"].includes(to)) return ROLES.PURCHASER;
  if (["approved", "rejected"].includes(to)) return ROLES.APPROVER;
  if (["partially_received", "received"].includes(to)) return ROLES.RECEIVER;
  if (["reconciled", "closed"].includes(to)) return ROLES.FINANCE;
  return ROLES.ADMIN;
}
__name(transitionPermission, "transitionPermission");
async function transitionOrder(request, env, actor, orderId) {
  const body = await readJson(request);
  const to = String(body.status || "");
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND org_id = ?").bind(orderId, actor.orgId).first();
  if (!order || !locationAllowed2(actor, order.location_id)) throw new HttpError(404, "Pedido no encontrado", "not_found");
  assertMinimumRole(actor.role, transitionPermission(to));
  if (!canTransition(order.status, to)) throw new HttpError(409, `No se puede pasar de ${order.status} a ${to}`, "invalid_transition");
  const reason = optionalText(body.reason, { max: 500 });
  const timestamp = nowIso();
  const approvedBy = to === "approved" ? actor.userId : order.approved_by;
  const sentAt = to === "sent" ? timestamp : order.sent_at;
  const cancelledAt = to === "cancelled" ? timestamp : order.cancelled_at;
  await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET status = ?, approved_by = ?, sent_at = ?, cancelled_at = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND org_id = ?`).bind(to, approvedBy, sentAt, cancelledAt, timestamp, orderId, actor.orgId),
    env.DB.prepare(`INSERT INTO order_events (id, org_id, order_id, actor_user_id, from_status, to_status, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(uuid(), actor.orgId, orderId, actor.userId, order.status, to, reason, timestamp)
  ]);
  await writeAudit(env, actor, request, "order.transition", "order", orderId, { from: order.status, to, reason });
  const transitioned = await getOrder(env, actor, orderId);
  transitioned.pdfDocument = await archiveOrderPdf(env, actor, transitioned);
  return transitioned;
}
__name(transitionOrder, "transitionOrder");
async function createReception(request, env, actor, orderId) {
  assertMinimumRole(actor.role, ROLES.RECEIVER);
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND org_id = ?").bind(orderId, actor.orgId).first();
  if (!order || !locationAllowed2(actor, order.location_id)) throw new HttpError(404, "Pedido no encontrado", "not_found");
  if (!["sent", "confirmed", "partially_received"].includes(order.status)) throw new HttpError(409, "El pedido a\xFAn no est\xE1 listo para recepci\xF3n", "invalid_state");
  const body = await readJson(request);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new HttpError(400, "Agrega cantidades recibidas", "empty_reception");
  const orderItems = rows2(await env.DB.prepare("SELECT * FROM order_items WHERE order_id = ?").bind(orderId).all());
  const orderMap = new Map(orderItems.map((item) => [item.id, item]));
  const receptionId = uuid();
  const timestamp = nowIso();
  let complete = true;
  const statements = [env.DB.prepare(`
    INSERT INTO receptions (id, org_id, order_id, location_id, supplier_id, status, received_by, received_at, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)
  `).bind(receptionId, actor.orgId, orderId, order.location_id, order.supplier_id, actor.userId, body.receivedAt || timestamp, optionalText(body.notes, { max: 1500 }), timestamp, timestamp)];
  for (const raw of items) {
    const orderItem = orderMap.get(String(raw.orderItemId || ""));
    if (!orderItem) throw new HttpError(400, "L\xEDnea de pedido inv\xE1lida", "invalid_order_item");
    const accepted = number(raw.quantityAccepted, { min: 0, max: 1e5 });
    const rejected = number(raw.quantityRejected, { min: 0, max: 1e5 });
    if (accepted + Number(orderItem.quantity_received || 0) < Number(orderItem.quantity_ordered || 0)) complete = false;
    statements.push(env.DB.prepare(`
      INSERT INTO reception_items
        (id, reception_id, order_item_id, quantity_delivered, quantity_accepted, quantity_rejected, rejection_reason, lot_number, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(uuid(), receptionId, orderItem.id, accepted + rejected, accepted, rejected, optionalText(raw.rejectionReason, { max: 500 }), optionalText(raw.lotNumber, { max: 100 }), raw.expiresAt || null, timestamp));
    statements.push(env.DB.prepare(`
      UPDATE order_items SET quantity_received = quantity_received + ?, quantity_rejected = quantity_rejected + ?, updated_at = ? WHERE id = ?
    `).bind(accepted, rejected, timestamp, orderItem.id));
  }
  const nextStatus = complete ? "received" : "partially_received";
  statements.push(env.DB.prepare("UPDATE orders SET status = ?, revision = revision + 1, updated_at = ? WHERE id = ?").bind(nextStatus, timestamp, orderId));
  statements.push(env.DB.prepare(`INSERT INTO order_events (id, org_id, order_id, actor_user_id, from_status, to_status, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(uuid(), actor.orgId, orderId, actor.userId, order.status, nextStatus, "Recepci\xF3n registrada", timestamp));
  await env.DB.batch(statements);
  await writeAudit(env, actor, request, "reception.create", "reception", receptionId, { orderId, status: nextStatus });
  const receivedOrder = await getOrder(env, actor, orderId);
  const pdfDocument = await archiveOrderPdf(env, actor, receivedOrder);
  return { id: receptionId, orderId, status: "completed", orderStatus: nextStatus, pdfDocument };
}
__name(createReception, "createReception");

// ../professional/worker/src/api/documents.js
import { Buffer as Buffer4 } from "node:buffer";
var FILE_CHUNK_BYTES = 128 * 1024;
var FILE_BATCH_SIZE = 20;
function rows3(result) {
  return result?.results || [];
}
__name(rows3, "rows");
function safeJson2(value, fallback = null) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}
__name(safeJson2, "safeJson");
function locationAllowed3(actor, locationId) {
  return actor.locationScope?.includes?.("*") || actor.locationScope?.includes?.(locationId);
}
__name(locationAllowed3, "locationAllowed");
async function incrementUsage2(env, orgId, metric, amount = 1) {
  const key = monthKey();
  await env.DB.prepare(`
    INSERT INTO usage_counters (org_id, month_key, metric, quantity, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(org_id, month_key, metric)
    DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at
  `).bind(orgId, key, metric, amount, nowIso()).run();
}
__name(incrementUsage2, "incrementUsage");
async function usageValue2(env, orgId, metric) {
  const row = await env.DB.prepare("SELECT quantity FROM usage_counters WHERE org_id = ? AND month_key = ? AND metric = ?").bind(orgId, monthKey(), metric).first();
  return Number(row?.quantity || 0);
}
__name(usageValue2, "usageValue");
async function listInvoices(env, actor, url) {
  const supplierId = String(url.searchParams.get("supplierId") || "");
  const result = await env.DB.prepare(`
    SELECT i.*, s.name AS supplier_name,
      GROUP_CONCAT(DISTINCT il.location_id) AS location_ids,
      GROUP_CONCAT(DISTINCT l.name) AS location_names,
      f.storage_key AS pdf_key, f.file_name AS pdf_name
    FROM invoices i
    JOIN suppliers s ON s.id = i.supplier_id
    LEFT JOIN invoice_location_links il ON il.invoice_id = i.id
    LEFT JOIN locations l ON l.id = il.location_id
    LEFT JOIN files f ON f.id = i.pdf_file_id
    WHERE i.org_id = ? AND (? = '' OR i.supplier_id = ?)
    GROUP BY i.id
    ORDER BY i.invoice_date DESC, i.created_at DESC LIMIT 500
  `).bind(actor.orgId, supplierId, supplierId).all();
  return rows3(result).filter((invoice) => {
    const locations = String(invoice.location_ids || "").split(",").filter(Boolean);
    return actor.locationScope?.includes?.("*") || locations.some((id) => locationAllowed3(actor, id));
  }).map((invoice) => ({
    id: invoice.id,
    supplierId: invoice.supplier_id,
    supplierName: invoice.supplier_name,
    invoiceNumber: invoice.invoice_number,
    documentType: invoice.document_type,
    invoiceDate: invoice.invoice_date,
    netTotal: Number(invoice.net_total || 0),
    taxTotal: Number(invoice.tax_total || 0),
    grossTotal: Number(invoice.gross_total || 0),
    status: invoice.status,
    createdAt: invoice.created_at,
    pdfFileId: invoice.pdf_file_id || null,
    pdfKey: invoice.pdf_key || "",
    pdfName: invoice.pdf_name || "",
    locationIds: String(invoice.location_ids || "").split(",").filter(Boolean),
    locationNames: String(invoice.location_names || "").split(",").filter(Boolean)
  }));
}
__name(listInvoices, "listInvoices");
async function createInvoice(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.RECEIVER);
  const body = await readJson(request);
  const supplierId = String(body.supplierId || "");
  const supplier = await env.DB.prepare("SELECT id, name FROM suppliers WHERE id = ? AND org_id = ? AND active = 1").bind(supplierId, actor.orgId).first();
  if (!supplier) throw new HttpError(400, "Proveedor inv\xE1lido", "invalid_supplier");
  const invoiceNumber = requireText(body.invoiceNumber, "N\xFAmero de factura", { max: 80 });
  const documentType = optionalText(body.documentType || "33", { max: 10 });
  const invoiceDate = requireText(body.invoiceDate, "Fecha de factura", { max: 20 });
  const duplicate = await env.DB.prepare(`
    SELECT id FROM invoices WHERE org_id = ? AND supplier_id = ? AND document_type = ? AND invoice_number = ?
  `).bind(actor.orgId, supplierId, documentType, invoiceNumber).first();
  if (duplicate) throw new HttpError(409, "Esta factura ya fue registrada", "duplicate_invoice");
  const sourceLines = Array.isArray(body.lines) ? body.lines : [];
  if (!sourceLines.length) throw new HttpError(400, "La factura no contiene l\xEDneas", "empty_invoice");
  if (sourceLines.length > 1e3) throw new HttpError(400, "La factura supera 1.000 l\xEDneas", "too_many_items");
  const totals = body.totals || {};
  const orderIds = [...new Set((Array.isArray(body.orderIds) ? body.orderIds : []).map(String).filter(Boolean))];
  const locationIds = /* @__PURE__ */ new Set();
  if (!orderIds.length) {
    const locationId = String(body.locationId || "");
    const location = await env.DB.prepare("SELECT id FROM locations WHERE id = ? AND org_id = ? AND active = 1").bind(locationId, actor.orgId).first();
    if (!location || !locationAllowed3(actor, location.id)) throw new HttpError(400, "Selecciona un local v\xE1lido", "invalid_location");
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
    invoiceId,
    actor.orgId,
    supplierId,
    invoiceNumber,
    documentType,
    invoiceDate,
    optionalText(body.currency || "CLP", { max: 10 }),
    integer(totals.net, { min: 0, max: 9999999999 }),
    integer(totals.vat ?? totals.tax, { min: 0, max: 9999999999 }),
    integer(totals.additionalTax, { min: 0, max: 9999999999 }),
    integer(totals.freight, { min: 0, max: 9999999999 }),
    integer(totals.total, { min: 0, max: 9999999999 }),
    optionalText(body.aiModel, { max: 100 }),
    number(body.aiConfidence, { min: 0, max: 1 }),
    actor.userId,
    timestamp,
    timestamp
  )];
  for (const [index, raw] of sourceLines.entries()) {
    const lineId = uuid();
    const productId = raw.productId ? String(raw.productId) : null;
    if (productId) {
      const product = await env.DB.prepare("SELECT id FROM products WHERE id = ? AND org_id = ?").bind(productId, actor.orgId).first();
      if (!product) throw new HttpError(400, `Producto inv\xE1lido en l\xEDnea ${index + 1}`, "invalid_product");
    }
    const totalUnits = number(raw.units ?? raw.totalUnits, { min: 0, max: 1e7 });
    const grossLineTotal = integer(raw.grossLineTotal, { min: 0, max: 9999999999 });
    const grossUnitPrice = integer(raw.grossUnitPrice || (totalUnits ? grossLineTotal / totalUnits : 0), { min: 0, max: 999999999 });
    const reviewStatus = productId ? "confirmed" : "unmatched";
    statements.push(env.DB.prepare(`
      INSERT INTO invoice_lines
        (id, invoice_id, supplier_product_id, product_id, source_description, supplier_sku,
         package_quantity, units_per_package, total_units, net_line_total, tax_line_total,
         additional_tax_line_total, gross_line_total, gross_unit_price, match_confidence,
         match_method, review_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      lineId,
      invoiceId,
      raw.supplierProductId || null,
      productId,
      requireText(raw.sourceDescription || raw.sourceLine || raw.descriptionOriginal || raw.description, `Descripci\xF3n l\xEDnea ${index + 1}`, { max: 500 }),
      optionalText(raw.supplierSku || raw.code, { max: 100 }),
      number(raw.packageQty ?? raw.invoiceQuantity, { min: 0, max: 1e6 }),
      number(raw.packSize, { min: 1e-3, max: 1e5, fallback: 1 }),
      totalUnits,
      integer(raw.netLineTotal, { min: 0, max: 9999999999 }),
      integer(raw.vatLine ?? raw.taxLineTotal, { min: 0, max: 9999999999 }),
      integer(raw.additionalTaxLine ?? raw.additionalTaxLineTotal, { min: 0, max: 9999999999 }),
      grossLineTotal,
      grossUnitPrice,
      number(raw.confidence ?? raw.matchConfidence, { min: 0, max: 1 }),
      optionalText(raw.matchMethod || "manual-review", { max: 80 }),
      reviewStatus,
      timestamp,
      timestamp
    ));
    if (productId && grossUnitPrice > 0) {
      statements.push(env.DB.prepare(`
        INSERT INTO price_history (id, org_id, supplier_id, product_id, invoice_id, gross_unit_price, currency, observed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(uuid(), actor.orgId, supplierId, productId, invoiceId, grossUnitPrice, optionalText(body.currency || "CLP", { max: 10 }), invoiceDate, timestamp));
      statements.push(env.DB.prepare(`
        UPDATE supplier_products SET last_gross_unit_price = ?, last_purchased_at = ?, updated_at = ?
        WHERE org_id = ? AND supplier_id = ? AND product_id = ?
      `).bind(grossUnitPrice, invoiceDate, timestamp, actor.orgId, supplierId, productId));
    }
  }
  for (const orderId of orderIds) {
    const order = await env.DB.prepare("SELECT id, location_id FROM orders WHERE id = ? AND org_id = ? AND supplier_id = ?").bind(orderId, actor.orgId, supplierId).first();
    if (!order || !locationAllowed3(actor, order.location_id)) throw new HttpError(400, "Pedido relacionado inv\xE1lido", "invalid_order");
    locationIds.add(order.location_id);
    statements.push(env.DB.prepare(`
      INSERT INTO invoice_order_links (id, org_id, invoice_id, order_id, created_at) VALUES (?, ?, ?, ?, ?)
    `).bind(uuid(), actor.orgId, invoiceId, orderId, timestamp));
  }
  for (const locationId of locationIds) {
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO invoice_location_links (invoice_id, org_id, location_id, created_at) VALUES (?, ?, ?, ?)").bind(invoiceId, actor.orgId, locationId, timestamp));
  }
  await env.DB.batch(statements);
  if (body.sourceFileId) {
    await env.DB.prepare("UPDATE invoices SET pdf_file_id = ?, updated_at = ? WHERE id = ? AND org_id = ?").bind(String(body.sourceFileId), nowIso(), invoiceId, actor.orgId).run();
    await linkExistingFile(env, actor, { fileId: String(body.sourceFileId), entityType: "invoice", entityId: invoiceId, documentKind: "invoice_original", revision: 1, metadata: { invoiceNumber } });
  }
  await recordSnapshot(env, actor, { entityType: "invoice", entityId: invoiceId, locationId: [...locationIds][0] || null, revision: 1, snapshot: { ...body, id: invoiceId, supplierName: supplier.name, locationIds: [...locationIds] } });
  await writeAudit(env, actor, request, "invoice.create", "invoice", invoiceId, { supplierId, invoiceNumber, lines: sourceLines.length, orderIds });
  return { id: invoiceId, supplierId, supplierName: supplier.name, invoiceNumber, invoiceDate, status: "review", grossTotal: integer(totals.total, { min: 0 }), lineCount: sourceLines.length };
}
__name(createInvoice, "createInvoice");
async function analyzeInvoice(request, env, actor) {
  assertMinimumRole(actor.role, ROLES.RECEIVER);
  const limits = planFor(actor.organization.plan);
  const used = await usageValue2(env, actor.orgId, "ai_documents");
  if (used >= limits.aiDocumentsPerMonth) throw new HttpError(402, "L\xEDmite mensual de documentos con IA alcanzado", "plan_limit");
  const endpoint = String(env.AI_ENDPOINT || "https://pedidos-pro-ai.botreservasmultilocal.workers.dev").replace(/\/$/, "");
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Adjunta una factura", "missing_file");
  if (file.size > 12 * 1024 * 1024) throw new HttpError(413, "La factura supera 12 MB", "file_too_large");
  const sourceFile = await storeFile(env, actor, file, { purpose: "invoice-source" });
  await incrementUsage2(env, actor.orgId, "file_bytes", file.size);
  const upstream = new FormData();
  upstream.append("file", file, file.name || "factura");
  const orderFile = form.get("orderFile");
  if (orderFile instanceof File) upstream.append("orderFile", orderFile, orderFile.name || "pedido.pdf");
  let context = {};
  try {
    context = JSON.parse(String(form.get("context") || "{}"));
  } catch {
    throw new HttpError(400, "Contexto inv\xE1lido", "invalid_context");
  }
  context.organizationId = actor.orgId;
  context.requestedBy = actor.userId;
  upstream.append("context", JSON.stringify(context));
  const response = await fetch(`${endpoint}/v1/invoices/analyze`, {
    method: "POST",
    headers: { "X-Pedidos-Client": "professional-v2" },
    body: upstream
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new HttpError(502, payload.error || "La IA no pudo analizar la factura", "ai_failed", payload.attempts || null);
  await incrementUsage2(env, actor.orgId, "ai_documents", 1);
  await writeAudit(env, actor, request, "invoice.analyze", "invoice", "", { model: payload.model, fileName: file.name });
  return { ...payload, sourceFile };
}
__name(analyzeInvoice, "analyzeInvoice");
function buildStorageKey(actor, purpose, fileName, backend) {
  return `${backend}/${actor.orgId}/${purpose}/${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}/${uuid()}-${sanitizeFileName(fileName)}`;
}
__name(buildStorageKey, "buildStorageKey");
async function persistD1File(env, fileId, data, timestamp) {
  const bytes = new Uint8Array(data);
  const pending = [];
  for (let offset = 0, index = 0; offset < bytes.length; offset += FILE_CHUNK_BYTES, index++) {
    const chunk = Buffer4.from(bytes.subarray(offset, Math.min(offset + FILE_CHUNK_BYTES, bytes.length))).toString("base64");
    pending.push(env.DB.prepare(`
      INSERT INTO file_chunks (file_id, chunk_index, data_base64, created_at) VALUES (?, ?, ?, ?)
    `).bind(fileId, index, chunk, timestamp));
    if (pending.length >= FILE_BATCH_SIZE) await env.DB.batch(pending.splice(0));
  }
  if (pending.length) await env.DB.batch(pending);
}
__name(persistD1File, "persistD1File");
async function uploadFile(request, env, actor, url) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Adjunta un archivo", "missing_file");
  if (file.size > 20 * 1024 * 1024) throw new HttpError(413, "El archivo supera 20 MB", "file_too_large");
  const limits = planFor(actor.organization.plan);
  const usedBytes = await usageValue2(env, actor.orgId, "file_bytes");
  if (usedBytes + file.size > limits.fileBytes) {
    throw new HttpError(402, "L\xEDmite de almacenamiento del plan alcanzado", "plan_limit");
  }
  const purpose = String(url.searchParams.get("purpose") || "general").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "general";
  const data = await file.arrayBuffer();
  const hash = await sha256(data);
  const fileId = uuid();
  const contentType = file.type || "application/octet-stream";
  const backend = env.FILES ? "r2" : "d1";
  const key = buildStorageKey(actor, purpose, file.name || "archivo", backend);
  const timestamp = nowIso();
  if (env.FILES) {
    await env.FILES.put(key, data, {
      httpMetadata: { contentType },
      customMetadata: { orgId: actor.orgId, uploadedBy: actor.userId, sha256: hash }
    });
  }
  try {
    await env.DB.prepare(`
      INSERT INTO files (id, org_id, storage_key, file_name, content_type, size_bytes, sha256, purpose, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(fileId, actor.orgId, key, file.name || "archivo", contentType, file.size, hash, purpose, actor.userId, timestamp).run();
    if (!env.FILES) await persistD1File(env, fileId, data, timestamp);
  } catch (error) {
    await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(fileId).run().catch(() => {
    });
    if (env.FILES) await env.FILES.delete(key).catch(() => {
    });
    throw error;
  }
  await incrementUsage2(env, actor.orgId, "file_bytes", file.size);
  await writeAudit(env, actor, request, "file.upload", "file", fileId, { purpose, size: file.size, backend });
  return { id: fileId, key, name: file.name, size: file.size, contentType, backend };
}
__name(uploadFile, "uploadFile");
async function getFile(env, actor, key) {
  const record = await env.DB.prepare(`
    SELECT id, storage_key, file_name, content_type, size_bytes
    FROM files WHERE org_id = ? AND storage_key = ?
  `).bind(actor.orgId, key).first();
  if (!record) throw new HttpError(404, "Archivo no encontrado", "not_found");
  if (key.startsWith("d1/")) {
    const chunkResult = await env.DB.prepare(`
      SELECT data_base64 FROM file_chunks WHERE file_id = ? ORDER BY chunk_index
    `).bind(record.id).all();
    const chunks = rows3(chunkResult).map((row) => Buffer4.from(String(row.data_base64 || ""), "base64"));
    if (!chunks.length && Number(record.size_bytes || 0) > 0) {
      throw new HttpError(404, "Contenido de archivo no encontrado", "not_found");
    }
    const body = Buffer4.concat(chunks);
    return new Response(body, {
      headers: {
        "Content-Type": record.content_type || "application/octet-stream",
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(record.file_name || "archivo")}`,
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }
  if (!env.FILES) throw new HttpError(404, "Archivo no encontrado", "not_found");
  const object = await env.FILES.get(key);
  if (!object) throw new HttpError(404, "Archivo no encontrado", "not_found");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=60");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}
__name(getFile, "getFile");
async function auditLog(env, actor, url) {
  assertMinimumRole(actor.role, ROLES.ADMIN);
  const limit = Math.min(500, Math.max(1, integer(url.searchParams.get("limit"), { min: 1, max: 500, fallback: 100 })));
  const result = await env.DB.prepare(`
    SELECT id, actor_user_id, actor_email, action, entity_type, entity_id, metadata_json, created_at
    FROM audit_logs WHERE org_id = ? ORDER BY created_at DESC LIMIT ?
  `).bind(actor.orgId, limit).all();
  return rows3(result).map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: safeJson2(row.metadata_json, {}),
    createdAt: row.created_at
  }));
}
__name(auditLog, "auditLog");

// ../professional/worker/src/platform.js
function assertPlatformOwner(actor) {
  if (!actor?.isPlatformOwner) throw new HttpError(403, "Solo el owner principal puede administrar marcas", "platform_owner_required");
}
__name(assertPlatformOwner, "assertPlatformOwner");
async function createSession2(env, request, userId, orgId) {
  const token = randomToken(36);
  const tokenHash = await sha256(token);
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
  const ipHash = ip ? await sha256(`${env.IP_HASH_SALT || "pedidos-pro"}:${ip}`) : "";
  const id = uuid();
  const timestamp = nowIso();
  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, org_id, token_hash, user_agent, ip_hash, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, userId, orgId, tokenHash, String(request.headers.get("User-Agent") || "").slice(0, 300), ipHash, timestamp, timestamp).run();
  return { token, sessionId: id };
}
__name(createSession2, "createSession");
async function listBrands(env, actor) {
  const organizations = actor.isPlatformOwner ? await env.DB.prepare(`
        SELECT o.id, o.name, o.slug, o.plan, o.status, o.created_at,
          COALESCE(m.role, 'owner') AS role
        FROM organizations o
        LEFT JOIN memberships m ON m.org_id = o.id AND m.user_id = ? AND m.active = 1
        ORDER BY o.status = 'active' DESC, o.name COLLATE NOCASE
      `).bind(actor.userId).all() : await env.DB.prepare(`
        SELECT o.id, o.name, o.slug, o.plan, o.status, o.created_at, m.role
        FROM memberships m
        JOIN organizations o ON o.id = m.org_id
        WHERE m.user_id = ? AND m.active = 1
        ORDER BY o.status = 'active' DESC, o.name COLLATE NOCASE
      `).bind(actor.userId).all();
  const locationRows = await env.DB.prepare(`
    SELECT id, org_id, name, code, timezone, active FROM locations ORDER BY org_id, active DESC, name COLLATE NOCASE
  `).all();
  const locationsByOrg = /* @__PURE__ */ new Map();
  for (const location of locationRows.results || []) {
    const list = locationsByOrg.get(location.org_id) || [];
    list.push({ id: location.id, name: location.name, code: location.code, timezone: location.timezone, active: Boolean(location.active) });
    locationsByOrg.set(location.org_id, list);
  }
  return (organizations.results || []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    status: row.status,
    role: row.role,
    current: row.id === actor.orgId,
    locations: locationsByOrg.get(row.id) || [],
    createdAt: row.created_at
  }));
}
__name(listBrands, "listBrands");
async function createBrand(request, env, actor) {
  assertPlatformOwner(actor);
  const body = await readJson(request);
  const name = requireText(body.name, "Nombre de la marca", { max: 120 });
  const locationName = requireText(body.locationName || "Principal", "Local principal", { max: 120 });
  const slug = slugify(body.slug || name);
  if (!slug) throw new HttpError(400, "Slug inv\xE1lido", "invalid_slug");
  const duplicate = await env.DB.prepare("SELECT id FROM organizations WHERE slug = ?").bind(slug).first();
  if (duplicate) throw new HttpError(409, "Ya existe una marca con ese identificador", "duplicate_brand");
  const orgId = uuid();
  const locationId = uuid();
  const membershipId = uuid();
  const timestamp = nowIso();
  const locationCode = String(body.locationCode || slug).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) || "PRINCIPAL";
  const categories = ["Bebidas sin alcohol", "Cervezas", "Vinos", "Espumantes", "Destilados", "Licores", "Insumos", "Abarrotes", "Otros"];
  const statements = [
    env.DB.prepare(`
      INSERT INTO organizations (id, name, slug, plan, status, settings_json, created_at, updated_at)
      VALUES (?, ?, ?, 'free', 'active', ?, ?, ?)
    `).bind(orgId, name, slug, JSON.stringify({ brand: true }), timestamp, timestamp),
    env.DB.prepare(`
      INSERT INTO locations (id, org_id, name, code, timezone, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'America/Santiago', 1, ?, ?)
    `).bind(locationId, orgId, locationName, locationCode, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, 'Barra', 'BARRA', 1, ?, ?)`).bind(`${locationId}-cc-barra`, orgId, locationId, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, 'Sal\xF3n', 'SALON', 1, ?, ?)`).bind(`${locationId}-cc-salon`, orgId, locationId, timestamp, timestamp),
    env.DB.prepare(`INSERT INTO cost_centers (id, org_id, location_id, name, code, active, created_at, updated_at) VALUES (?, ?, ?, 'Cocina', 'COCINA', 1, ?, ?)`).bind(`${locationId}-cc-cocina`, orgId, locationId, timestamp, timestamp),
    env.DB.prepare(`
      INSERT INTO memberships (id, org_id, user_id, role, location_scope, active, created_at, updated_at)
      VALUES (?, ?, ?, 'owner', '["*"]', 1, ?, ?)
    `).bind(membershipId, orgId, actor.userId, timestamp, timestamp)
  ];
  categories.forEach((category, index) => statements.push(env.DB.prepare(`
    INSERT INTO categories (id, org_id, name, sort_order, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).bind(uuid(), orgId, category, index + 1, timestamp, timestamp)));
  await env.DB.batch(statements);
  await writeAudit(env, actor, request, "brand.create", "organization", orgId, { name, slug, locationId });
  return { id: orgId, name, slug, plan: "free", status: "active", location: { id: locationId, name: locationName, code: locationCode } };
}
__name(createBrand, "createBrand");
async function switchBrand(request, env, actor, orgId) {
  const organization = await env.DB.prepare("SELECT id, name, slug, plan, status FROM organizations WHERE id = ? AND status = 'active'").bind(orgId).first();
  if (!organization) throw new HttpError(404, "Marca no encontrada", "not_found");
  let membership = await env.DB.prepare("SELECT id, role, location_scope, active FROM memberships WHERE org_id = ? AND user_id = ?").bind(orgId, actor.userId).first();
  if (!membership && actor.isPlatformOwner) {
    const timestamp = nowIso();
    await env.DB.prepare(`
      INSERT INTO memberships (id, org_id, user_id, role, location_scope, active, created_at, updated_at)
      VALUES (?, ?, ?, 'owner', '["*"]', 1, ?, ?)
    `).bind(uuid(), orgId, actor.userId, timestamp, timestamp).run();
    membership = { role: ROLES.OWNER, location_scope: '["*"]', active: 1 };
  }
  if (!membership || !membership.active) throw new HttpError(403, "No tienes acceso a esta marca", "forbidden");
  const session = await createSession2(env, request, actor.userId, orgId);
  await writeAudit(env, { ...actor, orgId }, request, "brand.switch", "organization", orgId, { fromOrgId: actor.orgId });
  return {
    token: session.token,
    sessionId: session.sessionId,
    organization: { id: organization.id, name: organization.name, slug: organization.slug, plan: organization.plan },
    role: membership.role
  };
}
__name(switchBrand, "switchBrand");

// ../professional/worker/src/index.js
var APP_VERSION = "2.0.0-alpha.4";
function addPlatformHeaders(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("Origin") || "";
  for (const [name, value] of Object.entries(corsHeaders2(origin, env))) headers.set(name, value);
  for (const [name, value] of Object.entries(securityHeaders())) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
__name(addPlatformHeaders, "addPlatformHeaders");
function preflightResponse(request, env) {
  const origin = request.headers.get("Origin") || "";
  return new Response(null, { status: 204, headers: { ...corsHeaders2(origin, env), ...securityHeaders() } });
}
__name(preflightResponse, "preflightResponse");
async function applyOptionalRateLimit(env, key) {
  if (!env.RATE_LIMITER?.limit) return;
  const result = await env.RATE_LIMITER.limit({ key });
  if (!result.success) throw new HttpError(429, "Demasiadas solicitudes. Intenta nuevamente.", "rate_limited");
}
__name(applyOptionalRateLimit, "applyOptionalRateLimit");
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return preflightResponse(request, env);
  const schema = await ensureSchema(env);
  if (method === "GET" && path === "/health") {
    return ok({
      service: "pedidos-pro-platform",
      version: APP_VERSION,
      databaseConfigured: Boolean(env.DB),
      databaseInitialized: true,
      schemaVersion: schema.version,
      storageConfigured: Boolean(env.FILES || env.DB),
      storageBackend: env.FILES ? "r2" : "d1-chunks",
      r2Configured: Boolean(env.FILES),
      aiEndpoint: Boolean(env.AI_ENDPOINT),
      environment: env.ENVIRONMENT || "development",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }, request, env);
  }
  if (method === "POST" && path === "/api/bootstrap") {
    await applyOptionalRateLimit(env, `bootstrap:${request.headers.get("CF-Connecting-IP") || "unknown"}`);
    return ok(await bootstrap(request, env), request, env);
  }
  if (method === "POST" && path === "/api/auth/login") {
    await applyOptionalRateLimit(env, `login:${request.headers.get("CF-Connecting-IP") || "unknown"}`);
    return ok(await login(request, env), request, env);
  }
  const actor = await authenticate(request, env);
  await applyOptionalRateLimit(env, `user:${actor.userId}`);
  if (method === "POST" && path === "/api/auth/logout") return ok(await logout(request, env, actor), request, env);
  if (method === "GET" && path === "/api/me") return ok(await me(env, actor), request, env);
  if (method === "GET" && path === "/api/dashboard") return ok(await dashboard(env, actor), request, env);
  if (method === "GET" && path === "/api/brands") return ok({ brands: await listBrands(env, actor) }, request, env);
  if (method === "POST" && path === "/api/brands") return ok({ brand: await createBrand(request, env, actor) }, request, env);
  const brandParams = routeMatch(path, "/api/brands/:id/switch");
  if (brandParams && method === "POST") return ok(await switchBrand(request, env, actor, brandParams.id), request, env);
  if (method === "GET" && path === "/api/locations") return ok({ locations: await listLocations(env, actor) }, request, env);
  if (method === "POST" && path === "/api/locations") return ok({ location: await createLocation(request, env, actor) }, request, env);
  if (method === "GET" && path === "/api/cost-centers") return ok({ costCenters: await listCostCenters(env, actor, url) }, request, env);
  if (method === "POST" && path === "/api/cost-centers") return ok({ costCenter: await createCostCenter(request, env, actor) }, request, env);
  if (method === "GET" && path === "/api/categories") return ok({ categories: await listCategories(env, actor) }, request, env);
  if (method === "GET" && path === "/api/suppliers") return ok({ suppliers: await listSuppliers(env, actor, url) }, request, env);
  if (method === "POST" && path === "/api/suppliers") return ok({ supplier: await createSupplier(request, env, actor) }, request, env);
  if (method === "GET" && path === "/api/products") return ok({ products: await listProducts(env, actor, url) }, request, env);
  if (method === "POST" && path === "/api/products") return ok({ product: await createProduct(request, env, actor) }, request, env);
  const productCostCenterParams = routeMatch(path, "/api/products/:id/cost-centers");
  if (productCostCenterParams && method === "PUT") return ok(await setProductCostCenters(request, env, actor, productCostCenterParams.id), request, env);
  const productSupplierParams = routeMatch(path, "/api/products/:id/suppliers");
  if (productSupplierParams && method === "POST") return ok({ supplierProduct: await linkSupplierProduct(request, env, actor, productSupplierParams.id) }, request, env);
  if (method === "GET" && path === "/api/orders") return ok({ orders: await listOrders(env, actor, url) }, request, env);
  if (method === "POST" && path === "/api/orders") return ok({ order: await createOrder(request, env, actor) }, request, env);
  const orderParams = routeMatch(path, "/api/orders/:id");
  if (orderParams && method === "GET") return ok({ order: await getOrder(env, actor, orderParams.id) }, request, env);
  if (orderParams && method === "PATCH") return ok({ order: await updateOrder(request, env, actor, orderParams.id) }, request, env);
  const transitionParams = routeMatch(path, "/api/orders/:id/transition");
  if (transitionParams && method === "POST") return ok({ order: await transitionOrder(request, env, actor, transitionParams.id) }, request, env);
  const receptionParams = routeMatch(path, "/api/orders/:id/receptions");
  if (receptionParams && method === "POST") return ok({ reception: await createReception(request, env, actor, receptionParams.id) }, request, env);
  if (method === "GET" && path === "/api/invoices") return ok({ invoices: await listInvoices(env, actor, url) }, request, env);
  if (method === "POST" && path === "/api/invoices") return ok({ invoice: await createInvoice(request, env, actor) }, request, env);
  if (method === "POST" && path === "/api/invoices/analyze") return ok({ analysis: await analyzeInvoice(request, env, actor) }, request, env);
  if (method === "GET" && path === "/api/documents") return ok({ documents: await listDocuments(env, actor, { entityType: String(url.searchParams.get("entityType") || ""), entityId: String(url.searchParams.get("entityId") || ""), kind: String(url.searchParams.get("kind") || "") }) }, request, env);
  if (method === "POST" && path === "/api/files") return ok({ file: await uploadFile(request, env, actor, url) }, request, env);
  const fileParams = routeMatch(path, "/api/files/:key");
  if (fileParams && method === "GET") return getFile(env, actor, fileParams.key);
  if (method === "GET" && path === "/api/users") return ok({ users: await listUsers(env, actor) }, request, env);
  if (method === "POST" && path === "/api/users") return ok({ user: await createUser(request, env, actor) }, request, env);
  const userParams = routeMatch(path, "/api/users/:id");
  if (userParams && method === "PATCH") return ok({ user: await updateUser(request, env, actor, userParams.id) }, request, env);
  const passwordParams = routeMatch(path, "/api/users/:id/password");
  if (passwordParams && method === "POST") return ok(await resetPassword(request, env, actor, passwordParams.id), request, env);
  if (method === "GET" && path === "/api/sessions") return ok({ sessions: await listSessions(env, actor) }, request, env);
  const sessionParams = routeMatch(path, "/api/sessions/:id/revoke");
  if (sessionParams && method === "POST") return ok(await revokeSession(request, env, actor, sessionParams.id), request, env);
  if (method === "GET" && path === "/api/audit") return ok({ events: await auditLog(env, actor, url) }, request, env);
  throw new HttpError(404, "Ruta no encontrada", "not_found");
}
__name(handleRequest, "handleRequest");
var src_default = {
  async fetch(request, env, ctx) {
    try {
      return addPlatformHeaders(await handleRequest(request, env, ctx), request, env);
    } catch (error) {
      if (Number(error?.status || 500) >= 500) console.error("request_failed", error);
      return errorResponse(error, request, env);
    }
  }
};

// src/combined.js
var PLATFORM_RELEASE = "2026.07.22.19";
function rewritePath(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url.toString(), request);
}
__name(rewritePath, "rewritePath");
function isAiRoute(pathname) {
  return pathname === "/health" || pathname.startsWith("/v1/");
}
__name(isAiRoute, "isAiRoute");
function withPlatformRelease(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Pedidos-Pro-Release", PLATFORM_RELEASE);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
__name(withPlatformRelease, "withPlatformRelease");
var combined_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (isAiRoute(url.pathname)) return index_default.fetch(request, env, ctx);
    if (url.pathname === "/platform/health") {
      return withPlatformRelease(await src_default.fetch(rewritePath(request, "/health"), env, ctx));
    }
    return withPlatformRelease(await src_default.fetch(request, env, ctx));
  }
};
export {
  combined_default as default
};
//# sourceMappingURL=combined.js.map
