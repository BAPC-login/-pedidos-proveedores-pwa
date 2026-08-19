# Entornos Nuvasto

## Regla principal

`develop` y `main` comparten código, pero nunca comparten datos ni almacenamiento.

| Entorno | Rama | Worker | D1 | R2 | ENVIRONMENT |
| --- | --- | --- | --- | --- | --- |
| Desarrollo | `develop` | `pedidos-pro-ai-dev` | exclusivo del Worker DEV | exclusivo del Worker DEV | `development` |
| Producción | `main` | `pedidos-pro-ai` | base productiva existente | `nuvasto-files` | `production` |

## Flujo de trabajo

1. Todo cambio funcional nuevo parte en `develop`.
2. GitHub Actions ejecuta `npm run verify`.
3. Si la verificación pasa, `develop` se despliega en `pedidos-pro-ai-dev`.
4. Las pruebas E2E se ejecutan únicamente contra DEV y pueden crear/eliminar datos sintéticos.
5. Cuando el cambio está validado, se abre PR `develop -> main`.
6. El merge a `main` despliega el mismo código a producción.
7. Nunca se copian filas de D1, objetos R2, usuarios, sesiones, pedidos, facturas ni pagos desde DEV a producción.
8. Las migraciones de esquema sí viajan con el código y se aplican por separado sobre cada base.

## Aprovisionamiento DEV

`wrangler.develop.toml` declara bindings D1 y R2 sin IDs. Wrangler 4.45+ puede aprovisionar automáticamente recursos nuevos para un Worker nuevo y mantenerlos vinculados a ese Worker en despliegues posteriores.

Esto es intencional: evita que DEV pueda apuntar accidentalmente a la D1 o al bucket R2 productivos.

## Datos de prueba

La organización DEV debe contener únicamente datos sintéticos. El futuro seed E2E podrá crear organizaciones, locales, proveedores, productos, pedidos, facturas, recepciones y pagos de prueba sin afectar producción.

## Secretos

Los secretos se mantienen independientes cuando corresponda. Como mínimo DEV debe tener su propio `BOOTSTRAP_ADMIN_TOKEN` y credenciales E2E. Para Gemini se recomienda una clave/proyecto separado; mientras no exista, puede configurarse una clave DEV manualmente en Cloudflare sin tocar el secreto productivo.

## Protección

Los endpoints o herramientas destructivas de QA deberán comprobar `ENVIRONMENT === 'development'` antes de ejecutar. Producción no debe aceptar reset, seed ni limpieza masiva de datos.
