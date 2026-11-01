-- 每个点位由主管设置在线/离线打卡；已有点位默认在线。
-- 先执行 06-point-geolocation.sql；本脚本不修改历史记录或点位坐标。
begin;
do $$ begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='inspection_points' and column_name='geo_lat') then
  raise exception '请先执行 06-point-geolocation.sql，再执行 07';
 end if;
end $$;
alter table public.inspection_points add column if not exists checkin_mode text not null default 'online' check(checkin_mode in ('online','offline'));
grant insert(checkin_mode),update(checkin_mode) on public.inspection_points to authenticated;
alter table public.inspection_records
 add column if not exists checkin_mode text check(checkin_mode in ('online','offline')),
 add column if not exists capture_source text check(capture_source in ('camera','album'));
grant insert(capture_source) on public.inspection_records to authenticated;
-- checkin_mode 不开放写入，由后台根据点位设置盖章；角色沿用 points_manage。
-- capture_source 是页面的来源标记，不是浏览器能提供的相机真实性证明。
create or replace function public.inspection_validate_location() returns trigger
 language plpgsql security definer set search_path='' as $$
declare config public.inspection_points; meters double precision;
begin
 select * into config from public.inspection_points where id=new.point_id and active for share;
 if config.id is null then raise exception '点位已停用或不存在' using errcode='42501'; end if;
 new.checkin_mode:=config.checkin_mode;
 if config.checkin_mode='offline' then
  if new.capture_source is distinct from 'album' then raise exception '该点位为离线打卡，请从相册选择照片补传' using errcode='42501'; end if;
  new.location_lat:=null;new.location_lon:=null;new.location_accuracy_m:=null;new.located_at:=null;
  new.geo_distance_m:=null;new.geo_center_lat:=null;new.geo_center_lon:=null;new.geo_radius_m:=null;new.geo_accuracy_limit_m:=null;new.geo_verified_at:=null;
  return new;
 end if;
 if new.capture_source is distinct from 'camera' then raise exception '该点位为在线打卡，请使用拍照入口重新拍摄' using errcode='42501'; end if;
 if config.geo_lat is null or config.geo_lon is null then
  raise exception '该点位尚未配置定位范围，请联系主管现场设置' using errcode='42501';
 end if;
 if new.location_lat is null or new.location_lon is null or new.location_accuracy_m is null or new.located_at is null then
  raise exception '必须获取当前定位后才能提交打卡' using errcode='42501';
 end if;
 if not(new.location_lat between -90 and 90 and new.location_lon between -180 and 180 and new.location_accuracy_m>0 and new.location_accuracy_m<=config.geo_accuracy_m) then
  raise exception '定位精度不足或坐标无效，请到信号较好的位置重新定位' using errcode='42501';
 end if;
 if new.located_at<statement_timestamp()-interval '3 minutes' or new.located_at>statement_timestamp()+interval '30 seconds' then
  raise exception '定位已过期或设备时间不准确，请重新定位' using errcode='42501';
 end if;
 meters:=public.inspection_distance_m(config.geo_lat,config.geo_lon,new.location_lat,new.location_lon);
 if meters>config.geo_radius_m then
  raise exception '超出该点位打卡范围：距中心约 % 米，允许 % 米',round(meters::numeric),config.geo_radius_m using errcode='42501';
 end if;
 -- 校验结果、距离和当时的范围由后台计算，前端不能自行填入或修改。
 new.geo_distance_m:=meters;new.geo_center_lat:=config.geo_lat;new.geo_center_lon:=config.geo_lon;
 new.geo_radius_m:=config.geo_radius_m;new.geo_accuracy_limit_m:=config.geo_accuracy_m;new.geo_verified_at:=statement_timestamp();
 return new;
end $$;
revoke all on function public.inspection_validate_location() from public,anon,authenticated;
drop trigger if exists inspection_validate_location on public.inspection_records;
create trigger inspection_validate_location before insert on public.inspection_records for each row execute function public.inspection_validate_location();
commit;

