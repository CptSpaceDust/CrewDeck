import { RefreshCw } from "lucide-react";
import { createPortal } from "react-dom";
import { MayuLoader } from "./MayuLoader";

export function Avatar({ profile, size = 44 }) {
  const label = profile?.username || "Crew member";
  return profile?.avatar ? (
    <img
      className="avatar"
      style={{ width: size, height: size }}
      src={profile.avatar}
      alt=""
    />
  ) : (
    <div
      className="avatar avatar-fallback"
      style={{ width: size, height: size }}
    >
      {label.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export function Loading({ label = "Loading transmission…" }) {
  return (
    <div className="state-panel">
      <MayuLoader label={label} compact />
    </div>
  );
}

export function ErrorState({ message, retry }) {
  return (
    <div className="state-panel error">
      <p>{message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          <RefreshCw size={16} />
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ title, body }) {
  return (
    <div className="state-panel">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function formatDate(value, options = {}) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  }).format(new Date(value));
}
