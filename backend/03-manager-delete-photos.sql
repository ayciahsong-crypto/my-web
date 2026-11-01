-- 仅增加主管删除功能；不删除现有照片或打卡。请在 Supabase SQL Editor 执行。
begin;
create table if not exists public.inspection_photo_deletions (
 id uuid primary key,
 photo_path text not null unique,
 employee_name text not null,
 point_name text not null,
 requested_by uuid not null,
 requested_at timestamptz not null default now()
);
alter table public.inspection_photo_deletions enable row level security;
revoke all on public.inspection_photo_deletions from public,anon,authenticated;

-- 防止已移出列表、等待文件清理的记录被重复提交而重新出现。
create or replace function public.inspection_reject_pending_photo() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.inspection_photo_deletions q where q.id=new.id or q.photo_path=new.photo_path) then
  raise exception '该照片正在删除，请重新拍照提交' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.inspection_reject_pending_photo() from public,anon,authenticated;
drop trigger if exists inspection_reject_pending_photo on public.inspection_records;
create trigger inspection_reject_pending_photo before insert on public.inspection_records for each row execute function public.inspection_reject_pending_photo();

-- 原子地移出打卡列表并登记文件清理任务。禁止直接向员工开放 DELETE。
create or replace function public.inspection_delete_photo(p_record_id uuid)
 returns table(id uuid,photo_path text) language plpgsql security definer set search_path='' as $$
declare item public.inspection_records;
begin
 if public.inspection_role() is distinct from 'manager' then raise exception '只有项目主管可以删除照片' using errcode='42501'; end if;
 select * into item from public.inspection_records r where r.id=p_record_id for update;
 if item.id is not null then
  insert into public.inspection_photo_deletions(id,photo_path,employee_name,point_name,requested_by)
  values(item.id,item.photo_path,item.employee_name,item.point_name,auth.uid());
  delete from public.inspection_records r where r.id=item.id;
 end if;
 return query select q.id,q.photo_path from public.inspection_photo_deletions q where q.id=p_record_id;
end $$;

create or replace function public.inspection_pending_photo_deletions()
 returns table(id uuid,photo_path text,employee_name text,point_name text,total_pending bigint)
 language plpgsql security definer set search_path='' as $$
begin
 if public.inspection_role() is distinct from 'manager' then raise exception '只有项目主管可以清理照片' using errcode='42501'; end if;
 return query select q.id,q.photo_path,q.employee_name,q.point_name,count(*) over() from public.inspection_photo_deletions q order by q.requested_at,q.id limit 100;
end $$;

create or replace function public.inspection_photo_deletion_allowed(p_path text)
 returns boolean language sql stable security definer set search_path='' as $$
 select public.inspection_role()='manager' and exists(select 1 from public.inspection_photo_deletions q where q.photo_path=p_path);
$$;

create or replace function public.inspection_finish_photo_delete(p_record_id uuid)
 returns void language plpgsql security definer set search_path='' as $$
declare target text;
begin
 if public.inspection_role() is distinct from 'manager' then raise exception '只有项目主管可以清理照片' using errcode='42501'; end if;
 select q.photo_path into target from public.inspection_photo_deletions q where q.id=p_record_id for update;
 if target is null then return; end if;
 if exists(select 1 from storage.objects o where o.bucket_id='inspection-photos' and o.name=target) then
  raise exception '照片文件尚未删除，请重试文件清理';
 end if;
 delete from public.inspection_photo_deletions q where q.id=p_record_id;
end $$;

revoke all on function public.inspection_delete_photo(uuid),public.inspection_pending_photo_deletions(),public.inspection_photo_deletion_allowed(text),public.inspection_finish_photo_delete(uuid) from public,anon;
grant execute on function public.inspection_delete_photo(uuid),public.inspection_pending_photo_deletions(),public.inspection_photo_deletion_allowed(text),public.inspection_finish_photo_delete(uuid) to authenticated;
drop policy if exists inspection_manager_photo_delete on storage.objects;
create policy inspection_manager_photo_delete on storage.objects for delete to authenticated using(
 bucket_id='inspection-photos' and public.inspection_photo_deletion_allowed(name));
-- Storage API 实际删除照片文件；不能用 SQL 直接删除 storage.objects 元数据。
commit;

