import {
  useSyncExternalStore,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
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
   * Хук для подписки на несколько путей в сторе
   */
  function useStore<P extends Array<string | Accessor<any>>>(
    paths: [...P],
    options?: { cacheKeys?: CacheKey<T>[] }
  ): UseStoreReturnType<P> {
    const cacheKeys = options?.cacheKeys ?? [];

    // Объединяем cacheKeys и пути, чтобы подписка была отфильтрована нужными ключами
    const keys = useMemo(() => [...cacheKeys, ...paths], [cacheKeys, paths]);

    // Функция, возвращающая текущие значения по всем путям
    const getSnapshotRaw = useCallback(
      () => paths.map((p) => store.get(p)) as UseStoreReturnType<P>,
      [paths]
    );

    // Реф для хранения последнего снапшота
    const snapshotRef = useRef<UseStoreReturnType<P>>(getSnapshotRaw());

    // Функция подписки для useSyncExternalStore
    const subscribe = useCallback(
      (onStoreChange: () => void) => {
        const unsubscribe = store.subscribe(() => {
          const nextSnapshot = getSnapshotRaw();
          const changed = nextSnapshot.some(
            (v, i) => !Object.is(v, snapshotRef.current[i])
          );
          if (changed) {
            snapshotRef.current = nextSnapshot;
            onStoreChange();
          }
        }, keys);
        return unsubscribe;
      },
      [getSnapshotRaw, keys]
    );

    const getSnapshot = useCallback(() => snapshotRef.current, []);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }

  /**
   * Хук для одного поля: [value, setValue]
   */
  function useField<P extends string | Accessor<any>>(
    path: P,
    options?: { cacheKeys?: CacheKey<T>[] }
  ) {
    const [value] = useStore([path], options as any);
    const setValue = useCallback(
      (newValue: P extends Accessor<infer V> ? V : unknown) => {
        store.update(path, newValue as any);
      },
      [path]
    );
    return [value, setValue] as const;
  }

  /**
   * Инвалидация кеша для перерисовки компонентов
   */
  function reloadComponents(cacheKeys: CacheKey<T>[]) {
    cacheKeys.forEach((key) => store.invalidate(key));
  }

  /**
   * хук: вызывает effect-калбэк при изменении значений по указанным путям.
   *
   * @param paths — массив путей (строка или Accessor)
   * @param effect — функция, которая будет вызвана при изменении любого из значений
   * @param options.cacheKeys — опциональные cacheKeys для дополнительной фильтрации подписки
   */
  function useStoreEffect<P extends Array<string | Accessor<any>>>(
    paths: [...P],
    effect: (values: UseStoreReturnType<P>) => void,
    options?: { cacheKeys?: CacheKey<T>[] }
  ) {
    // Подписываемся на те же пути, что и в useStore
    const values = useStore(paths, options as any);

    // Вызываем переданный эффект всякий раз, когда хотя бы одно значение из массива поменялось
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
