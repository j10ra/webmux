export type KeyDecision =
  | { action: "send"; data: string; swallow: true }
  | { action: "copy"; swallow: true }
  | { action: "none"; swallow: true }
  | { action: "passthrough" };

// Pure decision so it is unit-testable; the Terminal component maps it onto term/ws.
export function decideKey(e: KeyboardEvent, hasSelection: boolean): KeyDecision {
  if (e.type !== "keydown") return { action: "passthrough" };
  const mod = e.metaKey || e.ctrlKey;

  if (e.key === "Enter" && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey)
    return { action: "send", data: "\x1b\r", swallow: true };
  if (mod && e.key === "c" && hasSelection) return { action: "copy", swallow: true };
  if (mod && !e.altKey && e.key.toLowerCase() === "v") return { action: "none", swallow: true };

  return { action: "passthrough" };
}
