import { useSyncExternalStore, useRef, useEffect } from "react";
import { createObservableStore } from "@qtpy/state-management-observable";
import {
  Accessor,
  CacheKey,
  Middleware,
  PathOrError,
  PathExtract,
  MaxDepth,
  PathLimitEntry,
} from "@qtpy/state-management-observable/types";
import { ReactStore, UseStoreReturnType } from "./types";

export { createObservableStore };

/**
 * Создаёт ObservableStore и оборачивает его React-хуками
 * @param initialState - начальное состояние
 * @param middlewares - опциональный массив middleware
 * @param options - опции history
 */
export function createReactStore<T extends object, D extends number = MaxDepth>(
  initialState: T,
  middlewares: Middleware<T, D>[] = [],
  options: {
    customLimitsHistory?: (state: T) => PathLimitEntry<T, D>[];
  } = {}
): ReactStore<T, D> {
  const baseStore = createObservableStore<T, D>(
    initialState,
    middlewares,
    options as any
  );
  const store = baseStore as ReactStore<T, D>;

  /**
   * Хук для подписки на несколько путей в сторе, без useCallback
   */
  function useStore<
    P extends readonly (PathOrError<T, string, D> | Accessor<any>)[]
  >(
    paths: P,
    options?: { cacheKeys?: CacheKey<T, D>[] }
  ): UseStoreReturnType<T, P, D> {
    const cacheKeys = options?.cacheKeys ?? [];

    const pathsRef = useRef<P>(paths);
    const keysRef = useRef<CacheKey<T, D>[]>(cacheKeys);
    pathsRef.current = paths;
    keysRef.current = cacheKeys;

    const snapshotRef = useRef<UseStoreReturnType<T, P, D>>(
      paths.map((p) => store.get(p as any)) as UseStoreReturnType<T, P, D>
    );

    const getSnapshot = () => snapshotRef.current;
    const subscribe = (onStoreChange: () => void) => {
      const unsubscribe = store.subscribe(() => {
        const next = pathsRef.current.map((p) =>
          store.get(p as any)
        ) as UseStoreReturnType<T, P, D>;
        if (next.some((v, i) => !Object.is(v, snapshotRef.current[i]))) {
          snapshotRef.current = next;
          onStoreChange();
        }
      }, keysRef.current);
      return unsubscribe;
    };

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }

  /**
   * Хук для одного поля: [value, setValue]
   */
  function useField<R>(
    path: Accessor<R>,
    options?: { cacheKeys?: CacheKey<T, D>[] }
  ): readonly [R, (v: R) => void];

  function useField<P extends string>(
    path: PathOrError<T, P, D>,
    options?: { cacheKeys?: CacheKey<T, D>[] }
  ): readonly [PathExtract<T, D, P>, (v: PathExtract<T, D, P>) => void];

  function useField(path: any, options?: any) {
    const [value] = useStore([path], options);
    const setValue = (newValue: any) => {
      store.update(path, newValue);
    };
    return [value, setValue] as const;
  }

  /**
   * Хук-эффект: вызывает effect при изменении значений по путям
   */
  function useStoreEffect<
    P extends readonly (PathOrError<T, string, D> | Accessor<any>)[]
  >(
    paths: [...P],
    effect: (values: UseStoreReturnType<T, P, D>) => void,
    options?: { cacheKeys?: CacheKey<T, D>[] }
  ) {
    //@ts-ignore
    const values = useStore(paths, options);
    useEffect(() => {
      effect(values);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effect, ...values]);
  }

  const reloadComponents = (cacheKeys: CacheKey<T, D>[]) => {
    cacheKeys.forEach((key) => store.invalidate(key));
  };

  store.useStore = useStore;
  store.useField = useField;
  store.useEffect = useStoreEffect;
  store.reloadComponents = reloadComponents;

  return store;
}
