'use strict';
const HUB_BACKEND = Object.freeze({url:'https://byvywuwfxxioyllssgwi.supabase.co',key:'sb_publishable_0UEn7xF01LGlKsRyb0mZjg_W-6L3kAH'});
class HubAPI {
 constructor(){this.session=null;this.refreshing=null;try{this.session=JSON.parse(sessionStorage.getItem('hub-cloud-session'))}catch{}}
 save(session){this.session=session;if(session)sessionStorage.setItem('hub-cloud-session',JSON.stringify(session));else sessionStorage.removeItem('hub-cloud-session')}
 async raw(path,{method='GET',body,headers={},token,signal}={}){
  const h={apikey:HUB_BACKEND.key,...headers};if(token)h.Authorization='Bearer '+token;
  let data=body;if(body!==undefined&&!(body instanceof Blob)){h['Content-Type']='application/json';data=JSON.stringify(body)}
  let response;try{response=await fetch(HUB_BACKEND.url+path,{method,headers:h,body:data,signal})}catch{throw new Error('无法连接后台，请检查网络后重试。')}
  const text=await response.text();let result;try{result=text?JSON.parse(text):null}catch{result=text}
  if(!response.ok){const err=new Error(result?.message||result?.msg||result?.error_description||result?.error||'后台请求失败');err.status=response.status;err.code=result?.code;throw err}return result;
 }
 async refresh(){if(!this.session?.refresh_token)throw new Error('登录已过期，请重新登录');if(!this.refreshing)this.refreshing=this.raw('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:this.session.refresh_token}}).then(s=>{this.save(s);return s}).catch(e=>{this.save(null);throw e}).finally(()=>this.refreshing=null);return this.refreshing}
 async request(path,opts={}){if(!this.session)throw new Error('请先登录');if(this.session.expires_at*1000<Date.now()+60000)await this.refresh();try{return await this.raw(path,{...opts,token:this.session.access_token})}catch(e){if(e.status!==401)throw e;await this.refresh();return this.raw(path,{...opts,token:this.session.access_token})}}
 async login(email,password){const s=await this.raw('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});this.save(s);return s}
 async logout(){try{if(this.session)await this.raw('/auth/v1/logout',{method:'POST',token:this.session.access_token})}finally{this.save(null)}}
 async all(table,query=''){let rows=[];for(let offset=0;offset<20000;offset+=500){const batch=await this.request('/rest/v1/'+table+'?'+query+'&limit=500&offset='+offset);rows.push(...batch);if(batch.length<500)return rows}throw new Error('记录过多，请缩小日期范围后查询，当前未显示不完整统计')}
 async profile(){const u=await this.request('/auth/v1/user');const p=await this.request('/rest/v1/inspection_profiles?id=eq.'+encodeURIComponent(u.id)+'&select=*');if(!p[0])throw new Error('账号资料尚未初始化，请先运行数据库脚本');return p[0]}
 async points(){return this.all('inspection_points','select=*&order=created_at.asc,id.asc')}
 async settings(){const rows=await this.request('/rest/v1/inspection_settings?id=eq.1&select=*');if(!rows[0])throw new Error('巡检计划尚未初始化');return rows[0]}
 async patch(table,id,data){return this.request('/rest/v1/'+table+'?id=eq.'+encodeURIComponent(id),{method:'PATCH',body:data,headers:{Prefer:'return=representation'}})}
 async insert(table,data){return this.request('/rest/v1/'+table,{method:'POST',body:data,headers:{Prefer:'return=representation'}})}
 async upload(path,blob){return this.request('/storage/v1/object/inspection-photos/'+path,{method:'POST',body:blob,headers:{'Content-Type':'image/jpeg','x-upsert':'false'}})}
 async removeOrphan(path){return this.request('/storage/v1/object/inspection-photos',{method:'DELETE',body:{prefixes:[path]}})}
 async photoURL(path){const r=await this.request('/storage/v1/object/sign/inspection-photos/'+path,{method:'POST',body:{expiresIn:300}});const value=r.signedURL||r.signedUrl;if(!value)throw new Error('无法生成照片访问链接');return value.startsWith('http')?value:HUB_BACKEND.url+'/storage/v1'+value}
}
globalThis.HubAPI=HubAPI;

