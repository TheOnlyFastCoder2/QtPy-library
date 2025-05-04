export type UpdateFn<T, P extends Paths<T>> = (
  currentValue: ExtractPathType<T, P>
) => ExtractPathType<T, P>;
type Primitive = string | number | boolean | bigint | symbol | null | undefined;

type ArrayPaths<T extends Array<any>> = T extends Array<infer U>
  ? U extends Primitive
    ? `${number}`
    : U extends Array<any>
    ? `${number}` | `${number}.${ArrayPaths<U>}`
    : `${number}` | `${number}.${Paths<U>}`
  : never;

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

export type Middleware<T extends object> = (
  store: ObservableStore<T>,
  next: (path: Paths<T>, value: any) => void
) => (path: Paths<T>, value: any) => void;

export interface OptimisticUpdateOptions {
  abortable?: boolean;
  cancelPrevious?: boolean;
  reason?: string;
}

export interface ObservableStore<T extends object> {
  /** Текущее значение хранилища */
  readonly current: Readonly<T>;

  /** Получить значение по пути */
  get<P extends Paths<T>>(path: P): ExtractPathType<T, P>;

  /** Обновить значение по пути */
  update<P extends Paths<T>>(
    path: P,
    valueOrFn: ExtractPathType<T, P> | UpdateFn<T, P>
  ): void;

  /** Асинхронное обновление нескольких значений */
  updateManyAsync<P extends Paths<T>>(
    updates: Array<{
      path: P;
      asyncFn: (current: ExtractPathType<T, P>) => Promise<any>;
    }>
  ): Promise<Array<{ path: P; value: any }>>;

  /** Асинхронное обновление значения */
  updateAsync<P extends Paths<T>>(
    path: P,
    asyncFn: (current: ExtractPathType<T, P>) => Promise<any>
  ): Promise<any>;

  /** Транзакция с откатом при ошибке */
  transaction(
    asyncFn: (store: ObservableStore<T>) => Promise<void>
  ): Promise<void>;

  /** Оптимистичное обновление */
  optimisticUpdate<P extends Paths<T>>(
    path: P,
    asyncFn: (current: ExtractPathType<T, P>) => Promise<ExtractPathType<T, P>>,
    optimisticValue: ExtractPathType<T, P>,
    options: OptimisticUpdateOptions
  ): Promise<ExtractPathType<T, P>>;

  /** Обновление с дебаунсом */
  debouncedUpdate<P extends Paths<T>>(
    path: P,
    asyncFn: (current: ExtractPathType<T, P>) => Promise<any>,
    delay?: number
  ): Promise<any>;

  /** Пакетное обновление */
  batch(callback: () => void): void;

  /** Подписка на изменения */
  subscribe(cb: (val: T) => void): () => void;

  /** Очистка таймеров дебаунса */
  clearDebounceTimers(): ObservableStore<T>;

  /** Уничтожение хранилища */
  destroy(): ObservableStore<T>;
}
