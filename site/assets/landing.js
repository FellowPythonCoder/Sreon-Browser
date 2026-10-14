(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  $("#year").textContent = new Date().getFullYear();

  // Release metadata is shared by the download header and release notes.
  if (window.SREON_RELEASE?.version) {
    $$("[data-release-version]").forEach((label) => {
      label.textContent = window.SREON_RELEASE.version;
    });
  }

  // Respect OS motion preferences, including changes while this page is open.
  const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
  const motionToggle = $("#motion-toggle");
  let manuallyPaused = false;
  function updateMotion() {
    const paused = manuallyPaused || motionPreference.matches;
    document.documentElement.classList.toggle("animations-paused", paused);
    motionToggle.hidden = motionPreference.matches;
    motionToggle.setAttribute("aria-pressed", String(paused));
    motionToggle.textContent = paused
      ? "Resume animations"
      : "Pause animations";
  }
  motionToggle.addEventListener("click", () => {
    manuallyPaused = !manuallyPaused;
    updateMotion();
  });
  motionPreference.addEventListener("change", updateMotion);
  updateMotion();

  // Keep navigation usable with a keyboard and close it after choosing a section.
  const menu = $(".menu-toggle");
  const mobileNav = $("#mobile-nav");
  function closeMenu() {
    mobileNav.hidden = true;
    menu.setAttribute("aria-expanded", "false");
    menu.setAttribute("aria-label", "Open navigation");
  }
  menu.addEventListener("click", () => {
    const open = menu.getAttribute("aria-expanded") !== "true";
    mobileNav.hidden = !open;
    menu.setAttribute("aria-expanded", String(open));
    menu.setAttribute(
      "aria-label",
      open ? "Close navigation" : "Open navigation",
    );
  });
  mobileNav
    .querySelectorAll("a")
    .forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !mobileNav.hidden) {
      closeMenu();
      menu.focus();
    }
  });

  // The browser is an explicitly labelled UI concept, not an embedded web engine.
  const views = {
    home: ["A little space", "new-tab"],
    inspiration: ["Inspiration", "collection"],
    studio: ["Sreon Studio", "studio"],
  };
  function setView(view) {
    Object.keys(views).forEach((key) => {
      $(`#preview-${key}`).hidden = key !== view;
    });
    $$(".sidebar-link[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
      button.setAttribute("aria-pressed", String(button.dataset.view === view));
    });
    $("#mock-tab-name").textContent = views[view][0];
    $("#preview-address").textContent = `sreon://${views[view][1]}`;
  }
  $$("[data-view]").forEach((button) =>
    button.addEventListener("click", () => setView(button.dataset.view)),
  );
  const wallpapers = [
    [
      "night-mountains.webp",
      "Moonlit alpine peaks beneath a quiet, star-filled sky",
    ],
    ["coast.webp", "A winding coastal path above turquoise water"],
    ["landscape.webp", "Quiet pale dunes and distant purple mountains"],
  ];
  let wallpaper = 0;
  function updateWallpaper() {
    $(".wallpaper").src = `/site/assets/${wallpapers[wallpaper][0]}`;
    $(".wallpaper").alt = wallpapers[wallpaper][1];
  }
  function nextWallpaper() {
    setView("home");
    wallpaper = (wallpaper + 1) % wallpapers.length;
    updateWallpaper();
  }
  $("#next-wallpaper").addEventListener("click", nextWallpaper);
  $("#customize-preview").addEventListener("click", nextWallpaper);
  $("#focus-preview").addEventListener("click", () => {
    const focused = $("#browser-preview").classList.toggle("is-focused");
    $(".browser-sidebar").inert = focused;
    $("#focus-preview").setAttribute("aria-pressed", String(focused));
  });
  $("#reset-preview").addEventListener("click", () => {
    setView("home");
    wallpaper = 0;
    updateWallpaper();
    $("#browser-preview").classList.remove("is-focused");
    $(".browser-sidebar").inert = false;
    $("#focus-preview").setAttribute("aria-pressed", "false");
  });

  // A small, strict settings parser: never eval user input or imply a real compiler.
  const examples = {
    appearance:
      '// Your browser. Your rules.\n// Try changing the greeting below.\n\nbrowser.greeting = "Hello, possibility."\nbrowser.theme = "dusk"\nbrowser.sidebar = "expanded"\n\n// Make a little space for yourself.',
    focus:
      '// A little less interface.\n// A little more room to think.\n\nbrowser.greeting = "Find your flow."\nbrowser.theme = "midnight"\nbrowser.sidebar = "compact"\n\n// Your quiet corner of the internet.',
    welcome:
      '// Make yourself at home.\n// Put your own words between the quotes.\n\nbrowser.greeting = "Good things start here."\nbrowser.theme = "quiet"\nbrowser.sidebar = "expanded"\n\n// Themes: dusk, midnight, quiet.',
  };
  const tabs = $$("[data-example]");
  const editor = $("#studio-code");
  editor.maxLength = 2000;
  function applyCode() {
    const values = {};
    try {
      const lines = editor.value.split("\n");
      for (const line of lines) {
        if (!line.trim() || line.trim().startsWith("//")) continue;
        const match = line
          .trim()
          .match(
            /^browser\.(greeting|theme|sidebar)\s*=\s*"([^"\n]{1,80})"\s*;?$/,
          );
        if (!match)
          throw new Error(
            "Use browser.greeting, theme or sidebar with a quoted value.",
          );
        values[match[1]] = match[2];
      }
      if (!values.greeting || !values.theme || !values.sidebar)
        throw new Error(
          "Include greeting, theme and sidebar to apply your changes.",
        );
      if (!["dusk", "midnight", "quiet"].includes(values.theme))
        throw new Error("Choose a theme: dusk, midnight or quiet.");
      if (!["compact", "expanded"].includes(values.sidebar))
        throw new Error("Set sidebar to compact or expanded.");
      $("#result-greeting").textContent = values.greeting;
      $("#studio-result").dataset.theme = values.theme;
      $("#studio-result").classList.toggle(
        "compact",
        values.sidebar === "compact",
      );
      $("#editor-status").textContent = "Changes applied. A little more you.";
      editor.setAttribute("aria-invalid", "false");
    } catch (error) {
      $("#editor-status").textContent = error.message;
      editor.setAttribute("aria-invalid", "true");
    }
  }
  function selectExample(button) {
    tabs.forEach((tab) => {
      const active = tab === button;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    $("#studio-editor").setAttribute("aria-labelledby", button.id);
    editor.value = examples[button.dataset.example];
    applyCode();
  }
  tabs.forEach((button, index) => {
    button.addEventListener("click", () => selectExample(button));
    button.addEventListener("keydown", (event) => {
      let next;
      if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
      if (event.key === "ArrowLeft")
        next = tabs[(index + tabs.length - 1) % tabs.length];
      if (event.key === "Home") next = tabs[0];
      if (event.key === "End") next = tabs.at(-1);
      if (next) {
        event.preventDefault();
        selectExample(next);
        next.focus();
      }
    });
  });
  $("#run-code").addEventListener("click", applyCode);
  editor.addEventListener("input", () => {
    $("#editor-status").textContent =
      "Unsaved ideas. Apply changes to see them.";
  });
  editor.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      applyCode();
    }
  });

  const dialog = $("#download-dialog");
  const platforms = { mac: "Mac", windows: "Windows", linux: "Linux" };
  function validDownload(config) {
    if (!config?.url) return null;
    try {
      const url = new URL(config.url, location.href);
      return url.protocol === "https:" ||
        (url.origin === location.origin && url.protocol === "http:")
        ? url.href
        : null;
    } catch {
      return null;
    }
  }
  $$(".download-action").forEach((button) => {
    const platform = button.dataset.platform;
    const config = window.SREON_DOWNLOADS?.[platform];
    const url = validDownload(config);
    if (url) {
      const link = document.createElement("a");
      link.className = button.className;
      link.href = url;
      link.textContent = `Download for ${platform === "mac" ? "macOS" : platforms[platform]} ↓`;
      link.dataset.platform = platform;
      button.replaceWith(link);
      link
        .closest(".download-card")
        .querySelector(".platform-tag").textContent = "AVAILABLE NOW";
      $("#release-answer").textContent =
        "Published builds are linked in the download section above. Platforms marked Coming soon do not have a public download yet. Choose your platform to see its current availability.";
      $(`[data-status="${platform}"]`).textContent = [
        config.version ? `Version ${config.version}` : "",
        config.detail || "Official release",
      ]
        .filter(Boolean)
        .join(" · ");
    } else {
      button.addEventListener("click", () => {
        $("#download-dialog-title").textContent =
          `Sreon for ${platforms[platform]} is on its way.`;
        dialog.showModal();
      });
    }
  });
  $(".dialog-close").addEventListener("click", () => dialog.close());
  $(".dialog-dismiss").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    )
      dialog.close();
  });

  if (
    "IntersectionObserver" in window &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.08, rootMargin: "0px 0px 30px 0px" },
    );
    document.documentElement.classList.add("js-motion");
    $$(".reveal").forEach((element) => observer.observe(element));
  }
})();
