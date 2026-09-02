(() => {
  'use strict';
  const URL = window.SADEEQ_SUPABASE_URL || '';
  const KEY = window.SADEEQ_SUPABASE_KEY || '';
  const client = window.supabase?.createClient(URL, KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const $ = id => document.getElementById(id);
  const loader = $('loader');
  let closing=false, loaded=false, providers=[], models=[], systemModelId='';
  const status=(message,type='success')=>{ $('status').textContent=message; $('status').className=`model-status show ${type}`; };
  const hideLoader=()=>{loader?.classList.add('hidden');loader?.setAttribute('aria-hidden','true');};
  const login=()=>{if(closing)return;closing=true;location.replace('./index.html?signed_out=1');};
  async function owner(){
    if(!client) throw Error('Authentication service is unavailable.');
    const {data:{session},error}=await client.auth.getSession(); if(error)throw error;
    if(!session){login();return null;}
    const {data:ok,error:ownerError}=await client.rpc('sadeeq_is_owner'); if(ownerError)throw ownerError;
    if(ok!==true){await client.auth.signOut({scope:'local'});login();return null;} $('sessionState').textContent='Secure session'; return session;
  }
  function toast(title,message,type='success'){const el=document.createElement('div');el.className=`toast ${type}`;el.innerHTML='<div><b></b><p></p></div>';el.querySelector('b').textContent=title;el.querySelector('p').textContent=message;$('toastStack').appendChild(el);setTimeout(()=>el.remove(),4200);}
  function providerById(id){return providers.find(p=>p.id===id);}
  function renderProviders(){
    const options=providers.map(p=>`<option value="${p.id}">${escapeHtml(p.display_name)}${p.enabled?'':' — disabled'}</option>`).join('');
    $('providerSelect').innerHTML=options||'<option value="">No providers</option>';
    $('modelProvider').innerHTML=options||'<option value="">No providers</option>';
    renderProviderMeta();
  }
  function renderProviderMeta(){const p=providerById($('providerSelect').value);if(!p){$('providerMeta').textContent='No provider available';return;}$('providerMeta').innerHTML=`<span><b>${escapeHtml(p.display_name)}</b></span><span>${p.credential_secret_id?'Credential configured':'Credential not configured'}</span>`;}
  function renderModels(){
    $('modelCount').textContent=`${models.length} model${models.length===1?'':'s'}`;
    const selected=models.find(m=>m.id===systemModelId);
    $('systemModel').innerHTML='<option value="">No system model selected</option>'+models.filter(m=>m.enabled&&m.status==='ready').map(m=>`<option value="${m.id}">${escapeHtml(m.display_name)} — ${escapeHtml(m.provider.display_name)}</option>`).join('');
    $('systemModel').value=systemModelId;
    $('systemSummary').innerHTML=selected?`<span class="summary-dot"></span><div><b>${escapeHtml(selected.display_name)}</b><small>${escapeHtml(selected.provider.display_name)} · ${escapeHtml(selected.model_key)} · inherited by default</small></div>`:'<span class="summary-dot"></span><div><b>No system model selected</b><small>Create or enable a model, then select it here.</small></div>';
    if(!models.length){$('modelsList').innerHTML='<div class="empty"><b>No models configured</b>Add a model to make it available as the System Model.</div>';return;}
    $('modelsList').innerHTML=models.map(m=>{const isSystem=m.id===systemModelId;return `<div class="model-row"><div class="model-main"><b>${escapeHtml(m.display_name)}</b><small>${escapeHtml(m.provider.display_name)} · ${escapeHtml(m.model_key)}</small></div><div class="model-badges"><span class="badge-chip ${m.enabled?'active':''}">${m.enabled?'ENABLED':'DISABLED'}</span><span class="badge-chip">${escapeHtml(m.status.toUpperCase())}</span>${isSystem?'<span class="badge-chip system">SYSTEM MODEL</span>':''}</div><div class="model-actions"><button class="mini-btn" data-toggle="${m.id}">${m.enabled?'Disable':'Enable'}</button><button class="mini-btn danger" data-delete="${m.id}">Delete</button></div></div>`}).join('');
    document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>toggleModel(b.dataset.toggle));
    document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteModel(b.dataset.delete));
  }
  function escapeHtml(value){const d=document.createElement('div');d.textContent=value??'';return d.innerHTML;}
  async function load(){
    const session=await owner();if(!session)return;
    const [{data:ps,error:pe},{data:ms,error:me},{data:sm,error:se}]=await Promise.all([
      client.from('sadeeq_ai_providers').select('id,provider_key,display_name,base_url,enabled,credential_secret_id,updated_at').order('display_name'),
      client.from('sadeeq_ai_models').select('id,provider_id,model_key,display_name,enabled,status,updated_at,provider:sadeeq_ai_providers(id,provider_key,display_name,enabled,credential_secret_id)').order('display_name'),
      client.from('sadeeq_system_model').select('model_id').eq('id',true).single()
    ]);
    if(pe)throw pe;if(me)throw me;if(se)throw se;
    providers=ps||[];models=ms||[];systemModelId=sm?.model_id||'';renderProviders();renderModels();loaded=true;hideLoader();
  }
  $('providerSelect').addEventListener('change',renderProviderMeta);
  $('providerForm').addEventListener('submit',async e=>{e.preventDefault();const id=$('providerSelect').value,secret=$('credential').value.trim();if(!id)return status('Choose a provider.','error');if(secret.length<8)return status('Enter a valid provider credential.','error');const b=e.submitter;b.disabled=true;try{const {error}=await client.rpc('sadeeq_set_provider_credential',{p_provider_id:id,p_secret:secret});if(error)throw error;$('credential').value='';await load();status('Provider credential saved securely.','success');toast('Connection secured','The credential is stored in Supabase Vault and is not returned to the browser.');}catch(err){status(err?.message||'Could not save credential.','error');}finally{b.disabled=false;}});
  $('clearCredential').onclick=async()=>{const id=$('providerSelect').value;if(!id)return;const p=providerById(id);if(!p?.credential_secret_id)return status('No credential is currently configured.','error');if(!confirm(`Remove the ${p.display_name} connection?`))return;try{const {error}=await client.rpc('sadeeq_clear_provider_credential',{p_provider_id:id});if(error)throw error;await load();status('Provider connection removed.','success');}catch(err){status(err?.message||'Could not remove connection.','error');}};
  $('modelForm').addEventListener('submit',async e=>{e.preventDefault();const provider_id=$('modelProvider').value,model_key=$('modelKey').value.trim(),display_name=$('modelName').value.trim();if(!provider_id||!model_key||!display_name)return status('Provider, model ID and display name are required.','error');const b=e.submitter;b.disabled=true;try{const {error}=await client.from('sadeeq_ai_models').insert({provider_id,model_key,display_name,enabled:true,status:'ready'});if(error)throw error;$('modelKey').value='';$('modelName').value='';await load();status('Model added successfully.','success');}catch(err){status(err?.message||'Could not add model.','error');}finally{b.disabled=false;}});
  $('saveSystem').onclick=async()=>{const id=$('systemModel').value;if(!id)return status('Select a valid enabled model first.','error');const model=models.find(m=>m.id===id);const provider=providerById(model?.provider_id);if(!model||!model.enabled||model.status!=='ready')return status('The selected model is not ready.','error');if(!provider?.enabled)return status('Enable the model provider first.','error');if(!provider.credential_secret_id)return status('Configure the provider credential first.','error');$('saveSystem').disabled=true;try{const {error}=await client.from('sadeeq_system_model').update({model_id:id}).eq('id',true);if(error)throw error;systemModelId=id;renderModels();status('System Model updated. All default-mode bots will inherit it.','success');}catch(err){status(err?.message||'Could not set System Model.','error');}finally{$('saveSystem').disabled=false;}};
  async function toggleModel(id){const m=models.find(x=>x.id===id);if(!m)return;try{const {error}=await client.from('sadeeq_ai_models').update({enabled:!m.enabled,status:!m.enabled?'ready':'disabled'}).eq('id',id);if(error)throw error;if(systemModelId===id&&!m.enabled===false){systemModelId='';await client.from('sadeeq_system_model').update({model_id:null}).eq('id',true);}await load();status(`Model ${m.enabled?'disabled':'enabled'}.`,'success');}catch(err){status(err?.message||'Could not update model.','error');}}
  async function deleteModel(id){const m=models.find(x=>x.id===id);if(!m)return;if(systemModelId===id)return status('Remove this model from System Model before deleting it.','error');if(!confirm(`Delete ${m.display_name}?`))return;try{const {error}=await client.from('sadeeq_ai_models').delete().eq('id',id);if(error)throw error;await load();status('Model deleted.','success');}catch(err){status(err?.message||'Could not delete model.','error');}}
  $('menu').onclick=()=>{$('sidebar').classList.toggle('open');$('scrim').classList.toggle('open');$('menu').setAttribute('aria-expanded',$('sidebar').classList.contains('open'));};$('scrim').onclick=()=>{$('sidebar').classList.remove('open');$('scrim').classList.remove('open');$('menu').setAttribute('aria-expanded','false');};
  document.querySelectorAll('[data-nav]').forEach(item=>item.onclick=e=>{e.preventDefault();status(`${item.dataset.nav} is reserved for its dedicated Sadeeq AI level.`,'success');});
  client?.auth.onAuthStateChange((event,session)=>{if(closing)return;if(event==='SIGNED_OUT'||!session)login();});
  window.setTimeout(()=>{if(!loaded&&!loader.classList.contains('hidden')){hideLoader();status('Model control is taking longer than expected. Please refresh once.','error');}},15000);
  load().catch(err=>{hideLoader();status(err?.message||'Unable to load model control.','error');setTimeout(login,1400);});
})();
