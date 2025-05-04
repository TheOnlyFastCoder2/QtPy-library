import {
  ExtractPathType,
  ObservableStore,
  Paths,
} from "@qtpy/state-management-observable/types";

export interface QueryCacheItem {
  data: any;
  tags?: CacheKey[];
  createdAt: number;
  ttl?: number;
}

export type CacheKey = string;
export type InvalidationCallback = () => void;
export type MutationFn<TInput, TOutput> = (input: TInput) => Promise<TOutput>;
export interface MutationOptions<TInput, TOutput> {
  mutationFn: MutationFn<TInput, TOutput>;
  invalidateTags?: CacheKey[];
  onSuccess?: (data: TOutput) => void;
  onError?: (error: unknown) => void;
}

export interface Mutation<TInput, TOutput> {
  mutate: (input: TInput) => Promise<TOutput>;
  reset: () => void;
  getState: () => {
    isLoading: boolean;
    error: unknown;
    data: TOutput | null;
  };
}

export interface BatchQueryOptions {
  concurrency?: number;
  onProgress?: (percent: number) => void;
}
export interface QueryDefinition {
  key: string;
  query: (...args: any[]) => Promise<any>;
}

export type ErrorContext<T extends object, E = unknown> = {
  type: "query" | "mutation" | "polling" | "invalidation";
  key?: CacheKey;
  path?: Paths<T>;
  tags?: CacheKey[];
  originalError?: E;
};

export interface ErrorHandler<T extends object, E = unknown> {
  (error: E, context: ErrorContext<T, E>): void;
}

export interface ErrorHandlerOptions {
  propagate?: boolean;
}

export interface BatchQueryResult<T extends QueryDefinition> {
  [key: string]: Awaited<ReturnType<T["query"]>>;
}

export interface StoreWithInvalidation<T extends object>
  extends ObservableStore<T> {
  addErrorHandler<E = Error>(
    handler: ErrorHandler<T, E>,
    options: ErrorHandlerOptions
  ): () => void;
  removeErrorHandler(handler: ErrorHandler<T>): void;
  _handleError(error: unknown, context: ErrorContext<T>): boolean;
  stopAllPolling(): void;
  cleanupAllInvalidationSubs(): void;
  cleanupCache(): void;
  onInvalidate: (
    cacheKey: CacheKey,
    callback: InvalidationCallback
  ) => () => void;
  invalidate: (cacheKey: CacheKey) => void;
  poll<P extends Paths<T>>(
    path: P,
    fetchFn: (current: ExtractPathType<T, P>) => Promise<ExtractPathType<T, P>>,
    options?: {
      interval: number;
      cacheKey?: CacheKey;
      retryCount?: number;
      retryDelay?: number;
      onError?: (error: unknown) => void;
      exponentialBackoff?: boolean;
    }
  ): () => void;
  stopPolling(cacheKey: CacheKey): void;
  fetchDependent<P extends Paths<T>>(
    cacheKey: CacheKey,
    fetchFn: () => Promise<ExtractPathType<T, P>>,
    options: {
      dependsOn?: Paths<T>[];
      tags?: CacheKey[];
      targetPath?: P;
      autoInvalidate?: boolean;
      ttl?: number;
    }
  ): Promise<ExtractPathType<T, P>>;
  createMutation<TInput, TOutput>(
    options: MutationOptions<TInput, TOutput>
  ): Mutation<TInput, TOutput>;

  batchQueries<Q extends { key: string; query: () => Promise<any> }>(
    queries: Q[],
    options?: BatchQueryOptions
  ): Promise<Record<string, Awaited<ReturnType<Q["query"]>>>>;
}
