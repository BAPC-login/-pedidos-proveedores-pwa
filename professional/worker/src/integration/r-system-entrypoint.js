import { WorkerEntrypoint } from 'cloudflare:workers';
import {
  INTEGRATION_CONTRACT_VERSION,
  PHASE14_RELEASE,
  integrationContract
} from '../phase14-contract.js';

/**
 * Private Phase 15 hand-off for R-System. Phase 14 intentionally exposes only
 * metadata: operational methods are added after the Core owns the tenant and
 * RBAC mapping, so this entrypoint cannot become an authorization bypass.
 */
export class RSystemProcurementEntrypoint extends WorkerEntrypoint {
  async status() {
    return {
      ok: true,
      service: 'nuvasto',
      module: 'procurement',
      phase: 14,
      release: PHASE14_RELEASE,
      contract_version: INTEGRATION_CONTRACT_VERSION,
      transport: 'cloudflare-service-binding-rpc',
      authentication: 'caller-enforced-r-system-rbac',
      public_route: false,
      operational_rpc_ready: false,
      operational_rpc_begins_in_phase: 15
    };
  }

  async contract() {
    return {
      ...integrationContract(),
      r_system_rpc: {
        entrypoint: 'RSystemProcurementEntrypoint',
        public_route: false,
        caller_authorization_required: true,
        methods: ['status', 'contract'],
        operational_methods_deferred_until_tenant_mapping: true
      }
    };
  }
}
