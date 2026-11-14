const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const KEY_FILE_NAME = ".crewdeck-access-key.json";
const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  keyId: "",
  keyHash: "",
  driveSerial: "",
  driveLabel: "",
  rootHint: "",
  createdAt: "",
});

function normalizeRoot(value) {
  const root = String(value || "").trim();
  if (!/^[A-Za-z]:\\$/.test(root)) return "";
  return `${root[0].toUpperCase()}:\\`;
}

function normalizeSettings(value = {}) {
  const enabled = Boolean(
    value.enabled && value.keyId && value.keyHash && value.driveSerial,
  );
  return {
    enabled,
    keyId: enabled ? String(value.keyId) : "",
    keyHash: enabled ? String(value.keyHash) : "",
    driveSerial: enabled ? String(value.driveSerial) : "",
    driveLabel: enabled ? String(value.driveLabel || "") : "",
    rootHint: enabled ? normalizeRoot(value.rootHint) : "",
    createdAt: enabled ? String(value.createdAt || "") : "",
  };
}

function tokenHash(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

function safeEqual(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(String(left), "hex");
  const b = Buffer.from(String(right), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

class AccessKeyStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.settings = this.read();
  }

  read() {
    try {
      return normalizeSettings(
        JSON.parse(fs.readFileSync(this.filePath, "utf8")),
      );
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.settings, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, this.filePath);
  }

  publicSettings(presence = null) {
    return {
      enabled: this.settings.enabled,
      keyId: this.settings.keyId,
      driveLabel: this.settings.driveLabel,
      rootHint: this.settings.rootHint,
      createdAt: this.settings.createdAt,
      present: Boolean(presence),
      activeRoot: presence?.root || "",
    };
  }

  keyPath(root) {
    const normalized = normalizeRoot(root);
    return normalized ? path.join(normalized, KEY_FILE_NAME) : "";
  }

  provision(drive) {
    const root = normalizeRoot(drive?.root);
    const serial = String(drive?.serial || "").trim();
    if (!root || !serial)
      return { ok: false, error: "Choose a detected removable drive." };
    if (this.settings.enabled)
      return { ok: false, error: "Disable the active access key first." };
    const keyId = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString("hex");
    const keyPath = this.keyPath(root);
    const keyDocument = {
      version: 1,
      keyId,
      secret,
      createdAt: new Date().toISOString(),
    };
    try {
      fs.writeFileSync(keyPath, JSON.stringify(keyDocument), {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      this.settings = {
        enabled: true,
        keyId,
        keyHash: tokenHash(secret),
        driveSerial: serial,
        driveLabel: String(drive.label || drive.bus || "Removable drive"),
        rootHint: root,
        createdAt: keyDocument.createdAt,
      };
      this.save();
      return { ok: true, keyPath, settings: this.publicSettings(drive) };
    } catch (error) {
      return {
        ok: false,
        error:
          error?.code === "EEXIST"
            ? "That drive already contains a CrewDeck access key. Remove it or choose another drive."
            : error?.message || "CrewDeck could not create the access key.",
      };
    }
  }

  readKey(root) {
    try {
      const document = JSON.parse(fs.readFileSync(this.keyPath(root), "utf8"));
      return document && typeof document === "object" ? document : null;
    } catch {
      return null;
    }
  }

  findMatchingDrive(drives = []) {
    if (!this.settings.enabled) return null;
    for (const drive of drives) {
      if (String(drive?.serial || "") !== this.settings.driveSerial) continue;
      const document = this.readKey(drive.root);
      if (
        document?.keyId === this.settings.keyId &&
        safeEqual(tokenHash(document.secret), this.settings.keyHash)
      )
        return drive;
    }
    return null;
  }

  disable(drives = []) {
    if (!this.settings.enabled)
      return { ok: true, settings: this.publicSettings(null) };
    const matching = this.findMatchingDrive(drives);
    if (matching) {
      try {
        fs.unlinkSync(this.keyPath(matching.root));
      } catch (error) {
        if (error?.code !== "ENOENT")
          return {
            ok: false,
            error: error?.message || "The key file could not be removed.",
          };
      }
    }
    this.settings = { ...DEFAULT_SETTINGS };
    this.save();
    return { ok: true, settings: this.publicSettings(null) };
  }
}

module.exports = {
  AccessKeyStore,
  DEFAULT_SETTINGS,
  KEY_FILE_NAME,
  normalizeRoot,
  normalizeSettings,
  tokenHash,
};
