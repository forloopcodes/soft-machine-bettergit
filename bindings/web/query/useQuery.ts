/**
 * React binding for the query store: one useSyncExternalStore per plan.
 * A null plan renders the empty snapshot without subscribing.
 */

import { useCallback, useSyncExternalStore } from "react";
import { queryStore, type QueryPlan, type QuerySnapshot } from "./store";

const EMPTY: QuerySnapshot<never> = { data: undefined, error: null, isFetching: false, updatedAt: 0 };
const noop = () => {};

export function useQuery<T>(plan: QueryPlan<T> | null): QuerySnapshot<T> {
  const key = plan?.key ?? null;
  const subscribe = useCallback(
    (listener: () => void) => (plan ? queryStore.subscribe(plan, listener) : noop),
    // The plan's inputs are encoded in its key; the closure identity changes
    // every render and must not resubscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );
  const getSnapshot = useCallback(
    () => (key ? queryStore.getSnapshot<T>(key) : (EMPTY as QuerySnapshot<T>)),
    [key]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
