# Pedidos Pro Platform · rama profesional

Esta carpeta contiene la nueva plataforma construida en paralelo a la PWA actual. No reemplaza ni modifica el funcionamiento de la versión estable que sigue viviendo en `main` y `gh-pages`.

## Qué incluye esta pasada

- Backend multiempresa y multilocal en Cloudflare Workers + D1.
- Aislamiento obligatorio mediante `org_id` en todas las consultas.
- Usuarios con roles y sesiones persistentes: no vencen automáticamente, pero pueden revocarse por usuario o dispositivo.
- Contraseñas PBKDF2-SHA256 con 210.000 iteraciones.
- Plan gratuito con límites configurables y estructura lista para planes Pro y Business.
- Catálogo interno multiproveedor con conversiones por unidad de pedido.
- Proveedores, productos, categorías, pedidos, aprobaciones, recepción, facturas, conciliación, historial de precios y auditoría en el modelo de datos.
- Ciclo de pedido profesional: borrador, solicitado, aprobado, rechazado, enviado, confirmado, recepción parcial, recibido, conciliado, cerrado y anulado.
- Recepciones parciales y cantidades rechazadas.
- Proxy autenticado y con cuota para el Worker actual de Gemini.
- R2 opcional para PDF, XML, fotografías y facturas.
- Interfaz nueva responsive, instalable, clara y oscura.
- Cola local para mutaciones offline y reintento al recuperar conexión.
- Idempotencia inicial para evitar duplicar pedidos enviados desde la cola offline.
- Auditoría de accesos y acciones críticas.
- Pruebas de sintaxis y reglas base en CI.

## Estrategia gratuita y crecimiento

La primera versión puede operar sin pagar suscripciones de infraestructura mientras permanezca bajo los límites gratuitos:

| Necesidad | Inicio sin costo | Upgrade gradual |
|---|---|---|
| API y frontend | Cloudflare Workers + Static Assets | Workers Paid |
| Base de datos | Cloudflare D1 Free | D1 incluido en Workers Paid |
| Archivos | IndexedDB al comienzo; R2 opcional | R2 por uso |
| Procesamiento en cola | Operación directa; Queues opcional | Queues con mayor retención |
| IA de facturas | Gemini Developer API Free | Gemini Paid por uso |
| Correos | Sin correo obligatorio; alta manual segura | Resend Free y luego Pro |
| Analítica | Auditoría D1 local | PostHog o Sentry opcionales |
| Cobros | Plan manual durante beta | Stripe/Mercado Pago cuando exista venta real |

La autenticación no depende de una API de correo. El propietario crea usuarios y contraseñas iniciales; las cuentas no expiran y todas las sesiones pueden revocarse.

## Estructura

```text
professional/
├── migrations/          Modelo D1 versionado
├── tests/               Pruebas de reglas y seguridad base
├── web/                 PWA profesional sin framework
├── worker/src/          API, autenticación y reglas de negocio
├── package.json
└── wrangler.toml
```

## Inicio local

1. Crea una base D1 llamada `pedidos-pro-platform`.
2. Reemplaza `REPLACE_WITH_D1_DATABASE_ID` en `wrangler.toml`.
3. Configura los secretos:

```bash
npx wrangler secret put BOOTSTRAP_ADMIN_TOKEN --config wrangler.toml
npx wrangler secret put IP_HASH_SALT --config wrangler.toml
```

4. Aplica migraciones y ejecuta:

```bash
npm run db:migrate:local
npm run dev
```

5. En la pantalla de ingreso selecciona **Primera instalación** y usa el mismo `BOOTSTRAP_ADMIN_TOKEN` una sola vez.

## Despliegue aislado

Usa un Worker nuevo llamado `pedidos-pro-platform`. No cambies el proyecto `pedidos-pro-ai` ni la publicación actual de GitHub Pages.

```bash
npm run verify
npm run db:migrate:remote
npm run deploy
```

Después del primer despliegue cambia `ALLOWED_ORIGINS` por el dominio real del nuevo Worker o del dominio personalizado.

## Límites del plan gratuito incluidos en código

- 1 local.
- 5 usuarios activos.
- 100 proveedores.
- 750 productos.
- 500 pedidos mensuales.
- 30 documentos con IA mensuales.
- 250 MB lógicos de archivos antes de solicitar upgrade.

Los límites se aplican desde el backend, no solo desde la interfaz.

## Seguridad operacional

- No reutilizar folios de pedidos emitidos. Los documentos se anulan.
- Nunca confiar en `org_id`, roles o precios enviados por el navegador.
- Mantener `BOOTSTRAP_ADMIN_TOKEN`, `IP_HASH_SALT` y futuras claves únicamente como Secrets.
- Activar R2 antes de almacenar documentos legales en producción.
- Usar Gemini Free solo durante beta: el contenido del nivel gratuito puede utilizarse para mejorar productos de Google; el nivel pagado cambia esa condición.
- Ejecutar evaluación de seguridad y pruebas E2E antes de incorporar clientes externos.
