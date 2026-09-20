(() => {
  const invoke = window.__TAURI__?.core?.invoke;
  const isNative = typeof invoke === "function";
  window.sreonRuntime = Object.freeze({
    isNative,
    async search(q, cursor = null) {
      if (!isNative)
        throw new Error("Search runs in the Sreon Mac app. This browser view only previews the interface.");
      return invoke("search", { request: { q, cursor } });
    },
    async openPage(url) {
      if (!isNative) throw new Error("Open results in the Sreon Mac app.");
      return invoke("open_page", { url });
    },
  });
  if (isNative) {
    document.documentElement.classList.add("native-app");
    window.__TAURI__.event?.listen("sreon:focus-search", () => {
      document.getElementById("search-input")?.focus();
      document.getElementById("search-input")?.select();
    }).catch(() => {});
  }
})();
