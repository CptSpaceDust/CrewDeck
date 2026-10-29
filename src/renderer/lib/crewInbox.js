import { supabase } from "./supabase";

export function inboxCategory(item) {
  const type=String(item.type||"").toLowerCase();
  if(type.includes("message")||type.includes("mention")||type.includes("reaction"))return "messages";
  if(type.includes("call"))return "calls";
  if(type.includes("meetup")||type.includes("event"))return "meetups";
  if(type.includes("friend"))return "friends";
  if(/moderation|restriction|warning|appeal/.test(type))return "moderation";
  return "community";
}

export async function getCrewInbox(userId){
  const [{data:notifications,error},{data:states}]=await Promise.all([
    supabase.from("notifications").select("*").eq("user_id",userId).order("created_at",{ascending:false}).limit(250),
    supabase.from("crew_inbox_state").select("*").eq("user_id",userId),
  ]);if(error)throw error;const byId=Object.fromEntries((states||[]).map(row=>[row.notification_id,row]));const now=Date.now();return (notifications||[]).map(item=>({...item,inbox_state:byId[item.id]||null,category:inboxCategory(item)})).filter(item=>!item.inbox_state?.dismissed_at&&(!item.inbox_state?.snoozed_until||new Date(item.inbox_state.snoozed_until).getTime()<=now));
}

export async function saveInboxState(userId,notificationId,changes){const {error}=await supabase.from("crew_inbox_state").upsert({user_id:userId,notification_id:notificationId,...changes,updated_at:new Date().toISOString()},{onConflict:"user_id,notification_id"});if(error)throw error;}
export async function bulkInbox(userId,ids,action){if(!ids.length)return;if(action==="read"){const{error}=await supabase.from("notifications").update({is_read:true}).eq("user_id",userId).in("id",ids);if(error)throw error;return;}await Promise.all(ids.map(id=>saveInboxState(userId,id,action==="dismiss"?{dismissed_at:new Date().toISOString()}:{saved_for_later:true})));}

export async function performInboxAction(item,action,userId){
  const data=item.action_data||{};
  if(action==="meetup"&&data.meetup_id){const rpc=data.group_meetup?"respond_to_group_meetup_invitation":"respond_to_meetup_invitation";const{error}=await supabase.rpc(rpc,{target_meetup_id:data.meetup_id,response:data.response||"accepted"});if(error)throw new Error("This meetup invitation is no longer available.");}
  else if(action==="event"&&data.event_id){const{data:event,error}=await supabase.from("crew_events").select("id,rsvp_deadline,status").eq("id",data.event_id).maybeSingle();if(error||!event||event.status!=="published"||event.rsvp_deadline&&new Date(event.rsvp_deadline)<new Date())throw new Error("This event response is no longer available.");const{error:save}=await supabase.rpc("respond_to_crew_event",{event_key:data.event_id,new_response:data.response||"attending"});if(save)throw save;}
  else if(action==="friend"&&data.requester_id){const{data:request,error}=await supabase.from("friendships").select("*").eq("requester_id",data.requester_id).eq("addressee_id",userId).maybeSingle();if(error||!request||request.status!=="pending")throw new Error("This friend request is no longer pending.");const response=data.response||"accepted";const{error:save}=await supabase.from("friendships").update({status:response,accepted_at:response==="accepted"?new Date().toISOString():null}).eq("requester_id",data.requester_id).eq("addressee_id",userId);if(save)throw save;}
  else if(action==="poll"&&data.poll_id&&data.option_id){const{data:poll,error}=await supabase.from("group_polls").select("id,closed_at,closes_at").eq("id",data.poll_id).maybeSingle();if(error||!poll||poll.closed_at||poll.closes_at&&new Date(poll.closes_at)<new Date())throw new Error("This poll is closed or unavailable.");const{error:save}=await supabase.from("group_poll_votes").upsert({poll_id:data.poll_id,option_id:data.option_id,user_id:userId},{onConflict:"poll_id,user_id"});if(save)throw save;}
  else throw new Error("This action is no longer available. Open the item for current details.");
  await supabase.from("notifications").update({is_read:true}).eq("id",item.id).eq("user_id",userId);
}
