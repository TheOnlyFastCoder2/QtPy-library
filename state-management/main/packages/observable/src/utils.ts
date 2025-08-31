// utils.tsx
import {
  Accessor,
  PathOrAccessor,
  ObservableStore,
  MaxDepth,
  SafePaths,
  MetaData,
  MetaWeakMap,
  SSRStore,
} from './types';

// Вспомогательная функция для извлечения аргументов
function extractArgs(funcStr: string): string[] {
  const argsMatch = funcStr.match(/\((.*?)\)/);
  if (!argsMatch) return [];

  const argsStr = argsMatch[1];
  return argsStr.split(/\s*,\s*/).filter(Boolean);
}

/**
 * Возвращает строку пути в точечной нотации на основе переданной функции.
 * Первый аргумент функции интерпретируется как store, второй (если есть) — как функция-хелпер.
 * Поддерживает произвольные имена аргументов.
 *
 * @param store Объект, из которого строится путь
 * @param fn Стрелочная функция вида:
 *   - ($, t) => $.foo[t(bar),t(42)]
 *   - (obj) => obj.foo.bar
 *   - (u, helper) => u.arr[helper(0)]
 * @returns Строка вида "foo.123.456" или "arr.0"
 */
export function getStringOfObject<T, D extends number = MaxDepth>(store: T, fn: Accessor<T>): SafePaths<T, D> {
  const fnString = fn.toString().trim();
  const args = extractArgs(fnString);

  // Экранируем имена аргументов для использования в RegExp
  const escapedArgs = args.map((arg) => arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  // Формируем регулярное выражение для разбора стрелочной функции
  const arrowMatch = fnString.match(
    new RegExp(
      `^\\s*(?:\\(\\s*${escapedArgs[0]}\\s*(?:,\\s*${escapedArgs[1]}\\s*)?\\s*\\)|${escapedArgs[0]})\\s*=>\\s*([\\s\\S]+)$`
    )
  );

  if (!arrowMatch) {
    throw new Error('Invalid function format');
  }

  let rawExpr = arrowMatch[1].trim();

  // Убираем внешние скобки, если они есть
  if (rawExpr.startsWith('(') && rawExpr.endsWith(')')) {
    rawExpr = rawExpr.slice(1, -1).trim();
  }

  // Убираем пробелы и переносы строк
  let compactPath = rawExpr.replace(/\s+/g, '');

  // Разбиваем конструкции вида [expr1,expr2] на [expr1][expr2]
  const commaInBracket = /\[([^\[\]]+),([^\[\]]+)\]/;
  while (commaInBracket.test(compactPath)) {
    compactPath = compactPath.replace(/\[([^\[\]]+),([^\[\]]+)\]/g, '[$1][$2]');
  }

  // Если второго аргумента нет, используем статическую обработку
  if (args.length < 2) {
    let staticPath = compactPath
      .replace(/\[['"]([^[\]]+)['"]\]/g, '.$1') // ['foo'] или ['key-1'] → .foo / .key-1
      .replace(/\[([^[\]]+)\]/g, '.$1'); // [123] или [foo] → .123 / .foo
    if (staticPath.startsWith('.')) {
      staticPath = staticPath.slice(1);
    }
    return staticPath as SafePaths<T, D>;
  }

  // Получаем имя второго аргумента (например, t или helper)
  const helperName = args[1];
  const escapedHelperName = helperName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Регулярные выражения для поиска вызовов второго аргумента (вместо t)
  const tCallSimple = new RegExp(`${escapedHelperName}\\(\\s*([^\\)]+)\\s*\\)`);
  const tCallGlobal = new RegExp(`${escapedHelperName}\\(\\s*([^\\)]+)\\s*\\)`, 'g');

  // Если нет вызовов второго аргумента, обрабатываем статические индексы
  if (!tCallSimple.test(compactPath)) {
    let staticPath = compactPath
      .replace(/\[['"]([^[\]]+)['"]\]/g, '.$1') // ['foo'] или ['key-1'] → .foo / .key-1
      .replace(/\[([^[\]]+)\]/g, '.$1'); // [123] или [foo] → .123 / .foo
    if (staticPath.startsWith('.')) {
      staticPath = staticPath.slice(1);
    }
    return staticPath as SafePaths<T, D>;
  }

  // Собираем все выражения внутри вызовов второго аргумента
  const argNames: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tCallGlobal.exec(compactPath)) !== null) {
    argNames.push(match[1]);
  }

  // Подготавливаем массив dynamicValues для хранения пар ["helper(expr)", value]
  const dynamicValues: Array<[string, unknown]> = [];
  let callCount = 0;

  // Дженерик-функция для второго аргумента: запоминает пары ["helper(expr)", capturedValue]
  function helper<K>(capturedValue: K): K {
    const expression = argNames[callCount];
    dynamicValues.push([`${helperName}(${expression})`, capturedValue]);
    callCount++;
    return capturedValue;
  }

  // Вызываем fn с учетом количества аргументов
  try {
    fn(store, helper as any);
  } catch {
    // Игнорируем ошибки доступа
  }

  // Строим словарь expression → value
  const nameToValue: Record<string, unknown> = {};
  for (const [callExpr, val] of dynamicValues) {
    const expr = callExpr.slice(helperName.length + 1, -1);
    nameToValue[expr] = val;
  }

  // Заменяем каждый вызов второго аргумента на соответствующее значение
  let replacedPath = compactPath.replace(tCallGlobal, (_all, expr) => {
    const v = nameToValue[expr];
    return v === undefined ? 'undefined' : String(v);
  });

  // Обрабатываем статические индексы: ['foo'] → .foo, [123] → .123
  replacedPath = replacedPath.replace(/\[['"]([\w$]+)['"]\]/g, '.$1').replace(/\[([\w$]+)\]/g, '.$1');

  // Убираем двойные точки и ведущую точку
  const noDoubleDots = replacedPath.replace(/\.\./g, '.');
  const normalized = noDoubleDots.startsWith('.') ? noDoubleDots.slice(1) : noDoubleDots;

  return normalized as SafePaths<T, D>;
}
/**
 * Проверяет, является ли «путь» валидным (строка или Accessor-функция).
 * Если нет — бросает ошибку.
 */
export function validatePath(path: unknown): asserts path is string | Accessor<any> {
  const isString = typeof path === 'string';
  const isFunction = typeof path === 'function';
  if (!isString && !isFunction) {
    const receivedType = path === null ? 'null' : typeof path;
    const receivedInfo = typeof path === 'object' ? JSON.stringify(Object.keys(path)) : String(path);
    throw new Error(`[store] Ожидался путь (строка или функция-доступ), получено: ${receivedType} (${receivedInfo}).`);
  }
}

/**
 * Возвращает корректную dot-notation-строку из:
 * - строки (оставляем как есть);
 * - стрелочной функции-доступа (парсим через getStringOfObject),
 *   после чего обрезаем всё до и включая "$." или "state." (если есть),
 *   даже если "state" встречается внутри, например "store.state.user.name".
 *
 * Например:
 *   "store.$.settings.name"      → "settings.name"
 *   "$.items.0.value"            → "items.0.value"
 *   "store.state.user.name"      → "user.name"
 *   "state.app.config"           → "app.config"
 *   "my.store.state.deep.key"    → "deep.key"
 *
 * @param path Строка или Accessor-функция
 */
export function getStringPath<T extends object>(store: T, path: string | Accessor<any>): string {
  let full: string;
  if (typeof path === 'string') {
    full = path;
  } else {
    full = getStringOfObject<T>(store, path) as any;
  }

  // Извлекаем имя первого аргумента из функции, если path — функция
  let argName = '$'; // По умолчанию, если path — строка
  if (typeof path !== 'string') {
    const fnString = path.toString().trim();
    const args = extractArgs(fnString);
    argName = args[0] || '$'; // Берем первый аргумент или "$" по умолчанию
  }

  // Убираем argName из начала пути, если он есть
  const argNamePrefix = `${argName}.`;
  const argNameIndex = full.indexOf(argNamePrefix);
  if (argNameIndex >= 0) {
    return full.slice(argNameIndex + argNamePrefix.length);
  }

  return full;
}

/**
 * Приводит PathOrAccessor к “одиночной” строке.
 *
 * Теперь, если мы видим функцию, чьё имя первого аргумента — "t",
 * считаем её Accessor’ом и разбираем через getStringPath.
 * Если же имя первого аргумента — что-то другое (например, "store" или "prevState"),
 * считаем, что это функция вида (store) => строка, вызываем её и берём результат.
 */
export function normalizeCacheKey<T, D extends number = MaxDepth>(
  cacheKey: PathOrAccessor<T, D>,
  store: ObservableStore<T, D>
): string {
  if (Array.isArray(cacheKey)) {
    //@ts-ignore
    return cacheKey
      .map((key) => normalizeCacheKey<T, D>(key, store))
      .filter((s) => s !== '')
      .join('.');
  }

  if (typeof cacheKey === 'function') {
    return getStringPath(store, cacheKey as Accessor<any>);
  }

  return cacheKey == null ? '' : String(cacheKey);
}

/**
 * Плоское сравнение (shallow) двух значений (примитивов или простых объектов).
 */
export function shallowEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (typeof a !== 'object') return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(b, key) || a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Разбивает dot-notation-строку на массив сегментов.
 * Например, "a.b.0.c" → ["a", "b", 0, "c"]
 */
export function splitPath(path: string): (string | number)[] {
  return path.split('.').map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg));
}
// isMethodsOfArray
export function isArrayMethod(name: string, names: string[] = []) {
  switch (name) {
    case 'push':
    case 'pop':
    case 'splice':
    case 'shift':
    case 'unshift':
    case 'sort':
    case 'reverse':
      return !names.length || names.includes(name);
  }
  return false;
}

export function withMetaSupport<T>(target: T, cb: () => void | any): any {
  if (target === undefined) return false;
  return cb?.();
}
//prettier-ignore
export function setMetaData<T extends object>(metaMap: MetaWeakMap|undefined, target: T, meta: MetaData, primitiveMetaMap?: Map<string, MetaData>, path?: string
): void {
  if (typeof target === 'object' && target !== null && metaMap) {
    withMetaSupport(target, () => metaMap.set(target, meta));
  } else if (path) {
    primitiveMetaMap.set(path, meta);
  }
}
//prettier-ignore
export function getMetaData<T extends object>(metaMap: WeakMap<object, MetaData>, target: T, primitiveMetaMap?: Map<string, MetaData>, path?: string): MetaData | undefined {
  if (typeof target === 'object' && target !== null) {
    return withMetaSupport(target, () => metaMap.get(target));
  } else if (path) {
    return primitiveMetaMap?.get(path);
  }
  return undefined;
}
//prettier-ignore
export function deleteMetaData<T extends object>(metaMap: WeakMap<object, MetaData>, target: T, primitiveMetaMap?: Map<string, MetaData>, path?: string): void {
  if (typeof target === 'object' && target !== null) {
    withMetaSupport(target, () => metaMap.delete(target));
  } else if (path) {
    primitiveMetaMap.delete(path);
  }
}

export function calculateSnapshotHash(obj: any): string | false {
  try {
    if (obj === null || obj === undefined) {
      return String(obj); // "null" или "undefined"
    }
    if (typeof obj !== 'object') {
      return String(obj); // Для примитивов возвращаем строковое представление
    }

    const input = JSON.stringify(obj);
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      const code = input.charCodeAt(i);
      hash = (((hash << 5) + hash) ^ code) >>> 0;
    }
    return (hash >>> 0).toString(16);
  } catch {
    return false;
  }
}

export function getRandomId() {
  return `${Math.floor(performance.now()).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const getCheckIsSSR = () => {
  return typeof window === 'undefined' || typeof process !== 'undefined' || typeof self === 'undefined';
};

export function ssrStore<T extends object, D extends number = 0>(
  store: SSRStore<T, D>,
  ssrStoreId = 'ssrStoreId_default'
) {
  const ssrEnhancedStore = store as SSRStore<T, D>;

  let lastPromise: Promise<void> = Promise.resolve();

  const originalAsyncUpdate = ssrEnhancedStore.asyncUpdate;

  function enqueueUpdate(fn: (...args: any[]) => Promise<void>) {
    return (...args: any[]) => {
      const next = lastPromise.then(() => fn(...args));
      lastPromise = next.catch(() => {});
      return next;
    };
  }

  //@ts-expect-error
  ssrEnhancedStore.updateSSR = enqueueUpdate(originalAsyncUpdate);
  ssrEnhancedStore.updateSSR.quiet = enqueueUpdate(originalAsyncUpdate.quiet);

  ssrEnhancedStore.getIsSSR = () => {
    return getCheckIsSSR();
  };

  ssrEnhancedStore.getSSRStoreId = () => ssrStoreId;

  ssrEnhancedStore.snapshot = async () => {
    try {
      await lastPromise;
      return store.getRawStore();
    } catch (error) {
      console.error('Failed to create snapshot:', error);
      throw error;
    }
  };

  ssrEnhancedStore.getSerializedStore = async (type: 'window' | 'scriptTag' | 'serializedData') => {
    const snapshot = await ssrEnhancedStore.snapshot();
    const serialized = JSON.stringify(snapshot);
    return {
      window: `window['${ssrStoreId}'] = ${serialized};`,
      scriptTag: `<script id="${ssrStoreId}" type="application/json">${serialized}</script>`,
      serializedData: serialized,
    }[type];
  };

  ssrEnhancedStore.hydrate = () => {
    if (!ssrEnhancedStore.getIsSSR() && (window as any)[ssrStoreId]) {
      const stateElement = document.getElementById(ssrStoreId);
      ssrEnhancedStore.setRawStore((window as any)[ssrStoreId]);
      delete (window as any)[ssrStoreId];
      stateElement?.remove();
    }
  };

  ssrEnhancedStore.hydrateWithDocument = (delay = 0, callback?: () => void) => {
    if (!ssrEnhancedStore.getIsSSR()) {
      window.onload = () => {
        setTimeout(() => {
          ssrEnhancedStore.hydrate();
          callback?.();
        }, delay);
      };
    }
  };

  return ssrEnhancedStore;
}

export function isPathValid(state: any, path: string): boolean {
  const segments = splitPath(path);
  let current = state;
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') {
      return false;
    }
    current = current[segment];
  }
  return true;
}

export function getByPath(obj: any, path: string): any {
  if (!path) return obj;
  const segments = splitPath(path);
  let current = obj;
  for (const seg of segments) {
    if (current == null) return undefined;
    current = current[seg];
  }
  return current;
}

const MUTATING_METHODS = {
  array: ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'],
  object: ['assign', 'defineProperty', 'defineProperties'],
};

export class WrapArray extends Array {
  constructor(...args: any[]) {
    super(...args);
  }
}

export function wrapArrayMethods(node: any, metaMap: WeakMap<object, MetaData>) {
  if (!Array.isArray(node) || getMetaData(metaMap, node)?._isWrapped) return node;
  MUTATING_METHODS.array.forEach((method) => {
    WrapArray.prototype[method] = function (...args: any[]) {
        withMetaSupport(this, () => {
          setMetaData(metaMap, this, {
            _prevSignature: 'CHANGED_METHOD',
            _mutated: true,
            _isWrapped: true,
          });
        });
        return Array.prototype[method].apply(this, args);
      };
  });

  Object.setPrototypeOf(node, WrapArray.prototype);
  setMetaData(metaMap, node, { _isWrapped: true });

  return node as WrapArray;
}

export class WrapObject extends Object {
  constructor(...args: any[]) {
    super(...args);
  }
}

export function wrapObjectMethods(node: object, metaMap: WeakMap<object, MetaData>) {
  if (typeof node !== 'object' || node === null || getMetaData(metaMap, node)?._isWrapped) return node;

  MUTATING_METHODS.object.forEach((method) => {
    if (!(method in WrapObject.prototype)) {
      WrapObject.prototype[method] = function (...args: any[]) {
        withMetaSupport(this, () => {
          setMetaData(metaMap, this, {
            _prevSignature: 'CHANGED_METHOD',
            _mutated: true,
            _isWrapped: true,
          });
        });

        return Object[method](this, ...args);
      };
    }
  });

  Object.setPrototypeOf(node, WrapObject.prototype);
  setMetaData(metaMap, node, { _isWrapped: true });
  return node as WrapArray;
}

export function wrapNode(node: any, parent: any, key: string | number | null, metaMap: WeakMap<object, MetaData>): any {
  let wrapped = node;

  if (Array.isArray(node)) {
    wrapped = wrapArrayMethods(node, metaMap);
  } else if (node && typeof node === 'object') {
    wrapped = wrapObjectMethods(node, metaMap);
  }
  if (wrapped !== node && parent && key != null) {
    parent[key] = wrapped;
  }

  return wrapped;
}

export function* iterateObjectTree(
  obj: any,
  showPrimitive: boolean = true,
  visited = new WeakSet(),
  currentPath: string = '',
  parent: any = null,
  parentKey: string | number | null = null
): IterableIterator<{ node: any; path: string; parent: any; key: string | number | null }> {
  if (obj == undefined || obj == null || typeof obj !== 'object' || visited.has(obj)) {
    return;
  }
  visited.add(obj);

  yield { node: obj, path: currentPath, parent, key: parentKey };

  if (Array.isArray(obj)) {
    for (let i = obj.length - 1; i >= 0; i--) {
      const nextPath = currentPath ? `${currentPath}.${i}` : String(i);
      if (showPrimitive || (obj[i] && typeof obj[i] === 'object')) {
        yield { node: obj[i], path: nextPath, parent: obj, key: i };
        if (obj[i] && typeof obj[i] === 'object') {
          yield* iterateObjectTree(obj[i], showPrimitive, visited, nextPath, obj, i);
        }
      }
    }
  } else {
    const keys = Object.keys(obj);
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      if (showPrimitive || (obj[key] && typeof obj[key] === 'object')) {
        yield { node: obj[key], path: nextPath, parent: obj, key };
        if (obj[key] && typeof obj[key] === 'object') {
          yield* iterateObjectTree(obj[key], showPrimitive, visited, nextPath, obj, key);
        }
      }
    }
  }
}
