# Despliegue de Pedidos Pro Platform

## Arquitectura activa

Cloudflare está conectado al directorio `worker/` del repositorio. El despliegue de producción utiliza:

- `worker/wrangler.jsonc`
- `worker/src/combined.js`
- `worker/src/index.js` para Gemini
- `professional/worker/src/index.js` para la plataforma
- `professional/web` como Static Assets

URL pública:

```text
https://pedidos-pro-ai.botreservasmultilocal.workers.dev/
```

Rutas:

```text
/                    PWA profesional
/api/*               API de Pedidos Pro Platform
/platform/health     Salud de plataforma y D1
/health              Salud de Gemini
/v1/*                 Análisis Gemini existente
```

## Publicación

El proyecto conectado despliega automáticamente desde `main` cuando cambia el directorio `worker/`. Para un despliegue manual autenticado:

```bash
cd worker
npm install
npm run deploy
```

También puede ejecutarse desde `professional/` usando su `wrangler.toml` alineado con producción.

## D1

El binding `DB` es aprovisionado por Wrangler. La API ejecuta un esquema idempotente en el primer acceso y crea:

- Organización inicial.
- Local principal.
- Propietario inicial.
- Categorías base.
- Tablas de usuarios, sesiones, catálogo, pedidos, recepciones, facturas, auditoría e historial de precios.

No se requiere:

- Crear D1 manualmente.
- Copiar un `database_id`.
- Ejecutar migraciones remotas.
- Exponer un token de bootstrap.

## Validación

El workflow `.github/workflows/verify-live-platform.yml` comprueba:

- PWA y módulos JavaScript.
- Gemini configurado.
- D1 inicializada y versión de esquema.
- Rechazo de rutas autenticadas sin sesión.
- Rechazo de credenciales incorrectas.
- Bootstrap cerrado.
- Ausencia de rutas temporales de prueba.

El último resultado se guarda en:

```text
deployment/live-health.json
```

## Archivos en nube

R2 continúa desactivado. La aplicación opera normalmente, pero activar R2 es necesario antes de considerar PDF, XML o imágenes como archivo documental permanente.

## Antes de comercializar

- Activar R2 y política de respaldos.
- Añadir rate limiting administrado.
- Configurar un dominio comercial.
- Separar staging y producción.
- Añadir recuperación de contraseña por correo.
- Revisar privacidad, términos y tratamiento de datos.
- Ejecutar pruebas con facturas reales anonimizadas.
