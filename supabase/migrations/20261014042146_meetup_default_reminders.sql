create or replace function private.seed_meetup_participant_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' then
    insert into public.meetup_participant_settings (meetup_id, user_id)
    select new.id, participant.user_id
    from unnest(array[new.user_id, new.with_user_id]) participant(user_id)
    where participant.user_id is not null
    on conflict (meetup_id, user_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function private.seed_meetup_participant_settings() from public, anon, authenticated;
drop trigger if exists seed_meetup_participant_settings_trigger on public.meetup_requests;
create trigger seed_meetup_participant_settings_trigger
after insert or update of status on public.meetup_requests
for each row execute function private.seed_meetup_participant_settings();

insert into public.meetup_participant_settings (meetup_id, user_id)
select meetup.id, participant.user_id
from public.meetup_requests meetup
cross join lateral (values (meetup.user_id), (meetup.with_user_id)) participant(user_id)
where meetup.status = 'approved' and participant.user_id is not null
on conflict (meetup_id, user_id) do nothing;
