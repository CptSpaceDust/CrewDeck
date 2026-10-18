create table if not exists public.friend_details (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  nickname text check (nickname is null or char_length(trim(nickname)) <= 40),
  private_note text check (private_note is null or char_length(private_note) <= 700),
  is_close boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table if not exists public.friend_feature_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  recommendations_enabled boolean not null default false,
  activity_feed_enabled boolean not null default false,
  one_click_meetup_enabled boolean not null default false,
  meetup_preset jsonb not null default '{}'::jsonb,
  show_badges boolean not null default true,
  show_interests boolean not null default true,
  show_favorite_games boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notifications add column if not exists priority smallint not null default 0;
alter table public.friend_details enable row level security;
alter table public.friend_feature_settings enable row level security;

revoke all on public.friend_details, public.friend_feature_settings from anon;
grant select, insert, update, delete on public.friend_details, public.friend_feature_settings to authenticated;
grant all on public.friend_details, public.friend_feature_settings to service_role;

drop policy if exists friend_details_owner on public.friend_details;
create policy friend_details_owner on public.friend_details for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists friend_feature_settings_owner on public.friend_feature_settings;
create policy friend_feature_settings_owner on public.friend_feature_settings for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function private.are_friends(first_user uuid, second_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships friendship
    where friendship.status = 'accepted'
      and ((friendship.requester_id = first_user and friendship.addressee_id = second_user)
        or (friendship.requester_id = second_user and friendship.addressee_id = first_user))
  )
$$;
revoke all on function private.are_friends(uuid, uuid) from public, anon, authenticated;
grant execute on function private.are_friends(uuid, uuid) to authenticated, service_role;

create or replace function public.get_friend_insights(target_friend_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); result jsonb;
begin
  if actor is null or not private.are_friends(actor, target_friend_id) then
    raise exception 'Friendship required';
  end if;
  with my_friends as (
    select case when requester_id = actor then addressee_id else requester_id end id
    from public.friendships where status = 'accepted' and actor in (requester_id, addressee_id)
  ), their_friends as (
    select case when requester_id = target_friend_id then addressee_id else requester_id end id
    from public.friendships where status = 'accepted' and target_friend_id in (requester_id, addressee_id)
  ), mutual_people as (
    select profile.id, profile.username, profile.avatar
    from my_friends mine join their_friends theirs using (id)
    join public.profiles profile using (id)
    where profile.id not in (actor, target_friend_id)
    order by profile.username
  ), mutual_groups as (
    select conversation.id, conversation.name, conversation.avatar_url
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id and theirs.user_id = target_friend_id
    join public.group_conversations conversation on conversation.id = mine.group_id
    where mine.user_id = actor
    order by conversation.name
  )
  select jsonb_build_object(
    'mutual_friends', coalesce((select jsonb_agg(to_jsonb(mutual_people)) from mutual_people), '[]'::jsonb),
    'mutual_groups', coalesce((select jsonb_agg(to_jsonb(mutual_groups)) from mutual_groups), '[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.get_friend_recommendations(result_limit integer default 12)
returns table(id uuid, username text, avatar text, rank text, favorite_game text, mutual_count bigint, reason text)
language sql stable security definer set search_path = '' as $$
  with actor as (select auth.uid() id), mine as (
    select case when requester_id = actor.id then addressee_id else requester_id end friend_id
    from public.friendships, actor
    where status = 'accepted' and actor.id in (requester_id, addressee_id)
  ), candidate_counts as (
    select candidate_friend.friend_id candidate_id, count(*) mutual_count
    from mine
    join public.friendships link on link.status = 'accepted' and mine.friend_id in (link.requester_id, link.addressee_id)
    cross join lateral (select case when link.requester_id = mine.friend_id then link.addressee_id else link.requester_id end friend_id) candidate_friend
    group by candidate_friend.friend_id
  )
  select profile.id, profile.username, profile.avatar, profile.rank, profile.favorite_game,
    coalesce(candidate_counts.mutual_count, 0),
    case when coalesce(candidate_counts.mutual_count, 0) > 0 then coalesce(candidate_counts.mutual_count, 0) || ' mutual friend' || case when candidate_counts.mutual_count = 1 then '' else 's' end
      when me.favorite_game is not null and lower(me.favorite_game) = lower(profile.favorite_game) then 'You both enjoy ' || profile.favorite_game
      else 'Another member of the crew' end
  from public.profiles profile
  cross join actor
  join public.profiles me on me.id = actor.id
  left join candidate_counts on candidate_counts.candidate_id = profile.id
  left join public.friend_feature_settings setting on setting.user_id = actor.id
  where coalesce(setting.recommendations_enabled, false)
    and profile.id <> actor.id
    and not exists (select 1 from public.friendships f where actor.id in (f.requester_id, f.addressee_id) and profile.id in (f.requester_id, f.addressee_id))
    and not exists (select 1 from public.user_blocks b where actor.id in (b.blocker_id, b.blocked_id) and profile.id in (b.blocker_id, b.blocked_id))
  order by coalesce(candidate_counts.mutual_count, 0) desc,
    (me.favorite_game is not null and lower(me.favorite_game) = lower(profile.favorite_game)) desc,
    profile.username
  limit least(greatest(result_limit, 1), 30)
$$;

create or replace function public.get_friend_highlights(target_friend_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); result jsonb;
begin
  if actor is null or not private.are_friends(actor, target_friend_id) then
    raise exception 'Friendship required';
  end if;
  select jsonb_build_object(
    'badges', case when coalesce(setting.show_badges, true) then coalesce(to_jsonb(profile.badges), 'null'::jsonb) else 'null'::jsonb end,
    'favorite_game', case when coalesce(setting.show_favorite_games, true) then to_jsonb(profile.favorite_game) else 'null'::jsonb end,
    'games', case when coalesce(setting.show_favorite_games, true) then to_jsonb(introduction.games) else 'null'::jsonb end,
    'interests', case when coalesce(setting.show_interests, true) then to_jsonb(introduction.interests) else 'null'::jsonb end
  ) into result
  from public.profiles profile
  left join public.friend_feature_settings setting on setting.user_id = profile.id
  left join public.community_introductions introduction on introduction.user_id = profile.id
  where profile.id = target_friend_id;
  return coalesce(result, '{}'::jsonb);
end $$;

create or replace function public.get_friend_activity_feed(result_limit integer default 30)
returns table(kind text, item_id uuid, friend_id uuid, username text, avatar text, title text, summary text, happened_at timestamptz, link text)
language sql stable security definer set search_path = '' as $$
  with actor as (select auth.uid() id), friends as (
    select case when requester_id = actor.id then addressee_id else requester_id end id
    from public.friendships, actor where status = 'accepted' and actor.id in (requester_id, addressee_id)
  ), allowed as (
    select coalesce(setting.activity_feed_enabled, false) enabled from actor
    left join public.friend_feature_settings setting on setting.user_id = actor.id
  ), events as (
    select 'introduction'::text kind, item.id item_id, item.user_id friend_id, profile.username, profile.avatar,
      'Updated their introduction'::text title, left(coalesce(item.introduction, ''), 180) summary, item.updated_at happened_at, 'CommunityIntroductions.html'::text link
    from public.community_introductions item join friends on friends.id = item.user_id join public.profiles profile on profile.id = item.user_id
    union all
    select 'idea', item.id, item.user_id, profile.username, profile.avatar, 'Shared an idea', left(item.title, 180), coalesce(item.updated_at, item.created_at), 'Ideas.html'
    from public.ideas item join friends on friends.id = item.user_id join public.profiles profile on profile.id = item.user_id
    union all
    select 'collab', item.id, item.user_id, profile.username, profile.avatar, 'Posted a collaboration', left(item.title, 180), coalesce(item.updated_at, item.created_at), 'Collab.html'
    from public.collab_posts item join friends on friends.id = item.user_id join public.profiles profile on profile.id = item.user_id
    union all
    select 'meetup', item.id, item.user_id, profile.username, profile.avatar, 'Planned a meetup', coalesce(item.meetup_type, 'Crew meetup'), item.created_at at time zone 'UTC', 'MeetupCalendar.html'
    from public.meetup_requests item join friends on friends.id = item.user_id join public.profiles profile on profile.id = item.user_id
    where item.status = 'approved'
  )
  select events.* from events, allowed where allowed.enabled order by happened_at desc limit least(greatest(result_limit, 1), 60)
$$;

create or replace function private.prioritize_close_friend_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if actor is not null and exists (
    select 1 from public.friend_details detail
    where detail.user_id = new.user_id and detail.friend_id = actor and detail.is_close
  ) then new.priority := 10; end if;
  return new;
end $$;
revoke all on function private.prioritize_close_friend_notification() from public, anon, authenticated;
drop trigger if exists prioritize_close_friend_notification_trigger on public.notifications;
create trigger prioritize_close_friend_notification_trigger before insert on public.notifications
for each row execute function private.prioritize_close_friend_notification();

revoke all on function public.get_friend_insights(uuid), public.get_friend_highlights(uuid), public.get_friend_recommendations(integer), public.get_friend_activity_feed(integer) from public, anon;
grant execute on function public.get_friend_insights(uuid), public.get_friend_highlights(uuid), public.get_friend_recommendations(integer), public.get_friend_activity_feed(integer) to authenticated, service_role;

do $$ begin
  alter publication supabase_realtime add table public.friend_details;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.friend_feature_settings;
exception when duplicate_object then null; end $$;
