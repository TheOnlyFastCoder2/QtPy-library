// Refactored ObservableStore implementation with reactive proxy assignment, cache-key-based subscription filtering, and periodic cleanup
import {
  Middleware,
  Subscriber,
  CacheKey,
  ObservableStore,
  SubscriptionMeta,
} from "./types";
import {
  normalizeCacheKey,
  shallowEqual,
  createPathProxy,
  validatePath,
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
    return Array.from(this.history.entries()).map(([path, h]) => ({
      path,
      length: h.length,
    }));
  }
}

export function createObservableStore<T extends object>(
  initialState: T,
  middlewares: Middleware<T>[] = [],
  options: { maxHistoryLength?: number } = {}
): ObservableStore<T> {
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
  const { $, getProxyPath, getProxyFromStringPath } = createPathProxy<T>();

  const currentPending = () => pendingStack[pendingStack.length - 1];
  // resolve paths from proxies or strings
  const resolve = (p: any) =>
    typeof p === "string" ? p : getProxyPath(p)?.join(".") || "";
  // read raw value
  const getRaw = (path: string) =>
    path.split(".").reduce((o, k) => o?.[k], rawState);
  const setRaw = (path: string, val: any) => {
    const parts = path.split(".");
    const last = parts.pop()!;
    const obj = parts.reduce((o, k) => o[k], rawState);
    obj[last] = val;
  };

  function createReactiveProxy<T extends object>(
    target: T,
    parentFullPath: string = ""
  ): T {
    // если не объект или null — возвращаем “как есть”
    if (typeof target !== "object" || target === null) return target;

    // попробуем взять уже созданный прокси из кэша
    let pathMap = proxyCache.get(target);
    if (!pathMap) {
      pathMap = new Map();
      proxyCache.set(target, pathMap);
    } else if (pathMap.has(parentFullPath)) {
      return pathMap.get(parentFullPath);
    }

    // создаём новый прокси, “захватив” parentFullPath в замыкании
    const proxy = new Proxy(target, {
      get(target, prop, receiver) {
        const key = propToString(prop);
        const fullPath = parentFullPath ? `${parentFullPath}.${key}` : key;

        // трекинг зависимости текущего подписчика
        currentSubscriberMeta?.trackedPaths.add(fullPath);

        // если сейчас в режиме batch и есть отложенное значение — возвращаем его
        if (batching && currentPending()?.has(fullPath)) {
          return currentPending()!.get(fullPath);
        }

        // читаем “сырое” значение
        const rawValue = Reflect.get(target, prop, receiver);

        // защита от циклических ссылок
        if (rawValue === target) return receiver;

        // если это вложенный объект — рекурсивно проксируем
        if (rawValue !== null && typeof rawValue === "object") {
          return createReactiveProxy(rawValue, fullPath);
        }

        return rawValue;
      },

      set(target, prop, value, receiver) {
        const key = propToString(prop);
        const fullPath = parentFullPath ? `${parentFullPath}.${key}` : key;

        // оптимизация: если значение не изменилось — выходим
        const oldValue = Reflect.get(target, prop, receiver);
        if (Object.is(oldValue, value)) return true;
        if (batching) {
          currentPending()!.set(fullPath, value);
        } else {
          doUpdate(fullPath, value);
        }
        return true;
      },

      deleteProperty(target, prop) {
        const key = propToString(prop);
        const fullPath = parentFullPath ? `${parentFullPath}.${key}` : key;

        const success = Reflect.deleteProperty(target, prop);
        if (success) store.update(fullPath, undefined);
        return success;
      },

      ownKeys(target) {
        // при итерации по ключам тоже трекингим все вложенные пути
        if (currentSubscriberMeta) {
          const prefix = parentFullPath ? `${parentFullPath}.` : "";
          for (const key of Reflect.ownKeys(target)) {
            currentSubscriberMeta.trackedPaths.add(
              `${prefix}${propToString(key)}`
            );
          }
        }
        return Reflect.ownKeys(target);
      },
    });

    // сохраняем в кэше и возвращаем
    pathMap.set(parentFullPath, proxy);
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
  store.$ = $;
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
  }
  const notifyPath = (path: string, val: any) =>
    pathSubscribers.get(path)?.forEach((cb) => cb(val));

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
    notifyPath(path, newVal);
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
        notifyPath(path, value);
        changedPaths.push(path);
      }
    }

    if (changedPaths.length) {
      subscribers.forEach((sub) => sub(stateProxy));
    }
  }

  store.resolveValue = (pathProxy, valueOrFn) => {
    validatePath(pathProxy);
    const path = resolve(pathProxy);
    const old = getRaw(path);
    return typeof valueOrFn === "function"
      ? (valueOrFn as (cur: any) => any)(old)
      : valueOrFn;
  };
  // API methods
  store.update = (pathProxy: any, valueOrFn: any) => {
    validatePath(pathProxy);
    const path = resolve(pathProxy);
    const newVal = store.resolveValue(pathProxy, valueOrFn);

    if (batching) {
      currentPending()!.set(path, newVal);
    } else {
      doUpdate(path, newVal);
    }
  };

  store.asyncUpdate = async (
    pathProxy: any,
    updater: (cur: any, signal: AbortSignal) => Promise<any>,
    options: { abortPrevious?: boolean } = { abortPrevious: false }
  ) => {
    validatePath(pathProxy);
    const pathStr = resolve(pathProxy);
    if (options.abortPrevious) {
      const prev = aborters.get(pathStr);
      if (prev) {
        prev.abort();
        aborters.delete(pathStr);
      }
    }
    const ctrl = new AbortController();
    ctrl.signal.addEventListener(
      "abort",
      () => {
        aborters.delete(pathStr);
      },
      { once: true }
    );
    aborters.set(pathStr, ctrl);
    try {
      const old = getRaw(pathStr);
      const res = await updater(old, ctrl.signal);
      if (!ctrl.signal.aborted) {
        store.update(getProxyFromStringPath(pathStr), res);
      }
    } catch (e) {
      if ((e as any).name !== "AbortError") console.error(e);
    } finally {
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

  store.subscribe = (cb: Subscriber<T>, keys?: CacheKey<T>[]) => {
    const normKeys = keys
      ? new Set(keys.map((k) => normalizeCacheKey(k, store)))
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
    pathProxy,
    cb: Subscriber<any>,
    opts: { immediate?: boolean } = {}
  ) => {
    validatePath(pathProxy);
    const { immediate = false } = opts;
    const path = resolve(pathProxy);
    const wrap = (v: any) => cb(v);

    const meta: SubscriptionMeta = (wrap as any).__meta || {
      active: true,
      trackedPaths: new Set(),
    };
    meta.trackedPaths.add(path);
    (wrap as any).__meta = meta;

    if (!pathSubscribers.has(path)) pathSubscribers.set(path, new Set());
    pathSubscribers.get(path)!.add(wrap);
    if (immediate) wrap(getRaw(path));
    return () => {
      pathSubscribers.get(path)!.delete(wrap);
      historyMgr.clear(path);
    };
  };

  store.invalidate = (keyProxy: any) => {
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

  store.get = (p: any) => {
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

  return store as ObservableStore<T>;
}
