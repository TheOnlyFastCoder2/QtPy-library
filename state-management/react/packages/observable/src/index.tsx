import { useSyncExternalStore, useRef, useEffect } from "react";
import { createObservableStore } from "@qtpy/state-management-observable";
import {
  Accessor,
  CacheKey,
  Middleware,
} from "@qtpy/state-management-observable/types";
import { ReactStoreOptions, ReactStore, UseStoreReturnType } from "./types";

export { createObservableStore };

/**
 * Создаёт ObservableStore и оборачивает его React-хуками
 * @param initialState - начальное состояние
 * @param middlewares - опциональный массив middleware
 * @param options - опции history
 */
export function createReactStore<T extends object>(
  initialState: T,
  middlewares: Middleware<T>[] = [],
  options: ReactStoreOptions = {}
): ReactStore<T> {
  const baseStore = createObservableStore(
    initialState,
    middlewares,
    options as any
  );
  const store = baseStore as ReactStore<T>;

  /**
   * Хук для подписки на несколько путей в сторе, без useCallback
   */
  function useStore<P extends Array<string | Accessor<T>>>(
    paths: [...P],
    options?: { cacheKeys?: CacheKey<T>[] }
  ): UseStoreReturnType<P> {
    const cacheKeys = options?.cacheKeys ?? [];

    // ----------------------------------------------------------------------
    // 1. Храним актуальные paths и cacheKeys в ref
    // ----------------------------------------------------------------------
    const pathsRef = useRef<[...(string | Accessor<T>)[]]>(paths);
    const keysRef = useRef<CacheKey<T>[]>(cacheKeys);
    pathsRef.current = paths;
    keysRef.current = cacheKeys;

    // ----------------------------------------------------------------------
    // 2. Реф для последнего снапшота
    // ----------------------------------------------------------------------
    const snapshotRef = useRef<UseStoreReturnType<P>>(
      // инициализируем один раз: на момент первого рендера
      paths.map((p) => store.get(p)) as UseStoreReturnType<P>
    );

    // ----------------------------------------------------------------------
    // 3. Функция getSnapshot: просто возвращает snapshotRef.current
    //    — она никогда не пересоздаётся, потому что мы не оборачиваем её в useCallback,
    //      но внутри store.subscribe() и useSyncExternalStore будет обращаться к ней
    // ----------------------------------------------------------------------
    const getSnapshot = () => {
      return snapshotRef.current;
    };

    // ----------------------------------------------------------------------
    // 4. Функция для подписки (subscribe), тоже «стабильная»
    // ----------------------------------------------------------------------
    const subscribe = (onStoreChange: () => void) => {
      // Подписываемся на store, передаём внешний callback
      const unsubscribe = store.subscribe(() => {
        // при каждом вызове подписки берём актуальные paths из ref
        const currentPaths = pathsRef.current;
        // и собираем новый снапшот
        const nextSnapshot = currentPaths.map((p) =>
          store.get(p)
        ) as UseStoreReturnType<P>;
        // сравниваем с тем, что в snapshotRef
        const changed = nextSnapshot.some(
          (v, i) => !Object.is(v, snapshotRef.current[i])
        );
        if (changed) {
          snapshotRef.current = nextSnapshot;
          onStoreChange();
        }
      }, keysRef.current);

      return unsubscribe;
    };

    // ----------------------------------------------------------------------
    // 5. Вызываем useSyncExternalStore с «стабильными» функциями
    // ----------------------------------------------------------------------
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }

  /**
   * Хук для одного поля: [value, setValue]
   * (оставляем без изменений, useCallback здесь не критичен, но тоже можно убрать,
   * если заменять на ref-версию. Для примера оставим так.)
   */
  function useField<P extends string | Accessor<any>>(
    path: P,
    options?: { cacheKeys?: CacheKey<T>[] }
  ) {
    const [value] = useStore([path], options as any);
    const setValue = (newValue: P extends Accessor<infer V> ? V : unknown) => {
      store.update(path, newValue as any);
    };
    return [value, setValue] as const;
  }

  /**
   * Инвалидация кеша для перерисовки компонентов
   */
  function reloadComponents(cacheKeys: CacheKey<T>[]) {
    cacheKeys.forEach((key) => store.invalidate(key));
  }

  /**
   * Хук: вызывает effect-калбэк при изменении значений по указанным путям.
   * Просто использует useStore и стандартный useEffect
   */
  function useStoreEffect<P extends Array<string | Accessor<any>>>(
    paths: [...P],
    effect: (values: UseStoreReturnType<P>) => void,
    options?: { cacheKeys?: CacheKey<T>[] }
  ) {
    const values = useStore(paths, options as any);
    useEffect(() => {
      effect(values);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effect, ...values]);
  }

  store.useEffect = useStoreEffect;
  store.useStore = useStore;
  store.useField = useField;
  store.reloadComponents = reloadComponents;

  return store;
}
