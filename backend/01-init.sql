-- 交通枢纽巡检系统 / 在 Supabase SQL Editor 中一次执行
-- 首次安装脚本：不删除已有巡检数据；如有同名自建表，请先检查。
begin;
create table if not exists public.inspection_profiles (
 id uuid primary key references auth.users(id),
 display_name text not null default '' check(length(display_name)<=80),
 email text not null default '',
 role text not null default 'pending' check(role in ('pending','security','engineering','manager')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.inspection_settings (
 id integer primary key check(id=1),
 rounds_per_shift integer not null default 4 check(rounds_per_shift between 1 and 12)
);
insert into public.inspection_settings(id) values(1) on conflict do nothing;
create table if not exists public.inspection_points (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 100),
 department text not null default 'all' check(department in ('all','security','engineering')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index if not exists inspection_points_active_name on public.inspection_points(name) where active;
insert into public.inspection_points(name) select n from unnest(array['B1车库消防通道','B1车库东侧通道','地下设备间入口','一层候车大厅']) n
 where not exists(select 1 from public.inspection_points);
create table if not exists public.inspection_records (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.inspection_profiles(id),
 point_id uuid not null references public.inspection_points(id),
 point_name text not null,
 employee_name text not null,
 job_role text not null check(job_role in ('security','engineering')),
 round_no integer not null check(round_no between 1 and 12),
 shift text not null check(shift in ('早班','晚班')),
 work_date date not null,
 photo_path text not null unique,
 captured_at timestamptz not null,
 uploaded_at timestamptz not null default now(),
 note text not null default '' check(length(note)<=1000)
);
create index if not exists inspection_records_date_user on public.inspection_records(work_date,user_id,shift,round_no);

-- 角色只从数据库读取，不信任浏览器或用户可编辑的 metadata。
create or replace function public.inspection_role() returns text
 language sql stable security definer set search_path='' as $$
 select role from public.inspection_profiles where id=auth.uid() and active;
$$;
revoke all on function public.inspection_role() from public,anon;
grant execute on function public.inspection_role() to authenticated;

create or replace function public.inspection_new_user() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
 insert into public.inspection_profiles(id,email,display_name,role)
 values(new.id,coalesce(new.email,''),left(coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1),''),80),'pending')
 on conflict(id) do nothing;
 return new;
end $$;
revoke all on function public.inspection_new_user() from public,anon,authenticated;
drop trigger if exists inspection_new_user on auth.users;
create trigger inspection_new_user after insert on auth.users for each row execute function public.inspection_new_user();
insert into public.inspection_profiles(id,email,display_name)
 select id,coalesce(email,''),left(coalesce(raw_user_meta_data->>'display_name',split_part(email,'@',1),''),80) from auth.users
 on conflict(id) do nothing;

create or replace function public.inspection_stamp_record() returns trigger
 language plpgsql security definer set search_path='' as $$
declare person public.inspection_profiles; place public.inspection_points; max_round integer; local_now timestamp;
begin
 select * into person from public.inspection_profiles where id=auth.uid() and active;
 if person.id is null or person.role not in ('security','engineering') then raise exception '仅已启用的员工账号可提交巡检' using errcode='42501'; end if;
 select * into place from public.inspection_points where id=new.point_id and active;
 if place.id is null or place.department not in ('all',person.role) then raise exception '无权巡检该点位' using errcode='42501'; end if;
 select rounds_per_shift into max_round from public.inspection_settings where id=1;
 if new.round_no<1 or new.round_no>max_round then raise exception '轮次超出当前计划'; end if;
 if new.photo_path <> person.id::text||'/'||new.id::text||'.jpg' then raise exception '照片路径与账号或记录不匹配' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects where bucket_id='inspection-photos' and name=new.photo_path) then raise exception '请先成功上传照片'; end if;
 local_now := now() at time zone 'Asia/Shanghai';
 new.user_id:=person.id; new.employee_name:=person.display_name; new.job_role:=person.role; new.point_name:=place.name;
 new.work_date:=local_now::date;
 if new.shift='晚班' and extract(hour from local_now)<6 then new.work_date:=new.work_date-1; end if;
 new.uploaded_at:=now();
 return new;
end $$;
revoke all on function public.inspection_stamp_record() from public,anon,authenticated;
drop trigger if exists inspection_stamp_record on public.inspection_records;
create trigger inspection_stamp_record before insert on public.inspection_records for each row execute function public.inspection_stamp_record();

alter table public.inspection_profiles enable row level security;
alter table public.inspection_settings enable row level security;
alter table public.inspection_points enable row level security;
alter table public.inspection_records enable row level security;
revoke all on public.inspection_profiles,public.inspection_settings,public.inspection_points,public.inspection_records from anon,authenticated;
grant select on public.inspection_profiles,public.inspection_settings,public.inspection_points,public.inspection_records to authenticated;
grant update(display_name,role,active) on public.inspection_profiles to authenticated;
grant update(rounds_per_shift) on public.inspection_settings to authenticated;
grant insert(name,department,active),update(name,department,active) on public.inspection_points to authenticated;
grant insert(id,point_id,round_no,shift,photo_path,captured_at,note) on public.inspection_records to authenticated;

drop policy if exists profiles_read on public.inspection_profiles;
create policy profiles_read on public.inspection_profiles for select to authenticated using(id=auth.uid() or public.inspection_role()='manager');
drop policy if exists profiles_manage on public.inspection_profiles;
create policy profiles_manage on public.inspection_profiles for update to authenticated
 using(public.inspection_role()='manager' and id<>auth.uid() and role<>'manager')
 with check(public.inspection_role()='manager' and id<>auth.uid() and role in ('pending','security','engineering'));
drop policy if exists settings_read on public.inspection_settings;
create policy settings_read on public.inspection_settings for select to authenticated using(public.inspection_role() in ('manager','security','engineering'));
drop policy if exists settings_manage on public.inspection_settings;
create policy settings_manage on public.inspection_settings for update to authenticated using(public.inspection_role()='manager') with check(public.inspection_role()='manager');
drop policy if exists points_read on public.inspection_points;
create policy points_read on public.inspection_points for select to authenticated using(public.inspection_role()='manager' or (active and public.inspection_role() in ('security','engineering') and department in ('all',public.inspection_role())));
drop policy if exists points_add on public.inspection_points;
create policy points_add on public.inspection_points for insert to authenticated with check(public.inspection_role()='manager');
drop policy if exists points_manage on public.inspection_points;
create policy points_manage on public.inspection_points for update to authenticated using(public.inspection_role()='manager') with check(public.inspection_role()='manager');
drop policy if exists records_read on public.inspection_records;
create policy records_read on public.inspection_records for select to authenticated using(public.inspection_role()='manager' or (user_id=auth.uid() and public.inspection_role() in ('security','engineering')));
drop policy if exists records_add on public.inspection_records;
create policy records_add on public.inspection_records for insert to authenticated with check(user_id=auth.uid() and job_role=public.inspection_role() and public.inspection_role() in ('security','engineering'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('inspection-photos','inspection-photos',false,8388608,array['image/jpeg'])
 on conflict(id) do update set public=false,file_size_limit=8388608,allowed_mime_types=array['image/jpeg'];
drop policy if exists inspection_photo_add on storage.objects;
create policy inspection_photo_add on storage.objects for insert to authenticated with check(
 bucket_id='inspection-photos' and public.inspection_role() in ('security','engineering')
 and name ~ ('^'||auth.uid()::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'));
drop policy if exists inspection_photo_read on storage.objects;
create policy inspection_photo_read on storage.objects for select to authenticated using(
 bucket_id='inspection-photos' and (public.inspection_role()='manager' or (public.inspection_role() in ('security','engineering') and (storage.foldername(name))[1]=auth.uid()::text)));
drop policy if exists inspection_photo_cleanup on storage.objects;
create policy inspection_photo_cleanup on storage.objects for delete to authenticated using(
 bucket_id='inspection-photos' and public.inspection_role() in ('security','engineering') and (storage.foldername(name))[1]=auth.uid()::text
 and not exists(select 1 from public.inspection_records where photo_path=name));
-- 没有 UPDATE 照片或 UPDATE/DELETE 打卡的权限；已提交记录不能被员工改写。
commit;

