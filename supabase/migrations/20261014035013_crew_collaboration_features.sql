alter table public.meetup_requests
  add column if not exists recurrence_rule text not null default 'none',
  add column if not exists recurrence_series_id uuid,
  add column if not exists recurrence_index integer not null default 0;

alter table public.meetup_requests
  drop constraint if exists meetup_requests_recurrence_rule_check;
alter table public.meetup_requests
  add constraint meetup_requests_recurrence_rule_check
  check (recurrence_rule in ('none', 'weekly', 'monthly'));
alter table public.meetup_requests
  drop constraint if exists meetup_requests_recurrence_index_check;
alter table public.meetup_requests
  add constraint meetup_requests_recurrence_index_check
  check (recurrence_index between 0 and 51);
create index if not exists meetup_requests_recurrence_series_idx
  on public.meetup_requests (recurrence_series_id, recurrence_index)
  where recurrence_series_id is not null;

create table if not exists public.meetup_participant_settings (
  meetup_id uuid not null references public.meetup_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reminder_minutes integer not null default 60 check (reminder_minutes in (15, 60, 1440)),
  check_in_status text not null default 'pending'
    check (check_in_status in ('pending', 'arrived', 'late', 'unable')),
  checked_in_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);
create index if not exists meetup_participant_settings_user_idx
  on public.meetup_participant_settings (user_id, updated_at desc);

create table if not exists public.meetup_reminder_log (
  meetup_id uuid not null references public.meetup_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);
alter table public.meetup_participant_settings enable row level security;
alter table public.meetup_reminder_log enable row level security;
revoke all on public.meetup_participant_settings from anon, authenticated;
revoke all on public.meetup_reminder_log from public, anon, authenticated;
grant select, insert, update, delete on public.meetup_participant_settings to authenticated;
grant all on public.meetup_participant_settings to service_role;
grant all on public.meetup_reminder_log to service_role;

create policy meetup_settings_participants_read
on public.meetup_participant_settings for select to authenticated
using (
  exists (
    select 1 from public.meetup_requests meetup
    where meetup.id = meetup_participant_settings.meetup_id
      and (select auth.uid()) in (meetup.user_id, meetup.with_user_id)
  )
);
create policy meetup_settings_members_insert
on public.meetup_participant_settings for insert to authenticated
with check (
  user_id = (select auth.uid()) and exists (
    select 1 from public.meetup_requests meetup
    where meetup.id = meetup_participant_settings.meetup_id
      and (select auth.uid()) in (meetup.user_id, meetup.with_user_id)
  )
);
create policy meetup_settings_members_update
on public.meetup_participant_settings for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy meetup_settings_members_delete
on public.meetup_participant_settings for delete to authenticated
using (user_id = (select auth.uid()));

alter table public.group_members
  add column if not exists role text not null default 'member';
alter table public.group_members
  drop constraint if exists group_members_role_check;
alter table public.group_members
  add constraint group_members_role_check check (role in ('owner', 'moderator', 'member'));
update public.group_members member
set role = case when conversation.owner_id = member.user_id then 'owner' else 'member' end
from public.group_conversations conversation
where conversation.id = member.group_id
  and member.role is distinct from case when conversation.owner_id = member.user_id then 'owner' else 'member' end;
create index if not exists group_members_group_role_idx
  on public.group_members (group_id, role);

create or replace function private.assign_group_member_role()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.group_conversations conversation where conversation.id = new.group_id and conversation.owner_id = new.user_id) then
    new.role := 'owner';
  elsif new.role = 'owner' then
    new.role := 'member';
  end if;
  return new;
end $$;
revoke all on function private.assign_group_member_role() from public, anon, authenticated;
drop trigger if exists assign_group_member_role_trigger on public.group_members;
create trigger assign_group_member_role_trigger before insert or update of user_id, role on public.group_members
for each row execute function private.assign_group_member_role();

create or replace function private.sync_group_owner_role()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.group_members set role = 'member' where group_id = new.id and role = 'owner' and user_id <> new.owner_id;
  update public.group_members set role = 'owner' where group_id = new.id and user_id = new.owner_id;
  return new;
end $$;
revoke all on function private.sync_group_owner_role() from public, anon, authenticated;
drop trigger if exists sync_group_owner_role_trigger on public.group_conversations;
create trigger sync_group_owner_role_trigger after update of owner_id on public.group_conversations
for each row execute function private.sync_group_owner_role();

create table if not exists public.group_polls (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_conversations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  question text not null check (char_length(trim(question)) between 3 and 180),
  closes_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.group_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.group_polls(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 100),
  position smallint not null check (position between 0 and 9),
  unique (poll_id, position)
);
create table if not exists public.group_poll_votes (
  poll_id uuid not null references public.group_polls(id) on delete cascade,
  option_id uuid not null references public.group_poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
create index if not exists group_polls_group_created_idx on public.group_polls (group_id, created_at desc);
create index if not exists group_poll_options_poll_idx on public.group_poll_options (poll_id, position);
create index if not exists group_poll_votes_option_idx on public.group_poll_votes (option_id);

alter table public.group_polls enable row level security;
alter table public.group_poll_options enable row level security;
alter table public.group_poll_votes enable row level security;
revoke all on public.group_polls, public.group_poll_options, public.group_poll_votes from anon, authenticated;
grant select on public.group_polls to authenticated;
grant update (closed_at) on public.group_polls to authenticated;
grant select on public.group_poll_options to authenticated;
grant select, insert, delete on public.group_poll_votes to authenticated;
grant update (option_id) on public.group_poll_votes to authenticated;
grant all on public.group_polls, public.group_poll_options, public.group_poll_votes to service_role;

create or replace function private.create_group_poll(group_key uuid, question_text text, option_labels text[], closes_after_hours integer default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); poll_key uuid; clean_question text := trim(question_text); option_count integer := cardinality(option_labels);
begin
  if actor is null then raise exception 'Sign in to create a poll'; end if;
  if not exists (select 1 from public.group_members where group_id = group_key and user_id = actor) then raise exception 'Group membership required'; end if;
  if char_length(clean_question) not between 3 and 180 then raise exception 'Poll questions must use 3 to 180 characters'; end if;
  if option_count not between 2 and 10 then raise exception 'Polls need 2 to 10 choices'; end if;
  if exists (select 1 from unnest(option_labels) label where char_length(trim(label)) not between 1 and 100) then raise exception 'Each choice must use 1 to 100 characters'; end if;
  if closes_after_hours is not null and closes_after_hours not between 1 and 720 then raise exception 'Poll duration must be between 1 and 720 hours'; end if;
  insert into public.group_polls (group_id, created_by, question, closes_at)
  values (group_key, actor, clean_question, case when closes_after_hours is null then null else now() + make_interval(hours => closes_after_hours) end)
  returning id into poll_key;
  insert into public.group_poll_options (poll_id, label, position)
  select poll_key, trim(label), ordinal - 1 from unnest(option_labels) with ordinality item(label, ordinal);
  return poll_key;
end $$;
revoke all on function private.create_group_poll(uuid, text, text[], integer) from public, anon, authenticated;
grant execute on function private.create_group_poll(uuid, text, text[], integer) to authenticated, service_role;
create or replace function public.create_group_poll(group_key uuid, question_text text, option_labels text[], closes_after_hours integer default null)
returns uuid language sql security invoker set search_path = '' as $$ select private.create_group_poll(group_key, question_text, option_labels, closes_after_hours) $$;
revoke all on function public.create_group_poll(uuid, text, text[], integer) from public, anon;
grant execute on function public.create_group_poll(uuid, text, text[], integer) to authenticated, service_role;

create policy group_members_read_polls on public.group_polls for select to authenticated
using (exists (select 1 from public.group_members member where member.group_id = group_polls.group_id and member.user_id = (select auth.uid())));
create policy group_members_create_polls on public.group_polls for insert to authenticated
with check (created_by = (select auth.uid()) and exists (select 1 from public.group_members member where member.group_id = group_polls.group_id and member.user_id = (select auth.uid())));
create policy poll_creators_close_polls on public.group_polls for update to authenticated
using (created_by = (select auth.uid()) or exists (select 1 from public.group_members member where member.group_id = group_polls.group_id and member.user_id = (select auth.uid()) and member.role in ('owner', 'moderator')))
with check (created_by = (select auth.uid()) or exists (select 1 from public.group_members member where member.group_id = group_polls.group_id and member.user_id = (select auth.uid()) and member.role in ('owner', 'moderator')));

create policy group_members_read_poll_options on public.group_poll_options for select to authenticated
using (exists (select 1 from public.group_polls poll join public.group_members member on member.group_id = poll.group_id where poll.id = group_poll_options.poll_id and member.user_id = (select auth.uid())));
create policy poll_creators_add_options on public.group_poll_options for insert to authenticated
with check (exists (select 1 from public.group_polls poll where poll.id = group_poll_options.poll_id and poll.created_by = (select auth.uid())));

create policy group_members_read_poll_votes on public.group_poll_votes for select to authenticated
using (exists (select 1 from public.group_polls poll join public.group_members member on member.group_id = poll.group_id where poll.id = group_poll_votes.poll_id and member.user_id = (select auth.uid())));
create policy members_cast_poll_votes on public.group_poll_votes for insert to authenticated
with check (user_id = (select auth.uid()) and exists (
  select 1 from public.group_polls poll
  join public.group_members member on member.group_id = poll.group_id
  join public.group_poll_options option on option.poll_id = poll.id
  where poll.id = group_poll_votes.poll_id and option.id = group_poll_votes.option_id
    and member.user_id = (select auth.uid()) and poll.closed_at is null
    and (poll.closes_at is null or poll.closes_at > now())
));
create policy members_change_own_poll_votes on public.group_poll_votes for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and exists (
  select 1 from public.group_polls poll
  join public.group_members member on member.group_id = poll.group_id
  join public.group_poll_options option on option.poll_id = poll.id
  where poll.id = group_poll_votes.poll_id and option.id = group_poll_votes.option_id
    and member.user_id = (select auth.uid()) and poll.closed_at is null
    and (poll.closes_at is null or poll.closes_at > now())
));
create policy members_remove_own_poll_votes on public.group_poll_votes for delete to authenticated
using (user_id = (select auth.uid()));

create table if not exists public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  restriction_action text not null,
  restriction_expires_at timestamptz not null,
  restriction_created_at timestamptz,
  evidence jsonb not null default '[]'::jsonb,
  appeal_text text not null check (char_length(trim(appeal_text)) between 20 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  captain_response text check (captain_response is null or char_length(captain_response) <= 2000),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  unique (user_id, restriction_action, restriction_expires_at)
);
create index if not exists moderation_appeals_status_idx on public.moderation_appeals (status, created_at desc);
alter table public.moderation_appeals enable row level security;
revoke all on public.moderation_appeals from anon, authenticated;
grant select on public.moderation_appeals to authenticated;
grant insert (user_id, restriction_action, restriction_expires_at, appeal_text) on public.moderation_appeals to authenticated;
grant update (status, captain_response, reviewed_at, reviewed_by) on public.moderation_appeals to authenticated;
grant all on public.moderation_appeals to service_role;

create or replace function private.prepare_moderation_appeal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select restriction.created_at into new.restriction_created_at
  from public.user_restrictions restriction
  where restriction.user_id = new.user_id and restriction.action = new.restriction_action
    and restriction.expires_at = new.restriction_expires_at;
  select coalesce(jsonb_agg(jsonb_build_object(
    'message_kind', evidence.message_kind,
    'conversation_id', evidence.conversation_id,
    'message_content', evidence.message_content,
    'categories', evidence.categories,
    'message_created_at', evidence.message_created_at
  ) order by evidence.detected_at desc), '[]'::jsonb) into new.evidence
  from (select * from public.message_safety_flags where sender_id = new.user_id order by detected_at desc limit 5) evidence;
  return new;
end $$;
revoke all on function private.prepare_moderation_appeal() from public, anon, authenticated;
drop trigger if exists prepare_moderation_appeal_trigger on public.moderation_appeals;
create trigger prepare_moderation_appeal_trigger before insert on public.moderation_appeals
for each row execute function private.prepare_moderation_appeal();

create or replace function private.apply_moderation_appeal_decision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and new.status = 'approved' then
    delete from public.user_restrictions
    where user_id = new.user_id and action = new.restriction_action and expires_at = new.restriction_expires_at;
  end if;
  return new;
end $$;
revoke all on function private.apply_moderation_appeal_decision() from public, anon, authenticated;
drop trigger if exists apply_moderation_appeal_decision_trigger on public.moderation_appeals;
create trigger apply_moderation_appeal_decision_trigger after update of status on public.moderation_appeals
for each row execute function private.apply_moderation_appeal_decision();
create policy members_read_own_appeals on public.moderation_appeals for select to authenticated
using (user_id = (select auth.uid()) or exists (select 1 from public.profiles profile where profile.id = (select auth.uid()) and lower(profile.rank) = 'captain'));
create policy restricted_members_create_one_appeal on public.moderation_appeals for insert to authenticated
with check (user_id = (select auth.uid()) and status = 'pending' and exists (
  select 1 from public.user_restrictions restriction
  where restriction.user_id = (select auth.uid()) and restriction.action = restriction_action
    and restriction.expires_at = restriction_expires_at and restriction.expires_at > now()
));
create policy captains_review_appeals on public.moderation_appeals for update to authenticated
using (exists (select 1 from public.profiles profile where profile.id = (select auth.uid()) and lower(profile.rank) = 'captain'))
with check (exists (select 1 from public.profiles profile where profile.id = (select auth.uid()) and lower(profile.rank) = 'captain'));

create or replace function private.moderate_group_member(group_key uuid, target_user uuid, operation text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); actor_role text; member_count integer;
begin
  select role into actor_role from public.group_members where group_id = group_key and user_id = actor;
  if actor_role not in ('owner', 'moderator') then raise exception 'Group owner or moderator access required'; end if;
  if target_user = actor then raise exception 'You cannot moderate yourself'; end if;
  if operation = 'invite' then
    select count(*) into member_count from public.group_members where group_id = group_key;
    if member_count >= 10 then raise exception 'This group already has 10 members'; end if;
    insert into public.group_members (group_id, user_id, role) values (group_key, target_user, 'member') on conflict do nothing;
  elsif operation = 'kick' then
    if exists (select 1 from public.group_members where group_id = group_key and user_id = target_user and role = 'owner') then raise exception 'The group owner cannot be removed'; end if;
    if actor_role = 'moderator' and exists (select 1 from public.group_members where group_id = group_key and user_id = target_user and role = 'moderator') then raise exception 'Only the owner can remove a moderator'; end if;
    delete from public.group_members where group_id = group_key and user_id = target_user;
  else raise exception 'Unsupported group member action'; end if;
end $$;
revoke all on function private.moderate_group_member(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.moderate_group_member(uuid, uuid, text) to authenticated, service_role;
create or replace function public.moderate_group_member(group_key uuid, target_user uuid, operation text)
returns void language sql security invoker set search_path = '' as $$ select private.moderate_group_member(group_key, target_user, operation) $$;
revoke all on function public.moderate_group_member(uuid, uuid, text) from public, anon;
grant execute on function public.moderate_group_member(uuid, uuid, text) to authenticated, service_role;

create or replace function private.set_group_member_role(group_key uuid, target_user uuid, new_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if new_role not in ('moderator', 'member') then raise exception 'Choose moderator or member'; end if;
  if not exists (select 1 from public.group_members where group_id = group_key and user_id = actor and role = 'owner') then raise exception 'Only the group owner can change roles'; end if;
  if target_user = actor then raise exception 'Transfer ownership before changing the owner role'; end if;
  update public.group_members set role = new_role where group_id = group_key and user_id = target_user and role <> 'owner';
  if not found then raise exception 'Group member not found'; end if;
end $$;
revoke all on function private.set_group_member_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.set_group_member_role(uuid, uuid, text) to authenticated, service_role;
create or replace function public.set_group_member_role(group_key uuid, target_user uuid, new_role text)
returns void language sql security invoker set search_path = '' as $$ select private.set_group_member_role(group_key, target_user, new_role) $$;
revoke all on function public.set_group_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_group_member_role(uuid, uuid, text) to authenticated, service_role;

create or replace function public.get_due_meetup_reminders()
returns table (
  meetup_id uuid,
  user_id uuid,
  reminder_minutes integer,
  starts_at timestamptz,
  meetup_type text,
  other_user_id uuid
)
language sql security definer set search_path = '' as $$
  select meetup.id,
         setting.user_id,
         setting.reminder_minutes,
         (meetup.meetup_date + meetup.start_time) at time zone meetup.time_zone,
         meetup.meetup_type,
         case when setting.user_id = meetup.user_id then meetup.with_user_id else meetup.user_id end
  from public.meetup_participant_settings setting
  join public.meetup_requests meetup on meetup.id = setting.meetup_id
  left join public.meetup_reminder_log sent
    on sent.meetup_id = setting.meetup_id and sent.user_id = setting.user_id
  where meetup.status = 'approved'
    and setting.check_in_status <> 'unable'
    and sent.meetup_id is null
    and (meetup.meetup_date + meetup.start_time) at time zone meetup.time_zone > now()
    and ((meetup.meetup_date + meetup.start_time) at time zone meetup.time_zone)
      - make_interval(mins => setting.reminder_minutes) <= now()
$$;
revoke all on function public.get_due_meetup_reminders() from public, anon, authenticated;
grant execute on function public.get_due_meetup_reminders() to service_role;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_polls') then alter publication supabase_realtime add table public.group_polls; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_poll_votes') then alter publication supabase_realtime add table public.group_poll_votes; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meetup_participant_settings') then alter publication supabase_realtime add table public.meetup_participant_settings; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'moderation_appeals') then alter publication supabase_realtime add table public.moderation_appeals; end if;
end $$;
