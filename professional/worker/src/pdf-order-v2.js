import {Buffer} from 'node:buffer';
import {createProfessionalOrderPdf} from './pdf.js';

function orderDate(value){
  if(!value)return '—';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return String(value).slice(0,10);
  return date.toLocaleDateString('es-CL');
}

function replacePdfText(bytes){
  let source=Buffer.from(bytes).toString('latin1');
  source=source.replaceAll('(ESTADO)','(FECHA )');
  source=source.replaceAll('(REVISI\\323N)','(PRODUCTOS  )');
  return new Uint8Array(Buffer.from(source,'latin1'));
}

export function createProfessionalOrderPdfV2(context){
  const order=context.order||{};
  const publicOrder={
    ...order,
    status:orderDate(order.createdAt),
    revision:String((order.items||[]).length)
  };
  return replacePdfText(createProfessionalOrderPdf({...context,order:publicOrder}));
}
