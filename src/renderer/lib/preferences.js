// Legacy storage keys are retained so the CrewDeck update preserves preferences, drafts, and unread state.
const SETTINGS_KEY = "cptspacedust.desktop.preferences.v1";
const READ_KEY = "cptspacedust.desktop.message-reads.v1";
const UNREAD_KEY = "cptspacedust.desktop.message-unread.v1";
const DRAFT_PREFIX = "cptspacedust.desktop.draft.";

export const defaultPreferences = Object.freeze({
  glassIntensity: "balanced",
  accent: "blue",
  reducedEffects: false,
  compactLayout: false,
  reduceMotion: false,
  interfaceScale: 100,
  highContrast: false,
  strongFocus: false,
  underlineLinks: false,
  largeControls: false,
  enterToSend: true,
  desktopNotifications: true,
  messageNotifications: true,
  notificationSound: true,
  notificationVolume: 82,
  hideNotificationContentWhenLocked: false,
  quietHours: false,
  quietStart: "22:00",
  quietEnd: "08:00",
  meetupReminders: true,
  reminderMinutes: 15,
  inactivityLockMinutes: 0,
  audioInputDeviceId: "",
  audioOutputDeviceId: "",
  pushToTalkDefault: false,
  pushToTalkKey: "Space",
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  mutedConversations: {},
});

export function applyPreferences(settings = getPreferences()) {
  const root = document.documentElement;
  root.dataset.glass = settings.glassIntensity || "balanced";
  root.dataset.accent = settings.accent || "blue";
  root.dataset.effects = settings.reducedEffects ? "reduced" : "full";
  root.dataset.density = settings.compactLayout ? "compact" : "comfortable";
  root.dataset.motion = settings.reduceMotion ? "reduced" : "full";
  root.dataset.contrast = settings.highContrast ? "high" : "standard";
  root.dataset.focus = settings.strongFocus ? "strong" : "standard";
  root.dataset.links = settings.underlineLinks ? "underlined" : "standard";
  root.dataset.controls = settings.largeControls ? "large" : "standard";
  root.style.setProperty(
    "--interface-scale",
    String((Number(settings.interfaceScale) || 100) / 100),
  );
  root.dataset.mayuLoaders = "on";
  return settings;
}

function readJson(key, fallback) {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key) || "{}") };
  } catch {
    return { ...fallback };
  }
}
export function getPreferences() {
  return readJson(SETTINGS_KEY, defaultPreferences);
}
export function updatePreferences(changes) {
  const next = { ...getPreferences(), ...changes };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  applyPreferences(next);
  window.dispatchEvent(
    new CustomEvent("desktop-preferences", { detail: next }),
  );
  return next;
}
export function isQuietTime(settings = getPreferences(), now = new Date()) {
  if (!settings.quietHours) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const parse = (value) => {
    const [h, m] = String(value).split(":").map(Number);
    return h * 60 + m;
  };
  const start = parse(settings.quietStart),
    end = parse(settings.quietEnd);
  return (
    start === end ||
    (start < end
      ? minutes >= start && minutes < end
      : minutes >= start || minutes < end)
  );
}
export function conversationKey(id, group = false) {
  return `${group ? "group" : "dm"}:${id}`;
}
export function isMuted(id, group = false, settings = getPreferences()) {
  return Boolean(settings.mutedConversations?.[conversationKey(id, group)]);
}
export function setMuted(id, group, muted) {
  const settings = getPreferences();
  const mutedConversations = { ...(settings.mutedConversations || {}) };
  const key = conversationKey(id, group);
  if (muted) mutedConversations[key] = true;
  else delete mutedConversations[key];
  return updatePreferences({ mutedConversations });
}
function reads() {
  return readJson(READ_KEY, {});
}
export function markConversationRead(
  id,
  group = false,
  at = new Date().toISOString(),
) {
  const next = { ...reads(), [conversationKey(id, group)]: at };
  localStorage.setItem(READ_KEY, JSON.stringify(next));
  const unread = readJson(UNREAD_KEY, {});
  delete unread[conversationKey(id, group)];
  localStorage.setItem(UNREAD_KEY, JSON.stringify(unread));
  window.dispatchEvent(new CustomEvent("message-reads"));
}
export function markConversationUnread(id, group = false) {
  const unread = readJson(UNREAD_KEY, {}),
    key = conversationKey(id, group);
  unread[key] = Number(unread[key] || 0) + 1;
  localStorage.setItem(UNREAD_KEY, JSON.stringify(unread));
  window.dispatchEvent(new CustomEvent("message-reads"));
}
export function conversationUnreadCount(id, group = false) {
  return Number(readJson(UNREAD_KEY, {})[conversationKey(id, group)] || 0);
}
export function totalMessageUnread() {
  return Object.values(readJson(UNREAD_KEY, {})).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );
}
export function isConversationUnread(id, updatedAt, group = false) {
  if (!updatedAt) return false;
  const seen = reads()[conversationKey(id, group)];
  return !seen || new Date(updatedAt) > new Date(seen);
}
export function markAllConversationsRead(items, group = false) {
  const next = reads();
  items.forEach((item) => {
    next[conversationKey(item.id, group)] =
      item.updated_at || new Date().toISOString();
  });
  localStorage.setItem(READ_KEY, JSON.stringify(next));
  const unread = readJson(UNREAD_KEY, {});
  items.forEach((item) => delete unread[conversationKey(item.id, group)]);
  localStorage.setItem(UNREAD_KEY, JSON.stringify(unread));
  window.dispatchEvent(new CustomEvent("message-reads"));
}
export function draftKey(userId, id, group = false) {
  return `${DRAFT_PREFIX}${userId}.${conversationKey(id, group)}`;
}
export function loadDraft(userId, id, group = false) {
  return localStorage.getItem(draftKey(userId, id, group)) || "";
}
export function saveDraft(userId, id, group, value) {
  const key = draftKey(userId, id, group);
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
}
