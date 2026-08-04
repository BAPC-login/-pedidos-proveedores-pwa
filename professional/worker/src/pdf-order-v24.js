import {createProfessionalOrderPdfV22} from './pdf-order-v22.js';

const encoder=new TextEncoder();

function replaceSameLength(bytes,from,to){
  const source=encoder.encode(from),replacement=encoder.encode(to);
  if(source.length!==replacement.length)throw new Error('pdf_patch_length_mismatch');
  for(let index=0;index<=bytes.length-source.length;index++){
    let match=true;
    for(let cursor=0;cursor<source.length;cursor++)if(bytes[index+cursor]!==source[cursor]){match=false;break}
    if(!match)continue;
    bytes.set(replacement,index);
    index+=source.length-1;
  }
}

export function createProfessionalOrderPdfV24(context){
  const bytes=new Uint8Array(createProfessionalOrderPdfV22(context));
  // V22 enviaba algunos grosores como si fueran operadores de pintura ("re 0.25").
  // Se corrige sin alterar el largo del archivo, por lo que las posiciones xref siguen válidas.
  replaceSameLength(bytes,' re 0.25\n',' re S   \n');
  replaceSameLength(bytes,' re 0.3\n',' re S  \n');
  replaceSameLength(bytes,'%NuvastoPDFV22','%NuvastoPDFV24');
  return bytes;
}
