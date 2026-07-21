# Despliegue sin tocar la versión actual

## 1. Rama

Todo el trabajo profesional vive en `agent/professional-saas-v1`. La rama `main` y la publicación `gh-pages` permanecen intactas.

## 2. Crear servicios gratuitos

Desde Cloudflare:

1. Crea D1 `pedidos-pro-platform`.
2. Copia su `database_id` a `professional/wrangler.toml`.
3. Mantén el Worker actual `pedidos-pro-ai` separado.
4. Opcional: crea R2 `pedidos-pro-files` cuando quieras almacenar documentos en nube.

## 3. Secrets

```bash
cd professional
npx wrangler secret put BOOTSTRAP_ADMIN_TOKEN
npx wrangler secret put IP_HASH_SALT
```

Usa valores largos, aleatorios y distintos. El token de bootstrap solo sirve para crear el primer propietario.

## 4. Base de datos

```bash
npx wrangler d1 migrations apply pedidos-pro-platform --remote --config wrangler.toml
```

## 5. Publicar Worker y PWA

```bash
npm run verify
npm run deploy
```

La carpeta `web` se publica como Static Assets del mismo Worker. Esto elimina problemas de CORS entre la nueva PWA y su API.

## 6. Crear primera cuenta

Abre la URL del Worker, pulsa **Primera instalación** y completa:

- Token de bootstrap.
- Empresa.
- Local principal.
- Nombre.
- Correo.
- Contraseña de al menos 10 caracteres.

La sesión creada no tiene fecha de expiración. Puede revocarse desde Configuración o Equipo.

## 7. Activar almacenamiento R2

Descomenta `[[r2_buckets]]` en `wrangler.toml`, crea el bucket y vuelve a desplegar. Sin R2, el núcleo de pedidos funciona, pero los documentos no deben considerarse archivados legalmente en la nube.

## 8. Paso a producción comercial

Antes de vender:

- Crear un ambiente `staging` y otro `production` con bases separadas.
- Cambiar `ENVIRONMENT` a `production`.
- Restringir `ALLOWED_ORIGINS`.
- Activar Rate Limiting.
- Incorporar R2 y copias de seguridad.
- Añadir pruebas end-to-end con facturas reales anonimizadas.
- Revisar privacidad, términos y tratamiento de datos.
