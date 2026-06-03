import { useEffect, useState, type ReactNode } from "react";

// Minimal self-contained toast (used when the host passes no `notify`). Scoped inline styles.
export function previewImage(
  file: File,
  notify: ((c: ReactNode) => void) | undefined,
  onExpand: (f: File) => void,
): void {
  const url = URL.createObjectURL(file);
  const node = (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <img
        src={url}
        alt={file.name}
        onClick={() => onExpand(file)}
        style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 4, cursor: "zoom-in" }}
      />
      <span style={{ fontSize: 12, opacity: 0.8 }}>
        Attached to terminal
        <br />
        click to expand
      </span>
    </div>
  );

  if (notify) notify(node);
  // (no host notifier: the Lightbox still works via onExpand; URL revoked when the lightbox closes)
  setTimeout(() => {
    if (!notify) URL.revokeObjectURL(url);
  }, 8000);
}

export function Lightbox({ file, onClose }: { file: File | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);

      return;
    }

    const u = URL.createObjectURL(file);

    setUrl(u);

    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!file || !url) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <img
        src={url}
        alt="pasted"
        style={{ maxHeight: "80vh", maxWidth: "90vw", borderRadius: 6 }}
      />
    </div>
  );
}
