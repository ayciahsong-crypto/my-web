-- 整个枢纽统一定位范围；范围外、定位缺失、过期或精度不足，一律禁止新打卡。
-- 不修改历史记录。执行后，请主管先在“巡检配置”设置枢纽中心位置。
begin;
alter table public.inspection_settings
 add column if not exists geo_lat double precision check(geo_lat between -90 and 90),
 add column if not exists geo_lon double precision check(geo_lon between -180 and 180),
 add column if not exists geo_radius_m integer not null default 300 check(geo_radius_m between 10 and 100000),
 add column if not exists geo_accuracy_m integer not null default 100 check(geo_accuracy_m between 10 and 2000);
-- 允许尚未设置中心；此状态下后台禁止新打卡，不能绕过定位。
do $$ begin
 if not exists(select 1 from pg_constraint where conname='inspection_geo_center_pair' and conrelid='public.inspection_settings'::regclass) then
  alter table public.inspection_settings add constraint inspection_geo_center_pair check((geo_lat is null)=(geo_lon is null));
 end if;
end $$;
grant update(geo_lat,geo_lon,geo_radius_m,geo_accuracy_m) on public.inspection_settings to authenticated;
-- 沿用 settings_manage 的主管权限，员工无权更改定位范围。
alter table public.inspection_records
 add column if not exists location_lat double precision check(location_lat between -90 and 90),
 add column if not exists location_lon double precision check(location_lon between -180 and 180),
 add column if not exists location_accuracy_m double precision check(location_accuracy_m>0 and location_accuracy_m<=100000),
 add column if not exists located_at timestamptz,
 add column if not exists geo_distance_m double precision,
 add column if not exists geo_center_lat double precision,
 add column if not exists geo_center_lon double precision,
 add column if not exists geo_radius_m integer,
 add column if not exists geo_accuracy_limit_m integer,
 add column if not exists geo_verified_at timestamptz;
grant insert(location_lat,location_lon,location_accuracy_m,located_at) on public.inspection_records to authenticated;

create or replace function public.inspection_distance_m(lat1 double precision,lon1 double precision,lat2 double precision,lon2 double precision)
 returns double precision language sql immutable strict set search_path='' as $$
 select 6371008.8*2*asin(sqrt(greatest(0.0,least(1.0,
  power(sin(radians(lat2-lat1)/2),2)+cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lon2-lon1)/2),2)
 ))));
$$;
revoke all on function public.inspection_distance_m(double precision,double precision,double precision,double precision) from public,anon,authenticated;

create or replace function public.inspection_validate_location() returns trigger
 language plpgsql security definer set search_path='' as $$
declare config public.inspection_settings; meters double precision;
begin
 select * into config from public.inspection_settings where id=1 for share;
 if config.geo_lat is null or config.geo_lon is null then
  raise exception '主管尚未配置枢纽定位范围，暂不能提交打卡' using errcode='42501';
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
  raise exception '超出枢纽打卡范围：距中心约 % 米，允许 % 米',round(meters::numeric),config.geo_radius_m using errcode='42501';
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

