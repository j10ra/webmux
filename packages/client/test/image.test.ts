import { describe, it, expect } from "vitest";
import { imageMime } from "../src/image.js";

describe("imageMime", () => {
  it("uses file.type when image/*", () => {
    expect(imageMime(new File([], "x", { type: "image/png" }))).toBe("image/png");
  });
  it("falls back to extension when type is empty (Explorer copies)", () => {
    expect(imageMime(new File([], "shot.JPG", { type: "" }))).toBe("image/jpeg");
    expect(imageMime(new File([], "note.txt", { type: "" }))).toBeNull();
  });
});
