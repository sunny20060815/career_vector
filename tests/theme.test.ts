import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("deep navy application theme", () => {
  it("uses a deep navy foundation instead of blue-gray or near-black surfaces", () => {
    const globals = source("app/globals.css");
    const workbench = source("components/career-workbench.tsx");

    expect(globals).toContain("--surface-page: #031326");
    expect(globals).toContain("--accent-blue: #58a6e7");
    expect(globals).not.toContain("background: #060b0c");
    expect(workbench).toContain("bg-[#031326]");
    expect(workbench).not.toContain("bg-[#060b0c]");
  });
});
