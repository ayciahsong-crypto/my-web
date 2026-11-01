-- 撤销管理端删除权限。不会删除或恢复任何照片、打卡记录或清理任务。
-- 未执行过 03 脚本也可运行；原账号、巡检和下载权限不受影响。
begin;
drop policy if exists inspection_manager_photo_delete on storage.objects;
do $$
declare signature text; target regprocedure;
begin
 foreach signature in array array[
  'public.inspection_delete_photo(uuid)',
  'public.inspection_pending_photo_deletions()',
  'public.inspection_finish_photo_delete(uuid)',
  'public.inspection_photo_deletion_allowed(text)'
 ] loop
  target:=to_regprocedure(signature);
  if target is not null then
   execute format('revoke all on function %s from public, anon, authenticated',target);
  end if;
 end loop;
end $$;
-- 待清理队列保留为私有数据，不向网页开放。已删除数据不会因此恢复。
commit;

