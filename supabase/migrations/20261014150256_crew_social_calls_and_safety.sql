create schema if not exists private;

alter table public.profiles add column if not exists in_call_until timestamptz;

create or replace function private.is_captain(actor uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.profiles profile
  where profile.id = coalesce(actor, (select auth.uid())) and lower(profile.rank) = 'captain'
) $$;

create or replace function private.can_access_conversation(kind text, conversation_key uuid, actor uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case kind
    when 'dm' then exists (
      select 1 from public.dm_conversations conversation
      where conversation.id = conversation_key and coalesce(actor, (select auth.uid())) in (conversation.user_one, conversation.user_two)
    )
    when 'group' then exists (
      select 1 from public.group_members member
      where member.group_id = conversation_key and member.user_id = coalesce(actor, (select auth.uid()))
    )
    else false
  end
$$;

create or replace function private.can_manage_group(group_key uuid, actor uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.group_members member
  where member.group_id = group_key and member.user_id = coalesce(actor, (select auth.uid())) and member.role in ('owner', 'moderator')
) $$;

revoke all on function private.is_captain(uuid), private.can_access_conversation(text, uuid, uuid), private.can_manage_group(uuid, uuid) from public, anon, authenticated;
grant execute on function private.is_captain(uuid), private.can_access_conversation(text, uuid, uuid), private.can_manage_group(uuid, uuid) to authenticated, service_role;

alter table public.group_conversations
  add column if not exists description text,
  add column if not exists slow_mode_seconds integer not null default 0,
  add column if not exists call_locked boolean not null default false;
alter table public.group_conversations drop constraint if exists group_conversations_description_check;
alter table public.group_conversations add constraint group_conversations_description_check check (description is null or char_length(description) <= 500);
alter table public.group_conversations drop constraint if exists group_conversations_slow_mode_check;
alter table public.group_conversations add constraint group_conversations_slow_mode_check check (slow_mode_seconds in (0, 5, 10, 30, 60, 300));

create or replace function private.enforce_group_slow_mode()
returns trigger language plpgsql security definer set search_path = '' as $$
declare wait_seconds integer; last_sent timestamptz;
begin
  select slow_mode_seconds into wait_seconds
  from public.group_conversations where id = new.group_id;
  if coalesce(wait_seconds, 0) = 0 then return new; end if;
  select max(created_at) into last_sent from public.group_messages
  where group_id = new.group_id and sender_id = new.sender_id;
  if last_sent is not null and last_sent + make_interval(secs => wait_seconds) > now() then
    raise exception 'Slow mode is active. Wait % seconds before sending again.',
      greatest(1, ceil(extract(epoch from (last_sent + make_interval(secs => wait_seconds) - now())))::integer)
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.enforce_group_slow_mode() from public, anon, authenticated;
drop trigger if exists enforce_group_slow_mode_trigger on public.group_messages;
create trigger enforce_group_slow_mode_trigger before insert on public.group_messages
for each row execute function private.enforce_group_slow_mode();

alter table public.dm_messages
  add column if not exists forwarded_from_kind text,
  add column if not exists forwarded_from_message_id uuid,
  add column if not exists forwarded_from_sender_id uuid references public.profiles(id) on delete set null,
  add column if not exists forwarded_excerpt text;
alter table public.group_messages
  add column if not exists forwarded_from_kind text,
  add column if not exists forwarded_from_message_id uuid,
  add column if not exists forwarded_from_sender_id uuid references public.profiles(id) on delete set null,
  add column if not exists forwarded_excerpt text;

create or replace function private.forward_crew_message(target_kind text, target_id uuid, source_kind text, source_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); original_content text; original_sender uuid; created_id uuid;
begin
  if not private.can_access_conversation(target_kind, target_id, actor) or not private.can_access_conversation(source_kind, (case when source_kind = 'dm' then (select conversation_id from public.dm_messages where id = source_id) else (select group_id from public.group_messages where id = source_id) end), actor) then raise exception 'Conversation access required'; end if;
  if source_kind = 'dm' then select content, sender_id into original_content, original_sender from public.dm_messages where id = source_id;
  elsif source_kind = 'group' then select content, sender_id into original_content, original_sender from public.group_messages where id = source_id;
  else raise exception 'Unsupported message type'; end if;
  if original_content is null then raise exception 'Message unavailable'; end if;
  if target_kind = 'dm' then insert into public.dm_messages (conversation_id,sender_id,content,forwarded_from_kind,forwarded_from_message_id,forwarded_from_sender_id,forwarded_excerpt) values (target_id,actor,original_content,source_kind,source_id,original_sender,left(original_content,900)) returning id into created_id;
  elsif target_kind = 'group' then insert into public.group_messages (group_id,sender_id,content,forwarded_from_kind,forwarded_from_message_id,forwarded_from_sender_id,forwarded_excerpt) values (target_id,actor,original_content,source_kind,source_id,original_sender,left(original_content,900)) returning id into created_id;
  else raise exception 'Unsupported target type'; end if;
  return created_id;
end $$;
revoke all on function private.forward_crew_message(text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function private.forward_crew_message(text, uuid, text, uuid) to authenticated, service_role;
create or replace function public.forward_crew_message(target_kind text, target_id uuid, source_kind text, source_id uuid)
returns uuid language sql security definer set search_path = '' as $$ select private.forward_crew_message(target_kind,target_id,source_kind,source_id) $$;
revoke all on function public.forward_crew_message(text, uuid, text, uuid) from public, anon;
grant execute on function public.forward_crew_message(text, uuid, text, uuid) to authenticated, service_role;

create table if not exists public.conversation_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_kind text not null check (conversation_kind in ('dm','group')),
  conversation_id uuid not null,
  notification_level text not null default 'all' check (notification_level in ('all','mentions','none')),
  muted_until timestamptz,
  folder text not null default 'inbox' check (folder in ('inbox','friends','meetups','important','muted')),
  sound_key text not null default 'default' check (sound_key in ('default','soft','bright','silent')),
  is_favorite boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_kind, conversation_id)
);

create table if not exists public.message_pins (
  id uuid primary key default gen_random_uuid(),
  conversation_kind text not null check (conversation_kind in ('dm','group')),
  conversation_id uuid not null,
  message_id uuid not null,
  message_excerpt text not null check (char_length(message_excerpt) <= 900),
  sender_id uuid references public.profiles(id) on delete set null,
  pinned_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (conversation_kind, conversation_id, message_id)
);

create table if not exists public.message_reactions (
  conversation_kind text not null check (conversation_kind in ('dm','group')),
  conversation_id uuid not null,
  message_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','🎉','🚀')),
  created_at timestamptz not null default now(),
  primary key (conversation_kind, message_id, user_id, emoji)
);

create table if not exists public.message_read_receipts (
  conversation_kind text not null check (conversation_kind in ('dm','group')),
  conversation_id uuid not null,
  message_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (conversation_kind, message_id, user_id)
);

create table if not exists public.message_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_kind text not null check (conversation_kind in ('dm','group')),
  conversation_id uuid not null,
  message_id uuid not null,
  message_excerpt text not null check (char_length(message_excerpt) <= 900),
  remind_at timestamptz not null,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table if not exists public.looking_for_group_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 100),
  activity text not null check (char_length(trim(activity)) between 2 and 100),
  details text check (details is null or char_length(details) <= 700),
  slots integer not null default 4 check (slots between 2 and 25),
  starts_at timestamptz,
  expires_at timestamptz not null default (now() + interval '12 hours'),
  created_at timestamptz not null default now()
);

create table if not exists public.temporary_party_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 3 and 80),
  activity text,
  expires_at timestamptz not null default (now() + interval '8 hours'),
  created_at timestamptz not null default now()
);
create table if not exists public.temporary_party_members (
  room_id uuid not null references public.temporary_party_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.favorite_crew (
  user_id uuid not null references public.profiles(id) on delete cascade,
  favorite_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, favorite_user_id),
  check (user_id <> favorite_user_id)
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create or replace function private.enforce_contact_block()
returns trigger language plpgsql security definer set search_path = '' as $$
declare first_user uuid; second_user uuid;
begin
  if tg_table_name = 'dm_requests' then
    first_user := new.sender_id;
    second_user := new.recipient_id;
  elsif tg_table_name = 'dm_messages' then
    select user_one, user_two into first_user, second_user
    from public.dm_conversations where id = new.conversation_id;
  elsif tg_table_name = 'active_voice_calls' and new.dm_conversation_id is not null then
    select user_one, user_two into first_user, second_user
    from public.dm_conversations where id = new.dm_conversation_id;
  else
    return new;
  end if;
  if exists (
    select 1 from public.user_blocks block
    where (block.blocker_id = first_user and block.blocked_id = second_user)
       or (block.blocker_id = second_user and block.blocked_id = first_user)
  ) then
    raise exception 'Communication is blocked between these crew members.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.enforce_contact_block() from public, anon, authenticated;
drop trigger if exists enforce_dm_request_contact_block on public.dm_requests;
create trigger enforce_dm_request_contact_block before insert on public.dm_requests for each row execute function private.enforce_contact_block();
drop trigger if exists enforce_dm_message_contact_block on public.dm_messages;
create trigger enforce_dm_message_contact_block before insert on public.dm_messages for each row execute function private.enforce_contact_block();
drop trigger if exists enforce_dm_call_contact_block on public.active_voice_calls;
create trigger enforce_dm_call_contact_block before insert on public.active_voice_calls for each row execute function private.enforce_contact_block();

create table if not exists public.user_ui_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  accent text not null default 'blue' check (accent in ('blue','violet','cyan','green','amber','rose')),
  reduced_effects boolean not null default false,
  dashboard_widgets jsonb not null default '["meetups","birthdays","notifications"]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.meetup_requests
  add column if not exists capacity integer not null default 2,
  add column if not exists attendance_finalized_at timestamptz;
alter table public.meetup_requests drop constraint if exists meetup_requests_capacity_check;
alter table public.meetup_requests add constraint meetup_requests_capacity_check check (capacity between 2 and 25);

create table if not exists public.meetup_participants (
  meetup_id uuid not null references public.meetup_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'participant' check (role in ('organizer','participant')),
  invitation_status text not null default 'pending' check (invitation_status in ('pending','accepted','declined')),
  attendance_status text not null default 'pending' check (attendance_status in ('pending','attended','late','cancelled','missed')),
  joined_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

create table if not exists public.meetup_waitlist (
  meetup_id uuid not null references public.meetup_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  primary key (meetup_id, user_id),
  unique (meetup_id, position)
);

create or replace function private.seed_meetup_participants()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.meetup_participants (meetup_id, user_id, role, invitation_status)
  values (new.id, new.user_id, 'organizer', 'accepted') on conflict do nothing;
  if new.with_user_id is not null then
    insert into public.meetup_participants (meetup_id, user_id, role, invitation_status)
    values (new.id, new.with_user_id, 'participant', case when new.status = 'approved' then 'accepted' else 'pending' end)
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function private.seed_meetup_participants() from public, anon, authenticated;
drop trigger if exists seed_meetup_participants_trigger on public.meetup_requests;
create trigger seed_meetup_participants_trigger after insert on public.meetup_requests
for each row execute function private.seed_meetup_participants();
insert into public.meetup_participants (meetup_id, user_id, role, invitation_status)
select id, user_id, 'organizer', 'accepted' from public.meetup_requests on conflict do nothing;
insert into public.meetup_participants (meetup_id, user_id, role, invitation_status)
select id, with_user_id, 'participant', case when status = 'approved' then 'accepted' else 'pending' end
from public.meetup_requests where with_user_id is not null on conflict do nothing;

create or replace function private.promote_meetup_waitlist()
returns trigger language plpgsql security definer set search_path = '' as $$
declare meetup_key uuid; next_user uuid; open_seats integer;
begin
  meetup_key := case when tg_op = 'DELETE' then old.meetup_id else new.meetup_id end;
  select greatest(0, meetup.capacity - count(participant.user_id)) into open_seats
  from public.meetup_requests meetup
  left join public.meetup_participants participant on participant.meetup_id = meetup.id and participant.invitation_status = 'accepted'
  where meetup.id = meetup_key group by meetup.capacity;
  while coalesce(open_seats, 0) > 0 loop
    select user_id into next_user from public.meetup_waitlist where meetup_id = meetup_key order by position, created_at limit 1;
    exit when next_user is null;
    insert into public.meetup_participants (meetup_id,user_id,role,invitation_status)
    values (meetup_key,next_user,'participant','accepted')
    on conflict (meetup_id,user_id) do update set invitation_status = 'accepted';
    delete from public.meetup_waitlist where meetup_id = meetup_key and user_id = next_user;
    open_seats := open_seats - 1;
    next_user := null;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function private.promote_meetup_waitlist() from public, anon, authenticated;
drop trigger if exists promote_meetup_waitlist_trigger on public.meetup_participants;
create trigger promote_meetup_waitlist_trigger after update of invitation_status or delete on public.meetup_participants
for each row execute function private.promote_meetup_waitlist();

create table if not exists public.moderation_evidence_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_id uuid,
  conversation_kind text not null check (conversation_kind in ('dm','group')),
  conversation_id uuid not null,
  reported_user_id uuid references public.profiles(id) on delete set null,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  message_context jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open','reviewed','dismissed')),
  captain_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  captain_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  note text not null check (char_length(trim(note)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  issued_by uuid not null references public.profiles(id) on delete cascade,
  rule_reference text not null,
  reason text not null check (char_length(trim(reason)) between 3 and 2000),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.community_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 120),
  body text not null check (char_length(trim(body)) between 3 and 4000),
  target text not null default 'all' check (target in ('all','website','app','groups')),
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.community_system_state (
  id boolean primary key default true check (id),
  maintenance_enabled boolean not null default false,
  maintenance_message text not null default 'CrewDeck is receiving a quick tune-up. Please check back soon.',
  messaging_status text not null default 'operational',
  calls_status text not null default 'operational',
  notifications_status text not null default 'operational',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.captain_audit_log (
  id uuid primary key default gen_random_uuid(),
  captain_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role_name text not null default 'Staff',
  permissions text[] not null default '{}',
  updated_by uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
insert into public.community_system_state (id) values (true) on conflict do nothing;

create or replace function private.record_captain_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare payload jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.captain_audit_log (captain_id, action, target_user_id, details)
  values (
    (select auth.uid()),
    lower(tg_op) || '_' || tg_table_name,
    case when payload ? 'user_id' then (payload->>'user_id')::uuid else null end,
    jsonb_build_object('record_id', coalesce(payload->>'id', payload->>'user_id'))
  );
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function private.record_captain_audit() from public, anon, authenticated;
drop trigger if exists audit_announcements on public.community_announcements;
create trigger audit_announcements after insert or update or delete on public.community_announcements for each row execute function private.record_captain_audit();
drop trigger if exists audit_system_state on public.community_system_state;
create trigger audit_system_state after update on public.community_system_state for each row execute function private.record_captain_audit();
drop trigger if exists audit_moderation_notes on public.moderation_notes;
create trigger audit_moderation_notes after insert or update or delete on public.moderation_notes for each row execute function private.record_captain_audit();
drop trigger if exists audit_moderation_warnings on public.moderation_warnings;
create trigger audit_moderation_warnings after insert or update or delete on public.moderation_warnings for each row execute function private.record_captain_audit();
drop trigger if exists audit_staff_permissions on public.staff_permissions;
create trigger audit_staff_permissions after insert or update or delete on public.staff_permissions for each row execute function private.record_captain_audit();

create table if not exists public.call_messages (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 700),
  created_at timestamptz not null default now()
);

create table if not exists public.call_participant_controls (
  call_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hand_raised boolean not null default false,
  deafened boolean not null default false,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (call_id, user_id)
);

create or replace function private.is_meetup_member(meetup_key uuid, actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.meetup_participants where meetup_id = meetup_key and user_id = coalesce(actor, (select auth.uid()))) $$;
create or replace function private.is_meetup_organizer(meetup_key uuid, actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.meetup_participants where meetup_id = meetup_key and user_id = coalesce(actor, (select auth.uid())) and role = 'organizer') $$;
create or replace function private.is_call_member(call_key uuid, actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.call_participant_controls where call_id = call_key and user_id = coalesce(actor, (select auth.uid()))) $$;
create or replace function private.can_access_call(call_key uuid, actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.active_voice_calls call
    where call.call_id = call_key and (
      (call.dm_conversation_id is not null and exists (
        select 1 from public.dm_conversations conversation
        where conversation.id = call.dm_conversation_id and coalesce(actor, (select auth.uid())) in (conversation.user_one, conversation.user_two)
      )) or
      (call.group_conversation_id is not null and exists (
        select 1 from public.group_members member
        where member.group_id = call.group_conversation_id and member.user_id = coalesce(actor, (select auth.uid()))
      ))
    )
  )
$$;
revoke all on function private.is_meetup_member(uuid, uuid), private.is_meetup_organizer(uuid, uuid), private.is_call_member(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_access_call(uuid, uuid) from public, anon, authenticated;
grant execute on function private.is_meetup_member(uuid, uuid), private.is_meetup_organizer(uuid, uuid), private.is_call_member(uuid, uuid), private.can_access_call(uuid, uuid) to authenticated, service_role;

create index if not exists conversation_preferences_user_idx on public.conversation_preferences (user_id, folder, updated_at desc);
create index if not exists message_pins_conversation_idx on public.message_pins (conversation_kind, conversation_id, created_at desc);
create index if not exists message_reactions_message_idx on public.message_reactions (conversation_kind, conversation_id, message_id);
create index if not exists message_receipts_message_idx on public.message_read_receipts (conversation_kind, conversation_id, message_id);
create index if not exists message_reminders_due_idx on public.message_reminders (remind_at) where delivered_at is null;
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);
create index if not exists moderation_notes_user_idx on public.moderation_notes (user_id, created_at desc);
create index if not exists moderation_warnings_user_idx on public.moderation_warnings (user_id, created_at desc);
create index if not exists announcements_publish_idx on public.community_announcements (publish_at desc);
create index if not exists call_messages_call_idx on public.call_messages (call_id, created_at);

alter table public.conversation_preferences enable row level security;
alter table public.message_pins enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_read_receipts enable row level security;
alter table public.message_reminders enable row level security;
alter table public.friendships enable row level security;
alter table public.looking_for_group_posts enable row level security;
alter table public.temporary_party_rooms enable row level security;
alter table public.temporary_party_members enable row level security;
alter table public.favorite_crew enable row level security;
alter table public.user_blocks enable row level security;
alter table public.user_ui_preferences enable row level security;
alter table public.meetup_participants enable row level security;
alter table public.meetup_waitlist enable row level security;
alter table public.moderation_evidence_snapshots enable row level security;
alter table public.moderation_notes enable row level security;
alter table public.moderation_warnings enable row level security;
alter table public.community_announcements enable row level security;
alter table public.community_system_state enable row level security;
alter table public.captain_audit_log enable row level security;
alter table public.staff_permissions enable row level security;
alter table public.call_messages enable row level security;
alter table public.call_participant_controls enable row level security;

do $$ declare table_name text; begin
  foreach table_name in array array[
    'conversation_preferences','message_pins','message_reactions','message_read_receipts','message_reminders',
    'friendships','favorite_crew','user_blocks','user_ui_preferences','meetup_participants','meetup_waitlist',
    'moderation_evidence_snapshots','moderation_notes','moderation_warnings','community_announcements',
    'community_system_state','call_messages','call_participant_controls','looking_for_group_posts','temporary_party_rooms','temporary_party_members','captain_audit_log','staff_permissions'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end $$;

grant select, insert, update, delete on public.conversation_preferences, public.message_reactions, public.message_read_receipts, public.message_reminders, public.friendships, public.favorite_crew, public.user_blocks, public.user_ui_preferences, public.meetup_participants, public.meetup_waitlist, public.call_messages, public.call_participant_controls to authenticated;
grant select, insert, update, delete on public.looking_for_group_posts, public.temporary_party_rooms, public.temporary_party_members to authenticated;
grant select, insert, update, delete on public.captain_audit_log, public.staff_permissions to authenticated;
grant select, insert, delete on public.message_pins to authenticated;
grant select, insert, update on public.moderation_evidence_snapshots to authenticated;
grant select on public.moderation_notes, public.moderation_warnings, public.community_announcements, public.community_system_state to authenticated;
grant insert, update, delete on public.moderation_notes, public.moderation_warnings, public.community_announcements to authenticated;
grant update on public.community_system_state to authenticated;

create or replace function public.delete_dm_conversation(conversation_key uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.dm_conversations conversation
    where conversation.id = conversation_key
      and (select auth.uid()) in (conversation.user_one, conversation.user_two)
  ) then
    raise exception 'Conversation not found or access denied.';
  end if;

  delete from public.call_messages
  where call_id in (
    select call.call_id
    from public.active_voice_calls call
    where call.dm_conversation_id = conversation_key
  );
  delete from public.call_participant_controls
  where call_id in (
    select call.call_id
    from public.active_voice_calls call
    where call.dm_conversation_id = conversation_key
  );
  delete from public.conversation_preferences where conversation_kind = 'dm' and conversation_id = conversation_key;
  delete from public.message_pins where conversation_kind = 'dm' and conversation_id = conversation_key;
  delete from public.message_reactions where conversation_kind = 'dm' and conversation_id = conversation_key;
  delete from public.message_read_receipts where conversation_kind = 'dm' and conversation_id = conversation_key;
  delete from public.message_reminders where conversation_kind = 'dm' and conversation_id = conversation_key;
  delete from public.dm_conversations where id = conversation_key;
end;
$$;

revoke all on function public.delete_dm_conversation(uuid) from public, anon;
grant execute on function public.delete_dm_conversation(uuid) to authenticated, service_role;

create policy own_conversation_preferences on public.conversation_preferences for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and private.can_access_conversation(conversation_kind, conversation_id, (select auth.uid())));
create policy conversation_members_read_pins on public.message_pins for select to authenticated using (private.can_access_conversation(conversation_kind, conversation_id, (select auth.uid())));
create policy group_staff_pin_messages on public.message_pins for insert to authenticated with check (conversation_kind = 'group' and private.can_manage_group(conversation_id, (select auth.uid())) and pinned_by = (select auth.uid()));
create policy group_staff_unpin_messages on public.message_pins for delete to authenticated using (conversation_kind = 'group' and private.can_manage_group(conversation_id, (select auth.uid())));
create policy conversation_members_react on public.message_reactions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and private.can_access_conversation(conversation_kind, conversation_id, (select auth.uid())));
create policy conversation_members_read_reactions on public.message_reactions for select to authenticated using (private.can_access_conversation(conversation_kind, conversation_id, (select auth.uid())));
create policy own_read_receipts on public.message_read_receipts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and private.can_access_conversation(conversation_kind, conversation_id, (select auth.uid())));
create policy conversation_members_read_receipts on public.message_read_receipts for select to authenticated using (private.can_access_conversation(conversation_kind, conversation_id, (select auth.uid())));
create policy own_message_reminders on public.message_reminders for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and private.can_access_conversation(conversation_kind, conversation_id, (select auth.uid())));
create policy friendship_participants_read on public.friendships for select to authenticated using ((select auth.uid()) in (requester_id, addressee_id));
create policy members_request_friendship on public.friendships for insert to authenticated with check (requester_id = (select auth.uid()));
create policy friendship_addressee_updates on public.friendships for update to authenticated using (addressee_id = (select auth.uid())) with check (addressee_id = (select auth.uid()));
create policy friendship_participants_delete on public.friendships for delete to authenticated using ((select auth.uid()) in (requester_id, addressee_id));
create policy members_read_active_lfg on public.looking_for_group_posts for select to authenticated using (expires_at > now());
create policy members_manage_own_lfg on public.looking_for_group_posts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy members_read_active_parties on public.temporary_party_rooms for select to authenticated using (expires_at > now());
create policy owners_manage_parties on public.temporary_party_rooms for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy members_read_party_members on public.temporary_party_members for select to authenticated using (true);
create policy members_manage_party_membership on public.temporary_party_members for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_favorite_crew on public.favorite_crew for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_blocks on public.user_blocks for all to authenticated using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));
create policy own_ui_preferences on public.user_ui_preferences for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy meetup_members_read_participants on public.meetup_participants for select to authenticated using (private.is_meetup_member(meetup_id, (select auth.uid())));
create policy meetup_organizers_manage_participants on public.meetup_participants for all to authenticated using (private.is_meetup_organizer(meetup_id, (select auth.uid()))) with check (private.is_meetup_organizer(meetup_id, (select auth.uid())));
create policy participants_update_self on public.meetup_participants for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy meetup_members_read_waitlist on public.meetup_waitlist for select to authenticated using (exists (select 1 from public.meetup_participants member where member.meetup_id = meetup_waitlist.meetup_id and member.user_id = (select auth.uid())));
create policy own_waitlist_entry on public.meetup_waitlist for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy submit_evidence_snapshots on public.moderation_evidence_snapshots for insert to authenticated with check (submitted_by = (select auth.uid()) and private.can_access_conversation(conversation_kind, conversation_id, (select auth.uid())));
create policy captains_read_evidence on public.moderation_evidence_snapshots for select to authenticated using (private.is_captain((select auth.uid())));
create policy captains_review_evidence on public.moderation_evidence_snapshots for update to authenticated using (private.is_captain((select auth.uid()))) with check (private.is_captain((select auth.uid())));
create policy captains_manage_notes on public.moderation_notes for all to authenticated using (private.is_captain((select auth.uid()))) with check (private.is_captain((select auth.uid())) and captain_id = (select auth.uid()));
create policy captains_manage_warnings on public.moderation_warnings for all to authenticated using (private.is_captain((select auth.uid()))) with check (private.is_captain((select auth.uid())) and issued_by = (select auth.uid()));
create policy members_read_own_warnings on public.moderation_warnings for select to authenticated using (user_id = (select auth.uid()));
create policy members_read_live_announcements on public.community_announcements for select to authenticated using (publish_at <= now() and (expires_at is null or expires_at > now()));
create policy captains_manage_announcements on public.community_announcements for all to authenticated using (private.is_captain((select auth.uid()))) with check (private.is_captain((select auth.uid())) and created_by = (select auth.uid()));
create policy members_read_system_state on public.community_system_state for select to authenticated using (true);
create policy captains_update_system_state on public.community_system_state for update to authenticated using (private.is_captain((select auth.uid()))) with check (private.is_captain((select auth.uid())));
create policy captains_read_audit on public.captain_audit_log for select to authenticated using (private.is_captain((select auth.uid())));
create policy captains_write_audit on public.captain_audit_log for insert to authenticated with check (private.is_captain((select auth.uid())) and captain_id = (select auth.uid()));
create policy captains_manage_staff_permissions on public.staff_permissions for all to authenticated using (private.is_captain((select auth.uid()))) with check (private.is_captain((select auth.uid())) and updated_by = (select auth.uid()));
create policy call_members_read_chat on public.call_messages for select to authenticated using (private.is_call_member(call_id, (select auth.uid())));
create policy call_members_send_chat on public.call_messages for insert to authenticated with check (sender_id = (select auth.uid()) and private.is_call_member(call_id, (select auth.uid())));
create policy own_call_controls on public.call_participant_controls for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and private.can_access_call(call_id, (select auth.uid())));
create policy call_members_read_controls on public.call_participant_controls for select to authenticated using (private.is_call_member(call_id, (select auth.uid())));

do $$ declare table_name text; begin
  foreach table_name in array array['message_pins','message_reactions','message_read_receipts','friendships','favorite_crew','user_blocks','meetup_participants','community_announcements','community_system_state','call_messages','call_participant_controls'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
