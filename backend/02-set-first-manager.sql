-- 先在 Authentication > Users > Add user > Create new user 创建主管账号。
-- 仅将下面的邮箱替换成你刚创建的主管邮箱，然后执行。
do $$
declare target uuid;
begin
 select id into target from auth.users where lower(email)=lower('请替换为主管邮箱');
 if target is null then raise exception '未找到主管账号，请先创建账号并替换脚本中的邮箱'; end if;
 update public.inspection_profiles set role='manager',active=true where id=target;
 if not found then raise exception '请先执行 01-init.sql'; end if;
end $$;

