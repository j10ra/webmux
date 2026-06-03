import type { ClipboardSelectionType, IClipboardProvider } from "@xterm/addon-clipboard";

export async function writeClipboard(text: string): Promise<void> {
  if (!text) return;

  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);

      return;
    }
  } catch {
    /* fall through to the legacy path */
  }

  const ta = document.createElement("textarea");

  ta.value = text;
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();

  try {
    document.execCommand("copy");
  } catch {
    /* best-effort */
  }

  ta.remove();
}

export const clipboardProvider: IClipboardProvider = {
  readText: (_sel: ClipboardSelectionType) =>
    navigator.clipboard?.readText?.() ?? Promise.resolve(""),
  writeText: (_sel: ClipboardSelectionType, text: string) => writeClipboard(text),
};
