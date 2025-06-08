// Refactored ObservableStore implementation with reactive proxy assignment, cache-key-based subscription filtering, and periodic cleanup
//index.ts
import {
  Middleware,
  Subscriber,
  CacheKey,
  ObservableStore,
  SubscriptionMeta,
  Accessor,
} from "./types";
import {
  normalizeCacheKey,
  shallowEqual,
  splitPath,
  getStringPath,
  validatePath,
  isArrayMethod,
} from "./utils";

// --- Helpers & Managers ---
class HistoryManager {
  private history = new Map<string, any[]>();
  private index = new Map<string, number>();
  constructor(private maxLength: number) {}

  push(path: string, prevValue: any) {
    const hist = this.history.get(path) || [];
    let idx = this.index.get(path) ?? -1;

    // при откате обрезаем «будущую» ветку
    if (idx + 1 < hist.length) {
      hist.splice(idx + 1);
    }

    hist.push(prevValue);

    // ленивое обрезание самого старого, если вышли за maxLength
    if (hist.length > this.maxLength) {
      hist.shift();
      idx = hist.length - 1;
    } else {
      idx = hist.length - 1;
    }

    this.history.set(path, hist);
    this.index.set(path, idx);
  }
  clear(path: string) {
    this.history.delete(path);
    this.index.delete(path);
  }
  undo(path: string) {
    const hist = this.history.get(path);
    let idx = this.index.get(path) ?? -1;
    if (!hist || idx < 0) return;
    const value = hist[idx];
    this.index.set(path, idx - 1);
    return value;
  }

  redo(path: string) {
    const hist = this.history.get(path);
    let idx = this.index.get(path) ?? -1;
    if (!hist || idx >= hist.length) return;
    const value = hist[idx];
    this.index.set(path, idx);
    return value;
  }
  // Remove history entries for paths not in the provided set
  pruneUnused(usedPaths: Set<string>) {
    for (const path of Array.from(this.history.keys())) {
      if (!usedPaths.has(path)) {
        this.history.delete(path);
        this.index.delete(path);
      }
    }
  }
  getEntries() {
    return Array.from(this.history.entries()).map(
      ([path, h], index, entries) => ({
        path,
        length: h.length,
        entries: entries[index][1],
      })
    );
  }
}

export function createObservableStore<T extends object, D extends number = 0>(
  initialState: T,
  middlewares: Middleware<T, D>[] = [],
  options: { maxHistoryLength?: number } = {}
): ObservableStore<T, D> {
  const { maxHistoryLength = Infinity } = options;
  let rawState = { ...initialState };

  // === Batching infrastructure ===
  let batching = false;
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;
  let currentSubscriberMeta: SubscriptionMeta | null = null;

  const pendingStack: Map<string, any>[] = [];
  const subscribers = new Set<Subscriber<T>>();
  const pathSubscribers = new Map<string, Set<Subscriber<T>>>();
  const aborters = new Map<string, AbortController>();
  const proxyCache = new WeakMap<object, Map<string, any>>();

  const historyMgr = new HistoryManager(maxHistoryLength);

  const currentPending = () => pendingStack[pendingStack.length - 1];
  // resolve paths from proxies or strings
  const resolve = (p: string | Accessor<any>) => getStringPath(p);
  // read raw value
  const getRaw = (path: string) => {
    const segments = splitPath(path);
    return segments.reduce((o: any, k) => {
      if (o == null) return undefined;
      return o[k as keyof typeof o];
    }, rawState as any);
  };
  // Аналогично для setRaw:
  const setRaw = (path: string, val: any) => {
    const segments = splitPath(path);
    const lastKey = segments.pop()!;
    const parentObj = segments.reduce((o: any, k) => {
      if (o == null)
        throw new Error(
          `Невозможно установить по пути "${path}" — промежуточное значение undefined`
        );
      return o[k as keyof typeof o];
    }, rawState as any);
    parentObj[lastKey as keyof typeof parentObj] = val;
  };

  let currentArrayMethod: { name: string } | null = null;

  function createReactiveProxy<T extends object>(
    target: T,
    parentFullPath: string = ""
  ): T {
    if (typeof target !== "object" || target === null) return target;

    const proxy = new Proxy(target, {
      get(target, prop, receiver) {
        const key = typeof prop === "string" ? prop : String(prop);
        const fullPath = parentFullPath ? `${parentFullPath}.${key}` : key;

        // Трекинг зависимостей
        currentSubscriberMeta?.trackedPaths.add(fullPath);

        const rawValue = Reflect.get(target, prop, receiver);

        // 🎯 Перехват мутирующих методов массива
        if (
          Array.isArray(target) &&
          typeof rawValue === "function" &&
          isArrayMethod(key)
        ) {
          return (...args: any[]) => {
            currentArrayMethod = { name: key };
            let result: any;

            store.batch(() => {
              result = rawValue.apply(receiver, args);
            });

            // ✅ Инвалидация один раз
            if (parentFullPath) {
              store.invalidate(parentFullPath);
            }

            currentArrayMethod = null;
            return result;
          };
        }

        // Защита от циклических ссылок
        if (rawValue === target) return receiver;

        // Рекурсивная проксимация вложенных объектов
        if (rawValue !== null && typeof rawValue === "object") {
          return createReactiveProxy(rawValue, fullPath);
        }

        return rawValue;
      },

      set(target, prop, value, receiver) {
        const key = typeof prop === "string" ? prop : String(prop);
        const fullPath = parentFullPath ? `${parentFullPath}.${key}` : key;

        const oldValue = Reflect.get(target, prop, receiver);
        if (Object.is(oldValue, value)) return true;

        if (batching) {
          currentPending()!.set(fullPath, value);
        } else {
          store.update(fullPath, value);

          // Только если не в массивном методе — иначе invalidate вызывается в batch
          if (!currentArrayMethod && parentFullPath) {
            store.invalidate(parentFullPath);
          }
        }

        return true;
      },

      deleteProperty(target, prop) {
        const key = typeof prop === "string" ? prop : String(prop);
        const fullPath = parentFullPath ? `${parentFullPath}.${key}` : key;

        const success = Reflect.deleteProperty(target, prop);
        if (success) store.update(fullPath, undefined);
        return success;
      },

      ownKeys(target) {
        if (currentSubscriberMeta) {
          const prefix = parentFullPath ? `${parentFullPath}.` : "";
          for (const key of Reflect.ownKeys(target)) {
            currentSubscriberMeta.trackedPaths.add(`${prefix}${String(key)}`);
          }
        }
        return Reflect.ownKeys(target);
      },
    });

    return proxy;
  }

  // Оптимизированное преобразование свойств
  const propToString = (prop: string | symbol): string =>
    typeof prop === "symbol"
      ? Symbol.keyFor(prop) || prop.toString()
      : String(prop);

  // placeholder for store
  const store: any = {};
  const stateProxy = createReactiveProxy(rawState);
  Object.defineProperty(store, "state", { get: () => stateProxy });
  store.$ = store.state;
  // notification: global subscribers filtered by cacheKeys
  function notifyInvalidate(normalizedKey: string) {
    subscribers.forEach((sub) => {
      const meta: SubscriptionMeta = (sub as any).__meta;
      if (!meta.cacheKeys || meta.cacheKeys.has(normalizedKey)) {
        currentSubscriberMeta = meta;
        try {
          sub(stateProxy);
        } finally {
          currentSubscriberMeta = null;
        }
      }
    });
    const pathSubs = pathSubscribers.get(normalizedKey);
    if (pathSubs) {
      const newVal = getRaw(normalizedKey);
      pathSubs.forEach((cb) => cb(newVal));
    }
  }

  function performCleanup() {
    const used = new Set<string>(pathSubscribers.keys());
    historyMgr.pruneUnused(used);
  }

  // core update logic
  const doUpdate = (path: string, newVal: any) => {
    const oldVal = getRaw(path);
    if (shallowEqual(oldVal, newVal)) return;
    historyMgr.push(path, oldVal);
    setRaw(path, newVal);
    notifyInvalidate(path);
  };
  // Package Update Wrapper
  function commit(pending: Map<string, any>) {
    const changedPaths: string[] = [];

    for (const [path, value] of pending) {
      const oldVal = getRaw(path);
      if (!shallowEqual(oldVal, value)) {
        historyMgr.push(path, oldVal);
        setRaw(path, value);
        notifyInvalidate(path);
        changedPaths.push(path);
      }
    }

    if (changedPaths.length) {
      subscribers.forEach((sub) => sub(stateProxy));
    }
  }

  store.resolveValue = (pathOrAccessor, valueOrFn) => {
    validatePath(pathOrAccessor);
    const path = resolve(pathOrAccessor);
    const old = getRaw(path);
    return typeof valueOrFn === "function"
      ? (valueOrFn as (cur: any) => any)(old)
      : valueOrFn;
  };
  // API methods
  store.update = (pathOrAccessor, valueOrFn) => {
    validatePath(pathOrAccessor);
    const path = resolve(pathOrAccessor);
    const newVal = store.resolveValue(pathOrAccessor, valueOrFn);

    if (batching) {
      currentPending()!.set(path, newVal);
    } else {
      doUpdate(path, newVal);
    }
  };

  store.asyncUpdate = async (
    pathOrAccessor: string | (() => any),
    updater: (cur: any, signal: AbortSignal) => Promise<any>,
    options: { abortPrevious?: boolean } = { abortPrevious: false }
  ) => {
    // Проверяем, что путь задан корректно (строка или функция-доступ)
    validatePath(pathOrAccessor);

    // Получаем непосредственно строку вида "a.b.c" или "arr.0.name"
    const pathStr = resolve(pathOrAccessor);

    // Если нужно отменить предыдущий запрос по этому же пути — делаем abort
    if (options.abortPrevious) {
      const prevCtrl = aborters.get(pathStr);
      if (prevCtrl) {
        prevCtrl.abort();
        aborters.delete(pathStr);
      }
    }

    // Создаём новый AbortController и привязываем его к этому пути
    const ctrl = new AbortController();
    // При отмене автоматически удаляем контроллер из мапы
    ctrl.signal.addEventListener(
      "abort",
      () => {
        aborters.delete(pathStr);
      },
      { once: true }
    );
    aborters.set(pathStr, ctrl);

    try {
      // Берём текущее «сырое» значение по строковому пути
      const oldValue = getRaw(pathStr);

      // Вызываем переданную асинхронную функцию (updator), передаём текущий value и signal
      const newValue = await updater(oldValue, ctrl.signal);

      // Если во время ожидания не произошло abort, применяем обновление
      if (!ctrl.signal.aborted) {
        // Передаём результат прямо в store.update, используя строковый путь
        store.update(pathStr, newValue);
      }
    } catch (e) {
      // Если ошибка не связана с AbortError, логируем её
      if ((e as any).name !== "AbortError") {
        console.error(e);
      }
    } finally {
      // В любом случае удаляем этот контроллер
      aborters.delete(pathStr);
    }
  };

  store.batch = (fn: () => void) => {
    // Push a new pending context
    pendingStack.push(new Map());
    batching = true;

    try {
      fn(); // run user's updates
    } finally {
      const myPending = pendingStack.pop()!;
      if (pendingStack.length > 0) {
        // nested batch: merge into parent
        const parent = currentPending()!;
        for (const [path, val] of myPending) {
          parent.set(path, val);
        }
      } else {
        // top-level batch: commit all changes
        commit(myPending);
        batching = false;
      }
    }
    return Promise.resolve();
  };
  store.undo = (p) => {
    validatePath(p);
    const path = resolve(p);
    const prevValue = historyMgr.undo(path);
    if (prevValue !== undefined) {
      doUpdate(path, prevValue);
      return true;
    }
    console.warn(`No undo history for path: ${path}`);
    return false;
  };
  store.redo = (p: any): boolean => {
    validatePath(p);
    const path = resolve(p);
    const nextValue = historyMgr.redo(path);
    if (nextValue !== undefined) {
      doUpdate(path, nextValue);
      return true;
    }
    // No history to redo
    console.warn(`No redo history for path: ${path}`);
    return false;
  };

  store.subscribe = (cb, keys) => {
    const normKeys: Set<string> | undefined = keys
      ? new Set<string>(keys.map((k) => normalizeCacheKey(k, store)))
      : undefined;
    const meta: SubscriptionMeta = {
      active: true,
      trackedPaths: new Set(),
      cacheKeys: normKeys,
    };
    const wrap = (s: T) => {
      if (meta.active) cb(s);
    };
    (wrap as any).__meta = meta;
    subscribers.add(wrap);
    return () => {
      meta.active = false;
      subscribers.delete(wrap);
      performCleanup();
    };
  };

  store.subscribeToPath = (
    pathOrAccessor,
    cb,
    opts: { immediate?: boolean; cacheKeys?: CacheKey<T, D>[] } = {}
  ) => {
    validatePath(pathOrAccessor);

    const { immediate = false, cacheKeys } = opts;
    const mainPath = resolve(pathOrAccessor);
    //@ts-ignore
    const normalizedKeys = cacheKeys //@ts-ignore
      ? cacheKeys.map((k) => normalizeCacheKey<T, D>(k, store))
      : [];

    const allPaths = [mainPath, ...normalizedKeys];
    const wrap = (val: any) => cb(val);

    const meta: SubscriptionMeta = {
      active: true,
      trackedPaths: new Set(allPaths),
      cacheKeys:
        normalizedKeys.length > 0 ? new Set(normalizedKeys) : undefined,
    };
    (wrap as any).__meta = meta;

    allPaths.forEach((p) => {
      if (!pathSubscribers.has(p)) {
        pathSubscribers.set(p, new Set());
      }
      pathSubscribers.get(p)!.add(wrap);
    });

    if (immediate) {
      wrap(getRaw(mainPath));
    }

    return () => {
      allPaths.forEach((p) => {
        pathSubscribers.get(p)?.delete(wrap);
      });
      historyMgr.clear(mainPath);
    };
  };

  store.invalidate = (keyProxy) => {
    const key = resolve(keyProxy);
    notifyInvalidate(key);
  };

  store.cancelAsyncUpdates = (p?: any) => {
    if (p) {
      const key = resolve(p);
      const ctrl = aborters.get(key);
      if (ctrl) {
        ctrl.abort();
        aborters.delete(key);
      }
    } else {
      aborters.forEach((c, key) => {
        c.abort();
        aborters.delete(key);
      });
    }
  };

  store.clearStore = () => {
    subscribers.clear();
    pathSubscribers.clear();
    aborters.clear();
    if (cleanupTimer !== null) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  };

  store.get = (p) => {
    validatePath(p);
    return getRaw(resolve(p));
  };

  store.resolvePath = resolve;

  store.getMemoryStats = () => ({
    subscribersCount: subscribers.size,
    pathSubscribersCount: pathSubscribers.size,
    historyEntries: historyMgr.getEntries(),
    activePathsCount: pathSubscribers.size,
  });

  // apply middlewares
  let wrappedUpdate = store.update;
  middlewares.reverse().forEach((mw) => {
    wrappedUpdate = mw(store, wrappedUpdate);
  });
  store.update = wrappedUpdate;

  return store as ObservableStore<T, D>;
}
