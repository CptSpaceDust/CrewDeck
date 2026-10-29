import { supabase } from "./supabase";

const URL_PATTERN=/(https?:\/\/[^\s<]+|(?:Profile|Conversation|MeetupCalendar|MyMeetups|Ideas|Collab|CommunityTools)\.html\?[^\s<]+)/gi;
export function crewLinks(text=""){return [...new Set(String(text).match(URL_PATTERN)||[])].slice(0,4);}

export async function resolveCrewLink(raw){
  let url;try{url=new URL(raw,"https://www.cptspacedust.com/");}catch{return null;}
  if(!/(^|\.)cptspacedust\.com$/.test(url.hostname)&&url.hostname!=="app.local"&&url.hostname!=="app.cptspacedust.local")return null;
  const path=url.pathname.split("/").pop().replace(/\.html$/i,"").toLowerCase();
  const one=async(table,select,column,id)=>{const{data,error}=await supabase.from(table).select(select).eq(column,id).maybeSingle();if(error)throw error;return data;};
  try{
    if(path==="profile"&&url.searchParams.get("id")){const row=await one("profiles","id,username,bio,avatar,rank","id",url.searchParams.get("id"));return row?{kind:"profile",title:row.username,preview:row.bio||row.rank||"Crew profile",status:row.rank,route:`Profile.html?id=${row.id}`,action:"Open profile"}:null;}
    if(url.searchParams.get("event")){const row=await one("crew_events","id,title,description,status,starts_at","id",url.searchParams.get("event"));return row?{kind:"event",title:row.title,preview:row.description||new Date(row.starts_at).toLocaleString(),status:row.status,route:`MeetupCalendar.html?event=${row.id}`,action:"View event"}:null;}
    if(url.searchParams.get("meetup")){const row=await one("meetup_requests","id,event_title,event_description,meetup_date,start_time,status","id",url.searchParams.get("meetup"));return row?{kind:"meetup",title:row.event_title||"Crew meetup",preview:`${row.meetup_date||""} ${row.start_time||""}`.trim(),status:row.status,route:`MyMeetups.html?meetup=${row.id}`,action:"View meetup"}:null;}
    if(url.searchParams.get("poll")){const row=await one("group_polls","id,group_id,question,closed_at,closes_at","id",url.searchParams.get("poll"));return row?{kind:"poll",title:row.question,preview:row.closed_at?"Voting closed":"Voting open",status:row.closed_at?"closed":"open",route:`Conversation.html?group=${row.group_id}&poll=${row.id}`,action:"Open poll"}:null;}
    if(url.searchParams.get("decision")){const row=await one("group_decisions","id,group_id,decision_text,poll_question,created_at","id",url.searchParams.get("decision"));return row?{kind:"decision",title:"Group decision",preview:row.decision_text,status:"recorded",route:`Conversation.html?group=${row.group_id}&decision=${row.id}`,action:"View decision"}:null;}
    if(url.searchParams.get("post")){const row=await one("community_board_posts","id,board_kind,title,body,status","id",url.searchParams.get("post"));return row?{kind:"post",title:row.title,preview:row.body,status:row.status,route:`${row.board_kind==="idea"?"Ideas":row.board_kind==="collaboration"?"Collab":"CommunityTools"}.html?post=${row.id}`,action:"Open post"}:null;}
    const group=url.searchParams.get("group"),conversation=url.searchParams.get("id"),message=url.searchParams.get("message"),attachment=url.searchParams.get("attachment");
    if(attachment){const row=await one("message_attachments","id,conversation_kind,conversation_id,message_id,file_name,mime_type,created_at","id",attachment);return row?{kind:"file",title:row.file_name||"Shared file",preview:row.mime_type||"CrewDeck attachment",status:"available",route:`Conversation.html?${row.conversation_kind==="group"?"group":"id"}=${row.conversation_id}&message=${row.message_id}`,action:"Open file"}:null;}
    if(message){const table=group?"group_messages":"dm_messages",parent=group||conversation;const row=await one(table,"id,content,created_at,sender_id", "id",message);if(row)return{kind:"message",title:"Crew message",preview:row.content||"Shared attachment",status:new Date(row.created_at).toLocaleString(),route:`Conversation.html?${group?"group":"id"}=${parent}&message=${row.id}`,action:"Open message"};}
    if(group){const row=await one("group_conversations","id,name,description,created_at","id",group);return row?{kind:"group",title:row.name,preview:row.description||"Group conversation",status:"group",route:`Conversation.html?group=${row.id}`,action:"Open group"}:null;}
  }catch{return null;}
  return null;
}

export async function getPreviewDismissals(userId,kind,conversationId,messageId){const{data}=await supabase.from("link_preview_dismissals").select("target_url").eq("user_id",userId).eq("conversation_kind",kind).eq("conversation_id",conversationId).eq("message_id",messageId);return new Set((data||[]).map(item=>item.target_url));}
export async function dismissPreview(userId,kind,conversationId,messageId,targetUrl){const{error}=await supabase.from("link_preview_dismissals").insert({user_id:userId,conversation_kind:kind,conversation_id:conversationId,message_id:messageId,target_url:targetUrl});if(error)throw error;}
