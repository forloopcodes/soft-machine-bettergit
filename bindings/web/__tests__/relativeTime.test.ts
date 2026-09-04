import { describe, expect, it } from "vitest";
import { relativeTime, shortDate } from "../ui/status";

const NOW = Date.parse("2026-09-04T12:00:00Z");

describe("relativeTime", () => {
  it("is coarse and unit-suffixed under 30 days", () => {
    expect(relativeTime("2026-09-04T11:59:40Z", NOW)).toBe("now");
    expect(relativeTime("2026-09-04T11:30:00Z", NOW)).toBe("30m");
    expect(relativeTime("2026-09-04T09:00:00Z", NOW)).toBe("3h");
    expect(relativeTime("2026-09-01T12:00:00Z", NOW)).toBe("3d");
  });

  it("falls back to a short date, with the year only when it differs", () => {
    expect(relativeTime("2026-08-01T12:00:00Z", NOW)).toBe("Aug 1");
    expect(relativeTime("2025-12-24T12:00:00Z", NOW)).toBe("Dec 24, 2025");
    expect(shortDate("2026-01-05T00:00:00Z", NOW)).toBe("Jan 5");
  });

  it("is empty for missing or invalid input", () => {
    expect(relativeTime(null, NOW)).toBe("");
    expect(relativeTime("nope", NOW)).toBe("");
  });
});
