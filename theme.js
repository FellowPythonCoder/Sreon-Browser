(() => {
  let theme = "light";
  try {
    const saved = localStorage.getItem("sreon.theme");
    const old = JSON.parse(localStorage.getItem("sreon.preferences") || "{}");
    const value = saved || old.theme;
    theme = value === "dark" || (value === "system" && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    localStorage.setItem("sreon.theme", theme);
    for (const key of ["sreon.preferences", "sreon.endpoint", "sreon.history"])
      localStorage.removeItem(key);
  } catch {}
  document.documentElement.dataset.theme = theme;
})();
