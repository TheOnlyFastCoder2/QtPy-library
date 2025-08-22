// utils.tsx
import { Accessor, PathOrAccessor, ObservableStore, MaxDepth, SafePaths, MetaData, MetaWeakMap } from './types';

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
  //prettier-ignore
  if (target === null || !(Array.isArray(target) || typeof target === "object" || typeof target === "function")) {
    return false;
  }
  return cb?.();
}
//prettier-ignore
export function setMetaData<T extends object>(metaMap: MetaWeakMap,target: T,meta: MetaData
): void {
  withMetaSupport(target, () => metaMap.set(target, meta));
}
//prettier-ignore
export function getMetaData<T extends object>(metaMap: MetaWeakMap,target: T): MetaData | undefined {
  return withMetaSupport(target, () => metaMap.get(target));
}
//prettier-ignore
export function deleteMetaData<T extends object>(metaMap: MetaWeakMap, target: T): void {
  withMetaSupport(target, () => metaMap.delete(target));
}
//prettier-ignore
export function wrapWithMetaUsingUUID(metaMap: MetaWeakMap, target: any): any {
  withMetaSupport(target, () => {
    const currentMeta = getMetaData(metaMap, target) ?? {};
    setMetaData(metaMap, target, {
      revision: crypto.randomUUID(),
      _prevRevision: currentMeta.revision ?? null,
    });
  });
  return target;
}

export function calculateSnapshotHash(obj: any): string | false {
  try {
    const input = stringify(obj);
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

export function stringify(root: any): string {
  type StackItem = string | { value: any; parentIsArray?: boolean };

  const stack: StackItem[] = [{ value: root }];
  const out: string[] = [];
  const seen = new WeakSet();

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (typeof current === 'string') {
      out.push(current);
      continue;
    }

    let { value, parentIsArray } = current;

    // Обработка примитивов
    if (value == null || typeof value !== 'object') {
      if (value === undefined) {
        out.push(parentIsArray ? 'null' : '');
      } else if (typeof value === 'number') {
        out.push(isFinite(value) ? value.toString() : 'null');
      } else {
        out.push(JSON.stringify(value));
      }
      continue;
    }

    // Проверка циклических ссылок
    if (seen.has(value)) {
      out.push('"__cycle__"');
      continue;
    }
    seen.add(value);

    // Обработка массивов и объектов
    if (Array.isArray(value)) {
      if (value.length === 0) {
        out.push('[]');
        continue;
      }
      stack.push(']');
      for (let i = value.length - 1; i >= 0; i--) {
        stack.push({ value: value[i], parentIsArray: true });
        if (i > 0) stack.push(',');
      }
      stack.push('[');
    } else {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        out.push('{}');
        continue;
      }
      stack.push('}');
      for (let i = keys.length - 1; i >= 0; i--) {
        const key = keys[i];
        stack.push({ value: value[key] });
        stack.push(`"${key}":`);
        if (i > 0) stack.push(',');
      }
      stack.push('{');
    }
  }

  return out.join('');
}

export function detRandomId() {
  return `${Math.floor(performance.now()).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
