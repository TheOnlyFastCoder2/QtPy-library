import { RefObject, useRef, useEffect, useState, useMemo } from 'react';

export type RefMap<T> = Record<string, RefObject<T>>;

export type RefMapMethods<T> = {
  getRef: (key: string) => RefObject<T>;
  deleteRef: (key: string) => void;
  clearAllRefs: () => void;
  allKeys: string[];
};

export default function useRefMap<T>(): RefMapMethods<T> {
  const refs = useRef<RefMap<T>>({});
  const keys = useRef<Set<string>>(new Set());
  const [version, setVersion] = useState(0);

  const getRef = (key: string) => {
    if (!refs.current[key]) {
      refs.current[key] = { current: null as unknown as T };
      keys.current.add(key);
    }
    return refs.current[key] as RefObject<T>;
  };

  const deleteRef = (key: string) => {
    if (refs.current[key]) {
      delete refs.current[key];
      keys.current.delete(key);
    }
  };

  const clearAllRefs = () => {
    Object.keys(refs.current).forEach(deleteRef);
    setVersion((v) => v + 1);
  };

  useEffect(() => () => clearAllRefs(), []);

  return {
    getRef,
    deleteRef,
    clearAllRefs,
    allKeys: useMemo(() => Array.from(keys.current), [version]),
  };
}

export type UseRefMapReturn<T, E extends keyof RefMapMethods<T>> = Pick<RefMapMethods<T>, E>;
