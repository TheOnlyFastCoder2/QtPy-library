/**
 * Symbol used to brand the PathTracker type.
 */
const BRAND_SYMBOL = Symbol("__brand");

/**
 * Symbol representing the value type held by a PathTracker.
 */
const TYPE_SYMBOL = Symbol("__type");

/**
 * Symbol representing the path tuple of a PathTracker.
 */
const PATH_SYMBOL = Symbol("__path");

/**
 * Primitive value types supported by the store.
 */
export type Primitive = string | number | boolean | symbol | null | undefined;

/**
 * Cache key for filtering invalidation or subscriptions.
 * Can be a literal, selector function, or path tracker.
 * @template T - Root state type.
 */
export type CacheKey<T> =
  | string
  | number
  | boolean
  | null
  | undefined
  | ((store: T) => string)
  | PathTracker<any, any>;

/**
 * Callback invoked when a value changes.
 * @template T - Value type.
 * @param value - New value at the subscribed path or store.
 */
export type Subscriber<T> = (value: T) => void;

/**
 * Function to unsubscribe from updates.
 */
export type Unsubscribe = () => void;

/**
 * Internal function signature for applying updates.
 * @template T - Root state type.
 * @param path - Path or proxy identifying the property to update.
 * @param value - New value to set at the path.
 */
export type UpdateFunction<T> = (path: any, value: any) => void;

/**
 * Handler for path-based subscriptions.
 */
export type SubscriptionHandler = {
  /**
   * Callback invoked on value change.
   * @param value - New value at the subscribed path.
   */
  callback: (value: any) => void;
  /** Optional path string for path subscriptions. */
  path?: string;
};

/**
 * Middleware wrapping the store's update function.
 * @template T - Root state type.
 * @param store - Observable store instance.
 * @param next - Next update function in the middleware chain.
 * @returns Wrapped update function.
 */
export type Middleware<T> = (
  store: ObservableStore<T>,
  next: UpdateFunction<T>
) => UpdateFunction<T>;

/**
 * Proxy type for building and tracking state paths.
 * @template T - Subtree type.
 * @template Path - Accumulated key path as tuple.
 */
export type PathProxy<T, Path extends PropertyKey[] = []> = {
  [K in keyof T]-?: T[K] extends Primitive
    ? PathTracker<T[K], [...Path, K]>
    : PathProxy<T[K], [...Path, K]> & PathTracker<T[K], [...Path, K]>;
} & PathTracker<T, Path>;

/**
 * Memory usage statistics for the store.
 */
export type MemoryStats = {
  /** Number of global subscribers. */
  subscribersCount: number;
  /** Number of path-specific subscribers. */
  pathSubscribersCount: number;
  /** History entries per path. */
  historyEntries: Array<{ path: string; length: number }>;
  /** Count of active tracked paths. */
  activePathsCount: number;
};

/**
 * Metadata for active subscriptions.
 */
export type SubscriptionMeta = {
  /** Whether subscription is active. */
  active: boolean;
  /** Set of paths tracked by this subscription. */
  trackedPaths: Set<string>;
  /** Optional set of cache keys used for filtering. */
  cacheKeys?: Set<string>;
};

export interface PathNode {
  parent: PathNode | null;
  key: PropertyKey;
}

/**
 * Internal symbol-branded type for path tracking.
 * @template FinalType - Value type at path.
 * @template Path - Tuple of path segments.
 */
export type PathTracker<FinalType, Path extends PropertyKey[]> = {
  [BRAND_SYMBOL]: "PathTracker";
  [TYPE_SYMBOL]: FinalType;
  [PATH_SYMBOL]: PathNode;
};

/**
 * Union of all nested key strings for an object.
 * @template T - Object type.
 */
export type DeepKeyOf<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${K}` | `${K}.${DeepKeyOf<T[K]>}`
          : `${K}`
        : never;
    }[keyof T]
  : never;

/**
 * Lookup of a nested property type by its dot-path.
 * @template T - Object type.
 * @template K - Dot-separated key string.
 */
export type DeepType<T, K extends string> = K extends `${infer P}.${infer S}`
  ? P extends keyof T
    ? DeepType<T[P], S>
    : never
  : K extends keyof T
  ? T[K]
  : never;

/**
 * Split dot-path string into tuple of keys.
 * @template K - Dot-separated key string.
 */
export type SplitPath<K extends string> = K extends `${infer P}.${infer S}`
  ? [P, ...SplitPath<S>]
  : [K];

/**
 * Reactive store interface with subscriptions and history.
 * @template T - Root state object type.
 */
export interface ObservableStore<T> {
  /** Current state snapshot. */
  state: T;
  /** Proxy for building path references. */
  readonly $: PathProxy<T>;

  /**
   * Convert a path proxy or string into a dot-path string.
   * @param proxyPath - Path tracker or string to resolve.
   * @returns Dot-separated string representation of the path.
   */
  resolvePath(proxyPath: PathTracker<any, any> | string): string;

  /**
   * Subscribe to all state changes with optional cache key filtering.
   * @param callback - Invoked on every store update.
   * @param cacheKeys - Optional array of cache keys to filter notifications.
   * @returns Function to unsubscribe.
   */
  subscribe(callback: Subscriber<T>, cacheKeys?: CacheKey<T>[]): Unsubscribe;

  /**
   * Subscribe to changes on specific path.
   * @param path - Path tracker identifying the property.
   * @param callback - Invoked on value change at the path.
   * @param options.immediate - If true, invoke immediately with current value.
   * @param options.cacheKeys - Optional cache keys to further filter.
   * @returns Function to unsubscribe.
   */
  subscribeToPath<P extends PathTracker<any, any>>(
    path: P,
    callback: Subscriber<P>,
    options?: { immediate?: boolean; cacheKeys?: CacheKey<T>[] }
  ): Unsubscribe;

  /**
   * Trigger cache invalidation for a key.
   * @param cacheKey - Key to invalidate.
   */
  invalidate(cacheKey: CacheKey<T>): void;

  /**
   * Retrieve the current value at path.
   * @param path - Path tracker identifying the property.
   * @returns Current value or undefined if not found.
   */
  get<P extends PathTracker<any, any>>(
    path: P
  ): P[typeof TYPE_SYMBOL] | undefined;

  /**
   * Update a value at path or via updater function.
   * @param path - Path tracker identifying the property.
   * @param valueOrFn - New value or updater function receiving current value.
   */
  update<P extends PathTracker<any, any>>(
    path: P,
    valueOrFn:
      | P[typeof TYPE_SYMBOL]
      | ((cur: P[typeof TYPE_SYMBOL]) => P[typeof TYPE_SYMBOL])
  ): void;

  /**
   * Compute the next value for a given path, handling both direct values
   * and updater functions.
   * @param path - Path tracker identifying the property.
   * @param valueOrFn - New value or updater function receiving the current value.
   * @returns The resolved new value that would be applied.
   */
  resolveValue<P extends PathTracker<any, any>>(
    path: P,
    valueOrFn:
      | P[typeof TYPE_SYMBOL]
      | ((cur: P[typeof TYPE_SYMBOL]) => P[typeof TYPE_SYMBOL])
  ): P[typeof TYPE_SYMBOL];

  /**
   * Cancel in-flight async updates.
   * @param path - Optional path tracker or string to cancel.
   */
  cancelAsyncUpdates<P extends PathTracker<any, any>>(path?: P | string): void;

  /**
   * Perform an async update with cancellation support.
   *
   * @param path - Path tracker identifying the property to update.
   * @param asyncUpdater - Async function that receives:
   *   - `current`: the current value at `path`
   *   - `signal`: an `AbortSignal` which will be triggered if this update is cancelled
   *   Should return a `Promise` resolving to the new value.
   * @param options - Optional settings for controlling cancellation behavior.
   * @param options.abortPrevious - If `true`, will abort any still-pending update on the same path before starting this one.
   *                                 Defaults to `false` (i.e. do not cancel previous calls).
   * @returns A `Promise<void>` that resolves once the update has been applied (or is cancelled).
   */
  asyncUpdate<P extends PathTracker<any, any>>(
    path: P,
    asyncUpdater: (
      current: P[typeof TYPE_SYMBOL],
      signal: AbortSignal
    ) => Promise<P[typeof TYPE_SYMBOL]>,
    options?: { abortPrevious?: boolean }
  ): Promise<void>;

  /**
   * Batch multiple updates in one cycle.
   * @param callback - Function containing update calls.
   */
  batch(callback: () => void): void;

  /**
   * Undo last update on a path.
   * @param pathProxy - Path tracker identifying the property.
   */
  undo(pathProxy: PathTracker<any, any>): void;

  /**
   * Redo last undone update on a path.
   * @param pathProxy - Path tracker identifying the property.
   */
  redo(pathProxy: PathTracker<any, any>): void;

  /**
   * Retrieve store memory and subscription stats.
   * @returns MemoryStats object with counts and entries.
   */
  getMemoryStats(): MemoryStats;

  /**
   * Clear all subscriptions and pending operations.
   */
  clearStore(): void;
}
