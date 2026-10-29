import { supabase } from "./supabase";

const FILTERS = /(?:^|\s)(from|before|after|in|has|is|mentions):([^\s]+)/gi;

export function parseCrewSearch(value = "") {
  const filters = {};
  const text = String(value).replace(FILTERS, (_all, key, term) => {
    (filters[key.toLowerCase()] ||= []).push(term.replace(/^['"]|['"]$/g, ""));
    return " ";
  }).replace(/\s+/g, " ").trim();
  return { text, filters };
}

function result(kind, id, title, preview, route, createdAt, source, extra = {}) {
  return { kind, id, title, preview, route, createdAt, source, ...extra };
}

function highlightQuery(query, column = "content") {
  const text = query.text.replace(/[%_,()]/g, " ").trim();
  return text ? (builder) => builder.ilike(column, `%${text}%`) : (builder) => builder;
}

export async function searchCrewDeck(rawQuery, { limit = 12, offset = 0 } = {}) {
  const query = parseCrewSearch(rawQuery);
  if (!query.text && !Object.keys(query.filters).length) return [];
  const { data: auth } = await supabase.auth.getUser();
  const viewerId = auth.user?.id;
  const text = query.text || query.filters.from?.[0] || "";
  const date = (builder, column = "created_at") => {
    if (query.filters.before?.[0]) builder = builder.lt(column, query.filters.before[0]);
    if (query.filters.after?.[0]) builder = builder.gt(column, query.filters.after[0]);
    return builder.range(offset, offset + limit - 1);
  };
  const searches = [
    ["people", date(highlightQuery(query, "username")(supabase.from("profiles").select("id,username,bio,avatar,updated_at")).order("username"), "updated_at")],
    ["dm", date(highlightQuery(query)(supabase.from("dm_messages").select("id,conversation_id,sender_id,content,created_at,reply_to_id")).order("created_at", { ascending:false }))],
    ["group-message", date(highlightQuery(query)(supabase.from("group_messages").select("id,group_id,sender_id,content,created_at,reply_to_id")).order("created_at", { ascending:false }))],
    ["attachments", date(highlightQuery(query, "file_name")(supabase.from("message_attachments").select("id,conversation_kind,conversation_id,message_id,file_name,mime_type,created_at")).order("created_at", { ascending:false }))],
    ["meetups", date(highlightQuery(query, "event_title")(supabase.from("meetup_requests").select("id,kind,event_title,event_description,meetup_date,start_time,status,created_at")).order("meetup_date", { ascending:false }))],
    ["events", date(highlightQuery(query, "title")(supabase.from("crew_events").select("id,title,description,status,starts_at,created_at")).order("starts_at", { ascending:false }))],
    ["polls", date(highlightQuery(query, "question")(supabase.from("group_polls").select("id,group_id,question,closed_at,created_at")).order("created_at", { ascending:false }))],
    ["decisions", date(highlightQuery(query, "decision_text")(supabase.from("group_decisions").select("id,group_id,decision_text,poll_question,created_at")).order("created_at", { ascending:false }))],
    ["community", date(highlightQuery(query, "title")(supabase.from("community_board_posts").select("id,board_kind,title,body,status,created_at").is("archived_at", null)).order("created_at", { ascending:false }))],
    ["groups", date(highlightQuery(query, "name")(supabase.from("group_conversations").select("id,name,description,created_at")).order("created_at", { ascending:false }))],
    ["announcements", date(highlightQuery(query, "title")(supabase.from("community_announcements").select("id,title,body,publish_at,created_at").lte("publish_at", new Date().toISOString())).order("publish_at", { ascending:false }))],
  ];
  const settled = await Promise.allSettled(searches.map(([, request]) => request));
  const rows = [];
  settled.forEach((state, index) => {
    if (state.status !== "fulfilled" || state.value.error) return;
    const type = searches[index][0];
    for (const item of state.value.data || []) {
      if (query.filters["has"]?.includes("file") && type !== "attachments") continue;
      if (query.filters["has"]?.includes("poll") && type !== "polls") continue;
      if (query.filters["in"]?.length && !query.filters["in"].some((value) => type.includes(value.toLowerCase()))) continue;
      if (type === "people") rows.push(result(type,item.id,item.username,item.bio || "Crew profile",`Profile.html?id=${item.id}`,item.updated_at,"Crew Directory"));
      else if (type === "dm") rows.push(result(type,item.id,"Direct message",item.content,`Conversation.html?id=${item.conversation_id}&message=${item.id}`,item.created_at,"Messages",{ senderId:item.sender_id }));
      else if (type === "group-message") rows.push(result(type,item.id,"Group message",item.content,`Conversation.html?group=${item.group_id}&message=${item.id}`,item.created_at,"Group Messages",{ senderId:item.sender_id }));
      else if (type === "attachments") rows.push(result(type,item.id,item.file_name,item.mime_type,`Conversation.html?${item.conversation_kind === "group" ? "group" : "id"}=${item.conversation_id}&message=${item.message_id}`,item.created_at,"Shared Files"));
      else if (type === "meetups") rows.push(result(type,item.id,item.event_title || "Crew meetup",`${item.meetup_date || ""} · ${item.status || ""}`,`MyMeetups.html?meetup=${item.id}`,item.created_at,"Meetups"));
      else if (type === "events") rows.push(result(type,item.id,item.title,item.description || item.status,`MeetupCalendar.html?event=${item.id}`,item.created_at,"Events"));
      else if (type === "polls") rows.push(result(type,item.id,item.question,item.closed_at ? "Closed poll" : "Open poll",`Conversation.html?group=${item.group_id}&poll=${item.id}`,item.created_at,"Polls"));
      else if (type === "decisions") rows.push(result(type,item.id,item.decision_text,item.poll_question,`Conversation.html?group=${item.group_id}&decision=${item.id}`,item.created_at,"Decisions"));
      else if (type === "community") rows.push(result(type,item.id,item.title,item.body,`${item.board_kind === "collaboration" ? "Collab" : item.board_kind === "idea" ? "Ideas" : "CommunityTools"}.html?post=${item.id}`,item.created_at,`${item.board_kind} board`,{ status:item.status }));
      else if (type === "groups") rows.push(result(type,item.id,item.name,item.description || "Group conversation",`Conversation.html?group=${item.id}`,item.created_at,"Groups"));
      else rows.push(result(type,item.id,item.title,item.body,"Home.html",item.created_at,"Announcements"));
    }
  });
  const messageRows=rows.filter(item=>item.kind==="dm"||item.kind==="group-message");
  if(viewerId&&query.filters.mentions?.includes("me")){
    const{data}=await supabase.from("message_mentions").select("message_id").eq("mentioned_user_id",viewerId).in("message_id",messageRows.map(item=>item.id));
    const allowed=new Set((data||[]).map(item=>item.message_id));
    for(let index=rows.length-1;index>=0;index--)if(["dm","group-message"].includes(rows[index].kind)&&!allowed.has(rows[index].id))rows.splice(index,1);
  }
  if(query.filters.is?.includes("pinned")){
    const{data}=await supabase.from("message_pins").select("message_id").in("message_id",messageRows.map(item=>item.id));
    const allowed=new Set((data||[]).map(item=>item.message_id));
    for(let index=rows.length-1;index>=0;index--)if(["dm","group-message"].includes(rows[index].kind)&&!allowed.has(rows[index].id))rows.splice(index,1);
  }
  if(viewerId&&query.filters.is?.includes("unread")){
    const{data}=await supabase.from("conversation_read_positions").select("conversation_kind,conversation_id,last_read_created_at,unread_from_created_at").eq("user_id",viewerId);
    const positions=new Map((data||[]).map(item=>[`${item.conversation_kind}:${item.conversation_id}`,item]));
    for(let index=rows.length-1;index>=0;index--){const item=rows[index];if(!["dm","group-message"].includes(item.kind))continue;const parsed=new URL(item.route,"https://crewdeck.local"),kind=item.kind==="dm"?"dm":"group",id=parsed.searchParams.get(kind==="dm"?"id":"group"),position=positions.get(`${kind}:${id}`),cutoff=position?.unread_from_created_at||position?.last_read_created_at;if(cutoff&&new Date(item.createdAt)<=new Date(cutoff))rows.splice(index,1);}
  }
  if (query.filters.from?.length) {
    const { data: profiles } = await supabase.from("profiles").select("id").in("username", query.filters.from);
    const ids = new Set((profiles || []).map((item) => item.id));
    return rows.filter((item) => !item.senderId || ids.has(item.senderId)).slice(0, 80);
  }
  return rows.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0,80);
}

export function loadRecentSearches(userId){try{return JSON.parse(localStorage.getItem(`crew-search-recent:${userId}`)||"[]");}catch{return[];}}
export function rememberCrewSearch(userId,query){if(!userId||!query.trim())return[];const recent=[query.trim(),...loadRecentSearches(userId).filter(item=>item!==query.trim())].slice(0,8);localStorage.setItem(`crew-search-recent:${userId}`,JSON.stringify(recent));return recent;}

export async function loadSavedSearches(userId) {
  const { data, error } = await supabase.from("saved_crew_searches").select("*").eq("user_id",userId).order("created_at",{ascending:false});
  if (error) throw error; return data || [];
}

export async function saveCrewSearch(userId, name, query) {
  const { error } = await supabase.from("saved_crew_searches").upsert({user_id:userId,name:name.trim(),query:query.trim()},{onConflict:"user_id,name"});
  if (error) throw error;
}

export async function deleteCrewSearch(id, userId) {
  const { error } = await supabase.from("saved_crew_searches").delete().eq("id",id).eq("user_id",userId); if(error) throw error;
}
