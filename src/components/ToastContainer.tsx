import { useEffect } from "react";
import { useDownloadStore } from "../stores/downloadStore";
import type { Toast } from "../types";

const ICONS: Record<Toast["type"], string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

const TYPE_LABELS: Record<Toast["type"], string> = {
  success: "Success",
  error: "Error",
  warning: "Warning",
  info: "Info",
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useDownloadStore((s) => s.removeToast);

  useEffect(() => {
    if (toast.duration <= 0) return;
    const id = setTimeout(() => removeToast(toast.id), toast.duration);
    return () => clearTimeout(id);
  }, [toast.id, toast.duration, removeToast]);

  const dismiss = () => removeToast(toast.id);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`toast toast-${toast.type}`}
      onClick={dismiss}
      style={{ cursor: "pointer" }}
      title="Click to dismiss"
    >
      <span className="toast-icon" aria-hidden="true">{ICONS[toast.type]}</span>
      <div className="toast-body">
        <span className="toast-type-label">{TYPE_LABELS[toast.type]}</span>
        <span className="toast-message">{toast.message}</span>
      </div>
      <button
        className="toast-close"
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
        aria-label={`Dismiss ${TYPE_LABELS[toast.type]} notification`}
      >
        ✕
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useDownloadStore((s) => s.toasts);

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
