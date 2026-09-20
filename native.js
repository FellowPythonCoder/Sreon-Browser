(() => {
  const invoke = window.__TAURI__?.core?.invoke;
  const isNative = typeof invoke === "function";
  const base = new URL("./", document.currentScript.src);
  const response = (status, data) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
  let endpoint = "";
  try {
    endpoint = localStorage.getItem("sreon.endpoint") || "";
  } catch {}

  function validateEndpoint(value) {
    if (!value.trim()) return "";
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      value.length > 2048 ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host === "[::1]" ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
        host,
      )
    ) {
      throw new Error(
        "Enter a hosted HTTPS search-service URL, without credentials or a local address.",
      );
    }
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url.href;
  }

  function nativeError(error) {
    if (error && typeof error === "object" && typeof error.message === "string")
      return response(Number(error.status) || 502, error);
    return response(502, {
      code: "NATIVE_ERROR",
      message:
        "The native search service could not complete this request. Please try again.",
    });
  }

  window.sreonRuntime = Object.freeze({
    isNative,
    getEndpoint: () => endpoint,
    validateEndpoint,
    setEndpoint(value) {
      const normalized = validateEndpoint(value);
      localStorage.setItem("sreon.endpoint", normalized);
      endpoint = normalized;
    },
    async search(params, signal) {
      if (!isNative)
        return fetch(new URL(`api/search?${params}`, base), {
          signal,
          headers: { Accept: "application/json" },
        });
      if (signal?.aborted)
        throw new DOMException("Search cancelled", "AbortError");
      try {
        const result = await invoke("search", {
          endpoint,
          request: {
            q: params.get("q") || "",
            category: params.get("category") || "general",
            page: Number(params.get("page") || 1),
            safe: params.get("safe") || "1",
            language: params.get("language") || "auto",
            time: params.get("time") || "",
          },
        });
        if (signal?.aborted)
          throw new DOMException("Search cancelled", "AbortError");
        return response(200, result);
      } catch (error) {
        if (signal?.aborted)
          throw new DOMException("Search cancelled", "AbortError");
        return nativeError(error);
      }
    },
    async health(signal) {
      if (!isNative) return fetch(new URL("api/health", base), { signal });
      try {
        return response(200, await invoke("connection_status", { endpoint }));
      } catch (error) {
        return nativeError(error);
      }
    },
    async openPage(url, reuse = false) {
      return invoke("open_page", { url, reuse });
    },
  });

  if (isNative) {
    document.documentElement.classList.add("native-app");
    window.__TAURI__.event
      ?.listen("sreon:focus-search", () => {
        document.getElementById("search-input")?.focus();
        document.getElementById("search-input")?.select();
      })
      .catch(() => {});
  }
})();
