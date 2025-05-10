import { useState, useEffect, useRef } from "react";
import { createObservableStore } from "@qtpy/state-management-observable";
import type {
  CacheKey,
  PathTracker,
  Middleware,
} from "@qtpy/state-management-observable/types";
import { ReactStoreOptions, ReactStore, UseStoreReturnType } from "./types";
export { createObservableStore };
/**
 * Создаёт ObservableStore и оборачивает его React-хуками
 * @param initialState - начальное состояние
 * @param middlewares - опциональный массив middleware
 * @param options - опции history и cleanup
 */
export function createReactStore<T extends object>(
  initialState: T,
  middlewares: Middleware<T>[] = [],
  options: ReactStoreOptions = {}
): ReactStore<T> {
  // создаём базовый store с middleware и опциями
  const baseStore = createObservableStore(
    initialState,
    middlewares,
    options as any
  );
  const store = baseStore as ReactStore<T>;

  function useStore<P extends PathTracker<any, any>[]>(
    paths: [...P],
    options?: { cacheKeys?: CacheKey<T>[] }
  ): UseStoreReturnType<P> {
    const cacheKeys = options?.cacheKeys ?? [];
    const [, setTick] = useState(0);
    const forceUpdate = () => setTick((t) => t + 1);

    const prevRef = useRef<UseStoreReturnType<P>>([] as any);
    if (prevRef.current.length === 0) {
      prevRef.current = paths.map((p) => store.get(p)) as any;
    }

    useEffect(() => {
      const keys: CacheKey<T>[] = [...cacheKeys, ...paths];
      const unsubscribe = store.subscribe(() => forceUpdate(), keys);
      return () => unsubscribe();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      paths.map((p) => store.resolvePath(p)).join("|"),
      ...cacheKeys.map((k) =>
        typeof k === "string" ? k : store.resolvePath(k as any)
      ),
    ]);

    return paths.map((p) => store.get(p)) as UseStoreReturnType<P>;
  }

  function useField<P extends PathTracker<any, any>>(
    path: P,
    options?: { cacheKeys?: CacheKey<T>[] }
  ) {
    const [value] = useStore([path], options as any);
    const setValue = (
      newValue: P extends PathTracker<infer V, any> ? V : never
    ) => {
      store.update(path, newValue as any);
    };
    return [value, setValue] as const;
  }

  function reloadComponents(cacheKeys: CacheKey<T>[]) {
    cacheKeys.forEach((key) => store.invalidate(key));
  }

  store.useStore = useStore;
  store.useField = useField;
  store.reloadComponents = reloadComponents;

  return store;
}
