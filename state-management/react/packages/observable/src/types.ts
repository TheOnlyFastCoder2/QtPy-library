export type * as core from '@qtpy/state-management-observable/types';

import {
  Accessor,
  ObservableStore,
  PathOrAccessor,
  PathOrError,
  PathExtract,
  MaxDepth,
  ExtractPathReturn,
} from '@qtpy/state-management-observable/types';

/**
 * Тип возвращаемого массива значений по path-прокси
 */
export type useStoreReturn<T, P extends readonly PathOrAccessor<T, D>[], D extends number = MaxDepth> = {
  [K in keyof P]: P[K] extends Accessor<T, infer V>
    ? V
    : P[K] extends PathOrError<T, infer S, D>
    ? S extends string
      ? PathExtract<T, D, S>
      : never
    : never;
};

/**
 * Функция-сеттер с методом `.quiet` для "тихого" обновления.
 *
 * @template V Тип значения, которое устанавливается.
 *
 * @example
 * const [value, setValue] = store.useField("some.path");
 * setValue(123);
 * setValue((prev) => prev + 1);
 * setValue.quiet(456);
 * setValue.quiet((prev) => prev - 1);
 */
export type SetterWithQuiet<V> = {
  /**
   * Устанавливает новое значение или вычисляет его от предыдущего.
   */
  (value: V | ((prev: V) => V)): void;

  /**
   * "Тихое" обновление без уведомления подписчиков.
   */
  quiet(value: V | ((prev: V) => V)): void;
};

/**
 * Расширенный интерфейс store с React-хуками.
 * Основан на `ObservableStore`, но добавляет удобные хуки для подписки и обновления состояния в React.
 *
 * @template T Тип состояния хранилища.
 * @template D Максимальная глубина путей, поддерживаемая стором (по умолчанию: MaxDepth).
 *
 * @example
 * interface MyStore {
 *   count: number;
 *   user: { name: string; };
 * }
 *
 * const store = createReactStore<MyStore>({ count: 0, user: { name: "John" } });
 *
 * function Counter() {
 *   const [count, setCount] = store.useField("count");
 *
 *   return (
 *     <div>
 *       <button onClick={() => setCount(count + 1)}>+</button>
 *       <button onClick={() => setCount.quiet(count + 1)}>+ (quiet)</button>
 *       <p>{count}</p>
 *     </div>
 *   );
 * }
 */
export interface ReactStore<T extends object, D extends number = MaxDepth> extends ObservableStore<T, D> {
  /**
   * Подписка на массив путей, возвращает массив текущих значений.
   *
   * @param paths Пути или accessor-функции, указывающие, какие значения извлекать из store.
   * @param options Дополнительные параметры, включая ключи кеша.
   *
   * @returns Массив текущих значений по указанным путям.
   *
   * @example
   * const [count, userName] = store.useStore(["count", (s) => s.user.name]);
   */
  useStore<const P extends readonly PathOrAccessor<T, D>[]>(
    paths: P,
    options?: { cacheKeys?: PathOrAccessor<T, D>[]; refInInvalidation?: React.RefObject<boolean> }
  ): useStoreReturn<T, P, D>;

  /**
   * Хук для Accessor-функции или строкового пути.
   * Возвращает текущее значение и функцию для его обновления (с поддержкой quiet).
   *
   * @param path Accessor или строковый путь к значению в store.
   * @param options Дополнительные параметры, включая ключи кеша.
   *
   * @returns Кортеж из [значение, сеттер с методом `quiet` - обновление без перерисовки] .
   *
   * @example
   * const [name, setName] = store.useField('name');
   * setName("Alice");
   * setName.quiet("Bob");
   */
  useField<const P extends PathOrAccessor<T, D>>(
    path: P,
    options?: { cacheKeys?: PathOrAccessor<T, D>[] }
  ): readonly [ExtractPathReturn<T, P, D>, SetterWithQuiet<ExtractPathReturn<T, P, D>>];

  /**
   * Хук-эффект, вызываемый при изменении значений по указанным путям.
   *
   * @param paths Пути или accessor-функции, по которым отслеживаются изменения.
   * @param effect Колбэк, вызываемый при изменении значений.
   * @param options Дополнительные параметры, включая ключи кеша.
   *
   * @example
   * store.useEffect(["count", "user.name"], ([count, name]) => {
   *   console.log("Count or name changed:", count, name);
   * });
   */
  useEffect<const P extends readonly PathOrAccessor<T, D>[]>(
    paths: P,
    effect: (values: useStoreReturn<T, P, D>) => void,
    options?: { inInvalidation?: boolean }
  ): void;

  /**
   * Инвалидация компонентов, подписанных на указанные ключи кеша.
   *
   * @param cacheKeys Ключи кеша, для которых нужно вручную инициировать обновление.
   *
   * @example
   * store.reloadComponents(["user", "count"]);
   */
  reloadComponents<const P extends readonly PathOrAccessor<T, D>[]>(cacheKeys: P): void;
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
