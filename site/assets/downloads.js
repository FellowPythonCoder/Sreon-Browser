// Add official release URLs here when builds are published.
// Use an HTTPS URL (for example a GitHub release asset) or a same-origin path.
// Leaving url as null keeps an honest, platform-specific “Coming soon” dialog.
// detail can contain a version, architecture, file size, or OS requirement.
window.SREON_DOWNLOADS = Object.freeze({
  mac: {
    url: "/site/assets/SREONBROWSER.dmg",
    detail: "macOS · DMG installer",
  },
  windows: { url: null, detail: "" },
  linux: { url: null, detail: "" },
});
