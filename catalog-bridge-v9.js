(()=>{
  const backup=structuredClone(state.catalog||{categories:[],providers:[]});
  setTimeout(()=>{
    if(!state.catalog)return;
    const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
    const categories=new Map(state.catalog.categories.map(entry=>[norm(entry.name),entry]));
    for(const entry of backup.categories||[])if(entry?.name&&!categories.has(norm(entry.name)))state.catalog.categories.push(entry);
    const providers=new Map(state.catalog.providers.map(entry=>[norm(entry.name),entry]));
    for(const entry of backup.providers||[]){
      if(!entry?.name)continue;
      const current=providers.get(norm(entry.name));
      if(!current)state.catalog.providers.push(entry);
      else{
        if(!current.logo&&entry.logo)current.logo=entry.logo;
        if(!current.logoSize&&entry.logoSize)current.logoSize=entry.logoSize;
      }
    }
    persist();
    renderAll();
  },0);
})();
