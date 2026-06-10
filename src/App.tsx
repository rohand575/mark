import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
  downloadMarkdown,
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

const suggestedFileName = (title: string) =>
  /\.(md|markdown|mdown|mkd)$/i.test(title) ? title : `${title || "Untitled"}.md`;

/** First free name in the series "Untitled", "Untitled 2", "Untitled 3"… */
function nextUntitledTitle(tabs: Tab[]): string {
  const taken = new Set(tabs.map((t) => t.title));
  for (let n = 1; ; n++) {
    const name = n === 1 ? "Untitled" : `Untitled ${n}`;
    if (!taken.has(name)) return name;
  }
}

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);
  const [quitRequested, setQuitRequested] = useState(false);
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
          : nextUntitledTitle(tabsRef.current));
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

  /** Writes a tab's content to a concrete path and marks it clean. */
  const writeTab = useCallback(
    async (id: string, path: string): Promise<boolean> => {
      const tab = tabsRef.current.find((t) => t.id === id);
      if (!tab) return false;
      try {
        await saveFile(path, tab.content);
        setTabs((ts) =>
          ts.map((t) =>
            t.id === id
              ? { ...t, path, title: fileName(path), savedContent: t.content }
              : t
          )
        );
        showToast("Saved");
        return true;
      } catch (e) {
        showToast("Couldn't save file");
        console.error(e);
        return false;
      }
    },
    [showToast]
  );

  const saveTab = useCallback(
    async (id: string): Promise<boolean> => {
      const tab = tabsRef.current.find((t) => t.id === id);
      if (!tab) return false;
      if (!inTauri) {
        // Browser fallback: download the markdown instead of writing to disk.
        downloadMarkdown(tab.title, tab.content);
        setTabs((ts) =>
          ts.map((t) => (t.id === id ? { ...t, savedContent: t.content } : t))
        );
        return true;
      }
      let path = tab.path;
      if (!path) {
        path = await pickSavePath(suggestedFileName(tab.title));
        if (!path) return false;
      }
      return writeTab(id, path);
    },
    [writeTab]
  );

  const saveTabAs = useCallback(
    async (id: string): Promise<boolean> => {
      const tab = tabsRef.current.find((t) => t.id === id);
      if (!tab) return false;
      if (!inTauri) {
        downloadMarkdown(tab.title, tab.content);
        return true;
      }
      const path = await pickSavePath(suggestedFileName(tab.title));
      if (!path) return false;
      return writeTab(id, path);
    },
    [writeTab]
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

  // One-time work (welcome tab, pending-file drain) must survive StrictMode's
  // double effect run in dev; refs persist across it, state checks don't.
  const initRef = useRef(false);

  useEffect(() => {
    if (!inTauri) {
      if (!initRef.current) {
        initRef.current = true;
        addTab({ path: null, content: WELCOME_MARKDOWN, title: "Welcome" });
      }
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

      if (initRef.current) return;
      initRef.current = true;
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

  /* ---------- quit guard (triggered by tray "Quit Mark") ---------- */

  // The close button now hides to tray. Actual quit comes from the tray menu,
  // which emits "quit-requested" so we can still run the dirty-file check.
  useEffect(() => {
    if (!inTauri) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const stop = await listen("quit-requested", () => {
        if (tabsRef.current.some(isDirty)) {
          setQuitRequested(true);
        } else {
          void getCurrentWindow().destroy();
        }
      });
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  /* ---------- keyboard shortcuts ---------- */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        if (activeIdRef.current) {
          if (e.shiftKey) void saveTabAs(activeIdRef.current);
          else void saveTab(activeIdRef.current);
        }
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
  }, [saveTab, saveTabAs, openViaDialog, newTab, requestCloseTab]);

  /* ---------- render ---------- */

  const activeTab = tabs.find((t) => t.id === activeId) ?? null;
  const pendingCloseTab = tabs.find((t) => t.id === pendingCloseId) ?? null;
  const dirtyTabs = tabs.filter(isDirty);

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
            className={`icon-btn ${activeTab && isDirty(activeTab) ? "on" : ""}`}
            aria-label="Save"
            title={isMac ? "Save (⌘S)" : "Save (Ctrl+S)"}
            disabled={!activeTab}
            onClick={() => {
              if (activeTab) void saveTab(activeTab.id);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M1.5 2.5a1 1 0 0 1 1-1H10l2.5 2.5v7.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V2.5Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <path d="M4.5 1.5v3h4v-3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
              <path d="M4 12.5V8.5h6v4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          </button>
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
        {isWindows && inTauri && <WindowControls />}
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

      {quitRequested && (
        <ConfirmModal
          title={dirtyTabs[0]?.title ?? ""}
          message={
            dirtyTabs.length > 1
              ? `${dirtyTabs.length} files have unsaved changes. Your edits will be lost if you don’t save them.`
              : undefined
          }
          saveLabel={dirtyTabs.length > 1 ? "Save all" : "Save"}
          onSave={async () => {
            for (const t of tabsRef.current.filter(isDirty)) {
              const ok = await saveTab(t.id);
              if (!ok) {
                setQuitRequested(false);
                return;
              }
            }
            void getCurrentWindow().destroy();
          }}
          onDiscard={() => void getCurrentWindow().destroy()}
          onCancel={() => setQuitRequested(false)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
