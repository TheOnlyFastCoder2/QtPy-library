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
  SSRStore,
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
  getRandomId,
  ssrStore,
  iterateObjectTree,
  isPathValid,
  getByPath,
  wrapNode,
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

  private spliceStack(sourceStack: any[], targetStack: any[], spliceIndices?: [number, number]): any | undefined {
    if (spliceIndices) {
      const [start, deleteCount] = spliceIndices;
      if (start < 0 || start >= sourceStack.length || deleteCount <= 0) {
        return undefined;
      }
      const removed = sourceStack.splice(start, deleteCount);
      targetStack.push(...removed);
      return removed[removed.length - 1];
    }
    return undefined;
  }

  undo(path: string, spliceIndices?: [number, number]): any | undefined {
    const undo = this.undoStack.get(path as string) ?? [];
    const redo = this.redoStack.get(path as string) ?? [];

    if (undo.length <= 1 && !spliceIndices) return undefined;

    if (spliceIndices) {
      const result = this.spliceStack(undo, redo, spliceIndices);
      this.undoStack.set(path as string, undo);
      this.redoStack.set(path as string, redo);
      return result ?? (undo.length > 0 ? undo[undo.length - 1] : undefined);
    }

    const current = undo.pop()!;
    redo.push(current);

    this.undoStack.set(path as string, undo);
    this.redoStack.set(path as string, redo);

    return undo[undo.length - 1];
  }

  redo(path: string, spliceIndices?: [number, number]): any | undefined {
    const undo = this.undoStack.get(path as string) ?? [];
    const redo = this.redoStack.get(path as string) ?? [];

    if (redo.length === 0 && !spliceIndices) return undefined;

    if (spliceIndices) {
      const result = this.spliceStack(redo, undo, spliceIndices);
      this.undoStack.set(path as string, undo);
      this.redoStack.set(path as string, redo);
      return result;
    }

    const value = redo.pop()!;
    undo.push(value);

    this.undoStack.set(path as string, undo);
    this.redoStack.set(path as string, redo);

    return value;
  }

  getCurrent(path: string): any | undefined {
    const undo = this.undoStack.get(path) ?? [];
    return undo[undo.length - 1];
  }

  clear(path: string, mode: 'redo' | 'undo' | 'all' = 'all', spliceIndices?: [number, number]) {
    const undo = this.undoStack.get(path as string) ?? [];
    const redo = this.redoStack.get(path as string) ?? [];

    if (spliceIndices) {
      const [start, deleteCount] = spliceIndices;
      if (start < 0 || start >= (mode === 'redo' ? redo : undo).length || deleteCount <= 0) {
        return false;
      }
      if (mode === 'redo') {
        redo.splice(start, deleteCount);
        this.redoStack.set(path as string, redo);
        return true;
      } else if (mode === 'undo') {
        undo.splice(start, deleteCount);
        this.undoStack.set(path as string, undo);
        return true;
      } else if (mode === 'all') {
        const undoChanged = undo.length > 0 && start >= 0 && start < undo.length && deleteCount > 0;
        const redoChanged = redo.length > 0 && start >= 0 && start < redo.length && deleteCount > 0;
        if (undoChanged) undo.splice(start, deleteCount);
        if (redoChanged) redo.splice(start, deleteCount);
        this.undoStack.set(path as string, undo);
        this.redoStack.set(path as string, redo);
        return undoChanged || redoChanged;
      }
    }

    switch (mode) {
      case 'redo':
        return this.redoStack.delete(path as string);
      case 'undo':
        return this.undoStack.delete(path as string);
      default:
        const undoDeleted = this.undoStack.delete(path as string);
        const redoDeleted = this.redoStack.delete(path as string);
        return undoDeleted || redoDeleted;
    }
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
  middlewares: Middleware<T, D>[],
  options: { ssrStoreId?: string; customLimitsHistory?: PathLimitEntry<T, D>[] }
): SSRStore<T, D>;

export function createObservableStore<T extends object, D extends number = 0>(
  initialState: T,
  middlewares?: Middleware<T, D>[],
  options?: { ssrStoreId?: undefined; customLimitsHistory?: PathLimitEntry<T, D>[] }
): ObservableStore<T, D>;

export function createObservableStore<T extends object, D extends number = 0>(
  initialState: T,
  middlewares: Middleware<T, D>[] = [],
  options: {
    customLimitsHistory?: PathLimitEntry<T, D>[];
    ssrStoreId?: string;
  } = {}
): ObservableStore<T, D> | SSRStore<T, D> {
  let rawState: T = { ...initialState };

  let currentSubscriberMeta: SubscriptionMeta | null = null;

  const batchingStack = new Map<string, { modeBatching: 'proxy' | 'user'; pending: Map<string, any> }>();

  const metaMap = new WeakMap<object, MetaData>();
  const primitiveMetaMap = new Map<string, MetaData>();

  const subscribers = new Set<Subscriber<T>>();
  const pathSubscribers = new Map<string, Set<Subscriber<T>>>();
  const aborters = new Map<string, AbortController>();
  const batchedInvalidations = new Set<string>();
  const debounceTimers = new Map<string, NodeJS.Timeout>();

  const getCurrentBatch = () => {
    if (batchingStack.size === 0) return null;
    const lastKey = Array.from(batchingStack.keys()).pop()!;
    return batchingStack.get(lastKey)!;
  };

  const getIsBatching = () => {
    return batchingStack.size !== 0;
  };

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

    for (const { node, path, parent, key } of iterateObjectTree(target)) {
      withMetaSupport(node, () => {
        const snapshot = calculateSnapshotHash(node);
        if (!snapshot) return;
        const wrapped = wrapNode(node, parent, key, metaMap);
        setMetaData(metaMap, wrapped, { _prevSignature: snapshot }, primitiveMetaMap, path);
      });
    }
    const proxy = new Proxy(target, {
      get(target, prop, receiver) {
        const key = typeof prop === 'string' ? prop : String(prop);
        const fullPath = parentFullPath ? `${parentFullPath}.${key}` : key;

        currentSubscriberMeta?.trackedPaths.add(fullPath);

        const rawValue = Reflect.get(target, prop, receiver);

        if (Array.isArray(target) && typeof rawValue === 'function' && isArrayMethod(key)) {
          return (...args: any[]) => {
            currentArrayMethod = { name: key };
            const currentBatch = getCurrentBatch();

            let result: any;
            store.batch(() => {
              result = rawValue.apply(receiver, args);
            }, 'proxy');

            if (currentBatch && currentBatch.modeBatching === 'proxy' && parentFullPath) {
              batchedInvalidations.add(parentFullPath);
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
        const currentBatch = getCurrentBatch();

        const key = typeof prop === 'string' ? prop : String(prop);
        const fullPath = parentFullPath ? `${parentFullPath}.${key}` : key;

        const oldValue = Reflect.get(target, prop, receiver);

        if (Object.is(oldValue, value)) return true;
        if (currentBatch && currentBatch.modeBatching === 'proxy') {
          currentBatch?.pending.set(fullPath, value);
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
  function shouldSkipValueUpdate(
    oldVal: any,
    newVal: any,
    metaMap: WeakMap<object, MetaData>,
    path: string,
    isSetMetaData = true
  ) {
    let skipUpdate = false;

    const isSupported = withMetaSupport(newVal, () => {
      const meta = getMetaData(metaMap, oldVal, primitiveMetaMap, path);
      const prevSig = meta?._prevSignature;
      const currentSig = calculateSnapshotHash(newVal);
      // console.log(prevSig, currentSig);
      if (prevSig === currentSig) {
        skipUpdate = true;
        return true;
      }

      if (currentSig && isSetMetaData) {
        setMetaData(metaMap, newVal, { _prevSignature: currentSig }, primitiveMetaMap, path);
      }
      return true;
    });
    // console.log(oldVal, newVal)
    return {
      newVal,
      oldVal,
      bool: skipUpdate || (!isSupported && shallowEqual(oldVal, newVal)),
      isSupportedMetaData: isSupported,
      skipUpdate: skipUpdate,
    };
  }

  const store: any = {};
  let stateProxy = createReactiveProxy(rawState);
  Object.defineProperty(store, '$', {
    get: () => stateProxy as T,
    enumerable: true,
    configurable: true,
  });

  const resolve = (p: string | Accessor<any>) => getStringPath(store?.$, p);
  const historyMgr = new HistoryManager<T, D>(options?.customLimitsHistory ?? [], resolve);
  const processedPaths: Set<string> = new Set<string>();

  function collectSubscribedPaths<T>(
    pathSubscribers: Map<string, Set<Subscriber<T>>>,
    subscribers: Set<Subscriber<T>>
  ): Set<string> {
    const allSubscribedPaths = new Set<string>();
    pathSubscribers.forEach((_, path) => {
      allSubscribedPaths.add(path);
    });
    options?.customLimitsHistory?.forEach(([path]) => {
      const _path = store.resolvePath(path);
      allSubscribedPaths.add(_path);
    });
    subscribers.forEach((sub) => {
      const meta: SubscriptionMeta = (sub as any).__meta;
      if (meta?.trackedPaths) {
        meta.trackedPaths.forEach((path) => allSubscribedPaths.add(path));
      }
    });
    return allSubscribedPaths;
  }

  function processSubscribedPath(normalizedKey: string, newValue: any, oldValue: any, allSubscribedPaths: Set<string>) {
    const prefix = normalizedKey ? `${normalizedKey}.` : '';

    for (const childPath of allSubscribedPaths) {
      if (!childPath.startsWith(prefix)) continue;
      if (processedPaths.has(childPath)) continue;
      const rel = childPath.slice(prefix.length);
      const oldChild = getByPath(oldValue, rel);
      const newChild = getByPath(newValue, rel);

      if (!shouldSkipValueUpdate(oldChild, newChild, metaMap, childPath, false).bool) {
        store.update(childPath, newChild, {
          skipHistory: false,
          keepQuiet: true,
          isRecurse: true,
          oldValue: oldChild,
          isAddMetaData: true,
        });
        processedPaths.add(childPath);
      }
    }
    if (!getIsBatching()) processedPaths.clear();
  }

  function processArraySubscriptions<T>(
    normalizedKey: string,
    newValue: any,
    oldValue: any,
    pathSubscribers: Map<string, Set<Subscriber<T>>>,
    allSubscribedPaths: Set<string>
  ) {
    withMetaSupport(newValue, () => {
      const validSubscribedPaths = new Set<string>();
      allSubscribedPaths.forEach((path) => {
        if (isPathValid(rawState, path)) {
          validSubscribedPaths.add(path);
        } else {
          pathSubscribers.delete(path);
        }
      });

      processSubscribedPath(normalizedKey, newValue, oldValue, validSubscribedPaths);
    });
  }
  function notifyInvalidate(normalizedKey: string, newValue?: any, oldValue?: any, isRecurse = false) {
    subscribers.forEach((sub) => {
      const meta: SubscriptionMeta = (sub as any).__meta;
      const condition = getIsBatching()
        ? meta.cacheKeys && meta.cacheKeys.has(normalizedKey)
        : !meta.cacheKeys || meta.cacheKeys.has(normalizedKey);
      if (condition) {
        currentSubscriberMeta = meta;
        try {
          sub(stateProxy, meta.unsubscribe);
        } finally {
          currentSubscriberMeta = null;
        }
      }
    });

    if (!processedPaths.has(normalizedKey)) {
      const pathSubs = pathSubscribers.get(normalizedKey);
      if (pathSubs) {
        pathSubs.forEach((sub) => {
          const meta: SubscriptionMeta = (sub as any).__meta;
          sub(newValue, meta.unsubscribe);
        });
        processedPaths.add(normalizedKey);
      }
    }

    if (isRecurse) return;
    const allSubscribedPaths = collectSubscribedPaths(pathSubscribers, subscribers);
    processArraySubscriptions(normalizedKey, newValue, oldValue, pathSubscribers, allSubscribedPaths);
  }

  store.clearHistoryPath = (
    pathOrAccessor,
    mode: 'redo' | 'undo' | 'all' = 'all',
    spliceIndices?: [number, number]
  ) => {
    const mainPath = resolve(pathOrAccessor);
    historyMgr.clear(mainPath, mode, spliceIndices);
  };

  store.clearAllHistory = () => {
    const used = new Set<string>(pathSubscribers.keys());
    historyMgr.pruneUnused(used);
  };

  const doUpdate = (
    path: string,
    newVal: any,
    skipHistory = false,
    keepQuiet = false,
    isRecurse: boolean = false,
    oldValue?: any
  ) => {
    const oldVal = oldValue ?? getRaw(path);
    const isSkipUpdate = shouldSkipValueUpdate(oldVal, newVal, metaMap, path);

    if (isRecurse) notifyInvalidate(path, newVal, oldVal, isRecurse);
    if (!skipHistory && !isSkipUpdate.bool) historyMgr.push(path, newVal);
    if (isRecurse) return;
    if (isSkipUpdate.bool) return;

    setRaw(path, newVal);
    if (keepQuiet) return;
    notifyInvalidate(path, newVal, oldVal, isRecurse);
  };

  store.update = (pathOrAccessor, valueOrFn, options) => {
    validatePath(pathOrAccessor);
    const currentBatch = getCurrentBatch();

    const path = resolve(pathOrAccessor);
    let newVal = store.resolveValue(pathOrAccessor, valueOrFn, options?.isAddMetaData);
    if (currentBatch && !options?.keepQuiet) {
      currentBatch.pending.set(path, newVal);
    } else {
      doUpdate(path, newVal, options?.skipHistory, options?.keepQuiet, options?.isRecurse, options?.oldValue);
      return newVal;
    }
  };

  store.update.quiet = (pathOrAccessor, valueOrFn) => {
    return store.update(pathOrAccessor, valueOrFn, { keepQuiet: true });
  };

  store.debounced = (callback: (...args: any[]) => void, delay: number): ((...args: any[]) => void) => {
    const debounceId = getRandomId();
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
      const isSkipUpdate = shouldSkipValueUpdate(oldVal, value, metaMap, path);
      const currentBatch = getCurrentBatch();

      if (isSkipUpdate.bool) continue;
      if (currentBatch?.modeBatching === 'user') {
        historyMgr.push(path, oldVal);
      }

      setRaw(path, value);
      notifyInvalidate(path, value, oldVal);
      changedPaths.push(path);
    }

    if (changedPaths.length) {
      subscribers.forEach((sub) => {
        const meta: SubscriptionMeta = (sub as any).__meta;
        if (!meta.cacheKeys) sub(store.getRawStore(), meta.unsubscribe);
      });
    }
  }
  function getPendingOrRaw(path: string) {
    const keys = Array.from(batchingStack.keys());
    for (let i = keys.length - 1; i >= 0; i--) {
      const batch = batchingStack.get(keys[i])!;
      if (batch.pending.has(path)) return batch.pending.get(path);
    }
    return getRaw(path);
  }
  store.resolveValue = (pathOrAccessor, valueOrFn, isAddMeta = false) => {
    const path = resolve(pathOrAccessor);
    const old = getPendingOrRaw(path); // ← заменили getRaw на getPendingOrRaw
    const newVal = typeof valueOrFn === 'function' ? valueOrFn(old) : valueOrFn;

    if (isAddMeta) {
      withMetaSupport(newVal, () => {
        for (const { node, parent, key } of iterateObjectTree(newVal)) {
          const snapshot = calculateSnapshotHash(node);
          if (!snapshot) break;
          const wrapped = wrapNode(node, parent, key, metaMap);
          setMetaData(metaMap, wrapped, { _prevSignature: snapshot }, primitiveMetaMap, path);
        }
      });
    }

    return newVal;
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
  store.isAborted = (p: any): boolean => {
    const key = resolve(p);
    const ctrl = aborters.get(key);
    return ctrl ? ctrl.signal.aborted : false;
  };

  store.asyncUpdate = async (
    pathOrAccessor: string | (() => any),
    updater: (cur: any, signal?: AbortSignal) => Promise<any>,
    options: { abortPrevious?: boolean; keepQuiet?: boolean } = {}
  ) => {
    const { abortPrevious = false, keepQuiet = false } = options;
    validatePath(pathOrAccessor);
    const pathStr = resolve(pathOrAccessor);

    if (abortPrevious) {
      store.cancelAsyncUpdates(pathStr);
    }

    let newValue;
    if (abortPrevious) {
      const ctrl = new AbortController();
      aborters.set(pathStr, ctrl);

      try {
        const oldValue = getRaw(pathStr);
        newValue = await updater(oldValue, ctrl.signal);
        store.update(pathStr, newValue, { keepQuiet });
        return newValue;
      } catch (e) {
        if ((e as any).name !== 'AbortError') {
          console.error(e);
        }
        throw e;
      } finally {
        aborters.delete(pathStr);
      }
    } else {
      try {
        const oldValue = getRaw(pathStr);
        newValue = await updater(oldValue);
        store.update(pathStr, newValue, { keepQuiet });
        return newValue;
      } catch (e) {
        console.error(e);
        throw e;
      }
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

  function startBatch(mode: 'proxy' | 'user' = 'user') {
    const key = getRandomId();
    batchingStack.set(key, { modeBatching: mode, pending: new Map() });
    return key;
  }
  function endBatch(key: string) {
    const batch = batchingStack.get(key);
    if (!batch) return;

    batchingStack.delete(key);

    if (batchingStack.size === 0) {
      commit(batch.pending);
      processedPaths.clear();
      for (const path of batchedInvalidations) {
        store.invalidate(path);
      }
      batchedInvalidations.clear();
    } else {
      const parentKey = Array.from(batchingStack.keys()).pop()!;
      const parent = batchingStack.get(parentKey)!;
      batch.pending.forEach((val, path) => parent.pending.set(path, val));
    }
  }

  store.batch = async (fn: () => void | Promise<void>, mode: 'proxy' | 'user' = 'user') => {
    const key = startBatch(mode);
    try {
      const result = fn();
      if (result instanceof Promise) {
        await result;
      }
    } finally {
      endBatch(key);
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

  store.undo = (p, spliceIndices) => {
    validatePath(p);
    const path = resolve(p);
    const prevValue = historyMgr.undo(path, spliceIndices);
    if (prevValue !== undefined) {
      doUpdate(path, prevValue, true);
      store.update(path, prevValue, { skipHistory: true, keepQuiet: true });
      return true;
    }
    console.warn(`No undo history for path: ${path}`);
    return false;
  };
  store.redo = (p: any, spliceIndices): boolean => {
    validatePath(p);
    const path = resolve(p);
    const nextValue = historyMgr.redo(path, spliceIndices);
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

    const wrap = (s: T, unsub: () => void) => {
      if (meta.active) cb(s, unsub);
    };

    const meta: SubscriptionMeta = {
      active: true,
      trackedPaths: new Set(),
      cacheKeys: normKeys,
      unsubscribe: () => {
        meta.active = false;
        subscribers.delete(wrap);
      },
    };

    (wrap as any).__meta = meta;
    subscribers.add(wrap);
    return meta.unsubscribe;
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

    const wrap = (val: any, unsub: () => void) => cb(val, unsub);

    const meta: SubscriptionMeta = {
      active: true,
      trackedPaths: new Set(allPaths),
      cacheKeys: normalizedKeys.length > 0 ? new Set(normalizedKeys) : undefined,
      unsubscribe: () => {
        allPaths.forEach((p) => {
          pathSubscribers.get(p)?.delete(wrap);
        });
      },
    };
    (wrap as any).__meta = meta;

    allPaths.forEach((p) => {
      if (!pathSubscribers.has(p)) {
        pathSubscribers.set(p, new Set());
      }
      pathSubscribers.get(p)!.add(wrap);
    });

    if (immediate) {
      wrap(getRaw(mainPath), meta.unsubscribe);
    }

    return meta.unsubscribe;
  };

  store.invalidateAll = () => {
    subscribers.forEach((sub) => {
      const meta: SubscriptionMeta = (sub as any).__meta;
      currentSubscriberMeta = meta;
      try {
        sub(stateProxy, meta.unsubscribe);
      } finally {
        currentSubscriberMeta = null;
      }
    });

    pathSubscribers.forEach((subs, path) => {
      const newVal = getRaw(path);
      subs.forEach((sub) => {
        const meta: SubscriptionMeta = (sub as any).__meta;
        sub(newVal, meta.unsubscribe);
      });
    });
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
  store.getRawStore = () => rawState;

  store.setRawStore = async (newState: T, options?: { keepQuiet?: boolean }) => {
    store.cancelAsyncUpdates();
    store.clearAllHistory();
    debounceTimers.forEach((timer) => clearTimeout(timer));
    debounceTimers.clear();
    rawState = { ...newState };
    stateProxy = createReactiveProxy(rawState);
    if (!options?.keepQuiet) {
      store.invalidateAll();
    }
  };

  store.getMemoryStats = () => ({
    subscribersCount: subscribers.size,
    pathSubscribersCount: pathSubscribers.size,
    historyEntries: historyMgr.getEntries(),
    activePathsCount: pathSubscribers.size,
    debounceTimersCount: debounceTimers.size,
    abortersCount: aborters.size,
  });

  let wrappedUpdate = store.update;
  middlewares.reverse().forEach((mw) => {
    wrappedUpdate = mw(store, wrappedUpdate);
  });
  store.update = wrappedUpdate;

  return options.ssrStoreId
    ? (ssrStore<T, D>(store, options.ssrStoreId) as SSRStore<T, D>)
    : (store as ObservableStore<T, D>);
}

const store = createObservableStore<{ counter: number; data: string }>({
  counter: 0,
  data: '',
});

let val;
val = await store.asyncUpdate('counter', async (prev) => {
  return prev + 1;
})

val = await store.asyncUpdate('counter', async (prev) => {
  return prev + 1;
})

setTimeout(() => { 
  store.asyncUpdate('counter', async (prev) => {
    return prev + 1;
  })

  store.asyncUpdate('counter', async (prev) => {
    return prev + 1;
  })
}, 100)
