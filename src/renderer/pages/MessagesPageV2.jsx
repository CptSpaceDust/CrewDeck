import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  CheckCheck,
  BellOff,
  BellRing,
  BarChart3,
  Edit3,
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  Hand,
  Hash,
  Headphones,
  MessageCircle,
  Monitor,
  MonitorUp,
  MoreVertical,
  Phone,
  PhoneOff,
  Plus,
  Reply,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import EditMessageButton from "../components/EditMessageButton";
import GroupPolls, { InlineGroupPoll } from "../components/GroupPolls";
import {
  ConversationDetails,
  ConversationNotificationControl,
  MessageFeatureBar,
  PinnedMessages,
  useConversationFeatures,
} from "../components/ConversationFeatures";
import { confirmInApp, promptInApp } from "../components/InAppDialog";
import MessageComposer, {
  FormattedMessage,
  MessageNotices,
  MessageReplyQuote,
} from "../components/MessageComposer";
import {
  recordDirectMessageBurst,
  scrollMessageStream,
} from "../lib/messageBehavior.mjs";
import { Room, RoomEvent, Track } from "livekit-client";
import {
  changeGroupAvatar,
  createGroupConversation,
  deleteDirectConversation,
  deleteGroupMessage,
  deleteMessage,
  editGroupMessage,
  editMessage,
  getConversations,
  getGroupConversations,
  getGroupDetails,
  getPendingGroupInvites,
  getGroupMessages,
  getMessageRequests,
  getMessages,
  getProfiles,
  leaveGroupConversation,
  manageGroupMember,
  requestConversation,
  renameGroupConversation,
  updateGroupConversationSettings,
  respondToMessageRequest,
  respondToGroupInvite,
  restrictionMessage,
  sendGroupMessage,
  sendMessage,
} from "../lib/data";
import { supabase } from "../lib/supabase";
import { playCallEventSound, startRingtone, stopRingtone } from "../lib/sounds";
import { changeGroupRole, markMessageRead } from "../lib/crewFeatures";
import {
  conversationUnreadCount,
  getPreferences,
  isMuted,
  markAllConversationsRead,
  markConversationRead,
  setMuted,
} from "../lib/preferences";
import {
  Avatar,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeader,
} from "../components/ui";

let callAudioContext;

function playCallTone(type) {
  try {
    callAudioContext ||= new (window.AudioContext ||
      window.webkitAudioContext)();
    if (callAudioContext.state === "suspended") callAudioContext.resume();
    const notes = {
      ring: [
        [440, 0],
        [554, 0.16],
      ],
      join: [
        [523, 0],
        [659, 0.11],
        [784, 0.22],
      ],
      leave: [
        [659, 0],
        [523, 0.13],
        [392, 0.26],
      ],
      toggle: [
        [620, 0],
        [760, 0.07],
      ],
      share: [
        [392, 0],
        [523, 0.1],
        [698, 0.2],
      ],
    }[type] || [[520, 0]];
    const now = callAudioContext.currentTime;
    notes.forEach(([frequency, offset], index) => {
      const oscillator = callAudioContext.createOscillator();
      const gain = callAudioContext.createGain();
      oscillator.type = type === "ring" ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + offset + (type === "ring" ? 0.28 : 0.13),
      );
      oscillator.connect(gain).connect(callAudioContext.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + (type === "ring" ? 0.3 : 0.15));
      if (index === notes.length - 1)
        oscillator.onended = () => oscillator.disconnect();
    });
  } catch {
    /* Sounds are an enhancement; a call must still work without them. */
  }
}

function participantProfile(participant, local = false) {
  let metadata = {};
  try {
    metadata = JSON.parse(participant?.metadata || "{}");
  } catch {
    /* Ignore malformed optional metadata. */
  }
  return {
    username: participant?.name || (local ? "You" : "Crew member"),
    avatar: metadata.avatar || "",
  };
}

function ScreenShareTile({ item }) {
  const videoRef = useRef();
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !item.track) return;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    item.track.attach(video);
    video.play().catch(() => {});
    return () => {
      item.track.detach(video);
      video.srcObject = null;
    };
  }, [item.track]);
  return (
    <article className="call-screen-card">
      <header>
        <span>
          <Monitor /> {item.name} is sharing
        </span>
        <button
          title="View shared screen fullscreen"
          onClick={() => videoRef.current?.requestFullscreen?.()}
        >
          <Maximize2 />
        </button>
      </header>
      <video ref={videoRef} autoPlay playsInline muted />
    </article>
  );
}

function DeleteMessageDialog({ message, onClose, onDelete }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function closeAndRestoreFocus() {
    onClose();
    requestAnimationFrame(() =>
      document.querySelector(".chat-panel .composer textarea")?.focus(),
    );
  }

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(message);
      closeAndRestoreFocus();
    } catch (exception) {
      setError(exception.message || "The message could not be deleted.");
      setBusy(false);
    }
  }

  return (
    <Modal title="Delete message?" onClose={closeAndRestoreFocus}>
      <p className="modal-copy">
        This message will be permanently removed from the conversation.
      </p>
      {error && <p className="form-message error">{error}</p>}
      <div className="modal-actions">
        <button
          type="button"
          className="button ghost"
          onClick={closeAndRestoreFocus}
          disabled={busy}
          autoFocus
        >
          Keep message
        </button>
        <button
          type="button"
          className="button danger"
          onClick={confirmDelete}
          disabled={busy}
        >
          <Trash2 /> {busy ? "Deleting…" : "Delete message"}
        </button>
      </div>
    </Modal>
  );
}

export function VoiceCall({ conversation, user, onClose, requestedCallId }) {
  const callPreferences = getPreferences();
  const pushToTalkCode = callPreferences.pushToTalkKey || "Space";
  const pushToTalkLabel =
    { Space: "Space", KeyV: "V", Backquote: "`", CapsLock: "Caps Lock" }[
      pushToTalkCode
    ] || "Space";
  const [status, setStatus] = useState("Preparing your secure voice room…");
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [busyControl, setBusyControl] = useState("");
  const [participants, setParticipants] = useState([]);
  const [speaking, setSpeaking] = useState(new Set());
  const [screens, setScreens] = useState([]);
  const [duration, setDuration] = useState("00:00");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [sources, setSources] = useState(null);
  const [sourceError, setSourceError] = useState("");
  const [volumes, setVolumes] = useState({});
  const [inputDevice] = useState(callPreferences.audioInputDeviceId || "");
  const [outputDevice] = useState(callPreferences.audioOutputDeviceId || "");
  const [pushToTalk, setPushToTalk] = useState(
    Boolean(callPreferences.pushToTalkDefault),
  );
  const [joinRequested, setJoinRequested] = useState(
    callPreferences.voiceCheckBeforeJoining === false,
  );
  const [micTest, setMicTest] = useState({
    running: false,
    level: 0,
    message: "Test your microphone before joining.",
  });
  const [qualities, setQualities] = useState({});
  const [activeCallId, setActiveCallId] = useState("");
  const [deafened, setDeafened] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [callChatOpen, setCallChatOpen] = useState(false);
  const [callMessages, setCallMessages] = useState([]);
  const [participantControls, setParticipantControls] = useState([]);
  const [minimized, setMinimized] = useState(false);
  const [compactPosition, setCompactPosition] = useState(() => ({
    x: Math.max(18, window.innerWidth - 118),
    y: Math.max(18, window.innerHeight - 138),
  }));
  const dragRef = useRef(null);
  const roomRef = useRef();
  const callRef = useRef();
  const startedAtRef = useRef(0);
  const audioElementsRef = useRef(new Map());
  const mutedBeforeDeafenRef = useRef(false);

  const callTitle =
    conversation.type === "group"
      ? conversation.name
      : conversation.person?.username || "Crew member";

  function beginCompactDrag(event) {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: compactPosition.x,
      originY: compactPosition.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function moveCompactCall(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX,
      dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    setCompactPosition({
      x: Math.max(10, Math.min(window.innerWidth - 104, drag.originX + dx)),
      y: Math.max(10, Math.min(window.innerHeight - 118, drag.originY + dy)),
    });
  }
  function finishCompactDrag() {
    const moved = dragRef.current?.moved;
    dragRef.current = null;
    if (!moved) setMinimized(false);
  }

  async function testMicrophone() {
    setMicTest({
      running: true,
      level: 0,
      message: "Listening… speak normally.",
    });
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: inputDevice ? { exact: inputDevice } : undefined,
          echoCancellation: callPreferences.echoCancellation !== false,
          noiseSuppression: callPreferences.noiseSuppression !== false,
          autoGainControl: callPreferences.autoGainControl !== false,
        },
      });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      let peak = 0;
      const started = performance.now();
      while (performance.now() - started < 2800) {
        analyser.getByteFrequencyData(values);
        peak = Math.max(
          peak,
          values.reduce((sum, value) => sum + value, 0) / values.length,
        );
        setMicTest((current) => ({
          ...current,
          level: Math.min(100, Math.round((peak / 90) * 100)),
        }));
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      await context.close();
      setMicTest({
        running: false,
        level: Math.min(100, Math.round((peak / 90) * 100)),
        message:
          peak > 5
            ? "Microphone sounds ready."
            : "No microphone audio detected. Check your input and permission.",
      });
    } catch {
      setMicTest({
        running: false,
        level: 0,
        message:
          "Microphone test failed. Check your permission and selected input.",
      });
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }

  useEffect(() => {
    if (!joinRequested) return undefined;
    let disposed = false;
    let heartbeat;
    let ringback;
    let timer;
    async function join() {
      try {
        startRingtone();
        ringback = true;
        const blocked = await restrictionMessage(user.id, "calls");
        if (blocked) throw new Error(blocked);
        const isGroup = conversation.type === "group";
        const contextColumn = isGroup
          ? "group_conversation_id"
          : "dm_conversation_id";
        const contextId = conversation.id;
        let callId = requestedCallId;
        const { data: existing } = await supabase
          .from("active_voice_calls")
          .select("call_id,last_active_at")
          .eq(contextColumn, contextId)
          .maybeSingle();
        const fresh =
          existing &&
          Date.now() - new Date(existing.last_active_at).getTime() < 90000;
        if (fresh) callId = existing.call_id;
        else {
          callId ||= crypto.randomUUID();
          if (existing)
            await supabase
              .from("active_voice_calls")
              .delete()
              .eq("call_id", existing.call_id);
          const { error } = await supabase.from("active_voice_calls").insert({
            call_id: callId,
            dm_conversation_id: isGroup ? null : contextId,
            group_conversation_id: isGroup ? contextId : null,
            started_by: user.id,
            last_active_at: new Date().toISOString(),
          });
          if (error) throw error;
        }
        callRef.current = callId;
        setActiveCallId(callId);
        const { data, error } = await supabase.functions.invoke(
          "livekit-voice-token",
          {
            body: isGroup
              ? { groupId: contextId, callId }
              : { conversationId: contextId, callId },
          },
        );
        if (error || !data?.serverUrl || !data?.participantToken)
          throw error || new Error("Voice service is unavailable.");
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          disconnectOnPageLeave: true,
        });
        roomRef.current = room;
        const refresh = () => {
          if (disposed) return;
          setParticipants([
            room.localParticipant,
            ...room.remoteParticipants.values(),
          ]);
          setMuted(!room.localParticipant.isMicrophoneEnabled);
        };
        const refreshScreens = () => {
          const items = [];
          const all = [
            [room.localParticipant, true],
            ...Array.from(room.remoteParticipants.values()).map((person) => [
              person,
              false,
            ]),
          ];
          all.forEach(([person, local]) => {
            const publication = person.getTrackPublication?.(
              Track.Source.ScreenShare,
            );
            if (publication?.track)
              items.push({
                key: `${person.identity}:${publication.trackSid || publication.track.sid}`,
                track: publication.track,
                name: participantProfile(person, local).username,
                local,
              });
          });
          setScreens(items);
          setSharing(
            Boolean(
              room.localParticipant.getTrackPublication?.(
                Track.Source.ScreenShare,
              ),
            ),
          );
        };
        const attachAudio = (track, publication, participant) => {
          if (track.kind !== Track.Kind.Audio) return;
          const key = `${participant.identity}:${publication.trackSid || track.sid}`;
          audioElementsRef.current.get(key)?.remove();
          const element = track.attach();
          element.autoplay = true;
          element.dataset.desktopCall = "true";
          element.volume = volumes[participant.identity] ?? 1;
          if (outputDevice && element.setSinkId)
            element.setSinkId(outputDevice).catch(() => {});
          document.body.appendChild(element);
          audioElementsRef.current.set(key, element);
          room.startAudio().catch(() => setAudioBlocked(true));
        };
        const detachTrack = (track, publication, participant) => {
          if (track.kind === Track.Kind.Audio) {
            const key = `${participant.identity}:${publication.trackSid || track.sid}`;
            track.detach().forEach((element) => element.remove());
            audioElementsRef.current.get(key)?.remove();
            audioElementsRef.current.delete(key);
          }
          refreshScreens();
        };
        room
          .on(RoomEvent.ParticipantConnected, () => {
            if (ringback) stopRingtone();
            playCallEventSound("join");
            setStatus("Voice chat connected.");
            refresh();
          })
          .on(RoomEvent.ParticipantDisconnected, () => {
            playCallEventSound("leave");
            setStatus(
              room.remoteParticipants.size
                ? "Voice chat connected."
                : "Connected. Waiting for other crew members…",
            );
            refresh();
            refreshScreens();
          })
          .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
            attachAudio(track, publication, participant);
            refreshScreens();
            refresh();
          })
          .on(RoomEvent.TrackUnsubscribed, detachTrack)
          .on(RoomEvent.LocalTrackPublished, () => {
            refreshScreens();
            refresh();
          })
          .on(RoomEvent.LocalTrackUnpublished, () => {
            refreshScreens();
            refresh();
          })
          .on(RoomEvent.TrackMuted, refresh)
          .on(RoomEvent.TrackUnmuted, refresh)
          .on(RoomEvent.ParticipantMetadataChanged, refresh)
          .on(RoomEvent.ActiveSpeakersChanged, (active) =>
            setSpeaking(new Set(active.map((person) => person.identity))),
          )
          .on(RoomEvent.ConnectionQualityChanged, (quality, participant) =>
            setQualities((current) => ({
              ...current,
              [participant.identity]: String(
                quality || "unknown",
              ).toLowerCase(),
            })),
          )
          .on(RoomEvent.AudioPlaybackStatusChanged, () =>
            setAudioBlocked(!room.canPlaybackAudio),
          )
          .on(RoomEvent.Reconnecting, () =>
            setStatus("Reconnecting your voice chat…"),
          )
          .on(RoomEvent.Reconnected, () => {
            setStatus(
              room.remoteParticipants.size
                ? "Voice chat connected."
                : "Connected. Waiting for other crew members…",
            );
            refresh();
          });
        await room.connect(data.serverUrl, data.participantToken, {
          autoSubscribe: true,
        });
        if (inputDevice)
          await room
            .switchActiveDevice("audioinput", inputDevice)
            .catch(() => {});
        if (outputDevice)
          await room
            .switchActiveDevice("audiooutput", outputDevice)
            .catch(() => {});
        await room.localParticipant.setMicrophoneEnabled(true, {
          deviceId: inputDevice || undefined,
          echoCancellation: callPreferences.echoCancellation !== false,
          noiseSuppression: callPreferences.noiseSuppression !== false,
          autoGainControl: callPreferences.autoGainControl !== false,
        });
        if (disposed) return;
        stopRingtone();
        refresh();
        refreshScreens();
        setConnected(true);
        const refreshCallStatus = () =>
          supabase
            .from("profiles")
            .update({
              in_call_until: new Date(Date.now() + 90000).toISOString(),
            })
            .eq("id", user.id);
        refreshCallStatus();
        setStatus(
          room.remoteParticipants.size
            ? "Voice chat connected."
            : "Connected. Waiting for other crew members…",
        );
        playCallEventSound("join");
        startedAtRef.current = Date.now();
        timer = setInterval(() => {
          const seconds = Math.floor(
            (Date.now() - startedAtRef.current) / 1000,
          );
          const hours = Math.floor(seconds / 3600);
          const minutes = Math.floor((seconds % 3600) / 60);
          const rest = seconds % 60;
          setDuration(
            hours
              ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
              : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`,
          );
        }, 1000);
        heartbeat = setInterval(() => {
          supabase
            .from("active_voice_calls")
            .update({ last_active_at: new Date().toISOString() })
            .eq("call_id", callId);
          refreshCallStatus();
        }, 15000);
        if (!fresh) {
          const recipients = isGroup
            ? (conversation.members || [])
                .map((member) => member.id)
                .filter((id) => id !== user.id)
            : [conversation.person.id];
          await Promise.allSettled(
            recipients.map((targetUserId) =>
              supabase.rpc("create_notification", {
                target_user_id: targetUserId,
                notification_type: "voice_call",
                notification_title: "Incoming voice call",
                notification_message: `${conversation.meName || "A crew member"} wants to call you!`,
                notification_link: `Conversation.html?${isGroup ? "group" : "id"}=${encodeURIComponent(contextId)}&call=${encodeURIComponent(callId)}&caller=${encodeURIComponent(conversation.meName || "A crew member")}&caller_avatar=${encodeURIComponent(conversation.meAvatar || "")}&caller_id=${encodeURIComponent(user.id)}&conversation_title=${encodeURIComponent(callTitle)}`,
              }),
            ),
          );
        }
      } catch (error) {
        stopRingtone();
        setStatus(error.message || "The call could not connect.");
      }
    }
    join();
    return () => {
      disposed = true;
      clearInterval(heartbeat);
      stopRingtone();
      clearInterval(timer);
      const room = roomRef.current;
      const wasOnlyParticipant = !room || room.remoteParticipants.size === 0;
      room?.disconnect();
      supabase
        .from("profiles")
        .update({ in_call_until: null })
        .eq("id", user.id)
        .then(() => {});
      if (callRef.current)
        supabase
          .from("call_participant_controls")
          .delete()
          .eq("call_id", callRef.current)
          .eq("user_id", user.id)
          .then(() => {});
      audioElementsRef.current.forEach((element) => element.remove());
      audioElementsRef.current.clear();
      if (wasOnlyParticipant && callRef.current)
        supabase
          .from("active_voice_calls")
          .delete()
          .eq("call_id", callRef.current)
          .then(() => {});
    };
  }, [joinRequested]);

  useEffect(() => {
    if (!connected || !pushToTalk) return undefined;
    roomRef.current?.localParticipant.setMicrophoneEnabled(false).then(() => {
      setMuted(true);
      setStatus(`Push to talk is on. Hold ${pushToTalkLabel} to speak.`);
    });
    const isTyping = (target) =>
      target instanceof HTMLElement &&
      (target.matches("input, textarea, select") || target.isContentEditable);
    const press = async (event) => {
      if (
        event.code !== pushToTalkCode ||
        event.repeat ||
        isTyping(event.target)
      )
        return;
      event.preventDefault();
      await roomRef.current?.localParticipant.setMicrophoneEnabled(true);
      setMuted(false);
      setStatus(`Speaking — release ${pushToTalkLabel} to mute.`);
    };
    const release = async (event) => {
      if (event.code !== pushToTalkCode || isTyping(event.target)) return;
      event.preventDefault();
      await roomRef.current?.localParticipant.setMicrophoneEnabled(false);
      setMuted(true);
      setStatus(`Push to talk is on. Hold ${pushToTalkLabel} to speak.`);
    };
    window.addEventListener("keydown", press);
    window.addEventListener("keyup", release);
    return () => {
      window.removeEventListener("keydown", press);
      window.removeEventListener("keyup", release);
    };
  }, [connected, pushToTalk, pushToTalkCode, pushToTalkLabel]);

  async function changePushToTalk(enabled) {
    setPushToTalk(enabled);
    if (!roomRef.current) return;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!enabled);
    setMuted(enabled);
    setStatus(
      enabled
        ? `Push to talk is on. Hold ${pushToTalkLabel} to speak.`
        : "Push to talk is off. Your microphone is on.",
    );
  }

  async function toggleMic() {
    if (!roomRef.current || busyControl) return;
    setBusyControl("mic");
    try {
      const next = !muted;
      await roomRef.current.localParticipant.setMicrophoneEnabled(!next);
      setMuted(next);
      setStatus(next ? "Your microphone is muted." : "Voice chat connected.");
      playCallTone("toggle");
      setParticipants((current) => [...current]);
    } catch {
      setStatus("Your microphone could not be changed. Check its permission.");
    } finally {
      setBusyControl("");
    }
  }

  async function beginShare(sourceId) {
    if (!roomRef.current) return;
    setBusyControl("share");
    setSourceError("");
    try {
      const publish = async (withAudio) => {
        if (sourceId) {
          const selected =
            await window.desktop?.screenShare?.selectSource(sourceId);
          if (!selected?.ok)
            throw new Error("That screen is no longer available.");
        }
        await roomRef.current.localParticipant.setScreenShareEnabled(true, {
          audio: withAudio,
          contentHint: "detail",
        });
      };
      try {
        await publish(true);
      } catch (audioError) {
        await roomRef.current.localParticipant
          .setScreenShareEnabled(false)
          .catch(() => {});
        try {
          await publish(false);
        } catch {
          throw audioError;
        }
      }
      setSources(null);
      setSharing(true);
      setStatus("Your screen is being shared.");
      playCallTone("share");
    } catch (error) {
      if (sources)
        setSourceError(error.message || "Screen sharing could not start.");
      else setStatus("Screen sharing was cancelled or could not start.");
    } finally {
      setBusyControl("");
    }
  }

  async function toggleShare() {
    if (!roomRef.current || busyControl) return;
    if (sharing) {
      setBusyControl("share");
      try {
        await roomRef.current.localParticipant.setScreenShareEnabled(false);
        setSharing(false);
        setStatus("Voice chat connected.");
        playCallTone("toggle");
      } finally {
        setBusyControl("");
      }
      return;
    }
    try {
      setBusyControl("sources");
      const available = await window.desktop?.screenShare?.listSources();
      if (available?.length) setSources(available);
      else await beginShare();
    } catch {
      setStatus("No screens or windows are available to share.");
    } finally {
      setBusyControl("");
    }
  }

  function changeVolume(participantId, value) {
    const volume = Number(value) / 100;
    setVolumes((current) => ({ ...current, [participantId]: volume }));
    for (const [key, element] of audioElementsRef.current) {
      if (key.startsWith(`${participantId}:`)) element.volume = volume;
    }
  }

  async function enableAudio() {
    try {
      await roomRef.current?.startAudio();
      setAudioBlocked(false);
    } catch {
      setStatus(
        "Audio is still blocked by the system. Check your sound settings.",
      );
    }
  }

  function leaveCall() {
    stopRingtone();
    playCallEventSound("leave");
    onClose();
  }

  useEffect(() => {
    if (!activeCallId) return;
    const load = async () => {
      const [messagesResult, controlsResult] = await Promise.all([
        supabase
          .from("call_messages")
          .select("id,sender_id,content,created_at")
          .eq("call_id", activeCallId)
          .order("created_at"),
        supabase
          .from("call_participant_controls")
          .select("user_id,hand_raised,deafened,updated_at")
          .eq("call_id", activeCallId),
      ]);
      setCallMessages(messagesResult.data || []);
      setParticipantControls(controlsResult.data || []);
    };
    supabase.from("call_participant_controls").upsert({
      call_id: activeCallId,
      user_id: user.id,
      hand_raised: handRaised,
      deafened,
      updated_at: new Date().toISOString(),
    });
    load();
    const channel = supabase
      .channel(`call-chat-${activeCallId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "call_messages",
          filter: `call_id=eq.${activeCallId}`,
        },
        load,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "call_participant_controls",
          filter: `call_id=eq.${activeCallId}`,
        },
        load,
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [activeCallId, user.id]);

  async function updateCallControl(changes) {
    await supabase.from("call_participant_controls").upsert({
      call_id: activeCallId,
      user_id: user.id,
      hand_raised: handRaised,
      deafened,
      ...changes,
      updated_at: new Date().toISOString(),
    });
  }

  if (minimized) {
    const active =
      participants.find((participant) => speaking.has(participant.identity)) ||
      participants[0];
    const compactProfile = active
      ? participantProfile(active, active === participants[0])
      : {
          username: callTitle,
          avatar: conversation.person?.avatar || conversation.avatar || "",
        };
    return (
      <button
        type="button"
        className={`compact-call-cube${active && speaking.has(active.identity) ? " speaking" : ""}`}
        style={{ left: compactPosition.x, top: compactPosition.y }}
        onPointerDown={beginCompactDrag}
        onPointerMove={moveCompactCall}
        onPointerUp={finishCompactDrag}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        aria-label={`Return to ${callTitle} call`}
        title="Drag to move · click to reopen"
      >
        <Avatar profile={compactProfile} size={58} />
        <span>
          <Phone /> {connected ? duration : "Connecting"}
        </span>
      </button>
    );
  }

  if (!joinRequested) {
    return (
      <div className="call-overlay">
        <section
          className="call-panel call-lobby"
          aria-label={`${callTitle} call lobby`}
        >
          <header className="call-header">
            <div>
              <span className="eyebrow">Voice check</span>
              <h2>Ready to join {callTitle}?</h2>
            </div>
          </header>
          <div className="call-lobby-mic">
            <Mic />
            <div>
              <strong>Microphone test</strong>
              <p>{micTest.message}</p>
              <span className="mic-level">
                <i style={{ width: `${micTest.level}%` }} />
              </span>
            </div>
          </div>
          <div className="call-processing-summary">
            <span>
              Noise suppression{" "}
              {callPreferences.noiseSuppression !== false ? "on" : "off"}
            </span>
            <span>
              Echo cancellation{" "}
              {callPreferences.echoCancellation !== false ? "on" : "off"}
            </span>
            <span>
              Automatic gain{" "}
              {callPreferences.autoGainControl !== false ? "on" : "off"}
            </span>
          </div>
          <div className="modal-actions">
            <button className="button ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="button secondary"
              disabled={micTest.running}
              onClick={testMicrophone}
            >
              {micTest.running ? "Testing…" : "Test microphone"}
            </button>
            <button
              className="button primary"
              onClick={() => setJoinRequested(true)}
            >
              <Phone /> Join call
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="call-overlay">
      <section className="call-panel" aria-label={`${callTitle} voice call`}>
        <div className="call-glow" />
        <header className="call-header">
          <div>
            <span className="eyebrow">
              {conversation.type === "group" ? "Group" : "Private"} voice
              channel
            </span>
            <h2>{callTitle}</h2>
          </div>
          <div
            className={connected ? "call-connection online" : "call-connection"}
          >
            <Wifi />
            <span>{connected ? duration : "Connecting"}</span>
          </div>
          <button
            className="call-minimize"
            type="button"
            onClick={() => setMinimized(true)}
            title="Minimize call"
          >
            <Minimize2 />
          </button>
        </header>

        <div className="call-status" role="status">
          {status}
        </div>
        {audioBlocked && (
          <button className="call-audio-warning" onClick={enableAudio}>
            <VolumeX /> Click to turn call audio on
          </button>
        )}

        {connected && (
          <section
            className="call-preference-row"
            aria-label="Call preferences"
          >
            <label className="call-push-to-talk">
              <input
                type="checkbox"
                checked={pushToTalk}
                onChange={(event) => changePushToTalk(event.target.checked)}
              />
              <span>Push to talk</span>
              <small>Hold {pushToTalkLabel}</small>
            </label>
            <small>Audio devices can be changed in Settings.</small>
          </section>
        )}

        {screens.length > 0 && (
          <div className="call-screen-grid">
            {screens.map((item) => (
              <ScreenShareTile item={item} key={item.key} />
            ))}
          </div>
        )}

        <div className="call-participants">
          {participants.map((participant, index) => {
            const local = index === 0;
            const profile = participantProfile(participant, local);
            const micPublication = participant.getTrackPublication?.(
              Track.Source.Microphone,
            );
            const isMuted =
              Boolean(micPublication?.isMuted) || (local && muted);
            const isSpeaking = speaking.has(participant.identity);
            const quality =
              qualities[participant.identity] ||
              (connected ? "good" : "unknown");
            const callControl = participantControls.find(
              (item) => item.user_id === participant.identity,
            );
            return (
              <article
                className={`call-participant${isSpeaking ? " speaking" : ""}${isMuted ? " muted" : ""}`}
                key={participant.identity || "local"}
              >
                <div className="call-avatar-wrap">
                  <Avatar profile={profile} size={72} />
                  <span className="call-speaking-ring" />
                  {isMuted && (
                    <span className="call-mute-badge">
                      <MicOff />
                    </span>
                  )}
                  {callControl?.hand_raised && (
                    <span className="call-hand-badge" title="Hand raised">
                      <Hand />
                    </span>
                  )}
                </div>
                <strong>
                  {profile.username}
                  {local ? " (you)" : ""}
                </strong>
                <span
                  className={`call-quality ${quality}`}
                  title={`${profile.username} connection quality`}
                >
                  {quality === "poor" || quality === "lost" ? (
                    <WifiOff />
                  ) : (
                    <Wifi />
                  )}
                  {quality === "excellent"
                    ? "Excellent"
                    : quality === "good"
                      ? "Good"
                      : quality === "poor"
                        ? "Poor connection"
                        : quality === "lost"
                          ? "Connection lost"
                          : "Checking"}
                </span>
                {callControl?.deafened && (
                  <small className="call-deafened-label">
                    <Headphones /> Deafened
                  </small>
                )}
                {!local && (
                  <label
                    className="call-volume"
                    title={`${profile.username} volume`}
                  >
                    {(volumes[participant.identity] ?? 1) === 0 ? (
                      <VolumeX />
                    ) : (
                      <Volume2 />
                    )}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={Math.round(
                        (volumes[participant.identity] ?? 1) * 100,
                      )}
                      onChange={(event) =>
                        changeVolume(participant.identity, event.target.value)
                      }
                    />
                  </label>
                )}
              </article>
            );
          })}
        </div>

        <div className="participant-count">
          <Users /> {participants.length || 1} connected
        </div>
        <footer className="call-actions">
          <button
            className={deafened ? "call-button active" : "call-button"}
            disabled={!connected}
            onClick={async () => {
              const next = !deafened;
              if (next) mutedBeforeDeafenRef.current = muted;
              setDeafened(next);
              audioElementsRef.current.forEach((audio) => {
                audio.muted = next;
              });
              const microphoneEnabled = next
                ? false
                : !mutedBeforeDeafenRef.current;
              await roomRef.current?.localParticipant.setMicrophoneEnabled(
                microphoneEnabled,
              );
              setMuted(!microphoneEnabled);
              await updateCallControl({ deafened: next });
            }}
            title="Deafen incoming call audio"
          >
            <Headphones />
            <span>{deafened ? "Undeafen" : "Deafen"}</span>
          </button>
          <button
            className={handRaised ? "call-button active" : "call-button"}
            disabled={!connected}
            onClick={async () => {
              const next = !handRaised;
              setHandRaised(next);
              await updateCallControl({ hand_raised: next });
            }}
            title="Raise your hand"
          >
            <Hand />
            <span>{handRaised ? "Lower hand" : "Raise hand"}</span>
          </button>
          <button
            className="call-button"
            disabled={!connected}
            onClick={() => setCallChatOpen((value) => !value)}
            title="Open call chat"
          >
            <MessageCircle />
            <span>Call chat</span>
          </button>
          <button
            className={muted ? "call-button active" : "call-button"}
            disabled={!connected || Boolean(busyControl) || pushToTalk}
            onClick={toggleMic}
            title={muted ? "Unmute microphone" : "Mute microphone"}
          >
            {muted ? <MicOff /> : <Mic />}
            <span>{muted ? "Unmute" : "Mute"}</span>
          </button>
          <button
            className={sharing ? "call-button sharing" : "call-button"}
            disabled={!connected || Boolean(busyControl)}
            onClick={toggleShare}
            title={sharing ? "Stop sharing" : "Share a screen or window"}
          >
            <MonitorUp />
            <span>{sharing ? "Stop sharing" : "Share screen"}</span>
          </button>
          <button
            className="call-button hangup"
            onClick={leaveCall}
            title="Leave call"
          >
            <PhoneOff />
            <span>Leave</span>
          </button>
        </footer>
        {callChatOpen && (
          <aside className="call-chat-panel">
            <header>
              <strong>Call chat</strong>
              <button onClick={() => setCallChatOpen(false)}>
                <X />
              </button>
            </header>
            <div>
              {callMessages.map((item) => (
                <p key={item.id}>
                  <strong>
                    {participantProfile(
                      participants.find(
                        (person) => person.identity === item.sender_id,
                      ),
                    )?.username ||
                      (item.sender_id === user.id ? "You" : "Crew member")}
                  </strong>
                  <span>{item.content}</span>
                </p>
              ))}
            </div>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const input = event.currentTarget.elements.callMessage;
                const content = input.value.trim();
                if (!content) return;
                await supabase.from("call_messages").insert({
                  call_id: activeCallId,
                  sender_id: user.id,
                  content,
                });
                input.value = "";
              }}
            >
              <input
                name="callMessage"
                maxLength="700"
                placeholder="Message everyone in this call"
              />
              <button>
                <Send />
              </button>
            </form>
          </aside>
        )}
      </section>

      {sources && (
        <div
          className="call-source-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Choose what to share"
        >
          <section className="call-source-picker">
            <header>
              <div>
                <span className="eyebrow">Screen sharing</span>
                <h3>Choose what to share</h3>
              </div>
              <button
                onClick={() => setSources(null)}
                title="Cancel screen sharing"
              >
                <X />
              </button>
            </header>
            {sourceError && (
              <div className="inline-message error">{sourceError}</div>
            )}
            <div className="call-source-grid">
              {sources.map((source) => (
                <button
                  key={source.id}
                  onClick={() => beginShare(source.id)}
                  disabled={busyControl === "share"}
                >
                  <span className="call-source-preview">
                    {source.thumbnail ? (
                      <img src={source.thumbnail} alt="" />
                    ) : (
                      <Monitor />
                    )}
                  </span>
                  <span className="call-source-name">
                    {source.icon && <img src={source.icon} alt="" />}
                    <strong>{source.name}</strong>
                    <small>
                      {source.kind === "screen" ? "Entire screen" : "Window"}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function MessageRequestLauncher({ user, profile, onChanged, onNotice }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [states, setStates] = useState({});
  async function show() {
    setOpen(true);
    try {
      const [profiles, conversations, requests, friendships] =
        await Promise.all([
          getProfiles("id,username,avatar,rank,last_seen"),
          getConversations(user.id),
          supabase
            .from("dm_requests")
            .select("sender_id,recipient_id,status")
            .eq("status", "Pending"),
          supabase
            .from("friendships")
            .select("requester_id,addressee_id,status")
            .eq("status", "accepted"),
        ]);
      setPeople(profiles.filter((person) => person.id !== user.id));
      const next = {};
      conversations.forEach((item) => {
        next[item.person?.id] = "open";
      });
      (requests.data || []).forEach((item) => {
        if (item.sender_id === user.id) next[item.recipient_id] = "outgoing";
        if (item.recipient_id === user.id) next[item.sender_id] = "incoming";
      });
      (friendships.data || []).forEach((item) => {
        const other =
          item.requester_id === user.id ? item.addressee_id : item.requester_id;
        if (!next[other]) next[other] = "friend";
      });
      setStates(next);
    } catch (error) {
      onNotice(error.message);
    }
  }
  async function choose(person) {
    setBusy(person.id);
    try {
      const blocked = await restrictionMessage(user.id, "messaging");
      if (blocked) throw new Error(blocked);
      const result = await requestConversation(user, profile, person);
      if (result.conversationId)
        onNotice(`Your conversation with ${person.username} is ready.`);
      else if (result.pendingIncoming)
        onNotice("This person already sent you a request. Accept it below.");
      else if (result.pendingOutgoing)
        onNotice("You already sent this person a message request.");
      else onNotice(`Message request sent to ${person.username}.`);
      setOpen(false);
      await onChanged();
    } catch (error) {
      onNotice(error.message);
    } finally {
      setBusy("");
    }
  }
  const shown = people.filter((person) =>
    `${person.username || ""} ${person.rank || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <button className="button primary" onClick={show}>
        <Plus />
        Request to DM
      </button>
      {open && (
        <Modal title="New Conversation" onClose={() => setOpen(false)}>
          <p className="modal-copy">
            Choose a crew member. If you do not already share a conversation,
            they will receive a message request.
          </p>
          <div className="conversation-search request-search">
            <Search />
            <input
              autoFocus
              placeholder="Search crew members..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="crew-picker">
            {shown.map((person) => (
              <button
                disabled={busy === person.id}
                onClick={() => choose(person)}
                key={person.id}
              >
                <Avatar profile={person} />
                <span>
                  <strong>{person.username || "Crew member"}</strong>
                  <small>{person.rank || "Crew Member"}</small>
                </span>
                <em>
                  {busy === person.id
                    ? "Opening…"
                    : states[person.id] === "open"
                      ? "Open conversation"
                      : states[person.id] === "outgoing"
                        ? "Request sent"
                        : states[person.id] === "incoming"
                          ? "Review request"
                          : states[person.id] === "friend"
                            ? "Message friend"
                            : "Request to DM"}
                </em>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

function DirectMessagesPage({
  user,
  profile,
  initialPerson,
  route,
  onRouteConsumed,
  onShowGroups,
}) {
  const [conversations, setConversations] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [, setReadRevision] = useState(0);
  const [replying, setReplying] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [slowUntil, setSlowUntil] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const dmBurstRef = useRef(new Map());
  const endRef = useRef();
  const [conversationFeatures, reloadConversationFeatures] =
    useConversationFeatures("dm", selected?.id, user.id);
  useEffect(() => {
    setSlowUntil(
      selected ? dmBurstRef.current.get(selected.id)?.blockedUntil || 0 : 0,
    );
  }, [selected?.id]);
  useEffect(() => {
    const refresh = () => setReadRevision((value) => value + 1);
    window.addEventListener("message-reads", refresh);
    return () => window.removeEventListener("message-reads", refresh);
  }, []);
  async function loadAll() {
    try {
      const [items, pending] = await Promise.all([
        getConversations(user.id),
        getMessageRequests(user.id),
      ]);
      setConversations(items);
      setRequests(pending);
      setSelected((current) =>
        current
          ? items.find((x) => x.id === current.id) || items[0] || null
          : items[0] || null,
      );
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel(`desktop-messages-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_requests" },
        loadAll,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dm_conversations" },
        loadAll,
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user.id]);
  useEffect(() => {
    if (!initialPerson) return;
    (async () => {
      setNotice("");
      const blocked = await restrictionMessage(user.id, "messaging");
      if (blocked) return setNotice(blocked);
      try {
        const result = await requestConversation(user, profile, initialPerson);
        if (result.conversationId) {
          await loadAll();
          const items = await getConversations(user.id);
          setSelected(
            items.find((x) => x.id === result.conversationId) || null,
          );
        } else if (result.pendingIncoming)
          setNotice("This person already sent you a request. Accept it below.");
        else if (result.pendingOutgoing)
          setNotice("You already sent this person a message request.");
        else setNotice("Message request sent.");
      } catch (e) {
        setNotice(e.message);
      }
    })();
  }, [initialPerson?.id]);
  async function removeConversation() {
    if (!selected) return;
    const approved = await confirmInApp(
      `This permanently deletes your conversation with ${selected.person?.username || "this crew member"} and all of its messages for both people.`,
      {
        title: "Delete this conversation?",
        confirmLabel: "Delete conversation",
      },
    );
    if (!approved) return;
    try {
      await deleteDirectConversation(selected.id);
      setSelected(null);
      setMessages([]);
      setReplying(null);
      await loadAll();
      setNotice("Conversation deleted.");
    } catch (exception) {
      setNotice(exception.message || "The conversation could not be deleted.");
    }
  }
  useEffect(() => {
    if (!route?.conversation || !conversations.length) return;
    const found = conversations.find((x) => x.id === route.conversation);
    if (found) {
      setSelected(found);
      if (route.call || route.startCall) {
        window.dispatchEvent(
          new CustomEvent("crewdeck-open-call", {
            detail: {
              conversation: {
                ...found,
                meName: profile.username,
                meAvatar: profile.avatar,
              },
              requestedCallId: route.call || crypto.randomUUID(),
            },
          }),
        );
        onRouteConsumed?.();
      }
    }
  }, [
    route?.conversation,
    route?.call,
    route?.startCall,
    conversations.length,
  ]);
  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    let live = true;
    markConversationRead(selected.id, false, selected.updated_at);
    getMessages(selected.id)
      .then((rows) => live && setMessages(rows))
      .catch((e) => setError(e.message));
    const channel = supabase
      .channel(`desktop-dm-${selected.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dm_messages",
          filter: `conversation_id=eq.${selected.id}`,
        },
        async () => {
          const rows = await getMessages(selected.id);
          if (live) setMessages(rows);
        },
      )
      .subscribe();
    return () => {
      live = false;
      supabase.removeChannel(channel);
    };
  }, [selected?.id]);
  useEffect(() => {
    scrollMessageStream(endRef);
  }, [messages.length]);
  useEffect(() => {
    const last = messages.at(-1);
    if (selected?.id && last)
      markMessageRead("dm", selected.id, last.id, user.id).catch(() => {});
  }, [selected?.id, messages.at(-1)?.id, user.id]);
  const visible = useMemo(
    () =>
      conversations.filter((x) =>
        x.person?.username?.toLowerCase().includes(query.toLowerCase()),
      ),
    [conversations, query],
  );
  const byId = useMemo(
    () => Object.fromEntries(messages.map((x) => [x.id, x])),
    [messages],
  );
  async function respond(request, status) {
    try {
      const id = await respondToMessageRequest(
        request,
        user.id,
        status,
        profile.username,
      );
      await loadAll();
      if (id) {
        const items = await getConversations(user.id);
        setSelected(items.find((x) => x.id === id) || null);
      }
      setNotice(
        status === "Accepted"
          ? "Message request accepted."
          : "Message request declined.",
      );
    } catch (e) {
      setNotice(e.message);
    }
  }
  async function send(e) {
    e.preventDefault();
    const input = e.currentTarget.elements.message;
    const content = input.value.trim();
    if (!content || !selected) return;
    const burst = dmBurstRef.current.get(selected.id);
    if ((burst?.blockedUntil || 0) > Date.now()) {
      setSlowUntil(burst.blockedUntil);
      return false;
    }
    try {
      const blocked = await restrictionMessage(user.id, "messaging");
      if (blocked) {
        setNotice(blocked);
        return false;
      }
      const sent = await sendMessage(
        selected.id,
        user.id,
        selected.person.id,
        content,
        replying?.id || null,
      );
      setMessages((rows) =>
        rows.some((row) => row.id === sent.id) ? rows : [...rows, sent],
      );
      const nextBurst = recordDirectMessageBurst(
        burst?.history || [],
        Date.now(),
      );
      dmBurstRef.current.set(selected.id, nextBurst);
      setSlowUntil(nextBurst.blockedUntil);
      setReplying(null);
    } catch (x) {
      setNotice(x.message);
      return false;
    }
  }
  async function remove(item) {
    await deleteMessage(item.id, user.id);
    setMessages((rows) => rows.filter((x) => x.id !== item.id));
    setReplying((current) => (current?.id === item.id ? null : current));
  }
  async function refreshMessages() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadAll();
      if (selected) setMessages(await getMessages(selected.id));
      setNotice("Messages refreshed.");
    } catch (exception) {
      setNotice(exception.message);
    } finally {
      setRefreshing(false);
    }
  }
  if (loading)
    return (
      <div className="page">
        <Loading />
      </div>
    );
  if (error)
    return (
      <div className="page">
        <ErrorState message={error} retry={loadAll} />
      </div>
    );
  return (
    <div className="page messages-page">
      <PageHeader
        eyebrow="Crew comms"
        title="Messages"
        description="Private conversations, requests, replies, editing, and voice calls."
        action={
          <div className="header-actions">
            <button
              className="icon-button refresh-button"
              title="Refresh messages"
              onClick={refreshMessages}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              <RefreshCw className={refreshing ? "spin" : ""} />
            </button>
            <button
              className="button ghost"
              onClick={() => markAllConversationsRead(conversations, false)}
            >
              <CheckCheck /> Mark all read
            </button>
            <MessageRequestLauncher
              user={user}
              profile={profile}
              onChanged={loadAll}
              onNotice={setNotice}
            />
          </div>
        }
      />
      <div className="message-mode-tabs">
        <button className="active">DM Messages</button>
        <button onClick={onShowGroups}>Group Messages</button>
      </div>
      {notice && <p className="form-message">{notice}</p>}
      {requests.length > 0 && (
        <section className="panel request-panel">
          <h3>Message requests ({requests.length})</h3>
          {requests.map((request) => (
            <div className="message-request" key={request.id}>
              <Avatar profile={request.person} />
              <span>
                <strong>{request.person?.username || "Crew member"}</strong>
                <small>Wants to start a conversation</small>
              </span>
              <button
                className="button secondary"
                onClick={() => respond(request, "Accepted")}
              >
                <Check />
                Accept
              </button>
              <button
                className="button ghost"
                onClick={() => respond(request, "Declined")}
              >
                <X />
                Decline
              </button>
            </div>
          ))}
        </section>
      )}
      <div className="messages-layout">
        <aside className="panel conversation-list">
          <div className="conversation-search">
            <Search />
            <input
              placeholder="Search conversations"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {visible.map((item) => {
            const online =
              item.person?.last_seen &&
              Date.now() - new Date(item.person.last_seen).getTime() < 120000;
            return (
              <button
                className={
                  selected?.id === item.id
                    ? "conversation active"
                    : "conversation"
                }
                onClick={() => setSelected(item)}
                key={item.id}
              >
                <Avatar profile={item.person} />
                <span>
                  <strong>{item.person?.username || "Crew member"}</strong>
                  <small
                    className={`presence-chip ${online ? "online" : "offline"}`}
                  >
                    <i /> {online ? "Online" : "Offline"}
                  </small>
                </span>
                {conversationUnreadCount(item.id, false) > 0 && (
                  <b className="conversation-unread">
                    {conversationUnreadCount(item.id, false)}
                  </b>
                )}
              </button>
            );
          })}
        </aside>
        <section className="panel chat-panel">
          {selected ? (
            <>
              <header className="chat-header">
                <div className="card-person">
                  <Avatar profile={selected.person} />
                  <div>
                    <h3>{selected.person?.username || "Crew member"}</h3>
                    <div className="chat-identity-meta">
                      <span className="rank">
                        {selected.person?.rank || "Crew"}
                      </span>
                      <span
                        className={`presence-chip ${selected.person?.last_seen && Date.now() - new Date(selected.person.last_seen).getTime() < 120000 ? "online" : "offline"}`}
                      >
                        <i />
                        {selected.person?.last_seen &&
                        Date.now() -
                          new Date(selected.person.last_seen).getTime() <
                          120000
                          ? "Online"
                          : "Offline"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="chat-header-actions">
                  <button
                    className="icon-button"
                    title={
                      isMuted(selected.id, false)
                        ? "Unmute notifications"
                        : "Mute notifications"
                    }
                    onClick={() => {
                      setMuted(
                        selected.id,
                        false,
                        !isMuted(selected.id, false),
                      );
                      setReadRevision((value) => value + 1);
                    }}
                  >
                    {isMuted(selected.id, false) ? <BellOff /> : <BellRing />}
                  </button>
                  <button
                    className="icon-button call"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("crewdeck-open-call", {
                          detail: {
                            conversation: {
                              ...selected,
                              meName: profile.username,
                              meAvatar: profile.avatar,
                            },
                          },
                        }),
                      )
                    }
                  >
                    <Phone />
                  </button>
                  <DirectActionsMenu
                    onDelete={removeConversation}
                    user={user}
                    conversationId={selected.id}
                    preference={conversationFeatures.preferences}
                    onPreferenceChanged={reloadConversationFeatures}
                    onNotice={setNotice}
                  />
                </div>
              </header>
              <div className="message-stream">
                <PinnedMessages
                  pins={conversationFeatures.pins}
                  onChanged={reloadConversationFeatures}
                />
                {messages.map((item) => {
                  const quoted = item.reply_to_id
                    ? byId[item.reply_to_id]
                    : null;
                  return (
                    <div
                      className={
                        item.sender_id === user.id ? "message mine" : "message"
                      }
                      tabIndex={0}
                      key={item.id}
                    >
                      <MessageReplyQuote
                        message={item}
                        messages={messages}
                        people={[profile, selected.person]}
                      />
                      {item.forwarded_from_kind && (
                        <small className="forwarded-message-label">
                          Forwarded from{" "}
                          {item.forwarded_from_kind === "group"
                            ? "a group"
                            : "a direct message"}
                        </small>
                      )}
                      <p>
                        <FormattedMessage>{item.content}</FormattedMessage>
                      </p>
                      <div className="message-footer">
                        <time>
                          {new Date(item.created_at).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </time>
                        <div className="message-actions">
                          <button
                            onClick={() => setReplying(item)}
                            title="Reply"
                          >
                            <Reply />
                          </button>
                          {item.sender_id === user.id && (
                            <>
                              <EditMessageButton
                                message={item}
                                userId={user.id}
                                onSaved={(content) =>
                                  setMessages((rows) =>
                                    rows.map((row) =>
                                      row.id === item.id
                                        ? { ...row, content }
                                        : row,
                                    ),
                                  )
                                }
                              />
                              <button
                                className="delete"
                                onClick={() => setDeleting(item)}
                                title="Delete"
                              >
                                <Trash2 />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <MessageFeatureBar
                        kind="dm"
                        conversationId={selected.id}
                        message={item}
                        userId={user.id}
                        reactions={conversationFeatures.reactions}
                        receipts={conversationFeatures.receipts}
                        onChanged={reloadConversationFeatures}
                        onNotice={setNotice}
                      />
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              {replying && (
                <div className="reply-bar">
                  <span>
                    Replying to:{" "}
                    <FormattedMessage>{replying.content}</FormattedMessage>
                  </span>
                  <button onClick={() => setReplying(null)}>
                    <X />
                  </button>
                </div>
              )}
              <MessageComposer
                key={selected.id}
                id={selected.id}
                user={user}
                people={[selected.person]}
                placeholder={`Message ${selected.person?.username || "crew member"}`}
                onSend={send}
                blockedUntil={slowUntil}
              />
            </>
          ) : (
            <Empty
              title="Choose a conversation"
              body="Select a conversation or use Request to DM."
            />
          )}
        </section>
      </div>
      {deleting && (
        <DeleteMessageDialog
          message={deleting}
          onClose={() => setDeleting(null)}
          onDelete={remove}
        />
      )}
    </div>
  );
}

function CreateGroupButton({ user, profile, onCreated, onNotice }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  async function show() {
    setOpen(true);
    try {
      setPeople(
        (await getProfiles("id,username,avatar,rank")).filter(
          (person) => person.id !== user.id,
        ),
      );
    } catch (error) {
      onNotice(error.message);
    }
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const blocked = await restrictionMessage(user.id, "messaging");
      if (blocked) throw new Error(blocked);
      const form = new FormData(event.currentTarget);
      const members = people.filter((person) => selected.includes(person.id));
      const name = (
        String(form.get("name")).trim() ||
        [profile.username, ...members.map((person) => person.username)].join(
          ", ",
        )
      ).slice(0, 50);
      const id = await createGroupConversation(
        user.id,
        profile,
        selected,
        name,
        form.get("avatar"),
      );
      setOpen(false);
      setSelected([]);
      await onCreated(id);
    } catch (error) {
      onNotice(error.message);
    } finally {
      setBusy(false);
    }
  }
  const shown = people.filter((person) =>
    person.username?.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <button className="button primary" onClick={show}>
        <Plus />
        New group
      </button>
      {open && (
        <Modal
          title="Start a group conversation"
          onClose={() => setOpen(false)}
        >
          <form className="stack-form" onSubmit={submit}>
            <p className="modal-copy">
              Bring at least 2 other crew members aboard. Your group can have up
              to 10 people total.
            </p>
            <Field label="Group name" hint="Uses member names if left blank">
              <input name="name" maxLength="50" />
            </Field>
            <Field label="Group picture · PNG, JPG, or WebP">
              <input
                name="avatar"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
              />
            </Field>
            <div className="conversation-search request-search">
              <Search />
              <input
                placeholder="Search crew members"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="group-picker">
              {shown.map((person) => (
                <label key={person.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(person.id)}
                    disabled={
                      !selected.includes(person.id) && selected.length >= 9
                    }
                    onChange={(event) =>
                      setSelected((ids) =>
                        event.target.checked
                          ? [...ids, person.id]
                          : ids.filter((id) => id !== person.id),
                      )
                    }
                  />
                  <Avatar profile={person} />
                  <span>
                    <strong>{person.username}</strong>
                    <small>{person.rank || "Crew Member"}</small>
                  </span>
                </label>
              ))}
            </div>
            <p className="micro-copy">
              {selected.length} selected ·{" "}
              {selected.length < 2 ? "choose at least 2" : "ready to create"}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={busy || selected.length < 2}
              >
                {busy ? "Creating…" : "Create group"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function ManageGroupButton({
  group,
  user,
  onChanged,
  onNotice,
  menuItem = false,
  label = "Manage group",
  onClosed,
}) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState([]);
  const [busy, setBusy] = useState("");
  const members = Array.isArray(group?.members) ? group.members : [];
  function close() {
    setOpen(false);
    onClosed?.();
  }
  async function show() {
    setOpen(true);
    try {
      setPeople(await getProfiles("id,username,avatar,rank"));
    } catch (error) {
      onNotice(error.message);
    }
  }
  async function rename(event) {
    event.preventDefault();
    setBusy("name");
    try {
      const form = new FormData(event.currentTarget);
      await renameGroupConversation(group.id, user.id, form.get("name"));
      await updateGroupConversationSettings(group.id, user.id, {
        description: form.get("description"),
        slow_mode_seconds: form.get("slow_mode_seconds"),
      });
      await onChanged();
      close();
    } catch (error) {
      onNotice(error.message);
    } finally {
      setBusy("");
    }
  }
  async function picture(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy("picture");
    try {
      await changeGroupAvatar(group.id, user.id, file);
      await onChanged();
      close();
    } catch (error) {
      onNotice(error.message);
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }
  async function member(person, operation) {
    if (operation === "kick") {
      const approved = await confirmInApp(
        `${person.username} will lose access to this group conversation.`,
        {
          title: `Remove ${person.username}?`,
          confirmLabel: "Remove member",
        },
      );
      if (!approved) return;
    }
    setBusy(person.id);
    try {
      await manageGroupMember(group.id, person.id, operation, group.name);
      await onChanged();
      setPeople(await getProfiles("id,username,avatar,rank"));
    } catch (error) {
      onNotice(error.message);
    } finally {
      setBusy("");
    }
  }
  async function role(person, nextRole) {
    setBusy(`role-${person.id}`);
    try {
      await changeGroupRole(group.id, person.id, nextRole);
      await onChanged();
    } catch (error) {
      onNotice(error.message);
    } finally {
      setBusy("");
    }
  }
  const myRole =
    members.find((member) => member.id === user.id)?.groupRole ||
    (group.owner_id === user.id ? "owner" : "member");
  const memberIds = new Set(members.map((member) => member.id));
  const invitees = people.filter((person) => !memberIds.has(person.id));
  const removable = members.filter((member) => member.id !== user.id);
  return (
    <>
      <button
        type="button"
        className={
          menuItem
            ? "group-actions-menu-item"
            : "button secondary compact-button"
        }
        onClick={show}
      >
        {label}
      </button>
      {open && (
        <Modal title="Manage group" onClose={close}>
          {myRole === "owner" && (
            <form className="stack-form" onSubmit={rename}>
              <Field label="Group name">
                <input
                  name="name"
                  maxLength="50"
                  defaultValue={group.name}
                  required
                />
              </Field>
              <Field label="Description or group rules">
                <textarea
                  name="description"
                  maxLength="500"
                  rows="3"
                  defaultValue={group.description || ""}
                />
              </Field>
              <Field label="Slow mode">
                <select
                  name="slow_mode_seconds"
                  defaultValue={group.slow_mode_seconds || 0}
                >
                  <option value="0">Off</option>
                  <option value="5">5 seconds</option>
                  <option value="10">10 seconds</option>
                  <option value="30">30 seconds</option>
                  <option value="60">1 minute</option>
                  <option value="300">5 minutes</option>
                </select>
              </Field>
              <button className="button secondary" disabled={busy === "name"}>
                {busy === "name" ? "Saving…" : "Change group name"}
              </button>
            </form>
          )}
          {myRole === "owner" && (
            <div className="group-manage-section">
              <h3>Group picture</h3>
              <Field label="PNG, JPG, or WebP under 5 MB">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={picture}
                  disabled={busy === "picture"}
                />
              </Field>
            </div>
          )}
          <div className="group-manage-section">
            <h3>Invite member</h3>
            <div className="crew-picker">
              {invitees.length ? (
                invitees.map((person) => (
                  <button
                    type="button"
                    disabled={busy === person.id || members.length >= 10}
                    onClick={() => member(person, "invite")}
                    key={person.id}
                  >
                    <Avatar profile={person} />
                    <span>
                      <strong>{person.username}</strong>
                      <small>{person.rank || "Crew Member"}</small>
                    </span>
                    <em>{members.length >= 10 ? "Group full" : "Invite"}</em>
                  </button>
                ))
              ) : (
                <p className="micro-copy">
                  No crew members are available to invite.
                </p>
              )}
            </div>
          </div>
          {myRole === "owner" && (
            <div className="group-manage-section">
              <h3>Member roles</h3>
              <p className="micro-copy">
                Moderators can invite and remove members. Only the owner can
                change roles and group details.
              </p>
              <div className="crew-picker group-role-picker">
                {members
                  .filter((person) => person.id !== user.id)
                  .map((person) => (
                    <div className="group-role-row" key={person.id}>
                      <Avatar profile={person} />
                      <span>
                        <strong>{person.username}</strong>
                        <small>{person.groupRole || "member"}</small>
                      </span>
                      <select
                        disabled={busy === `role-${person.id}`}
                        value={person.groupRole || "member"}
                        onChange={(event) => role(person, event.target.value)}
                      >
                        <option value="member">Member</option>
                        <option value="moderator">Moderator</option>
                      </select>
                    </div>
                  ))}
              </div>
            </div>
          )}
          <div className="group-manage-section">
            <h3>Remove member</h3>
            <div className="crew-picker">
              {removable.length ? (
                removable.map((person) => (
                  <button
                    type="button"
                    disabled={busy === person.id}
                    onClick={() => member(person, "kick")}
                    key={person.id}
                  >
                    <Avatar profile={person} />
                    <span>
                      <strong>{person.username}</strong>
                      <small>{person.rank || "Crew Member"}</small>
                    </span>
                    <em>Remove</em>
                  </button>
                ))
              ) : (
                <p className="micro-copy">
                  No members are available to remove.
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function DirectActionsMenu({
  onDelete,
  user,
  conversationId,
  preference,
  onPreferenceChanged,
  onNotice,
}) {
  const [open, setOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const buttonRef = useRef(null);
  function toggleMenu() {
    if (open) return setOpen(false);
    const bounds = buttonRef.current?.getBoundingClientRect();
    setMenuPosition(
      bounds
        ? {
            top: Math.min(bounds.bottom + 8, window.innerHeight - 110),
            right: Math.max(12, window.innerWidth - bounds.right),
          }
        : { top: 80, right: 20 },
    );
    setOpen(true);
  }
  return (
    <div className="group-actions-menu-wrap">
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        title="Conversation options"
        aria-label="Conversation options"
        aria-expanded={open}
        onClick={toggleMenu}
      >
        <MoreVertical />
      </button>
      {open &&
        createPortal(
          <div
            className="group-actions-menu-layer"
            onMouseDown={(event) =>
              event.target === event.currentTarget && setOpen(false)
            }
          >
            <div
              className="group-actions-menu group-actions-menu-portal"
              role="menu"
              style={menuPosition || undefined}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="group-actions-menu-item"
                onClick={() => {
                  setOpen(false);
                  setPreferencesOpen(true);
                }}
              >
                <BellRing /> Notifications & sound
              </button>
              <button
                type="button"
                className="group-actions-menu-item"
                onClick={() => {
                  setOpen(false);
                  setDetailsOpen(true);
                }}
              >
                <Hash /> Conversation info & reminders
              </button>
              <button
                type="button"
                className="group-actions-menu-item danger"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
              >
                <Trash2 /> Delete conversation
              </button>
            </div>
          </div>,
          document.body,
        )}
      {preferencesOpen && (
        <Modal
          title="Conversation notifications"
          onClose={() => setPreferencesOpen(false)}
        >
          <ConversationNotificationControl
            kind="dm"
            conversationId={conversationId}
            userId={user.id}
            preference={preference}
            onChanged={onPreferenceChanged}
            expanded
          />
        </Modal>
      )}
      {detailsOpen && (
        <Modal
          title="Conversation information"
          onClose={() => setDetailsOpen(false)}
        >
          <ConversationDetails
            kind="dm"
            conversationId={conversationId}
            userId={user.id}
            onNotice={onNotice}
          />
        </Modal>
      )}
    </div>
  );
}

function GroupActionsMenu({
  group,
  user,
  role,
  onChanged,
  onNotice,
  onLeave,
  preference,
  onPreferenceChanged,
}) {
  const [open, setOpen] = useState(false);
  const [pollsOpen, setPollsOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const buttonRef = useRef(null);
  const canManage = role === "owner" || role === "moderator";
  function toggleMenu() {
    if (open) {
      setOpen(false);
      return;
    }
    const bounds = buttonRef.current?.getBoundingClientRect();
    setMenuPosition(
      bounds
        ? {
            top: Math.min(bounds.bottom + 8, window.innerHeight - 190),
            right: Math.max(12, window.innerWidth - bounds.right),
          }
        : { top: 80, right: 20 },
    );
    setOpen(true);
  }
  return (
    <div className="group-actions-menu-wrap">
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        title="Group options"
        aria-label="Group options"
        aria-expanded={open}
        onClick={toggleMenu}
      >
        <MoreVertical />
      </button>
      {open &&
        createPortal(
          <div
            className="group-actions-menu-layer"
            onMouseDown={(event) =>
              event.target === event.currentTarget && setOpen(false)
            }
          >
            <div
              className="group-actions-menu group-actions-menu-portal"
              role="menu"
              style={menuPosition || undefined}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="group-actions-menu-item"
                onClick={() => {
                  setOpen(false);
                  setPreferencesOpen(true);
                }}
              >
                <BellRing /> Notifications & sound
              </button>
              <button
                type="button"
                className="group-actions-menu-item"
                onClick={() => {
                  setOpen(false);
                  setPollsOpen(true);
                }}
              >
                <BarChart3 /> Polls
              </button>
              <button
                type="button"
                className="group-actions-menu-item"
                onClick={() => {
                  setOpen(false);
                  setDetailsOpen(true);
                }}
              >
                <Hash /> Group info & reminders
              </button>
              {canManage && (
                <ManageGroupButton
                  group={group}
                  user={user}
                  onChanged={onChanged}
                  onNotice={onNotice}
                  menuItem
                  label="Manage group & roles"
                  onClosed={() => setOpen(false)}
                />
              )}
              <button
                type="button"
                className="group-actions-menu-item danger"
                onClick={() => {
                  setOpen(false);
                  onLeave();
                }}
              >
                <Trash2 />{" "}
                {role === "owner" ? "Delete or leave group" : "Leave group"}
              </button>
            </div>
          </div>,
          document.body,
        )}
      <GroupPolls
        group={group}
        user={user}
        role={role}
        onNotice={onNotice}
        open={pollsOpen}
        onClose={() => setPollsOpen(false)}
      />
      {preferencesOpen && (
        <Modal
          title="Group notifications"
          onClose={() => setPreferencesOpen(false)}
        >
          <ConversationNotificationControl
            kind="group"
            conversationId={group.id}
            userId={user.id}
            preference={preference}
            onChanged={onPreferenceChanged}
            expanded
          />
        </Modal>
      )}
      {detailsOpen && (
        <Modal
          title="Group conversation information"
          onClose={() => setDetailsOpen(false)}
        >
          <ConversationDetails
            kind="group"
            conversationId={group.id}
            userId={user.id}
            onNotice={onNotice}
          />
        </Modal>
      )}
    </div>
  );
}

function GroupMessagesPage({
  user,
  profile,
  route,
  onRouteConsumed,
  onShowDms,
}) {
  const [groups, setGroups] = useState([]);
  const [invites, setInvites] = useState([]);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversationFeatures, reloadConversationFeatures] =
    useConversationFeatures("group", selected?.id, user.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [, setReadRevision] = useState(0);
  const [replying, setReplying] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const endRef = useRef();
  useEffect(() => {
    const refresh = () => setReadRevision((value) => value + 1);
    window.addEventListener("message-reads", refresh);
    return () => window.removeEventListener("message-reads", refresh);
  }, []);
  useEffect(() => {
    if (!route?.group) return;
    const found = groups.find((item) => item.id === route.group);
    if (found) setSelected(found);
  }, [route?.group, groups.length]);
  async function loadGroups(targetId) {
    try {
      const [rows, pendingInvites] = await Promise.all([
        getGroupConversations(user.id),
        getPendingGroupInvites(),
      ]);
      setGroups(rows);
      setInvites(pendingInvites || []);
      setSelected(
        (current) =>
          rows.find((item) => item.id === (targetId || current?.id)) ||
          rows[0] ||
          null,
      );
      setError("");
    } catch (exception) {
      setError(exception.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadGroups(route?.group);
    const channel = supabase
      .channel(`desktop-groups-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_conversations" },
        () => loadGroups(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_members" },
        () => loadGroups(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_invites" },
        () => loadGroups(),
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user.id]);
  useEffect(() => {
    if (!selected) {
      setDetails(null);
      setMessages([]);
      return;
    }
    let live = true;
    markConversationRead(selected.id, true, selected.updated_at);
    Promise.all([getGroupDetails(selected.id), getGroupMessages(selected.id)])
      .then(([group, rows]) => {
        if (live) {
          setDetails(group);
          setMessages(rows);
        }
      })
      .catch((exception) => setError(exception.message));
    const channel = supabase
      .channel(`desktop-group-${selected.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${selected.id}`,
        },
        async () => {
          const rows = await getGroupMessages(selected.id);
          if (live) setMessages(rows);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_members",
          filter: `group_id=eq.${selected.id}`,
        },
        async () => {
          if (live) setDetails(await getGroupDetails(selected.id));
        },
      )
      .subscribe();
    return () => {
      live = false;
      supabase.removeChannel(channel);
    };
  }, [selected?.id]);
  useEffect(() => {
    if (!route?.call || !details || details.id !== selected?.id) return;
    window.dispatchEvent(
      new CustomEvent("crewdeck-open-call", {
        detail: {
          conversation: {
            ...details,
            type: "group",
            meName: profile.username,
            meAvatar: profile.avatar,
          },
          requestedCallId: route.call,
        },
      }),
    );
    onRouteConsumed?.();
  }, [route?.call, details?.id, selected?.id]);
  useEffect(() => {
    scrollMessageStream(endRef);
  }, [messages.length]);
  useEffect(() => {
    const last = messages.at(-1);
    if (selected?.id && last)
      markMessageRead("group", selected.id, last.id, user.id).catch(() => {});
  }, [selected?.id, messages.at(-1)?.id, user.id]);
  const profiles = useMemo(
    () =>
      Object.fromEntries(
        (details?.members || []).map((member) => [member.id, member]),
      ),
    [details],
  );
  const myGroupRole =
    (Array.isArray(details?.members) ? details.members : []).find(
      (member) => member.id === user.id,
    )?.groupRole || (details?.owner_id === user.id ? "owner" : "member");
  const byId = useMemo(
    () => Object.fromEntries(messages.map((item) => [item.id, item])),
    [messages],
  );
  const visible = groups.filter((item) =>
    item.name?.toLowerCase().includes(query.toLowerCase()),
  );
  async function send(event) {
    event.preventDefault();
    const input = event.currentTarget.elements.message;
    const content = input.value.trim();
    if (!content || !selected) return;
    try {
      const blocked = await restrictionMessage(user.id, "messaging");
      if (blocked) throw new Error(blocked);
      const sent = await sendGroupMessage(
        selected.id,
        user.id,
        content,
        replying?.id || null,
      );
      setMessages((rows) =>
        rows.some((row) => row.id === sent.id) ? rows : [...rows, sent],
      );
      setReplying(null);
    } catch (exception) {
      setNotice(exception.message);
      return false;
    }
  }
  async function remove(item) {
    const pollId = String(item.content || "").match(
      /^\[\[crewdeck-poll:([0-9a-f-]{36})\]\]$/i,
    )?.[1];
    if (pollId) {
      const { error } = await supabase.rpc("delete_group_poll_message", {
        poll_key: pollId,
      });
      if (error) throw error;
      setMessages((rows) => rows.filter((row) => row.id !== item.id));
      return;
    }
    await deleteGroupMessage(item.id, user.id);
    setMessages((rows) => rows.filter((row) => row.id !== item.id));
    setReplying((current) => (current?.id === item.id ? null : current));
  }
  async function refreshMessages() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadGroups(selected?.id);
      if (selected) {
        const [group, rows] = await Promise.all([
          getGroupDetails(selected.id),
          getGroupMessages(selected.id),
        ]);
        setDetails(group);
        setMessages(rows);
      }
      setNotice("Group messages refreshed.");
    } catch (exception) {
      setNotice(exception.message);
    } finally {
      setRefreshing(false);
    }
  }
  async function leave() {
    try {
      let newOwner = null;
      if (details?.owner_id === user.id) {
        const others = details.members.filter(
          (member) => member.id !== user.id,
        );
        const transfer =
          others.length > 0 &&
          (await confirmInApp(
            "Choose another member to own this group before you leave. Canceling here will offer the option to delete the group instead.",
            {
              title: "Transfer group ownership?",
              confirmLabel: "Choose new owner",
              danger: false,
            },
          ));
        if (transfer) {
          const username = await promptInApp(
            `Available members: ${others.map((member) => member.username).join(", ")}`,
            "",
            {
              title: "Choose the new owner",
              inputLabel: "Exact username",
              confirmLabel: "Transfer & leave",
            },
          );
          if (!username) return;
          newOwner = others.find(
            (member) =>
              member.username.toLowerCase() === username.toLowerCase(),
          )?.id;
          if (!newOwner) throw new Error("Choose a listed member.");
        } else {
          const approved = await confirmInApp(
            "Everyone will be removed and this group conversation will be permanently deleted.",
            {
              title: "Delete this group?",
              confirmLabel: "Delete group",
            },
          );
          if (!approved) return;
        }
      } else {
        const approved = await confirmInApp(
          "You will stop receiving messages from this group.",
          { title: "Leave this group?", confirmLabel: "Leave group" },
        );
        if (!approved) return;
      }
      await leaveGroupConversation(selected.id, newOwner);
      setSelected(null);
      await loadGroups();
      setNotice(
        myGroupRole === "owner" && !newOwner
          ? "Group conversation deleted."
          : "You left the group.",
      );
    } catch (exception) {
      setNotice(exception.message);
    }
  }
  async function created(id) {
    await loadGroups(id);
    setNotice("Group conversation created.");
  }
  if (loading)
    return (
      <div className="page">
        <Loading />
      </div>
    );
  if (error)
    return (
      <div className="page">
        <ErrorState message={error} retry={() => loadGroups(route?.group)} />
      </div>
    );
  return (
    <div className="page messages-page">
      <PageHeader
        eyebrow="Crew comms"
        title="Messages"
        description="Direct and group conversations, requests, replies, editing, and voice calls."
        action={
          <div className="header-actions">
            <button
              className="icon-button refresh-button"
              title="Refresh group messages"
              onClick={refreshMessages}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              <RefreshCw className={refreshing ? "spin" : ""} />
            </button>
            <button
              className="button ghost"
              onClick={() => markAllConversationsRead(groups, true)}
            >
              <CheckCheck /> Mark all read
            </button>
            <CreateGroupButton
              user={user}
              profile={profile}
              onCreated={created}
              onNotice={setNotice}
            />
          </div>
        }
      />
      <div className="message-mode-tabs">
        <button onClick={onShowDms}>DM Messages</button>
        <button className="active">Group Messages</button>
      </div>
      {notice && <p className="form-message">{notice}</p>}
      {invites.length > 0 && (
        <section className="panel group-invite-panel">
          <header>
            <Users />
            <div>
              <h2>Group invitations</h2>
              <p>Join only the group conversations you want.</p>
            </div>
          </header>
          <div className="group-invite-list">
            {invites.map((invite) => (
              <article key={invite.group_id}>
                <Avatar
                  profile={{
                    avatar: invite.avatar_url,
                    username: invite.group_name,
                  }}
                />
                <span>
                  <strong>{invite.group_name}</strong>
                  <small>
                    Invited by {invite.inviter_name || "a crew member"}
                  </small>
                </span>
                <div>
                  <button
                    className="button primary"
                    onClick={async () => {
                      try {
                        await respondToGroupInvite(invite.group_id, "accepted");
                        await loadGroups(invite.group_id);
                        setNotice(`Joined ${invite.group_name}.`);
                      } catch (exception) {
                        setNotice(exception.message);
                      }
                    }}
                  >
                    Accept
                  </button>
                  <button
                    className="button ghost"
                    onClick={async () => {
                      try {
                        await respondToGroupInvite(invite.group_id, "declined");
                        await loadGroups();
                        setNotice(`Declined ${invite.group_name}.`);
                      } catch (exception) {
                        setNotice(exception.message);
                      }
                    }}
                  >
                    Decline
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="messages-layout group-messages-layout">
        <aside className="panel conversation-list">
          <div className="conversation-search">
            <Search />
            <input
              placeholder="Search groups"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {visible.map((group) => (
            <button
              className={
                selected?.id === group.id
                  ? "conversation active"
                  : "conversation"
              }
              onClick={() => setSelected(group)}
              key={group.id}
            >
              <Avatar
                profile={{ avatar: group.avatar_url, username: group.name }}
              />
              <span>
                <strong>{group.name}</strong>
                <small className="presence-chip group">
                  <i />
                  <Users /> Group chat
                </small>
              </span>
              {conversationUnreadCount(group.id, true) > 0 && (
                <b className="conversation-unread">
                  {conversationUnreadCount(group.id, true)}
                </b>
              )}
            </button>
          ))}
        </aside>
        <section className="panel chat-panel">
          {details ? (
            <>
              <header className="chat-header">
                <div className="card-person">
                  <Avatar
                    profile={{
                      avatar: details.avatar_url,
                      username: details.name,
                    }}
                  />
                  <div>
                    <h3>{details.name}</h3>
                    {details.description && (
                      <small className="group-description">
                        {details.description}
                      </small>
                    )}
                  </div>
                </div>
                <div className="group-chat-actions">
                  <button
                    className="icon-button"
                    title={
                      isMuted(selected.id, true)
                        ? "Unmute notifications"
                        : "Mute notifications"
                    }
                    onClick={() => {
                      setMuted(selected.id, true, !isMuted(selected.id, true));
                      setReadRevision((value) => value + 1);
                    }}
                  >
                    {isMuted(selected.id, true) ? <BellOff /> : <BellRing />}
                  </button>
                  <button
                    className="icon-button call"
                    title="Start group call"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("crewdeck-open-call", {
                          detail: {
                            conversation: {
                              ...details,
                              type: "group",
                              meName: profile.username,
                              meAvatar: profile.avatar,
                            },
                          },
                        }),
                      )
                    }
                  >
                    <Phone />
                  </button>
                  <GroupActionsMenu
                    group={details}
                    user={user}
                    role={myGroupRole}
                    onNotice={setNotice}
                    onLeave={leave}
                    preference={conversationFeatures.preferences}
                    onPreferenceChanged={reloadConversationFeatures}
                    onChanged={async () => {
                      const group = await getGroupDetails(selected.id);
                      setDetails(group);
                      await loadGroups(selected.id);
                    }}
                  />
                </div>
              </header>
              <div className="message-stream">
                <PinnedMessages
                  pins={conversationFeatures.pins}
                  canManage={
                    myGroupRole === "owner" || myGroupRole === "moderator"
                  }
                  onChanged={reloadConversationFeatures}
                />
                {messages.map((item) => {
                  const sender = profiles[item.sender_id];
                  const quoted = item.reply_to_id
                    ? byId[item.reply_to_id]
                    : null;
                  const pollMarker = item.content.match(
                    /^\[\[crewdeck-poll:([0-9a-f-]{36})\]\]$/i,
                  );
                  return (
                    <div
                      className={
                        item.sender_id === user.id ? "message mine" : "message"
                      }
                      tabIndex={0}
                      key={item.id}
                    >
                      {item.sender_id !== user.id && (
                        <small className="message-author">
                          {sender?.username || "Former member"}
                        </small>
                      )}
                      <MessageReplyQuote
                        message={item}
                        messages={messages}
                        people={Object.values(profiles)}
                      />
                      {item.forwarded_from_kind && (
                        <small className="forwarded-message-label">
                          Forwarded from{" "}
                          {item.forwarded_from_kind === "group"
                            ? "a group"
                            : "a direct message"}
                        </small>
                      )}
                      {pollMarker ? (
                        <InlineGroupPoll
                          pollId={pollMarker[1]}
                          groupId={selected.id}
                          user={user}
                          role={myGroupRole}
                          onNotice={setNotice}
                        />
                      ) : (
                        <p>
                          <FormattedMessage>{item.content}</FormattedMessage>
                        </p>
                      )}
                      <div className="message-footer">
                        <time>
                          {new Date(item.created_at).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                          {item.edited_at ? " · Edited" : ""}
                        </time>
                        <div className="message-actions">
                          <button
                            onClick={() => setReplying(item)}
                            title="Reply"
                          >
                            <Reply />
                          </button>
                          {item.sender_id === user.id && (
                            <>
                              <EditMessageButton
                                message={item}
                                userId={user.id}
                                saveMessage={editGroupMessage}
                                onSaved={(content) =>
                                  setMessages((rows) =>
                                    rows.map((row) =>
                                      row.id === item.id
                                        ? {
                                            ...row,
                                            content,
                                            edited_at: new Date().toISOString(),
                                          }
                                        : row,
                                    ),
                                  )
                                }
                              />
                              <button
                                className="delete"
                                onClick={() => setDeleting(item)}
                                title="Delete"
                              >
                                <Trash2 />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <MessageFeatureBar
                        kind="group"
                        conversationId={selected.id}
                        message={item}
                        userId={user.id}
                        reactions={conversationFeatures.reactions}
                        receipts={conversationFeatures.receipts}
                        canPin={
                          myGroupRole === "owner" || myGroupRole === "moderator"
                        }
                        onChanged={reloadConversationFeatures}
                        onNotice={setNotice}
                      />
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              {replying && (
                <div className="reply-bar">
                  <span>
                    Replying to:{" "}
                    <FormattedMessage>{replying.content}</FormattedMessage>
                  </span>
                  <button onClick={() => setReplying(null)}>
                    <X />
                  </button>
                </div>
              )}
              <MessageComposer
                key={selected.id}
                id={selected.id}
                group
                user={user}
                people={details.members}
                placeholder={`Message ${details.name}`}
                onSend={send}
              />
            </>
          ) : (
            <Empty
              title="Choose a group"
              body="Select a group conversation or create one."
            />
          )}
        </section>
        <aside className="panel group-members">
          <h3>
            Members (
            {Array.isArray(details?.members) ? details.members.length : 0})
          </h3>
          {(Array.isArray(details?.members) ? details.members : []).map(
            (member) => {
              const online =
                member.last_seen &&
                Date.now() - new Date(member.last_seen).getTime() < 120000;
              return (
                <div className="group-member" key={member.id}>
                  <Avatar profile={member} size={34} />
                  <span>
                    <strong>{member.username}</strong>
                    <small
                      className={`presence-chip ${online ? "online" : "offline"}`}
                    >
                      <i />
                      {member.groupRole === "owner"
                        ? "Owner · "
                        : member.groupRole === "moderator"
                          ? "Moderator · "
                          : ""}
                      {online ? "Online" : "Offline"}
                    </small>
                  </span>
                </div>
              );
            },
          )}
        </aside>
      </div>
      {deleting && (
        <DeleteMessageDialog
          message={deleting}
          onClose={() => setDeleting(null)}
          onDelete={remove}
        />
      )}
    </div>
  );
}

export default function MessagesPage(props) {
  const [mode, setMode] = useState(
    props.route?.group || props.route?.view === "groups" ? "group" : "dm",
  );
  useEffect(() => {
    if (props.route?.group || props.route?.view === "groups") setMode("group");
    else if (props.route?.conversation) setMode("dm");
  }, [props.route?.group, props.route?.conversation, props.route?.view]);
  return (
    <>
      <MessageNotices />
      {mode === "group" ? (
        <GroupMessagesPage {...props} onShowDms={() => setMode("dm")} />
      ) : (
        <DirectMessagesPage {...props} onShowGroups={() => setMode("group")} />
      )}
    </>
  );
}
