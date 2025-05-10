import {
  PathTracker,
  ObservableStore,
  CacheKey,
} from "@qtpy/state-management-observable/types";

/**
 * Тип возвращаемого массива значений по path-прокси
 */
export type UseStoreReturnType<P extends PathTracker<any, any>[]> = {
  [K in keyof P]: P[K] extends PathTracker<infer V, any> ? V : never;
};

/**
 * Расширенный интерфейс store с React-хуками
 */
export interface ReactStore<T extends object> extends ObservableStore<T> {
  /** Подписка на массив путей, возвращает массив текущих значений */
  useStore<P extends PathTracker<any, any>[]>(
    paths: [...P],
    options?: { cacheKeys?: CacheKey<T>[] }
  ): UseStoreReturnType<P>;

  /** Хук для одного поля: [значение, setValue] */
  useField<P extends PathTracker<any, any>>(
    path: P,
    options?: { cacheKeys?: CacheKey<T>[] }
  ): readonly [
    P extends PathTracker<infer V, any> ? V : never,
    (v: P extends PathTracker<infer V, any> ? V : never) => void
  ];

  /** Инвалидация компонентов по ключам кеша */
  reloadComponents(cacheKeys: CacheKey<T>[]): void;
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
