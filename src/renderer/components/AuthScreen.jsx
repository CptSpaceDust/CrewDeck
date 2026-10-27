import { useEffect, useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { HCAPTCHA_HOST, HCAPTCHA_SITE_KEY, supabase } from "../lib/supabase";
import BrandMark from "./BrandMark";

export default function AuthScreen({
  initialMode = "login",
  onModeChange,
  onMfaVerified,
}) {
  const [mode, setModeState] = useState(
    initialMode === "mfa" ? "mfa" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState(null);
  const captchaRef = useRef(null);

  useEffect(() => {
    if (mode !== "mfa") return;
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      const factor = data?.totp?.find((item) => item.status === "verified");
      if (error || !factor) {
        setMessage(error?.message || "No verified authenticator was found.");
        return;
      }
      const result = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (result.error) setMessage(result.error.message);
      else
        setMfaChallenge({ factorId: factor.id, challengeId: result.data.id });
    })();
  }, [mode]);

  function setMode(next) {
    setModeState(next);
    setMessage("");
    setCaptchaToken("");
    captchaRef.current?.resetCaptcha();
    onModeChange?.(next);
  }

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    if (mode === "mfa") {
      if (!mfaChallenge || mfaCode.trim().length !== 6)
        return setMessage(
          "Enter the 6-digit code from your authenticator app.",
        );
      setBusy(true);
      const { error } = await supabase.auth.mfa.verify({
        ...mfaChallenge,
        code: mfaCode.trim(),
      });
      setBusy(false);
      if (error) setMessage("Invalid MFA code.");
      else onMfaVerified?.();
      return;
    }
    if (mode === "reset") {
      setBusy(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "crewdeck://reset-password",
      });
      setBusy(false);
      setMessage(
        error
          ? error.message
          : "Password reset email sent. Open its link on this computer.",
      );
      return;
    }
    if (!captchaToken) return setMessage("Complete the captcha to continue.");
    setBusy(true);
    let result;
    {
      try {
        const response = await fetch(
          "https://houyownfnnqgvhiokwow.supabase.co/functions/v1/log-login-attempt",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.trim() }),
          },
        );
        const attempt = await response.json();
        if (attempt.blocked) {
          setBusy(false);
          return setMessage(
            "Too many failed attempts. Please wait a few minutes.",
          );
        }
      } catch {}
      result = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });
      if (!result.error && result.data.session) {
        try {
          await fetch(
            "https://houyownfnnqgvhiokwow.supabase.co/functions/v1/log-login-attempt",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${result.data.session.access_token}`,
              },
              body: JSON.stringify({
                email: result.data.user.email,
                success: true,
                user_id: result.data.user.id,
                send_login_alert: true,
              }),
            },
          );
        } catch {}
        await supabase.from("user_sessions").insert({
          user_id: result.data.user.id,
          session_id: crypto.randomUUID(),
          device: `Desktop app (${navigator.platform})`,
          browser: navigator.userAgent,
        });
      }
    }
    setBusy(false);
    captchaRef.current?.resetCaptcha();
    setCaptchaToken("");
    if (result.error) setMessage(result.error.message);
  }

  const modeDetails = {
    login: {
      eyebrow: "Welcome back",
      title: "Sign in to CrewDeck",
      copy: "Your messages, meetups, and community are right where you left them.",
      icon: Mail,
    },
    reset: {
      eyebrow: "Account recovery",
      title: "Reset your password",
      copy: "Enter your account email and we’ll send a secure link back to CrewDeck.",
      icon: KeyRound,
    },
    mfa: {
      eyebrow: "Two-factor verification",
      title: "One more security check",
      copy: "Enter the current six-digit code from your authenticator app.",
      icon: KeyRound,
    },
  };
  const details = modeDetails[mode] || modeDetails.login;
  const ModeIcon = details.icon;

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand-lockup">
          <span className="brand-orbit">
            <BrandMark />
          </span>
          <div>
            <strong>CrewDeck</strong>
            <small>Private community desktop</small>
          </div>
        </div>
        <div className="auth-copy">
          <span className="eyebrow">Your crew, one place</span>
          <h1>
            Stay close to your community.
            <br />
            <em>Built for the crew.</em>
          </h1>
          <p>
            Meet the crew, build ideas together, plan meetups, and keep every
            conversation close at hand.
          </p>
        </div>
        <div className="auth-security">
          <ShieldCheck />
          <span>
            <strong>Desktop-first privacy</strong>
            <small>
              Protected by your account and optional local PIN lock.
            </small>
          </span>
        </div>
      </section>
      <section className="auth-panel">
        <div className={`auth-card auth-card-${mode}`}>
          {(mode === "reset" || mode === "mfa") && (
            <button
              className="auth-back-button"
              type="button"
              onClick={() => setMode("login")}
            >
              <ArrowLeft />
              Back to sign in
            </button>
          )}
          <header className="auth-heading">
            <div className="auth-icon">
              <ModeIcon />
            </div>
            <div>
              <span className="eyebrow">{details.eyebrow}</span>
              <h2>{details.title}</h2>
              <p className="auth-mode-copy">{details.copy}</p>
            </div>
          </header>
          {mode === "login" && (
            <div className="auth-account-note">
              <ShieldCheck />
              <span>
                <strong>Use your CptSpaceDust account</strong>
                <small>
                  Sign in with the same email and password you use on the
                  CptSpaceDust website.
                </small>
              </span>
            </div>
          )}
          {mode === "reset" && (
            <div className="auth-recovery-note">
              <Sparkles />
              <span>
                <strong>What happens next?</strong>
                <small>
                  The email link opens CrewDeck so you can choose a new password
                  securely.
                </small>
              </span>
            </div>
          )}
          <form className="auth-form" onSubmit={submit}>
            {mode === "mfa" ? (
              <label className="field">
                <span>6-digit code</span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength="6"
                  placeholder="000000"
                  autoComplete="one-time-code"
                  value={mfaCode}
                  onChange={(e) =>
                    setMfaCode(e.target.value.replace(/\D/g, ""))
                  }
                  autoFocus
                  required
                />
              </label>
            ) : (
              <>
                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </label>
                {mode !== "reset" && (
                  <>
                    <div className="field">
                      <div className="field-label-row">
                        <label htmlFor="auth-password">Password</label>
                        {mode === "login" && (
                          <button
                            type="button"
                            onClick={() => setMode("reset")}
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="password-field">
                        <input
                          id="auth-password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          minLength="6"
                          placeholder="At least 6 characters"
                          autoComplete="current-password"
                          required
                        />
                        <button
                          type="button"
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          onClick={() => setShowPassword((v) => !v)}
                        >
                          {showPassword ? <EyeOff /> : <Eye />}
                        </button>
                      </div>
                    </div>
                    <div className="captcha-wrap">
                      <div className="captcha-label">
                        <ShieldCheck />
                        <span>
                          <strong>Security check</strong>
                          <small>Complete this once to continue.</small>
                        </span>
                      </div>
                      <HCaptcha
                        ref={captchaRef}
                        sitekey={HCAPTCHA_SITE_KEY}
                        host={HCAPTCHA_HOST}
                        theme="dark"
                        onVerify={setCaptchaToken}
                        onExpire={() => setCaptchaToken("")}
                        onError={() => {
                          setCaptchaToken("");
                          setMessage(
                            "Captcha could not load. Check your connection, then try again.",
                          );
                        }}
                      />
                    </div>
                  </>
                )}
              </>
            )}
            {message && (
              <p className="form-message" role="status">
                {message}
              </p>
            )}
            <button className="button primary wide" disabled={busy}>
              {busy
                ? "Connecting…"
                : mode === "reset"
                  ? "Send reset email"
                  : mode === "mfa"
                    ? "Verify code"
                    : "Sign in"}
            </button>
          </form>
          {mode === "reset" && (
            <div className="auth-links">
              <span>
                Remembered your password?{" "}
                <button onClick={() => setMode("login")}>Sign in</button>
              </span>
            </div>
          )}
          <div className="auth-links auth-policy-link">
            <span>
              By using CrewDeck, you can review how your information is handled in the{" "}
              <button
                type="button"
                onClick={() =>
                  window.desktop.openExternal(
                    "https://cptspacedust.com/Privacy.html",
                  )
                }
              >
                Privacy Policy
              </button>
              .
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
