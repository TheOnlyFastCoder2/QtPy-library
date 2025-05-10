import { CacheKey, ObservableStore, PathProxy, PathTracker } from "./types";

export function normalizeCacheKey<T>(
  cacheKey: CacheKey<T>,
  store: ObservableStore<T>
): string {
  if (Array.isArray(cacheKey)) {
    return cacheKey.map((k) => normalizeCacheKey(k, store)).join(".");
  }

  if (typeof cacheKey === "function") {
    return cacheKey(store.state);
  } else if (typeof cacheKey === "object" && cacheKey !== null) {
    return store.resolvePath(cacheKey);
  } else {
    return String(cacheKey);
  }
}
// PathProxy реализация
export function createPathProxy<T extends object>() {
  const pathMap = new WeakMap<any, PropertyKey[]>();

  function makeProxy(path: PropertyKey[] = []): any {
    const proxy = new Proxy(
      {
        __brand: "PathTracker" as const,
        __path: path,
        __type: undefined as unknown,
      },
      {
        get(target, key) {
          if (key === "__brand") return target.__brand;
          if (key === "__path") return target.__path;
          if (key === "__type") return target.__type;

          const nextPath = [...path, key];
          return makeProxy(nextPath);
        },
      }
    );

    pathMap.set(proxy, path);
    return proxy;
  }

  const root = makeProxy([]);

  return {
    $: root as PathProxy<T>,
    getProxyPath(proxy: any): PropertyKey[] | undefined {
      return pathMap.get(proxy);
    },
    getProxyFromStringPath(pathStr: string): any {
      const keys: PropertyKey[] = pathStr.split(".").map((key) => {
        return /^\d+$/.test(key) ? Number(key) : key;
      });

      let current = root;
      for (const key of keys) {
        current = current[key];
      }
      return current;
    },
  };
}

// Вспомогательные функции
export function shallowEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!(key in b) || a[key] !== b[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Проверяет, является ли объект валидным PathTracker.
 * Использует строгую проверку типа без instanceof.
 */
export function isProxyPath(path: unknown): path is PathTracker<any, any> {
  return (
    typeof path === "object" &&
    path !== null &&
    "__brand" in path &&
    path.__brand === "PathTracker" &&
    "__path" in path &&
    Array.isArray(path.__path)
  );
}

/**
 * Выбрасывает ошибку, если передан не PathTracker.
 * @throws {Error} Подробное сообщение о проблеме.
 */
export function validatePath(
  path: unknown
): asserts path is PathTracker<any, PropertyKey[]> {
  if (typeof path === "string" && !isProxyPath(path)) {
    const receivedType = path === null ? "null" : typeof path;
    const receivedInfo =
      typeof path === "object"
        ? JSON.stringify(Object.keys(path))
        : String(path);

    throw new Error(
      `[store] Expected PathTracker, received: ${receivedType} (${receivedInfo}).\n` +
        `Correct usage:\n` +
        `  ✅ store.update(store.$.user.age, 25)\n` +
        `Incorrect usage:\n` +
        `  ❌ store.update("user.age", 25)`
    );
  }
}
