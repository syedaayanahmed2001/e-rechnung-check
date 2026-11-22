import { describe, expect, it } from "vitest";
import { assessment, customLevel, reportValid, svrlLevel } from "../../src/lib/check/report-assembly.ts";
import type { Message, StepResult } from "../../src/lib/check/types.ts";

const msg = (level: Message["level"], custom = level, code = "BR-X"): Message => ({
  id: "m",
  code,
  level,
  customLevel: custom,
  text: "",
});
const step = (messages: Message[], valid = !messages.some((m) => m.level !== "information")): StepResult => ({
  id: "val-sch.1",
  kind: "schematron",
  valid,
  messages,
});

describe("[CHECK-02] port of default-report.xsl verdict logic", () => {
  it.each([
    ["fatal", undefined, "error"],
    [undefined, "error", "error"],
    ["warning", undefined, "warning"],
    [undefined, "warn", "warning"],
    ["information", undefined, "information"],
    [undefined, "info", "information"],
    [undefined, undefined, "error"],
    ["warning", "fatal", "error"],
  ] as const)("[CHECK-02] flag=%s role=%s -> %s", (flag, role, level) => {
    expect(svrlLevel(flag, role)).toBe(level);
  });

  it("[CHECK-02] customLevel overrides except PROCESSING_ERROR", () => {
    expect(customLevel("BR-CL-23", "error", { "BR-CL-23": "warning" })).toBe("warning");
    expect(customLevel("PROCESSING_ERROR", "error", { PROCESSING_ERROR: "information" })).toBe("error");
    expect(customLevel("BR-1", "error", {})).toBe("error");
  });

  it("[CHECK-02] warnings make the report invalid but still accepted", () => {
    const steps = [step([msg("warning")])];
    expect(reportValid("S", steps, false)).toBe(false);
    expect(assessment("S", steps, false)).toBe(true);
  });

  it("[CHECK-02] an error downgraded by customLevel is accepted", () => {
    const steps = [step([msg("error", "warning")])];
    expect(assessment("S", steps, false)).toBe(true);
  });

  it("[CHECK-02] no scenario, fallback scenario or processing error rejects", () => {
    expect(assessment(null, [], false)).toBe(false);
    expect(assessment("My Fallback", [], false)).toBe(false);
    expect(assessment("S", [step([])], true)).toBe(false);
  });
});
