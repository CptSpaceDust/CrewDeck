import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, MonitorUp, Phone, PhoneOff, Search, Send, Users } from "lucide-react";
import { Room, RoomEvent, Track } from "livekit-client";
import { getConversations, getMessages, getOrCreateConversation, sendMessage } from "../lib/data";
import { supabase } from "../lib/supabase";
import { Avatar, Empty, ErrorState, Loading, PageHeader } from "../components/ui";

function VoiceCall({ conversation, user, onClose, requestedCallId }) {
  const [status,setStatus]=useState("Connecting to voice room…"); const[muted,setMuted]=useState(false); const[sharing,setSharing]=useState(false); const[participants,setParticipants]=useState([]); const roomRef=useRef();
  useEffect(()=>{let disposed=false;let heartbeat;async function join(){try{
    const contextId=conversation.id; let callId=requestedCallId; let existing;
    ({data:existing}=await supabase.from("active_voice_calls").select("call_id,last_active_at").eq("dm_conversation_id",contextId).maybeSingle());
    const fresh=existing&&Date.now()-new Date(existing.last_active_at).getTime()<90000;
    if(fresh)callId=existing.call_id; else {callId=callId||crypto.randomUUID();await supabase.from("active_voice_calls").delete().eq("dm_conversation_id",contextId);const{error}=await supabase.from("active_voice_calls").insert({call_id:callId,dm_conversation_id:contextId,started_by:user.id,last_active_at:new Date().toISOString()});if(error)throw error;}
    const{data,error}=await supabase.functions.invoke("livekit-voice-token",{body:{conversationId:contextId,callId}});if(error||!data?.serverUrl)throw error||new Error("Voice service is unavailable.");
    const room=new Room({adaptiveStream:true,dynacast:true});roomRef.current=room;
    const refresh=()=>setParticipants([room.localParticipant,...room.remoteParticipants.values()]);
    room.on(RoomEvent.ParticipantConnected,refresh);room.on(RoomEvent.ParticipantDisconnected,refresh);
    room.on(RoomEvent.TrackSubscribed,(track)=>{if(track.kind===Track.Kind.Audio){const el=track.attach();el.autoplay=true;document.body.appendChild(el)}});
    await room.connect(data.serverUrl,data.participantToken);await room.localParticipant.setMicrophoneEnabled(true);if(disposed)return;refresh();setStatus("Voice call connected");
    heartbeat=setInterval(()=>supabase.from("active_voice_calls").update({last_active_at:new Date().toISOString()}).eq("call_id",callId),15000);
    if(!fresh){const peer=conversation.person;await supabase.rpc("create_notification",{target_user_id:peer.id,notification_type:"voice_call",notification_title:"Incoming voice call",notification_message:`${conversation.meName||"A crew member"} wants to call you!`,notification_link:`Messages?conversation=${contextId}&call=${callId}`});}
  }catch(e){setStatus(e.message||"The call could not connect.")}}join();return()=>{disposed=true;clearInterval(heartbeat);roomRef.current?.disconnect();document.querySelectorAll("audio[data-livekit]").forEach(e=>e.remove())}},[]);
  async function toggleMic(){const next=!muted;await roomRef.current?.localParticipant.setMicrophoneEnabled(!next);setMuted(next)}
  async function toggleShare(){const next=!sharing;await roomRef.current?.localParticipant.setScreenShareEnabled(next);setSharing(next)}
  return <div className="call-overlay"><section className="call-panel"><div className="call-glow"/><Avatar profile={conversation.person} size={96}/><span className="eyebrow">Private voice channel</span><h2>{conversation.person?.username||"Crew member"}</h2><p>{status}</p><div className="participant-count"><Users/>{participants.length} connected</div><div className="call-actions"><button className={muted?"call-button active":"call-button"} onClick={toggleMic}>{muted?<MicOff/>:<Mic/>}</button><button className={sharing?"call-button active":"call-button"} onClick={toggleShare}><MonitorUp/></button><button className="call-button hangup" onClick={onClose}><PhoneOff/></button></div></section></div>;
}

export default function MessagesPage({ user, profile, initialPerson, route }) {
  const [conversations,setConversations]=useState([]); const[selected,setSelected]=useState(null);const[messages,setMessages]=useState([]);const[loading,setLoading]=useState(true);const[error,setError]=useState("");const[call,setCall]=useState(null);const endRef=useRef();
  async function loadConversations(){try{const items=await getConversations(user.id);setConversations(items);if(!selected&&items.length)setSelected(items[0])}catch(e){setError(e.message)}finally{setLoading(false)}}
  useEffect(()=>{loadConversations()},[]);
  useEffect(()=>{if(!initialPerson)return;(async()=>{const id=await getOrCreateConversation(user.id,initialPerson.id);await loadConversations();const items=await getConversations(user.id);setSelected(items.find(i=>i.id===id)||{id,person:initialPerson})})()},[initialPerson?.id]);
  useEffect(()=>{if(!route?.conversation||!conversations.length)return;const found=conversations.find(c=>c.id===route.conversation);if(found){setSelected(found);if(route.call)setCall({conversation:found,callId:route.call})}},[route?.conversation,conversations.length]);
  useEffect(()=>{if(!selected)return;let live=true;getMessages(selected.id).then(data=>live&&setMessages(data));const channel=supabase.channel(`desktop-dm-${selected.id}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"dm_messages",filter:`conversation_id=eq.${selected.id}`},({new:item})=>setMessages(previous=>previous.some(m=>m.id===item.id)?previous:[...previous,item])).subscribe();return()=>{live=false;supabase.removeChannel(channel)}},[selected?.id]);
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"})},[messages.length]);
  async function send(event){event.preventDefault();const input=event.currentTarget.elements.message;const content=input.value.trim();if(!content)return;input.value="";await sendMessage(selected.id,user.id,content)}
  if(loading)return <div className="page"><Loading/></div>;if(error)return <div className="page"><ErrorState message={error} retry={loadConversations}/></div>;
  return <div className="page messages-page"><PageHeader eyebrow="Crew comms" title="Messages" description="Private conversations and voice calls, built directly into your desktop."/>
  <div className="messages-layout"><aside className="panel conversation-list"><div className="conversation-search"><Search/><input placeholder="Search conversations"/></div>{conversations.map(item=><button className={selected?.id===item.id?"conversation active":"conversation"} onClick={()=>setSelected(item)} key={item.id}><Avatar profile={item.person}/><span><strong>{item.person?.username||"Crew member"}</strong><small>{item.person?.online?"Online":"Offline"}</small></span></button>)}</aside>
  <section className="panel chat-panel">{selected?<><header className="chat-header"><div className="card-person"><Avatar profile={selected.person}/><div><h3>{selected.person?.username||"Crew member"}</h3><span className="rank">{selected.person?.rank||"Crew"}</span></div></div><button className="icon-button call" onClick={()=>setCall({conversation:selected})}><Phone/></button></header><div className="message-stream">{messages.map(item=><div className={item.sender_id===user.id?"message mine":"message"} key={item.id}><p>{item.content}</p><time>{new Date(item.created_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</time></div>)}<div ref={endRef}/></div><form className="composer" onSubmit={send}><textarea name="message" rows="1" maxLength="900" placeholder={`Message ${selected.person?.username||"crew member"}`}/><button className="send-button"><Send/></button></form></>:<Empty title="Choose a conversation" body="Select someone from the left to open your messages."/>}</section></div>{call&&<VoiceCall conversation={{...call.conversation,meName:profile.username}} user={user} requestedCallId={call.callId} onClose={()=>setCall(null)}/>}</div>;
}
