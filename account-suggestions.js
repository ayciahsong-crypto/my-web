'use strict';
globalThis.HubAccounts=(()=>{
 const key='hub-remembered-accounts-v1',roles=new Set(['manager','security','engineering']);
 function read(){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value.filter(p=>p&&typeof p.email==='string'&&p.email.length<=254&&roles.has(p.role)).map(p=>({email:p.email,role:p.role,name:typeof p.name==='string'?p.name.slice(0,80):''})):[]}catch{return []}}
 function write(rows){try{localStorage.setItem(key,JSON.stringify(rows));return true}catch{return false}}
 function forPortal(portal){return read().filter(p=>portal==='manager'?p.role==='manager':p.role==='security'||p.role==='engineering')}
 function remember(profile){if(!profile?.active||!roles.has(profile.role)||typeof profile.email!=='string'||!profile.email.includes('@'))return false;const email=profile.email.trim().toLowerCase();if(email.length>254)return false;const row={email,role:profile.role,name:String(profile.display_name||'').slice(0,80)};const rows=[row,...read().filter(p=>p.email.toLowerCase()!==email)];let workers=0,managers=0;return write(rows.filter(p=>p.role==='manager'?++managers<=10:++workers<=10))}
 function forget(email){return write(read().filter(p=>p.email.toLowerCase()!==String(email).toLowerCase()))}
 function clear(portal){return write(read().filter(p=>portal==='manager'?p.role!=='manager':p.role==='manager'))}
 return {forPortal,remember,forget,clear};
})();
function bindAccountSuggestions(selectedPortal){
 const email=document.querySelector('#email'),form=document.querySelector('#login-form');if(!email||!form)return;
 const box=document.createElement('div');box.className='account-suggestion-box';box.hidden=true;box.id='remembered-accounts';box.setAttribute('aria-label','本机记住的'+(selectedPortal==='manager'?'主管':'员工')+'账号');email.closest('label').insertAdjacentElement('afterend',box);
 email.setAttribute('inputmode','email');email.setAttribute('autocapitalize','none');email.setAttribute('spellcheck','false');email.setAttribute('aria-controls',box.id);email.setAttribute('aria-expanded','false');
 function hide(){box.hidden=true;email.setAttribute('aria-expanded','false')}
 function show(){if(email.disabled)return;box.replaceChildren();const stored=HubAccounts.forPortal(selectedPortal),query=email.value.trim().toLowerCase(),rows=stored.filter(p=>!query||p.email.toLowerCase().includes(query)||p.name.toLowerCase().includes(query));
  const title=document.createElement('div');title.className='account-suggestion-heading';title.textContent=selectedPortal==='manager'?'本机主管账号':'本机员工账号';box.append(title);
  if(!rows.length){const empty=document.createElement('p');empty.className='account-suggestion-empty';empty.textContent=stored.length?'没有匹配账号，可以继续手动输入。':'首次使用需输入一次邮箱；登录成功后，下次可直接点选。';box.append(empty)}
  for(const row of rows){const button=document.createElement('button');button.type='button';button.className='account-suggestion-option';const label=document.createElement('strong'),detail=document.createElement('span');label.textContent=row.name||row.email;detail.textContent=row.name?row.email:(row.role==='manager'?'项目主管':row.role==='security'?'保安':'工程部');button.append(label,detail);button.onclick=()=>{email.value=row.email;email.dispatchEvent(new Event('input',{bubbles:true}));hide();document.querySelector('#password')?.focus()};box.append(button)}
  if(stored.length){const clear=document.createElement('button');clear.type='button';clear.className='account-suggestion-clear';clear.textContent='清除本机记住的'+(selectedPortal==='manager'?'主管':'员工')+'账号';clear.onclick=()=>{if(HubAccounts.clear(selectedPortal))show()};box.append(clear)}
  box.hidden=false;email.setAttribute('aria-expanded','true');
 }
 email.addEventListener('focus',show);email.addEventListener('click',show);email.addEventListener('input',show);
 email.addEventListener('keydown',e=>{if(e.key==='Escape')hide();else if(e.key==='ArrowDown'){show();const first=box.querySelector('.account-suggestion-option');if(first){e.preventDefault();first.focus()}}});
 form.addEventListener('focusout',()=>setTimeout(()=>{if(!email.isConnected)return;if(document.activeElement!==email&&!box.contains(document.activeElement))hide()},0));
 form.addEventListener('submit',hide);
}

