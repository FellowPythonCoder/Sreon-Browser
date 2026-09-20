try {
  const preferences = JSON.parse(
    localStorage.getItem("sreon.preferences") || "{}",
  );
  const theme = ["light", "dark", "system"].includes(preferences.theme)
    ? preferences.theme
    : "light";
  document.documentElement.dataset.theme =
    theme === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
} catch {
  document.documentElement.dataset.theme = "light";
}
