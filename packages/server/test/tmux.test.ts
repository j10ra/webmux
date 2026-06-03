import { describe, it, expect } from "vitest";
import {
  newSessionArgs,
  attachArgs,
  captureArgs,
  historyLimitArgs,
  sanitizeName,
} from "../src/tmux.js";

describe("tmux args", () => {
  it("sanitizes a session name (tmux forbids dots/colons)", () => {
    expect(sanitizeName("cc-3566-1")).toBe("cc-3566-1");
    expect(sanitizeName("a.b:c d")).toBe("a_b_c_d");
  });
  it("new-session is detached, in cwd, with env pairs and split command", () => {
    expect(newSessionArgs("s", "/wt/x", "claude --foo", { A: "1" })).toEqual([
      "new-session",
      "-d",
      "-s",
      "s",
      "-c",
      "/wt/x",
      "-e",
      "A=1",
      "claude",
      "--foo",
    ]);
  });
  it("attach + capture + history args", () => {
    expect(attachArgs("s")).toEqual(["attach-session", "-t", "s"]);
    expect(captureArgs("s", 20000)).toEqual([
      "capture-pane",
      "-p",
      "-e",
      "-J",
      "-S",
      "-20000",
      "-t",
      "s",
    ]);
    expect(historyLimitArgs("s", 20000)).toEqual([
      "set-option",
      "-t",
      "s",
      "history-limit",
      "20000",
    ]);
  });
});
