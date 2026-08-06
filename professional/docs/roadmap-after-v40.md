# Nuvasto — hoja de ruta posterior a v40

Este documento registra mejoras pendientes detectadas al revisar los flujos de pedidos, facturas, recepción, catálogo, analítica, PWA y arquitectura acumulada del proyecto.

## Prioridad 0 — validación productiva inmediata

1. Ejecutar una prueba real con dos o más dispositivos emitiendo pedidos simultáneamente y verificar que el orden de folios coincida con el orden aceptado por el servidor.
2. Probar una lista maestra extensa en iPhone con teclado abierto, limpiar cantidades, cerrar, recuperar borrador y emitir.
3. Habilitar y deshabilitar relaciones en la matriz y comprobar que los formatos existentes no se pierdan.
4. Registrar recepciones completas, parciales, con rechazo, excedente, lote, vencimiento, temperatura y fotografía.
5. Validar el dashboard con combinaciones de local, centro, categoría, proveedor y fechas, contrastando cifras contra facturas y pedidos.
6. Revisar la campana en perfiles owner, compras, recepción, finanzas y solo lectura.

## Operación de compras

### Alta prioridad

- Incorporar un flujo explícito de aprobación por monto, centro de costo y rol antes de emitir.
- Mostrar presupuesto disponible, comprometido, facturado y diferencia antes de confirmar el pedido.
- Validar mínimos comerciales, múltiplos de compra y días de despacho del proveedor en la lista maestra.
- Permitir reemplazos por quiebre de stock conservando trazabilidad entre producto solicitado y sustituto.
- Incorporar comentarios internos y menciones por pedido, sin imprimirlos en el PDF del proveedor.
- Añadir estados de confirmación del proveedor: enviado, visto, confirmado, parcial, sin stock y rechazado.
- Registrar fecha prometida real y comparar contra fecha solicitada para medir cumplimiento.
- Implementar cierre masivo de pedidos totalmente conciliados.

### Prioridad media

- Plantillas de pedido recurrente por día de la semana, evento o nivel mínimo.
- Sugerencias automáticas basadas en consumo, frecuencia y estacionalidad.
- Comparador de alternativas de proveedor por costo total, plazo, mínimo y confiabilidad.
- Órdenes de compra consolidadas para proveedores que atienden varios centros o locales.
- Notas internas por producto y restricciones de sustitución.

## Recepción

### Alta prioridad

- Separar claramente recepción física, control de calidad y cierre documental.
- Admitir varias recepciones parciales para un mismo pedido sin perder el saldo pendiente.
- Crear una bandeja exclusiva de recepciones pendientes, atrasadas y con diferencias.
- Incorporar lectura de código de barras o QR para localizar rápidamente el producto.
- Permitir recepción por caja, unidad, peso y volumen con conversión visible.
- Agregar firma o identificación del receptor y del transportista.
- Generar acta de diferencias con fotografías y opción de compartir al proveedor.
- Incorporar devoluciones, reposiciones y mercadería rechazada después de la recepción inicial.
- Evitar dobles recepciones mediante idempotencia y control de versión por pedido.

### Prioridad media

- Modo de recepción rápida para pedidos sin diferencias.
- Ordenar productos por ubicación física de bodega.
- Capturar lote y vencimiento mediante cámara cuando el formato lo permita.
- Alertar vencimientos cercanos y lotes repetidos.
- Soportar recepción offline con cola local y resolución de conflictos al reconectar.

## Facturas, documentos y conciliación

### Alta prioridad

- Detectar facturas duplicadas por RUT, tipo, número y monto antes de guardar.
- Validar matemáticamente neto, IVA, impuestos adicionales y total.
- Tratar notas de crédito como reversos vinculados a una factura original.
- Diferenciar factura, guía, boleta, nota de crédito y documento sin cargo en reportes.
- Permitir dividir una línea de factura entre varios productos cuando la descripción agrupa ítems.
- Incorporar estado de pago: pendiente, programado, pagado, vencido y objetado.
- Mostrar una conciliación por línea con pedido, recepción, factura, precio y tolerancia.
- Crear una bandeja de excepciones con responsable y resolución obligatoria.

### Prioridad media

- Aprendizaje versionado de correcciones con posibilidad de deshacer una regla equivocada.
- Detección de cambios de formato y contenido por proveedor.
- Consolidación de archivos multipágina y documentos fotografiados por partes.
- Extracción de orden de compra, guía asociada y condiciones de pago.
- Exportación contable estructurada para sistemas externos.

## Catálogo y maestros

### Alta prioridad

- Edición masiva de relaciones producto–proveedor desde la matriz.
- Confirmación adicional al deshabilitar la última relación activa de un producto.
- Conservar y mostrar formato, múltiplo, mínimo y último precio directamente en la matriz.
- Virtualizar la matriz y las listas de más de 200 filas para evitar lentitud en móviles.
- Detectar productos duplicados por nombre normalizado, marca, volumen y código.
- Incorporar códigos internos, códigos de barras y SKU por proveedor.
- Definir una unidad base por producto y conversiones consistentes entre proveedores.
- Historial auditable de cambios de categoría, formato, proveedor y precio.

### Prioridad media

- Importación masiva con vista previa de conflictos y reglas de fusión.
- Catálogo por temporada o vigencia.
- Productos sustitutos y equivalentes.
- Fotografías optimizadas con miniaturas y compresión automática.
- Clasificación asistida por IA, siempre confirmada por una persona.

## Dashboard, reportes y alertas

### Alta prioridad

- Verificar y documentar la definición exacta de cada KPI.
- Incorporar comparación contra período anterior y contra presupuesto.
- Permitir guardar vistas de filtros por usuario.
- Añadir desglose al tocar un gráfico, llegando a los pedidos o facturas que explican el valor.
- Mostrar ejes, valores, unidades y tooltips accesibles en todos los gráficos.
- Evitar doble contabilización cuando una factura se vincula a más de un pedido o centro.
- Separar alertas operativas, financieras, de datos y de seguridad.
- Guardar lectura, archivo y resolución de cada notificación en servidor, no solo en el dispositivo.
- Crear notificaciones push configurables por rol y severidad.

### Prioridad media

- Scorecard de proveedores: cumplimiento, diferencias, precios, tiempo de respuesta y rechazo.
- Variación de precios por producto, proveedor y centro.
- Pronóstico de compras y caja.
- Exportación de gráficos y tablas a PDF, imagen y Excel.
- Dashboard ejecutivo multiempresa y comparativo entre locales.

## Interfaz y experiencia

### Alta prioridad

- Convertir las bandas alternadas en un componente de diseño común, evitando selectores CSS globales frágiles.
- Unificar tamaños, jerarquías tipográficas, estados y densidad de todas las tablas y tarjetas.
- Revisar contraste en modo oscuro y bajo brillo.
- Añadir estados de carga, vacío, error y reintento específicos para cada módulo.
- Mantener siempre visible la acción principal sin tapar contenido ni el teclado.
- Evitar que modales extensos pierdan el contexto al reemplazarse por otro paso.
- Añadir confirmación de salida cuando existen cambios sin guardar.
- Mejorar accesibilidad: foco visible, etiquetas, navegación con teclado, lector de pantalla y áreas táctiles.
- Reducir texto técnico en mensajes destinados a operación.

### Prioridad media

- Densidad compacta y cómoda seleccionable por usuario.
- Preferencias persistentes de columnas y orden.
- Búsqueda global con resultados por pedidos, productos, proveedores y documentos.
- Acciones por deslizamiento en móvil, sin ocultar alternativas esenciales.
- Tutorial contextual y ayuda integrada por módulo.

## Sincronización, rendimiento y PWA

### Alta prioridad

- Reemplazar el refresco periódico por sincronización en tiempo real mediante WebSocket, Durable Object o SSE cuando la arquitectura lo permita.
- Incluir versión de registro u optimistic locking al editar pedidos y recepciones desde varios dispositivos.
- Mostrar presencia o aviso cuando otro usuario está editando el mismo archivo.
- Resolver conflictos de cambios en lugar de aplicar siempre la última escritura.
- Medir y reducir tamaño del bundle; retirar capas heredadas que ya fueron reemplazadas.
- Cargar módulos por ruta y evitar ejecutar múltiples observadores globales simultáneamente.
- Virtualizar tablas y listas largas.
- Añadir índices D1 para filtros usados por dashboard, historial y conciliación.
- Mover cálculos pesados y generación de documentos a colas o tareas de fondo.
- Definir una estrategia de caché PWA por versión que no recargue durante una operación crítica.

### Prioridad media

- Modo offline claramente señalado con límites funcionales.
- Cola de subida reanudable para imágenes y PDF grandes.
- Compresión de imágenes antes de subir.
- Precarga selectiva de datos usados con frecuencia.
- Métricas de rendimiento reales por dispositivo y conexión.

## Arquitectura y programación

### Alta prioridad

- Consolidar las capas `v13` a `v40` en módulos estables y retirar envoltorios obsoletos después de una migración controlada.
- Separar dominio, persistencia, API y presentación para pedidos, facturas y recepciones.
- Introducir esquemas de validación compartidos entre frontend y Worker.
- Documentar contratos de API y códigos de error.
- Crear transacciones o procedimientos seguros para operaciones que modifican varias tablas.
- Mantener idempotencia en creación, emisión, recepción, facturación y pagos.
- Añadir pruebas de concurrencia reales para folios, recepciones y facturas duplicadas.
- Incorporar migraciones reversibles o estrategia de recuperación para cambios críticos.
- Centralizar fechas, zona horaria de Chile y formatos de calendario.
- Crear una política de retención y eliminación para archivos R2.

### Prioridad media

- Tipado estático gradual con TypeScript o JSDoc verificado.
- Componentes UI reutilizables en vez de manipulación DOM repetida.
- Feature flags por organización para despliegues progresivos.
- Separar configuración de entorno, secretos y capacidades.
- Documentación técnica de tablas, índices, eventos y estados.

## Seguridad y auditoría

### Alta prioridad

- Revisar permisos por acción y centro de costo, no solo por rol general.
- Impedir que usuarios fuera de alcance obtengan datos mediante filtros o identificadores directos.
- Registrar actor, dispositivo, fecha, IP aproximada y cambio anterior/nuevo en acciones críticas.
- Revisar revocación de sesiones y listado de dispositivos activos.
- Aplicar límites por usuario y organización a cargas de archivos y análisis.
- Escanear tipos reales de archivos y rechazar contenido incompatible.
- Proteger exportaciones y enlaces compartidos mediante expiración y autorización.
- Automatizar copias de seguridad y pruebas periódicas de restauración.

### Prioridad media

- Autenticación multifactor para propietarios y administradores.
- Alertas de acceso inusual y cambios masivos.
- Auditoría inmutable o exportable para cumplimiento.
- Revisión periódica de dependencias y secretos.

## Calidad y pruebas

### Alta prioridad

- E2E autenticado en iPhone/Safari, Android/Chrome y escritorio.
- Pruebas con red lenta, pérdida de conexión y reanudación.
- Pruebas con 200–1.000 productos y matrices amplias.
- Prueba de veinte documentos grandes y varios formatos consecutivos.
- Prueba de emisión simultánea desde varios dispositivos.
- Prueba de recepción simultánea y detección de conflicto.
- Pruebas visuales automáticas en modo claro y oscuro.
- Presupuestos de rendimiento para carga inicial, cambio de ruta y apertura de modales.
- Verificación de cálculos monetarios, impuestos, conversiones y redondeos.

## Preparación SaaS

- Onboarding guiado con importación inicial y validación de calidad de datos.
- Planes y límites claros por usuarios, locales, documentos y almacenamiento.
- Facturación, suspensión, reactivación y períodos de gracia.
- Panel de uso y consumo por organización.
- Soporte, estado del servicio y diagnóstico dentro de la aplicación.
- Acuerdos, privacidad, exportación y eliminación de datos.
- Herramientas de administración de plataforma sin acceso innecesario al contenido del cliente.
- Migración segura desde entorno compartido hacia aislamiento reforzado cuando aumente la escala.

## Orden sugerido de próximas entregas

1. Validación productiva v40 y corrección de regresiones.
2. Recepción parcial, devoluciones y bandeja de diferencias.
3. Detección de facturas duplicadas y notas de crédito.
4. Edición masiva y virtualización de catálogo/matriz.
5. Notificaciones persistentes y sincronización en tiempo real.
6. Aprobaciones, presupuestos y confirmación del proveedor.
7. Consolidación arquitectónica y eliminación de capas heredadas.
8. Scorecard de proveedores, pronósticos y exportación ejecutiva.
9. Seguridad avanzada, recuperación y preparación comercial SaaS.
