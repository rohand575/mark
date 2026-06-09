import { getCurrentWindow } from "@tauri-apps/api/window";

export default function WindowControls() {
  // Resolved lazily: getCurrentWindow() throws outside the Tauri shell, so it
  // must not run at module load (this file is imported unconditionally).
  const win = getCurrentWindow();
  return (
    <div className="window-controls">
      <button
        className="wc-btn"
        aria-label="Minimize"
        onClick={() => win.minimize()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        className="wc-btn"
        aria-label="Maximize"
        onClick={() => win.toggleMaximize()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        className="wc-btn wc-close"
        aria-label="Close"
        onClick={() => win.close()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
          <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
}
