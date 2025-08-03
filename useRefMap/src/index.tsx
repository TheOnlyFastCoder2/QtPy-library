import { RefObject, useRef } from "react";

export type RefMap<T> = Record<string, RefObject<T>>;

export default function useRefMap<T>() {
  const refs = useRef<RefMap<T>>({});
  const keys = useRef<Set<string>>(new Set());

  const getRef = (key: string) => {
    if (!refs.current[key]) {
      refs.current[key] = { current: null as unknown as T };
      keys.current.add(key);
    }
    return refs.current[key];
  };

  const deleteRef = (key: string) => {
    if (refs.current[key]) {
      delete refs.current[key];
      keys.current.delete(key);
    }
  };

  return {
    getRef,
    deleteRef,
    getAllKeys: () => Array.from(keys.current),
  };
}
export type RefMapMethods<T> = {
  getRef: (key: string) => RefObject<Partial<T>>;
  deleteRef: (key: string) => RefObject<Partial<T>>;
  getAllKeys: () => string[];
};

export type UseRefMapReturn<T, E extends keyof RefMapMethods<T>> = Pick<RefMapMethods<T>, E>;