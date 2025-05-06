import {
  CacheKey,
  ExtractPathType,
  ObservableStore,
  Paths,
  UpdateFn,
} from "@qtpy/state-management-observable/types";

export type UseStoreReturnType<T extends object, P extends Paths<T>[]> = {
  [K in keyof P]: P[K] extends Paths<T> ? ExtractPathType<T, P[K]> : never;
};

export interface ReactStore<T extends object> extends ObservableStore<T> {
  useStore: <P extends Paths<T>[]>(
    paths: [...P],
    options?: { cacheKeys?: CacheKey<T>[] }
  ) => UseStoreReturnType<T, P>;
  useField: <P extends Paths<T>>(
    path: P,
    options?: {
      equalityFn?: (a: any, b: any) => boolean;
      cacheKeys?: CacheKey<T>[];
    }
  ) => readonly [
    ExtractPathType<T, P>,
    (value: ExtractPathType<T, P> | UpdateFn<T, P>) => void
  ];
  reloadComponents: (cacheKeys: CacheKey<T>[]) => void;
}
