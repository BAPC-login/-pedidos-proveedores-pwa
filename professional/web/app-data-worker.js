const escCsv=value=>{
  const text=String(value??'');
  return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
};
self.onmessage=event=>{
  const {id,type,payload={}}=event.data||{};
  try{
    let result;
    if(type==='parse-json')result=JSON.parse(String(payload.text||'{}'));
    else if(type==='stringify-json')result=JSON.stringify(payload.value??null);
    else if(type==='build-csv'){
      const rows=Array.isArray(payload.rows)?payload.rows:[],headers=Array.isArray(payload.headers)?payload.headers:[];
      result=[headers,...rows].map(row=>(Array.isArray(row)?row:headers.map(header=>row?.[header])).map(escCsv).join(',')).join('\r\n');
    }else throw new Error(`Tipo de trabajo no soportado: ${type}`);
    self.postMessage({id,ok:true,result});
  }catch(error){self.postMessage({id,ok:false,error:String(error?.message||error||'worker_error')})}
};
