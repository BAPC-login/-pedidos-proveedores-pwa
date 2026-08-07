const decoder=new TextDecoder();
const read16=(view,offset)=>view.getUint16(offset,true),read32=(view,offset)=>view.getUint32(offset,true);
function findEnd(bytes){for(let index=bytes.length-22;index>=Math.max(0,bytes.length-65557);index--)if(bytes[index]===0x50&&bytes[index+1]===0x4b&&bytes[index+2]===0x05&&bytes[index+3]===0x06)return index;return-1}
async function inflate(data,method){if(method===0)return new Uint8Array(data);if(method!==8)throw new Error('El archivo Excel usa una compresión no compatible');if(typeof DecompressionStream!=='function')throw new Error('Este dispositivo no puede descomprimir el libro. Vuelve a guardarlo con Excel o actualiza iOS.');const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return new Uint8Array(await new Response(stream).arrayBuffer())}
async function unzip(buffer){
  const bytes=new Uint8Array(buffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),end=findEnd(bytes);if(end<0)throw new Error('El archivo no es un libro Excel válido');
  const count=read16(view,end+10),centralOffset=read32(view,end+16),files=[];let cursor=centralOffset;
  for(let index=0;index<count;index++){
    if(read32(view,cursor)!==0x02014b50)throw new Error('El libro Excel está dañado');
    const method=read16(view,cursor+10),compressedSize=read32(view,cursor+20),nameLength=read16(view,cursor+28),extraLength=read16(view,cursor+30),commentLength=read16(view,cursor+32),localOffset=read32(view,cursor+42),name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nameLength)),localNameLength=read16(view,localOffset+26),localExtraLength=read16(view,localOffset+28),dataOffset=localOffset+30+localNameLength+localExtraLength,compressed=bytes.slice(dataOffset,dataOffset+compressedSize),inflated=await inflate(compressed,method);
    files.push([name,inflated.buffer]);cursor+=46+nameLength+extraLength+commentLength;
  }
  return files;
}
self.onmessage=async event=>{
  const{id,buffer}=event.data||{};
  try{const files=await unzip(buffer),transfer=files.map(([,entry])=>entry);self.postMessage({id,ok:true,files},transfer)}catch(error){self.postMessage({id,ok:false,error:String(error?.message||error||'xlsx_worker_error')})}
};
