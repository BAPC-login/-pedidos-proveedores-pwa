# Nuvasto · Production Readiness

Este documento convierte la calidad de Nuvasto en criterios verificables de release. Ninguna versión debe considerarse lista para producción solo porque compila o porque una pantalla funciona manualmente.

## 1. Gate automático obligatorio

Antes de fusionar a `main` debe pasar `cd professional && npm run verify`.

El gate incluye contratos históricos más:

- benchmark determinista de precios y totales de factura;
- aislamiento multiempresa en autenticación, pedidos, catálogo, pagos y archivos;
- accesibilidad y safe areas móviles;
- SLO de rendimiento y telemetría;
- contratos de autenticación biométrica, pagos y PWA.

Una regresión en estos gates bloquea el release.

## 2. Benchmark de facturas

El corpus automatizado vive en `professional/tests/fixtures/invoice-benchmark-v84.json` y se ejecuta con `npm run benchmark:invoices`.

Objetivos mínimos del motor matemático:

- precisión de casos esperados: >= 99%;
- documentos cerrados/verificados: >= 95%;
- diferencia de cierre aceptada: máximo 1 peso cuando el proveedor usa redondeo por unidad;
- nunca sumar nuevamente IVA, flete o impuestos si las líneas ya cierran contra el total impreso;
- una factura ambigua de una sola línea conserva el fallback determinista salvo que exista evidencia explícita de una columna de total.

El corpus de código es un seed de regresión. Para aceptación comercial se debe ampliar con facturas reales anonimizadas de proveedores reales. Meta operativa: 200 documentos representativos, con resultado correcto revisado manualmente y sin datos personales innecesarios.

## 3. Aislamiento multiempresa

Regla no negociable: una organización no debe poder leer ni modificar entidades de otra organización aunque conozca un ID válido.

Todo acceso a entidades de negocio debe vincularse a `actor.orgId` y, cuando corresponda, a `locationScope`. Los archivos R2 deben usar namespace por organización y metadata de ownership.

Pruebas negativas mínimas de staging antes de una venta enterprise:

1. token de Organización A + ID de pedido de Organización B -> 404/403;
2. token A + ID de factura B -> 404/403;
3. token A + archivo R2 B -> 404/403;
4. token A + medio/documento de pago B -> 404/403;
5. usuario restringido a Local 1 + entidad exclusiva Local 2 -> 404/403;
6. intento de modificar rol owner sin permiso -> 403.

## 4. Rendimiento y disponibilidad

El cliente mantiene una muestra acotada de latencias por vista y endpoint.

SLO inicial:

- p95 de solicitud visible: <= 2.5 s;
- tasa de error por vista: <= 3%;
- ninguna pantalla debe generar >= 1.200 solicitudes diarias por dispositivo sin advertencia;
- no deben existir loops de polling, MutationObserver globales ni recargas completas para autenticación biométrica;
- las rutas críticas deben usar caché/stale fallback solo en lecturas y nunca para ocultar errores de escritura.

`window.NuvastoTelemetry.requestBudget()` expone p50, p95, tasa de error, consumo diario y estado SLO para diagnóstico.

El workflow `.github/workflows/production-health.yml` revisa producción dos veces por hora y falla si el contrato público de salud deja de cumplir almacenamiento, runtime, biometría, matriz de factura, pagos o cierre, o si la consulta de salud supera 5 segundos.

## 5. Matriz de dispositivos obligatoria

Los tests automáticos no reemplazan una prueba física. Antes de declarar una release comercial debe probarse como mínimo:

- iPhone con Dynamic Island, PWA instalada;
- iPhone sin Dynamic Island, PWA instalada;
- iPad;
- Android moderno con cámara/galería/archivos;
- Chrome/Edge desktop;
- Safari desktop cuando aplique.

En cada dispositivo verificar: login y biometría, cambio de orientación, teclado numérico, safe areas, modales y X, Lista maestra, selector de fotografía/archivo, PDF/compartir nativo, carga de factura, revisión, recepción y cierre.

Resultado esperado: cero controles bajo barra de estado/home indicator, cero scroll bloqueado, cero cambio espontáneo de tema y cero spinner infinito.

## 6. Accesibilidad

- targets táctiles mínimos de 44 px;
- controles de icono con nombre accesible;
- soporte de `prefers-reduced-motion` y `prefers-reduced-transparency`;
- contraste legible en modo claro y oscuro;
- foco visible en inputs;
- recorrido VoiceOver/TalkBack comprensible en login, navegación, formularios y modales.

## 7. Recuperación e incidentes

El workflow `.github/workflows/d1-backup.yml` deja preparado el backup remoto de D1, una validación de restauración sobre una base SQLite desechable y conservación del export como artifact durante 30 días. Para activar la ejecución diaria se debe configurar una única variable de repositorio: `NUVASTO_D1_DATABASE`, con el nombre exacto de la base D1 de producción. El token de Cloudflare ya es el mismo secreto utilizado por el deploy.

No se intenta restaurar automáticamente sobre producción: un restore real siempre debe ser una acción deliberada y revisada.

Antes de vender con compromiso de continuidad deben existir y probarse además:

- política de versionado/retención de R2;
- ejercicio de restauración trimestral usando un backup real;
- registro de incidentes con hora de detección, alcance, mitigación y causa raíz;
- severidad P1: datos cruzados, corrupción o indisponibilidad total;
- severidad P2: módulo crítico inutilizable;
- severidad P3: degradación parcial o visual.

Objetivos iniciales sugeridos: detectar P1/P2 en <= 15 min una vez implementadas alertas externas; restaurar servicio P1 en <= 4 h cuando la causa esté dentro de la plataforma.

## 8. Onboarding comercial

Un nuevo cliente debe poder completar sin intervención técnica directa:

1. empresa/marca;
2. locales;
3. centros de costo y bodegas;
4. categorías;
5. productos y formatos;
6. proveedores y relaciones de compra;
7. usuarios, roles y alcance por local;
8. identidad/logo;
9. primer pedido;
10. primera recepción/factura.

El onboarding se considera satisfactorio cuando una empresa de prueba puede llegar al primer pedido emitido usando solo la interfaz y documentación del producto.

## 9. Privacidad y contrato

Antes de venta general deben ser aprobados por negocio/asesoría legal los textos definitivos de:

- Términos del servicio;
- Política de privacidad;
- acuerdo de tratamiento de datos cuando corresponda;
- política de retención y eliminación;
- alcance de backups y recuperación;
- uso de IA para lectura de documentos;
- niveles de soporte/SLA según plan.

La aplicación no debe prometer en pantalla un SLA, certificación o respaldo legal que no esté efectivamente contratado y operado.

## 10. Definition of Done comercial

Una release es “vendible” cuando: CI verde, producción verificada, pruebas físicas aprobadas, corpus real de facturas dentro de umbral, pruebas negativas de tenancy aprobadas, restore probado, onboarding completo y documentación contractual aprobada.
