import {
  CacheKey,
  ObservableStore,
  PathNode,
  PathProxy,
  PathTracker,
} from "./types";
type AnyObject = Record<string, any>;

export function normalizeCacheKey<T>(
  cacheKey: CacheKey<T>,
  store: ObservableStore<T>
): string {
  if (Array.isArray(cacheKey)) {
    return cacheKey.map((k) => normalizeCacheKey(k, store)).join(".");
  }

  if (typeof cacheKey === "function") {
    return cacheKey(store.state);
  } else if (isProxyPath(cacheKey)) {
    return store.resolvePath(cacheKey);
  } else {
    return String(cacheKey);
  }
}
/**
 * Creates a PathTracker proxy for an object shape T.
 * - Lazy creation: nested proxies built only on first access.
 * - Caching: ensures unique instances per path.
 * - Enhanced traps: uses Reflect, supports has, ownKeys, and descriptors.
 */
export function createPathProxy<T extends object>(): {
  $: PathProxy<T>;
  getProxyPath(proxy: object): PropertyKey[] | undefined;
  getProxyFromStringPath(pathStr: string): PathProxy<T>;
} {
  const nodeCache = new WeakMap<object, PathNode>();
  const childCache = new WeakMap<object, Map<PropertyKey, PathProxy<any>>>();

  // Быстрая проверка, что строка состоит только из цифр
  function isNumericString(s: string): boolean {
    if (s.length === 0) return false;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 48 || c > 57) return false;
    }
    return true;
  }

  // Преобразуем "123" → 123; всё остальное — 그대로
  function normalizeKey(key: PropertyKey): PropertyKey {
    if (typeof key === "string" && isNumericString(key)) {
      return Number(key);
    }
    return key;
  }

  // Основная фабрика прокси
  function makeProxy(node: PathNode): PathProxy<any> {
    const target: any = {};
    // Делаем служебные поля неперечислимыми
    Object.defineProperties(target, {
      __brand: { value: "PathTracker", writable: false, enumerable: false },
      __type: { value: undefined, writable: true, enumerable: false },
      __node: { value: node, writable: false, enumerable: false },
    });

    const handler: ProxyHandler<any> = {
      get(_t, prop, receiver) {
        // Служебное поле — напрямую
        if (prop === "__brand" || prop === "__type" || prop === "__node") {
          return Reflect.get(target, prop, receiver);
        }
        const key = normalizeKey(prop);
        // Ленивая инициализация child-кэша
        let map = childCache.get(receiver as object);
        if (!map) {
          map = new Map();
          childCache.set(receiver as object, map);
        }
        if (map.has(key)) {
          return map.get(key)!;
        }
        // Создаём нового ребёнка
        const childNode: PathNode = { parent: node, key };
        const child = makeProxy(childNode);
        map.set(key, child);
        return child;
      },
      has() {
        // Чтобы `in proxy` всегда возвращал true
        return true;
      },
    };

    const proxy = new Proxy(target, handler) as PathProxy<any>;
    nodeCache.set(proxy as object, node);
    return proxy;
  }

  // Восстановление массива ключей
  function getProxyPath(proxy: object): PropertyKey[] | undefined {
    const node = nodeCache.get(proxy);
    if (!node) return undefined;
    const path: PropertyKey[] = [];
    let cur: PathNode | null = node;
    while (cur.parent) {
      path.push(cur.key);
      cur = cur.parent;
    }
    return path.reverse();
  }

  // Парсинг строки "a.b.0.c" в прокси
  function getProxyFromStringPath(pathStr: string): PathProxy<T> {
    const keys = pathStr
      .split(".")
      .map((k) => (isNumericString(k) ? Number(k) : (k as PropertyKey)));
    let cur: any = root;
    for (const k of keys) {
      cur = cur[k];
    }
    return cur;
  }

  // Корень с пустым узлом
  const rootNode: PathNode = { parent: null, key: Symbol("root") };
  const root = makeProxy(rootNode) as PathProxy<T>;

  return {
    $: root,
    getProxyPath,
    getProxyFromStringPath,
  };
}

export function shallowEqual(a: any, b: any): boolean {
  if (a === b) return true;

  // Handle null/undefined
  if (a == null || b == null) return a === b;

  // Fast path for different types
  const typeA = typeof a;
  const typeB = typeof b;
  if (typeA !== typeB) return false;

  // Special case for Date
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // Handle object/array references
  if (typeA !== "object") return false;

  // Compare object keys
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  // Compare values (shallow)
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(b, key) || a[key] !== b[key]) {
      return false;
    }
  }

  return true;
}

export function isAlreadyProxied(obj: any): boolean {
  return !!obj && typeof obj === "object" && "__isObservableProxy" in obj;
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
