'use strict';
function deleteFeatureError(e){return e.code==='PGRST202'||e.code==='42883'?'删除功能尚未启用，请先在 Supabase SQL Editor 执行 backend/03-manager-delete-photos.sql。':errorText(e)}
async function cleanupPhotoTask(task){
 await api.request('/storage/v1/object/inspection-photos',{method:'DELETE',body:{prefixes:[task.photo_path]}});
 // Do not acknowledge success until the database verifies that Storage really removed it.
 await api.request('/rest/v1/rpc/inspection_finish_photo_delete',{method:'POST',body:{p_record_id:task.id}});
}
async function refreshPhotoCleanup(){
 if(!me||me.role!=='manager'||!$('#photo-cleanup-status'))return;
 const element=$('#photo-cleanup-status');try{const tasks=await api.request('/rest/v1/rpc/inspection_pending_photo_deletions',{method:'POST',body:{}});if(!element.isConnected)return;
 element.textContent=tasks.length?'有 '+tasks[0].total_pending+' 张已移出列表的照片等待文件清理。':'';
 const button=$('#retry-photo-cleanup');if(button)button.hidden=!tasks.length;
 }catch(e){if(element.isConnected)element.textContent=(e.code==='PGRST202'||e.code==='42883')?'首次启用删除功能，请先执行后台 03-manager-delete-photos.sql 脚本。':'无法查询照片清理状态，请刷新后重试。'}
}
function bindManagerPhotoDelete(){
 if(!me||me.role!=='manager')return;
 document.querySelectorAll('[data-delete-photo]').forEach(button=>button.onclick=()=>confirmPhotoDelete(button.dataset.deletePhoto));
 if($('#retry-photo-cleanup'))$('#retry-photo-cleanup').onclick=retryPhotoCleanup;
 refreshPhotoCleanup();
}
async function confirmPhotoDelete(id){
 if(!me||me.role!=='manager'||photoDeleting||batchBusy)return;
 const record=records.find(r=>r.id===id);if(!record)return;
 $('#delete-photo-dialog')?.remove();const dialog=document.createElement('dialog');dialog.id='delete-photo-dialog';dialog.setAttribute('aria-labelledby','delete-photo-title');
 dialog.innerHTML=`<h3 id="delete-photo-title">确认删除照片？</h3><p>${esc(record.employee_name)} · ${esc(record.point_name)}</p><p class="muted">${record.work_date} ${record.shift} · 第 ${record.round_no} 轮</p><p>照片和对应打卡记录将被删除，汇总数量也会减少，无法在应用内恢复。</p><div id="delete-photo-status" class="form-error" role="status"></div><div class="buttons"><button id="cancel-photo-delete">取消</button><button id="confirm-photo-delete" class="danger">确认删除</button></div>`;
 document.body.append(dialog);dialog.showModal();let running=false;const cancel=dialog.querySelector('#cancel-photo-delete'),confirm=dialog.querySelector('#confirm-photo-delete'),status=dialog.querySelector('#delete-photo-status');cancel.onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(running)e.preventDefault()});dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 confirm.onclick=async()=>{if(running)return;running=true;photoDeleting=true;cancel.disabled=true;confirm.disabled=true;status.textContent='正在删除，请稍候…';let queued=false;
  try{const tasks=await api.request('/rest/v1/rpc/inspection_delete_photo',{method:'POST',body:{p_record_id:id}});queued=true;selectedPhotos.delete(id);records=records.filter(r=>r.id!==id);
   if(tasks.length)await cleanupPhotoTask(tasks[0]);dialog.close();toast('照片及对应打卡已删除');
  }catch(e){if(queued){dialog.close();toast('记录已移出列表，但文件清理未完成。请点击“重试文件清理”。')}else{status.textContent=deleteFeatureError(e);confirm.disabled=false}
  }finally{photoDeleting=false;running=false;cancel.disabled=false;if(queued)await reload()}
 };
}
async function retryPhotoCleanup(){
 if(!me||me.role!=='manager'||photoDeleting||batchBusy)return;photoDeleting=true;const button=$('#retry-photo-cleanup'),status=$('#photo-cleanup-status');button.disabled=true;let success=0,failed=0;
 try{const tasks=await api.request('/rest/v1/rpc/inspection_pending_photo_deletions',{method:'POST',body:{}});for(let i=0;i<tasks.length;i++){if(status?.isConnected)status.textContent='正在清理 '+(i+1)+' / '+tasks.length+' 张…';try{await cleanupPhotoTask(tasks[i]);success++}catch{failed++}}toast('本次清理成功 '+success+' 张'+(failed?'，失败 '+failed+' 张，请稍后重试':''));
 }catch(e){toast(deleteFeatureError(e))}finally{photoDeleting=false;if(button?.isConnected)button.disabled=false;await refreshPhotoCleanup()}
}

