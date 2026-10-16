// Recepción compacta v96: prellenado conservador y lista accesible sin tarjetas por producto.
// Los valores son sugerencias editables; nunca generan recepciones por sí mismos.
const finite=value=>{const n=Number(value);return Number.isFinite(n)?n:0};
const positive=value=>Math.max(0,finite(value));
const roundQty=value=>Number(positive(value).toFixed(3));
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function receptionPrefill(item,comparison=null,hasLinkedInvoice=false){
  const remaining=positive(item.quantityOrdered)-positive(item.quantityReceived);
  const pending=roundQty(remaining);
  const rawUnits=positive(comparison?.invoiced);
  const pack=positive(item.unitsPerOrderUnit)||1;
  // Sin línea vinculada no se interpreta una cifra cero como entrega ausente.
  if(!hasLinkedInvoice||!comparison||rawUnits<=0)return{quantity:pending,source:'pedido',pending,invoiceQuantity:null};
  const billedOrderUnits=rawUnits/pack;
  const available=positive(billedOrderUnits-positive(item.quantityReceived));
  return{quantity:roundQty(Math.min(pending,available)),source:'factura',pending,invoiceQuantity:roundQty(billedOrderUnits)};
}

const incidentOptions=[
  ['', 'Sin incidencia'],
  ['missing', 'Faltante'],
  ['damaged', 'Producto dañado'],
  ['expired', 'Producto vencido'],
  ['temperature', 'Temperatura fuera de rango'],
  ['overage', 'Excedente'],
  ['lot', 'Control de lote'],
  ['note', 'Otra observación']
];

export function renderCompactReception(items,comparisonItems=[],hasLinkedInvoice=false){
  const comparison=new Map(comparisonItems.map(row=>[String(row.id),row]));
  return '<section class="v96-reception" aria-label="Productos por recepcionar">'
    +'<div class="v96-reception-heading"><strong>Productos a recepcionar</strong><small>'
    +(hasLinkedInvoice?'Cantidad sugerida desde la factura cuando hay coincidencia. Revisa antes de confirmar.':'Cantidades pendientes según el pedido. Puedes modificarlas.')
    +'</small></div><div class="v96-reception-list">'
    +items.map((item,index)=>{
      const suggested=receptionPrefill(item,comparison.get(String(item.id)),hasLinkedInvoice);
      const unit=escapeHtml(item.orderUnit||'unidades');
      const description=escapeHtml(item.description||'Producto');
      const key='v96ReceptionExtra'+index;
      const source=suggested.source==='factura'
        ?'Factura: '+suggested.invoiceQuantity+' '+unit+' · pendiente '+suggested.pending
        :'Pedido: '+suggested.pending+' '+unit+' pendientes'+(hasLinkedInvoice?' · sin coincidencia facturada':'');
      return '<article class="v96-reception-row" data-reception-line="'+escapeHtml(item.id)+'" data-pending="'+suggested.pending+'">'
        +'<div class="v96-reception-product"><strong class="v96-reception-name">'+description+'</strong><small>'+source+'</small></div>'
        +'<label class="field v96-reception-quantity"><span>Recibido</span><input name="accepted" aria-label="Cantidad recibida de '+description+'" type="number" inputmode="decimal" min="0" step="0.001" value="'+suggested.quantity+'" required></label>'
        +'<button type="button" class="v96-reception-toggle" data-v96-reception-toggle aria-expanded="false" aria-controls="'+key+'" aria-label="Desplegar incidencias y detalles de '+description+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>'
        +'<div class="v96-reception-extra" id="'+key+'" hidden>'
        +'<label class="field"><span>Incidencia</span><select name="qualityType">'+incidentOptions.map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join('')+'</select></label>'
        +'<label class="field"><span>Cantidad rechazada</span><input name="rejected" type="number" min="0" step="0.001" value="0" inputmode="decimal"></label>'
        +'<label class="field v96-reception-wide"><span>Observación</span><input name="qualityNote" placeholder="Motivo o condición (opcional)"></label>'
        +'<label class="field"><span>Lote</span><input name="lotNumber"></label>'
        +'<label class="field"><span>Vencimiento</span><input name="expiresAt" type="date"></label>'
        +'<label class="field"><span>Temperatura °C</span><input name="temperature" type="number" step="0.1" inputmode="decimal"></label>'
        +'<label class="field"><span>Fotografía</span><input name="qualityPhoto" type="file" accept="image/*" capture="environment"></label>'
        +'</div></article>';
    }).join('')
    +'</div></section><details class="v96-reception-general"><summary>Datos de entrega y observaciones (opcional)</summary>'
    +'<div class="v30-field-grid"><label class="field"><span>Número de guía</span><input name="deliveryNoteNumber"></label>'
    +'<label class="field"><span>Fecha y hora</span><input name="receivedAt" type="datetime-local"></label>'
    +'<label class="field full"><span>Observaciones generales</span><textarea name="notes"></textarea></label></div></details>';
}
