import { WorkerEntrypoint } from 'cloudflare:workers';
import { ensureSchema } from '../schema.js';
import { dashboard, listCostCenters, listProducts, listSuppliers, createSupplier } from '../api/catalog.js';
import { createOrder, getOrder, transitionOrder } from '../api/orders.js';
import { listOrdersV2 } from '../api/orders-list-v2.js';
import { createReceptionV13 } from '../api/reception-v13.js';
import { analyzeInvoice, listInvoices } from '../api/documents.js';
import { createInvoiceV2 } from '../api/invoices-v2.js';
import {
  INTEGRATION_CONTRACT_VERSION,
  PHASE15_RELEASE,
  integrationContract
} from '../phase14-contract.js';

const INTERNAL_URL = 'https://nuvasto.internal/r-system-rpc';
const OPERATIONAL_METHODS = [
  'discoverTenants', 'mappingStatus', 'workspace', 'catalog', 'orders', 'order',
  'createSupplier', 'createOrder', 'transitionOrder', 'createReception',
  'invoices', 'analyzeInvoice', 'createInvoice'
];

function text(value, field) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${field}_required`);
  return normalized;
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function bodyRequest(data, input = {}) {
  const headers = new Headers({'content-type': 'application/json'});
  if (input.idempotency_key) headers.set('Idempotency-Key', String(input.idempotency_key).slice(0, 120));
  if (input.request_id) headers.set('X-Request-Id', String(input.request_id).slice(0, 120));
  return new Request(INTERNAL_URL, {method: 'POST', headers, body: JSON.stringify(data ?? {})});
}

function queryUrl(path, query = {}) {
  const url = new URL(path, INTERNAL_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url;
}

async function tenantContext(env, input, role = 'readonly') {
  const scope = input?.scope ?? {};
  const organizationId = text(scope.organization_id, 'organization_id');
  const locationId = text(scope.location_id, 'location_id');
  const organization = await env.DB.prepare(
    "SELECT id,name,slug,plan,status FROM organizations WHERE id=? AND status='active' LIMIT 1"
  ).bind(organizationId).first();
  if (!organization) throw new Error('nuvasto_organization_not_found');
  const location = await env.DB.prepare(
    'SELECT id,org_id,name,code,timezone,active FROM locations WHERE id=? AND org_id=? AND active=1 LIMIT 1'
  ).bind(locationId, organizationId).first();
  if (!location) throw new Error('nuvasto_location_not_found');

  const caller = input?.actor ?? {};
  const callerId = text(caller.user_id, 'actor_user_id');
  const fingerprint = await digest(`${organizationId}:${callerId}:${role}`);
  const userId = `rs_${fingerprint.slice(0, 32)}`;
  const email = `r-system+${fingerprint.slice(0, 24)}@integration.invalid`;
  const displayName = String(caller.display_name || 'Usuario R-System').trim().slice(0, 120) || 'Usuario R-System';
  const now = new Date().toISOString();
  const membershipId = `rsm_${fingerprint.slice(0, 30)}`;
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO users(id,email,display_name,password_salt,password_hash,password_algorithm,active,created_at,updated_at)
      VALUES(?,?,?,?,?,'external-rpc-disabled',1,?,?)
      ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,active=1,updated_at=excluded.updated_at
    `).bind(userId, email, displayName, fingerprint.slice(0, 32), fingerprint, now, now),
    env.DB.prepare(`
      INSERT INTO memberships(id,org_id,user_id,role,location_scope,active,created_at,updated_at)
      VALUES(?,?,?,?,?,1,?,?)
      ON CONFLICT(org_id,user_id) DO UPDATE SET role=excluded.role,location_scope=excluded.location_scope,active=1,updated_at=excluded.updated_at
    `).bind(membershipId, organizationId, userId, role, JSON.stringify([locationId]), now, now)
  ]);
  return {
    actor: {
      userId, orgId: organizationId, email, displayName, role,
      locationScope: [locationId], organization: {
        id: organization.id, name: organization.name, slug: organization.slug, plan: organization.plan
      },
      rSystemActor: {userId: callerId, displayName}
    },
    organization,
    location
  };
}

async function ready(env) {
  await ensureSchema(env);
}

function enforceMappedLocation(data, locationId) {
  return {...(data ?? {}), locationId};
}

function transitionRole(status) {
  if (['approved', 'rejected'].includes(status)) return 'approver';
  if (['partially_received', 'received'].includes(status)) return 'receiver';
  if (['reconciled', 'closed'].includes(status)) return 'finance';
  return 'purchaser';
}

/**
 * Private operational boundary consumed only through the R-System Service Binding.
 * R-System authenticates the human, resolves its Organization → Brand → Location
 * scope and checks granular permissions. Nuvasto validates the mapped organization
 * and location again before every domain call and remains the only source of truth.
 */
export class RSystemProcurementEntrypoint extends WorkerEntrypoint {
  async status() {
    await ready(this.env);
    return {
      ok: true, service: 'nuvasto', module: 'procurement', phase: 15,
      release: PHASE15_RELEASE, contract_version: INTEGRATION_CONTRACT_VERSION,
      transport: 'cloudflare-service-binding-rpc',
      authentication: 'caller-enforced-r-system-rbac-plus-provider-scope-validation',
      public_route: false, operational_rpc_ready: true,
      operational_methods: OPERATIONAL_METHODS
    };
  }

  async contract() {
    return {
      ...integrationContract(),
      r_system_rpc: {
        entrypoint: 'RSystemProcurementEntrypoint', public_route: false,
        caller_authorization_required: true, provider_scope_validation: true,
        methods: ['status', 'contract', ...OPERATIONAL_METHODS],
        operational_methods_deferred_until_tenant_mapping: false
      }
    };
  }

  async discoverTenants() {
    await ready(this.env);
    const result = await this.env.DB.prepare(`
      SELECT o.id AS organization_id,o.name AS organization_name,o.slug AS organization_slug,
             l.id AS location_id,l.name AS location_name,l.code AS location_code,l.timezone
      FROM organizations o JOIN locations l ON l.org_id=o.id
      WHERE o.status='active' AND l.active=1
      ORDER BY o.name COLLATE NOCASE,l.name COLLATE NOCASE
    `).all();
    return {ok: true, tenants: result.results ?? []};
  }

  async mappingStatus(input) {
    await ready(this.env);
    const {organization, location} = await tenantContext(this.env, input, 'readonly');
    return {ok: true, organization, location};
  }

  async workspace(input) {
    await ready(this.env);
    const {actor, location} = await tenantContext(this.env, input, 'readonly');
    const query = {...(input?.query ?? {}), locationId: location.id};
    const [summary, orders, invoices] = await Promise.all([
      dashboard(this.env, actor),
      listOrdersV2(this.env, actor, queryUrl('/orders', query)),
      listInvoices(this.env, actor, queryUrl('/invoices', query))
    ]);
    return {ok: true, summary, orders, invoices, location};
  }

  async catalog(input) {
    await ready(this.env);
    const {actor, location} = await tenantContext(this.env, input, 'readonly');
    const query = {...(input?.query ?? {}), locationId: location.id};
    const [suppliers, products, costCenters] = await Promise.all([
      listSuppliers(this.env, actor, queryUrl('/suppliers', query)),
      listProducts(this.env, actor, queryUrl('/products', query)),
      listCostCenters(this.env, actor, queryUrl('/cost-centers', query))
    ]);
    return {ok: true, suppliers, products, costCenters, location};
  }

  async orders(input) {
    await ready(this.env);
    const {actor, location} = await tenantContext(this.env, input, 'readonly');
    return {ok: true, orders: await listOrdersV2(this.env, actor, queryUrl('/orders', {...(input?.query ?? {}), locationId: location.id}))};
  }

  async order(input) {
    await ready(this.env);
    const {actor} = await tenantContext(this.env, input, 'readonly');
    return {ok: true, order: await getOrder(this.env, actor, text(input?.order_id, 'order_id'))};
  }

  async createSupplier(input) {
    await ready(this.env);
    const {actor} = await tenantContext(this.env, input, 'purchaser');
    return {ok: true, supplier: await createSupplier(bodyRequest(input?.data, input), this.env, actor)};
  }

  async createOrder(input) {
    await ready(this.env);
    const {actor, location} = await tenantContext(this.env, input, 'purchaser');
    const order = await createOrder(bodyRequest(enforceMappedLocation(input?.data, location.id), input), this.env, actor);
    return {ok: true, order};
  }

  async transitionOrder(input) {
    await ready(this.env);
    const status = text(input?.data?.status, 'status');
    const {actor} = await tenantContext(this.env, input, transitionRole(status));
    const order = await transitionOrder(bodyRequest(input?.data, input), this.env, actor, text(input?.order_id, 'order_id'));
    return {ok: true, order};
  }

  async createReception(input) {
    await ready(this.env);
    const {actor} = await tenantContext(this.env, input, 'receiver');
    const reception = await createReceptionV13(bodyRequest(input?.data, input), this.env, actor, text(input?.order_id, 'order_id'));
    return {ok: true, reception};
  }

  async invoices(input) {
    await ready(this.env);
    const {actor, location} = await tenantContext(this.env, input, 'readonly');
    return {ok: true, invoices: await listInvoices(this.env, actor, queryUrl('/invoices', {...(input?.query ?? {}), locationId: location.id}))};
  }

  async analyzeInvoice(input) {
    await ready(this.env);
    const {actor, location} = await tenantContext(this.env, input, 'receiver');
    const file = input?.file ?? {};
    const bytes = file.data instanceof ArrayBuffer ? file.data : file.data?.buffer;
    if (!(bytes instanceof ArrayBuffer)) throw new Error('invoice_file_required');
    const form = new FormData();
    form.append('file', new File([bytes], String(file.name || 'factura'), {type: String(file.type || 'application/octet-stream')}));
    form.append('context', JSON.stringify({...input?.context, locationId: location.id}));
    const request = new Request(INTERNAL_URL, {method: 'POST', body: form});
    return {ok: true, analysis: await analyzeInvoice(request, this.env, actor)};
  }

  async createInvoice(input) {
    await ready(this.env);
    const {actor, location} = await tenantContext(this.env, input, 'receiver');
    const invoice = await createInvoiceV2(bodyRequest(enforceMappedLocation(input?.data, location.id), input), this.env, actor);
    return {ok: true, invoice};
  }
}
