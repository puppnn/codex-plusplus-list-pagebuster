(() => {
  const TARGET = 500;
  const SCRIPT_KEY = "__codexListPagebuster";
  const STORAGE_KEY = "__codexListPagebusterThreads";
  const PROJECT_LIST_SELECTOR = "[data-app-action-sidebar-project-list-id]";
  const THREAD_SELECTOR = "[data-app-action-sidebar-thread-id]";
  const SUPPLEMENT_SELECTOR = "[data-clpb-history-section]";
  const EXPAND_TEXT = /^(?:\u5c55\u5f00\u663e\u793a|\u663e\u793a\u66f4\u591a|Show more|Show all)$/i;
  const KEYWORDS = /(?:thread|threads|session|sessions|history|recent|conversation|project)/i;
  const LIMIT_KEYS = ["limit", "pageSize", "page_size", "first", "take", "perPage", "per_page", "count", "max", "size", "n"];

  if (window[SCRIPT_KEY]?.stop) {
    window[SCRIPT_KEY].stop();
  }

  const state = {
    observer: null,
    timers: new Set(),
    clicked: new WeakSet(),
    scheduled: false,
    autoExpandEnabled: true,
    programmaticExpand: false,
    projectClickListener: null,
    autoExpandDeadlineMs: Date.now() + 8000,
    lastProjectRoots: new Set(),
    fetchPatched: false,
    xhrPatched: false,
    supplementIds: "",
    promoteInFlight: false,
    promotedKey: "",
    originalFetch: window.fetch,
    originalXhrOpen: XMLHttpRequest.prototype.open,
    originalXhrSend: XMLHttpRequest.prototype.send
  };

  function log(...args) {
    try {
      console.info("[clpb]", ...args);
    } catch {}
  }

  function setManagedTimeout(fn, ms) {
    const timer = window.setTimeout(() => {
      state.timers.delete(timer);
      fn();
    }, ms);
    state.timers.add(timer);
  }

  function rewriteUrl(raw) {
    try {
      const url = new URL(raw, window.location.href);
      let changed = false;
      for (const key of LIMIT_KEYS) {
        if (!url.searchParams.has(key)) continue;
        const value = Number.parseInt(url.searchParams.get(key) || "", 10);
        if (Number.isFinite(value) && value > 0 && value <= 50) {
          url.searchParams.set(key, String(TARGET));
          changed = true;
        }
      }
      return changed ? url.toString() : raw;
    } catch {
      return raw;
    }
  }

  function rewriteBody(body) {
    if (typeof body !== "string" || !body) return body;
    let next = body;
    for (const key of LIMIT_KEYS) {
      const re = new RegExp(`(["']?${key}["']?\\s*[:=]\\s*)(\\d+)`, "gi");
      next = next.replace(re, (match, prefix, value) => {
        const n = Number.parseInt(value, 10);
        return Number.isFinite(n) && n > 0 && n <= 50 ? `${prefix}${TARGET}` : match;
      });
    }
    return next;
  }

  function patchRequests() {
    if (!state.fetchPatched && typeof window.fetch === "function") {
      const originalFetch = state.originalFetch.bind(window);
      window.fetch = function patchedFetch(input, init) {
        try {
          const url = typeof input === "string" ? input : input?.url;
          if (typeof url === "string" && KEYWORDS.test(url)) {
            const next = rewriteUrl(url);
            if (next !== url) log("fetch url", url, "->", next);
            if (typeof input === "string") {
              input = next;
            } else if (input instanceof Request && next !== url) {
              input = new Request(next, input);
            }
            if (init && typeof init.body === "string") {
              const nextBody = rewriteBody(init.body);
              if (nextBody !== init.body) log("fetch body patched");
              init = { ...init, body: nextBody };
            }
          }
        } catch (error) {
          log("fetch patch error", String(error));
        }
        return originalFetch(input, init);
      };
      state.fetchPatched = true;
    }

    if (!state.xhrPatched) {
      XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
        const next = KEYWORDS.test(String(url)) ? rewriteUrl(String(url)) : url;
        if (next !== url) log("xhr url", url, "->", next);
        return state.originalXhrOpen.call(this, method, next, ...rest);
      };
      XMLHttpRequest.prototype.send = function patchedSend(body) {
        try {
          if (typeof body === "string") {
            const nextBody = rewriteBody(body);
            if (nextBody !== body) log("xhr body patched");
            body = nextBody;
          }
        } catch (error) {
          log("xhr patch error", String(error));
        }
        return state.originalXhrSend.call(this, body);
      };
      state.xhrPatched = true;
    }
  }

  function isExpandButton(button) {
    if (!(button instanceof HTMLButtonElement)) return false;
    if (button.disabled || state.clicked.has(button)) return false;
    return EXPAND_TEXT.test((button.textContent || "").trim());
  }

  function readSnapshotThreads() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const threads = raw ? JSON.parse(raw) : [];
      return Array.isArray(threads) ? threads.filter((thread) => thread && typeof thread.id === "string") : [];
    } catch (error) {
      log("snapshot read failed", String(error));
      return [];
    }
  }

  function threadRawId(threadOrId) {
    const id = typeof threadOrId === "string" ? threadOrId : threadOrId?.id;
    return String(id || "").replace(/^local:/, "");
  }

  function threadDomId(threadOrId) {
    return `local:${threadRawId(threadOrId)}`;
  }

  function normalizeCwd(cwd) {
    return String(cwd || "")
      .replace(/^\\\\\?\\/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizePathForCompare(path) {
    return normalizeCwd(path)
      .replace(/[\\/]+$/g, "")
      .toLowerCase();
  }

  function basename(path) {
    const normalized = normalizeCwd(path);
    return normalized.split(/[\\/]/).filter(Boolean).pop() || normalized || "unknown";
  }

  function rememberProjectRoots(roots) {
    const next = new Set(state.lastProjectRoots);
    for (const root of roots) {
      if (root) next.add(root);
    }
    state.lastProjectRoots = next;
    return next;
  }

  function collectSnapshotProjectRoots() {
    return new Set(
      readSnapshotThreads()
        .map((thread) => normalizePathForCompare(thread.cwd))
        .filter(Boolean)
    );
  }

  function collectVisibleProjectRoots() {
    const roots = new Set(
      Array.from(document.querySelectorAll("[data-app-action-sidebar-project-id]"))
        .map((row) => row.getAttribute("data-app-action-sidebar-project-id"))
        .map(normalizePathForCompare)
        .filter(Boolean)
    );
    if (roots.size > 0) {
      return rememberProjectRoots(roots);
    }
    if (state.lastProjectRoots.size > 0) {
      return state.lastProjectRoots;
    }
    const snapshotRoots = collectSnapshotProjectRoots();
    if (snapshotRoots.size > 0 && document.querySelector(PROJECT_LIST_SELECTOR)) {
      return rememberProjectRoots(snapshotRoots);
    }
    return snapshotRoots;
  }

  function threadHasVisibleProject(thread, projectRoots) {
    const cwd = normalizePathForCompare(thread?.cwd);
    if (!cwd) return false;
    for (const root of projectRoots) {
      if (!root) continue;
      if (cwd === root || cwd.startsWith(`${root}/`) || cwd.startsWith(`${root}\\`)) {
        return true;
      }
    }
    return false;
  }

  function collectNativeThreadIds() {
    return new Set(
      Array.from(document.querySelectorAll(THREAD_SELECTOR))
        .filter((row) => !row.closest(SUPPLEMENT_SELECTOR))
        .map((row) => row.getAttribute("data-app-action-sidebar-thread-id"))
        .filter(Boolean)
    );
  }

  function callAppAction(action, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const requestId = `clpb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error(`Codex app action timed out: ${action.type}`));
      }, timeoutMs);

      function onMessage(event) {
        const data = event.data;
        if (!data || data.type !== "debug-run-app-action-response" || data.requestId !== requestId) return;
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        if (data.ok) {
          resolve(data.result);
        } else {
          reject(new Error(data.errorMessage || `Codex app action failed: ${action.type}`));
        }
      }

      window.addEventListener("message", onMessage);
      const message = { type: "debug-run-app-action-request", requestId, action };
      const bridge = window.electronBridge;
      if (bridge?.sendMessageFromView) {
        bridge.sendMessageFromView(message).catch((error) => {
          window.clearTimeout(timeout);
          window.removeEventListener("message", onMessage);
          reject(error);
        });
      } else {
        window.postMessage(message, "*");
      }
    });
  }

  async function callInternalAction(type, payload) {
    const mod = await import("./assets/app-server-manager-signals-zAr_ejg8.js");
    const sendRequest = mod.ln;
    if (typeof sendRequest !== "function") {
      throw new Error("Codex internal request helper is unavailable");
    }
    return sendRequest(type, payload);
  }

  async function loadThreadIntoNativeCache(rawId) {
    const found = await callInternalAction("load-recent-conversation-ids-for-host", {
      hostId: "local",
      conversationIds: [rawId]
    });
    return Array.isArray(found) && found.includes(rawId);
  }

  async function promoteMissingToNative(missing) {
    const ids = Array.from(new Set(missing.map(threadRawId).filter(Boolean)));
    if (ids.length === 0 || state.promoteInFlight) return;
    const key = ids.join("|");
    if (key === state.promotedKey) return;
    state.promoteInFlight = true;
    state.promotedKey = key;
    try {
      const found = await callInternalAction("load-recent-conversation-ids-for-host", {
        hostId: "local",
        conversationIds: ids
      });
      log("native cache batch load", {
        requested: ids.length,
        found: Array.isArray(found) ? found.length : null
      });
      setManagedTimeout(() => scheduleExpand("native-cache-batch"), 250);
    } catch (error) {
      state.promotedKey = "";
      log("native cache batch load failed", String(error));
    } finally {
      state.promoteInFlight = false;
    }
  }

  async function openThread(thread) {
    const rawId = threadRawId(thread);
    const localId = `local:${rawId}`;
    const cwd = normalizeCwd(thread.cwd) || "/";

    try {
      const found = await loadThreadIntoNativeCache(rawId);
      log("native cache load", rawId, found);
    } catch (error) {
      log("native cache load failed", rawId, String(error));
    }

    try {
      await callInternalAction("maybe-resume-conversation", {
        hostId: "local",
        conversationId: rawId,
        model: null,
        reasoningEffort: null,
        workspaceRoots: [cwd],
        collaborationMode: null,
        showPausedGoalResumeConfirmation: true
      });
      log("thread resumed", rawId);
    } catch (error) {
      log("thread resume failed", rawId, String(error));
    }

    try {
      await loadThreadIntoNativeCache(rawId);
    } catch (error) {
      log("native cache reload failed", rawId, String(error));
    }

    try {
      await callAppAction({
        type: "windows.show_thread",
        windowId: "current",
        threadId: rawId
      });
      return;
    } catch (error) {
      log("show thread raw failed", rawId, String(error));
    }

    try {
      await callAppAction({
        type: "windows.show_thread",
        windowId: "current",
        threadId: localId
      });
    } catch (error) {
      log("show thread local failed", localId, String(error));
    }
  }

  function makeSupplementalRow(thread) {
    const threadId = threadDomId(thread);
    const titleText = thread.title || "Untitled thread";

    const item = document.createElement("div");
    item.className = "after:block after:h-px after:content-[''] last:after:hidden";
    item.setAttribute("role", "listitem");
    item.setAttribute("data-clpb-supplemental-item", "");

    const row = document.createElement("div");
    row.className = "group relative min-h-token-nav-row cursor-interaction rounded-lg px-row-x py-row-y text-sm hover:bg-token-list-hover-background focus-visible:outline-offset-[-2px]";
    row.setAttribute("data-app-action-sidebar-thread-host-id", "local");
    row.setAttribute("data-app-action-sidebar-thread-id", threadId);
    row.setAttribute("data-app-action-sidebar-thread-kind", "local");
    row.setAttribute("data-app-action-sidebar-thread-pinned", "false");
    row.setAttribute("data-app-action-sidebar-thread-row", "");
    row.setAttribute("data-app-action-sidebar-thread-title", titleText);
    row.setAttribute("data-clpb-supplemental-row", "true");
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("data-state", "closed");
    row.title = `${titleText}\n${normalizeCwd(thread.cwd)}`;

    const title = document.createElement("div");
    title.className = "min-w-0 truncate text-token-text-primary";
    title.textContent = titleText;

    const project = document.createElement("div");
    project.className = "min-w-0 truncate text-xs text-token-text-tertiary";
    project.textContent = basename(thread.cwd);

    row.append(title, project);
    row.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openThread(thread);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      openThread(thread);
    });

    item.appendChild(row);
    return item;
  }

  function countExpandButtons() {
    return Array.from(document.querySelectorAll(`${PROJECT_LIST_SELECTOR} button`)).filter(isExpandButton).length;
  }

  function renderSupplementalHistory() {
    const scroll = document.querySelector("[data-app-action-sidebar-scroll]");
    if (!scroll) return;

    const threads = readSnapshotThreads();
    const nativeIds = collectNativeThreadIds();
    const projectRoots = collectVisibleProjectRoots();
    const missing = threads.filter((thread) => !nativeIds.has(threadDomId(thread)) && !threadHasVisibleProject(thread, projectRoots));
    const nextIds = missing.map((thread) => threadDomId(thread)).join("|");
    const existing = document.querySelector(SUPPLEMENT_SELECTOR);

    if (missing.length === 0) {
      existing?.remove();
      state.supplementIds = "";
      return;
    }
    promoteMissingToNative(missing);
    if (existing && state.supplementIds === nextIds) return;

    existing?.remove();
    state.supplementIds = nextIds;

    const section = document.createElement("div");
    section.className = "px-row-x";
    section.setAttribute("data-app-action-sidebar-section", "");
    section.setAttribute("data-clpb-history-section", "");

    const heading = document.createElement("div");
    heading.className = "flex h-8 items-center px-2 text-xs font-semibold uppercase text-token-text-tertiary";
    heading.textContent = `Extra history (${missing.length})`;

    const list = document.createElement("div");
    list.className = "flex flex-col gap-px";
    list.setAttribute("role", "list");
    list.setAttribute("aria-label", "Extra history");
    missing.forEach((thread) => list.appendChild(makeSupplementalRow(thread)));

    section.append(heading, list);
    scroll.appendChild(section);
    log("supplement rendered", {
      missing: missing.length,
      snapshot: threads.length,
      native: nativeIds.size
    });
  }

  function expandNativeProjectLists(reason = "scan") {
    let clicked = 0;
    const lists = Array.from(document.querySelectorAll(PROJECT_LIST_SELECTOR));
    state.programmaticExpand = true;
    try {
      for (const list of lists) {
        const buttons = Array.from(list.querySelectorAll("button")).filter(isExpandButton);
        for (const button of buttons) {
          state.clicked.add(button);
          button.click();
          clicked += 1;
        }
      }
    } finally {
      state.programmaticExpand = false;
    }
    if (clicked || reason === "manual") {
      log("native expand", {
        reason,
        clicked,
        projects: lists.length,
        threads: document.querySelectorAll(THREAD_SELECTOR).length,
        remainingExpandButtons: countExpandButtons()
      });
    }
    renderSupplementalHistory();
    return clicked;
  }

  function autoExpandNativeProjectLists(reason) {
    const withinAutoWindow = Date.now() <= state.autoExpandDeadlineMs;
    if (!state.autoExpandEnabled || !withinAutoWindow) {
      renderSupplementalHistory();
      return 0;
    }
    return expandNativeProjectLists(reason);
  }

  function scheduleExpand(reason) {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(() => {
      state.scheduled = false;
      if (reason !== "manual") {
        const withinAutoWindow = Date.now() <= state.autoExpandDeadlineMs;
        if (state.autoExpandEnabled && withinAutoWindow) {
          autoExpandNativeProjectLists(reason);
          return;
        }
      }
      renderSupplementalHistory();
    });
  }

  function installObserver() {
    state.projectClickListener = (event) => {
      if (state.programmaticExpand) return;
      const target = event.target;
      const button = target instanceof Element ? target.closest(`${PROJECT_LIST_SELECTOR} button`) : null;
      if (button) {
        state.autoExpandEnabled = false;
      }
    };
    document.addEventListener(
      "click",
      state.projectClickListener,
      true
    );

    state.observer = new MutationObserver(() => scheduleExpand("mutation"));
    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function stop() {
    if (state.observer) state.observer.disconnect();
    if (state.projectClickListener) {
      document.removeEventListener("click", state.projectClickListener, true);
    }
    for (const timer of state.timers) window.clearTimeout(timer);
    state.timers.clear();
    if (state.fetchPatched) window.fetch = state.originalFetch;
    if (state.xhrPatched) {
      XMLHttpRequest.prototype.open = state.originalXhrOpen;
      XMLHttpRequest.prototype.send = state.originalXhrSend;
    }
    log("stopped");
  }

  window[SCRIPT_KEY] = {
    expand: () => expandNativeProjectLists("manual"),
    open: openThread,
    status: () => ({
      projects: document.querySelectorAll(PROJECT_LIST_SELECTOR).length,
      threads: document.querySelectorAll(THREAD_SELECTOR).length,
      nativeThreads: collectNativeThreadIds().size,
      supplementThreads: document.querySelectorAll("[data-clpb-supplemental-row]").length,
      snapshotThreads: readSnapshotThreads().length,
      expandButtons: countExpandButtons(),
      href: location.href
    }),
    stop
  };

  patchRequests();
  installObserver();
  log("loaded", window[SCRIPT_KEY].status());
  scheduleExpand("load");
  renderSupplementalHistory();
  [250, 750, 1500, 3000].forEach((ms) => {
    setManagedTimeout(() => autoExpandNativeProjectLists(`timer:${ms}`), ms);
  });
})();
