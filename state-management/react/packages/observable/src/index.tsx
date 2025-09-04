import { useSyncExternalStore, useRef, useEffect } from 'react';
import { createObservableStore } from '@qtpy/state-management-observable';
import { getCheckIsSSR, getRandomId, ssrStore } from '@qtpy/state-management-observable/utils';
import type {
  Accessor,
  PathOrAccessor,
  Middleware,
  PathOrError,
  MaxDepth,
  PathLimitEntry,
  SSRStore,
} from '@qtpy/state-management-observable/types';
import type { ReactStore, useStoreReturn } from './types';

export { createObservableStore, getRandomId, ssrStore };

type WithSSRStore<T extends object, D extends number = 0> = SSRStore<T, D> & ReactStore<T, D>;

export function createReactStore<T extends object, D extends number = 0>(
  initialState: T,
  middlewares: Middleware<T, D>[],
  options: { ssrStoreId?: string; customLimitsHistory?: PathLimitEntry<T, D>[] }
): WithSSRStore<T, D>;

export function createReactStore<T extends object, D extends number = 0>(
  initialState: T,
  middlewares?: Middleware<T, D>[],
  options?: { ssrStoreId?: undefined; customLimitsHistory?: PathLimitEntry<T, D>[] }
): ReactStore<T, D>;

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
    ssrStoreId?: string;
  } = {}
): ReactStore<T, D> | WithSSRStore<T, D> {
  const baseStore = createObservableStore<T, D>(initialState, middlewares, options as any);
  const store = baseStore as ReactStore<T, D> | WithSSRStore<T, D>;
  const isSSR = getCheckIsSSR();
  /**
   * Хук для подписки на несколько путей в сторе, без useCallback
   */
  function useStore<const P extends readonly (PathOrError<T, string, D> | Accessor<any>)[]>(
    paths: P,
    options?: {
      cacheKeys?: PathOrAccessor<T, D>[];
      refInInvalidation?: React.RefObject<boolean>;
    }
  ): useStoreReturn<T, P, D> {
    const serverSnapshotRef = useRef<useStoreReturn<T, P, D> | null>(null);
    const cacheKeys = [...paths, ...(options?.cacheKeys ?? [])];
    const snapshotRef = useRef<useStoreReturn<T, P, D>>(
      cacheKeys.map((p) => store.get(p as any)) as useStoreReturn<T, P, D>
    );

    const getSnapshot = () => snapshotRef.current;
    const getServerSnapshot = () => {
      if (serverSnapshotRef.current === null) {
        serverSnapshotRef.current = cacheKeys.map((p) => store.get(p as any)) as useStoreReturn<T, P, D>;
      }
      return serverSnapshotRef.current;
    };
    const subscribe = (onChange: () => void) => {
      return store.subscribe(() => {
        let isCacheKey = false;

        const nextSnapshot = cacheKeys.map((p) => {
          const nextValue = store.get(p as any);
          if (!isCacheKey && nextValue === undefined) {
            isCacheKey = true;
          }
          return nextValue;
        }) as useStoreReturn<T, P, D>;

        if (options?.refInInvalidation) {
          options.refInInvalidation.current = isCacheKey;
        }

        snapshotRef.current = nextSnapshot;
        onChange();
      }, cacheKeys as any);
    };

    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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
   * Хук-эффект: вызывает effect при изменении значений по путям или их инвалидации
   */
  function useStoreEffect<const P extends readonly (PathOrError<T, string, D> | Accessor<any>)[]>(
    paths: [...P],
    effect: (values: useStoreReturn<T, P, D>) => void,
    options?: { inInvalidation?: boolean }
  ) {
    if (isSSR) return
    const refInInvalidation = useRef(false);
    const countRef = useRef(0);
    const values = useStore(paths, { refInInvalidation });

    if (refInInvalidation.current && options?.inInvalidation) {
      countRef.current += 1;
      refInInvalidation.current = false;
    }

    useEffect(() => {
      effect(values);
    }, [...values, countRef.current]);
  }

  const reloadComponents = (cacheKeys: PathOrAccessor<T, D>[]) => {
    cacheKeys.forEach((key) => store.invalidate(key));
  };

  store.useStore = useStore;
  store.useField = useField as ReactStore<T, D>['useField'];
  store.useEffect = useStoreEffect;
  store.reloadComponents = reloadComponents as ReactStore<T, D>['reloadComponents'];

  return store;
}
