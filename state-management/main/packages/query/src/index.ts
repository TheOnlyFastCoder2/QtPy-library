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
} from "./types";

export function createQueryStore<T extends object>(
  initial: T,
  middlewares: Middleware<T>[] = [],
  { DEFAULT_CACHE_TTL, MAX_CACHE_SIZE } = {
    DEFAULT_CACHE_TTL: 5 * 60 * 1000,
    MAX_CACHE_SIZE: 100,
  }
): StoreWithInvalidation<T> {
  const baseStore = createObservableStore(initial, middlewares);
  const invalidationSubs = new Map<
    CacheKey,
    Set<WeakRef<InvalidationCallback>>
  >();
  const pollingIntervals = new Map<CacheKey, number | undefined>();
  const dependencySubscriptions = new Map<CacheKey, () => void>();
  const queryCache = new Map<CacheKey, QueryCacheItem>();

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

  const cleanupCache = () => {
    const now = Date.now();
    queryCache.forEach((item, key) => {
      const expiresAt = item.createdAt + (item.ttl ?? DEFAULT_CACHE_TTL);
      if (expiresAt < now) {
        queryCache.delete(key);
      }
    });
    if (queryCache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(queryCache.entries());
      entries.sort((a, b) => a[1].createdAt - b[1].createdAt); // Сортируем по времени создания

      // Удаляем самые старые записи
      for (let i = 0; i < entries.length - MAX_CACHE_SIZE / 2; i++) {
        queryCache.delete(entries[i][0]);
      }
    }
  };

  const cleanupInterval = setInterval(cleanupCache, 60 * 1000);
  const isErrorType = <E>(error: unknown): error is E => {
    return error instanceof Error;
  };

  const store: StoreWithInvalidation<T> = {
    ...baseStore,

    addErrorHandler<E = Error>(
      handler: ErrorHandler<T, E>,
      options: ErrorHandlerOptions = {}
    ) {
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
      key: CacheKey,
      fetchFn: () => Promise<ExtractPathType<T, P>>,
      options: {
        dependsOn?: Paths<T>[];
        tags?: CacheKey[];
        targetPath?: P;
        autoInvalidate?: boolean;
        ttl?: number;
      } = {}
    ): Promise<ExtractPathType<T, P>> {
      // 1. Отмена предыдущих подписок и проверка кеша
      dependencySubscriptions.get(key)?.();
      dependencySubscriptions.delete(key);

      const cached = queryCache.get(key);
      if (cached) {
        const expiresAt = cached.createdAt + (cached.ttl ?? DEFAULT_CACHE_TTL);
        if (expiresAt > Date.now()) {
          return cached.data;
        }
      }

      // 2. Обработка зависимостей
      const areDependenciesReady = () =>
        (options.dependsOn || []).every((path) => {
          const value = baseStore.get(path);
          return value !== undefined && value !== null;
        });

      if (options.dependsOn && !areDependenciesReady()) {
        await new Promise<void>((resolve, reject) => {
          const unsubscribe = baseStore.subscribe(() => {
            if (areDependenciesReady()) {
              cleanupSubscription();
              resolve();
            }
          });

          const cleanupSubscription = () => {
            unsubscribe();
            dependencySubscriptions.delete(key);
          };

          // Таймаут для зависимостей
          const timeoutId = setTimeout(() => {
            cleanupSubscription();
            reject(new Error(`Dependencies timeout for key: ${key}`));
          }, 30_000); // 30 секунд таймаут

          dependencySubscriptions.set(key, () => {
            clearTimeout(timeoutId);
            cleanupSubscription();
          });
        });
      }

      // 3. Регистрация инвалидации (с WeakRef)
      const registerInvalidation = () => {
        if (!options.tags?.length) return;

        const invalidationCallback = async () => {
          try {
            const freshData = await fetchFn();
            if (options.targetPath) {
              baseStore.update(options.targetPath, freshData);
            }
            queryCache.set(key, {
              data: freshData,
              tags: options.tags,
              createdAt: Date.now(),
              ttl: options.ttl,
            });
          } catch (error) {
            console.error(`Invalidation failed for key ${key}:`, error);
          }
        };

        const ref = new WeakRef(invalidationCallback);
        options.tags.forEach((tag) => {
          if (!invalidationSubs.has(tag)) {
            invalidationSubs.set(tag, new Set());
          }
          invalidationSubs.get(tag)!.add(ref);
          registry.register(invalidationCallback, tag);
        });
      };

      // 4. Выполнение запроса
      try {
        const data = await fetchFn();

        queryCache.set(key, {
          data,
          tags: options.tags,
          createdAt: Date.now(),
          ttl: options.ttl,
        });

        if (options.targetPath) {
          baseStore.update(options.targetPath, data);
        }

        if (options.autoInvalidate !== false) {
          registerInvalidation();
        }

        return data;
      } catch (error) {
        queryCache.delete(key);
        if (options.tags) {
          options.tags.forEach((tag) => invalidateByTag(tag));
        }
        throw error;
      }
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
      const concurrency = options.concurrency || Infinity;
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
        interval: number;
        cacheKey?: CacheKey;
        retryCount?: number; // Макс. количество попыток
        retryDelay?: number; // Задержка между попытками (ms)
        onError?: (error: unknown) => void; // Кастомный обработчик ошибок
        exponentialBackoff?: boolean; // Экспоненциальный рост задержки
      } = { interval: 30_000 }
    ) {
      const cacheKey = options.cacheKey || path.toString();
      this.stopPolling(cacheKey);

      // Состояние для управления повторными попытками
      let currentRetry = 0;
      let currentDelay = options.retryDelay || 1000;
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

  return store;
}
