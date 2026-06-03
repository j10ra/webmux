import { describe, it, expect } from "vitest";
import { decideKey } from "../src/keybindings.js";

const ev = (o: Partial<KeyboardEvent>) =>
  ({
    type: "keydown",
    key: "",
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...o,
  }) as KeyboardEvent;

describe("decideKey", () => {
  it("Shift+Enter => send ESC+CR, swallow", () => {
    expect(decideKey(ev({ key: "Enter", shiftKey: true }), false)).toEqual({
      action: "send",
      data: "\x1b\r",
      swallow: true,
    });
  });
  it("Cmd+C with selection => copy, swallow; without selection => passthrough", () => {
    expect(decideKey(ev({ key: "c", metaKey: true }), true)).toEqual({
      action: "copy",
      swallow: true,
    });
    expect(decideKey(ev({ key: "c", metaKey: true }), false)).toEqual({ action: "passthrough" });
  });
  it("Cmd+V => swallow (let browser paste fire)", () => {
    expect(decideKey(ev({ key: "v", metaKey: true }), false)).toEqual({
      action: "none",
      swallow: true,
    });
  });
  it("plain key => passthrough", () => {
    expect(decideKey(ev({ key: "a" }), false)).toEqual({ action: "passthrough" });
  });
});
