// types.tsx

/**
 * Примитивные типы, не участвующие в рекурсивной генерации путей.
 */

export type MaxDepth = 0;

/**a
 * Генерация строковых путей к значениям в массиве с поддержкой кортежей
 */
type Range<N extends number, Acc extends number[] = []> = Acc['length'] extends N
  ? Acc[number]
  : Range<N, [...Acc, Acc['length']]>;
type NumberToString<N extends number> = `${N}`;
export type LiteralIndices<N extends number = 1> = NumberToString<Range<N>>;

/**
 * Генерирует объединение всех кортежей длиной от 0 до N включительно.
 * Например: TupleUpTo<2, number> → [] | [number] | [number, number]
 */
export type TupleUpTo<T, N extends number, R extends unknown[] = [], U = never> = R['length'] extends N
  ? U | R
  : TupleUpTo<T, N, [T, ...R], U | R>;

/**
 * Утилита для извлечения типа элемента массива/кортежа
 */
export type IsTuple<T> = T extends readonly any[] ? (number extends T['length'] ? false : true) : false;

export type ArrayPaths<T, Depth extends number> = Depth extends 0
  ? TypeError<'Maximum depth exceeded in array path'>
  : T extends readonly (infer U)[]
  ? IsTuple<T> extends true
    ? TupleArrayPaths<T, U, Depth>
    : RegularArrayPaths<U, Depth>
  : TypeError<'ArrayPaths used on a non-array type'>;

type TupleArrayPaths<T extends readonly any[], U, Depth extends number> =
  | LiteralIndices<T['length']>
  | (Paths<U, Decrement<Depth>> extends infer Sub
      ? Sub extends string
        ? `${LiteralIndices<T['length']>}.${Sub}`
        : TypeError<'Invalid subpath inside tuple array'>
      : TypeError<'Failed to infer subpaths from tuple array'>);

type RegularArrayPaths<U, Depth extends number> =
  | LiteralIndices
  | (Paths<U, Decrement<Depth>> extends infer Sub
      ? Sub extends string
        ? `${LiteralIndices}.${Sub}`
        : TypeError<'Invalid subpath inside regular array'>
      : TypeError<'Failed to infer subpaths from regular array'>);
/**
 * Рекурсивная генерация строковых путей к полям объекта с улучшенной поддержкой массивов
 */

type IsTypeError<T> = T extends TypeError<any> ? true : false;

type IfValid<T, Fallback = never> = IsTypeError<T> extends true ? Fallback : T;

export type ObjectPaths<T, Depth extends number> = Depth extends 0
  ? TypeError<'Maximum depth exceeded in object path'>
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

export type ValidUpdateValue<T, P extends string, D extends number> = ExtractPathType<T, P, D> extends TypeError<any>
  ? TypeError<'Invalid value type for this path'>
  : SafeExtract<T, P, D> | SafeUpdateFn<T, P, D>;

export type PathDepth<P extends string, Acc extends any[] = []> = P extends `${string}.${infer Rest}`
  ? PathDepth<Rest, [1, ...Acc]>
  : Acc['length'] extends 0
  ? 1
  : Acc['length'];

export type PathTooDeep<P extends string, D extends number> = PathDepth<P> extends infer PD extends number
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

export type AssertValueAssignable<T, P extends string, D extends number, V> = ExtractPathType<
  T,
  P,
  D
> extends infer Extracted
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
export type PathExtract<T, D extends number, P extends string, V = undefined> = D extends 0
  ? any // Заглушка: разрешаем любые пути
  : P extends SafePaths<T, D>
  ? V extends undefined
    ? ExtractPathType<T, P, D>
    : AssertValueAssignable<T, P, D, V>
  : TypeError<`Invalid path "${P}". This path does not exist in the state object.`>;
/**
 * Улучшенное извлечение типа по пути с поддержкой кортежей
 */

export type ExtractPathType<T, P extends string, Depth extends number> = Depth extends 0
  ? TypeError<'Maximum depth exceeded'>
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
export type SafeExtract<T, P, D extends number> = D extends 0 ? any : ExtractPathType<T, P & string, D>;

export type SafeUpdateFn<T, P, D extends number> = D extends 0
  ? (prev: any) => any
  : (prev: SafeExtract<T, P, D>) => SafeExtract<T, P, D>;

export type AccessorSafeExtract<T> = T extends Accessor<T, infer R> ? R : any;

/**
 * Тип функции-доступа (Accessor), возвращающей значение из состояния.
 * Например: (t) => state.user.board[0][t(dynamicValue)]
 */
export type Accessor<T, R = any> = ($: T, t: <K>(arg: K) => K) => R;

/**
 * Примитивные типы значений, поддерживаемые хранилищем.
 */
export type Primitive = string | number | boolean | symbol | null | undefined;

export type ValueOrFn<V> = ((value: V) => V) | V;
export type ExtractPathReturn<T, P extends PathOrAccessor<T, D>, D extends number = MaxDepth> = P extends Accessor<
  T,
  infer V
>
  ? V
  : P extends PathOrError<T, infer S, D>
  ? S extends string
    ? PathExtract<T, D, S>
    : any
  : any;

export type CacheKeys<T, P extends readonly PathOrAccessor<T, D>[], D extends number = MaxDepth> = {
  [K in keyof P]: P[K] extends Accessor<T, infer V>
    ? V
    : P[K] extends PathOrError<T, infer S, D>
    ? S extends string
      ? PathExtract<T, D, S>
      : never
    : never;
};

export type PathOrAccessor<T, D extends number = MaxDepth> = PathOrError<T, string, D> | Accessor<T, any>;

/**
 * Колбэк для подписки на изменения.
 * @template T - Тип данных, передаваемых в колбэк.
 */
export type Subscriber<T> = (value: T, unsubscribe: () => void) => void;

/**
 * Функция для отписки.
 */
export type Unsubscribe = () => void;

/**
 * Сигнатура функции обновления хранилища.
 * Принимает путь (строка или Accessor) и новое значение.
 */
export type UpdateFunction<T, D extends number = MaxDepth> = <const P extends PathOrAccessor<T, D>>(
  path: P,
  value: ExtractPathReturn<T, P, D>,
  options: { [key: string]: any; keepQuiet?: boolean }
) => void;

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
  /** Число AbortController для активных асинхронных обновлений.*/
  abortersCount: number;
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
  /** Необязательный набор нормализованных cacheKeys для фильтрации. */
  unsubscribe: () => void;
};

export type MetaWeakMap = WeakMap<object, MetaData>;
export type MetaData = {
  _prevSignature?: any;
  _mutated?: boolean;
  _isWrapped?: boolean;
  _prevRevision?: string | null;
  revision?: string;

  [key: string]: any;
};

export type PathLimitEntry<T, D extends number> = [PathOrAccessor<T, D>, number];

export type SSRStore<T, D extends number = MaxDepth> = ObservableStore<T, D> & {
  snapshot: () => Promise<T>;
  getSerializedStore: (type: 'window' | 'scriptTag' | 'serializedData') => Promise<string>;
  getSSRStoreId: () => string;
  hydrate: () => void;
  hydrateWithDocument: (delay?: number, callback?: () => void) => void;
  getIsSSR: () => boolean;
  updateSSR: ObservableStore<T, D>['asyncUpdate'];
};

/**
 * Интерфейс реактивного хранилища состояния.
 *
 * @template T - Тип состояния
 */
export interface ObservableStore<T, D extends number = MaxDepth> {
  /** Прокси-объект состояния. */
  readonly $: T;

  /**
   * Вернуть "сырой" state без Proxy.
   */
  getRawStore(): T;

  /**
   * Форсировать обновление всех подписчиков, как будто изменилось всё состояние.
   */
  invalidateAll(): void;

  /**
   * Полностью заменить "сырой" state.
   *
   * @param {T} newState - Новый объект состояния.
   * @param options.keepQuiet - Если true, не триггерить подписчиков.
   */
  setRawStore(newState: T, options?: { keepQuiet?: boolean }): void;
  /**
   * Проверяет, был ли асинхронный запрос по указанному пути отменён.
   * @param path - Строковый путь или Accessor.
   * @returns `true`, если запрос был отменён, иначе `false`.
   */
  isAborted<const P extends PathOrAccessor<T, D>>(path: P): boolean;
  /**
   * Очищает историю изменений (undo/redo) для указанного пути в состоянии.
   *
   * @param {P} pathOrAccessor - Accessor-функция или строка, указывающая на свойство, историю которого нужно очистить.
   * @param {'undo' | 'redo'} [mode] - Определяет, какую часть истории очистить: только 'undo', только 'redo' или обе если указать 'all').
   * @param spliceIndices - Опционально: индексы [start, deleteCount] для удаления элементов из указанного стека.
   */
  clearHistoryPath<const P extends PathOrAccessor<T, D>>(
    pathOrAccessor: P,
    mode?: 'redo' | 'undo' | 'all',
    spliceIndices?: [number, number]
  ): void;
  /**
   * Полностью очищает всю историю изменений (undo/redo) для всех путей в состоянии.
   */
  clearAllHistory(): void;
  /**
   * Подписка на изменения состояния (глобально).
   * @param callback - Колбэк, вызываемый при любом изменении состояния.
   * @param cacheKeys - Ключи кэша для фильтрации уведомлений (необязательно).
   */
  subscribe(callback: Subscriber<T>, cacheKeys?: readonly PathOrAccessor<T, D>[]): Unsubscribe;

  /**
   * Подписка на изменения по строковому пути.
   * @param path - Accessor-функция или строка.
   * @param callback - Колбэк, вызываемый при изменении значения по этому пути.
   * @param options - Опции подписки (immediate вызов, cacheKeys).
   */
  subscribeToPath<const P extends PathOrAccessor<T, D>>(
    path: P,
    callback: (value: ExtractPathReturn<T, P, D>, unsubscribe: () => void) => void,
    options?: {
      immediate?: boolean;
      cacheKeys?: readonly PathOrAccessor<T, D>[];
    }
  ): Unsubscribe;

  /**
   * Получить значение по строковому пути.
   * @param path - Accessor-функция или строка, представляющая путь в объекте состояния.
   * @returns Значение по указанному пути.
   */
  get<const P extends PathOrAccessor<T, D>>(path: P): ExtractPathReturn<T, P, D>;

  update: {
    /**
     * Обновить значение.
     * @param path - Accessor-функция или путь к значению.
     * @param valueOrFn - Новое значение или функция обновления.
     * @param options - Дополнительные параметры.
     * @param option.keepQuiet - Если true, обновление не будет уведомлять подписчиков.
     */
    <const P extends PathOrAccessor<T, D>>(
      path: P,
      valueOrFn: ValueOrFn<ExtractPathReturn<T, P, D>>,
      options?: { keepQuiet?: boolean }
    ): ExtractPathReturn<T, P, D>;
    /**
     * Обновить значение без уведомлений подписок.
     * @param path - Accessor-функция или путь к значению.
     * @param valueOrFn - Новое значение или функция обновления.
     */
    quiet: <const P extends PathOrAccessor<T, D>>(
      path: P,
      valueOrFn: ValueOrFn<ExtractPathReturn<T, P, D>>
    ) => ExtractPathReturn<T, P, D>;
  };

  /**
   * Создаёт отложенный вызов функции с debounce.
   * @param callback - Функция, которая будет вызвана с задержкой, принимающая произвольные аргументы.
   * @param delay - Задержка в миллисекундах перед выполнением callback.
   * @returns Функция, которая принимает аргументы для callback и выполняет его с задержкой.
   *          Содержит метод `cancel` для отмены отложенного вызова.
   */
  debounced<T extends any[]>(
    callback: (...args: T) => void,
    delay: number
  ): ((...args: T) => void) & { cancel: () => void };

  /**
   * Вычислить новое значение без его установки по строковому пути.
   * @param path - Accessor-функция или путь к значению.
   * @param valueOrFn - Новое значение или функция вычисления.
   * @returns Предполагаемое значение.
   */
  resolveValue<const P extends PathOrAccessor<T, D>>(path: P, valueOrFn: ValueOrFn<P>): ExtractPathReturn<T, P, D>;
  /**
   * Преобразует путь или Accessor-функцию в строковый путь для работы с хранилищем.
   * @param path -  Accessor-функция или путь к значению.
   */
  resolvePath<const P extends PathOrAccessor<T, D>>(path: P): string;
  /**
   * Отменить все отложенные (асинхронные) обновления.
   */
  cancelAsyncUpdates(): void;

  /**
   * Отменить отложенные обновления по указанному пути.
   * @param path - Строковый путь или Accessor.
   */
  cancelAsyncUpdates<const P extends PathOrAccessor<T, D>>(path: P): void;

  /**
   * Асинхронно обновить значение по строковому пути.
   * @param path - Accessor-функция, Путь к значению.
   * @param asyncUpdater - Функция, возвращающая промис нового значения.
   * @param options - Опции (например, отмена предыдущих).
   */
  asyncUpdate: {
    <const P extends PathOrAccessor<T, D>, E = ExtractPathReturn<T, P, D>>(
      path: P,
      asyncUpdater: (current: E, signal: AbortSignal) => Promise<E>,
      options?: { abortPrevious?: boolean; keepQuiet?: boolean }
    ): Promise<E>;

    quiet: <const P extends PathOrAccessor<T, D>, E = ExtractPathReturn<T, P, D>>(
      path: P,
      asyncUpdater: (current: E, signal: AbortSignal) => Promise<E>,
      options?: { abortPrevious?: boolean }
    ) => Promise<E>;
  };

  /**
   * Выполняет откат изменений по указанному пути.
   * @param path - Путь или Accessor.
   * @param spliceIndices - Опционально: индексы [start, deleteCount] для удаления элементов из undo-стека.
   * @returns Значение после отката или undefined, если откат невозможен.
   */
  undo<const P extends PathOrAccessor<T, D>>(path: P, spliceIndices?: [number, number]): boolean;

  /**
   * Выполняет откат изменений по указанному пути.
   * @param path - Путь или Accessor.
   * @param spliceIndices - Опционально: индексы [start, deleteCount] для удаления элементов из undo-стека.
   * @returns Значение после отката или undefined, если откат невозможен.
   */
  redo<const P extends PathOrAccessor<T, D>>(path: P, spliceIndices?: [number, number]): boolean;

  /**
   * Получить значение из undo-истории на указанное количество шагов назад.
   *
   * @param path - Строковый путь или Accessor-функция к значению.
   * @param step - Количество шагов назад (0 — текущее значение, 1 — предыдущее и т.д.).
   * @returns Значение на указанном шаге в истории или undefined, если шаг вне границ.
   */
  getUndo<const P extends PathOrAccessor<T, D>>(path: P, step: number): ExtractPathReturn<T, P, D> | undefined;

  /**
   * Получить значение из redo-истории на указанное количество шагов вперёд.
   *
   * @param path - Строковый путь или Accessor-функция к значению.
   * @param step - Количество шагов вперёд (0 — следующий откат, 1 — через один и т.д.).
   * @returns Значение на указанном шаге в redo или undefined, если шаг вне границ.
   */
  getRedo<const P extends PathOrAccessor<T, D>>(path: P, step: number): ExtractPathReturn<T, P, D> | undefined;

  /**
   * Получить полную историю изменений (undo и redo) по пути.
   *
   * @param path - Строковый путь или Accessor-функция к значению.
   * @returns Объект с массивами undo и redo.
   */
  getHistory<const P extends PathOrAccessor<T, D>>(
    path: P
  ): {
    undo: ExtractPathReturn<T, P, D>[];
    redo: ExtractPathReturn<T, P, D>[];
  };

  /**
   * Принудительно вызвать обновления по cacheKey.
   * @param cacheKey - Ключ или набор ключей.
   */
  invalidate<const P extends PathOrAccessor<T, D>>(cacheKey: P): void;

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
