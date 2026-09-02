import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("blue slate application theme", () => {
  it("uses a blue-slate foundation instead of the former near-black shell", () => {
    const globals = source("app/globals.css");
    const workbench = source("components/career-workbench.tsx");

    expect(globals).toContain("--surface-page: #1f2a38");
    expect(globals).toContain("--accent-blue: #58a6e7");
    expect(globals).not.toContain("background: #060b0c");
    expect(workbench).toContain("bg-[#1f2a38]");
    expect(workbench).not.toContain("bg-[#060b0c]");
  });
});
