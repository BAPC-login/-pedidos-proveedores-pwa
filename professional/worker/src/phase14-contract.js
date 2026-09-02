export const PHASE14_RELEASE = 'phase-14-nuvasto-20260902-r1';
export const PHASE15_RELEASE = 'phase-15-native-procurement-20260902-r1';
export const INTEGRATION_CONTRACT_VERSION = 'r-system-procurement-v2';

export function integrationContract() {
  return {
    ok: true,
    service: 'nuvasto',
    module: 'procurement',
    phase: 15,
    release: PHASE15_RELEASE,
    contract_version: INTEGRATION_CONTRACT_VERSION,
    source_of_truth: {
      repository: 'BAPC-login/-pedidos-proveedores-pwa',
      owner: 'nuvasto',
      duplicated_in_r_system: false,
      domains: [
        'suppliers',
        'catalog',
        'master-ordering',
        'purchase-orders',
        'receptions',
        'supplier-invoices',
        'payment-documents',
        'procurement-history'
      ]
    },
    tenancy: {
      hierarchy: 'organization-location-cost-center',
      isolation: 'server-side-organization-and-location-scope',
      r_system_mapping_required: true,
      r_system_hierarchy: 'organization-brand-location'
    },
    auth: {
      session: 'bearer-session-sha256',
      roles: ['owner', 'admin', 'purchaser', 'approver', 'receiver', 'finance', 'readonly'],
      authorization: 'nuvasto-server-side-rbac',
      r_system_rpc_authorization: 'caller-enforced-r-system-rbac'
    },
    capabilities: {
      master_lists: true,
      suppliers: true,
      catalog_and_purchase_formats: true,
      cost_centers_and_warehouses: true,
      purchase_orders: true,
      supplier_pdf_documents: true,
      partial_and_total_reception: true,
      supplier_invoice_ingestion: true,
      gemini_document_extraction: true,
      deterministic_invoice_reconciliation: true,
      payment_documents_and_allocations: true,
      price_history: true,
      audit_history: true,
      pwa_shell: true
    },
    invariants: {
      reception_is_operational_source_of_closure: true,
      invoice_required_for_reception_closure: false,
      payment_required_for_reception_closure: false,
      issued_orders_are_not_physically_deleted: true,
      invoice_values_are_not_invented_to_force_closure: true,
      document_product_sum_is_verified: true,
      cross_tenant_access_is_denied: true,
      original_documents_use_organization_scoped_r2_keys: true
    },
    integration: {
      transport: 'cloudflare-service-binding-rpc',
      entrypoint: 'RSystemProcurementEntrypoint',
      current_methods: [
        'status', 'contract', 'discoverTenants', 'mappingStatus', 'workspace',
        'catalog', 'orders', 'order', 'createSupplier', 'createOrder',
        'transitionOrder', 'createReception', 'invoices', 'analyzeInvoice',
        'createInvoice'
      ],
      public_contract_path: '/api/system/integration-contract',
      operational_rpc_begins_in_phase: 15,
      operational_rpc_ready: true,
      phase15_mapping_required: true,
      caller_authorization_required: true,
      provider_scope_validation: true,
      native_r_system_route: '/procurement.html',
      external_launch: false
    },
    boundaries: {
      production_mutations_in_smoke: false,
      destructive_e2e_environment: 'development-only',
      official_supplier_api_required_for_automatic_purchase: true,
      sii_source_of_truth: false,
      payment_processor_settlement_source_of_truth: false,
      phase15_integration_complete: true,
      commercial_manual_acceptance_tracked_separately: true
    }
  };
}

export function integrationContractResponse() {
  return new Response(JSON.stringify(integrationContract()), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}
