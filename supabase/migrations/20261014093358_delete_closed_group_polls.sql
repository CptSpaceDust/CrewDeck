create or replace function private.delete_closed_group_poll(poll_key uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target_group uuid;
  poll_is_closed boolean;
begin
  if actor is null then
    raise exception 'Sign in to delete a poll';
  end if;

  select poll.group_id,
         (poll.closed_at is not null or (poll.closes_at is not null and poll.closes_at <= now()))
    into target_group, poll_is_closed
    from public.group_polls poll
   where poll.id = poll_key;

  if target_group is null then
    raise exception 'Poll not found';
  end if;

  if not exists (
    select 1
      from public.group_conversations conversation
     where conversation.id = target_group
       and conversation.owner_id = actor
  ) then
    raise exception 'Only the group owner can delete polls';
  end if;

  if not poll_is_closed then
    raise exception 'Close the poll before deleting it';
  end if;

  delete from public.group_polls where id = poll_key;
  return found;
end
$$;

revoke all on function private.delete_closed_group_poll(uuid) from public, anon, authenticated;
grant execute on function private.delete_closed_group_poll(uuid) to authenticated, service_role;

create or replace function public.delete_closed_group_poll(poll_key uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.delete_closed_group_poll(poll_key)
$$;

revoke all on function public.delete_closed_group_poll(uuid) from public, anon;
grant execute on function public.delete_closed_group_poll(uuid) to authenticated, service_role;
