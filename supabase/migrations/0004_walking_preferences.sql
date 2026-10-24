-- PackTrack 0004: who you walk with.
--
-- Students can choose to walk with anyone (co-ed) or only with students of their own gender.
-- Privacy (adds to AGENTS.md):
--   * gender and walk_with live on profiles, which is select-own only. Nobody else ever sees them;
--     matching just skips groups that don't fit both sides' preference.
--   * Once a student's ID is verified their gender is locked, so nobody can switch it to get into a
--     same-gender group. The reviewer sees it next to the ID photo (review_id_verification) and a
--     student can ask support to correct it.

alter table public.profiles
  add column gender text check (gender in ('woman', 'man', 'nonbinary')),
  add column walk_with text not null default 'anyone' check (walk_with in ('anyone', 'same_gender')),
  -- "Only my gender" needs a gender to compare against.
  add constraint same_gender_needs_gender check (walk_with = 'anyone' or gender is not null);

grant update (gender, walk_with) on public.profiles to authenticated;

create or replace function public.lock_verified_gender()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.verification_status = 'verified'
     and new.gender is distinct from old.gender
     and current_user in ('authenticated', 'anon') then
    raise exception 'Your gender is locked after ID verification. Contact support to change it.';
  end if;
  return new;
end;
$$;

create trigger lock_verified_gender
  before update of gender on public.profiles
  for each row execute function public.lock_verified_gender();

-- Two students can share a group only if each one's preference allows the other.
create or replace function public.walk_prefs_compatible(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (pa.walk_with = 'anyone' or pa.gender = pb.gender)
     and (pb.walk_with = 'anyone' or pb.gender = pa.gender)
  from profiles pa, profiles pb
  where pa.id = a and pb.id = b;
$$;

revoke execute on function public.walk_prefs_compatible(uuid, uuid) from public, anon, authenticated;

-- Same as 0002, plus: skip groups where anyone's walking preference doesn't fit the newcomer's.
create or replace function public.find_or_create_group(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r walk_requests;
  v_group uuid;
  v_count int;
begin
  select * into r from walk_requests
  where id = p_request_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'Walk request not found';
  end if;
  if r.status <> 'searching' then
    return r.group_id;
  end if;
  if not is_verified() then
    raise exception 'Your student ID must be verified before you can join a group';
  end if;

  -- Best forming group at the same meetup point and time where nobody's trip grows by more
  -- than 35%, the newcomer walks a meaningful stretch with the group, and everyone's
  -- walking preference (co-ed or same gender) is respected both ways.
  select c.group_id into v_group
  from (
    select g.id as group_id, b.max_detour, b.extra_together
    from walk_groups g
    cross join lateral (
      select * from best_plan(g.id, r.id) bp
      order by (bp.max_detour <= 1.35) desc, bp.total_together desc, bp.max_detour
      limit 1
    ) b
    where g.status = 'forming'
      and g.meetup_point_id = r.meetup_point_id
      and abs(extract(epoch from (g.depart_at - r.depart_at))) <= 15 * 60
      and not exists (select 1 from group_members x where x.group_id = g.id and x.user_id = auth.uid())
      and (select count(*) from group_members y
           where y.group_id = g.id and y.status in ('joined', 'confirmed')) between 1 and 3
      and not exists (
        select 1 from group_members m
        where m.group_id = g.id and m.status in ('joined', 'confirmed')
          and not coalesce(walk_prefs_compatible(m.user_id, auth.uid()), false)
      )
  ) c
  where c.max_detour <= 1.35
    and c.extra_together >= least(150, 0.3 * r.route_distance_m)
  order by c.extra_together desc
  limit 1;

  if v_group is not null then
    -- Lock the group and re-check capacity so concurrent joins can't overfill it.
    perform 1 from walk_groups where id = v_group and status = 'forming' for update;
    if not found then
      v_group := null;
    else
      select count(*) into v_count from group_members
      where group_id = v_group and status in ('joined', 'confirmed');
      if v_count >= 4 then
        v_group := null;
      end if;
    end if;
  end if;

  if v_group is null then
    insert into walk_groups (meetup_point_id, depart_at)
    values (r.meetup_point_id, r.depart_at)
    returning id into v_group;
  end if;

  insert into group_members (group_id, user_id, request_id)
  values (v_group, auth.uid(), r.id);
  update walk_requests set status = 'grouped', group_id = v_group where id = r.id;

  perform recompute_split_points(v_group);
  return v_group;
end;
$$;
