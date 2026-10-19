import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Command, MessageCircle, Settings, Users, Wrench } from "lucide-react";

const commands = [
  ["messages", "Open messages", "Conversations and group chats", MessageCircle],
  ["meetups", "Open meetup calendar", "Plan time with the crew", CalendarDays],
  ["community-calendar", "Open community calendar", "See all community dates", CalendarDays],
  ["crew", "Open crew directory", "Find a community member", Users],
  ["help-requests", "Open help board", "Ask for or claim help", Wrench],
  ["settings", "Open settings", "Appearance, privacy, audio, and notifications", Settings],
];

export default function CommandPalette({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef();
  useEffect(() => {
    const key = (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen((value) => !value); } if (event.key === "Escape") setOpen(false); };
    addEventListener("keydown", key); return () => removeEventListener("keydown", key);
  }, []);
  useEffect(() => { if (open) requestAnimationFrame(() => inputRef.current?.focus()); }, [open]);
  const shown = useMemo(() => commands.filter(([,title,detail]) => `${title} ${detail}`.toLowerCase().includes(query.toLowerCase())), [query]);
  if (!open) return <button className="command-palette-launch" title="Command palette · Ctrl+K" onClick={() => setOpen(true)}><Command /></button>;
  return <div className="command-palette-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}><section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette"><header><Command /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Go anywhere in CrewDeck…" /></header><div>{shown.map(([id,title,detail,Icon]) => <button key={id} onClick={() => { onNavigate(id); setOpen(false); setQuery(""); }}><Icon /><span><strong>{title}</strong><small>{detail}</small></span></button>)}<button onClick={() => { window.desktop.openMessageWindow("Messages.html"); setOpen(false); }}><MessageCircle /><span><strong>Open messages in a new window</strong><small>Keep a conversation beside the rest of CrewDeck</small></span></button></div><footer><span>Ctrl K</span> to open · <span>Esc</span> to close</footer></section></div>;
}
