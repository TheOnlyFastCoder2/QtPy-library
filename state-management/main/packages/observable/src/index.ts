import {
  CacheKey,
  ExtractPathType,
  Middleware,
  ObservableStore,
  OptimisticUpdateOptions,
  Paths,
  UpdateFn,
} from "./types";
import { getByPath, isUpdateFn, setByPath, shallowEqual } from "./utils";

/**
 * Создает реактивное хранилище с подписками, обновлением по путям, поддержкой middleware, дебаунсом и оптимистичными обновлениями.
 *
 * @template T Тип хранимого состояния
 * @param {T} initialValue Начальное состояние
 * @param {Middleware<T>[]} [middlewares=[]] Массив middleware-функций
 * @returns {ObservableStore<T>} Реактивное хранилище
 */
export function createObservableStore<T extends object>(
  initialValue: T,
  middlewares: Middleware<T>[] = []
): ObservableStore<T> {
  let currentValue = initialValue;
  const debounceTimers = new Map<
    string,
    { timeout: number | undefined; abortController?: AbortController }
  >();
  const subscribers = new Set<(val: T) => void>();
  const pathSubscribers = new Map<string, Set<(val: any) => void>>();
  const cachedSubscribers = new Map<string, Set<(val: T) => void>>();
  let isBatching = false;
  let pendingUpdates: Array<{ path: Paths<T>; value: any }> = [];
  const get = <P extends Paths<T>>(path: P) => {
    return getByPath(currentValue, path);
  };

  const notifyPathSubscribers = <P extends Paths<T>>(
    path: P,
    value: ExtractPathType<T, P>
  ) => {
    const pathKey = path.toString();
    const subscribers = pathSubscribers.get(pathKey);
    if (subscribers) {
      subscribers.forEach((cb) => cb(value));
    }
  };

  const coreUpdate = <P extends Paths<T>>(
    path: P,
    valueOrFn: ExtractPathType<T, P> | UpdateFn<T, P>
  ) => {
    const value = isUpdateFn(valueOrFn) ? valueOrFn(get(path)) : valueOrFn;

    if (isBatching) {
      pendingUpdates.push({ path, value });
      return;
    }
    const currentPathValue = getByPath(currentValue, path);
    if (!shallowEqual(currentPathValue, value)) {
      const newValue = { ...currentValue };
      setByPath(newValue, path, value);
      currentValue = newValue;
      subscribers.forEach((cb) => cb(currentValue));
      notifyPathSubscribers(path, value);
    }
  };
  const resolveCacheKey = <T extends object>(
    key: CacheKey<T>,
    state: T
  ): string => {
    if (typeof key === "function") {
      return key(state);
    }

    if (Array.isArray(key)) {
      return key.join("|");
    }

    // Пробуем обработать как путь
    try {
      const value = getByPath(state, key);
      return JSON.stringify(value);
    } catch {
      // Если не путь - используем как строку
      return key;
    }
  };
  const createUniversalCachedSubscriber = <Cb extends Function>(
    cb: Cb,
    cacheKeys: CacheKey<T>[]
  ): Cb => {
    let lastKey: string | null = null;
    // Регистрируем подписчика для всех его ключей кэша
    cacheKeys.forEach((key) => {
      const resolvedKey = resolveCacheKey(key, currentValue);
      if (!cachedSubscribers.has(resolvedKey)) {
        cachedSubscribers.set(resolvedKey, new Set());
      }

      cachedSubscribers.get(resolvedKey)!.add(cb as any as (val: T) => void);
    });

    return ((...args: any[]) => {
      const state = args[0];
      const currentKey = cacheKeys
        .map((key) => resolveCacheKey(key, state))
        .join("||");

      if (currentKey !== lastKey) {
        lastKey = currentKey;
        return cb(...args);
      }
    }) as unknown as Cb;
  };

  const store: ObservableStore<T> = {
    get current() {
      return currentValue;
    },
    set current(value: T) {
      if (Object.is(currentValue, value)) return;
      currentValue = value;
      subscribers.forEach((cb) => cb(value));
    },

    get,
    update: coreUpdate,
    updateManyAsync: async function <P extends Paths<T>>(
      updates: Array<{
        path: P;
        asyncFn: (current: ExtractPathType<T, P>) => Promise<any>;
      }>
    ) {
      const results = await Promise.all(
        updates.map(async ({ path, asyncFn }) => {
          const current = get(path);
          const result = await asyncFn(current);
          return { path, value: result };
        })
      );

      this.batch(() => {
        results.forEach(({ path, value }) => {
          coreUpdate(path, value);
        });
      });

      return results;
    },

    updateAsync: async <P extends Paths<T>>(
      path: P,
      asyncFn: (current: ExtractPathType<T, P>) => Promise<any>
    ) => {
      const current = get(path);
      const result = await asyncFn(current);
      coreUpdate(path, result);
      return result;
    },

    transaction: async (
      asyncFn: (store: ObservableStore<T>) => Promise<void>
    ) => {
      const snapshot = { ...currentValue };

      try {
        await asyncFn(store);
      } catch (error) {
        currentValue = snapshot; // Откат при ошибке
        subscribers.forEach((cb) => cb(currentValue));
        throw error;
      }
    },

    optimisticUpdate: async <P extends Paths<T>>(
      path: P,
      asyncFn: (
        current: ExtractPathType<T, P>,
        signal?: AbortSignal
      ) => Promise<any>,
      optimisticValue: any,
      options: OptimisticUpdateOptions = {
        abortable: true,
        cancelPrevious: true,
      }
    ) => {
      const timerKey = `opt_${path.toString()}`;

      // Отменяем предыдущий запрос, если нужно
      if (options.cancelPrevious) {
        const existingTimer = debounceTimers.get(timerKey);
        if (existingTimer) {
          existingTimer.abortController?.abort(
            options?.reason ?? "Replaced by new optimistic update"
          );
          debounceTimers.delete(timerKey);
        }
      }

      const previousValue = get(path);
      coreUpdate(path, optimisticValue);

      const abortController = options.abortable
        ? new AbortController()
        : undefined;

      if (abortController) {
        debounceTimers.set(timerKey, {
          timeout: setTimeout(() => {}, 0), // Фейковый таймер
          abortController,
        });
      }

      try {
        const result = await asyncFn(optimisticValue, abortController?.signal);
        coreUpdate(path, result);
        return result;
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          coreUpdate(path, previousValue);
        }
        throw error;
      } finally {
        if (abortController) {
          debounceTimers.delete(timerKey);
        }
      }
    },
    cancelOptimisticUpdate(path: Paths<T>, reason?: string) {
      const timerKey = `opt_${path.toString()}`;
      const timer = debounceTimers.get(timerKey);
      if (timer) {
        timer.abortController?.abort(reason || "Optimistic update canceled");
        debounceTimers.delete(timerKey);
      }
      return this;
    },
    debouncedUpdate: <P extends Paths<T>>(
      path: P,
      asyncFn: (
        current: ExtractPathType<T, P>,
        signal?: AbortSignal
      ) => Promise<any>,
      delay: number = 300
    ) => {
      const timerKey = path.toString();

      // Отменяем предыдущий таймер и запрос (если есть)
      const existingTimer = debounceTimers.get(timerKey);
      if (existingTimer) {
        clearTimeout(existingTimer.timeout);
        existingTimer.abortController?.abort(); // Отменяем предыдущий fetch/запрос
      }

      // Создаем новый AbortController
      const abortController = new AbortController();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(async () => {
          try {
            const result = await asyncFn(get(path), abortController.signal);
            coreUpdate(path, result);
            resolve(result);
          } catch (error) {
            if (error instanceof Error && error.name !== "AbortError") {
              // Игнорируем ошибки отмены
              reject(error);
            }
          } finally {
            debounceTimers.delete(timerKey); // Очищаем после выполнения
          }
        }, delay);

        // Сохраняем таймер и AbortController для возможной отмены
        debounceTimers.set(timerKey, { timeout, abortController });
      });
    },
    batch(callback: () => void) {
      if (isBatching) {
        callback();
        return;
      }

      isBatching = true;
      pendingUpdates = [];
      try {
        callback();
        if (pendingUpdates.length > 0) {
          const newValue = { ...currentValue };
          pendingUpdates.forEach(({ path, value }) => {
            setByPath(newValue, path, value);
          });
          pendingUpdates = [];
          if (!Object.is(currentValue, newValue)) {
            currentValue = newValue;
            subscribers.forEach((cb) => cb(currentValue));
          }
        }
      } finally {
        isBatching = false;
        pendingUpdates = [];
      }
    },

    subscribe(cb: (val: T) => void, cacheKeys: CacheKey<T>[] = []) {
      const cachedSubscriber = cacheKeys.length
        ? createUniversalCachedSubscriber(cb, cacheKeys)
        : cb;

      subscribers.add(cachedSubscriber);
      return () => {
        subscribers.delete(cachedSubscriber);
        // Очищаем из cachedSubscribers
        cacheKeys.forEach((key) => {
          const resolvedKey = resolveCacheKey(key, currentValue);
          cachedSubscribers.get(resolvedKey)?.delete(cachedSubscriber);
        });
      };
    },
    invalidateCache(keys: CacheKey<T> | CacheKey<T>[]) {
      // Нормализуем в массив (если передан одиночный ключ)
      const keysToInvalidate = Array.isArray(keys)
        ? // Если это массив ключей (не массив-ключ)
          keys.every((k) => !Array.isArray(k) || typeof k === "function")
          ? keys
          : [keys]
        : [keys];

      // Приводим к плоскому массиву ключей
      const flatKeys = keysToInvalidate.flatMap((k) =>
        Array.isArray(k) && k.every((i) => typeof i === "string") ? [k] : [k]
      );

      flatKeys.forEach((key) => {
        const resolvedKey = resolveCacheKey(key, currentValue);
        const subscribersToNotify = cachedSubscribers.get(resolvedKey);

        if (subscribersToNotify) {
          // Создаем копию для безопасного итерирования
          const subscribersCopy = new Set(subscribersToNotify);
          subscribersCopy.forEach((cb) => cb(currentValue));
        }
      });
    },
    subscribeToPath<P extends Paths<T>>(
      path: P,
      cb: (val: ExtractPathType<T, P>) => void,
      options: { immediate?: boolean; cacheKeys?: CacheKey<T>[] } = {
        immediate: false,
      }
    ) {
      const pathKey = path.toString();
      const cachedSubscriber = options.cacheKeys?.length
        ? createUniversalCachedSubscriber(cb, options.cacheKeys)
        : cb;

      if (!pathSubscribers.has(pathKey)) {
        pathSubscribers.set(pathKey, new Set());
      }

      const subscribers = pathSubscribers.get(pathKey)!;
      subscribers.add(cachedSubscriber);

      if (options.immediate) {
        cachedSubscriber(get(path));
      }

      return () => {
        subscribers.delete(cachedSubscriber);
        if (subscribers.size === 0) {
          pathSubscribers.delete(pathKey);
        }
      };
    },

    clearDebounceTimers() {
      debounceTimers.forEach(({ timeout, abortController }) => {
        clearTimeout(timeout);
        abortController?.abort("Operation canceled by clearDebounceTimers");
      });
      debounceTimers.clear();
      return this;
    },

    destroy() {
      this.clearDebounceTimers();
      subscribers.clear();
      pathSubscribers.clear();
      return this;
    },
  };

  let update = coreUpdate;
  for (let i = middlewares.length - 1; i >= 0; i--) {
    update = middlewares[i](store, update);
  }
  store.update = update;
  return store;
}
