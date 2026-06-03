import { describe, it, expect } from "vitest";
import { FILE_LINK_RE, parseFileLink } from "../src/links.js";

describe("file links", () => {
  it("matches paths with allowed extensions + optional /workspace and :line:col", () => {
    expect(parseFileLink("see src/api.ts:42:5 now")).toEqual({
      value: "src/api.ts",
      line: 42,
      col: 5,
      index: 4,
      length: 14,
    });
    expect(parseFileLink("/workspace/Project/x.cs")).toEqual({
      value: "Project/x.cs",
      line: undefined,
      col: undefined,
      index: 0,
      length: 23,
    });
  });
  it("does NOT match bare words or unknown extensions", () => {
    FILE_LINK_RE.lastIndex = 0;
    expect(FILE_LINK_RE.test("just some words foo.bar")).toBe(false);
  });
});
