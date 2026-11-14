import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, NotebookPen } from "lucide-react";

const NOTE_KEY = "crewdeck.privacy-cover.note";

export default function PrivacyCover() {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(() => localStorage.getItem(NOTE_KEY) || "");
  useEffect(() => {
    const listener = (event) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "u") {
        event.preventDefault();
        setRecoveryOpen(true);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    if (!running || seconds <= 0) return undefined;
    const timer = window.setInterval(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [running, seconds]);
  useEffect(() => {
    localStorage.setItem(NOTE_KEY, note);
  }, [note]);
  const timerLabel = useMemo(
    () =>
      `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
    [seconds],
  );
  async function recover(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const result = await window.desktop.accessKey.recover(pin);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error);
      setPin("");
    }
  }
  return (
    <main className="privacy-cover-layout">
      <header className="privacy-cover-header">
        <div>
          <span className="privacy-cover-mark">
            <CheckCircle2 />
          </span>
          <span>
            <strong>Daily Focus</strong>
            <small>Personal workspace</small>
          </span>
        </div>
        <time>
          {new Date().toLocaleDateString([], {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </time>
      </header>
      <div className="privacy-cover-grid">
        <section className="privacy-cover-card privacy-cover-timer">
          <span className="privacy-cover-card-icon">
            <Clock3 />
          </span>
          <span className="privacy-cover-eyebrow">Focus timer</span>
          <strong>{timerLabel}</strong>
          <p>A quiet block for the task in front of you.</p>
          <div>
            <button type="button" onClick={() => setRunning((value) => !value)}>
              {running ? "Pause" : "Start focus"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRunning(false);
                setSeconds(25 * 60);
              }}
            >
              Reset
            </button>
          </div>
        </section>
        <section className="privacy-cover-card privacy-cover-notes">
          <span className="privacy-cover-card-icon">
            <NotebookPen />
          </span>
          <span className="privacy-cover-eyebrow">Quick note</span>
          <h1>What needs your attention?</h1>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Write a private note for later…"
            aria-label="Quick note"
          />
          <small>Saved only on this computer.</small>
        </section>
      </div>
      {recoveryOpen && (
        <div
          className="privacy-cover-recovery-layer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="owner-recovery-title"
        >
          <form className="privacy-cover-recovery" onSubmit={recover}>
            <span className="privacy-cover-eyebrow">Owner recovery</span>
            <h2 id="owner-recovery-title">Use recovery PIN</h2>
            <p>
              This disables the missing access key so a replacement can be
              created.
            </p>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              minLength="4"
              maxLength="8"
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, ""))
              }
              autoFocus
              required
              aria-label="Recovery PIN"
            />
            {message && <p className="form-message error">{message}</p>}
            <div>
              <button
                type="button"
                onClick={() => {
                  setRecoveryOpen(false);
                  setMessage("");
                  setPin("");
                }}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Checking…" : "Recover access"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
