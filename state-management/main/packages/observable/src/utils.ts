// utils.tsx

import {
  Accessor,
  CacheKey,
  ObservableStore,
  MaxDepth,
  SafePaths,
} from "./types";

/**
 * То же, что раньше: внутри собираются вызовы t(<expr>) и записываются в dynamicValues,
 * но функция возвращает только строку пути в точечной нотации.
 * Параметр t теперь — дженерик-функция <K>(arg: K) => K. Если t не используется, его можно опустить.
 *
 * @param fn Стрелочная функция вида:
 *   - (t) => obj.foo[t(bar),t(42)]
 *   - () => obj.foo.bar
 *   - u => u.arr[0]
 * @returns Строка вида "obj.foo.123.456" или "obj.foo.bar"
 */
export function getStringOfObject<T, D extends number = MaxDepth>(
  fn: Accessor<T>
): SafePaths<T, D> {
  const fnString = fn.toString().trim();

  // === 1. Захватываем всё после "=>", включая новые строки, с учётом всех вариантов параметров ===
  // Паттерн: /^\s*(?:\(\s*[\w$]*\s*\)|[\w$]+)\s*=>\s*([\s\S]+)$/
  const arrowMatch = fnString.match(
    /^\s*(?:\(\s*[\w$]*\s*\)|[\w$]+)\s*=>\s*([\s\S]+)$/
  );
  if (!arrowMatch) {
    throw new Error(
      "Не удалось распарсить стрелочную функцию — ожидается синтаксис `() => ...`, `(t) => ...` или `t => ...`"
    );
  }

  let rawExpr = arrowMatch[1].trim();

  // === 2. Убираем внешние скобки, если они есть ===
  if (rawExpr.startsWith("(") && rawExpr.endsWith(")")) {
    rawExpr = rawExpr.slice(1, -1).trim();
  }

  // === 3. Убираем пробелы/переносы строк, чтобы получить компактный путь ===
  let compactPath = rawExpr.replace(/\s+/g, "");

  // === 4. Разбиваем конструкции "[expr1,expr2]" → "[expr1][expr2]" пока есть запятая внутри ===
  const commaInBracket = /\[([^\[\]]+),([^\[\]]+)\]/;
  while (commaInBracket.test(compactPath)) {
    compactPath = compactPath.replace(/\[([^\[\]]+),([^\[\]]+)\]/g, "[$1][$2]");
  }

  // === 5. Если после этого нет ни одного t(...), — просто обрабатываем статические индексы и возвращаем ===
  const tCallSimple = /t\(\s*([^\)]+)\s*\)/;
  if (!tCallSimple.test(compactPath)) {
    let staticPath = compactPath
      .replace(/\[['"]([\w$]+)['"]\]/g, ".$1") // ['foo'] → .foo
      .replace(/\[([\w$]+)\]/g, ".$1"); // [123] или [foo] → .123 / .foo
    if (staticPath.startsWith(".")) {
      staticPath = staticPath.slice(1);
    }
    return staticPath as SafePaths<T, D>;
  }

  // === 6. Собираем все выражения внутри t(...) по порядку ===
  const argNames: string[] = [];
  const tCallGlobal = /t\(\s*([^\)]+)\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = tCallGlobal.exec(compactPath)) !== null) {
    argNames.push(match[1]); // например "address.test" или "32"
  }

  // === 7. Подготавливаем массив dynamicValues (хранит пары ["t(expr)", value]) ===
  const dynamicValues: Array<[string, unknown]> = [];
  let callCount = 0;

  // === 8. Дженерик-функция t: запоминает пары ["t(expr)", capturedValue] и возвращает capturedValue ===
  function t<K>(capturedValue: K): K {
    const expression = argNames[callCount];
    dynamicValues.push([`t(${expression})`, capturedValue]);
    callCount++;
    return capturedValue;
  }

  // === 9. Вызываем fn(t), чтобы заполнить dynamicValues (игнорируем возможные ошибки доступа) ===
  try {
    fn(t as any);
  } catch {
    // Просто игнорируем, если fn пыталась обратиться к реальным объектам вне области.
  }

  // === 10. Строим словарь expression → value ===
  const nameToValue: Record<string, unknown> = {};
  for (const [callExpr, val] of dynamicValues) {
    const expr = callExpr.slice(2, -1); // "address.test" или "32"
    nameToValue[expr] = val;
  }

  // === 11. Заменяем каждый t(expr) на полученное значение ===
  let replacedPath = compactPath.replace(
    /t\(\s*([^\)]+)\s*\)/g,
    (_all, expr) => {
      const v = nameToValue[expr];
      return v === undefined ? "undefined" : String(v);
    }
  );

  // === 12. Дальше обрабатываем статические индексы: ['foo'] → .foo, [123] → .123 ===
  replacedPath = replacedPath
    .replace(/\[['"]([\w$]+)['"]\]/g, ".$1")
    .replace(/\[([\w$]+)\]/g, ".$1");

  // === 13. Убираем двойные точки и ведущую точку ===
  const noDoubleDots = replacedPath.replace(/\.\./g, ".");
  const normalized = noDoubleDots.startsWith(".")
    ? noDoubleDots.slice(1)
    : noDoubleDots;

  // Возвращаем только итоговую строку:
  return normalized as SafePaths<T, D>;
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
    full = getStringOfObject<T>(path) as any;
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
 * Приводит CacheKey к “одиночной” строке.
 *
 * Теперь, если мы видим функцию, чьё имя первого аргумента — "t",
 * считаем её Accessor’ом и разбираем через getStringPath.
 * Если же имя первого аргумента — что-то другое (например, "store" или "prevState"),
 * считаем, что это функция вида (store) => строка, вызываем её и берём результат.
 */
export function normalizeCacheKey<T, D extends number = MaxDepth>(
  cacheKey: CacheKey<T, D>,
  store: ObservableStore<T, D>
): string {
  // 1. Массив ключей (групповая инвалидация)
  if (Array.isArray(cacheKey)) {
    return cacheKey
      .map((key) => normalizeCacheKey<T, D>(key, store))
      .filter((s) => s !== "")
      .join(".");
  }

  // 2. Функция (или Accessor)
  if (typeof cacheKey === "function") {
    const fnString = cacheKey.toString().trim();

    // Простейшая эвристика: является ли это Accessor
    const accessorPattern = /^\s*(?:\(\s*t\s*\)|t)\s*=>/;

    if (accessorPattern.test(fnString)) {
      try {
        return getStringPath(cacheKey as Accessor<any>);
      } catch {
        return "";
      }
    }

    // Обычная функция
    try {
      const result = (cacheKey as (state: T) => unknown)(store.state);
      return result != null ? String(result) : "";
    } catch {
      return "";
    }
  }

  // 3. Примитив (string | number | boolean | null | undefined)
  return cacheKey == null ? "" : String(cacheKey);
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
