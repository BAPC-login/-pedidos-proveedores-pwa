(()=>{
  state.providerLogos=state.providerLogos||{};
  persist();
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const toData=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});

  function ensureCard(){
    let card=document.getElementById('providerLogosCard');
    if(card)return card;
    card=document.createElement('section');
    card.id='providerLogosCard';
    card.className='card provider-logo-card';
    card.innerHTML='<div class="sectionhead"><div><h3>Logos de proveedores</h3><span class="muted">Cada logo aparecerá en el PDF de su proveedor.</span></div></div><label class="search"><input id="providerLogoSearch" placeholder="Buscar proveedor" autocomplete="off"></label><div id="providerLogoList"></div>';
    const form=document.getElementById('profileForm');
    form?.insertAdjacentElement('afterend',card);
    card.querySelector('#providerLogoSearch').addEventListener('input',render);
    card.addEventListener('change',async event=>{
      const input=event.target.closest('[data-provider-upload]');
      if(!input?.files?.[0])return;
      const provider=decodeURIComponent(input.dataset.providerUpload);
      state.providerLogos[provider]=await toData(input.files[0]);
      persist();render();toast(`Logo de ${provider} guardado`);
    });
    card.addEventListener('click',event=>{
      const button=event.target.closest('[data-provider-remove]');
      if(!button)return;
      const provider=decodeURIComponent(button.dataset.providerRemove);
      delete state.providerLogos[provider];persist();render();toast(`Logo de ${provider} eliminado`);
    });
    return card;
  }

  function render(){
    const card=ensureCard();if(!card)return;
    const query=(card.querySelector('#providerLogoSearch')?.value||'').toLocaleLowerCase('es');
    const list=providers().filter(provider=>provider.toLocaleLowerCase('es').includes(query));
    card.querySelector('#providerLogoList').innerHTML=list.map(provider=>{
      const logo=state.providerLogos[provider];
      return `<div class="provider-logo-row"><div class="provider-logo-preview">${logo?`<img src="${logo}" alt="Logo ${escapeHtml(provider)}">`:'<span>Sin logo</span>'}</div><div class="provider-logo-name"><b>${escapeHtml(provider)}</b><small>PDF independiente</small></div><label class="btn provider-logo-upload">${logo?'Cambiar':'Agregar'}<input type="file" accept="image/*" data-provider-upload="${encodeURIComponent(provider)}"></label>${logo?`<button class="iconbtn danger-icon" type="button" data-provider-remove="${encodeURIComponent(provider)}">⌫</button>`:''}</div>`;
    }).join('')||'<div class="empty">No se encontraron proveedores.</div>';
  }

  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-view="profile"]'))setTimeout(render,0);
  });
  render();

  const previousMakePdf=window.makePdf;
  window.makePdf=async function(provider){
    const doc=await previousMakePdf(provider);
    const source=state.providerLogos?.[provider];
    if(!source)return doc;
    try{
      const profile=state.profile||{};
      const hasCompanyLogo=!!(profile.logo||profile.logo2);
      let headerBottom=40;
      if(hasCompanyLogo&&(profile.logoPosition==='top'||profile.logoPosition==='bottom')){
        const maxSize=Math.max(profile.logo?Number(profile.logoSize)||42:0,profile.logo2?Number(profile.logo2Size)||28:0);
        const bandHeight=Math.min(36,Math.max(18,maxSize*.52));
        headerBottom=40+bandHeight;
      }
      const properties=doc.getImageProperties(source);
      let width=24,height=width*properties.height/properties.width;
      if(height>12){width*=12/height;height=12}
      if(width>28){height*=28/width;width=28}
      doc.addImage(source,undefined,16,headerBottom+1,width,height,undefined,'FAST');
    }catch(error){console.warn('No se pudo agregar el logo del proveedor',error)}
    return doc;
  };
  const version=document.getElementById('buildVersion');
  if(version)version.textContent='v6.1.0';
})();
