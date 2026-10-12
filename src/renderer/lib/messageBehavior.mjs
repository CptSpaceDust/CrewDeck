export function scrollMessageStream(endRef) {
  endRef?.current?.scrollIntoView({ behavior: "smooth" });
}

export function shouldSendOnEnter(event) {
  return (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing &&
    !event.repeat
  );
}

export function shouldAlertForMessage(current, id, group, focused, visible) {
  return !(current?.id === id && current.group === group && focused && visible);
}

export function recordDirectMessageBurst(
  history = [],
  now = Date.now(),
  { windowMs = 8000, burstLimit = 4, cooldownMs = 5000 } = {},
) {
  const recent = history.filter((sentAt) => now - sentAt < windowMs);
  recent.push(now);
  return {
    history: recent,
    blockedUntil: recent.length >= burstLimit ? now + cooldownMs : 0,
  };
}
