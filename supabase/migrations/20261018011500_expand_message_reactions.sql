alter table public.message_reactions
  drop constraint if exists message_reactions_emoji_check;

alter table public.message_reactions
  add constraint message_reactions_emoji_check
  check (char_length(emoji) between 1 and 16);
