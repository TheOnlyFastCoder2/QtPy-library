import { RefObject, useRef, useEffect } from 'react';

export type RefMap<T> = Record<string, RefObject<T>>;

export type RefMapMethods<T> = {
  getRef: (key: string) => RefObject<T>;
  deleteRef: (key: string) => void;
  clearAllRefs: () => void;
  getAllKeys: () => string[];
};

export default function useRefMap<T>(): RefMapMethods<T> {
  const refs = useRef<RefMap<T>>({});
  const keys = useRef<Set<string>>(new Set());

  const getRef = (key: string) => {
    if (!refs.current[key]) {
      refs.current[key] = { current: null } as RefObject<T>;
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

  const clearAllRefs = () => {
    refs.current = {};
    keys.current = new Set();
  };

  useEffect(() => () => clearAllRefs(), []);

  const methods = useRef<RefMapMethods<T>>(
    Object.freeze({
      getRef,
      deleteRef,
      clearAllRefs,
      getAllKeys: () => Array.from(keys.current),
    })
  );

  return methods.current;
}

export type UseRefMapReturn<T, E extends keyof RefMapMethods<T>> = Pick<RefMapMethods<T>, E>;