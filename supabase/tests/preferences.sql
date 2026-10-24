-- Walking preference (co-ed or same gender). Run after 00_supabase_stubs.sql and migrations 0001 to 0004.
\set ON_ERROR_STOP on
\pset footer off

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000aa01', 'wen@sjsu.edu'),
  ('00000000-0000-0000-0000-00000000aa02', 'mo@sjsu.edu'),
  ('00000000-0000-0000-0000-00000000aa03', 'wren@sjsu.edu');

set role authenticated;

-- Each student sets their own preference (before verification).
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aa01';
do $$ begin
  update public.profiles set walk_with = 'same_gender' where id = auth.uid();
  raise exception 'FAIL: same_gender allowed without a gender';
exception when check_violation then
  raise notice 'PASS: same-gender needs a gender';
end $$;
update public.profiles set first_name = 'Wen', gender = 'woman', walk_with = 'same_gender' where id = auth.uid();

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aa02';
update public.profiles set first_name = 'Mo', gender = 'man', walk_with = 'anyone' where id = auth.uid();
-- Mo cannot read anyone else's gender or preference.
do $$ begin
  if exists (select 1 from public.profiles where id <> auth.uid()) then
    raise exception 'FAIL: other profiles readable';
  end if;
  raise notice 'PASS: preferences are private';
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aa03';
update public.profiles set first_name = 'Wren', gender = 'woman', walk_with = 'anyone' where id = auth.uid();

reset role;
select public.review_id_verification(e, true) from unnest(array['wen@sjsu.edu', 'mo@sjsu.edu', 'wren@sjsu.edu']) e;
set role authenticated;

-- After verification the gender is locked.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aa02';
do $$ begin
  update public.profiles set gender = 'woman' where id = auth.uid();
  raise exception 'FAIL: verified user changed gender';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'PASS: gender locked after verification';
end $$;
-- The preference itself can still change.
update public.profiles set walk_with = 'anyone' where id = auth.uid();

create temp table g (who text, group_id uuid);
grant all on g to authenticated;

-- Wen (women only) starts a walk; Mo heads the same way at the same time; then Wren.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aa01';
insert into g select 'wen', public.find_or_create_group(public.create_walk_request(
  (select id from public.meetup_points where name = 'Student Union'), 37.3410, -121.8890, 'Wen home',
  '[[-121.8812,37.33525],[-121.8840,37.3364],[-121.8870,37.3375],[-121.8890,37.3410]]'::jsonb, now()));
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aa02';
insert into g select 'mo', public.find_or_create_group(public.create_walk_request(
  (select id from public.meetup_points where name = 'Student Union'), 37.3405, -121.8895, 'Mo home',
  '[[-121.8812,37.33525],[-121.8840,37.3364],[-121.8870,37.3375],[-121.8895,37.3405]]'::jsonb, now()));
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aa03';
insert into g select 'wren', public.find_or_create_group(public.create_walk_request(
  (select id from public.meetup_points where name = 'Student Union'), 37.3408, -121.8892, 'Wren home',
  '[[-121.8812,37.33525],[-121.8840,37.3364],[-121.8870,37.3375],[-121.8892,37.3408]]'::jsonb, now()));

do $$ begin
  if (select group_id from g where who = 'mo') = (select group_id from g where who = 'wen') then
    raise exception 'FAIL: man matched into a women-only walk';
  end if;
  if (select group_id from g where who = 'wren') <> (select group_id from g where who = 'wen') then
    raise exception 'FAIL: women heading the same way were not matched';
  end if;
  raise notice 'PASS: same-gender preference respected, compatible students still matched';
end $$;

-- Clients can't call the helper directly.
do $$ begin
  perform public.walk_prefs_compatible('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-00000000aa02');
  raise exception 'FAIL: helper callable by clients';
exception when insufficient_privilege then
  raise notice 'PASS: preference helper locked down';
end $$;
reset role;
