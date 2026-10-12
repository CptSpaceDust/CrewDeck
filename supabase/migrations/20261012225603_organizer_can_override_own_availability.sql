create or replace function public.validate_meetup_schedule()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  requested_start timestamptz;
  requested_end timestamptz;
  selected_day_start timestamptz;
  selected_day_end timestamptz;
begin
  if new.with_user_id is not null and new.with_user_id = new.user_id then
    raise exception 'Choose another crew member for this meetup.';
  end if;

  requested_start := (new.meetup_date + new.start_time) at time zone new.time_zone;
  requested_end := requested_start + make_interval(hours => new.duration);
  selected_day_start := new.meetup_date::timestamp at time zone new.time_zone;
  selected_day_end := (new.meetup_date + 1)::timestamp at time zone new.time_zone;

  if requested_end > selected_day_end then
    raise exception 'Choose a start time that ends before midnight.';
  end if;

  if exists (
    select 1
    from public.meetup_availability_blocks block
    where (
        block.user_id = new.with_user_id
        or (block.user_id = new.user_id and not block.indefinite)
      )
      and tstzrange(
        case
          when block.all_day then block.block_date::timestamp at time zone block.time_zone
          else (block.block_date + block.start_time) at time zone block.time_zone
        end,
        case
          when block.indefinite then 'infinity'::timestamptz
          when block.all_day then (block.block_date + 1)::timestamp at time zone block.time_zone
          else (block.block_date + block.end_time) at time zone block.time_zone
        end,
        '[)'
      ) && tstzrange(requested_start, requested_end, '[)')
  ) then
    raise exception 'That time overlaps unavailable hours. Choose another time.';
  end if;

  if exists (
    select 1
    from public.meetup_requests existing
    where existing.id <> new.id
      and existing.status = 'approved'
      and ((existing.meetup_date + existing.start_time) at time zone existing.time_zone) >= selected_day_start
      and ((existing.meetup_date + existing.start_time) at time zone existing.time_zone) < selected_day_end
      and (
        existing.user_id in (new.user_id, new.with_user_id)
        or existing.with_user_id in (new.user_id, new.with_user_id)
      )
  ) then
    raise exception 'One of you already has an approved meetup that day.';
  end if;

  if new.status = 'approved'
     and new.with_user_id is not null
     and new.invitee_status <> 'accepted' then
    raise exception 'The invited member must accept before this meetup can be approved.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_meetup_schedule() from public, anon, authenticated;