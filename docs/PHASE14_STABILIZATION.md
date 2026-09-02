# Fase 14 — Estabilización de Gestión de Pedidos / Nuvasto

Fecha: 2026-09-02

## Objetivo

Cerrar Nuvasto como fuente de verdad del dominio de abastecimiento antes de su integración nativa con R-System en la Fase 15. La fase reutiliza la aplicación existente; no reconstruye pedidos, recepción, facturas, pagos ni catálogo dentro de R-System.

## Baseline auditado

La generación `2026.08.20.97` ya entregaba una operación funcional y un gate local verde para:

- catálogo, productos, formatos y proveedores;
- lista maestra y emisión por proveedor;
- recepción parcial/total y cierre operacional;
- facturas, lectura Gemini y reconciliación determinística;
- documentos de pago y asignaciones;
- aislamiento multiempresa, PWA y UX móvil;
- DEV destructivo aislado y smoke productivo read-only.

La auditoría de cierre detectó tres brechas técnicas:

1. el workflow de backup D1 quedaba siempre `skipped` si no existía `NUVASTO_D1_DATABASE`;
2. el monitor productivo fallaba ante una única muestra lenta, aunque el contrato funcional estuviera sano;
3. `IP_HASH_SALT` había quedado versionado como variable y el runtime aún admitía un fallback público.

También existía una deuda de presentación: la revisión de factura podía mostrar el nombre interno del método matemático y dependía del filtro posterior de copy.

## Entregables de estabilización

### Contrato para R-System

- contrato versionado `r-system-procurement-v1`;
- endpoint de metadata `GET /api/system/integration-contract`;
- named entrypoint privado `RSystemProcurementEntrypoint`;
- métodos actuales limitados a `status` y `contract`;
- operaciones postergadas explícitamente hasta que Fase 15 complete el mapeo tenant/RBAC;
- Nuvasto permanece como fuente de verdad y R-System no duplica datos.

### Seguridad

- eliminado `IP_HASH_SALT` del código/configuración versionada;
- eliminado el fallback público `pedidos-pro` para hashing de IP;
- producción rechaza la creación de sesiones si falta la configuración privada;
- deploy productivo y DEV crean el secret una sola vez si no existe;
- health publica solo el booleano `ipHashSaltConfigured`, nunca el valor.

### Respaldo

- el backup programado ya no depende de una variable para comenzar;
- si el nombre no fue configurado, resuelve la D1 mediante una firma estricta de ocho tablas Nuvasto;
- exige una única coincidencia y falla en caso ambiguo;
- exporta D1, restaura en SQLite desechable y conserva artifact por 30 días;
- nunca restaura automáticamente sobre producción.

### Monitoreo

- valida release de Fase 14, contrato R-System y capacidades productivas;
- conserva presupuesto de 5 segundos;
- mide tres muestras y alerta por latencia mediana sostenida, evitando falsos P1 por una muestra fría aislada;
- exige mayoría de respuestas correctas y mantiene visible cualquier muestra degradada.

### Experiencia de factura

- los nombres internos de reconciliación se traducen a etiquetas de negocio;
- la UI ya no imprime directamente `taxAllocationMethod` o `priceSource`;
- se conserva el detalle Neto + Flete + IVA + Adicional + Otros y la trazabilidad matemática.

## Invariantes preservados

- una recepción real puede cerrar la operación sin exigir factura ni pago;
- los pedidos emitidos se anulan, no se eliminan físicamente;
- los precios no se inventan para forzar el total;
- la suma de productos se verifica contra el total del documento;
- R2 mantiene namespace por organización;
- producción se verifica con lecturas; mutaciones E2E solo ocurren en DEV;
- compras automáticas requieren API oficial/credenciales reales del proveedor.

## Límite con Fase 15

Fase 14 no activa todavía operaciones de Nuvasto desde R-System. Fase 15 debe:

1. mapear `Organization → Brand → Location` de R-System con `organization → location → cost center` de Nuvasto;
2. declarar permisos `procurement.*` en el Core;
3. ampliar el RPC privado con operaciones autorizadas;
4. construir la UI nativa dentro del shell R-System;
5. conservar Nuvasto como fuente de verdad;
6. ejecutar staging y piloto transversal Reservas + Pedidos.

## Validación requerida para cierre productivo

```text
cd professional
npm run verify
npx wrangler deploy --dry-run --config wrangler.toml
```

Luego: CI de rama, deploy DEV + E2E/IA cuando existan secretos, promoción a `main`, deploy productivo, smoke autenticado read-only, verificación de contrato Fase 14 y ejecución real del backup.

Las validaciones manuales de venta general —dispositivos físicos, corpus de 200 facturas reales anonimizadas, restore drill trimestral, onboarding humano y revisión legal— permanecen registradas en el issue #89. Son aceptación comercial externa y no se presentan como ejecutadas por este cierre técnico.
