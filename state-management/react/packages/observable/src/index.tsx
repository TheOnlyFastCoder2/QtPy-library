import { useSyncExternalStore, useRef, useEffect } from "react";
import { createObservableStore } from "@qtpy/state-management-observable";
import type {
  Accessor,
  PathOrAccessor,
  Middleware,
  PathOrError,
  MaxDepth,
  PathLimitEntry,
} from "@qtpy/state-management-observable/types";
import type { ReactStore, useStoreReturn } from "./types";

export { createObservableStore, Middleware };

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
    customLimitsHistory?: PathLimitEntry<T, D>[];
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
    const P extends readonly (PathOrError<T, string, D> | Accessor<any>)[]
  >(
    paths: P,
    options?: { cacheKeys?: PathOrAccessor<T, D>[] }
  ): useStoreReturn<T, P, D> {
    const cacheKeys = [...paths, ...(options?.cacheKeys ?? [])];

    const snapshotRef = useRef<useStoreReturn<T, P, D>>(
      cacheKeys.map((p) => store.get(p as any)) as useStoreReturn<T, P, D>
    );

    const getSnapshot = () => snapshotRef.current;

    const subscribe = (onChange: () => void) => {
      return store.subscribe(() => {
        snapshotRef.current = cacheKeys.map((p) =>
          store.get(p as any)
        ) as useStoreReturn<T, P, D>;
        onChange();
      }, cacheKeys as any);
    };

    return useSyncExternalStore(subscribe, getSnapshot);
  }

  function useField(path: any, options?: any) {
    const [value] = useStore([path], options);
    const setValue = function (valueOrFunc: any) {
      store.update(path, valueOrFunc);
    };
    setValue.quiet = (valueOrFunc: any) => {
      store.update(path, valueOrFunc, { keepQuiet: true });
    };
    return [value, setValue] as const;
  }

  /**
   * Хук-эффект: вызывает effect при изменении значений по путям
   */
  function useStoreEffect<
    const P extends readonly (PathOrError<T, string, D> | Accessor<any>)[]
  >(
    paths: [...P],
    effect: (values: useStoreReturn<T, P, D>) => void,
    options?: { cacheKeys?: PathOrAccessor<T, D>[] }
  ) {
    //@ts-ignore
    const values = useStore(paths, options);

    useEffect(() => {
      effect(values);
    }, [...values]);
  }

  const reloadComponents = (cacheKeys: PathOrAccessor<T, D>[]) => {
    cacheKeys.forEach((key) => store.invalidate(key));
  };

  store.useStore = useStore;
  store.useField = useField as ReactStore<T, D>["useField"];
  store.useEffect = useStoreEffect;
  store.reloadComponents = reloadComponents as ReactStore<
    T,
    D
  >["reloadComponents"];

  return store;
}
