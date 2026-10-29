import { ExternalLink, Link2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { crewLinks, dismissPreview, getPreviewDismissals, resolveCrewLink } from "../lib/linkPreviews";
import { supabase } from "../lib/supabase";

export default function InternalLinkPreviews({content,userId,kind,conversationId,messageId,onNavigate,canDismiss=false}){
  const [cards,setCards]=useState([]),[revision,setRevision]=useState(0);
  useEffect(()=>{let live=true;const links=crewLinks(content);if(!links.length){setCards([]);return;}Promise.all([getPreviewDismissals(userId,kind,conversationId,messageId),Promise.all(links.map(async url=>({url,card:await resolveCrewLink(url)})))]).then(([hidden,resolved])=>{if(live)setCards(resolved.filter(item=>!hidden.has(item.url)).map(item=>({...item,card:item.card||{kind:"unavailable",title:"CrewDeck content unavailable",preview:"This item was deleted, expired, or is not available to you.",status:"unavailable"}})));});return()=>{live=false;};},[content,userId,kind,conversationId,messageId,revision]);
  useEffect(()=>{const timer=setInterval(()=>setRevision(value=>value+1),30000),channel=supabase.channel(`link-previews-${messageId}`).on("postgres_changes",{event:"*",schema:"public"},()=>setRevision(value=>value+1)).subscribe();return()=>{clearInterval(timer);supabase.removeChannel(channel);};},[messageId]);
  if(!cards.length)return null;
  return <div className="internal-link-previews" aria-label="CrewDeck link previews">{cards.map(({url,card})=><article className="internal-link-card" key={url}><Link2/><span><small>{card.kind} · {card.status}</small><strong>{card.title}</strong><p>{String(card.preview||"").slice(0,220)}</p></span><div>{card.route&&<button onClick={()=>onNavigate?.(card.route)} aria-label={`${card.action}: ${card.title}`}><ExternalLink/>{card.action}</button>}{canDismiss&&<button title="Hide this preview" aria-label={`Hide preview for ${card.title}`} onClick={async()=>{await dismissPreview(userId,kind,conversationId,messageId,url);setCards(current=>current.filter(item=>item.url!==url));}}><X/></button>}</div></article>)}</div>;
}
