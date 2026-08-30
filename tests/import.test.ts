import { describe, expect, it } from "vitest";

import {
  canonicaliseSkillAliases,
  createCanonicalSkillNameLookup,
  deduplicateByKey,
  deduplicateSkillAliases,
  orderSkillPair,
  resolveImportSection,
  resolveImportSectionFromArgs,
  resolveCanonicalSkillName
} from "@/lib/import";

describe("deduplicateSkillAliases", () => {
  it("keeps one row when the same canonical skill is emitted as an alias repeatedly", () => {
    const result = deduplicateSkillAliases([
      { canonical_name: "BI", alias: "BI", normalized_alias: "bi" },
      { canonical_name: "BI", alias: "PowerBI", normalized_alias: "powerbi" },
      { canonical_name: "BI", alias: "BI", normalized_alias: "bi" },
      { canonical_name: "BI", alias: "Tableau", normalized_alias: "tableau" }
    ]);

    expect(result).toEqual([
      { canonical_name: "BI", alias: "BI", normalized_alias: "bi" },
      { canonical_name: "BI", alias: "PowerBI", normalized_alias: "powerbi" },
      { canonical_name: "BI", alias: "Tableau", normalized_alias: "tableau" }
    ]);
  });
});

describe("canonicaliseSkillAliases", () => {
  it("maps aliases with formatting-only canonical-name differences to the skills table name", () => {
    const result = canonicaliseSkillAliases(
      [
        { canonical_name: "IATF16949", alias: "16949", normalized_alias: "16949" },
        { canonical_name: "Microsoft SQL Server", alias: "MSSQL", normalized_alias: "mssql" }
      ],
      [
        { canonicalName: "IATF 16949" },
        { canonicalName: "SQL Server", aliases: ["Microsoft SQL Server"] }
      ]
    );

    expect(result).toEqual([
      { canonical_name: "IATF 16949", alias: "16949", normalized_alias: "16949" },
      { canonical_name: "SQL Server", alias: "MSSQL", normalized_alias: "mssql" }
    ]);
  });
});

describe("resolveCanonicalSkillName", () => {
  it("resolves a source canonical_skill through the main skill synonym list", () => {
    const lookup = createCanonicalSkillNameLookup([
      { canonicalName: "SQL Server", aliases: ["Microsoft SQL Server"] }
    ]);

    expect(resolveCanonicalSkillName("Microsoft SQL Server", lookup)).toBe("SQL Server");
  });
});

describe("orderSkillPair", () => {
  it("uses database-compatible lexical ordering instead of the browser locale", () => {
    expect(orderSkillPair("三菱PLC", "ABB机器人")).toEqual(["ABB机器人", "三菱PLC"]);
  });

  it("orders mixed-case Latin names using the database collation", () => {
    expect(orderSkillPair("ANSYS", "Abaqus")).toEqual(["Abaqus", "ANSYS"]);
  });
});

describe("resolveImportSection", () => {
  it("selects only the requested resumable import section", () => {
    expect(resolveImportSection("supplemental")).toBe("supplemental");
  });

  it("rejects an unknown import section", () => {
    expect(() => resolveImportSection("unknown")).toThrow("IMPORT_SECTION");
  });
});

describe("resolveImportSectionFromArgs", () => {
  it("reads a section from portable command-line arguments", () => {
    expect(resolveImportSectionFromArgs(["--section", "supplemental"])).toBe("supplemental");
  });
});

describe("deduplicateByKey", () => {
  it("keeps one monthly trend row for a duplicated skill and month", () => {
    const result = deduplicateByKey(
      [
        { canonical_name: "3ds Max", month: "2026-01-01" },
        { canonical_name: "3ds Max", month: "2026-01-01" },
        { canonical_name: "3ds Max", month: "2026-02-01" }
      ],
      (row) => `${row.canonical_name}\u0000${row.month}`
    );

    expect(result).toEqual([
      { canonical_name: "3ds Max", month: "2026-01-01" },
      { canonical_name: "3ds Max", month: "2026-02-01" }
    ]);
  });
});
