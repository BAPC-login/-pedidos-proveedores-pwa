# Pedidos Pro Platform

Pedidos Pro Platform es la nueva PWA profesional de compras y abastecimiento. Está desplegada en Cloudflare y convive con la PWA histórica publicada en GitHub Pages.

## Producción

- Aplicación: `https://pedidos-pro-ai.botreservasmultilocal.workers.dev/`
- Salud de Gemini: `/health`
- Salud de la plataforma y D1: `/platform/health`
- API profesional: `/api/*`
- Análisis Gemini existente: `/v1/*`

Cloudflare tenía un único proyecto conectado al directorio `worker/`. Para conservar el análisis de facturas y evitar una intervención manual con credenciales de cuenta, ambos servicios se ejecutan en el mismo Worker con rutas aisladas:

- `worker/src/index.js`: Gemini.
- `professional/worker/src/index.js`: plataforma profesional.
- `worker/src/combined.js`: enrutador de ambos servicios.

## Funcionalidades

- Backend multiempresa y multilocal sobre Cloudflare Workers y D1.
- Aislamiento obligatorio por `org_id`.
- Usuarios por rol y sesiones sin expiración automática, pero revocables.
- Contraseñas PBKDF2-SHA256 con 100.000 iteraciones, máximo admitido por el runtime desplegado.
- Catálogo interno multiproveedor con formatos y conversiones de compra.
- Pedidos con aprobación, envío, recepción parcial, conciliación, cierre y anulación auditada.
- Facturas con Gemini, revisión humana e historial de precios.
- Dashboard, proveedores, catálogo, equipo, auditoría y configuración.
- PWA responsive, modo claro/oscuro, caché y cola offline.
- Límites de plan aplicados desde el backend.

## Cuenta inicial

El primer propietario se crea automáticamente al inicializar D1:

- Correo: `admin@pedidospro.local`
- Empresa: `pedidos-pro`
- Rol: `owner`

La contraseña temporal se entrega fuera del repositorio. Después del primer ingreso debe cambiarse desde **Configuración → Cambiar contraseña**. El cambio revoca todas las sesiones anteriores.

## Base de datos

La base D1 se aprovisiona mediante el binding `DB`. En la primera llamada a la API se crean las tablas con sentencias idempotentes y se registra el espacio inicial. No se requiere copiar un `database_id`, aplicar migraciones manualmente ni habilitar un bootstrap público.

El estado de producción se registra en `deployment/live-health.json`.

## Estructura

```text
professional/
├── migrations/          Esquema D1
├── tests/               Pruebas de reglas y seguridad
├── web/                 PWA profesional
├── worker/src/          API, autenticación y negocio
├── package.json
└── wrangler.toml

worker/
├── src/index.js         Servicio Gemini existente
├── src/combined.js      Enrutador de producción
└── wrangler.jsonc       Configuración observada por Cloudflare
```

## Desarrollo y despliegue

Desde la raíz o desde `professional/`:

```bash
npm run verify
npm run dev
npm run deploy
```

El despliegue conectado de Cloudflare observa cambios dentro de `worker/`. Por eso toda publicación que dependa de archivos externos debe actualizar también el release del enrutador combinado.

## Plan gratuito

- 1 local.
- 5 usuarios activos.
- 100 proveedores.
- 750 productos.
- 500 pedidos mensuales.
- 30 análisis con IA mensuales.
- 250 MB lógicos antes de activar almacenamiento adicional.

## Siguientes upgrades opcionales

- R2 para conservar PDF, XML e imágenes de forma centralizada.
- Rate limiting administrado por Cloudflare.
- Resend para invitaciones y recuperación de contraseña.
- Cobro automático cuando exista una oferta comercial validada.
- Integraciones contables, POS y portal de proveedores.
