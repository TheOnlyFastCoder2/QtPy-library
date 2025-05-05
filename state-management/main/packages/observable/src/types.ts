/**
 * Ключ для кеширования подписки. Может быть:
 * - Путем к данным в хранилище
 * - Функцией-генератором ключа
 * - Массивом строк для групповой инвалидации
 */
export type CacheKey<T> = Paths<T> | ((state: T) => string) | string[];

/**
 * Функция обновления: принимает текущее значение по пути и возвращает новое.
 * Используется для функционального обновления значения в хранилище.
 *
 * @template T Тип всего состояния
 * @template P Путь в состоянии
 * @param currentValue Текущее значение по указанному пути
 * @returns Новое значение, которое будет установлено
 */
export type UpdateFn<T, P extends Paths<T>> = (
  currentValue: ExtractPathType<T, P>
) => ExtractPathType<T, P>;

/**
 * Примитивные типы, не участвующие в рекурсивной генерации путей.
 */
type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/**
 * Генерация строковых путей к значениям в массиве.
 * Поддерживаются как массивы примитивов, так и вложенные массивы/объекты.
 */
type ArrayPaths<T extends Array<any>> = T extends Array<infer U>
  ? U extends Primitive
    ? `${number}` // Индекс примитивного массива
    : U extends Array<any>
    ? `${number}` | `${number}.${ArrayPaths<U>}` // Массив массивов
    : `${number}` | `${number}.${Paths<U>}` // Массив объектов
  : never;

/**
 * Рекурсивная генерация строковых путей к полям объекта.
 * Например: "user.name", "posts.0.title"
 */
export type Paths<T> = T extends Primitive
  ? never
  : T extends Array<any>
  ? ArrayPaths<T>
  : {
      [K in keyof T & string]: T[K] extends Primitive
        ? K
        : T[K] extends Array<any>
        ? K | `${K}.${ArrayPaths<T[K]>}`
        : K | `${K}.${Paths<T[K]>}`;
    }[keyof T & string];

/**
 * Получение типа значения по строковому пути.
 * Поддерживает вложенные поля через ".".
 *
 * @template T Тип состояния
 * @template P Путь (например: "user.name")
 */
export type ExtractPathType<T, P extends string> = P extends keyof T
  ? T[P]
  : P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? T[K] extends infer Next
      ? Next extends object
        ? ExtractPathType<Next, Rest>
        : never
      : never
    : never
  : never;

/**
 * Middleware — функция-перехватчик, оборачивающая базовую функцию обновления.
 * Позволяет модифицировать или отменять обновления.
 *
 * @template T Тип состояния
 * @param store Экземпляр хранилища
 * @param next Следующая функция обновления
 * @returns Обернутая функция обновления
 */
export type Middleware<T extends object> = (
  store: ObservableStore<T>,
  next: (path: Paths<T>, value: any) => void
) => (path: Paths<T>, value: any) => void;

/**
 * Опции для метода optimisticUpdate.
 */
export interface OptimisticUpdateOptions {
  /** Позволяет отменять fetch с помощью AbortController */
  abortable?: boolean;
  /** Отменяет предыдущие обновления на том же пути */
  cancelPrevious?: boolean;
  /** Причина отмены (опционально) */
  reason?: string;
}

/**
 * Интерфейс реактивного хранилища, поддерживающего подписку, обновления по путям,
 * optimistic и debounced обновления.
 */
export interface ObservableStore<T extends object> {
  /**
   * Текущее значение хранилища (только для чтения).
   */
  readonly current: Readonly<T>;
  /**
   * Принудительно вызывает всех подписчиков, зависящих от указанных ключей
   *
   * @template T - Тип состояния хранилища
   * @param {CacheKey<T> | CacheKey<T>[]} key - Ключ или массив ключей для инвалидации.
   * Поддерживает три формата:
   * 1. Путь к полю (например, 'user.name')
   * 2. Массив-ключ (например, ['cache', 'v2'])
   * 3. Функция-генератор ключа (например, state => `user_${state.id}`)
   *
   * @example
   * // Инвалидация по строковому пути
   * store.invalidateCache('user.name');
   *
   * @example
   * // Инвалидация по массиву-ключу
   * store.invalidateCache(['cache', 'version']);
   *
   * @example
   * // Инвалидация нескольких ключей
   * store.invalidateCache([
   *   'user.id',
   *   ['auth', 'token'],
   *   state => `session_${state.user.role}`
   * ]);
   *
   * @remarks
   * Этот метод не изменяет состояние хранилища, а только уведомляет подписчиков:
   * - Вызывает callback'и подписчиков, у которых есть совпадение по ключам
   * - Работает даже если фактическое значение не изменилось
   * - Оптимально использовать после асинхронных операций или внешних событий
   *
   * @see {@link CacheKey} Типы поддерживаемых ключей
   * @see {@link subscribe} О подписке с cacheKeys
   */
  invalidateCache: (key: CacheKey<T> | CacheKey<T>[]) => void;

  /**
   * Получает значение по указанному пути.
   * @template P
   * @param {P} path Путь к значению
   * @returns {ExtractPathType<T, P>} Значение по пути
   */
  get<P extends Paths<T>>(path: P): ExtractPathType<T, P>;

  /**
   * Обновляет значение по пути.
   * Поддерживается как прямое присваивание, так и передача функции обновления.
   *
   * @template P Путь
   * @param path Путь к обновляемому значению
   * @param valueOrFn Новое значение или функция обновления
   */
  update<P extends Paths<T>>(
    path: P,
    valueOrFn: ExtractPathType<T, P> | UpdateFn<T, P>
  ): void;

  /**
   * Асинхронно обновляет несколько путей. Все обновления применяются батчем.
   *
   * @template P Путь
   * @param updates Массив обновлений
   * @returns Массив результатов
   */
  updateManyAsync<P extends Paths<T>>(
    updates: Array<{
      path: P;
      asyncFn: (current: ExtractPathType<T, P>) => Promise<any>;
    }>
  ): Promise<Array<{ path: P; value: any }>>;

  /**
   * Асинхронное обновление значения по одному пути.
   *
   * @template P Путь
   * @param path Путь
   * @param asyncFn Функция, возвращающая Promise нового значения
   * @returns Новый результат
   */
  updateAsync<P extends Paths<T>>(
    path: P,
    asyncFn: (current: ExtractPathType<T, P>) => Promise<any>
  ): Promise<any>;

  /**
   * Выполняет серию обновлений как транзакцию. При ошибке происходит откат.
   *
   * @param asyncFn Функция с обновлениями
   */
  transaction(
    asyncFn: (store: ObservableStore<T>) => Promise<void>
  ): Promise<void>;

  /**
   * Выполняет оптимистичное обновление с возможностью отката.
   *
   * @template P Путь
   * @param path Путь
   * @param asyncFn Асинхронная функция, возвращающая финальное значение
   * @param optimisticValue Значение, устанавливаемое немедленно
   * @param options Опции обновления
   * @returns Финальное значение
   */
  optimisticUpdate<P extends Paths<T>>(
    path: P,
    asyncFn: (current: ExtractPathType<T, P>) => Promise<ExtractPathType<T, P>>,
    optimisticValue: ExtractPathType<T, P>,
    options: OptimisticUpdateOptions
  ): Promise<ExtractPathType<T, P>>;
  /**
   * Выполняет отложенное обновление. Повторные вызовы сбрасывают таймер.
   *
   * @template P Путь
   * @param path Путь
   * @param asyncFn Асинхронная функция
   * @param delay Задержка в миллисекундах
   * @returns Результат обновления
   */
  debouncedUpdate<P extends Paths<T>>(
    path: P,
    asyncFn: (current: ExtractPathType<T, P>) => Promise<any>,
    delay?: number
  ): Promise<any>;

  /**
   * Прерывает предыдущее оптимистичное обновление на указанном пути.
   *
   * @param path Путь
   * @param reason Причина отмены
   * @returns Текущий экземпляр хранилища
   */
  cancelOptimisticUpdate(path: Paths<T>, reason?: string): ObservableStore<T>;

  /**
   * Выполняет серию обновлений в рамках одной отрисовки (batch).
   *
   * @param callback Функция с обновлениями
   */
  batch(callback: () => void): void;

  /**
   * Подписывает на изменения всего состояния хранилища
   * @param cb - Функция обратного вызова при изменениях
   * @param cacheKeys - Опциональные ключи для контроля вызова колбэка:
   *                   - При передаче путей (`user.id`) - проверяет изменения по указанным путям
   *                   - При передаче массива строк (['feature', 'v2']) - проверяет изменения любой из строк
   *                   - При передаче функции (state => `v${state.version}`) - проверяет изменение результата
   * @returns Функция для отписки
   */
  subscribe(cb: (val: T) => void, cacheKeys?: CacheKey<T>[]): () => void;

  /**
   * Подписывает на изменения конкретного поля в хранилище
   * @template P - Тип пути к данным (автовыводится)
   * @param path - Путь к отслеживаемому полю (например 'user.name')
   * @param cb - Функция обратного вызова при изменениях
   * @param options - Дополнительные настройки:
   *                 - immediate: вызвать колбэк сразу при подписке
   *                 - cacheKeys: дополнительные ключи для контроля вызова
   * @returns Функция для отписки
   */
  subscribeToPath<P extends Paths<T>>(
    path: P,
    cb: (val: ExtractPathType<T, P>) => void,
    options?: { immediate?: boolean; cacheKeys?: CacheKey<T>[] }
  ): () => void;

  /**
   * Отменяет все таймеры debounced/optimistic обновлений.
   *
   * @returns Хранилище
   */
  clearDebounceTimers(): ObservableStore<T>;

  /**
   * Полностью уничтожает хранилище: отписка, очистка таймеров.
   *
   * @returns Хранилище
   */
  destroy(): ObservableStore<T>;
}
