import { execFileSync } from "node:child_process";

const status = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  { encoding: "utf8" },
).trim();

if (status) {
  throw new Error(
    `Release verification requires a clean Git worktree:\n${status}`,
  );
}

console.log("Git worktree is clean");
