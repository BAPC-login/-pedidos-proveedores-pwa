# Fase 15 — Proveedor RPC para Compras nativo

Fecha de cierre: 2026-09-02

## Resultado

Nuvasto release `2026.09.02.99` expone el contrato `r-system-procurement-v2` mediante `RSystemProcurementEntrypoint`. El entrypoint es privado y solo se consume desde el Service Binding `PROCUREMENT` de R-System.

R-System implementa la UI, navegación, sesión, RBAC y auditoría. Nuvasto conserva la persistencia y lógica de proveedores, catálogo, pedidos, recepciones, facturas y análisis documental. No se duplican entidades operacionales y no existe una ruta pública del RPC.

## Seguridad y tenancy

- R-System resuelve `Organization → Brand → Location` desde sus propios recursos y permisos.
- Un administrador mapea explícitamente ese local a `organization → location` de Nuvasto.
- Cada llamada incluye actor y scope; Nuvasto valida nuevamente que organización y local estén activos y relacionados.
- Nuvasto utiliza actores de integración determinísticos, sin credenciales de login, para conservar auditoría y compatibilidad con el dominio existente.
- La autorización del consumidor no sustituye la validación de scope del proveedor.

## Métodos operacionales

`status`, `contract`, `discoverTenants`, `mappingStatus`, `workspace`, `catalog`, `orders`, `order`, `createSupplier`, `createOrder`, `transitionOrder`, `createReception`, `invoices`, `analyzeInvoice` y `createInvoice`.

## Evidencia

- PR a `develop`: `#111`, merge `1860a7c417265cdd155afc93ef71d61b2e61a9c1`;
- DEV E2E completo, branding, condiciones de pago y canary real de IA: run `33676906606`, `success`;
- PR productiva: `#112`, merge `72deabc7dd1e19886661280adcdcb9dcf8c05409`;
- gate productivo: run `33677822819`, `success`;
- deploy productivo: run `33677938821`, `success`;
- contrato vivo: fase 15, `operational_rpc_ready=true`, `provider_scope_validation=true`, `external_launch=false`.

La recepción operacional sigue sin requerir factura ni pago para su cierre. El smoke productivo es de solo lectura; las mutaciones y el canary real se ejercitaron en DEV aislado.
