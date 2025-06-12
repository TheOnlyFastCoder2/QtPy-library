import {
  Accessor,
  ObservableStore,
  CacheKey,
  PathOrError,
  PathExtract,
  MaxDepth,
} from "@qtpy/state-management-observable/types";

/**
 * Тип возвращаемого массива значений по path-прокси
 */
export type UseStoreReturnType<
  T,
  P extends readonly (PathOrError<T, any, D> | Accessor<any>)[],
  D extends number = MaxDepth
> = {
  [K in keyof P]: P[K] extends Accessor<infer V>
    ? V
    : P[K] extends PathOrError<T, infer S, D>
    ? S extends string
      ? PathExtract<T, D, S>
      : never
    : never;
};

/**
 * Расширенный интерфейс store с React-хуками
 */
export interface ReactStore<T extends object, D extends number = MaxDepth>
  extends ObservableStore<T, D> {
  /**
   * Подписка на массив путей, возвращает массив текущих значений
   */
  useStore<P extends readonly (PathOrError<T, string, D> | Accessor<any>)[]>(
    paths: P,
    options?: { cacheKeys?: CacheKey<T, D>[] }
  ): UseStoreReturnType<T, P, D>;

  /**
   * Хук для Accessor-функции: возвращает [значение, setter]
   */
  useField<R>(
    path: Accessor<R>,
    options?: { cacheKeys?: CacheKey<T, D>[] }
  ): readonly [R, (v: R) => void];

  /**
   * Хук для строкового пути: возвращает [значение по пути P, setter]
   */
  useField<P extends string>(
    path: PathOrError<T, P, D>,
    options?: { cacheKeys?: CacheKey<T, D>[] }
  ): readonly [PathExtract<T, D, P>, (v: PathExtract<T, D, P>) => void];

  /**
   * Хук-эффект, вызываемый при изменении значений по указанным путям.
   */
  useEffect<P extends readonly (PathOrError<T, string, D> | Accessor<any>)[]>(
    paths: P,
    effect: (values: UseStoreReturnType<T, P, D>) => void,
    options?: { cacheKeys?: CacheKey<T, D>[] }
  ): void;

  /** Инвалидация компонентов по ключам кеша */
  reloadComponents(cacheKeys: CacheKey<T, D>[]): void;
}

/**
 * Опции для ReactStore, передаются во внутренний createObservableStore
 */
export interface ReactStoreOptions {
  /** Максимальная длина истории */
  maxHistoryLength?: number;
  /** Интервал периодической очистки истории (мс) */
  cleanupInterval?: number;
}
