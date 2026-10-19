import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, MessageCircle, Phone, PhoneOff } from "lucide-react";
import AuthScreen from "./components/AuthScreen";
import LockScreen from "./components/LockScreen";
import ResetPasswordScreen from "./components/ResetPasswordScreen";
import Sidebar from "./components/Sidebar";
import AppSettings from "./components/AppSettings";
import { MayuLoader } from "./components/MayuLoader";
import StartupScreen from "./components/StartupScreen";
import PageErrorBoundary from "./components/PageErrorBoundary";
import { getActiveRestrictions, getProfile, updatePresence } from "./lib/data";
import { supabase } from "./lib/supabase";
import {
  playNotificationSound,
  startRingtone,
  stopRingtone,
} from "./lib/sounds";
import {
  CollabsPage,
  IdeasPage,
  IntroductionsPage,
  ProfilePage,
  SupportPage,
} from "./pages/CommunityPagesV2";
import {
  BirthdaysPage,
  CrewPage,
  CrewProfilePage,
  GuidelinesPage,
} from "./pages/EnhancedCommunityPages";
import MeetupsPage from "./pages/MeetupsPage";
import MessagesPage, { VoiceCall } from "./pages/MessagesPageV2";
import NotificationsPage from "./pages/NotificationsPage";
import { useMessageAlerts } from "./lib/messageAlerts";
import { activeConversation } from "./components/MessageComposer";
import { shouldAlertForMessage } from "./lib/messageBehavior.mjs";
import { claimConversationAlert } from "./lib/alertDelivery.mjs";
import CaptainPage from "./pages/CaptainPage";
import ControlCenterPage from "./pages/ControlCenterPage";
import FriendsPage from "./pages/FriendsPage";
import {
  BugReportsPage,
  CommunityCalendarPage,
  HelpRequestsPage,
} from "./pages/CommunityToolsPage";
import UpdateOverlay from "./components/UpdateVisual";
import { InAppDialogHost } from "./components/InAppDialog";
import CommandPalette from "./components/CommandPalette";
import {
  ConnectivityBanner,
  CommunityStatus,
  InactivityLock,
  useMeetupReminders,
  useMessageReminders,
  WhatsNew,
} from "./components/DesktopEnhancements";
import {
  getPreferences,
  isMuted,
  isQuietTime,
  markConversationUnread,
  totalMessageUnread,
} from "./lib/preferences";

function parseNavigation(value) {
  const raw = String(value || "");
  let url;
  try {
    url = new URL(raw, "https://app.local/");
  } catch {
    return { page: "introductions" };
  }
  const name = url.pathname
    .split("/")
    .pop()
    .replace(/\.html$/i, "")
    .toLowerCase();
  const map = {
    communityintroductions: "introductions",
    ideas: "ideas",
    collab: "collabs",
    crew: "crew",
    memberbirthdays: "birthdays",
    communityguidelines: "guidelines",
    meetupcalendar: "meetups",
    mymeetups: "my-meetups",
    support: "support",
    profile: "profile",
    security: "profile",
    messages: "messages",
    conversation: "messages",
    notifications: "notifications",
    appsettings: "settings",
    captainpanel: "captain",
    controlcenter: "control-center",
    "control-center": "control-center",
  };
  return {
    page: map[name] || "introductions",
    conversation:
      url.searchParams.get("id") || url.searchParams.get("conversation"),
    group: url.searchParams.get("group"),
    view: url.searchParams.get("view"),
    call: url.searchParams.get("call"),
    startCall: url.searchParams.get("start_call") === "1",
  };
}

async function consumeDeepLink(link, setRecovery) {
  try {
    const url = new URL(link);
    if (url.hostname !== "reset-password") return;
    const params = new URLSearchParams(url.hash.replace(/^#/, ""));
    const access_token = params.get("access_token"),
      refresh_token = params.get("refresh_token");
    if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (error) throw error;
    }
    setRecovery(true);
  } catch (error) {
    console.error("Could not open recovery link", error);
  }
}

export default function App() {
  const [lock, setLock] = useState({ loading: true, locked: false });
  const [session, setSession] = useState(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [profile, setProfile] = useState(null);
  const [page, setPage] = useState(
    () => getPreferences().startupPage || "introductions",
  );
  const [loading, setLoading] = useState(true);
  const [startupMinimumElapsed, setStartupMinimumElapsed] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [initialPerson, setInitialPerson] = useState(null);
  const [viewedPerson, setViewedPerson] = useState(null);
  const [messageRoute, setMessageRoute] = useState(null);
  const [unread, setUnread] = useState(0);
  const [messageUnread, setMessageUnread] = useState(() =>
    totalMessageUnread(),
  );
  const [toast, setToast] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const incomingCallRef = useRef(null);
  useMessageAlerts(mfaRequired ? null : session?.user?.id);
  useMeetupReminders(mfaRequired ? null : session?.user?.id);
  useMessageReminders(mfaRequired ? null : session?.user?.id);
  useEffect(() => {
    const timer = window.setTimeout(() => setStartupMinimumElapsed(true), 2600);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const refresh = () => setMessageUnread(totalMessageUnread());
    window.addEventListener("message-reads", refresh);
    return () => window.removeEventListener("message-reads", refresh);
  }, []);
  useEffect(() => {
    window.desktop.appLock
      .getState()
      .then((value) => setLock({ loading: false, ...value }));
    return window.desktop.appLock.onState((value) =>
      setLock({ loading: false, ...value }),
    );
  }, []);
  useEffect(() => {
    let active = true;
    async function apply(next) {
      if (!active) return;
      setSession(next);
      if (next) {
        const { data } =
          await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (active)
          setMfaRequired(
            data?.nextLevel === "aal2" && data?.currentLevel !== "aal2",
          );
      } else setMfaRequired(false);
      setLoading(false);
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => {
        setTimeout(() => apply(next), 0);
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    getProfile(session.user.id).then(setProfile);
  }, [session?.user?.id]);
  useEffect(() => {
    if (!session?.user) return;
    const userId = session.user.id;
    let interval;
    let channel;
    async function refresh() {
      const restrictions = await getActiveRestrictions(userId).catch(() => []);
      const site = restrictions.find((item) => item.action === "site");
      if (site) {
        window.desktop.notify(
          "Site access suspended",
          `Your account is restricted until ${new Date(site.expires_at).toLocaleString()}.`,
          "",
          {
            hideWhenLocked: getPreferences().hideNotificationContentWhenLocked,
          },
        );
        await supabase.auth.signOut();
        return;
      }
      await updatePresence(userId).catch(() => {});
    }
    refresh();
    interval = setInterval(refresh, 30000);
    channel = supabase
      .channel(`desktop-restrictions-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_restrictions",
          filter: `user_id=eq.${userId}`,
        },
        refresh,
      )
      .subscribe();
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);
  useEffect(
    () =>
      window.desktop.onDeepLink((link) => consumeDeepLink(link, setRecovery)),
    [],
  );
  useEffect(() => window.desktop.onNavigate((value) => navigate(value)), []);
  useEffect(() => {
    const openCall = (event) => setActiveCall(event.detail);
    window.addEventListener("crewdeck-open-call", openCall);
    return () => window.removeEventListener("crewdeck-open-call", openCall);
  }, []);
  useEffect(() => {
    incomingCallRef.current = incomingCall;
    if (!incomingCall) return;
    const timeout = window.setTimeout(() => {
      stopRingtone();
      setIncomingCall(null);
    }, 90000);
    return () => window.clearTimeout(timeout);
  }, [incomingCall]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    if (!session?.user) return;
    const userId = session.user.id;
    let alive = true;
    let bootstrapped = false;
    const listeningSince = Date.now() - 2000;
    const fingerprints = new Map();
    const fingerprint = (item) =>
      [
        item?.id,
        item?.updated_at,
        item?.created_at,
        item?.is_read,
        item?.title,
        item?.message,
        item?.link,
      ].join("|");
    const cancelledCall = (item) => {
      if (item?.type !== "voice_call") return false;
      try {
        const target = new URL(item.link || "", "https://app.local/");
        return target.searchParams.get("cancelled") === "1";
      } catch {
        return false;
      }
    };
    async function deliver(item, force = false) {
      if (!alive || !item?.id) return;
      const nextFingerprint = fingerprint(item);
      if (!force && fingerprints.get(item.id) === nextFingerprint) return;
      fingerprints.set(item.id, nextFingerprint);
      if (item.is_read) return;

      const preferences = getPreferences();
      if (item.type === "voice_call") {
        if (cancelledCall(item)) {
          if (incomingCallRef.current?.id === item.id) {
            stopRingtone();
            setIncomingCall(null);
          }
          return;
        }
        setIncomingCall(item);
        startRingtone();
        if (preferences.desktopNotifications && !isQuietTime(preferences))
          await window.desktop.notify(
            item.title || "Incoming voice call",
            item.message || "A crew member wants to call you!",
            item.link || "Notifications.html",
            {
              hideWhenLocked: preferences.hideNotificationContentWhenLocked,
            },
          );
        return;
      }

      if (item.type === "message") {
        const route = parseNavigation(item.link);
        const group = Boolean(route.group);
        const contextId = route.group || route.conversation;
        if (
          contextId &&
          !shouldAlertForMessage(
            activeConversation.current,
            contextId,
            group,
            document.hasFocus(),
            document.visibilityState === "visible",
          )
        )
          return;
        if (contextId) markConversationUnread(contextId, group);
        if (
          !preferences.desktopNotifications ||
          !preferences.messageNotifications ||
          isQuietTime(preferences) ||
          (contextId && isMuted(contextId, group, preferences)) ||
          !claimConversationAlert(contextId, group)
        )
          return;
        playNotificationSound();
        setToast(item);
        await window.desktop.notify(
          item.title || "New message",
          item.message || "You have a new message.",
          item.link || "Messages.html",
          {
            hideWhenLocked: preferences.hideNotificationContentWhenLocked,
          },
        );
        return;
      }

      if (!isQuietTime(preferences)) playNotificationSound();
      setToast(item);
      if (preferences.desktopNotifications && !isQuietTime(preferences))
        await window.desktop.notify(
          item.title || "Community update",
          item.message || "You have a new notification.",
          item.link || "Notifications.html",
          {
            hideWhenLocked: preferences.hideNotificationContentWhenLocked,
          },
        );
    }
    const refreshUnread = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      if (alive) setUnread(count || 0);
    };
    const pollNotifications = async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(80);
      if (!alive || error) return;
      const rows = data || [];
      if (!bootstrapped) {
        bootstrapped = true;
        for (const item of rows) fingerprints.set(item.id, fingerprint(item));
        const pending = rows
          .filter((item) => {
            const created = new Date(item.created_at).getTime();
            return (
              !item.is_read &&
              (created >= listeningSince ||
                (item.type === "voice_call" &&
                  !cancelledCall(item) &&
                  Date.now() - created < 90000))
            );
          })
          .reverse();
        for (const item of pending) await deliver(item, true);
      } else {
        for (const item of [...rows].reverse()) await deliver(item);
      }
      const ringing = incomingCallRef.current;
      if (ringing && !rows.some((item) => item.id === ringing.id)) {
        stopRingtone();
        setIncomingCall(null);
      }
    };
    const notificationsChanged = () => refreshUnread();
    refreshUnread();
    window.addEventListener("notifications-changed", notificationsChanged);
    const channel = supabase
      .channel(`desktop-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          refreshUnread();
          if (payload.eventType === "DELETE") {
            if (payload.old?.id === incomingCallRef.current?.id) {
              stopRingtone();
              setIncomingCall(null);
            }
            return;
          }
          if (["INSERT", "UPDATE"].includes(payload.eventType))
            deliver(payload.new).catch(console.error);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") pollNotifications();
      });
    const pollTimer = window.setInterval(() => {
      refreshUnread();
      pollNotifications();
    }, 4000);
    pollNotifications();
    return () => {
      alive = false;
      window.clearInterval(pollTimer);
      window.removeEventListener("notifications-changed", notificationsChanged);
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);
  function navigate(value) {
    const next = parseNavigation(value);
    if (next.page === "messages") {
      stopRingtone();
      setIncomingCall(null);
    }
    setPage(next.page);
    if (next.page === "messages") setMessageRoute(next);
  }
  function selectPage(nextPage) {
    if (nextPage === "messages") setMessageRoute({ page: "messages" });
    setPage(nextPage);
  }
  async function closeIncomingCall(open = false) {
    const item = incomingCallRef.current;
    stopRingtone();
    setIncomingCall(null);
    if (!open && item?.link) {
      try {
        const target = new URL(item.link, "https://app.local/");
        const callerId = target.searchParams.get("caller_id");
        const callId = target.searchParams.get("call");
        if (callerId && callId && callerId !== session.user.id) {
          target.searchParams.set("response", "declined");
          target.searchParams.set("responder_id", session.user.id);
          target.searchParams.set(
            "responder_name",
            profile?.username || "A crew member",
          );
          await supabase.rpc("create_notification", {
            target_user_id: callerId,
            notification_type: "voice_call_response",
            notification_title: "Call declined",
            notification_message: `${profile?.username || "A crew member"} declined your voice call.`,
            notification_link: `${target.pathname.split("/").pop()}${target.search}`,
          });
        }
      } catch {}
    }
    if (item?.id) {
      await supabase
        .from("notifications")
        .delete()
        .eq("id", item.id)
        .eq("user_id", session.user.id);
      setUnread((count) => Math.max(0, count - 1));
    }
    if (open && item?.link) navigate(item.link);
  }
  async function logout() {
    await supabase.auth.signOut();
    setPage("introductions");
  }
  function viewPerson(person) {
    setViewedPerson(person);
    setPage("crew-profile");
  }
  const content = useMemo(() => {
    if (!session?.user || !profile) return null;
    const props = { user: session.user, profile };
    switch (page) {
      case "captain":
        return <CaptainPage {...props} />;
      case "control-center":
        return <ControlCenterPage {...props} />;
      case "ideas":
        return <IdeasPage {...props} />;
      case "collabs":
        return <CollabsPage {...props} />;
      case "crew":
        return <CrewPage onViewProfile={viewPerson} />;
      case "friends":
        return (
          <FriendsPage
            {...props}
            onNavigate={navigate}
            onViewProfile={viewPerson}
          />
        );
      case "help-requests":
        return <HelpRequestsPage {...props} />;
      case "bug-reports":
        return <BugReportsPage {...props} />;
      case "community-calendar":
        return <CommunityCalendarPage {...props} />;
      case "crew-profile":
        return (
          <CrewProfilePage
            person={viewedPerson}
            user={session.user}
            onBack={() => setPage("crew")}
          />
        );
      case "birthdays":
        return <BirthdaysPage />;
      case "guidelines":
        return <GuidelinesPage />;
      case "meetups":
        return <MeetupsPage {...props} />;
      case "my-meetups":
        return <MeetupsPage {...props} myMeetupsOnly />;
      case "support":
        return <SupportPage profile={profile} onUpdated={setProfile} />;
      case "profile":
        return <ProfilePage {...props} onUpdated={setProfile} />;
      case "messages":
        return (
          <MessagesPage
            {...props}
            initialPerson={initialPerson}
            route={messageRoute}
            onRouteConsumed={() =>
              setMessageRoute((current) =>
                current
                  ? { ...current, call: null, startCall: false }
                  : current,
              )
            }
          />
        );
      case "notifications":
        return <NotificationsPage user={session.user} onNavigate={navigate} />;
      case "settings":
        return <AppSettings user={session.user} />;
      default:
        return <IntroductionsPage {...props} />;
    }
  }, [
    page,
    session?.user?.id,
    profile,
    initialPerson,
    messageRoute,
    viewedPerson,
  ]);
  if (!startupMinimumElapsed || lock.loading || loading)
    return <StartupScreen />;
  if (lock.locked) return <LockScreen />;
  if (recovery)
    return <ResetPasswordScreen onDone={() => setRecovery(false)} />;
  if (!session) return <AuthScreen />;
  if (mfaRequired)
    return (
      <AuthScreen
        initialMode="mfa"
        onMfaVerified={() => setMfaRequired(false)}
      />
    );
  if (!profile)
    return (
      <div className="boot-screen">
        <MayuLoader label="Loading your crew profile…" />
      </div>
    );
  return (
    <div className="app-shell">
      <UpdateOverlay />
      <InAppDialogHost />
      <WhatsNew />
      <InactivityLock enabled={lock.enabled} />
      <Sidebar
        page={page}
        setPage={selectPage}
        profile={profile}
        onLogout={logout}
        unread={unread}
      />
      <main className="main-shell">
        <ConnectivityBanner />
        <header className="topbar">
          <div className="desktop-drag-region" />
          <CommunityStatus />
          <div className="topbar-actions">
            <CommandPalette onNavigate={selectPage} />
            <button
              className={page === "messages" ? "active" : ""}
              title="Messages"
              aria-label="Messages"
              onClick={() => selectPage("messages")}
            >
              <MessageCircle />
              {messageUnread > 0 && (
                <b>{messageUnread > 99 ? "99+" : messageUnread}</b>
              )}
            </button>
            <button
              className={page === "notifications" ? "active" : ""}
              title="Notifications"
              aria-label="Notifications"
              onClick={() => selectPage("notifications")}
            >
              <Bell />
              {unread > 0 && <b>{unread}</b>}
            </button>
          </div>
        </header>
        <div className="content-shell">
          <PageErrorBoundary page={page}>{content}</PageErrorBoundary>
        </div>
      </main>
      {toast && !incomingCall && (
        <button
          type="button"
          className="desktop-notification-toast"
          onClick={() => {
            if (toast.link) navigate(toast.link);
            setToast(null);
          }}
        >
          <Bell />
          <span>
            <strong>{toast.title || "Community update"}</strong>
            <small>{toast.message || "You have a new notification."}</small>
          </span>
        </button>
      )}
      {incomingCall && (
        <section
          className="incoming-call-card"
          role="dialog"
          aria-modal="true"
          aria-label="Incoming voice call"
        >
          <span className="incoming-call-pulse">
            <Phone />
          </span>
          <div>
            <small>Incoming voice call</small>
            <strong>
              {incomingCall.message || "A crew member wants to call you!"}
            </strong>
          </div>
          <div className="incoming-call-actions">
            <button
              type="button"
              className="decline"
              onClick={() => closeIncomingCall(false)}
              title="Dismiss call"
            >
              <PhoneOff />
            </button>
            <button type="button" onClick={() => closeIncomingCall(true)}>
              <Phone /> Answer
            </button>
          </div>
        </section>
      )}
      {activeCall && (
        <VoiceCall
          conversation={activeCall.conversation}
          user={session.user}
          requestedCallId={activeCall.requestedCallId}
          onClose={() => setActiveCall(null)}
        />
      )}
    </div>
  );
}
