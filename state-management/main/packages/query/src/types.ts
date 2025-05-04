import {
  ExtractPathType,
  ObservableStore,
  Paths,
} from "@qtpy/state-management-observable/types";

/**
 * Конфигурация хранилища запросов.
 **/
export interface QueryStoreConfig {
  cache: {
    /** Время жизни кэша по умолчанию (мс) */
    defaultTTL: number;
    /** Максимальное количество элементов в кэше */
    maxSize: number;
    /** Интервал очистки кэша (мс) */
    cleanupInterval: number;
  };
  polling: {
    /** Интервал опроса по умолчанию (мс) */
    defaultInterval: number;
    retry: {
      /** Начальная задержка перед повтором (мс) */
      defaultDelay: number;
      /** Максимальная задержка при экспоненциальном отступе (мс) */
      maxExponentialBackoff: number;
    };
  };
  fetch: {
    /** Количество повторов запросов по умолчанию */
    defaultRetryCount: number;
    /** Количество одновременных запросов по умолчанию */
    concurrency: number;
  };
  dependencies: {
    /** Интервал проверки зависимостей (мс) */
    checkInterval: number;
  };
}
/**
 * Элемент кэша запроса.
 **/
export interface QueryCacheItem {
  /** Сохранённые данные */
  data: any;
  /** Список тегов, связанных с данными */
  tags?: CacheKey[];
  /** Время создания (мс) */
  createdAt: number;
  /** Время жизни (мс) */
  ttl?: number;
}

/** Ключ кэша */
export type CacheKey = string;

/** Колбэк, вызываемый при инвалидировании */
export type InvalidationCallback = () => void;

/**
 * Функция мутации.
 * @param input - Входные данные
 * @returns Промис с результатом
 */
export type MutationFn<TInput, TOutput> = (input: TInput) => Promise<TOutput>;

/**
 * Опции мутации.
 */
export interface MutationOptions<TInput, TOutput> {
  mutationFn: MutationFn<TInput, TOutput>;
  /** Теги, которые будут инвалидированы */
  invalidateTags?: CacheKey[];
  /** Обработчик успешного результата */
  onSuccess?: (data: TOutput) => void;
  /** Обработчик ошибки */
  onError?: (error: unknown) => void;
}

/**
 * Интерфейс мутации.
 */
export interface Mutation<TInput, TOutput> {
  /** Запустить мутацию */
  mutate: (input: TInput) => Promise<TOutput>;
  /** Сброс состояния */
  reset: () => void;
  /** Получить текущее состояние */
  getState: () => {
    isLoading: boolean;
    error: unknown;
    data: TOutput | null;
  };
}

/**
 * Опции пакетного запроса.
 */
export interface BatchQueryOptions {
  /** Количество одновременных запросов */
  concurrency?: number;
  /** Колбэк прогресса */
  onProgress?: (percent: number) => void;
}
/**
 * Описание запроса.
 */
export interface QueryDefinition {
  /** Уникальный ключ */
  key: string;
  /** Функция запроса */
  query: (...args: any[]) => Promise<any>;
}

/**
 * Контекст ошибки.
 */
export type ErrorContext<T extends object, E = unknown> = {
  /** Тип ошибки */
  type: "query" | "mutation" | "polling" | "invalidation";
  /** Ключ кэша */
  key?: CacheKey;
  /** Путь в состоянии */
  path?: Paths<T>;
  /** Теги, связанные с ошибкой */
  tags?: CacheKey[];
  /** Оригинальная ошибка */
  originalError?: E;
};

/**
 * Обработчик ошибок.
 */
export interface ErrorHandler<T extends object, E = unknown> {
  (error: E, context: ErrorContext<T, E>): void;
}

/**
 * Опции обработчика ошибок.
 */
export interface ErrorHandlerOptions {
  /** Распространять ли ошибку дальше */
  propagate?: boolean;
}

/**
 * Результат пакетных запросов.
 */
export interface BatchQueryResult<T extends QueryDefinition> {
  [key: string]: Awaited<ReturnType<T["query"]>>;
}
/**
 * Расширенное хранилище с поддержкой инвалидирования и ошибок.
 */
export interface StoreWithInvalidation<T extends object>
  extends ObservableStore<T> {
  /**
   * Регистрирует глобальный обработчик ошибок.
   *
   * @template E Тип ошибки (по умолчанию Error)
   * @param handler Функция обработки ошибки
   * @param options Настройки (например, нужно ли продолжать распространение ошибки)
   * @returns Функция для удаления обработчика
   */
  addErrorHandler<E = Error>(
    handler: ErrorHandler<T, E>,
    options: ErrorHandlerOptions
  ): () => void;

  /**
   * Отменяет запрос по ключу.
   *
   * @param key Ключ запроса
   */
  cancelFetch(key: CacheKey): void;

  /**
   * Удаляет все элементы кэша.
   */
  clearCache(): void;

  /**
   * Отменяет все текущие запросы.
   */
  cancelAllFetches(): void;

  /**
   * Удаляет ранее зарегистрированный обработчик ошибок.
   *
   * @param handler Обработчик, который нужно удалить
   */
  removeErrorHandler(handler: ErrorHandler<T>): void;

  /**
   * Внутренняя функция вызова обработчиков ошибок.
   *
   * @param error Возникшая ошибка
   * @param context Контекст ошибки
   * @returns Нужно ли продолжать распространение ошибки дальше
   */
  _handleError(error: unknown, context: ErrorContext<T>): boolean;

  /**
   * Останавливает все активные polling-запросы.
   */
  stopAllPolling(): void;

  /** Очистить все подписки на инвалидирование */
  cleanupAllInvalidationSubs(): void;

  /** Очистить кэш от устаревших значений */
  cleanupCache(): void;

  /**
   * Подписывает callback на инвалидировании указанного кэша.
   *
   * @param cacheKey Ключ кэша
   * @param callback Callback, вызываемый при инвалидировании
   * @returns Функция отписки
   */
  onInvalidate: (
    cacheKey: CacheKey,
    callback: InvalidationCallback
  ) => () => void;

  /**
   * Инициировать инвалидирование по ключ.
   *
   * @param cacheKey Ключ кэша, подлежащий инвалидировании
   */
  invalidate: (cacheKey: CacheKey) => void;

  /**
   * Периодически обновляет значение по указанному пути.
   *
   * @template P Путь в состоянии
   * @param path Путь в состоянии
   * @param fetchFn Функция получения новых данных
   * @param options Интервал, retry, обработчики ошибок и др.
   * @returns Функция для остановки polling'а
   */
  poll<P extends Paths<T>>(
    /** Путь в состоянии */
    path: P,
    /** Функция получения свежих данных */
    fetchFn: (current: ExtractPathType<T, P>) => Promise<ExtractPathType<T, P>>,
    options?: {
      /** Интервал опроса */
      interval?: number;
      /** Ключ кэша */
      cacheKey?: CacheKey;
      /** Количество повторов */
      retryCount?: number;
      /** Задержка перед повтором */
      retryDelay?: number;
      /** Обработчик ошибки */
      onError?: (error: unknown) => void;
      /** Использовать ли экспоненциальную задержку */
      exponentialBackoff?: boolean;
    }
  ): () => void;

  /**
   * Прерывает polling по ключу.
   *
   * @param cacheKey Ключ polling-запроса
   */
  stopPolling(cacheKey: CacheKey): void;

  /**
   * Выполняет запрос с зависимостями и поддержкой кэширования.
   *
   * @template P Путь в состоянии
   * @param key Уникальный ключ запроса
   * @param fetchFn Функция запроса
   * @param options Зависимости, AbortSignal и др.
   * @returns Результат запроса
   */
  fetchDependent<P extends Paths<T>>(
    /** Ключ кэша */
    cacheKey: CacheKey,
    /** Функция получения данных */
    fetchFn: () => Promise<ExtractPathType<T, P>>,
    options: {
      /** Пути зависимостей */
      dependsOn?: Paths<T>[];
      /** Теги */
      tags?: CacheKey[];
      /** Целевой путь в состоянии */
      targetPath?: P;
      /** Автоматическое инвалидирование */
      autoInvalidate?: boolean;
      /** Время жизни */
      ttl?: number;
    }
  ): Promise<ExtractPathType<T, P>>;

  /**
   * Создаёт мутацию с поддержкой состояний загрузки, ошибок и success callback'ов.
   *
   * @template TInput Тип входных данных
   * @template TOutput Тип результата
   * @param options Опции мутации (mutationFn, invalidateTags, onSuccess, onError)
   * @returns Объект мутации с методами `mutate`, `reset`, `getState`
   */
  createMutation<TInput, TOutput>(
    options: MutationOptions<TInput, TOutput>
  ): Mutation<TInput, TOutput>;
  /**
   * Выполняет несколько запросов "пачками" с ограничением по concurrency.
   *
   * @param queries Массив запросов
   * @param options Настройки параллельности и обработчика прогресса
   * @returns Объект с результатами всех запросов
   */
  batchQueries<Q extends { key: string; query: () => Promise<any> }>(
    queries: Q[],
    options?: BatchQueryOptions
  ): Promise<Record<string, Awaited<ReturnType<Q["query"]>>>>;
  /**
   * Полностью очищает ресурсы хранилища, завершает polling и таймеры.
   *
   * @returns Ссылку на уничтоженное хранилище (для цепочек вызова)
   */
  destroy(): StoreWithInvalidation<T>;
}
