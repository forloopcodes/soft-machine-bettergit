/**
 * QueryStore behavior: shared entries, in-place refresh, visibility-gated
 * polling with backoff, and garbage collection after the last unsubscribe.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryStore, type QueryPlan } from "../query/store";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function makePlan<T>(key: string, values: Array<T | Error>, pollMs = 1000): { plan: QueryPlan<T>; runs: () => number } {
  let runs = 0;
  const plan: QueryPlan<T> = {
    key,
    pollMs,
    run: async () => {
      const value = values[Math.min(runs, values.length - 1)];
      runs += 1;
      if (value instanceof Error) throw value;
      return value;
    },
  };
  return { plan, runs: () => runs };
}

describe("QueryStore", () => {
  let visible = true;
  let store: QueryStore;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    visible = true;
    store = new QueryStore({ isVisible: () => visible, gcMs: 500, maxBackoffMs: 8000 });
  });

  afterEach(() => {
    store.clear();
    vi.useRealTimers();
  });

  it("shares one fetch between subscribers and publishes the result", async () => {
    const { plan, runs } = makePlan("a", ["first"]);
    const listener = vi.fn();
    const unsubA = store.subscribe(plan, listener);
    const unsubB = store.subscribe(plan, listener);
    expect(runs()).toBe(1);
    expect(store.getSnapshot("a").isFetching).toBe(true);

    await flush();
    expect(store.getSnapshot("a")).toMatchObject({ data: "first", error: null, isFetching: false });
    expect(listener).toHaveBeenCalled();
    unsubA();
    unsubB();
  });

  it("polls at the plan cadence while visible and skips ticks while hidden", async () => {
    const { plan, runs } = makePlan("b", ["v1", "v2", "v3"], 1000);
    const unsub = store.subscribe(plan, () => {});
    await flush();
    expect(runs()).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(runs()).toBe(2);
    expect(store.getSnapshot("b").data).toBe("v2");

    visible = false;
    await vi.advanceTimersByTimeAsync(3000);
    await flush();
    expect(runs()).toBe(2);

    visible = true;
    store.resumeIfStale();
    await flush();
    expect(runs()).toBe(3);
    unsub();
  });

  it("keeps the last good data on error and backs off exponentially", async () => {
    const { plan, runs } = makePlan("c", ["good", new Error("boom"), new Error("boom"), "recovered"], 1000);
    const unsub = store.subscribe(plan, () => {});
    await flush();
    expect(store.getSnapshot("c").data).toBe("good");

    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(runs()).toBe(2);
    expect(store.getSnapshot("c")).toMatchObject({ data: "good", error: new Error("boom") });

    // One failure: the next tick waits 2x, not 1x.
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(runs()).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(runs()).toBe(3);

    // Two failures: 4x.
    await vi.advanceTimersByTimeAsync(3999);
    await flush();
    expect(runs()).toBe(3);
    await vi.advanceTimersByTimeAsync(1);
    await flush();
    expect(runs()).toBe(4);
    expect(store.getSnapshot("c")).toMatchObject({ data: "recovered", error: null });
    unsub();
  });

  it("invalidateAll refetches live entries in place and drops idle ones", async () => {
    const live = makePlan("live", ["one", "two"]);
    const idle = makePlan("idle", ["x"]);
    const unsubLive = store.subscribe(live.plan, () => {});
    const unsubIdle = store.subscribe(idle.plan, () => {});
    await flush();
    unsubIdle();

    store.invalidateAll();
    expect(store.getSnapshot("live")).toMatchObject({ data: "one", isFetching: true });
    expect(store.getSnapshot("idle").data).toBeUndefined();
    await flush();
    expect(store.getSnapshot("live")).toMatchObject({ data: "two", isFetching: false });
    expect(live.runs()).toBe(2);
    unsubLive();
  });

  it("serves a fresh cache to a returning subscriber and evicts after gcMs", async () => {
    const { plan, runs } = makePlan("d", ["cached", "later"], 10_000);
    const unsub = store.subscribe(plan, () => {});
    await flush();
    unsub();

    // Comes back before gc: no refetch, cached data visible immediately.
    const unsubAgain = store.subscribe(plan, () => {});
    expect(runs()).toBe(1);
    expect(store.getSnapshot("d").data).toBe("cached");
    unsubAgain();

    await vi.advanceTimersByTimeAsync(500);
    expect(store.getSnapshot("d").data).toBeUndefined();
  });

  it("refetches on subscribe when the cache is older than the cadence", async () => {
    const { plan, runs } = makePlan("e", ["old", "new"], 1000);
    const unsub = store.subscribe(plan, () => {});
    await flush();
    unsub();

    // Still cached (gcMs is 500) but stale relative to pollMs? No: advance
    // 400ms keeps it fresh; a returning subscriber must not refetch.
    await vi.advanceTimersByTimeAsync(400);
    const unsubFresh = store.subscribe(plan, () => {});
    expect(runs()).toBe(1);
    unsubFresh();

    // Past the cadence while still cached: subscribing refetches in place.
    const longPlan = { ...makePlan("f", ["old", "new"], 100).plan };
    let longRuns = 0;
    longPlan.run = async () => {
      longRuns += 1;
      return longRuns === 1 ? "old" : "new";
    };
    const u1 = store.subscribe(longPlan, () => {});
    await flush();
    u1();
    await vi.advanceTimersByTimeAsync(200);
    const u2 = store.subscribe(longPlan, () => {});
    expect(store.getSnapshot("f")).toMatchObject({ data: "old", isFetching: true });
    await flush();
    expect(store.getSnapshot("f").data).toBe("new");
    u2();
  });
});
