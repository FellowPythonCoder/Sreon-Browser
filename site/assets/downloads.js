// Add official release URLs here when builds are published.
// Use an HTTPS URL (for example a GitHub release asset) or a same-origin path.
// Leaving url as null keeps an honest, platform-specific “Coming soon” dialog.
// version labels a specific build; detail describes architecture, file size, or OS.
window.SREON_RELEASE = Object.freeze({ version: "1.1" });
window.SREON_DOWNLOADS = Object.freeze({
  mac: {
    url: "/site/assets/SREONBROWSER.dmg",
    version: "1.1",
    detail: "macOS · DMG installer",
  },
  windows: { url: null, detail: "" },
  linux: {
    url: "/site/assets/SREONBROWSER-linux-arm64.deb",
    version: "1.1",
    detail: "Linux ARM64 · .deb package",
  },
});
