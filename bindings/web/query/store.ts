/**
 * A small shared query cache with background polling.
 *
 * Entries are keyed by plan key and shared by every subscriber (co-mounted
 * panels asking for the same list make one request). Refreshes are IN
 * PLACE: data stays rendered while the next fetch is in flight, so a
 * write followed by `invalidateAll()` never blanks a panel. Polling runs
 * only while an entry has subscribers and the document is visible, backs
 * off exponentially on errors, and entries linger briefly after the last
 * unsubscribe so returning to a repo paints from cache.
 *
 * Framework-free on purpose: the React binding is one useSyncExternalStore
 * call in useQuery.ts, and this class is unit-tested with fake timers.
 */

export interface QueryPlan<T> {
  key: string;
  pollMs: number;
  run: (signal: AbortSignal) => Promise<T>;
}

export interface QuerySnapshot<T> {
  data: T | undefined;
  error: unknown | null;
  isFetching: boolean;
  updatedAt: number;
}

interface Entry<T> {
  plan: QueryPlan<T>;
  snapshot: QuerySnapshot<T>;
  listeners: Set<() => void>;
  inflight: { controller: AbortController; promise: Promise<void> } | null;
  timer: ReturnType<typeof setTimeout> | null;
  gcTimer: ReturnType<typeof setTimeout> | null;
  failures: number;
}

export interface QueryStoreOptions {
  now?: () => number;
  isVisible?: () => boolean;
  /** How long an unsubscribed entry stays cached. */
  gcMs?: number;
  maxBackoffMs?: number;
}

const EMPTY_SNAPSHOT: QuerySnapshot<never> = { data: undefined, error: null, isFetching: false, updatedAt: 0 };

/**
 * User-level control over background polling. `scale` multiplies every
 * plan's own cadence (1 = the route defaults); `enabled: false` stops the
 * timers entirely — data then refreshes only on manual refresh, after a
 * write, or when a never-fetched key is first subscribed.
 */
export interface PollPolicy {
  enabled: boolean;
  scale: number;
}

export const DEFAULT_POLL_POLICY: PollPolicy = { enabled: true, scale: 1 };

export class QueryStore {
  private entries = new Map<string, Entry<unknown>>();
  private now: () => number;
  private isVisible: () => boolean;
  private gcMs: number;
  private maxBackoffMs: number;
  private policy: PollPolicy = DEFAULT_POLL_POLICY;

  constructor(options: QueryStoreOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.isVisible =
      options.isVisible ?? (() => (typeof document === "undefined" ? true : document.visibilityState !== "hidden"));
    this.gcMs = options.gcMs ?? 5 * 60_000;
    this.maxBackoffMs = options.maxBackoffMs ?? 5 * 60_000;
  }

  getSnapshot<T>(key: string): QuerySnapshot<T> {
    const entry = this.entries.get(key) as Entry<T> | undefined;
    return entry ? entry.snapshot : (EMPTY_SNAPSHOT as QuerySnapshot<T>);
  }

  getPollPolicy(): PollPolicy {
    return this.policy;
  }

  /** Apply a new policy to every watched entry: timers are re-armed at the
   *  new cadence, or cleared when polling is switched off. */
  setPollPolicy(next: PollPolicy): void {
    const scale = Number.isFinite(next.scale) && next.scale > 0 ? next.scale : 1;
    const enabled = next.enabled !== false;
    if (enabled === this.policy.enabled && scale === this.policy.scale) return;
    this.policy = { enabled, scale };
    for (const entry of this.entries.values()) {
      if (entry.listeners.size === 0) continue;
      if (!enabled) this.clearTimer(entry);
      else if (!entry.inflight) this.schedule(entry);
    }
  }

  /** A plan's effective cadence under the current policy. */
  private intervalFor(plan: QueryPlan<unknown>): number {
    return this.policy.enabled ? plan.pollMs * this.policy.scale : Number.POSITIVE_INFINITY;
  }

  /**
   * Subscribe to a plan. The first subscriber (or a stale cache) triggers a
   * fetch; later subscribers share it. Returns the unsubscribe function.
   */
  subscribe<T>(plan: QueryPlan<T>, listener: () => void): () => void {
    let entry = this.entries.get(plan.key) as Entry<T> | undefined;
    if (!entry) {
      entry = {
        plan,
        snapshot: { data: undefined, error: null, isFetching: false, updatedAt: 0 },
        listeners: new Set(),
        inflight: null,
        timer: null,
        gcTimer: null,
        failures: 0,
      };
      this.entries.set(plan.key, entry as Entry<unknown>);
    } else {
      // Latest closure wins: the plan's inputs are encoded in the key, so
      // only the function identity changes.
      entry.plan = plan;
      if (entry.gcTimer) {
        clearTimeout(entry.gcTimer);
        entry.gcTimer = null;
      }
    }
    entry.listeners.add(listener);

    const stale = this.now() - entry.snapshot.updatedAt >= this.intervalFor(entry.plan);
    if (!entry.inflight && (entry.snapshot.updatedAt === 0 || stale)) {
      void this.fetch(entry);
    } else if (!entry.timer && !entry.inflight) {
      this.schedule(entry);
    }

    return () => {
      const current = this.entries.get(plan.key) as Entry<T> | undefined;
      if (!current) return;
      current.listeners.delete(listener);
      if (current.listeners.size === 0) {
        this.clearTimer(current);
        current.gcTimer = setTimeout(() => this.evict(plan.key), this.gcMs);
      }
    };
  }

  /** Refetch one entry in place (no-op for unknown keys). */
  refetch(key: string): Promise<void> {
    const entry = this.entries.get(key);
    return entry ? this.fetch(entry) : Promise.resolve();
  }

  /** Refetch every entry someone is looking at. Cached-only entries are dropped. */
  invalidateAll(): void {
    for (const [key, entry] of this.entries) {
      if (entry.listeners.size > 0) void this.fetch(entry);
      else this.evict(key);
    }
  }

  /** Call when the document becomes visible: catch up on anything stale. */
  resumeIfStale(): void {
    for (const entry of this.entries.values()) {
      if (entry.listeners.size === 0 || entry.inflight) continue;
      if (this.now() - entry.snapshot.updatedAt >= this.intervalFor(entry.plan)) void this.fetch(entry);
    }
  }

  /** Drop everything (tests, or a connection identity change). */
  clear(): void {
    for (const key of Array.from(this.entries.keys())) this.evict(key);
  }

  private evict(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.clearTimer(entry);
    if (entry.gcTimer) clearTimeout(entry.gcTimer);
    entry.inflight?.controller.abort();
    this.entries.delete(key);
  }

  private clearTimer(entry: Entry<unknown>): void {
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
  }

  private schedule(entry: Entry<unknown>): void {
    this.clearTimer(entry);
    if (entry.listeners.size === 0 || !this.policy.enabled) return;
    const base = this.intervalFor(entry.plan);
    const backoff = entry.failures === 0 ? 1 : Math.min(2 ** entry.failures, this.maxBackoffMs / base);
    const delay = Math.min(base * backoff, this.maxBackoffMs);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (entry.listeners.size === 0) return;
      if (!this.isVisible()) {
        // Hidden tab: skip the network round trip, look again later.
        this.schedule(entry);
        return;
      }
      void this.fetch(entry);
    }, delay);
  }

  private publish<T>(entry: Entry<T>, patch: Partial<QuerySnapshot<T>>): void {
    entry.snapshot = { ...entry.snapshot, ...patch };
    for (const listener of entry.listeners) listener();
  }

  private fetch<T>(entry: Entry<T>): Promise<void> {
    if (entry.inflight) return entry.inflight.promise;
    this.clearTimer(entry);
    const controller = new AbortController();
    this.publish(entry, { isFetching: true });
    const promise = entry.plan
      .run(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        entry.failures = 0;
        this.publish(entry, { data, error: null, isFetching: false, updatedAt: this.now() });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        entry.failures += 1;
        // Keep the last good data visible; the error rides alongside it.
        this.publish(entry, { error, isFetching: false, updatedAt: this.now() });
      })
      .finally(() => {
        if (entry.inflight?.controller === controller) entry.inflight = null;
        if (!controller.signal.aborted) this.schedule(entry);
      });
    entry.inflight = { controller, promise };
    return promise;
  }
}

export const queryStore = new QueryStore();

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") queryStore.resumeIfStale();
  });
}
