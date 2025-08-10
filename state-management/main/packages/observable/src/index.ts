//index.ts
import {
  Middleware,
  Subscriber,
  PathOrAccessor,
  ObservableStore,
  SubscriptionMeta,
  Accessor,
  MetaData,
  PathLimitEntry,
  ValueOrFn,
  ExtractPathReturn,
} from './types';
import {
  normalizeCacheKey,
  shallowEqual,
  splitPath,
  getStringPath,
  validatePath,
  isArrayMethod,
  getMetaData,
  setMetaData,
  withMetaSupport,
  calculateSnapshotHash,
  detRandomId,
} from './utils';

class HistoryManager<T extends object, D extends number = 0> {
  private undoStack = new Map<string, any[]>();
  private redoStack = new Map<string, any[]>();
  private perPathMaxLength: Map<string, number>;

  constructor(pathLimits: PathLimitEntry<T, D>[] = [], resolvePath: (path: string | Accessor<any>) => string) {
    this.perPathMaxLength = new Map();
    for (const [key, max] of pathLimits) {
      //@ts-expect-error
      const path = resolvePath(key);
      this.perPathMaxLength.set(path, max as any);
    }
  }

  private getMaxLength(path: string): number {
    return this.perPathMaxLength.get(path) ?? 0;
  }

  push(path: string, value: any) {
    if (!this.perPathMaxLength.get(path)) return;
    const undo = this.undoStack.get(path) ?? [];
    undo.push(value);

    const maxLength = this.getMaxLength(path);
    if (undo.length > maxLength) {
      undo.shift();
    }

    this.undoStack.set(path, undo);
    this.redoStack.set(path, []);
  }

  getUndo(path: string, step: number): any | undefined {
    const undo = this.undoStack.get(path) ?? [];
    if (step < 0 || step >= undo.length) return undefined;
    return undo[undo.length - 1 - step];
  }

  getRedo(path: string, step: number): any | undefined {
    const redo = this.redoStack.get(path) ?? [];
    if (step < 0 || step >= redo.length) return undefined;
    return redo[redo.length - 1 - step];
  }

  getHistory(path: string): { undo: any[]; redo: any[] } {
    const undo = this.undoStack.get(path) ?? [];
    const redo = this.redoStack.get(path) ?? [];
    return {
      undo: [...undo],
      redo: [...redo],
    };
  }

  undo(path: string): any | undefined {
    const undo = this.undoStack.get(path) ?? [];
    const redo = this.redoStack.get(path) ?? [];

    if (undo.length <= 1) return undefined;

    const current = undo.pop()!;
    redo.push(current);

    this.undoStack.set(path, undo);
    this.redoStack.set(path, redo);

    return undo[undo.length - 1];
  }

  redo(path: string): any | undefined {
    const undo = this.undoStack.get(path) ?? [];
    const redo = this.redoStack.get(path) ?? [];

    if (redo.length === 0) return undefined;

    const value = redo.pop()!;
    undo.push(value);

    this.undoStack.set(path, undo);
    this.redoStack.set(path, redo);

    return value;
  }

  getCurrent(path: string): any | undefined {
    const undo = this.undoStack.get(path) ?? [];
    return undo[undo.length - 1];
  }

  clear(path: string) {
    this.undoStack.delete(path);
    this.redoStack.delete(path);
  }

  pruneUnused(usedPaths: Set<string>) {
    for (const path of [...this.undoStack.keys()]) {
      if (!usedPaths.has(path)) {
        this.clear(path);
      }
    }
  }

  getEntries() {
    return Array.from(this.undoStack.entries()).map(([path, stack]) => {
      const redo = this.redoStack.get(path) ?? [];
      return {
        path,
        current: stack[stack.length - 1],
        undoLength: stack.length,
        redoLength: redo.length,
        undo: stack,
        redo: redo,
        maxLength: this.getMaxLength(path),
      };
    });
  }
}

export function createObservableStore<T extends object, D extends number = 0>(
  initialState: T,
  middlewares: Middleware<T, D>[] = [],
  options: {
    customLimitsHistory?: PathLimitEntry<T, D>[];
  } = {}
): ObservableStore<T, D> {
  let rawState: T = { ...initialState };

  let batching = false;
  let modeBatching: 'proxy' | 'user' = 'user';
  let currentSubscriberMeta: SubscriptionMeta | null = null;

  const metaMap = new WeakMap<object, MetaData>();
  const pendingStack: Map<string, any>[] = [];
  const subscribers = new Set<Subscriber<T>>();
  const pathSubscribers = new Map<string, Set<Subscriber<T>>>();
  const aborters = new Map<string, AbortController>();
  const batchedInvalidations = new Set<string>();
  const debounceTimers = new Map<string, NodeJS.Timeout>();

  const currentPending = () => pendingStack[pendingStack.length - 1];

  const getRaw = (path: string) => {
    const segments = splitPath(path);
    return segments.reduce((o: any, k) => {
      if (o == null) return undefined;
      return o[k as keyof typeof o];
    }, rawState as any);
  };

  const setRaw = (path: string, val: any) => {
    const segments = splitPath(path);
    const lastKey = segments.pop()!;
    const parentObj = segments.reduce((o: any, k) => {
      if (o == null) throw new Error(`Невозможно установить по пути "${path}" — промежуточное значение undefined`);
      return o[k as keyof typeof o];
    }, rawState as any);
    parentObj[lastKey as keyof typeof parentObj] = val;
  };

  let currentArrayMethod: { name: string } | null = null;

  function createReactiveProxy<T extends object>(target: T, parentFullPath: string = ''): T {
    if (typeof target !== 'object' || target === null) return target;

    const proxy = new Proxy(target, {
      get(target, prop, receiver) {
        const key = typeof prop === 'string' ? prop : String(prop);
        const fullPath = parentFullPath ? `${parentFullPath}.${key}` : key;

        currentSubscriberMeta?.trackedPaths.add(fullPath);

        const rawValue = Reflect.get(target, prop, receiver);

        if (Array.isArray(target) && typeof rawValue === 'function' && isArrayMethod(key)) {
          return (...args: any[]) => {
            currentArrayMethod = { name: key };
            let result: any;
            modeBatching = 'proxy';
            store.batch(() => {
              result = rawValue.apply(receiver, args);
            });

            if (batching && parentFullPath) {
              batchedInvalidations.add(parentFullPath);
            } else if (parentFullPath) {
              store.invalidate(parentFullPath);
            }

            currentArrayMethod = null;
            return result;
          };
        }

        if (rawValue === target) return receiver;

        if (rawValue !== null && typeof rawValue === 'object') {
          return createReactiveProxy(rawValue, fullPath);
        }

        return rawValue;
      },

      set(target, prop, value, receiver) {
        const key = typeof prop === 'string' ? prop : String(prop);
        const fullPath = parentFullPath ? `${parentFullPath}.${key}` : key;

        const oldValue = Reflect.get(target, prop, receiver);

        if (Object.is(oldValue, value)) return true;
        if (batching) {
          currentPending()!.set(fullPath, value);
        } else {
          store.update(fullPath, value);

          if (!currentArrayMethod && parentFullPath) {
            store.invalidate(parentFullPath);
          }
        }

        return true;
      },

      deleteProperty(target, prop) {
        const key = typeof prop === 'string' ? prop : String(prop);
        const fullPath = parentFullPath ? `${parentFullPath}.${key}` : key;

        const success = Reflect.deleteProperty(target, prop);
        if (success) store.update(fullPath, undefined);
        return success;
      },

      ownKeys(target) {
        if (currentSubscriberMeta) {
          const prefix = parentFullPath ? `${parentFullPath}.` : '';
          for (const key of Reflect.ownKeys(target)) {
            currentSubscriberMeta.trackedPaths.add(`${prefix}${String(key)}`);
          }
        }
        return Reflect.ownKeys(target);
      },
    });

    return proxy;
  }
  function shouldSkipValueUpdate(oldVal: any, newVal: any, metaMap: WeakMap<object, MetaData>) {
    let skipUpdate = false;

    const isSupported = withMetaSupport(newVal, () => {
      const meta = getMetaData(metaMap, newVal);
      const prevSig = meta?._prevSignature;
      const currentSig = calculateSnapshotHash(newVal);

      if (prevSig && currentSig && prevSig === currentSig) {
        skipUpdate = true;
        return true;
      }

      if (currentSig) {
        setMetaData(metaMap, newVal, { _prevSignature: currentSig });
      }

      return true;
    });

    return {
      bool: skipUpdate || (!isSupported && shallowEqual(oldVal, newVal)),
      isSupportedMetaData: isSupported,
    };
  }

  const store: any = {};
  const stateProxy = createReactiveProxy(rawState);
  Object.defineProperty(store, '$', {
    get: () => stateProxy as T,
    enumerable: true,
    configurable: true,
  });

  const resolve = (p: string | Accessor<any>) => getStringPath(store?.$, p);
  const historyMgr = new HistoryManager<T, D>(options?.customLimitsHistory ?? [], resolve);

  function notifyInvalidate(normalizedKey: string) {
    subscribers.forEach((sub) => {
      const meta: SubscriptionMeta = (sub as any).__meta;
      const condition = batching
        ? meta.cacheKeys && meta.cacheKeys.has(normalizedKey)
        : !meta.cacheKeys || meta.cacheKeys.has(normalizedKey);
      if (condition) {
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

  store.clearHistoryPath = (pathOrAccessor) => {
    const mainPath = resolve(pathOrAccessor);
    historyMgr.clear(mainPath);
  };

  store.clearAllHistory = () => {
    const used = new Set<string>(pathSubscribers.keys());
    historyMgr.pruneUnused(used);
  };

  const doUpdate = (path: string, newVal: any, skipHistory = false, keepQuiet = false) => {
    const oldVal = getRaw(path);
    const isSkipUpdate = shouldSkipValueUpdate(oldVal, newVal, metaMap);
    if (isSkipUpdate.bool) return;

    if (!skipHistory) {
      if (isSkipUpdate.isSupportedMetaData && newVal !== oldVal) {
        historyMgr.push(path, newVal);
      }
      if (!isSkipUpdate.isSupportedMetaData) {
        historyMgr.push(path, newVal);
      }
    }

    setRaw(path, newVal);
    if (keepQuiet) return;
    notifyInvalidate(path);
  };

  store.update = (pathOrAccessor, valueOrFn, options) => {
    validatePath(pathOrAccessor);
    const path = resolve(pathOrAccessor);
    let newVal = store.resolveValue(pathOrAccessor, valueOrFn);

    if (batching && !options?.keepQuiet) {
      currentPending()!.set(path, newVal);
    } else {
      doUpdate(path, newVal, false, options?.keepQuiet);
    }
  };

  store.update.quiet = (pathOrAccessor, valueOrFn) => {
    store.update(pathOrAccessor, valueOrFn, { keepQuiet: true });
  };

  store.debounced = (callback: (...args: any[]) => void, delay: number): ((...args: any[]) => void) => {
    const debounceId = detRandomId();
    let timer: NodeJS.Timeout | null = null;
    const debouncedFn = (...args: any[]) => {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        callback(...args);
        debounceTimers.delete(debounceId);
      }, delay);
      debounceTimers.set(debounceId, timer);
    };

    debouncedFn.cancel = () => {
      if (timer) {
        clearTimeout(timer);
        debounceTimers.delete(debounceId);
      }
    };

    return debouncedFn;
  };

  function commit(pending: Map<string, any>) {
    const changedPaths: string[] = [];

    for (const [path, value] of pending) {
      const oldVal = getRaw(path);
      const isSkipUpdate = shouldSkipValueUpdate(oldVal, value, metaMap);
      if (isSkipUpdate.bool) continue;

      if (modeBatching === 'user') {
        historyMgr.push(path, oldVal);
      }

      setRaw(path, value);
      notifyInvalidate(path);
      changedPaths.push(path);
    }

    if (changedPaths.length) {
      subscribers.forEach((sub) => {
        const meta: SubscriptionMeta = (sub as any).__meta;
        if (!meta.cacheKeys) sub(stateProxy);
      });
    }
  }

  store.resolveValue = (pathOrAccessor, valueOrFn) => {
    const path = resolve(pathOrAccessor);
    const old = getRaw(path);

    const newVal = typeof valueOrFn === 'function' ? valueOrFn(old) : valueOrFn;

    withMetaSupport(newVal, () => {
      const snapshot = calculateSnapshotHash(old);
      if (snapshot) return;
      setMetaData(metaMap, newVal, {
        _prevSignature: snapshot,
      });
    });

    return newVal;
  };

  store.asyncUpdate = async (
    pathOrAccessor: string | (() => any),
    updater: (cur: any, signal: AbortSignal) => Promise<any>,
    options: { abortPrevious?: boolean; keepQuiet: boolean }
  ) => {
    const { abortPrevious = false, keepQuiet = false } = options ?? {};
    validatePath(pathOrAccessor);
    const pathStr = resolve(pathOrAccessor);
    if (abortPrevious) {
      const prevCtrl = aborters.get(pathStr);
      if (prevCtrl) {
        prevCtrl.abort();
        aborters.delete(pathStr);
      }
    }
    const ctrl = new AbortController();
    ctrl.signal.addEventListener(
      'abort',
      () => {
        aborters.delete(pathStr);
      },
      { once: true }
    );
    aborters.set(pathStr, ctrl);

    try {
      const oldValue = getRaw(pathStr);
      const newValue = await updater(oldValue, ctrl.signal);

      if (!ctrl.signal.aborted) {
        store.update(pathStr, newValue, { keepQuiet: keepQuiet });
      }
    } catch (e) {
      if ((e as any).name !== 'AbortError') {
        console.error(e);
      }
    } finally {
      aborters.delete(pathStr);
    }
  };

  store.asyncUpdate.quiet = async (
    pathOrAccessor: string | (() => any),
    updater: (cur: any, signal: AbortSignal) => Promise<any>,
    options: { abortPrevious?: boolean } = {}
  ) => {
    return store.asyncUpdate(pathOrAccessor, updater, {
      abortPrevious: options.abortPrevious ?? false,
      keepQuiet: true,
    });
  };

  store.batch = (fn: () => void) => {
    pendingStack.push(new Map());
    batching = true;

    try {
      fn();
    } finally {
      const myPending = pendingStack.pop()!;
      if (pendingStack.length > 0) {
        const parent = currentPending()!;
        for (const [path, val] of myPending) {
          parent.set(path, val);
        }
      } else {
        commit(myPending);
        batching = false;
        modeBatching = 'user';
        for (const path of batchedInvalidations) {
          store.invalidate(path);
        }
        batchedInvalidations.clear();
      }
    }
    return Promise.resolve();
  };

  store.getUndo = (p, step) => {
    validatePath(p);
    const path = resolve(p);
    return historyMgr.getUndo(path, step);
  };

  store.getRedo = (p, step) => {
    validatePath(p);
    const path = resolve(p);
    return historyMgr.getRedo(path, step);
  };

  store.getHistory = (p) => {
    validatePath(p);
    const path = resolve(p);
    return historyMgr.getHistory(path);
  };

  store.undo = (p) => {
    validatePath(p);
    const path = resolve(p);
    const prevValue = historyMgr.undo(path);
    if (prevValue !== undefined) {
      doUpdate(path, prevValue, true);
      store.update(path, prevValue, { skipHistory: true, keepQuiet: true });
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
      doUpdate(path, nextValue, true);
      store.update(path, nextValue, { skipHistory: true, keepQuiet: true });
      return true;
    }

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
    };
  };

  store.subscribeToPath = (
    pathOrAccessor,
    cb,
    opts: {
      immediate?: boolean;
      cacheKeys?: readonly PathOrAccessor<T, D>[];
    } = {}
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
      cacheKeys: normalizedKeys.length > 0 ? new Set(normalizedKeys) : undefined,
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
    debounceTimers.forEach((timer) => clearTimeout(timer));
    debounceTimers.clear();
    store.clearAllHistory();
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
    debounceTimersCount: debounceTimers.size,
  });

  let wrappedUpdate = store.update;
  middlewares.reverse().forEach((mw) => {
    wrappedUpdate = mw(store, wrappedUpdate);
  });
  store.update = wrappedUpdate;

  return store as ObservableStore<T, D>;
}