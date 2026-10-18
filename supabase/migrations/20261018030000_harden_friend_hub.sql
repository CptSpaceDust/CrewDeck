create index if not exists friend_details_friend_id_idx on public.friend_details(friend_id);

alter function public.get_friend_insights(uuid) set schema private;
alter function public.get_friend_highlights(uuid) set schema private;
alter function public.get_friend_recommendations(integer) set schema private;
alter function public.get_friend_activity_feed(integer) set schema private;

revoke all on function private.get_friend_insights(uuid), private.get_friend_highlights(uuid), private.get_friend_recommendations(integer), private.get_friend_activity_feed(integer) from public, anon, authenticated;
grant execute on function private.get_friend_insights(uuid), private.get_friend_highlights(uuid), private.get_friend_recommendations(integer), private.get_friend_activity_feed(integer) to authenticated, service_role;

create function public.get_friend_insights(target_friend_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_friend_insights(target_friend_id) $$;

create function public.get_friend_highlights(target_friend_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_friend_highlights(target_friend_id) $$;

create function public.get_friend_recommendations(result_limit integer default 12)
returns table(id uuid, username text, avatar text, rank text, favorite_game text, mutual_count bigint, reason text)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_friend_recommendations(result_limit) $$;

create function public.get_friend_activity_feed(result_limit integer default 30)
returns table(kind text, item_id uuid, friend_id uuid, username text, avatar text, title text, summary text, happened_at timestamptz, link text)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_friend_activity_feed(result_limit) $$;

revoke all on function public.get_friend_insights(uuid), public.get_friend_highlights(uuid), public.get_friend_recommendations(integer), public.get_friend_activity_feed(integer) from public, anon, authenticated;
grant execute on function public.get_friend_insights(uuid), public.get_friend_highlights(uuid), public.get_friend_recommendations(integer), public.get_friend_activity_feed(integer) to authenticated, service_role;
