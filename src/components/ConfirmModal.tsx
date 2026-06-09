interface ConfirmModalProps {
  title: string;
  /** Overrides the default “…has unsaved changes” body text. */
  message?: string;
  saveLabel?: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  title,
  message,
  saveLabel = "Save",
  onSave,
  onDiscard,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-title">Save changes?</div>
        <div className="modal-body">
          {message ??
            `“${title}” has unsaved changes. Your edits will be lost if you don’t save them.`}
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onDiscard}>
            Don’t save
          </button>
          <div className="modal-actions-right">
            <button className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={onSave} autoFocus>
              {saveLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
