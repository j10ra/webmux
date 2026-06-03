import { describe, it, expect } from "vitest";
import { themeFor, DARK, LIGHT } from "../src/theme.js";

describe("themeFor", () => {
  it("returns DARK when <html> has .dark, else LIGHT", () => {
    document.documentElement.classList.add("dark");
    expect(themeFor()).toBe(DARK);
    document.documentElement.classList.remove("dark");
    expect(themeFor()).toBe(LIGHT);
  });
});
