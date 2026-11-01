'use strict';
// Photos remain private: request a short-lived URL separately for each download.
globalThis.HubBatch=(()=>{
 const MAX_BYTES=200*1024*1024,MAX_FILES=500;
 const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);return c>>>0});
 function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
 function safe(value){return String(value??'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/\.+$/,'').slice(0,65)||'未命名'}
 function filename(r,i){return safe(r.work_date)+'/'+safe(r.employee_name)+'_'+safe(r.user_id).slice(0,8)+'/'+String(i+1).padStart(4,'0')+'_'+safe(r.shift)+'_第'+r.round_no+'轮_'+safe(r.point_name)+'_'+safe(r.id).slice(0,8)+'.jpg'}
 function zip(files){const encoder=new TextEncoder(),local=[],central=[];let offset=0;const block=n=>{const bytes=new Uint8Array(n);return {bytes,v:new DataView(bytes.buffer)}};
  for(const f of files){const name=encoder.encode(f.name),bytes=f.bytes,c=crc32(bytes),l=block(30),d=block(46);l.v.setUint32(0,0x04034b50,true);l.v.setUint16(4,20,true);l.v.setUint16(6,0x800,true);l.v.setUint16(12,33,true);l.v.setUint32(14,c,true);l.v.setUint32(18,bytes.length,true);l.v.setUint32(22,bytes.length,true);l.v.setUint16(26,name.length,true);
   d.v.setUint32(0,0x02014b50,true);d.v.setUint16(4,20,true);d.v.setUint16(6,20,true);d.v.setUint16(8,0x800,true);d.v.setUint16(14,33,true);d.v.setUint32(16,c,true);d.v.setUint32(20,bytes.length,true);d.v.setUint32(24,bytes.length,true);d.v.setUint16(28,name.length,true);d.v.setUint32(42,offset,true);local.push(l.bytes,name,bytes);central.push(d.bytes,name);offset+=30+name.length+bytes.length;
  }const size=central.reduce((n,b)=>n+b.length,0),end=block(22);end.v.setUint32(0,0x06054b50,true);end.v.setUint16(8,files.length,true);end.v.setUint16(10,files.length,true);end.v.setUint32(12,size,true);end.v.setUint32(16,offset,true);return new Blob([...local,...central,end.bytes],{type:'application/zip'})}
 function check(signal){if(signal?.aborted)throw new DOMException('已取消下载','AbortError')}
 async function signedURL(getURL,path,signal){check(signal);let timer,abort;const stop=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('获取照片访问权限超时，请重试')),30000);abort=()=>reject(new DOMException('已取消下载','AbortError'));signal?.addEventListener('abort',abort,{once:true})});try{return await Promise.race([getURL(path),stop])}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}}
 async function download(records,{getURL,fetcher=fetch,signal,onProgress=()=>{}}){
  if(!records.length)throw new Error('请先选择照片');if(records.length>MAX_FILES)throw new Error('单次最多下载500张，请按日期或账号分批选择');
  const files=[],results=[];let totalBytes=0;
  for(let i=0;i<records.length;i++){check(signal);const r=records[i],name=filename(r,i);let timeout,abort;
   try{const url=await signedURL(getURL,r.photo_path,signal);check(signal);const controller=new AbortController();abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});timeout=setTimeout(()=>controller.abort(),45000);
    const res=await fetcher(url,{signal:controller.signal});if(!res.ok)throw new Error('照片请求失败（HTTP '+res.status+'）');const advertised=Number(res.headers?.get('Content-Length')||0);if(advertised+totalBytes>MAX_BYTES)throw Object.assign(new Error('照片合计超过200MB，请缩小查询范围或减少勾选数量后重试'),{limit:true});
    const bytes=new Uint8Array(await res.arrayBuffer());check(signal);if(bytes.length+totalBytes>MAX_BYTES)throw Object.assign(new Error('照片合计超过200MB，请缩小查询范围或减少勾选数量后重试'),{limit:true});
    if(bytes.length<3||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new Error('返回内容不是有效的 JPG 照片');
    totalBytes+=bytes.length;files.push({name,bytes});results.push({record:r,name,ok:true});
   }catch(e){check(signal);if(e.limit)throw e;results.push({record:r,name:'',ok:false,error:e.name==='AbortError'?'照片下载超时，请重试':e.message||'照片下载失败'});
   }finally{clearTimeout(timeout);if(abort)signal?.removeEventListener('abort',abort)}
   onProgress({done:i+1,total:records.length,success:files.length,failed:results.filter(r=>!r.ok).length,bytes:totalBytes});
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  check(signal);if(!files.length)throw new Error('没有照片下载成功，请检查网络及账号权限后重试');check(signal);return {blob:zip(files),success:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok),totalBytes};
 }
 return {download,zip,filename,MAX_FILES,MAX_BYTES};
})();

