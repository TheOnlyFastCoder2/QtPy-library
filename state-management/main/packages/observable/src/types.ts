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
   * Подписка на изменения всего состояния.
   *
   * @param cb Колбэк при обновлении
   * @returns Функция отписки
   */
  subscribe(cb: (val: T) => void): () => void;

  /**
   * Подписка на изменения конкретного поля/пути.
   *
   * @template P Путь
   * @param path Путь
   * @param cb Колбэк
   * @param options Настройки подписки
   * @returns Функция отписки
   */
  subscribeToPath<P extends Paths<T>>(
    path: P,
    cb: (val: ExtractPathType<T, P>) => void,
    options?: { immediate?: boolean }
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
