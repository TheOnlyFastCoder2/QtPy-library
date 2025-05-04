import { Paths, ExtractPathType, UpdateFn } from "./types";

export function getByPath<T extends object, P extends Paths<T>>(
  obj: T,
  path: P
): ExtractPathType<T, P> {
  return path.split(".").reduce((acc: any, part) => {
    if (acc === undefined || acc === null) return undefined;
    return acc[part];
  }, obj) as ExtractPathType<T, P>;
}

export function setByPath<T extends object, P extends Paths<T>>(
  obj: T,
  path: P,
  value: any
): T {
  const parts = path.split(".");
  const last = parts.pop()!;
  const parent = parts.reduce((acc, part) => {
    if (acc[part] === undefined) {
      acc[part] = {};
    }
    return acc[part];
  }, obj as any);
  parent[last] = value;
  return obj;
}

export function isUpdateFn<T, P extends Paths<T>>(
  value: ExtractPathType<T, P> | UpdateFn<T, P>
): value is UpdateFn<T, P> {
  return typeof value === "function";
}

export function shallowEqual<T extends object, Q>(a: T | Q, b: T | Q): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  ) {
    return false;
  }

  const keysA = Object.keys(a) as Array<keyof typeof a>;
  const keysB = Object.keys(b) as Array<keyof typeof b>;

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!(key in b) || !Object.is(a[key], b[key])) {
      return false;
    }
  }

  return true;
}
