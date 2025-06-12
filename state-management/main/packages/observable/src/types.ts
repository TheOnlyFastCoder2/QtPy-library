// types.tsx

/**
 * Примитивные типы, не участвующие в рекурсивной генерации путей.
 */

export type MaxDepth = 0;

/**
 * Генерация строковых путей к значениям в массиве с поддержкой кортежей
 */
type Range<
  N extends number,
  Acc extends number[] = []
> = Acc["length"] extends N ? Acc[number] : Range<N, [...Acc, Acc["length"]]>;
type NumberToString<N extends number> = `${N}`;
export type LiteralIndices<N extends number = 1> = NumberToString<Range<N>>;

export type BuildTuple<
  T,
  L extends number,
  R extends unknown[] = []
> = R["length"] extends L ? R : BuildTuple<T, L, [T, ...R]>;

/**
 * Генерирует объединение всех кортежей длиной от 0 до N включительно.
 * Например: TupleUpTo<2, number> → [] | [number] | [number, number]
 */
export type TupleUpTo<
  T,
  N extends number,
  R extends unknown[] = [],
  U = never
> = R["length"] extends N ? U | R : TupleUpTo<T, N, [T, ...R], U | R>;

/**
 * Утилита для извлечения типа элемента массива/кортежа
 */
export type IsTuple<T> = T extends readonly any[]
  ? number extends T["length"]
    ? false
    : true
  : false;

export type ArrayPaths<T, Depth extends number> = Depth extends 0
  ? TypeError<"Maximum depth exceeded in array path">
  : T extends readonly (infer U)[]
  ? IsTuple<T> extends true
    ? TupleArrayPaths<T, U, Depth>
    : RegularArrayPaths<U, Depth>
  : TypeError<"ArrayPaths used on a non-array type">;

type TupleArrayPaths<T extends readonly any[], U, Depth extends number> =
  | LiteralIndices<T["length"]>
  | (Paths<U, Decrement<Depth>> extends infer Sub
      ? Sub extends string
        ? `${LiteralIndices<T["length"]>}.${Sub}`
        : TypeError<"Invalid subpath inside tuple array">
      : TypeError<"Failed to infer subpaths from tuple array">);

type RegularArrayPaths<U, Depth extends number> =
  | LiteralIndices
  | (Paths<U, Decrement<Depth>> extends infer Sub
      ? Sub extends string
        ? `${LiteralIndices}.${Sub}`
        : TypeError<"Invalid subpath inside regular array">
      : TypeError<"Failed to infer subpaths from regular array">);
/**
 * Рекурсивная генерация строковых путей к полям объекта с улучшенной поддержкой массивов
 */

type IsTypeError<T> = T extends TypeError<any> ? true : false;

type IfValid<T, Fallback = never> = IsTypeError<T> extends true ? Fallback : T;

export type ObjectPaths<T, Depth extends number> = Depth extends 0
  ? TypeError<"Maximum depth exceeded in object path">
  : {
      [K in keyof T & string]:
        | K
        | (T[K] extends Primitive
            ? never
            : T[K] extends readonly any[]
            ? IfValid<
                ArrayPaths<T[K], Decrement<Depth>>,
                TypeError<`Invalid nested array path at key '${K}'`>
              > extends infer Sub
              ? Sub extends string
                ? `${K}.${Sub}`
                : TypeError<`Invalid array subpath at '${K}'`>
              : never
            : IfValid<
                Paths<T[K], Decrement<Depth>>,
                TypeError<`Invalid nested object path at key '${K}'`>
              > extends infer Sub
            ? Sub extends string
              ? `${K}.${Sub}`
              : TypeError<`Invalid object subpath at '${K}'`>
            : never);
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

export type ValidUpdateValue<
  T,
  P extends string,
  D extends number
> = ExtractPathType<T, P, D> extends TypeError<any>
  ? TypeError<"Invalid value type for this path">
  : SafeExtract<T, P, D> | SafeUpdateFn<T, P, D>;

export type PathDepth<
  P extends string,
  Acc extends any[] = []
> = P extends `${string}.${infer Rest}`
  ? PathDepth<Rest, [1, ...Acc]>
  : Acc["length"] extends 0
  ? 1
  : Acc["length"];

export type PathTooDeep<
  P extends string,
  D extends number
> = PathDepth<P> extends infer PD extends number
  ? PD extends Decrement<D> | D
    ? false
    : true
  : true;

export type FilteredPaths<T, D extends number> = SafePaths<T, D> extends infer P
  ? P extends string
    ? PathOrError<T, P, D> extends string
      ? P
      : never
    : never
  : never;

export type PathOrError<T, P, D extends number> = D extends 0
  ? string // Заглушка: принимаем любые строки без валидации
  : P extends SafePaths<T, D>
  ? P
  : P extends `${string}.${infer Rest}`
  ? PathTooDeep<P, D> extends true
    ? TypeError<`Invalid path "${P}": unknown key or index "${Rest}"`>
    : string
  : SafePaths<T, D>;

type IsPrimitive<T> = T extends Primitive ? true : false;

export type AssertValueAssignable<
  T,
  P extends string,
  D extends number,
  V
> = ExtractPathType<T, P, D> extends infer Extracted
  ? Extracted extends TypeError<any>
    ? Extracted
    : IsPrimitive<Extracted> extends true
    ? V extends Extracted
      ? V
      : TypeError<`Invalid value type for path "${P}"`>
    : IsPrimitive<V> extends true
    ? TypeError<`Cannot assign primitive to object path "${P}"`>
    : V extends Extracted
    ? V
    : TypeError<`Invalid value type for path "${P}"`>
  : TypeError<`Failed to infer type for path "${P}"`>;

// Тип safe-extract значения
export type PathExtract<
  T,
  D extends number,
  P extends string,
  V = undefined
> = D extends 0
  ? any // Заглушка: разрешаем любые пути
  : P extends SafePaths<T, D>
  ? V extends undefined
    ? ExtractPathType<T, P, D>
    : AssertValueAssignable<T, P, D, V>
  : TypeError<`Invalid path "${P}". This path does not exist in the state object.`>;
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
  ? T extends readonly [...infer Elements] // Проверка на кортеж
    ? K extends keyof Elements
      ? ExtractPathType<Elements[K], Rest, Decrement<Depth>>
      : K extends `${number}` // Если индекс — строка-число
      ? Elements extends readonly (infer U)[] // Берем тип элемента
        ? ExtractPathType<U, Rest, Decrement<Depth>>
        : TypeError<`Index "${K}" is invalid`>
      : TypeError<`Index "${K}" out of bounds in tuple`>
    : T extends readonly any[] // Обычный массив (не кортеж)
    ? K extends `${number}`
      ? T[number] extends infer U // Получаем тип элемента
        ? ExtractPathType<U, Rest, Decrement<Depth>>
        : never
      : TypeError<`Invalid array index "${K}"`>
    : K extends keyof T // Объекты и Record<string, ...>
    ? ExtractPathType<T[K], Rest, Decrement<Depth>>
    : TypeError<`Key "${K}" does not exist in object`>
  : // Если путь без точки (конечный ключ)
  T extends readonly [...infer Elements] // Кортеж
  ? P extends keyof Elements
    ? Elements[P]
    : P extends `${number}`
    ? Elements extends readonly (infer U)[]
      ? U
      : TypeError<`Index "${P}" is invalid`>
    : TypeError<`Index "${P}" out of bounds in tuple`>
  : T extends readonly any[] // Обычный массив
  ? P extends `${number}`
    ? T[number]
    : TypeError<`Invalid array index "${P}"`>
  : P extends keyof T // Объекты и Record<string, ...>
  ? T[P]
  : TypeError<`Key "${P}" does not exist in object`>;
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
  <P extends string, V>(
    path: PathOrError<T, P, D>,
    value: PathExtract<T, D, P, V>
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
  store: ObservableStore<T, DefaultableDepth<D>>,
  next: UpdateFunction<T, DefaultableDepth<D>>
) => UpdateFunction<T, DefaultableDepth<D>>;

export type DefaultableDepth<D> = [D] extends [never] ? 0 : D;
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

export type MetaWeakMap = WeakMap<object, MetaData>;
export type MetaData = {
  _prevSignature?: any;
  [key: string]: any;
};

export type PathLimitEntry<T, D extends number> = [PathsEntry<T, D>, number];
export type PathsEntry<T, D extends number> =
  | FilteredPaths<T, D>
  | Accessor<any>;
/**
 * Интерфейс реактивного хранилища состояния.
 *
 * @template T - Тип состояния
 */
export interface ObservableStore<T, D extends number = MaxDepth> {
  /** Прокси-объект состояния. */
  readonly state: T;

  /** Альтернативное имя для `state`, сокращённая запись. */
  readonly $: T;

  /**
   * Подписка на изменения состояния (глобально).
   * @param callback - Колбэк, вызываемый при любом изменении состояния.
   * @param cacheKeys - Ключи кэша для фильтрации уведомлений (необязательно).
   */
  subscribe(callback: Subscriber<T>, cacheKeys?: CacheKey<T, D>[]): Unsubscribe;

  /**
   * Подписка на изменения по строковому пути.
   * @param path - Строка, указывающая на путь в состоянии.
   * @param callback - Колбэк, вызываемый при изменении значения по этому пути.
   * @param options - Опции подписки (immediate вызов, cacheKeys).
   */
  subscribeToPath<P extends string, V = undefined>(
    path: PathOrError<T, P, D>,
    callback: (value: PathExtract<T, D, P, V>) => void,
    options?: { immediate?: boolean; cacheKeys?: CacheKey<T, D>[] }
  ): Unsubscribe;

  /**
   * Подписка на изменения по Accessor-функции.
   * @param path - Функция доступа, указывающая на значение.
   * @param callback - Колбэк, вызываемый при изменении.
   * @param options - Опции подписки.
   */
  subscribeToPath<R>(
    path: Accessor<R>,
    callback: (value: R) => void,
    options?: { immediate?: boolean; cacheKeys?: CacheKey<T, D>[] }
  ): Unsubscribe;

  /**
   * Получить значение по строковому пути.
   * @param path - Строка, представляющая путь в объекте состояния.
   * @returns Значение по указанному пути.
   */
  get<P extends string>(path: PathOrError<T, P, D>): PathExtract<T, D, P>;

  /**
   * Получить значение по Accessor-функции.
   * @param path - Accessor-функция, возвращающая значение из состояния.
   * @returns Результат Accessor-функции.
   */
  get<R>(path: Accessor<R>): R;

  /**
   * Обновить значение по строковому пути.
   * @param path - Путь к значению.
   * @param valueOrFn - Новое значение или функция обновления.
   */
  update<P extends string, V>(
    path: PathOrError<T, P, D>,
    valueOrFn:
      | PathExtract<T, D, P, V>
      | ((prev: PathExtract<T, D, P>) => PathExtract<T, D, P>)
  ): void;

  /**
   * Обновить значение по Accessor-функции.
   * @param path - Accessor-функция, указывающая на значение.
   * @param valueOrFn - Новое значение или функция обновления.
   */
  // update<R>(path: Accessor<R>, valueOrFn: R | ((prev: R) => R)): void;

  /**
   * Вычислить новое значение без его установки по строковому пути.
   * @param path - Путь к значению.
   * @param valueOrFn - Новое значение или функция вычисления.
   * @returns Предполагаемое значение.
   */
  resolveValue<P extends string, V>(
    path: PathOrError<T, P, D>,
    valueOrFn:
      | PathExtract<T, D, P, V>
      | ((prev: PathExtract<T, D, P>) => PathExtract<T, D, P>)
  ): PathExtract<T, D, P> | PathExtract<T, D, P, V>;

  /**
   * Вычислить новое значение без его установки по Accessor.
   * @param path - Accessor-функция.
   * @param valueOrFn - Новое значение или функция вычисления.
   * @returns Предполагаемое значение.
   */
  resolveValue<R>(path: Accessor<R>, valueOrFn: R | ((prev: R) => R)): R;

  /**
   * Отменить все отложенные (асинхронные) обновления.
   */
  cancelAsyncUpdates(): void;

  /**
   * Отменить отложенные обновления по указанному пути.
   * @param path - Строковый путь или Accessor.
   */
  cancelAsyncUpdates<P extends string>(
    path: PathOrError<T, P, D> | Accessor<any>
  ): void;

  /**
   * Асинхронно обновить значение по строковому пути.
   * @param path - Путь к значению.
   * @param asyncUpdater - Функция, возвращающая промис нового значения.
   * @param options - Опции (например, отмена предыдущих).
   */
  asyncUpdate<P extends string, V, E = PathExtract<T, D, P, V>>(
    path: PathOrError<T, P, D>,
    asyncUpdater: (current: E, signal: AbortSignal) => Promise<E>,
    options?: { abortPrevious?: boolean }
  ): Promise<void>;

  /**
   * Асинхронно обновить значение по Accessor.
   * @param path - Accessor-функция.
   * @param asyncUpdater - Асинхронная функция обновления.
   * @param options - Опции (например, отмена предыдущих).
   */
  asyncUpdate<R>(
    path: Accessor<R>,
    asyncUpdater: (current: Accessor<R>, signal: AbortSignal) => Promise<R>,
    options?: { abortPrevious?: boolean }
  ): Promise<void>;

  /**
   * Откатить последнее изменение по пути.
   * @param path - Путь или Accessor.
   * @returns Был ли выполнен откат.
   */
  undo<P extends string>(path: PathOrError<T, P, D> | Accessor<any>): boolean;

  /**
   * Повторить откат изменения по пути.
   * @param path - Путь или Accessor.
   * @returns Был ли выполнен повтор.
   */
  redo<P extends string>(path: PathOrError<T, P, D> | Accessor<any>): boolean;

  /**
   * Принудительно вызвать обновления по cacheKey.
   * @param cacheKey - Ключ или набор ключей.
   */
  invalidate(cacheKey: CacheKey<T, D>): void;

  /**
   * Выполнить пакетное обновление состояния.
   * @param callback - Функция с обновлениями.
   */
  batch(callback: () => void): Promise<void> | void;

  /**
   * Получить статистику использования хранилища.
   * @returns Объект со статистикой.
   */
  getMemoryStats(): MemoryStats;

  /**
   * Полностью очистить хранилище: подписки, таймеры и т.д.
   */
  clearStore(): void;
}
