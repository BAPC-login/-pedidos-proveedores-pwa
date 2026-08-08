# Nuvasto

**Compras claras. Abastecimiento inteligente.**

Nuvasto es una plataforma PWA para gestionar pedidos, proveedores, centros de costo, recepción, facturas, conciliación y trazabilidad de compras.

## Capacidades principales

- Lista maestra móvil con cantidades, formatos y proveedor alternativo.
- Archivos editables separados automáticamente por proveedor.
- Emisión, PDF y uso compartido individual o masivo.
- Recepción parcial o total y conciliación pedido–recepción–factura.
- Lectura y cotejo de documentos con Gemini desde el Worker.
- Catálogo multiempresa, multilocal y por centro de costo.
- Historial de precios, alertas y aprobaciones.
- Inicio de sesión interno y Google mediante Cloudflare Access.
- Almacenamiento de facturas, logos e imágenes en Cloudflare R2 cuando el binding `FILES` está activo.
- Conectores asistidos para portales de proveedores y preparación futura de APIs oficiales.

## Rendimiento y estabilidad

- Una sola restauración de sesión y una sola ruta inicial por apertura.
- Lecturas GET concurrentes agrupadas; los maestros usan caché SWR y respaldo temporal ante `429` o fallas transitorias.
- Notificaciones desacopladas de las mutaciones del DOM, con actualización acotada y sin polling duplicado.
- PWA cache-first para recursos estáticos: los módulos se descargan una vez por release y no se revalidan en cada navegación.
- Navegaciones HTML network-first y normalizadas: nunca se entrega a Safari una respuesta cacheada con historial de redirección.
- Handshake liviano en `/platform/release`; `/platform/health` queda reservado para diagnóstico integral de D1, R2 y capacidades.

## Despliegue

El nombre técnico actual del Worker se conserva para no romper la URL, los secretos y la base D1 existentes. La marca visible, la PWA y los documentos se publican como **Nuvasto**.

```bash
cd professional
npm run verify
npm run deploy
```

Para activar R2, crea el bucket privado Standard `nuvasto-files` y despliega con:

```bash
npm run r2:create
npm run deploy:r2
```
