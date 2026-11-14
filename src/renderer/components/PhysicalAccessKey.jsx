import { useCallback, useEffect, useState } from "react";
import { HardDrive, KeyRound, RefreshCw, ShieldCheck, Usb } from "lucide-react";

const formatBytes = (value) => {
  const size = Number(value || 0);
  if (!size) return "Size unavailable";
  const gib = size / 1024 ** 3;
  return `${gib >= 10 ? Math.round(gib) : gib.toFixed(1)} GB`;
};

export default function PhysicalAccessKey() {
  const [state, setState] = useState({ loading: true, enabled: false });
  const [drives, setDrives] = useState([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    setMessage("");
    const [nextState, nextDrives] = await Promise.all([
      window.desktop.accessKey.getState(),
      window.desktop.accessKey.listDrives(),
    ]);
    setState({ loading: false, ...nextState });
    setDrives(nextDrives);
    setSelected((current) =>
      nextDrives.some((drive) => drive.root === current)
        ? current
        : nextDrives[0]?.root || "",
    );
  }, []);
  useEffect(() => {
    refresh().catch((error) =>
      setMessage(error?.message || "Removable drives could not be checked."),
    );
  }, [refresh]);
  async function provision() {
    if (!selected || busy) return;
    setBusy(true);
    setMessage("");
    const result = await window.desktop.accessKey.provision(selected);
    setBusy(false);
    if (!result.ok) return setMessage(result.error);
    setState({ loading: false, ...result.settings });
    setMessage(
      "Access key created. Removing this drive will immediately open the privacy cover.",
    );
  }
  async function disable() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const result = await window.desktop.accessKey.disable();
    setBusy(false);
    if (!result.ok) return setMessage(result.error);
    await refresh();
    setMessage(
      "Physical access key disabled. Your recovery PIN is active again.",
    );
  }
  if (state.loading) return <p>Checking removable drives…</p>;
  return (
    <div className="physical-key-panel">
      <div
        className={`physical-key-status ${state.enabled && state.present ? "connected" : state.enabled ? "waiting" : "inactive"}`}
      >
        <span>
          <ShieldCheck />
        </span>
        <div>
          <small>
            {state.enabled ? "Physical access key" : "Optional local security"}
          </small>
          <strong>
            {state.enabled
              ? state.present
                ? "Key connected — CrewDeck unlocked"
                : "Waiting for your key"
              : "Use one USB drive or SD card as your key"}
          </strong>
          <p>
            {state.enabled
              ? `${state.driveLabel || "Removable drive"}${state.rootHint ? ` · originally ${state.rootHint}` : ""}`
              : "The drive keeps all of its storage. CrewDeck adds one tiny hidden cryptographic key file and binds it to that device."}
          </p>
        </div>
      </div>
      {state.enabled ? (
        <div className="physical-key-active-grid">
          <article>
            <KeyRound />
            <span>
              <strong>Automatic privacy</strong>
              <small>
                Removal switches the open app to Daily Focus within about one
                second.
              </small>
            </span>
          </article>
          <article>
            <ShieldCheck />
            <span>
              <strong>Owner recovery</strong>
              <small>
                If the key is lost, press Ctrl + Shift + U in Daily Focus and
                enter your local PIN.
              </small>
            </span>
          </article>
          <button
            type="button"
            className="button danger"
            disabled={busy}
            onClick={disable}
          >
            {busy ? "Disabling…" : "Disable this access key"}
          </button>
        </div>
      ) : (
        <div className="physical-key-setup">
          <div className="physical-key-setup-heading">
            <span>
              <Usb />
            </span>
            <div>
              <strong>Choose a removable drive</strong>
              <p>
                Only drives Windows identifies as USB, SD, MMC, or removable are
                listed.
              </p>
            </div>
            <button
              type="button"
              className="captain-button physical-key-refresh"
              onClick={refresh}
              aria-label="Refresh removable drives"
            >
              <RefreshCw /> Refresh
            </button>
          </div>
          {drives.length ? (
            <div
              className="physical-key-drive-list"
              role="radiogroup"
              aria-label="Removable drives"
            >
              {drives.map((drive) => (
                <label
                  className={selected === drive.root ? "selected" : ""}
                  key={`${drive.serial}:${drive.root}`}
                >
                  <input
                    type="radio"
                    name="physical-key-drive"
                    value={drive.root}
                    checked={selected === drive.root}
                    onChange={() => setSelected(drive.root)}
                  />
                  <span className="physical-key-drive-icon">
                    <HardDrive />
                  </span>
                  <span>
                    <strong>{drive.label || "Removable drive"}</strong>
                    <small>
                      {drive.root} · {drive.bus} · {formatBytes(drive.size)}{" "}
                      total · {formatBytes(drive.free)} free
                    </small>
                  </span>
                  <b>{selected === drive.root ? "Selected" : "Choose"}</b>
                </label>
              ))}
            </div>
          ) : (
            <div className="physical-key-empty">
              <Usb />
              <span>
                <strong>No removable drive detected</strong>
                <small>
                  Insert a USB drive or SD card, then refresh this list.
                </small>
              </span>
            </div>
          )}
          <div className="physical-key-safety-note">
            <ShieldCheck />
            <span>
              <strong>No formatting or storage erasure</strong>
              <small>
                Partitioning a removable drive could destroy the wrong data and
                does not make the key safer. Your files and available space
                remain intact.
              </small>
            </span>
          </div>
          <button
            type="button"
            className="button primary physical-key-create"
            disabled={!selected || busy}
            onClick={provision}
          >
            <KeyRound /> {busy ? "Creating key…" : "Create physical access key"}
          </button>
        </div>
      )}
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
