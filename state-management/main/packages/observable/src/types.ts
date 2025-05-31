// types.tsx

/**
 * Тип функции-доступа (Accessor), возвращающей значение из состояния.
 * Например: () => state.user.name
 */
export type Accessor<T> = () => T;

/**
 * Примитивные типы значений, поддерживаемые хранилищем.
 */
export type Primitive = string | number | boolean | symbol | null | undefined;

/**
 * Cache key для фильтрации уведомлений или инвалидации.
 * Может быть:
 * - строкой (dot-notation или любая другая),
 * - числом / булевым / null / undefined,
 * - стрелочной функцией, принимающей state и возвращающей строку,
 * - или массивом из предыдущих вариантов (будет склеен через точку).
 *
 * Пример: ["user", () => state.settings.locale, "profile"]
 */
export type CacheKey<T> =
  | string
  | number
  | boolean
  | null
  | undefined
  | ((store: T) => string)
  | Array<CacheKey<T>>;

/**
 * Колбэк для подписки на изменения.
 * @template T - Тип данных, передаваемых в колбэк.
 */
export type Subscriber<T> = (value: T) => void;

/**
 * Функция для отписки.
 */
export type Unsubscribe = () => void;

/**
 * Сигнатура функции обновления хранилища.
 * Принимает путь (строка или Accessor) и новое значение.
 */
export type UpdateFunction<T> = (
  path: string | Accessor<any>,
  value: any
) => void;

/**
 * Интерфейс middleware (промежуточной обёртки) для update-функции.
 * Позволяет перехватывать вызовы store.update.
 *
 * @template T - Тип корневого состояния.
 */
export type Middleware<T> = (
  store: ObservableStore<T>,
  next: UpdateFunction<T>
) => UpdateFunction<T>;

/**
 * Статистика использования памяти и подписок в хранилище.
 */
export type MemoryStats = {
  /** Количество глобальных подписчиков (subscribe). */
  subscribersCount: number;
  /** Количество подписок на конкретные пути (subscribeToPath). */
  pathSubscribersCount: number;
  /** Список записей истории: для каждого пути длина истории. */
  historyEntries: Array<{ path: string; length: number }>;
  /** Количество активных путей, на которые подписались. */
  activePathsCount: number;
};

/**
 * Мета-данные для подписки.
 */
export type SubscriptionMeta = {
  /** Активна ли подписка. */
  active: boolean;
  /** Сет строковых путей, отслеживаемых подпиской. */
  trackedPaths: Set<string>;
  /** Необязательный набор нормализованных cacheKeys для фильтрации. */
  cacheKeys?: Set<string>;
};

/**
 * Основной интерфейс ObservableStore.
 *
 * @template T - Тип корневого объекта состояния.
 */
export interface ObservableStore<T> {
  /** Текущее «прокси»-состояние (stateProxy). */
  readonly state: T;
  readonly $: T;
  /**
   * Подписаться на любые изменения всего state с необязательной фильтрацией по cacheKeys.
   * @param callback - Функция, вызываемая при каждом обновлении.
   * @param cacheKeys - Опциональный массив ключей кэша для фильтрации уведомлений.
   * @returns Функцию для отписки.
   */
  subscribe(callback: Subscriber<T>, cacheKeys?: CacheKey<T>[]): Unsubscribe;

  /**
   * Подписаться на изменения конкретного пути в state.
   * @param pathOrAccessor - Либо строка `"user.profile.name"`, либо Accessor, возвращающий это значение.
   * @param callback - Функция, вызываемая при изменении значения по этому пути.
   * @param options.immediate - Если true, сразу же вызвать callback с текущим значением.
   * @param options.cacheKeys - Опциональные ключи кэша для дополнительной фильтрации.
   * @returns Функцию для отписки.
   */
  subscribeToPath(
    pathOrAccessor: string | Accessor<any>,
    callback: Subscriber<any>,
    options?: { immediate?: boolean; cacheKeys?: CacheKey<T>[] }
  ): Unsubscribe;

  /**
   * Инвалидировать указанный cacheKey (trigger cache invalidation).
   * Все global-подписчики, у которых cacheKeys содержат этот нормализованный ключ, получат уведомление.
   *
   * @param cacheKey - Литерал, стрелочная функция или массив этих типов.
   */
  invalidate(cacheKey: CacheKey<T>): void;

  /**
   * Получить текущее значение по пути.
   * @param pathOrAccessor - Либо строка `"user.settings.theme"`, либо Accessor, возвращающий это значение.
   * @returns Текущее значение или undefined, если путь не существует.
   */
  get(pathOrAccessor: string | Accessor<any>): any | undefined;

  /**
   * Обновить значение по пути или через функцию-обновитель.
   *
   * @param pathOrAccessor - Либо строка `"user.age"`, либо Accessor, возвращающий текущее значение.
   * @param valueOrFn - Либо новое значение, либо функция `(cur) => новоеЗначение`.
   */
  update(
    pathOrAccessor: string | Accessor<any>,
    valueOrFn: any | ((cur: any) => any)
  ): void;

  /**
   * Вычислить следующее значение, не записывая его (полезно для предварительного расчёта).
   *
   * @param pathOrAccessor - Либо строка `"user.count"`, либо Accessor.
   * @param valueOrFn - Либо новое значение, либо функция `(cur) => новоеЗначение`.
   * @returns Результирующее значение, которое бы установилось при вызове update.
   */
  resolveValue(
    pathOrAccessor: string | Accessor<any>,
    valueOrFn: any | ((cur: any) => any)
  ): any;

  /**
   * Отменить все висящие (in-flight) асинхронные обновления.
   * Если указан pathOrAccessor, только для него.
   *
   * @param pathOrAccessor - Либо строка, либо Accessor.
   */
  cancelAsyncUpdates(pathOrAccessor?: string | Accessor<any>): void;

  /**
   * Выполнить асинхронное обновление с поддержкой отмены.
   *
   * @param pathOrAccessor - Либо строка `"data.list[0].value"`, либо Accessor, возвращающий этот фрагмент.
   * @param asyncUpdater - Асинхронная функция: получает `(currentValue, signal)`, должна вернуть Promise<nextValue>.
   * @param options.abortPrevious - Если true, отменяет все предыдущие незавершённые обновления по этому пути.
   * @returns Promise<void>, резолвится после применения или отмены.
   */
  asyncUpdate(
    pathOrAccessor: string | Accessor<any>,
    asyncUpdater: (current: any, signal: AbortSignal) => Promise<any>,
    options?: { abortPrevious?: boolean }
  ): Promise<void>;

  /**
   * Выполнить батчинг нескольких update-вызовов в одну «порцию» без промежуточных уведомлений.
   *
   * @param callback - Функция, внутри которой вызываются store.update(...)
   */
  batch(callback: () => void): void;

  /**
   * Откатить (undo) последнее изменение по указанному пути.
   * @param pathOrAccessor - Либо строка, либо Accessor.
   * @returns true, если откат произошёл, false, если истории нет.
   */
  undo(pathOrAccessor: string | Accessor<any>): boolean;

  /**
   * Повторить (redo) последнее откатанное изменение по указанному пути.
   * @param pathOrAccessor - Либо строка, либо Accessor.
   * @returns true, если redo произошёл, false, если нечего повторять.
   */
  redo(pathOrAccessor: string | Accessor<any>): boolean;

  /**
   * Получить статистику по памяти, подпискам и истории.
   */
  getMemoryStats(): MemoryStats;

  /**
   * Полностью очистить хранилище: отменить все подписки и отложенные операции.
   */
  clearStore(): void;
}
