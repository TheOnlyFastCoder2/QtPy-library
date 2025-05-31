import {
  Accessor,
  ObservableStore,
  CacheKey,
} from "@qtpy/state-management-observable/types";

/**
 * Тип возвращаемого массива значений по path-прокси
 */
export type UseStoreReturnType<P extends Array<string | Accessor<any>>> = {
  [K in keyof P]: P[K] extends Accessor<infer V>
    ? V
    : P[K] extends string
    ? // если просто строка, непонятно заранее тип, ставим any
      any
    : never;
};

/**
 * Расширенный интерфейс store с React-хуками
 */
export interface ReactStore<T extends object> extends ObservableStore<T> {
  /** Подписка на массив путей, возвращает массив текущих значений */
  useStore<P extends Array<string | Accessor<any>>>(
    paths: [...P],
    options?: { cacheKeys?: CacheKey<T>[] }
  ): UseStoreReturnType<P>;

  /** Хук для одного поля: [значение, setValue] */
  useField<P extends string | Accessor<any>>(
    path: P,
    options?: { cacheKeys?: CacheKey<T>[] }
  ): readonly [
    P extends Accessor<infer V> ? V : any,
    (v: P extends Accessor<infer V> ? V : any) => void
  ];

  /**
   * Хук-эффект, вызываемый при изменении значений по указанным путям.
   * @param paths — массив путей (строка или Accessor)
   * @param effect — функция, вызываемая с текущим массивом значений
   * @param options.cacheKeys — опциональные cacheKeys для дополнительной фильтрации подписки
   */
  useEffect<P extends Array<string | Accessor<any>>>(
    paths: [...P],
    effect: (values: UseStoreReturnType<P>) => void,
    options?: { cacheKeys?: CacheKey<T>[] }
  ): void;

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
