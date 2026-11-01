'use strict';
function updateBatchSelection(){
 const visible=new Set(records.map(r=>r.id));selectedPhotos=new Set([...selectedPhotos].filter(id=>visible.has(id)));
 document.querySelectorAll('[data-select-photo]').forEach(c=>c.checked=selectedPhotos.has(c.dataset.selectPhoto));
 const all=$('#select-all-photos');if(all){all.checked=records.length>0&&selectedPhotos.size===records.length;all.indeterminate=selectedPhotos.size>0&&selectedPhotos.size<records.length}
 if($('#selected-photo-count'))$('#selected-photo-count').textContent='已选 '+selectedPhotos.size+' / '+records.length+' 张';
 if($('#download-selected'))$('#download-selected').disabled=!selectedPhotos.size;
}
function bindBatchDownloads(){
 if(!$('#select-all-photos'))return;
 $('#select-all-photos').onchange=e=>{selectedPhotos=e.target.checked?new Set(records.map(r=>r.id)):new Set();updateBatchSelection()};
 document.querySelectorAll('[data-select-photo]').forEach(c=>c.onchange=()=>{if(c.checked)selectedPhotos.add(c.dataset.selectPhoto);else selectedPhotos.delete(c.dataset.selectPhoto);updateBatchSelection()});
 $('#clear-photo-selection').onclick=()=>{selectedPhotos.clear();updateBatchSelection()};
 $('#download-selected').onclick=()=>startBatchDownload(records.filter(r=>selectedPhotos.has(r.id)));
 $('#download-filtered').onclick=()=>startBatchDownload([...records]);updateBatchSelection();
}
async function startBatchDownload(list){
 if(!me||me.role!=='manager'||batchBusy)return;
 if(!list.length)return toast('请先选择要下载的照片');if(list.length>HubBatch.MAX_FILES)return toast('单次最多500张，请按日期或账号分批选择');
 const range={...filter},controller=new AbortController();let running=true;batchBusy=true;
 $('#batch-dialog')?.remove();const dialog=document.createElement('dialog');dialog.id='batch-dialog';dialog.setAttribute('aria-labelledby','batch-title');
 dialog.innerHTML='<div class="section-head"><h3 id="batch-title">批量下载照片</h3><button id="batch-close">取消打包</button></div><p id="batch-status" role="status" aria-live="polite"></p><progress id="batch-progress" max="100" value="0"></progress><p id="batch-detail" class="muted">正在获取照片，过程中可取消；不会修改云端记录。</p><div class="buttons"><button id="batch-save" class="primary" hidden>下载 ZIP</button><button id="batch-failed" hidden>选中失败记录以重试</button></div>';
 document.body.append(dialog);dialog.showModal();
 const status=dialog.querySelector('#batch-status'),progress=dialog.querySelector('#batch-progress'),detail=dialog.querySelector('#batch-detail'),close=dialog.querySelector('#batch-close'),save=dialog.querySelector('#batch-save'),retry=dialog.querySelector('#batch-failed');
 status.textContent='准备下载 '+list.length+' 张照片…';
 close.onclick=()=>{if(running){controller.abort();close.disabled=true;status.textContent='正在取消…'}else dialog.close()};
 dialog.addEventListener('cancel',e=>{if(running){e.preventDefault();controller.abort();close.disabled=true;status.textContent='正在取消…'}});dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 try{
  const result=await HubBatch.download(list,{getURL:path=>api.photoURL(path),signal:controller.signal,onProgress:p=>{status.textContent='已处理 '+p.done+' / '+p.total+' 张，成功 '+p.success+' 张，失败 '+p.failed+' 张';progress.value=p.done/p.total*100;detail.textContent='已接收 '+(p.bytes/1024/1024).toFixed(1)+' MB · 正在准备 ZIP'}});
  progress.value=100;status.textContent='打包完成：成功 '+result.success+' 张，失败 '+result.failed.length+' 张。';detail.textContent=result.failed.length?'失败原因已写入 ZIP 内的“打卡明细.csv”；可以选中失败记录重试。':'ZIP 内含 JPG 照片和打卡明细 CSV，照片按工作日期与人员分文件夹。';
  save.hidden=false;save.textContent='下载 ZIP（'+result.success+' 张照片）';save.onclick=()=>download(result.blob,'巡检照片_'+range.from+'_'+range.to+'.zip');
  if(result.failed.length){retry.hidden=false;retry.onclick=()=>{selectedPhotos=new Set(result.failed.map(f=>f.record.id));updateBatchSelection();dialog.close()}}
 }catch(e){status.textContent=e.name==='AbortError'?'已取消打包，未生成下载文件。':errorText(e);detail.textContent='云端记录和照片未作更改。可关闭后重新选择或重试。';progress.value=0;
 }finally{running=false;batchBusy=false;close.disabled=false;close.textContent='关闭'}
}

