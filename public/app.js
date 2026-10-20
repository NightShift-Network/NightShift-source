(() => {
  const tabsEl = document.querySelector("#tabs");
  const browserTabButton = document.querySelector("#browser-tab");
  const framesEl = document.querySelector("#frames");
  const homeView = document.querySelector("#home-view");
  const pageLoading = document.querySelector("#page-loading");
  const pageLoadingNote = document.querySelector("#page-loading-note");
  const alternateTransportButton = document.querySelector("#retry-other-transport");
  const backButton = document.querySelector("#back");
  const forwardButton = document.querySelector("#forward");
  const address = document.querySelector("#address");
  const heroAddress = document.querySelector("#hero-address");
  const toast = document.querySelector("#toast");
  const bookmarkButton = document.querySelector("#bookmark");
  const bookmarksBar = document.querySelector("#bookmarks-bar");
  const bookmarkItems = document.querySelector("#bookmark-items");
  const settingsDialog = document.querySelector("#settings");
  const INTERNAL_NEW_TAB = "nightshift://newtab";
  const INTERNAL_SETTINGS = "nightshift://settings";
  const internalPage = document.querySelector("#internal-page");
  const INTERNAL_PAGES = ["history", "bookmarks", "about", "privacy", "diagnostics", "shortcuts", "help"];
  const INTERNAL_URLS = [INTERNAL_NEW_TAB, INTERNAL_SETTINGS, ...INTERNAL_PAGES.map(page => `nightshift://${page}`)];
  const searchEngineSelect = document.querySelector("#search-engine");
  const browserTransportSelect = document.querySelector("#browser-transport");
  const syncXhrCheckbox = document.querySelector("#sync-xhr");
  const customSearchRow = document.querySelector("#custom-search-row");
  const customSearchInput = document.querySelector("#custom-search");
  const shortcutList = document.querySelector("#shortcuts");
  const shortcutEditor = document.querySelector("#shortcut-editor");
  const cloakModeSelect = document.querySelector("#cloak-mode");
  const favoriteCloakModeSelect = document.querySelector("#favorite-cloak-mode");
  const autoCloakCheckbox = document.querySelector("#auto-cloak");
  const appleTouchDisguiseCheckbox = document.querySelector("#apple-touch-disguise");
  const cloakTitleInput = document.querySelector("#cloak-title");
  const cloakIconInput = document.querySelector("#cloak-icon");
  const cloakRedirectInput = document.querySelector("#cloak-redirect");
  const cloakTabButton = document.querySelector("#cloak-tab");
  const DEFAULT_SHORTCUTS = [
    { name: "Wikipedia", url: "https://www.wikipedia.org", description: "Knowledge, freely shared" },
    { name: "Reddit", url: "https://www.reddit.com", description: "Find your community" },
    { name: "YouTube", url: "https://www.youtube.com", description: "Something worth watching" },
    { name: "Duck.ai", url: "https://duck.ai/", description: "Private AI chat" },
  ];
  const SEARCH_ENGINES = {
    duckduckgo: "https://duckduckgo.com/?q=%s",
    brave: "https://search.brave.com/search?q=%s",
    startpage: "https://www.startpage.com/sp/search?query=%s",
    palmtree: "https://search.palmtree.technology/?q=%s",
  };
  // Chat/AI apps stream replies over WebSockets, the most transport-sensitive
  // feature a site can use. These hosts get a tailored loading hint.
  const AI_HOSTS = new Set([
    "chatgpt.com",
    "chat.openai.com",
    "claude.ai",
    "gemini.google.com",
    "bard.google.com",
    "perplexity.ai",
    "copilot.microsoft.com",
    "poe.com",
    "you.com",
    "character.ai",
    "c.ai",
    "mistral.ai",
    "deepseek.com",
    "groq.com",
  ]);
  let searchSettings = loadSearchSettings();
  let browserTransport = loadBrowserTransport();
  let syncXhr = loadSyncXhr();
  let activeTransport = browserTransport;
  let siteTransports = loadSiteTransports();
  let shortcuts = loadShortcuts();
  let cloakMode = loadCloakMode();
  let favoriteCloakMode = loadFavoriteCloakMode();
  let cloakSettings = loadCloakSettings();
  let appleTouchDisguise = loadAppleTouchDisguise();
  let bookmarks = loadBookmarks();
  let tabs = [];
  let activeId = null;
  let nextId = 1;
  let toastTimer;
  let controllerPromise;

  const DEFAULT_APPLE_TOUCH_ICON = "/images/nightshift.png";
  const NOTES_APPLE_TOUCH_ICON = "/images/apple-notes.png";

  function updateAppleTouchIcon(disguise) {
    let link = document.querySelector("#apple-touch-icon");
    if (!link) {
      link = document.createElement("link");
      link.id = "apple-touch-icon";
      link.rel = "apple-touch-icon";
      document.head.append(link);
    }
    link.href = disguise ? NOTES_APPLE_TOUCH_ICON : DEFAULT_APPLE_TOUCH_ICON;
  }
  updateAppleTouchIcon(appleTouchDisguise);

  const icon = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>`;
  const activeTab = () => tabs.find(tab => tab.id === activeId);
  const isInternalUrl = value => INTERNAL_URLS.includes(value);
  const faviconText = (tab) => !tab.url || isInternalUrl(tab.url) ? icon : (new URL(tab.url).hostname.replace(/^www\./, "")[0] || "•").toUpperCase();

  function loadSearchSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem("nightshift-search-settings") || "null");
      if (saved && ["duckduckgo", "brave", "startpage", "palmtree", "custom"].includes(saved.engine)) {
        return { engine: saved.engine, endpoint: typeof saved.endpoint === "string" ? saved.endpoint : "" };
      }
    } catch {}
    return { engine: "duckduckgo", endpoint: "" };
  }

  const TRANSPORT_KEY = "nightshift-browser-transport";
  const LEGACY_TRANSPORT_KEYS = ["nightshift-pr" + "0xy-transport", "nightshift-pro" + "xy-transport"];

  const SYNC_XHR_KEY = "nightshift-sync-xhr";

  function loadSyncXhr() {
    try {
      return localStorage.getItem(SYNC_XHR_KEY) === "true";
    } catch {}
    return false;
  }

  // Keep a small buffer of page errors so the diagnostics dump has something
  // useful to share when a site will not load.
  const diagnosticErrors = [];

  function recordDiagnostic(message) {
    diagnosticErrors.push({ at: new Date().toISOString(), message: String(message) });
    if (diagnosticErrors.length > 8) diagnosticErrors.shift();
  }

  window.addEventListener("error", event => recordDiagnostic(event.message || "Unknown page error"));
  window.addEventListener("unhandledrejection", event => recordDiagnostic(event.reason || "Unhandled promise rejection"));

  function buildDiagnostics() {
    const lines = [
      "NightShift diagnostics",
      `Generated: ${new Date().toISOString()}`,
      `URL: ${location.href}`,
      `User agent: ${navigator.userAgent}`,
      `Transport: ${activeTransport} (default ${browserTransport})`,
      `Remembered site transports: ${Object.keys(siteTransports).length}`,
      `Sync XHR support: ${syncXhr ? "on" : "off"}`,
      `Service worker: ${"serviceWorker" in navigator ? (navigator.serviceWorker.controller ? "controlling" : "registered") : "unavailable"}`,
      `Scramjet: ${typeof window.$scramjet === "undefined" ? "not loaded" : "loaded"}`,
      `Controller: ${typeof window.$scramjetController === "undefined" ? "not loaded" : "loaded"}`,
      `Wisp endpoint: ${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/wisp/`,
      `Screen: ${window.screen?.width || "?"}x${window.screen?.height || "?"}`,
    ];
    if (diagnosticErrors.length > 0) {
      lines.push("Recent errors:");
      diagnosticErrors.forEach(({ at, message }) => lines.push(`  ${at} ${message}`));
    } else {
      lines.push("Recent errors: none recorded");
    }
    return lines.join("\n");
  }

  async function copyDiagnostics() {
    const text = buildDiagnostics();
    try {
      await navigator.clipboard.writeText(text);
      notify("Diagnostics copied.");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      document.body.append(textarea);
      textarea.select();
      let copied = false;
      try { copied = document.execCommand("copy"); } catch {}
      textarea.remove();
      notify(copied ? "Diagnostics copied." : "Could not copy diagnostics.");
    }
  }

  const SITE_TRANSPORT_KEY = "nightshift-site-transports";

  function loadSiteTransports() {
    try {
      const saved = JSON.parse(localStorage.getItem(SITE_TRANSPORT_KEY) || "{}");
      if (saved && typeof saved === "object") {
        const cleaned = {};
        for (const [host, kind] of Object.entries(saved)) {
          if (host && (kind === "epoxy" || kind === "libcurl")) cleaned[host] = kind;
        }
        return cleaned;
      }
    } catch {}
    return {};
  }

  function saveSiteTransports() {
    try {
      if (Object.keys(siteTransports).length === 0) localStorage.removeItem(SITE_TRANSPORT_KEY);
      else localStorage.setItem(SITE_TRANSPORT_KEY, JSON.stringify(siteTransports));
    } catch {}
  }

  function hostnameOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
  }

  // Decode the real destination of a proxied frame. Scramjet serves frames at
  // "/~/sj/<controller-id>/<frame-id>/<encoded-url>" (same-origin), so the
  // destination is readable and decodable from the frame's location. There are
  // two id segments to skip before the encoded URL.
  function decodeFrameUrl(frame) {
    try {
      const href = frame.contentWindow?.location?.href || "";
      const marker = "/sj/";
      const start = href.indexOf(marker);
      if (start === -1) return "";
      const afterMarker = href.slice(start + marker.length);
      const firstSlash = afterMarker.indexOf("/");
      if (firstSlash === -1) return "";
      const secondSlash = afterMarker.indexOf("/", firstSlash + 1);
      if (secondSlash === -1) return "";
      const encoded = afterMarker.slice(secondSlash + 1);
      const decoded = window.$scramjetController?.config?.codec?.decode(encoded);
      return decoded && /^(https?:|about:)/i.test(decoded) ? decoded : "";
    } catch {
      return "";
    }
  }

  // Record a page the frame reached on its own (link click, redirect, or SPA
  // pushState), so Back/Forward can walk in-frame navigation too.
  function recordFrameDestination(tab, dest) {
    tab.frameUrl = dest;
    if (tab.loading || dest === tab.url) return; // app-initiated navigation completing
    tab.history = tab.history.slice(0, tab.historyIndex + 1);
    tab.history.push(dest);
    tab.historyIndex = tab.history.length - 1;
    tab.url = dest;
    tab.title = "Loading…";
  }

  // Poll the active frame's location: full navigations fire the iframe "load"
  // event, but SPA history.pushState changes do not, and those are common.
  function startFrameWatcher(tab) {
    clearInterval(tab.locationTimer);
    tab.locationTimer = setInterval(() => {
      if (tab.id !== activeId || !tab.url) return;
      const dest = decodeFrameUrl(tab.frame);
      if (!dest || dest === tab.frameUrl) return;
      const wasLoading = tab.loading;
      recordFrameDestination(tab, dest);
      if (!wasLoading) {
        let spaTitle = "";
        try { spaTitle = tab.frame.contentDocument?.title?.trim() || ""; } catch {}
        if (spaTitle) tab.title = spaTitle;
        render();
      }
    }, 800);
  }

  // Remember the transport that loaded a site so revisits start with it.
  // The default transport is implied, so only the non-default is stored.
  function rememberSiteTransport(url, kind) {
    const host = hostnameOf(url);
    if (!host || !["epoxy", "libcurl"].includes(kind) || kind === browserTransport) return;
    siteTransports = { ...siteTransports, [host]: kind };
    saveSiteTransports();
  }

  function preferredTransportFor(url) {
    return siteTransports[hostnameOf(url)] || browserTransport;
  }

  async function useTransport(kind) {
    const controller = await getBrowserController();
    controller.setTransport(await makeTransport(kind));
    activeTransport = kind;
  }

  function loadBrowserTransport() {
    try {
      const saved = localStorage.getItem(TRANSPORT_KEY) || LEGACY_TRANSPORT_KEYS.map(key => localStorage.getItem(key)).find(Boolean);
      if (saved === "epoxy" || saved === "libcurl") {
        try {
          localStorage.setItem(TRANSPORT_KEY, saved);
          LEGACY_TRANSPORT_KEYS.forEach(key => localStorage.removeItem(key));
        } catch {}
        return saved;
      }
    } catch {}
    return "libcurl";
  }

  function loadShortcuts() {
    try {
      const saved = JSON.parse(localStorage.getItem("nightshift-shortcuts") || "null");
      if (Array.isArray(saved)) {
        const previousDefaults = [
          ["https://www.wikipedia.org", "https://www.reddit.com", "https://www.youtube.com", "https://news.ycombinator.com"],
          ["https://www.wikipedia.org", "https://www.youtube.com", "https://duck.ai/"],
        ].map(urls => urls.sort());
        const savedUrls = saved.map(item => item?.url).sort();
        if (previousDefaults.some(urls => saved.length === urls.length && savedUrls.every((url, index) => url === urls[index]))) {
          const migrated = DEFAULT_SHORTCUTS.map(item => ({ ...item }));
          try { localStorage.setItem("nightshift-shortcuts", JSON.stringify(migrated)); } catch {}
          return migrated;
        }
        return saved.filter(item => item && typeof item.name === "string" && typeof item.url === "string").slice(0, 12);
      }
    } catch {}
    return DEFAULT_SHORTCUTS.map(item => ({ ...item }));
  }

  function loadCloakMode() {
    try {
      const saved = localStorage.getItem("nightshift-cloak-mode");
      if (["none", "about:blank", "blob"].includes(saved)) return saved;
    } catch {}
    return "none";
  }

  function loadFavoriteCloakMode() {
    try {
      const saved = localStorage.getItem("nightshift-favorite-cloak-mode");
      if (["about:blank", "blob"].includes(saved)) return saved;
    } catch {}
    return "blob";
  }

  function loadCloakSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem("nightshift-cloak-settings") || "null");
      if (saved && typeof saved === "object") {
        return {
          title: typeof saved.title === "string" ? saved.title.slice(0, 64) : "Nightshift",
          icon: typeof saved.icon === "string" ? saved.icon : "",
          redirect: normalizeCloakRedirect(saved.redirect) || "https://www.google.com/",
          autoCloak: typeof saved.autoCloak === "boolean" ? saved.autoCloak : true,
        };
      }
    } catch {}
    return { title: "Nightshift", icon: "", redirect: "https://www.google.com/", autoCloak: true };
  }

  function loadAppleTouchDisguise() {
    try {
      return localStorage.getItem("nightshift-apple-touch-disguise") === "true";
    } catch {}
    return false;
  }

  function normalizeCloakRedirect(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const input = value.trim();
      if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^https?:\/\//i.test(input)) return null;
      const parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    } catch {}
    return null;
  }

  function getCloakIconUrl(value) {
    const icon = value.trim();
    if (!icon) return document.querySelector('link[rel~="icon"]')?.href || "";
    if (/^data:image\//i.test(icon)) return icon;
    try {
      const parsed = new URL(icon, location.href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    } catch {}
    return null;
  }

  function loadBookmarks() {
    try {
      const saved = JSON.parse(localStorage.getItem("nightshift-bookmarks") || "[]");
      if (Array.isArray(saved)) return saved.filter(item => item && typeof item.url === "string" && typeof item.title === "string");
    } catch {}
    return [];
  }

  function saveBookmarks() {
    try { localStorage.setItem("nightshift-bookmarks", JSON.stringify(bookmarks)); } catch {}
  }

  function updateBookmarkForTab(tab) {
    const saved = bookmarks.find(item => item.url === tab.url);
    if (!saved) return;
    if (tab.title && tab.title !== "Loading…") saved.title = tab.title;
    saveBookmarks();
  }

  function notify(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
  }

  function render() {
    tabsEl.replaceChildren();
    browserTabButton.setAttribute("aria-pressed", "true");
    tabs.forEach(tab => {
      const button = document.createElement("button");
      button.className = `tab${tab.id === activeId ? " active" : ""}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(tab.id === activeId));
      button.title = tab.url || INTERNAL_NEW_TAB;
      const mark = document.createElement("span");
      mark.className = "tab-favicon";
      if (tab.url && !isInternalUrl(tab.url)) mark.textContent = faviconText(tab); else mark.innerHTML = icon;
      const label = document.createElement("span");
      label.className = "tab-title";
      label.textContent = tab.title || "New tab";
      const close = document.createElement("span");
      close.className = "tab-close";
      close.setAttribute("role", "button");
      close.setAttribute("aria-label", `Close ${label.textContent}`);
      close.textContent = "×";
      close.addEventListener("click", event => { event.stopPropagation(); closeTab(tab.id); });
      button.append(mark, label, close);
      button.addEventListener("click", () => activate(tab.id));
      tabsEl.append(button);
    });
    tabs.forEach(tab => {
      tab.frame.classList.toggle("active", tab.id === activeId && Boolean(tab.url) && !isInternalUrl(tab.url));
    });
    const current = activeTab();
    const internalSettings = current?.url === INTERNAL_SETTINGS;
    const internalNewTab = !current?.url || current.url === INTERNAL_NEW_TAB;
    settingsDialog.hidden = !internalSettings;
    if (internalSettings) populateSettings();
    internalPage.hidden = internalNewTab || internalSettings;
    if (!internalPage.hidden) renderInternalPage(current.url.slice("nightshift://".length));
    homeView.classList.toggle("hidden", !internalNewTab);
    pageLoading.hidden = !(current?.url && !isInternalUrl(current.url) && current.loading);
    const currentUrl = current?.url || "";
    const currentHost = isInternalUrl(currentUrl) ? "" : hostnameOf(currentUrl);
    const currentPreferred = preferredTransportFor(currentUrl);
    const currentAlternate = currentPreferred === "libcurl" ? "epoxy" : "libcurl";
    const alternateLabel = currentAlternate === "epoxy" ? "Epoxy" : "libcurl";
    const aiSite = Boolean(currentHost && AI_HOSTS.has(currentHost));
    pageLoadingNote.textContent = current?.slowLoading
      ? aiSite
        ? `AI apps stream replies over WebSockets. Try ${alternateLabel} if this stays here.`
        : "Still loading. Large sites can take a moment; the alternate transport may help."
      : "Large sites can take a moment.";
    alternateTransportButton.hidden = !current?.slowLoading;
    alternateTransportButton.textContent = `Retry with ${alternateLabel}`;
    const historyIndex = current?.historyIndex ?? -1;
    backButton.disabled = !current?.url || historyIndex <= 0;
    forwardButton.disabled = !current?.url || historyIndex >= (current?.history.length ?? 1) - 1;
    address.value = current?.url || "";
    const currentBookmarked = Boolean(current?.url && bookmarks.some(item => item.url === current.url));
    bookmarkButton.classList.toggle("saved", currentBookmarked);
    bookmarkButton.setAttribute("aria-pressed", String(currentBookmarked));
    renderBookmarks();
    renderShortcuts();
  }

  function renderInternalPage(page) {
    const headings = {
      history: ["History", "Pages opened in the tabs in this session."],
      bookmarks: ["Bookmarks", "Your saved pages, stored in this browser."],
      about: ["About NightShift", "A browser built for private, flexible browsing."],
      privacy: ["Privacy", "How NightShift handles browser data and connections."],
      diagnostics: ["Diagnostics", "Connection details and recent browser errors."],
      shortcuts: ["Keyboard shortcuts", "Quick ways to move around NightShift."],
      help: ["Help", "Quick links and guidance for using NightShift."],
    };
    const [title, description] = headings[page] || headings.help;
    const shell = document.createElement("div");
    shell.className = "internal-content";
    const heading = document.createElement("header");
    heading.className = "internal-heading";
    const kicker = document.createElement("span");
    kicker.className = "settings-kicker";
    kicker.textContent = "NIGHTSHIFT / INTERNAL PAGE";
    const h1 = document.createElement("h1");
    h1.textContent = title;
    const intro = document.createElement("p");
    intro.textContent = description;
    heading.append(kicker, h1, intro);
    shell.append(heading);

    const list = document.createElement("div");
    list.className = "internal-list";
    const addRow = (label, detail, url, actionLabel = "Open") => {
      const row = document.createElement("article");
      row.className = "internal-row";
      const copy = document.createElement("div");
      copy.className = "internal-row-copy";
      const strong = document.createElement("strong");
      strong.textContent = label;
      const small = document.createElement("small");
      small.textContent = detail;
      copy.append(strong, small);
      row.append(copy);
      if (url) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "settings-add";
        button.textContent = actionLabel;
        button.addEventListener("click", () => navigate(url));
        row.append(button);
      }
      list.append(row);
    };
    const addNote = text => {
      const note = document.createElement("p");
      note.className = "internal-note";
      note.textContent = text;
      list.append(note);
    };
    if (page === "history") {
      const entries = tabs.flatMap(tab => tab.history.map(url => ({ url, tab }))).filter(entry => !isInternalUrl(entry.url)).reverse();
      if (!entries.length) addNote("No web pages have been opened in this session yet.");
      entries.forEach(({ url }) => addRow(hostnameOf(url) || url, url, url));
      if (entries.length) {
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "settings-add";
        clear.textContent = "Clear session history";
        clear.addEventListener("click", () => {
          tabs.forEach(tab => { tab.history = tab.history.filter(url => isInternalUrl(url)); tab.historyIndex = tab.history.length - 1; });
          renderInternalPage("history");
        });
        list.prepend(clear);
      }
    } else if (page === "bookmarks") {
      if (!bookmarks.length) addNote("No bookmarks saved yet. Open a web page and select the bookmark icon to save it.");
      bookmarks.forEach((item, index) => {
        addRow(item.title || hostnameOf(item.url), item.url, item.url);
        const row = list.lastElementChild;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "shortcut-remove";
        remove.textContent = "×";
        remove.setAttribute("aria-label", `Remove ${item.title || item.url}`);
        remove.addEventListener("click", () => { bookmarks.splice(index, 1); saveBookmarks(); render(); });
        row.append(remove);
      });
    } else if (page === "about") {
      addNote("NightShift routes web pages through the configured proxy connection. The project source and release notes are available here:");
      addRow("NightShift source", "GitHub repository", "https://github.com/NightShift-Network/NightShift-source");
      addRow("Created by palmtree890", "GitHub profile", "https://github.com/palmtree890");
    } else if (page === "privacy") {
      addNote("Bookmarks, shortcuts, search preferences, cloaking options, and transport preferences are stored in this browser’s local storage. The app also loads the configured Umami analytics script to measure website usage. Browsing destinations are requested through the NightShift server, which can see destination connection details. Avoid entering sensitive information unless you trust the server operator.");
      addRow("Review browser settings", "Search, transport, cloaking, and backup", INTERNAL_SETTINGS);
    } else if (page === "diagnostics") {
      addNote(buildDiagnostics());
      if (diagnosticErrors.length) {
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "settings-add";
        clear.textContent = "Clear recent errors";
        clear.addEventListener("click", () => { diagnosticErrors.length = 0; renderInternalPage("diagnostics"); });
        list.prepend(clear);
      }
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "settings-add";
      copy.textContent = "Copy diagnostics";
      copy.addEventListener("click", copyDiagnostics);
      list.append(copy);
    } else if (page === "shortcuts") {
      [
        ["Focus address bar", "Ctrl / ⌘ + L", ""],
        ["Open a new tab", "Ctrl / ⌘ + T", "nightshift://newtab"],
        ["Close the current tab", "Ctrl / ⌘ + W", ""],
        ["Go back / forward", "Alt + ← / →", ""],
      ].forEach(([label, detail, url]) => addRow(label, detail, url));
      addRow("Manage quick access", "Edit the sites shown on the new tab page", INTERNAL_SETTINGS);
    } else {
      addNote("Use the address bar to open a website or enter an internal NightShift page. Settings, bookmarks, and shortcuts are stored locally in this browser.");
      INTERNAL_PAGES.forEach(route => addRow(route[0].toUpperCase() + route.slice(1), `nightshift://${route}`, `nightshift://${route}`));
      addRow("Open Settings", "Change search, transport, cloaking, and quick access", INTERNAL_SETTINGS);
    }
    shell.append(list);
    internalPage.replaceChildren(shell);
  }

  function renderBookmarks() {
    bookmarkItems.replaceChildren();
    bookmarksBar.hidden = bookmarks.length === 0;
    bookmarks.forEach((saved, index) => {
      const item = document.createElement("span");
      item.className = "bookmark-item";
      const open = document.createElement("button");
      open.type = "button";
      open.className = "bookmark-link";
      open.textContent = saved.title || new URL(saved.url).hostname;
      open.title = saved.url;
      open.addEventListener("click", () => navigate(saved.url));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "bookmark-remove";
      remove.textContent = "×";
      remove.title = `Remove ${saved.title || saved.url}`;
      remove.setAttribute("aria-label", remove.title);
      remove.addEventListener("click", () => {
        bookmarks.splice(index, 1);
        saveBookmarks();
        render();
      });
      item.append(open, remove);
      bookmarkItems.append(item);
    });
  }

  function renderShortcuts() {
    shortcutList.replaceChildren();
    document.querySelector(".section-count").textContent = String(shortcuts.length).padStart(2, "0");
    shortcuts.forEach(site => {
      const button = document.createElement("button");
      button.className = "shortcut";
      button.type = "button";
      button.title = site.url;
      const mark = document.createElement("span");
      mark.className = "shortcut-icon custom-shortcut-icon";
      mark.textContent = (site.name.trim()[0] || "•").toUpperCase();
      const copy = document.createElement("span");
      copy.className = "shortcut-copy";
      const name = document.createElement("strong");
      name.textContent = site.name;
      const url = document.createElement("small");
      url.textContent = site.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
      copy.append(name, url);
      const arrow = document.createElement("span");
      arrow.className = "shortcut-arrow";
      arrow.textContent = "↗";
      button.append(mark, copy, arrow);
      button.addEventListener("click", () => navigate(site.url));
      shortcutList.append(button);
    });
  }

  function renderShortcutEditor(items = shortcuts) {
    shortcutEditor.replaceChildren();
    items.forEach((site, index) => {
      const row = document.createElement("div");
      row.className = "shortcut-editor-row";
      const name = document.createElement("input");
      name.className = "settings-input shortcut-name";
      name.type = "text";
      name.maxLength = 32;
      name.placeholder = "Site name";
      name.setAttribute("aria-label", `Site ${index + 1} name`);
      name.value = site.name || "";
      const url = document.createElement("input");
      url.className = "settings-input shortcut-url";
      url.type = "text";
      url.placeholder = "https://example.com";
      url.setAttribute("aria-label", `Site ${index + 1} address`);
      url.value = site.url || "";
      const remove = document.createElement("button");
      remove.className = "shortcut-remove";
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove site ${index + 1}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        const current = readShortcutEditor();
        current.splice(index, 1);
        renderShortcutEditor(current);
      });
      row.append(name, url, remove);
      shortcutEditor.append(row);
    });
  }

  function readShortcutEditor() {
    return [...shortcutEditor.querySelectorAll(".shortcut-editor-row")].map(row => ({
      name: row.querySelector(".shortcut-name").value.trim(),
      url: row.querySelector(".shortcut-url").value.trim(),
    }));
  }

  function activate(id) {
    if (!tabs.some(tab => tab.id === id)) return;
    activeId = id;
    startFrameWatcher(tabs.find(tab => tab.id === id));
    render();
  }

  function createTab(url = INTERNAL_NEW_TAB, restored = null) {
    const id = restored?.id ?? nextId++;
    nextId = Math.max(nextId, id + 1);
    const frame = document.createElement("iframe");
    frame.className = "browser-frame";
    frame.setAttribute("title", "Browser page");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.addEventListener("load", () => {
      const tab = tabs.find(item => item.id === id);
      if (!tab || !tab.url) return;
      const dest = decodeFrameUrl(tab.frame);
      if (dest && dest !== tab.frameUrl) recordFrameDestination(tab, dest);
      clearTimeout(tab.loadingTimer);
      tab.loading = false;
      tab.slowLoading = false;
      if (tab.title === "Loading…") {
        // Proxied frames are same-origin, so the document title is readable.
        let pageTitle = "";
        try { pageTitle = tab.frame.contentDocument?.title?.trim() || ""; } catch {}
        tab.title = pageTitle || new URL(tab.url).hostname.replace(/^www\./, "");
      }
      updateBookmarkForTab(tab);
      rememberSiteTransport(tab.url, activeTransport);
      render();
    });
    framesEl.append(frame);
    const tab = { id, url: "", title: "New tab", frame, browserFrame: null, history: [], historyIndex: -1, loading: false, slowLoading: false, loadingTimer: null, frameUrl: "", locationTimer: null };
    tabs.push(tab);
    activeId = id;
    startFrameWatcher(tab);
    if (url) navigate(url);
    else render();
    return tab;
  }

  function closeTab(id) {
    const index = tabs.findIndex(tab => tab.id === id);
    if (index < 0) return;
    clearInterval(tabs[index].locationTimer);
    tabs[index].frame.remove();
    tabs.splice(index, 1);
    if (!tabs.length) createTab();
    else if (activeId === id) activate(tabs[Math.min(index, tabs.length - 1)].id);
    else render();
  }

  function normalizeInput(value) {
    const input = value.trim();
    if (!input) return "";
    if (/^nightshift:\/\/[a-z]+\/?$/i.test(input)) {
      const route = input.toLowerCase().replace(/\/$/, "");
      if (INTERNAL_URLS.includes(route)) return route;
    }
    if (/^(https?:\/\/|about:)/i.test(input)) return input;
    if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?:#]|$)/i.test(input) || /^[^\s]+\.[a-z]{2,}(:\d+)?([/?:#]|$)/i.test(input)) return `https://${input}`;
    const template = searchSettings.engine === "custom" ? searchSettings.endpoint : SEARCH_ENGINES[searchSettings.engine];
    if (!template || (!template.includes("%s") && !template.includes("{query}"))) {
      notify("Set a search URL template with %s in Settings.");
      return "";
    }
    const encoded = encodeURIComponent(input);
    const searchUrl = template.replaceAll("%s", encoded).replaceAll("{query}", encoded);
    try {
      const parsed = new URL(searchUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Unsupported protocol");
      return parsed.href;
    } catch {
      notify("That search URL is invalid. Check it in Settings.");
      return "";
    }
  }

  async function getBrowserController() {
    if (!controllerPromise) controllerPromise = (async () => {
      if (!("serviceWorker" in navigator)) throw new Error("Service workers are unavailable");
      const registration = await navigator.serviceWorker.register("/sw.js", { type: "classic", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const serviceworker = navigator.serviceWorker.controller || registration.active;
      if (!serviceworker) throw new Error("Scramjet service worker is not active");
      const transport = await makeTransport(browserTransport);
      activeTransport = browserTransport;
      const { Controller, config } = window.$scramjetController;
      config.injectPath = "/controller/controller.inject.js";
      config.scramjetPath = "/scram/scramjet.js";
      config.wasmPath = "/scram/scramjet.wasm";
      const controller = new Controller({
        serviceworker,
        transport,
        scramjetConfig: {
          flags: {
            captureErrors: true,
            cleanErrors: true,
            syncxhr: syncXhr,
          },
        },
      });
      await controller.wait();
      return controller;
    })();
    return controllerPromise;
  }

  const transportLoads = new Map();
  async function makeTransport(kind) {
    if (!transportLoads.has(kind)) {
      const path = kind === "epoxy" ? "/epoxy/index.js" : "/libcurl/index.js";
      transportLoads.set(kind, new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = path;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Could not load ${kind} transport`));
        document.head.append(script);
      }));
    }
    await transportLoads.get(kind);
    if (kind === "epoxy") return new window.EpoxyTransport.default({ wisp: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/wisp/` });
    return new window.LibcurlTransport.LibcurlClient({ wisp: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/wisp/` });
  }

  async function getBrowserFrame(tab) {
    if (!tab.browserFrame) {
      const controller = await getBrowserController();
      tab.browserFrame = controller.createFrame(tab.frame);
    }
    return tab.browserFrame;
  }

  async function navigate(value, options = {}) {
    const tab = activeTab();
    if (!tab) return;
    const target = normalizeInput(value);
    if (!target) return;
    clearTimeout(tab.loadingTimer);
    if (!options.history) {
      tab.history = tab.history.slice(0, tab.historyIndex + 1);
      tab.history.push(target);
      tab.historyIndex = tab.history.length - 1;
    }
    tab.url = target;
    tab.title = target === INTERNAL_SETTINGS ? "Settings" : target === INTERNAL_NEW_TAB ? "New tab" : "Loading…";
    tab.loading = !isInternalUrl(target);
    tab.slowLoading = false;
    if (isInternalUrl(target)) {
      tab.frameUrl = "";
      render();
      return;
    }
    tab.loadingTimer = setTimeout(() => {
      if (tab.loading) {
        tab.slowLoading = true;
        render();
      }
    }, 12_000);
    render();
    try {
      const browserFrame = await getBrowserFrame(tab);
      const wanted = preferredTransportFor(target);
      if (wanted !== activeTransport) await useTransport(wanted);
      browserFrame.go(target);
    } catch (error) {
      clearTimeout(tab.loadingTimer);
      tab.loading = false;
      tab.slowLoading = false;
      render();
      console.error(error);
      notify("Could not open this page. Check the browser connection and try again.");
      return;
    }
  }

  function goHistory(delta) {
    const tab = activeTab();
    if (!tab) return;
    const index = tab.historyIndex + delta;
    if (index < 0 || index >= tab.history.length) return;
    tab.historyIndex = index;
    navigate(tab.history[index], { history: true });
  }

  document.querySelector("#address-form").addEventListener("submit", event => {
    event.preventDefault();
    navigate(address.value);
  });
  document.querySelector("#hero-form").addEventListener("submit", event => {
    event.preventDefault();
    navigate(heroAddress.value);
  });
  document.querySelector("#new-tab").addEventListener("click", () => createTab());
  document.querySelector("#back").addEventListener("click", () => goHistory(-1));
  document.querySelector("#forward").addEventListener("click", () => goHistory(1));
  document.querySelector("#reload").addEventListener("click", () => {
    const tab = activeTab();
    if (tab?.url) navigate(tab.url, { history: true });
  });
  document.querySelector("#home").addEventListener("click", () => {
    navigate(INTERNAL_NEW_TAB);
  });
  bookmarkButton.addEventListener("click", () => {
    const tab = activeTab();
    if (!tab?.url) { notify("Open a page to bookmark it."); return; }
    const index = bookmarks.findIndex(item => item.url === tab.url);
    if (index >= 0) {
      bookmarks.splice(index, 1);
      notify("Bookmark removed.");
    } else {
      bookmarks.push({
        url: tab.url,
        title: tab.title === "Loading…" ? new URL(tab.url).hostname.replace(/^www\./, "") : tab.title,
      });
      notify("Bookmark saved.");
    }
    saveBookmarks();
    render();
  });
  alternateTransportButton.addEventListener("click", async () => {
    const tab = activeTab();
    if (!tab?.url) return;
    const target = tab.url;
    const currentForSite = preferredTransportFor(target);
    const nextForSite = currentForSite === "libcurl" ? "epoxy" : "libcurl";
    alternateTransportButton.disabled = true;
    alternateTransportButton.textContent = "Switching transport…";
    try {
      // Pin this host to the alternate transport so the reload keeps it, and
      // a future visit starts with it. The global setting is left untouched.
      const host = hostnameOf(target);
      if (host) {
        siteTransports = { ...siteTransports, [host]: nextForSite };
        saveSiteTransports();
      }
      await useTransport(nextForSite);
      await navigate(target, { history: true });
    } catch (error) {
      console.error(error);
      notify("Could not switch transport. Check the browser connection and try again.");
    } finally {
      alternateTransportButton.disabled = false;
    }
  });
  function showCustomSearchSetting() {
    customSearchRow.hidden = searchEngineSelect.value !== "custom";
  }

  function updateSearchPlaceholder() {
    const labels = { duckduckgo: "DuckDuckGo", brave: "Brave Search", startpage: "Startpage", palmtree: "Palmtree Search", custom: "your search engine" };
    heroAddress.placeholder = `Search ${labels[searchSettings.engine] || "the web"} or enter an address`;
  }

  function populateSettings() {
    searchEngineSelect.value = searchSettings.engine;
    browserTransportSelect.value = browserTransport;
    if (syncXhrCheckbox) syncXhrCheckbox.checked = syncXhr;
    cloakModeSelect.value = cloakMode;
    favoriteCloakModeSelect.value = favoriteCloakMode;
    cloakTitleInput.value = cloakSettings.title;
    cloakIconInput.value = cloakSettings.icon;
    cloakRedirectInput.value = cloakSettings.redirect;
    if (autoCloakCheckbox) autoCloakCheckbox.checked = Boolean(cloakSettings.autoCloak);
    if (appleTouchDisguiseCheckbox) appleTouchDisguiseCheckbox.checked = Boolean(appleTouchDisguise);
    customSearchInput.value = searchSettings.endpoint;
    renderShortcutEditor();
    showCustomSearchSetting();
  }

  function openSettings() {
    populateSettings();
    settingsDialog.hidden = false;
    searchEngineSelect.focus();
  }

  function closeSettings() {
    navigate(INTERNAL_NEW_TAB);
  }

  function exportBackup() {
    const backup = {
      app: "NightShift",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      settings: {
        search: searchSettings,
        transport: browserTransport,
        shortcuts,
        cloaking: {
          mode: cloakMode,
          favorite: favoriteCloakMode,
          ...cloakSettings,
          appleTouchDisguise,
        },
        bookmarks,
      },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nightshift-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify("Backup exported.");
  }

  function validateBackup(value) {
    const data = value?.settings;
    if (value?.app !== "NightShift" || value?.formatVersion !== 1 || !data || typeof data !== "object") throw new Error("This is not a supported NightShift backup.");
    const search = data.search;
    if (!search || !["duckduckgo", "brave", "startpage", "palmtree", "custom"].includes(search.engine) || typeof search.endpoint !== "string") throw new Error("The search engine settings are invalid.");
    if (search.engine === "custom") {
      if (!search.endpoint.includes("%s") && !search.endpoint.includes("{query}")) throw new Error("The custom search URL must contain %s or {query}.");
      try {
        const parsed = new URL(search.endpoint.replaceAll("%s", "query").replaceAll("{query}", "query"));
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch { throw new Error("The custom search URL is invalid."); }
    }
    if (!["epoxy", "libcurl"].includes(data.transport)) throw new Error("The browser transport setting is invalid.");
    if (!Array.isArray(data.shortcuts) || data.shortcuts.length > 12) throw new Error("The quick access list is invalid.");
    const shortcuts = data.shortcuts.map(site => {
      if (!site || typeof site.name !== "string" || !site.name.trim() || typeof site.url !== "string") throw new Error("A quick access entry is invalid.");
      let parsed;
      try { parsed = new URL(site.url); } catch { throw new Error("A quick access address is invalid."); }
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Quick access addresses must use http or https.");
      return { name: site.name.trim().slice(0, 60), url: parsed.href };
    });
    const cloaking = data.cloaking;
    if (!cloaking || !["none", "about:blank", "blob"].includes(cloaking.mode) || typeof cloaking.title !== "string" || typeof cloaking.icon !== "string") throw new Error("The cloaking settings are invalid.");
    const favoriteCloakMode = ["about:blank", "blob"].includes(cloaking.favorite) ? cloaking.favorite : "about:blank";
    const cloakRedirect = cloaking.redirect === undefined ? "https://www.google.com/" : normalizeCloakRedirect(cloaking.redirect);
    if (!cloakRedirect) throw new Error("The cloaking redirect must be a valid http or https address.");
    if (!Array.isArray(data.bookmarks) || data.bookmarks.length > 500) throw new Error("The bookmarks list is invalid.");
    const bookmarks = data.bookmarks.map(item => {
      if (!item || typeof item.title !== "string" || typeof item.url !== "string") throw new Error("A bookmark entry is invalid.");
      let parsed;
      try { parsed = new URL(item.url); } catch { throw new Error("A bookmark address is invalid."); }
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Bookmark addresses must use http or https.");
      return { title: item.title.slice(0, 300), url: parsed.href };
    });
    return {
      search: { engine: search.engine, endpoint: search.endpoint.slice(0, 2048) },
      transport: data.transport,
      shortcuts,
      cloaking: {
        mode: cloaking.mode,
        favorite: favoriteCloakMode,
        title: cloaking.title.slice(0, 64) || "Nightshift",
        icon: cloaking.icon.slice(0, 2048),
        redirect: cloakRedirect,
        autoCloak: Boolean(cloaking.autoCloak),
        appleTouchDisguise: Boolean(cloaking.appleTouchDisguise),
      },
      bookmarks,
    };
  }

  async function importBackup(file) {
    try {
      if (file.size > 2_000_000) throw new Error("Backup file is too large.");
      const imported = validateBackup(JSON.parse(await file.text()));
      if (imported.transport !== browserTransport) {
        siteTransports = {};
        saveSiteTransports();
        if (controllerPromise) await useTransport(imported.transport);
      }
      searchSettings = imported.search;
      browserTransport = imported.transport;
      shortcuts = imported.shortcuts;
      cloakMode = imported.cloaking.mode;
      favoriteCloakMode = imported.cloaking.favorite;
      cloakSettings = {
        title: imported.cloaking.title,
        icon: imported.cloaking.icon,
        redirect: imported.cloaking.redirect,
        autoCloak: Boolean(imported.cloaking.autoCloak),
      };
      appleTouchDisguise = Boolean(imported.cloaking.appleTouchDisguise);
      bookmarks = imported.bookmarks;
      try {
        localStorage.setItem("nightshift-search-settings", JSON.stringify(searchSettings));
        localStorage.setItem(TRANSPORT_KEY, browserTransport);
        localStorage.setItem("nightshift-shortcuts", JSON.stringify(shortcuts));
        localStorage.setItem("nightshift-cloak-mode", cloakMode);
        localStorage.setItem("nightshift-favorite-cloak-mode", favoriteCloakMode);
        localStorage.setItem("nightshift-cloak-settings", JSON.stringify(cloakSettings));
        localStorage.setItem("nightshift-apple-touch-disguise", String(appleTouchDisguise));
        localStorage.setItem("nightshift-bookmarks", JSON.stringify(bookmarks));
      } catch { throw new Error("Browser storage is full; imported settings could not be saved."); }
      updateSearchPlaceholder();
      updateAppleTouchIcon(appleTouchDisguise);
      searchEngineSelect.value = searchSettings.engine;
      customSearchInput.value = searchSettings.endpoint;
      browserTransportSelect.value = browserTransport;
      cloakModeSelect.value = cloakMode;
      favoriteCloakModeSelect.value = favoriteCloakMode;
      cloakTitleInput.value = cloakSettings.title;
      cloakIconInput.value = cloakSettings.icon;
      cloakRedirectInput.value = cloakSettings.redirect;
      if (autoCloakCheckbox) autoCloakCheckbox.checked = Boolean(cloakSettings.autoCloak);
      if (appleTouchDisguiseCheckbox) appleTouchDisguiseCheckbox.checked = Boolean(appleTouchDisguise);
      renderShortcutEditor();
      showCustomSearchSetting();
      render();
      notify("Backup imported.");
    } catch (error) {
      console.error(error);
      notify(error instanceof Error ? error.message : "Could not import this backup.");
    }
  }

  document.querySelector(".settings-button").addEventListener("click", () => navigate(INTERNAL_SETTINGS));
  document.querySelector(".internal-links").addEventListener("click", event => {
    const link = event.target.closest("a[href^='nightshift://']");
    if (!link) return;
    event.preventDefault();
    navigate(link.getAttribute("href"));
  });
  document.querySelector("#settings-close").addEventListener("click", () => navigate(INTERNAL_NEW_TAB));
  document.querySelector("#settings-cancel").addEventListener("click", () => navigate(INTERNAL_NEW_TAB));
  searchEngineSelect.addEventListener("change", showCustomSearchSetting);
  document.querySelector("#export-settings").addEventListener("click", exportBackup);
  document.querySelector("#copy-diagnostics").addEventListener("click", copyDiagnostics);
  const importSettingsFile = document.querySelector("#import-settings-file");
  document.querySelector("#import-settings").addEventListener("click", () => importSettingsFile.click());
  importSettingsFile.addEventListener("change", () => {
    const [file] = importSettingsFile.files || [];
    if (file) importBackup(file);
    importSettingsFile.value = "";
  });
  document.querySelector("#add-shortcut").addEventListener("click", () => {
    const current = readShortcutEditor();
    if (current.length >= 12) { notify("You can add up to 12 sites."); return; }
    current.push({ name: "", url: "" });
    renderShortcutEditor(current);
    shortcutEditor.lastElementChild?.querySelector(".shortcut-name").focus();
  });
  document.querySelector("#settings-form").addEventListener("submit", async event => {
    event.preventDefault();
    const engine = searchEngineSelect.value;
    const endpoint = customSearchInput.value.trim();
    if (engine === "custom") {
      if (!endpoint.includes("%s") && !endpoint.includes("{query}")) {
        notify("Add %s where the search terms should go.");
        customSearchInput.focus();
        return;
      }
      const example = endpoint.replaceAll("%s", "nightshift").replaceAll("{query}", "nightshift");
      try {
        const parsed = new URL(example);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Unsupported protocol");
      } catch {
        notify("Enter a valid http or https search URL.");
        customSearchInput.focus();
        return;
      }
    }
    const editedShortcuts = readShortcutEditor();
    const normalizedShortcuts = [];
    for (const site of editedShortcuts) {
      if (!site.name && !site.url) continue;
      if (!site.name || !site.url) {
        notify("Each quick access site needs both a name and an address.");
        return;
      }
      const rawUrl = /^(https?:\/\/)/i.test(site.url) ? site.url : `https://${site.url}`;
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Unsupported protocol");
        normalizedShortcuts.push({ name: site.name, url: parsed.href });
      } catch {
        notify(`Check the web address for ${site.name}.`);
        return;
      }
    }
    if (normalizedShortcuts.length > 12) {
      notify("You can add up to 12 sites.");
      return;
    }
    const cloakRedirect = normalizeCloakRedirect(cloakRedirectInput.value);
    if (!cloakRedirect) {
      notify("Enter a valid http or https page for the original tab redirect.");
      cloakRedirectInput.focus();
      return;
    }
    const newTransport = browserTransportSelect.value;
    const transportChanged = newTransport !== browserTransport;
    browserTransport = newTransport;
    try { localStorage.setItem(TRANSPORT_KEY, browserTransport); } catch {}
    if (transportChanged) {
      // An explicit global change takes precedence over remembered per-site
      // transports, so start fresh.
      siteTransports = {};
      saveSiteTransports();
    }
    const newSyncXhr = Boolean(syncXhrCheckbox?.checked);
    const syncXhrChanged = newSyncXhr !== syncXhr;
    syncXhr = newSyncXhr;
    try { localStorage.setItem(SYNC_XHR_KEY, String(syncXhr)); } catch {}
    shortcuts = normalizedShortcuts;
    try { localStorage.setItem("nightshift-shortcuts", JSON.stringify(shortcuts)); } catch {}
    appleTouchDisguise = Boolean(appleTouchDisguiseCheckbox?.checked);
    try { localStorage.setItem("nightshift-apple-touch-disguise", String(appleTouchDisguise)); } catch {}
    updateAppleTouchIcon(appleTouchDisguise);

    const autoCloak = Boolean(autoCloakCheckbox?.checked);
    cloakSettings = {
      title: cloakTitleInput.value.trim().slice(0, 64) || "Nightshift",
      icon: cloakIconInput.value.trim(),
      redirect: cloakRedirect,
      autoCloak,
    };
    try { localStorage.setItem("nightshift-cloak-settings", JSON.stringify(cloakSettings)); } catch {}
    searchSettings = { engine, endpoint };
    try { localStorage.setItem("nightshift-search-settings", JSON.stringify(searchSettings)); } catch {}
    updateSearchPlaceholder();
    renderShortcuts();
    closeSettings();
    notify("Settings saved.");
    if (syncXhrChanged) notify("Settings saved. Reload Nightshift to apply sync XHR support.");
    if (transportChanged && controllerPromise) {
      void useTransport(newTransport).catch(error => {
        console.error(error);
        notify("Settings saved. Reload Nightshift to apply the new transport.");
      });
    }
  });
  function openCloaked(mode, settings = cloakSettings) {
    if (mode === "none") { notify("Choose a cloaking method first."); return; }
    const title = settings.title.trim().slice(0, 64) || "Nightshift";
    const icon = settings.icon.trim();
    const redirectUrl = normalizeCloakRedirect(settings.redirect);
    if (!redirectUrl) {
      notify("Set a valid http or https original tab page in Settings.");
      return;
    }
    const iconUrl = getCloakIconUrl(icon);
    if (iconUrl === null) {
      notify("Enter a valid http, https, or image data URL for the icon.");
      if (!settingsDialog.hidden) cloakIconInput.focus();
      return;
    }
    const appUrl = `${location.origin}${location.pathname}${location.search}${location.hash}`;
    const escapeHtml = value => value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const safeUrl = escapeHtml(appUrl);
    const safeTitle = escapeHtml(title);
    const iconTag = iconUrl ? `<link rel="icon" href="${escapeHtml(iconUrl)}">` : "";
    const wrapper = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title>${iconTag}<style>*{box-sizing:border-box}html,body,iframe{width:100%;height:100%;margin:0;border:0;overflow:hidden;background:#101110}iframe{display:block}</style></head><body><iframe src="${safeUrl}" title="${safeTitle}"></iframe></body></html>`;
    let popup;
    if (mode === "about:blank") {
      popup = window.open("about:blank", "_blank");
      if (popup) {
        const doc = popup.document;
        doc.title = title;
        doc.documentElement.style.cssText = "width:100%;height:100%;margin:0;overflow:hidden;background:#101110";
        doc.body.style.cssText = "width:100%;height:100%;margin:0;overflow:hidden;background:#101110";
        if (iconUrl) {
          const iconLink = doc.createElement("link");
          iconLink.rel = "icon";
          iconLink.href = iconUrl;
          doc.head.append(iconLink);
        }
        const frame = doc.createElement("iframe");
        frame.src = appUrl;
        frame.title = title;
        frame.allowFullscreen = true;
        frame.style.cssText = "display:block;width:100%;height:100%;border:0";
        doc.body.append(frame);
      }
    } else if (mode === "blob") {
      const blobUrl = URL.createObjectURL(new Blob([wrapper], { type: "text/html" }));
      popup = window.open(blobUrl, "_blank");
      if (popup) setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      else URL.revokeObjectURL(blobUrl);
    }
    if (!popup) notify("The browser blocked the new tab. Allow pop-ups for Nightshift and try again.");
    else {
      notify("Opened Nightshift in a cloaked tab.");
      location.assign(redirectUrl);
    }
  }
  document.querySelector("#open-cloaked").addEventListener("click", () => {
    cloakMode = cloakModeSelect.value;
    cloakSettings = { title: cloakTitleInput.value, icon: cloakIconInput.value, redirect: cloakRedirectInput.value };
    openCloaked(cloakMode, cloakSettings);
  });
  cloakTabButton.addEventListener("click", () => openCloaked(favoriteCloakMode));
  browserTabButton.addEventListener("click", () => {
    const current = activeTab();
    if (!current || !current.url) {
      heroAddress.focus();
    } else {
      address.focus();
      address.select();
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !settingsDialog.hidden) navigate(INTERNAL_NEW_TAB);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") { event.preventDefault(); address.focus(); address.select(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "t") { event.preventDefault(); createTab(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w" && tabs.length > 1) { event.preventDefault(); closeTab(activeId); }
    if (event.altKey && event.key === "ArrowLeft") goHistory(-1);
    if (event.altKey && event.key === "ArrowRight") goHistory(1);
  });

  function checkMobileDevice() {
    const ua = navigator.userAgent || "";
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const hasTouch = (navigator.maxTouchPoints > 0) || ("ontouchstart" in window);
    const isSmallScreen = window.matchMedia("(max-width: 768px)").matches;
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    return isMobileUA || (hasTouch && isCoarse) || isSmallScreen;
  }

  function updateDeviceClass() {
    const isMobile = checkMobileDevice();
    document.documentElement.classList.toggle("is-mobile", isMobile);
    const ua = navigator.userAgent || "";
    const isPhoneOrTablet = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    document.documentElement.classList.toggle("is-mobile-device", isPhoneOrTablet);
  }

  updateDeviceClass();
  window.addEventListener("resize", updateDeviceClass, { passive: true });
  window.addEventListener("orientationchange", updateDeviceClass, { passive: true });

  function updateClock() {
    document.querySelector("#clock").textContent = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  }
  updateClock();
  updateSearchPlaceholder();
  setInterval(updateClock, 60_000);

  function checkAutoCloak() {
    if (window.self !== window.top) return;
    const params = new URLSearchParams(location.search);
    if (params.has("nocloak") || params.has("cloaked")) return;
    if (!cloakSettings.autoCloak) return;
    if (sessionStorage.getItem("nightshift-autocloak-attempted")) return;
    sessionStorage.setItem("nightshift-autocloak-attempted", "1");
    openCloaked(favoriteCloakMode);
  }

  createTab(INTERNAL_NEW_TAB);
  checkAutoCloak();
})();
