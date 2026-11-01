-- 主管单个/批量删除点位。仅安装权限和函数，本脚本不会删除任何点位。
-- 采用归档标记，保留历史打卡和照片的关联；员工不能删除或恢复点位。
begin;
alter table public.inspection_points add column if not exists deleted_at timestamptz;
alter table public.inspection_points add column if not exists deleted_by uuid;

drop policy if exists points_read on public.inspection_points;
create policy points_read on public.inspection_points for select to authenticated using(
 deleted_at is null and (public.inspection_role()='manager' or (active and public.inspection_role() in ('security','engineering') and department in ('all',public.inspection_role()))));
drop policy if exists points_manage on public.inspection_points;
create policy points_manage on public.inspection_points for update to authenticated
 using(public.inspection_role()='manager' and deleted_at is null)
 with check(public.inspection_role()='manager' and deleted_at is null);

create or replace function public.inspection_delete_points(p_ids uuid[])
 returns integer language plpgsql security definer set search_path='' as $$
declare targets uuid[]; expected integer; found_count integer;
begin
 if public.inspection_role() is distinct from 'manager' then raise exception '只有项目主管可以删除点位' using errcode='42501'; end if;
 select array_agg(distinct x) into targets from unnest(p_ids) x where x is not null;
 expected:=coalesce(cardinality(targets),0);
 if expected=0 or expected>500 then raise exception '请选择1—500个点位'; end if;
 -- 锁定目标，并在修改前验证全部ID，避免部分删除。
 perform 1 from public.inspection_points p where p.id=any(targets) order by p.id for update;
 select count(*) into found_count from public.inspection_points p where p.id=any(targets);
 if found_count<>expected then raise exception '部分点位不存在，请刷新后重试'; end if;
 update public.inspection_points p set active=false,deleted_at=statement_timestamp(),deleted_by=auth.uid()
 where p.id=any(targets) and p.deleted_at is null;
 get diagnostics found_count=row_count;
 return found_count;
end $$;
revoke all on function public.inspection_delete_points(uuid[]) from public,anon;
grant execute on function public.inspection_delete_points(uuid[]) to authenticated;
-- 不开放对点位表的直接 DELETE，也不修改历史巡检记录或照片。
commit;

