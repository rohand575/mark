import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import Editor from "./components/Editor";
import Outline from "./components/Outline";
import TabBar from "./components/TabBar";
import WindowControls from "./components/WindowControls";
import ConfirmModal from "./components/ConfirmModal";
import {
  inTauri,
  readFile,
  saveFile,
  getPendingFiles,
  pickOpenPaths,
  pickSavePath,
  fileName,
} from "./lib/files";
import { WELCOME_MARKDOWN, UNTITLED_MARKDOWN } from "./lib/welcome";

interface Tab {
  id: string;
  path: string | null;
  title: string;
  content: string;
  savedContent: string;
}

const isDirty = (t: Tab) => t.content !== t.savedContent;
const isMac = navigator.userAgent.includes("Mac");
const isWindows = navigator.userAgent.includes("Windows");

type ThemePref = "light" | "dark" | null;

function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref) return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

let untitledCounter = 0;

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [themePref, setThemePref] = useState<ThemePref>(
    () => (localStorage.getItem("mark-theme") as ThemePref) || null
  );
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    resolveTheme((localStorage.getItem("mark-theme") as ThemePref) || null)
  );

  // Refs so event listeners & shortcuts always see the latest state.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  /* ---------- theme ---------- */

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!themePref) setTheme(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [themePref]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      setThemePref(next);
      localStorage.setItem("mark-theme", next);
      return next;
    });
  }, []);

  /* ---------- tab actions ---------- */

  const addTab = useCallback(
    (partial: { path: string | null; content: string; title?: string }) => {
      const id = crypto.randomUUID();
      const title =
        partial.title ??
        (partial.path
          ? fileName(partial.path)
          : `Untitled${untitledCounter ? ` ${untitledCounter + 1}` : ""}`);
      if (!partial.path) untitledCounter += 1;
      setTabs((ts) => [
        ...ts,
        {
          id,
          path: partial.path,
          title,
          content: partial.content,
          savedContent: partial.content,
        },
      ]);
      setActiveId(id);
      return id;
    },
    []
  );

  const newTab = useCallback(() => {
    addTab({ path: null, content: UNTITLED_MARKDOWN });
  }, [addTab]);

  const openPath = useCallback(
    async (path: string) => {
      const existing = tabsRef.current.find((t) => t.path === path);
      if (existing) {
        setActiveId(existing.id);
        return;
      }
      try {
        const content = await readFile(path);
        addTab({ path, content });
      } catch (e) {
        showToast(`Couldn't open ${fileName(path)}`);
        console.error(e);
      }
    },
    [addTab, showToast]
  );

  const openViaDialog = useCallback(async () => {
    if (!inTauri) return;
    const paths = await pickOpenPaths();
    for (const p of paths) await openPath(p);
  }, [openPath]);

  const updateContent = useCallback((id: string, markdown: string) => {
    setTabs((ts) =>
      ts.map((t) => (t.id === id ? { ...t, content: markdown } : t))
    );
  }, []);

  const saveTab = useCallback(
    async (id: string): Promise<boolean> => {
      const tab = tabsRef.current.find((t) => t.id === id);
      if (!tab || !inTauri) return false;
      let path = tab.path;
      if (!path) {
        path = await pickSavePath(`${tab.title || "Untitled"}.md`);
        if (!path) return false;
      }
      try {
        await saveFile(path, tab.content);
        setTabs((ts) =>
          ts.map((t) =>
            t.id === id
              ? { ...t, path, title: fileName(path!), savedContent: t.content }
              : t
          )
        );
        return true;
      } catch (e) {
        showToast("Couldn't save file");
        console.error(e);
        return false;
      }
    },
    [showToast]
  );

  const doCloseTab = useCallback((id: string) => {
    setTabs((ts) => {
      const idx = ts.findIndex((t) => t.id === id);
      const next = ts.filter((t) => t.id !== id);
      if (activeIdRef.current === id) {
        const neighbor = next[Math.min(idx, next.length - 1)] ?? null;
        setActiveId(neighbor ? neighbor.id : null);
      }
      return next;
    });
  }, []);

  const requestCloseTab = useCallback(
    (id: string) => {
      const tab = tabsRef.current.find((t) => t.id === id);
      if (!tab) return;
      if (isDirty(tab)) {
        setActiveId(id);
        setPendingCloseId(id);
      } else {
        doCloseTab(id);
      }
    },
    [doCloseTab]
  );

  /* ---------- startup: pending files + open-file events ---------- */

  useEffect(() => {
    if (!inTauri) {
      addTab({ path: null, content: WELCOME_MARKDOWN, title: "Welcome" });
      return;
    }

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const stop = await listen<string>("open-file", (e) => {
        void openPath(e.payload);
      });
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;

      const pending = await getPendingFiles();
      for (const p of pending) await openPath(p);
      if (pending.length === 0 && tabsRef.current.length === 0) {
        addTab({ path: null, content: WELCOME_MARKDOWN, title: "Welcome" });
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- keyboard shortcuts ---------- */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        if (activeIdRef.current) void saveTab(activeIdRef.current);
      } else if (key === "o") {
        e.preventDefault();
        void openViaDialog();
      } else if (key === "n") {
        e.preventDefault();
        newTab();
      } else if (key === "w") {
        e.preventDefault();
        if (activeIdRef.current) requestCloseTab(activeIdRef.current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveTab, openViaDialog, newTab, requestCloseTab]);

  /* ---------- render ---------- */

  const activeTab = tabs.find((t) => t.id === activeId) ?? null;
  const pendingCloseTab = tabs.find((t) => t.id === pendingCloseId) ?? null;

  return (
    <div className="app">
      <header className="header" data-tauri-drag-region>
        {isMac && <div className="traffic-spacer" data-tauri-drag-region />}
        <TabBar
          tabs={tabs.map((t) => ({ id: t.id, title: t.title, dirty: isDirty(t) }))}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={requestCloseTab}
          onNew={newTab}
        />
        <div className="header-actions">
          <button
            className={`icon-btn ${sidebarOpen ? "on" : ""}`}
            aria-label="Toggle outline"
            title="Toggle outline"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1.5" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" />
              <line x1="5.2" y1="1.5" x2="5.2" y2="12.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button
            className="icon-btn"
            aria-label="Toggle theme"
            title="Toggle theme"
            onClick={toggleTheme}
          >
            {theme === "dark" ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.2" />
                <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                  <line x1="7" y1="0.8" x2="7" y2="2.2" />
                  <line x1="7" y1="11.8" x2="7" y2="13.2" />
                  <line x1="0.8" y1="7" x2="2.2" y2="7" />
                  <line x1="11.8" y1="7" x2="13.2" y2="7" />
                  <line x1="2.6" y1="2.6" x2="3.6" y2="3.6" />
                  <line x1="10.4" y1="10.4" x2="11.4" y2="11.4" />
                  <line x1="2.6" y1="11.4" x2="3.6" y2="10.4" />
                  <line x1="10.4" y1="3.6" x2="11.4" y2="2.6" />
                </g>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M12 8.7A5.5 5.5 0 0 1 5.3 2 5.5 5.5 0 1 0 12 8.7Z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
        {isWindows && <WindowControls />}
      </header>

      <div className="body">
        {sidebarOpen && activeTab && (
          <aside className="sidebar">
            <Outline content={activeTab.content} />
          </aside>
        )}

        <main className="editor-pane">
          {activeTab ? (
            <Editor
              key={activeTab.id}
              defaultValue={activeTab.content}
              onChange={(md) => updateContent(activeTab.id, md)}
            />
          ) : (
            <div className="empty-state">
              <div className="empty-mark">M</div>
              <div className="empty-title">Nothing open</div>
              <div className="empty-hint">
                Create a new file or open an existing one
              </div>
              <div className="empty-actions">
                <button className="btn btn-primary" onClick={newTab}>
                  New file
                </button>
                <button className="btn btn-ghost" onClick={openViaDialog}>
                  Open file…
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {pendingCloseTab && (
        <ConfirmModal
          title={pendingCloseTab.title}
          onSave={async () => {
            const ok = await saveTab(pendingCloseTab.id);
            setPendingCloseId(null);
            if (ok) doCloseTab(pendingCloseTab.id);
          }}
          onDiscard={() => {
            setPendingCloseId(null);
            doCloseTab(pendingCloseTab.id);
          }}
          onCancel={() => setPendingCloseId(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
