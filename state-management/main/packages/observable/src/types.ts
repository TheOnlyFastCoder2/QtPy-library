// types.tsx

/**
 * Функция обновления: принимает текущее значение по пути и возвращает новое.
 * Используется для функционального обновления значения в хранилище.
 *
 * @template T Тип всего состояния
 * @template P Путь в состоянии
 * @param currentValue Текущее значение по указанному пути
 * @returns Новое значение, которое будет установлено
 */

export type UpdateFn<T, P extends Paths<T, D>, D extends number = 5> = (
  prev: ExtractPathType<T, P, D>
) => ExtractPathType<T, P, D>;
/**
 * Примитивные типы, не участвующие в рекурсивной генерации путей.
 */

export type MaxDepth = 3;

/**
 * Генерация строковых путей к значениям в массиве с поддержкой кортежей
 */
type Range<
  N extends number,
  Acc extends number[] = []
> = Acc["length"] extends N ? Acc[number] : Range<N, [...Acc, Acc["length"]]>;
type NumberToString<N extends number> = `${N}`;
export type LiteralIndices<N extends number = 10> = NumberToString<Range<N>>;
/**
 * Утилита для извлечения типа элемента массива/кортежа
 */

export type IsTuple<T> = T extends readonly any[]
  ? number extends T["length"]
    ? false
    : true
  : false;

export type ArrayPaths<T, Depth extends number> = Depth extends 0
  ? never
  : T extends readonly (infer U)[]
  ? IsTuple<T> extends true
    ?
        | LiteralIndices<T["length"]>
        | `${LiteralIndices<T["length"]>}.${Paths<U, Depth>}`
    : "0" | `0.${Paths<U, Decrement<Depth>>}`
  : never;

/**
 * Рекурсивная генерация строковых путей к полям объекта с улучшенной поддержкой массивов
 */
export type ObjectPaths<T, Depth extends number> = {
  [K in keyof T & string]: T[K] extends Primitive
    ? K
    : T[K] extends readonly any[]
    ? K | `${K}.${ArrayPaths<T[K], Decrement<Depth>>}`
    : K | `${K}.${Paths<T[K], Decrement<Depth>>}`;
}[keyof T & string];

export type Paths<T, Depth extends number = MaxDepth> = Depth extends 0
  ? never
  : T extends Primitive
  ? never
  : T extends readonly any[]
  ? ArrayPaths<T, Depth>
  : ObjectPaths<T, Depth>;

type TypeError<Message extends string> = {
  __error__: Message;
};

type AssertValidPath<T, P extends string, D extends number> = ExtractPathType<
  T,
  P,
  D
> extends TypeError<infer Msg>
  ? TypeError<Msg>
  : ExtractPathType<T, P, D>;

export type ValidUpdateValue<
  T,
  P extends string,
  D extends number
> = ExtractPathType<T, P, D> extends TypeError<any>
  ? TypeError<"Invalid value type for this path">
  : SafeExtract<T, P, D> | SafeUpdateFn<T, P, D>;

export type PathOrAccessor<T, D extends number, P> = P extends string
  ? AssertValidPath<T, P, D> extends TypeError<any>
    ? never
    : P
  : P extends Accessor<infer R>
  ? ExtractError<R> extends TypeError<any>
    ? never
    : P
  : never;

// Тип безопасного значения
export type PathValue<T, D extends number, PathOrAcc> = PathOrAcc extends string
  ? SafePaths<T, D>
  : AccessorSafeExtract<PathOrAcc>;

// Тип safe-extract значения
type PathExtract<T, D extends number, PathOrAcc> = PathOrAcc extends string
  ? AssertValidPath<T, PathOrAcc, D> extends TypeError<infer Msg>
    ? TypeError<`Invalid path or value. ${Msg}`>
    : AssertValueAssignable<T, PathOrAcc, D, any>
  : ExtractError<PathOrAcc> extends TypeError<infer Msg>
  ? TypeError<`Invalid path or value. ${Msg}`>
  : PathOrAcc | ((prev: PathOrAcc) => PathOrAcc);

/**
 * Улучшенное извлечение типа по пути с поддержкой кортежей
 */
export type ExtractPathType<
  T,
  P extends string,
  Depth extends number
> = Depth extends 0
  ? TypeError<"Maximum depth exceeded">
  : P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? ExtractPathType<T[K], Rest, Decrement<Depth>>
    : T extends readonly any[]
    ? K extends `${number}`
      ? ExtractPathType<T[number], Rest, Decrement<Depth>>
      : TypeError<`Type mismatch at path`>
    : TypeError<`Type mismatch at path`>
  : P extends keyof T
  ? T[P]
  : T extends readonly any[]
  ? P extends `${number}`
    ? T[number]
    : TypeError<`Type mismatch at index`>
  : TypeError<`Type mismatch at path`>;
//prettier-ignore
export type Decrement<N extends number> = 
  N extends 30 ? 29 :
  N extends 29 ? 28 :
  N extends 28 ? 27 :
  N extends 27 ? 26 :
  N extends 26 ? 25 :
  N extends 25 ? 24 :
  N extends 24 ? 23 :
  N extends 23 ? 22 :
  N extends 22 ? 21 :
  N extends 21 ? 20 :
  N extends 20 ? 19 :
  N extends 19 ? 18 :
  N extends 18 ? 17 :
  N extends 17 ? 16 :
  N extends 16 ? 15 :
  N extends 15 ? 14 :
  N extends 14 ? 13 :
  N extends 13 ? 12 :
  N extends 12 ? 11 :
  N extends 11 ? 10 :
  N extends 10 ? 9 :
  N extends 9 ? 8 :
  N extends 8 ? 7 :
  N extends 7 ? 6 :
  N extends 6 ? 5 :
  N extends 5 ? 4 :
  N extends 4 ? 3 :
  N extends 3 ? 2 :
  N extends 2 ? 1 :
  N extends 1 ? 0 :
  never;

export type SafePaths<T, D extends number> = D extends 0 ? string : Paths<T, D>;
export type SafeExtract<T, P, D extends number> = D extends 0
  ? any
  : ExtractPathType<T, P & string, D>;

export type SafeUpdateFn<T, P, D extends number> = D extends 0
  ? (prev: any) => any
  : (prev: SafeExtract<T, P, D>) => SafeExtract<T, P, D>;

export type AccessorSafeExtract<T> = T extends Accessor<infer R> ? R : any;

/**
 * Тип функции-доступа (Accessor), возвращающей значение из состояния.
 * Например: (t) => state.user.board[0][t(dynamicValue)]
 */
export type Accessor<R> = (t: <K>(arg: K) => K) => R;

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
export type CacheKey<T, D extends number = 0> =
  | string
  | number
  | boolean
  | null
  | Paths<T, D>
  | undefined
  | Accessor<T>
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
export interface UpdateFunction<T, D extends number = MaxDepth> {
  // строковый путь
  <P extends SafePaths<T, D>>(
    path: P,
    value: SafeExtract<T, P, D> | SafeUpdateFn<T, P, D>
  ): void;

  // accessor-функция
  <R>(path: Accessor<R>, value: R | ((prev: R) => R)): void;
}

/**
 * Интерфейс middleware (промежуточной обёртки) для update-функции.
 * Позволяет перехватывать вызовы store.update.
 *
 * @template T - Тип корневого состояния.
 */
export type Middleware<T, D extends number = MaxDepth> = (
  store: ObservableStore<T, D>,
  next: UpdateFunction<T, D>
) => UpdateFunction<T, D>;

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
type ExtractError<R> = R extends TypeError<infer Msg> ? TypeError<Msg> : R;
type IsAssignable<A, B> = A extends B ? true : false;
type AssertValueAssignable<
  T,
  P extends string,
  D extends number,
  V
> = IsAssignable<V, ExtractPathType<T, P, D>> extends true
  ? V
  : TypeError<`Invalid value type for path "${P}"`>;

/**
 * Интерфейс реактивного хранилища состояния.
 *
 * @template T - Тип состояния
 */
export interface ObservableStore<T, D extends number = 0> {
  /** Прокси-объект состояния. */
  readonly state: T;

  /** Альтернативное имя для `state`, сокращённая запись. */
  readonly $: T;

  /**
   * Подписка на изменения состояния (глобально).
   * @param callback - Колбэк, вызываемый при изменениях
   * @param cacheKeys - Ключи кэша для фильтрации уведомлений
   */
  subscribe(callback: Subscriber<T>, cacheKeys?: CacheKey<T, D>[]): Unsubscribe;

  /**
   * Подписка на конкретный путь или accessor.
   * @param path - Строка или функция-доступ
   * @param callback - Колбэк, вызываемый при изменении по пути
   * @param options - Настройки: immediate вызов, cacheKeys
   */
  subscribeToPath<PathOrAcc>(
    path: PathValue<T, D, PathOrAcc>,
    callback: PathExtract<T, D, PathOrAcc>,
    options?: { immediate?: boolean; cacheKeys?: CacheKey<T, D>[] }
  ): Unsubscribe;

  /**
   * Получить значение по пути.
   * @param path - Строка или функция-доступ
   */
  get<PathOrAcc = SafePaths<T, D> | Accessor<any>>(
    path: PathOrAcc
  ): PathExtract<T, D, PathOrAcc>;

  /**
   * Обновить значение по пути.
   * @param path - Строка или Accessor
   * @param valueOrFn - Новое значение или функция от текущего
   */
  update<PathOrAcc>(
    path: PathValue<T, D, PathOrAcc>,
    valueOrFn: PathExtract<T, D, PathOrAcc>
  ): void;

  /**
   * Вычислить новое значение без его установки.
   */
  resolveValue<PathOrAcc>(
    path: PathValue<T, D, PathOrAcc>,
    valueOrFn: PathExtract<T, D, PathOrAcc>
  ): PathExtract<T, D, PathOrAcc>;

  /**
   * Отменить все или конкретные асинхронные обновления.
   */
  cancelAsyncUpdates(): void;
  cancelAsyncUpdates(path: SafePaths<T, D> | Accessor<any>): void;

  /**
   * Асинхронное обновление значения по пути.
   */
  asyncUpdate<PathOrAcc>(
    path: PathValue<T, D, PathOrAcc>,
    asyncUpdater: (
      current: PathExtract<T, D, PathOrAcc>,
      signal: AbortSignal
    ) => Promise<PathExtract<T, D, PathOrAcc>>,
    options?: { abortPrevious?: boolean }
  ): Promise<void>;

  /**
   * Откатить последнее изменение по пути.
   */
  undo(path: SafePaths<T, D> | Accessor<any>): boolean;

  /**
   * Повторить изменение, отменённое через undo.
   */
  redo(path: SafePaths<T, D> | Accessor<any>): boolean;

  /**
   * Явно триггернуть обновление подписчиков по cacheKey.
   */
  invalidate(cacheKey: CacheKey<T, D>): void;

  /**
   * Запустить обновления в batch-моде.
   */
  batch(callback: () => void): Promise<void> | void;

  /**
   * Получить статистику использования хранилища.
   */
  getMemoryStats(): MemoryStats;

  /**
   * Очистить подписки, таймеры и контроллеры.
   */
  clearStore(): void;
}
