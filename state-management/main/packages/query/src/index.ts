import { createObservableStore } from "@qtpy/state-management-observable";
import {
  ExtractPathType,
  Middleware,
  Paths,
} from "@qtpy/state-management-observable/types";
import {
  InvalidationCallback,
  CacheKey,
  StoreWithInvalidation,
  MutationOptions,
  Mutation,
  QueryCacheItem,
  ErrorHandler,
  ErrorHandlerOptions,
  ErrorContext,
  QueryStoreConfig,
} from "./types";

const DEFAULT_CONFIG: QueryStoreConfig = {
  cache: {
    defaultTTL: 5 * 60 * 1000, // 5 минут
    maxSize: 100,
    cleanupInterval: 60 * 1000, // 1 минута
  },
  polling: {
    defaultInterval: 30 * 1000, // 30 секунд
    retry: {
      defaultDelay: 1000, // 1 секунда
      maxExponentialBackoff: 30 * 1000, // 30 секунд макс. задержка
    },
  },
  fetch: {
    defaultRetryCount: 3,
    concurrency: 5,
  },
  dependencies: {
    checkInterval: 100, // Интервал проверки зависимостей
  },
};

/**
 * Создаёт расширенный observable-хранилище с поддержкой:
 * - автоматического кэширования,
 * - управления polling-запросами,
 * - отмены запросов,
 * - инвалидирования по ключам,
 * - обработки ошибок и зависимостей.
 *
 * @template T Тип состояния хранилища
 * @param initial Начальное состояние
 * @param middlewares Массив middleware для хранилища
 * @param userConfig Пользовательская конфигурация (объединяется с DEFAULT_CONFIG)
 * @returns Расширенное хранилище с методами работы с запросами, polling'ом, инвалидированием и ошибками
 */
export function createQueryStore<T extends object>(
  initial: T,
  middlewares: Middleware<T>[] = [],
  userConfig: Partial<QueryStoreConfig> = {}
): StoreWithInvalidation<T> & { config: QueryStoreConfig } {
  const config: QueryStoreConfig = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    cache: {
      ...DEFAULT_CONFIG.cache,
      ...userConfig.cache,
    },
    polling: {
      ...DEFAULT_CONFIG.polling,
      ...userConfig.polling,
      retry: {
        ...DEFAULT_CONFIG.polling.retry,
        ...userConfig.polling?.retry,
      },
    },
    fetch: {
      ...DEFAULT_CONFIG.fetch,
      ...userConfig.fetch,
    },
    dependencies: {
      ...DEFAULT_CONFIG.dependencies,
      ...userConfig.dependencies,
    },
  };

  const baseStore = createObservableStore(initial, middlewares);
  const invalidationSubs = new Map<
    CacheKey,
    Set<WeakRef<InvalidationCallback>>
  >();
  const pollingIntervals = new Map<CacheKey, number | undefined>();
  const dependencySubscriptions = new Map<CacheKey, () => void>();
  const queryCache = new Map<CacheKey, QueryCacheItem>();
  const abortControllers = new Map<CacheKey, AbortController>();

  const globalErrorHandlers = new Set<{
    handler: ErrorHandler<T>;
    options: ErrorHandlerOptions;
  }>();

  const invalidateByTag = (tag: CacheKey) => {
    const subs = invalidationSubs.get(tag);
    if (!subs) return;

    // Сначала собираем все "живые" callback'и
    const callbacks: InvalidationCallback[] = [];
    const deadRefs: WeakRef<InvalidationCallback>[] = [];

    subs.forEach((ref) => {
      const callback = ref.deref();
      if (callback) {
        callbacks.push(callback);
      } else {
        deadRefs.push(ref);
      }
    });

    // Удаляем "мертвые" ссылки
    deadRefs.forEach((deadRef) => subs.delete(deadRef));

    // Вызываем все живые callback'и
    callbacks.forEach((cb) => cb());
  };

  const registry = new FinalizationRegistry((key: CacheKey) => {
    const subs = invalidationSubs.get(key);
    if (subs) {
      for (const ref of subs) {
        if (!ref.deref()) {
          subs.delete(ref);
        }
      }
      if (subs.size === 0) {
        invalidationSubs.delete(key);
      }
    }
  });
  /**
   * Принудительно очищает устаревшие элементы кэша.
   */
  const cleanupCache = () => {
    const now = Date.now();
    queryCache.forEach((item, key) => {
      const expiresAt = item.createdAt + (item.ttl ?? config.cache.defaultTTL);
      if (expiresAt < now) {
        queryCache.delete(key);
      }
    });
    if (queryCache.size > config.cache.maxSize) {
      const entries = Array.from(queryCache.entries());
      entries.sort((a, b) => a[1].createdAt - b[1].createdAt); // Сортируем по времени создания

      // Удаляем самые старые записи
      for (let i = 0; i < entries.length - config.cache.maxSize / 2; i++) {
        queryCache.delete(entries[i][0]);
      }
    }
  };

  const cleanupInterval = setInterval(
    cleanupCache,
    config.cache.cleanupInterval
  );
  const isErrorType = <E>(error: unknown): error is E => {
    return error instanceof Error;
  };

  const combineSignals = (...signals: AbortSignal[]): AbortSignal => {
    const controller = new AbortController();
    signals.forEach((signal) => {
      if (signal.aborted) controller.abort();
      signal.addEventListener("abort", () => controller.abort());
    });
    return controller.signal;
  };

  const waitForDeps = (
    paths: Paths<T>[],
    signal: AbortSignal
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (signal.aborted)
        return reject(new DOMException("Aborted", "AbortError"));

      const checkReady = () =>
        paths.every((p) => {
          const val = baseStore.get(p);
          return val !== undefined && val !== null;
        });

      if (checkReady()) return resolve();

      const unsubscribes: (() => void)[] = [];
      const cleanup = () => unsubscribes.forEach((unsub) => unsub());

      // Подписка на КОНКРЕТНЫЕ пути через subscribeToPath
      paths.forEach((path) => {
        const unsub = baseStore.subscribeToPath(path, () => {
          if (checkReady()) {
            cleanup();
            resolve();
          }
        });
        unsubscribes.push(unsub);
      });

      signal.addEventListener("abort", () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  };

  const store: StoreWithInvalidation<T> = {
    ...baseStore,

    addErrorHandler<E = Error>(
      handler: ErrorHandler<T, E>,
      options?: ErrorHandlerOptions
    ): () => void {
      const wrapper: ErrorHandler<T, unknown> = (error, context) => {
        if (isErrorType<E>(error)) {
          // type guard для проверки типа
          handler(error, { ...context, originalError: error });
        }
      };
      globalErrorHandlers.add({ handler: wrapper, options });
      return () => globalErrorHandlers.delete({ handler: wrapper, options });
    },

    removeErrorHandler(handler: ErrorHandler<T>) {
      for (const entry of globalErrorHandlers) {
        if (entry.handler === handler) {
          globalErrorHandlers.delete(entry);
          break;
        }
      }
    },

    _handleError<E = unknown>(
      error: E,
      context: Omit<ErrorContext<T, E>, "type">
    ): boolean {
      let shouldPropagate = true;
      const fullContext: ErrorContext<T, E> = {
        ...context,
        type: "query",
        originalError: error,
      };

      globalErrorHandlers.forEach(({ handler, options }) => {
        try {
          handler(error as Parameters<typeof handler>[0], fullContext);
          if (!options.propagate) {
            shouldPropagate = false;
          }
        } catch (handlerError) {
          console.error("Error handler failed:", handlerError);
        }
      });

      return shouldPropagate;
    },
    cleanupCache,
    cleanupAllInvalidationSubs() {
      invalidationSubs.forEach((subs, tag) => {
        subs.forEach((ref) => {
          if (!ref.deref()) {
            subs.delete(ref);
          }
        });
        if (subs.size === 0) {
          invalidationSubs.delete(tag);
        }
      });
    },

    onInvalidate(cacheKey: CacheKey, callback: InvalidationCallback) {
      if (!invalidationSubs.has(cacheKey)) {
        invalidationSubs.set(cacheKey, new Set());
      }

      const ref = new WeakRef(callback);
      invalidationSubs.get(cacheKey)!.add(ref);

      // Регистрируем callback для автоматической очистки
      registry.register(callback, cacheKey);

      return () => {
        const subs = invalidationSubs.get(cacheKey);
        if (subs) {
          for (const existingRef of subs) {
            if (existingRef.deref() === callback) {
              subs.delete(existingRef);
              break;
            }
          }
          if (subs.size === 0) {
            invalidationSubs.delete(cacheKey);
          }
        }
        registry.unregister(callback);
      };
    },

    invalidate(cacheKey: CacheKey) {
      invalidateByTag(cacheKey);
    },

    createMutation<TInput, TOutput>(
      options: MutationOptions<TInput, TOutput>
    ): Mutation<TInput, TOutput> {
      let state = {
        isLoading: false,
        error: null as unknown,
        data: null as TOutput | null,
      };

      const mutate = async (input: TInput): Promise<TOutput> => {
        state.isLoading = true;
        try {
          const result = await options.mutationFn(input);
          state = { ...state, data: result, error: null };

          options.invalidateTags?.forEach((tag) => {
            invalidateByTag(tag);
          });

          options.onSuccess?.(result);
          return result;
        } catch (error) {
          state = { ...state, error };
          options.onError?.(error);
          throw error;
        } finally {
          state.isLoading = false;
        }
      };

      const reset = () => {
        state = { isLoading: false, error: null, data: null };
      };

      return {
        mutate,
        reset,
        getState: () => ({ ...state }),
      };
    },

    async fetchDependent<P extends Paths<T>>(
      key: string,
      fetchFn: (signal?: AbortSignal) => Promise<ExtractPathType<T, P>>,
      options: {
        dependsOn?: Paths<T>[];
        signal?: AbortSignal;
      } = {}
    ): Promise<ExtractPathType<T, P>> {
      // Отмена предыдущего запроса с этим ключом
      if (abortControllers.has(key)) {
        abortControllers.get(key)?.abort("New request started");
      }

      const controller = new AbortController();
      abortControllers.set(key, controller);

      const combinedSignal = options.signal
        ? combineSignals(controller.signal, options.signal)
        : controller.signal;

      try {
        // Проверка кэша
        const cached = queryCache.get(key);
        if (cached && Date.now() - cached.createdAt < 5 * 60 * 1000) {
          return cached.data;
        }

        // Ожидание зависимостей через subscribeToPath
        if (options.dependsOn) {
          await waitForDeps(options.dependsOn, combinedSignal);
        }

        // Выполнение запроса
        const data = await fetchFn(combinedSignal);
        queryCache.set(key, { data, createdAt: Date.now() });
        return data;
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          queryCache.delete(key);
        }
        throw error;
      } finally {
        abortControllers.delete(key);
      }
    },

    cancelFetch(key: CacheKey) {
      abortControllers.get(key)?.abort("Manually canceled");
      abortControllers.delete(key);
    },

    cancelAllFetches() {
      abortControllers.forEach((controller) =>
        controller.abort("All fetches canceled")
      );
      abortControllers.clear();
    },

    clearCache() {
      queryCache.clear();
    },

    async batchQueries<Q extends { key: string; query: () => Promise<any> }>(
      queries: Q[],
      options: {
        concurrency?: number; // Ограничение количества одновременных запросов
        onProgress?: (percent: number) => void; // Прогресс выполнения
      } = {}
    ): Promise<Record<string, Awaited<ReturnType<Q["query"]>>>> {
      if (queries.length === 0) return {};

      // Ограничение concurrency (например, 3 запроса одновременно)
      const concurrency = options.concurrency || config.fetch.concurrency;
      const results: Record<string, any> = {};
      let completed = 0;

      // Запускаем запросы "пачками" (чтобы не нагружать сеть)
      const runBatch = async (batchQueries: Q[]) => {
        const batchResults = await Promise.all(
          batchQueries.map(async ({ key, query }) => {
            try {
              const data = await query();
              results[key] = data;
            } catch (error) {
              results[key] = { error }; // Сохраняем ошибку, но не прерываем батч
            } finally {
              completed++;
              options.onProgress?.(
                Math.round((completed / queries.length) * 100)
              );
            }
          })
        );
        return batchResults;
      };

      // Разбиваем запросы на "пачки" по concurrency
      for (let i = 0; i < queries.length; i += concurrency) {
        await runBatch(queries.slice(i, i + concurrency));
      }

      return results;
    },

    poll<P extends Paths<T>>(
      path: P,
      fetchFn: (
        current: ExtractPathType<T, P>
      ) => Promise<ExtractPathType<T, P>>,
      options: {
        interval?: number;
        cacheKey?: CacheKey;
        retryCount?: number;
        retryDelay?: number;
        onError?: (error: unknown) => void;
        exponentialBackoff?: boolean;
      }
    ) {
      const cacheKey = options.cacheKey || path.toString();
      this.stopPolling(cacheKey);

      // Состояние для управления повторными попытками
      let currentRetry = 0;
      let currentDelay =
        options.retryDelay || config.polling.retry.defaultDelay;
      let active = true;

      const executeFetch = async () => {
        if (!active) return;

        try {
          const current = baseStore.get(path);
          const newData = await fetchFn(current);
          baseStore.update(path, newData);

          // Сброс счетчика попыток при успехе
          currentRetry = 0;
          currentDelay = options.retryDelay || 1000;
        } catch (error) {
          if (!active) return;

          // Вызов кастомного обработчика
          options.onError?.(error);

          // Логирование только "настоящих" ошибок (не AbortError)
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            console.error(`Polling error for ${cacheKey}:`, error);
          }

          // Логика повторных попыток
          if (options.retryCount && currentRetry < options.retryCount - 1) {
            currentRetry++;

            if (options.exponentialBackoff) {
              currentDelay *= 2; // Экспоненциальный рост задержки
            }

            setTimeout(executeFetch, currentDelay);
            return;
          }

          // Если попытки исчерпаны - не планируем следующий запрос
          return;
        }

        // Планируем следующий запрос, если polling еще активен
        if (active) {
          pollingIntervals.set(
            cacheKey,
            setTimeout(executeFetch, options.interval) as unknown as
              | number
              | undefined
          );
        }
      };

      // Первый запуск (без задержки)
      executeFetch();

      // Функция остановки
      return () => {
        active = false;
        this.stopPolling(cacheKey);
      };
    },

    stopPolling(cacheKey: CacheKey) {
      const intervalId = pollingIntervals.get(cacheKey);
      if (intervalId) {
        clearTimeout(intervalId);
        pollingIntervals.delete(cacheKey);
      }
    },

    stopAllPolling() {
      pollingIntervals.forEach((_, key) => this.stopPolling(key));
    },

    destroy() {
      clearInterval(cleanupInterval);
      pollingIntervals.forEach(clearInterval);

      pollingIntervals.forEach(clearInterval);
      pollingIntervals.clear();
      invalidationSubs.forEach((callbacks) => callbacks.clear());
      invalidationSubs.clear();
      dependencySubscriptions.forEach((unsubscribe) => unsubscribe());
      dependencySubscriptions.clear();
      queryCache.clear();
      baseStore.destroy();
      return this;
    },
  };

  return {
    ...store,
    config,
  };
}
