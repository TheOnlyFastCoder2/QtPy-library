import { useSyncExternalStore, useMemo, useRef, useCallback } from "react";
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
 * @param options - опции history
 */
export function createReactStore<T extends object>(
  initialState: T,
  middlewares: Middleware<T>[] = [],
  options: ReactStoreOptions = {}
): ReactStore<T> {
  const baseStore = createObservableStore(
    initialState,
    middlewares,
    options as any
  );
  const store = baseStore as ReactStore<T>;

  /**
   * Хук для подписки на несколько путей в сторе
   */
  function useStore<P extends PathTracker<any, any>[]>(
    paths: [...P],
    options?: { cacheKeys?: CacheKey<T>[] }
  ): UseStoreReturnType<P> {
    const cacheKeys = options?.cacheKeys ?? [];

    const keys = useMemo(() => [...cacheKeys, ...paths], [cacheKeys, paths]);

    const getSnapshotRaw = useCallback(
      () => paths.map((p) => store.get(p)) as UseStoreReturnType<P>,
      [paths]
    );

    const snapshotRef = useRef<UseStoreReturnType<P>>(getSnapshotRaw());

    const subscribe = useCallback(
      (onStoreChange: () => void) => {
        const unsubscribe = store.subscribe(() => {
          const nextSnapshot = getSnapshotRaw();
          const changed = nextSnapshot.some(
            (v, i) => !Object.is(v, snapshotRef.current[i])
          );
          if (changed) {
            snapshotRef.current = nextSnapshot;
            onStoreChange();
          }
        }, keys);
        return unsubscribe;
      },
      [getSnapshotRaw, keys]
    );

    const getSnapshot = useCallback(() => snapshotRef.current, []);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }

  /**
   * Хук для одного поля: [value, setValue]
   */
  function useField<P extends PathTracker<any, any>>(
    path: P,
    options?: { cacheKeys?: CacheKey<T>[] }
  ) {
    const [value] = useStore([path], options as any);
    const setValue = useCallback(
      (newValue: P extends PathTracker<infer V, any> ? V : never) => {
        store.update(path, newValue as any);
      },
      [path]
    );
    return [value, setValue] as const;
  }

  /**
   * Инвалидация кеша для перерисовки компонентов
   */
  function reloadComponents(cacheKeys: CacheKey<T>[]) {
    cacheKeys.forEach((key) => store.invalidate(key));
  }

  store.useStore = useStore;
  store.useField = useField;
  store.reloadComponents = reloadComponents;

  return store;
}
