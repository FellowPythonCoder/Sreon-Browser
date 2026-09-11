// Hands out the AES-GCM key used to encrypt each workspace's saved
// logins, history, and bookmarks at rest. The key is derived from a
// device-local secret (see getDeviceSecret below) — never from a
// password, since workspaces no longer have their own passwords.

(function () {
  "use strict";

  const DEVICE_SECRET_KEY = "sreon:device-secret";
  const SALT_PREFIX = "sreon:wskeysalt:"; // per-workspace PBKDF2 salt, safe to store in the clear

  const deviceKeys = new Map(); // wsId -> CryptoKey (cached for the process lifetime)

  function getDeviceSecret() {
    let secret = localStorage.getItem(DEVICE_SECRET_KEY);
    if (!secret) {
      secret = SreonCrypto.toB64(SreonCrypto.randomBytes(32));
      localStorage.setItem(DEVICE_SECRET_KEY, secret);
    }
    return secret;
  }

  function saltFor(wsId) {
    const key = SALT_PREFIX + wsId;
    let salt = localStorage.getItem(key);
    if (!salt) {
      salt = SreonCrypto.newSalt();
      localStorage.setItem(key, salt);
    }
    return salt;
  }

  async function deviceKeyFor(wsId) {
    if (deviceKeys.has(wsId)) return deviceKeys.get(wsId);
    const key = await SreonCrypto.deriveKey(getDeviceSecret() + ":" + wsId, saltFor(wsId));
    deviceKeys.set(wsId, key);
    return key;
  }

  async function keyFor(wsId) {
    return deviceKeyFor(wsId);
  }

  window.SecureStore = {
    keyFor,
  };
})();
