'use strict';
let selectedPointIds=new Set(),pointDeleteBusy=false;
function updatePointSelection(){const ids=new Set(points.map(p=>p.id));selectedPointIds=new Set([...selectedPointIds].filter(id=>ids.has(id)));document.querySelectorAll('[data-select-point]').forEach(c=>c.checked=selectedPointIds.has(c.dataset.selectPoint));const all=$('#select-all-points');if(all){all.checked=points.length>0&&selectedPointIds.size===points.length;all.indeterminate=selectedPointIds.size>0&&selectedPointIds.size<points.length}if($('#point-selection-count'))$('#point-selection-count').textContent='已选 '+selectedPointIds.size+' / '+points.length+' 个点位';if($('#delete-selected-points'))$('#delete-selected-points').disabled=!selectedPointIds.size}
function bindPointDeletion(){if(me?.role!=='manager'||!$('#point-delete-toolbar'))return;
 if($('#select-all-points'))$('#select-all-points').onchange=e=>{selectedPointIds=e.target.checked?new Set(points.map(p=>p.id)):new Set();updatePointSelection()};
 document.querySelectorAll('[data-select-point]').forEach(c=>c.onchange=()=>{if(c.checked)selectedPointIds.add(c.dataset.selectPoint);else selectedPointIds.delete(c.dataset.selectPoint);updatePointSelection()});
 if($('#clear-selected-points'))$('#clear-selected-points').onclick=()=>{selectedPointIds.clear();updatePointSelection()};
 if($('#delete-selected-points'))$('#delete-selected-points').onclick=()=>confirmPointDeletion([...selectedPointIds]);
 document.querySelectorAll('[data-delete-point]').forEach(b=>b.onclick=()=>confirmPointDeletion([b.dataset.deletePoint]));updatePointSelection();
}
function confirmPointDeletion(ids){if(me?.role!=='manager'||pointDeleteBusy)return;const targets=points.filter(p=>ids.includes(p.id));if(!targets.length)return toast('请先选择点位');if(targets.length>500)return toast('单次最多删除500个点位，请分批选择');
 $('#point-delete-dialog')?.remove();const dialog=document.createElement('dialog');dialog.id='point-delete-dialog';dialog.setAttribute('aria-labelledby','point-delete-title');
 dialog.innerHTML=`<h3 id="point-delete-title">确认删除 ${targets.length} 个点位？</h3><div class="point-delete-list">${targets.map(p=>`<div>${esc(p.name)}${p.active?'':'（已停用）'}</div>`).join('')}</div><p>删除后，这些点位会从配置及员工巡检列表移除。已有打卡记录和照片保留，汇总可继续查询。</p><p class="muted">应用内暂不提供恢复入口。</p><div id="point-delete-error" class="form-error" role="status"></div><div class="buttons"><button id="point-delete-cancel">取消</button><button id="point-delete-confirm" class="point-delete-danger">确认删除</button></div>`;
 document.body.append(dialog);dialog.showModal();const cancel=dialog.querySelector('#point-delete-cancel'),confirm=dialog.querySelector('#point-delete-confirm'),status=dialog.querySelector('#point-delete-error');let running=false;
 cancel.onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(running)e.preventDefault()});dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 confirm.onclick=async()=>{if(running)return;running=true;pointDeleteBusy=true;cancel.disabled=true;confirm.disabled=true;status.textContent='正在删除点位…';let changed=false;
 try{const count=await api.request('/rest/v1/rpc/inspection_delete_points',{method:'POST',body:{p_ids:targets.map(p=>p.id)}});changed=true;targets.forEach(p=>selectedPointIds.delete(p.id));points=await api.points();dialog.close();render();toast(count?'已删除 '+count+' 个点位，历史记录和照片已保留':'这些点位已被移除，列表已刷新');
 }catch(e){if(changed){targets.forEach(p=>selectedPointIds.delete(p.id));const removed=new Set(targets.map(p=>p.id));points=points.filter(p=>!removed.has(p.id));dialog.close();render();toast('点位已删除，云端列表刷新失败，请稍后刷新核对')}else{status.textContent=(e.code==='PGRST202'||e.code==='42883')?'删除点位功能尚未启用，请先执行后台 08-delete-points.sql 脚本。':errorText(e);confirm.disabled=false}
 }finally{running=false;pointDeleteBusy=false;cancel.disabled=false}
 };
}

