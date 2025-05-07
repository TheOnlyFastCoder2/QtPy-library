export type { ReactStore, UseStoreReturnType } from "./types";

import { createObservableStore } from "@qtpy/state-management-observable";
import {
  CacheKey,
  ExtractPathType,
  Paths,
  UpdateFn,
} from "@qtpy/state-management-observable/types";
import { ReactStore, UseStoreReturnType } from "./types";
import { useState, useRef, useEffect } from "react";

export { createObservableStore };
export function createReactStore<T extends object>(
  initialState: T
): ReactStore<T> {
  const observableStore = createObservableStore(initialState);

  const useStore = <P extends Paths<T>[]>(
    paths: [...P],
    options?: {
      cacheKeys?: CacheKey<T>[];
    }
  ): UseStoreReturnType<T, P> => {
    const { cacheKeys } = options || {};
    const [, forceUpdate] = useState({});
    const prevValuesRef = useRef<any[]>([]);

    if (prevValuesRef.current.length === 0) {
      prevValuesRef.current = paths.map((p) => observableStore.get(p));
    }

    useEffect(() => {
      const subscription = observableStore.subscribe(
        () => forceUpdate({}),
        [...(cacheKeys ?? []), ...paths]
      );
      return () => {
        subscription();
      };
    }, [paths.join("|")]);

    return paths.map((p) => observableStore.get(p)) as UseStoreReturnType<T, P>;
  };
  return {
    ...observableStore,
    useStore,

    useField: <P extends Paths<T>>(
      path: P,
      options?: {
        equalityFn?: (a: any, b: any) => boolean;
        cacheKeys?: CacheKey<T>[];
      }
    ) => {
      const [value] = useStore([path], options);
      const setValue = (newValue: ExtractPathType<T, P> | UpdateFn<T, P>) => {
        observableStore.update(path, newValue);
      };
      return [value, setValue] as const;
    },

    reloadComponents: (cacheKeys: CacheKey<T>[]) => {
      observableStore.invalidateCache(cacheKeys);
    },
  };
}
