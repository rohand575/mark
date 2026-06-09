export interface TabInfo {
  id: string;
  title: string;
  dirty: boolean;
}

interface TabBarProps {
  tabs: TabInfo[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export default function TabBar({
  tabs,
  activeId,
  onSelect,
  onClose,
  onNew,
}: TabBarProps) {
  return (
    <div className="tabbar" data-tauri-drag-region>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeId ? "active" : ""}`}
          onMouseDown={(e) => {
            // middle-click closes
            if (e.button === 1) {
              e.preventDefault();
              onClose(tab.id);
            } else if (e.button === 0) {
              onSelect(tab.id);
            }
          }}
          title={tab.title}
        >
          <span className="tab-title">{tab.title}</span>
          <button
            className={`tab-close ${tab.dirty ? "dirty" : ""}`}
            aria-label={`Close ${tab.title}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onClose(tab.id)}
          >
            <span className="tab-dot" />
            <svg className="tab-x" width="8" height="8" viewBox="0 0 8 8">
              <line x1="0" y1="0" x2="8" y2="8" stroke="currentColor" strokeWidth="1.2" />
              <line x1="8" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      ))}
      <button className="icon-btn tab-new" aria-label="New file" onClick={onNew}>
        <svg width="12" height="12" viewBox="0 0 12 12">
          <line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
