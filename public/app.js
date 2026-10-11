(() => {
  const tabsEl = document.querySelector("#tabs");
  const proxyTabButton = document.querySelector("#proxy-tab");
  const framesEl = document.querySelector("#frames");
  const homeView = document.querySelector("#home-view");
  const pageLoading = document.querySelector("#page-loading");
  const pageLoadingNote = document.querySelector("#page-loading-note");
  const alternateTransportButton = document.querySelector("#retry-other-transport");
  const address = document.querySelector("#address");
  const heroAddress = document.querySelector("#hero-address");
  const toast = document.querySelector("#toast");
  const bookmarkButton = document.querySelector("#bookmark");
  const bookmarksBar = document.querySelector("#bookmarks-bar");
  const bookmarkItems = document.querySelector("#bookmark-items");
  const settingsDialog = document.querySelector("#settings");
  const searchEngineSelect = document.querySelector("#search-engine");
  const proxyTransportSelect = document.querySelector("#proxy-transport");
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
  let searchSettings = loadSearchSettings();
  let proxyTransport = loadProxyTransport();
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

  const DEFAULT_APPLE_TOUCH_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 180'%3E%3Crect width='180' height='180' rx='38' fill='%23b9f37c'/%3E%3Cpath d='M112.5 36a58.5 58.5 0 1 0 31.5 103.5A67.5 67.5 0 0 1 112.5 36Z' fill='%23101110'/%3E%3C/svg%3E";
  const NOTES_APPLE_TOUCH_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 180'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0%25' stop-color='%23f6c035'/%3E%3Cstop offset='100%25' stop-color='%23e19c15'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='180' height='180' rx='38' fill='%23fbfaf6'/%3E%3Cpath d='M0 38C0 17 17 0 38 0h104c21 0 38 17 38 38v16H0V38z' fill='url(%23g)'/%3E%3Cline x1='0' y1='54' x2='180' y2='54' stroke='%23c4850e' stroke-width='2'/%3E%3Cline x1='0' y1='80' x2='180' y2='80' stroke='%23e3e1da' stroke-width='2'/%3E%3Cline x1='0' y1='106' x2='180' y2='106' stroke='%23e3e1da' stroke-width='2'/%3E%3Cline x1='0' y1='132' x2='180' y2='132' stroke='%23e3e1da' stroke-width='2'/%3E%3Cline x1='0' y1='158' x2='180' y2='158' stroke='%23e3e1da' stroke-width='2'/%3E%3Cline x1='38' y1='54' x2='38' y2='180' stroke='%23f2dede' stroke-width='1.6'/%3E%3C/svg%3E";

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
  const faviconText = (tab) => tab.url ? (new URL(tab.url).hostname.replace(/^www\./, "")[0] || "•").toUpperCase() : icon;

  function loadSearchSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem("nightshift-search-settings") || "null");
      if (saved && ["duckduckgo", "brave", "startpage", "palmtree", "custom"].includes(saved.engine)) {
        return { engine: saved.engine, endpoint: typeof saved.endpoint === "string" ? saved.endpoint : "" };
      }
    } catch {}
    return { engine: "duckduckgo", endpoint: "" };
  }

  function loadProxyTransport() {
    try {
      const saved = localStorage.getItem("nightshift-proxy-transport");
      if (saved === "epoxy" || saved === "libcurl") return saved;
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
    return "about:blank";
  }

  function loadCloakSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem("nightshift-cloak-settings") || "null");
      if (saved && typeof saved === "object") {
        return {
          title: typeof saved.title === "string" ? saved.title.slice(0, 64) : "Nightshift",
          icon: typeof saved.icon === "string" ? saved.icon : "",
          redirect: normalizeCloakRedirect(saved.redirect) || "https://www.google.com/",
          autoCloak: Boolean(saved.autoCloak),
        };
      }
    } catch {}
    return { title: "Nightshift", icon: "", redirect: "https://www.google.com/", autoCloak: false };
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
    proxyTabButton.setAttribute("aria-pressed", "true");
    tabs.forEach(tab => {
      const button = document.createElement("button");
      button.className = `tab${tab.id === activeId ? " active" : ""}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(tab.id === activeId));
      button.title = tab.url || "New tab";
      const mark = document.createElement("span");
      mark.className = "tab-favicon";
      if (tab.url) mark.textContent = faviconText(tab); else mark.innerHTML = icon;
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
      tab.frame.classList.toggle("active", tab.id === activeId && Boolean(tab.url));
    });
    const current = activeTab();
    homeView.classList.toggle("hidden", Boolean(current?.url));
    pageLoading.hidden = !(current?.url && current.loading);
    pageLoadingNote.textContent = current?.slowLoading
      ? "Still loading. ChatGPT is a large app; try Epoxy in Settings if it stays here."
      : "Large sites can take a moment.";
    alternateTransportButton.hidden = !current?.slowLoading;
    alternateTransportButton.textContent = proxyTransport === "libcurl" ? "Retry with Epoxy" : "Retry with libcurl";
    address.value = current?.url || "";
    const currentBookmarked = Boolean(current?.url && bookmarks.some(item => item.url === current.url));
    bookmarkButton.classList.toggle("saved", currentBookmarked);
    bookmarkButton.setAttribute("aria-pressed", String(currentBookmarked));
    renderBookmarks();
    renderShortcuts();
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
    render();
  }

  function createTab(url = "", restored = null) {
    const id = restored?.id ?? nextId++;
    nextId = Math.max(nextId, id + 1);
    const frame = document.createElement("iframe");
    frame.className = "proxy-frame";
    frame.setAttribute("title", "Proxied web page");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.addEventListener("load", () => {
      const tab = tabs.find(item => item.id === id);
      if (!tab || !tab.url) return;
      clearTimeout(tab.loadingTimer);
      tab.loading = false;
      tab.slowLoading = false;
      if (tab.title === "Loading…") tab.title = new URL(tab.url).hostname.replace(/^www\./, "");
      updateBookmarkForTab(tab);
      render();
    });
    framesEl.append(frame);
    const tab = { id, url: "", title: "New tab", frame, proxyFrame: null, history: [], historyIndex: -1, loading: false, slowLoading: false, loadingTimer: null };
    tabs.push(tab);
    activeId = id;
    if (url) navigate(url);
    else render();
    return tab;
  }

  function closeTab(id) {
    const index = tabs.findIndex(tab => tab.id === id);
    if (index < 0) return;
    tabs[index].frame.remove();
    tabs.splice(index, 1);
    if (!tabs.length) createTab();
    else if (activeId === id) activate(tabs[Math.min(index, tabs.length - 1)].id);
    else render();
  }

  function normalizeInput(value) {
    const input = value.trim();
    if (!input) return "";
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

  async function getProxyController() {
    if (!controllerPromise) controllerPromise = (async () => {
      if (!("serviceWorker" in navigator)) throw new Error("Service workers are unavailable");
      const registration = await navigator.serviceWorker.register("/sw.js", { type: "classic", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const serviceworker = navigator.serviceWorker.controller || registration.active;
      if (!serviceworker) throw new Error("Scramjet service worker is not active");
      const transport = await makeTransport(proxyTransport);
      const { Controller, config } = window.$scramjetController;
      config.injectPath = "/controller/controller.inject.js";
      config.scramjetPath = "/scram/scramjet.js";
      config.wasmPath = "/scram/scramjet.wasm";
      const controller = new Controller({ serviceworker, transport });
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
    if (kind === "epoxy") return new window.EpoxyTransport.EpoxyClient({ wisp: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/wisp/` });
    return new window.LibcurlTransport.LibcurlClient({ wisp: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/wisp/` });
  }

  async function getProxyFrame(tab) {
    if (!tab.proxyFrame) {
      const controller = await getProxyController();
      tab.proxyFrame = controller.createFrame(tab.frame);
    }
    return tab.proxyFrame;
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
    tab.title = "Loading…";
    tab.loading = true;
    tab.slowLoading = false;
    tab.loadingTimer = setTimeout(() => {
      if (tab.loading) {
        tab.slowLoading = true;
        render();
      }
    }, 12_000);
    render();
    try {
      const proxyFrame = await getProxyFrame(tab);
      proxyFrame.go(target);
    } catch (error) {
      clearTimeout(tab.loadingTimer);
      tab.loading = false;
      tab.slowLoading = false;
      render();
      console.error(error);
      notify("Could not open this page. Check the proxy connection and try again.");
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
    const tab = activeTab();
    if (!tab) return;
    tab.url = "";
    tab.title = "New tab";
    clearTimeout(tab.loadingTimer);
    tab.loading = false;
    tab.slowLoading = false;
    render();
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
    const nextTransport = proxyTransport === "libcurl" ? "epoxy" : "libcurl";
    alternateTransportButton.disabled = true;
    alternateTransportButton.textContent = "Switching transport…";
    try {
      const controller = await getProxyController();
      controller.setTransport(await makeTransport(nextTransport));
      proxyTransport = nextTransport;
      try { localStorage.setItem("nightshift-proxy-transport", proxyTransport); } catch {}
      await navigate(target, { history: true });
    } catch (error) {
      console.error(error);
      notify("Could not switch transport. Check the proxy connection and try again.");
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

  function openSettings() {
    searchEngineSelect.value = searchSettings.engine;
    proxyTransportSelect.value = proxyTransport;
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
    settingsDialog.hidden = false;
    searchEngineSelect.focus();
  }

  function closeSettings() {
    settingsDialog.hidden = true;
  }

  function exportBackup() {
    const backup = {
      app: "NightShift",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      settings: {
        search: searchSettings,
        transport: proxyTransport,
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
    if (!["epoxy", "libcurl"].includes(data.transport)) throw new Error("The proxy transport setting is invalid.");
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
      if (imported.transport !== proxyTransport && controllerPromise) {
        const controller = await getProxyController();
        controller.setTransport(await makeTransport(imported.transport));
      }
      searchSettings = imported.search;
      proxyTransport = imported.transport;
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
        localStorage.setItem("nightshift-proxy-transport", proxyTransport);
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
      proxyTransportSelect.value = proxyTransport;
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

  document.querySelector(".settings-button").addEventListener("click", openSettings);
  document.querySelector("#settings-close").addEventListener("click", closeSettings);
  document.querySelector("#settings-cancel").addEventListener("click", closeSettings);
  settingsDialog.addEventListener("click", event => {
    if (event.target === settingsDialog) closeSettings();
  });
  searchEngineSelect.addEventListener("change", showCustomSearchSetting);
  document.querySelector("#export-settings").addEventListener("click", exportBackup);
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
    const newTransport = proxyTransportSelect.value;
    const transportChanged = newTransport !== proxyTransport;
    proxyTransport = newTransport;
    try { localStorage.setItem("nightshift-proxy-transport", proxyTransport); } catch {}
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
    if (transportChanged && controllerPromise) {
      void (async () => {
        const controller = await getProxyController();
        controller.setTransport(await makeTransport(newTransport));
      })().catch(error => {
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
  proxyTabButton.addEventListener("click", () => {
    const current = activeTab();
    if (!current || !current.url) {
      heroAddress.focus();
    } else {
      address.focus();
      address.select();
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !settingsDialog.hidden) closeSettings();
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

  createTab();
  checkAutoCloak();
})();
