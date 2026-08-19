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
4. Las pruebas E2E destructivas se ejecutan únicamente contra DEV y pueden crear pedidos, facturas, pagos, recepciones y cierres sintéticos.
5. Cuando Gemini DEV está configurado, el pipeline envía un PDF sintético real a `/api/invoices/analyze` y exige una lectura verificada antes de dar por sano el canary de IA.
6. Cuando el cambio está validado, se abre PR `develop -> main`.
7. El merge a `main` despliega el mismo código a producción.
8. Producción solo ejecuta smoke autenticado de lectura; los journeys que escriben datos están prohibidos en el workflow de `main`.
9. Nunca se copian filas de D1, objetos R2, usuarios, sesiones, pedidos, facturas ni pagos desde DEV a producción.
10. Las migraciones de esquema sí viajan con el código y se aplican por separado sobre cada base.

## Aprovisionamiento DEV

`wrangler.develop.toml` declara bindings D1 y R2 sin IDs. Wrangler 4.45+ puede aprovisionar automáticamente recursos nuevos para un Worker nuevo y mantenerlos vinculados a ese Worker en despliegues posteriores.

Esto es intencional: evita que DEV pueda apuntar accidentalmente a la D1 o al bucket R2 productivos.

## Datos de prueba

La organización DEV usa `Nuvasto QA`, el local `Laboratorio`, el centro `E2E`, `Proveedor E2E`, `Producto E2E` y el usuario técnico `e2e@nuvasto.dev`. El seed es idempotente y el journey completo posterior puede ensuciar esa base sin afectar producción.

El E2E destructivo tiene un guard explícito de hostname: se niega a arrancar si `NUVASTO_BASE_URL` no apunta a `pedidos-pro-ai-dev.*`. El canary de IA aplica el mismo guard.

## Secretos

DEV usa secretos separados:

- `NUVASTO_DEV_E2E_PASSWORD`: contraseña del robot `e2e@nuvasto.dev`.
- `NUVASTO_DEV_GEMINI_API_KEY`: clave de Gemini del entorno DEV; idealmente pertenece a un proyecto/cuota separados de producción.

El workflow genera temporalmente `BOOTSTRAP_ADMIN_TOKEN` en cada seed y lo instala solo en el Worker DEV. No es necesario guardarlo como secret permanente en GitHub.

## Producción

`main` no debe ejecutar `production-e2e-v44.mjs`, porque ese journey crea pedidos, facturas, documentos de pago, recepciones y cierres. El workflow productivo usa `production-readonly-e2e-v92.mjs`, que puede autenticar y validar lecturas críticas sin modificar datos comerciales.

## Protección

Los endpoints o herramientas destructivas de QA deberán comprobar `ENVIRONMENT === 'development'` o un host DEV equivalente antes de ejecutar. Producción no debe aceptar reset, seed ni limpieza masiva de datos. Cualquier cambio que rompa esta separación debe fallar `environment-isolation.test.mjs` antes del deploy.
