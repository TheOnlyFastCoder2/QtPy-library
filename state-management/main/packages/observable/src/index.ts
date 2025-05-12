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
    if (idx + 1 < hist.length) hist.splice(idx + 1);
    hist.push(prevValue);
    if (hist.length > this.maxLength) hist.shift();
    idx = hist.length - 1;
    this.history.set(path, hist);
    this.index.set(path, idx);
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
  options: { maxHistoryLength?: number; cleanupInterval?: number } = {}
): ObservableStore<T> {
  const { maxHistoryLength = Infinity, cleanupInterval = 5000 } = options;
  let rawState = { ...initialState };

  // === Batching infrastructure ===
  let batching = false;
  const pendingStack: Map<string, any>[] = [];

  const subscribers = new Set<Subscriber<T>>();
  const pathSubscribers = new Map<string, Set<Subscriber<any>>>();
  const aborters = new Map<string, AbortController>();

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

  // Core update logic extracted for reuse
  function commit(pending: Map<string, any>) {
    for (const [path, value] of pending) {
      const oldVal = getRaw(path);
      if (!shallowEqual(oldVal, value)) {
        historyMgr.push(path, oldVal);
        setRaw(path, value);
        notifyPath(path, value);
        notifyInvalidate(path);
      }
    }
  }
  // create reactive proxy for direct assignment
  function createReactiveProxy(obj: any, basePath = ""): any {
    return new Proxy(obj, {
      get(target, prop) {
        const key = String(prop);
        const fullPath = basePath ? `${basePath}.${key}` : key;

        if (batching && currentPending()?.has(fullPath)) {
          return currentPending()!.get(fullPath);
        }

        const cur = getRaw(fullPath);
        return cur !== null && typeof cur === "object"
          ? createReactiveProxy(cur, fullPath)
          : cur;
      },
      set(_, prop, value) {
        const key = String(prop);
        const fullPath = basePath ? `${basePath}.${key}` : key;
        if (batching) {
          currentPending()!.set(fullPath, value);
        } else {
          store.update(getProxyFromStringPath(fullPath), value);
        }
        return true;
      },
    });
  }

  // placeholder for store
  const store: any = {};
  const stateProxy = createReactiveProxy(rawState);
  Object.defineProperty(store, "state", { get: () => stateProxy });
  store.$ = $;
  // notification: global subscribers filtered by cacheKeys
  function notifyInvalidate(normalizedKey: string) {
    subscribers.forEach((sub) => {
      const meta: SubscriptionMeta = (sub as any).__meta;
      if (!meta.cacheKeys || meta.cacheKeys.has(normalizedKey)) sub(stateProxy);
    });
  }
  const notifyPath = (path: string, val: any) =>
    pathSubscribers.get(path)?.forEach((cb) => cb(val));

  // core update logic
  const doUpdate = (path: string, newVal: any) => {
    const oldVal = getRaw(path);
    if (shallowEqual(oldVal, newVal)) return;
    historyMgr.push(path, oldVal);
    setRaw(path, newVal);
    notifyPath(path, newVal);
    notifyInvalidate(path);
  };

  // cleanup unused history periodically
  function performCleanup() {
    const used = new Set<string>(pathSubscribers.keys());
    historyMgr.pruneUnused(used);
  }
  if (cleanupInterval) {
    setInterval(performCleanup, cleanupInterval);
  }

  // API methods
  store.update = (pathProxy: any, value: any) => {
    validatePath(pathProxy);
    const path = resolve(pathProxy);
    const old = getRaw(path);
    const newVal = typeof value === "function" ? (value as any)(old) : value;
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
      aborters.get(pathStr)?.abort();
    }
    const ctrl = new AbortController();
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
    const v = historyMgr.undo(path);
    if (v !== undefined) doUpdate(path, v);
  };
  store.redo = (p) => {
    validatePath(p);
    const path = resolve(p);
    const v = historyMgr.redo(path);
    if (v !== undefined) doUpdate(path, v);
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
    if (!pathSubscribers.has(path)) pathSubscribers.set(path, new Set());
    pathSubscribers.get(path)!.add(wrap);
    if (immediate) wrap(getRaw(path));
    return () => pathSubscribers.get(path)!.delete(wrap);
  };

  store.invalidate = (keyProxy: any) => {
    const key = resolve(keyProxy);
    notifyInvalidate(key);
  };

  store.cancelAsyncUpdates = (p?: any) => {
    if (p) aborters.get(resolve(p))?.abort();
    else aborters.forEach((c) => c.abort());
  };

  store.clearStore = () => {
    subscribers.clear();
    pathSubscribers.clear();
    aborters.clear();
  };

  store.get = (p: any) => {
    validatePath(p);
    return getRaw(resolve(p));
  };

  store.resolvePath = resolve;
  store.manualCleanup = performCleanup;
  store.getMemoryStats = () => ({
    subscribersCount: subscribers.size,
    pathSubscribersCount: pathSubscribers.size,
    historyEntries: historyMgr.getEntries(),
    activePathsCount: pathSubscribers.size,
  });

  // apply middlewares
  let upd = store.update;
  middlewares.reverse().forEach((mw) => {
    upd = mw(store, upd);
  });
  store.update = upd;

  return store as ObservableStore<T>;
}
