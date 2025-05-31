// utils.tsx

import { CacheKey, ObservableStore } from "./types";

type Accessor<T> = () => T;

/**
 * Извлекает строку вида "object.key.settings.name" из стрелочной функции
 * и преобразует все "[index]" в ".index".
 *
 * @param fn Стрелочная функция: () => object.key.settings.name или () => object.arr[0]
 * @returns Строка вида "object.key.settings.name" или "object.arr.0"
 */
export function getStringOfObject<T>(fn: Accessor<T>): string {
  const fnString = fn.toString().trim();
  // 1) Стрелочная функция без фигурных скобок: "() => object.key"
  const arrowWithoutBracesMatch = fnString.match(
    /^\(?\s*\)?\s*=>\s*([\w$\.\[\]]+)/
  );
  if (arrowWithoutBracesMatch) {
    const rawPath = arrowWithoutBracesMatch[1];
    return rawPath.replace(/\[(\w+)\]/g, ".$1");
  }

  // 2) Стрелочная функция с фигурными скобками: "() => { return object.key; }"
  const arrowWithBracesMatch = fnString.match(
    /^\(?\s*\)?\s*=>\s*\{\s*return\s+([\w$\.\[\]]+);?\s*\}/
  );
  if (arrowWithBracesMatch) {
    const rawPath = arrowWithBracesMatch[1];
    return rawPath.replace(/\[(\w+)\]/g, ".$1");
  }

  // 3) Обычная function-expression/declaration: "function() { return object.key; }"
  const funcMatch = fnString.match(/return\s+([\w$\.\[\]]+);?/);
  if (funcMatch) {
    const rawPath = funcMatch[1];
    return rawPath.replace(/\[(\w+)\]/g, ".$1");
  }

  throw new Error(
    "Не удалось распарсить путь к свойству из переданной функции."
  );
}

/**
 * Проверяет, является ли «путь» валидным (строка или Accessor-функция).
 * Если нет — бросает ошибку.
 */
export function validatePath(
  path: unknown
): asserts path is string | Accessor<any> {
  const isString = typeof path === "string";
  const isFunction = typeof path === "function";
  if (!isString && !isFunction) {
    const receivedType = path === null ? "null" : typeof path;
    const receivedInfo =
      typeof path === "object"
        ? JSON.stringify(Object.keys(path))
        : String(path);
    throw new Error(
      `[store] Ожидался путь (строка или функция-доступ), получено: ${receivedType} (${receivedInfo}).`
    );
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
export function getStringPath<T extends object>(
  path: string | Accessor<any>
): string {
  // Если это просто строка — используем её напрямую
  let full: string;
  if (typeof path === "string") {
    full = path;
  } else {
    // path — функция-доступ
    full = getStringOfObject(path as Accessor<any>);
  }

  // 1) Ищем "$." и обрезаем всё до и включая "$."
  const dollarIndex = full.indexOf("$.");
  if (dollarIndex >= 0) {
    return full.slice(dollarIndex + 2);
  }

  // 2) Ищем любую вхождение ".state." и обрезаем всё до и включая ".state."
  const dotState = ".state.";
  const idxDotState = full.indexOf(dotState);
  if (idxDotState >= 0) {
    return full.slice(idxDotState + dotState.length);
  }

  // 3) Если строка начинается с "state." — убираем его
  const statePrefix = "state.";
  if (full.startsWith(statePrefix)) {
    return full.slice(statePrefix.length);
  }

  // Иначе возвращаем без изменений
  return full;
}

/**
 * Преобразует CacheKey (примитив, функция или массив) в строку:
 * - Если это массив — склеиваем все элементы через точку.
 * - Если это функция — получаем dot-строку через getStringPath.
 * - Иначе (string|number|boolean|null|undefined) приводим к String().
 */
export function normalizeCacheKey<T>(
  cacheKey: CacheKey<T>,
  store: ObservableStore<T>
): string {
  if (Array.isArray(cacheKey)) {
    return cacheKey.map((k) => normalizeCacheKey(k, store)).join(".");
  }
  if (typeof cacheKey === "function") {
    const pathStr = getStringPath(cacheKey as Accessor<any>);
    return pathStr;
  }
  return String(cacheKey);
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
  if (typeof a !== "object") return false;
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
  return path.split(".").map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg));
}
