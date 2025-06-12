## Основная идея и архитектура

`createReactStore` — это обёртка над `ObservableStore`, адаптированная для React. Она создаёт хранилище, использующее под капотом прокси и middleware, и предоставляет несколько удобных хуков:

- **`useStore`** — подписка на массив путей (строк или Accessor-ов), возвращающая их текущие значения и обновляющая компонент при изменении.
- **`useField`** — более узкий хук для работы с одним путём (string или Accessor), возвращающий `[value, setValue]`.
- **`useStoreEffect`** — хук-аналог `useEffect`, но срабатывает при изменении значений по указанным путям.
- **`reloadComponents`** — ручная инвалидизация cacheKeys (при необходимости форсировать перерисовку).

Под капотом:

1. Мы создаём `ObservableStore` из библиотеки `@qtpy/state-management-observable` с помощью `createObservableStore(initialState, middlewares, options)`.
2. Затем оборачиваем его React-хуками, основанными на `useSyncExternalStore` и подходе с `ref`-ами для хранения актуальных путей и ключей, без дополнительных мемоизаций функций.
3. Вся подписка происходит через массивы путей вида `Array<string | Accessor<any>>`. Это позволяет подписываться на любое вложенное поле или вычисляемое значение.

Такой подход сохраняет всё преимущество «чистого» ядра `ObservableStore` (гибкие подписки с точностью до пути, middleware, batching, undo/redo и асинхронные обновления), при этом даёт знакомый интерфейс React-хуков и минимизирует boilerplate в компонентах.

---

## 1. Пример создания React-хранилища

```ts
// createReactStore.ts
import { useSyncExternalStore, useRef, useEffect } from "react";
import { createObservableStore } from "@qtpy/state-management-observable";
import {
  Accessor,
  CacheKey,
  Middleware,
  PathOrError,
  PathExtract,
  MaxDepth,
  PathLimitEntry,
} from "@qtpy/state-management-observable/types";
import { ReactStore, UseStoreReturnType } from "./types";

export { createObservableStore };

/**
 * Создаёт ObservableStore и оборачивает его React-хуками
 * @param initialState - начальное состояние
 * @param middlewares - опциональный массив middleware
 * @param options - опции history
 */
export function createReactStore<T extends object, D extends number = MaxDepth>(
  initialState: T,
  middlewares: Middleware<T, D>[] = [],
  options: {
    customLimitsHistory?: (state: T) => PathLimitEntry<T, D>[];
  } = {}
): ReactStore<T, D> {
  const baseStore = createObservableStore<T, D>(
    initialState,
    middlewares,
    options as any
  );
  const store = baseStore as ReactStore<T, D>;

  /**
   * Хук для подписки на несколько путей в сторе, без useCallback
   */
  function useStore<
    P extends readonly (PathOrError<T, string, D> | Accessor<any>)[]
  >(
    paths: P,
    options?: { cacheKeys?: CacheKey<T, D>[] }
  ): UseStoreReturnType<T, P, D> {
    const cacheKeys = options?.cacheKeys ?? [];

    const pathsRef = useRef<P>(paths);
    const keysRef = useRef<CacheKey<T, D>[]>(cacheKeys);
    pathsRef.current = paths;
    keysRef.current = cacheKeys;

    const snapshotRef = useRef<UseStoreReturnType<T, P, D>>(
      paths.map((p) => store.get(p as any)) as UseStoreReturnType<T, P, D>
    );

    const getSnapshot = () => snapshotRef.current;
    const subscribe = (onStoreChange: () => void) => {
      const unsubscribe = store.subscribe(() => {
        const next = pathsRef.current.map((p) =>
          store.get(p as any)
        ) as UseStoreReturnType<T, P, D>;
        if (next.some((v, i) => !Object.is(v, snapshotRef.current[i]))) {
          snapshotRef.current = next;
          onStoreChange();
        }
      }, keysRef.current);
      return unsubscribe;
    };

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }

  /**
   * Хук для одного поля: [value, setValue]
   */
  function useField<R>(
    path: Accessor<R>,
    options?: { cacheKeys?: CacheKey<T, D>[] }
  ): readonly [R, (v: R) => void];

  function useField<P extends string>(
    path: PathOrError<T, P, D>,
    options?: { cacheKeys?: CacheKey<T, D>[] }
  ): readonly [PathExtract<T, D, P>, (v: PathExtract<T, D, P>) => void];

  function useField(path: any, options?: any) {
    const [value] = useStore([path], options);
    const setValue = (newValue: any) => {
      store.update(path, newValue);
    };
    return [value, setValue] as const;
  }

  /**
   * Хук-эффект: вызывает effect при изменении значений по путям
   */
  function useStoreEffect<
    P extends readonly (PathOrError<T, string, D> | Accessor<any>)[]
  >(
    paths: [...P],
    effect: (values: UseStoreReturnType<T, P, D>) => void,
    options?: { cacheKeys?: CacheKey<T, D>[] }
  ) {
    //@ts-ignore
    const values = useStore(paths, options);
    useEffect(() => {
      effect(values);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effect, ...values]);
  }

  const reloadComponents = (cacheKeys: CacheKey<T, D>[]) => {
    cacheKeys.forEach((key) => store.invalidate(key));
  };

  store.useStore = useStore;
  store.useField = useField;
  store.useEffect = useStoreEffect;
  store.reloadComponents = reloadComponents;

  return store;
}
```

---

## 2. API `createReactStore`

### 2.1. `store.get(path: string | Accessor<any>): any`

Получает текущее значение из состояния по указанному пути (строка, например `"user.name"`) или по Accessor-функции. Если путь не найден, возвращает `undefined`.

```ts
const name = userStore.get("user.name");
const firstItem = listStore.get(() => listStore.state.items[0]);
```

---

### 2.2. `store.update(path: string | Accessor<any>, value: any | (cur:any)=>any): void`

Синхронно обновляет значение по заданному пути/Accessor. Если передан колбэк `(cur)=>next`, вычисляет следующую версию. После применения вызываются middleware и нотифицируются подписчики (если не внутри `.batch()`).

```ts
userStore.update("user.age", 25);
userStore.update("user.age", (cur) => cur + 1);
userStore.state.user.name = "Eve"; // то же через Proxy
```

---

### 2.3. `store.batch(callback: () => void): void`

Группирует несколько изменений внутри одного батча. Уведомления подписчикам откладываются до выхода из `callback`.

```ts
store.batch(() => {
  store.update("a", 1);
  store.update("b", 2);
  store.state.count += 1;
});
```

---

### 2.4. `store.asyncUpdate(path, asyncUpdater, options?)`

Асинхронное обновление с возможностью отмены предыдущих запросов (через `AbortSignal`).

- `path` — строка или Accessor.
- `asyncUpdater(currentValue, signal): Promise<nextValue>`.
- `options.abortPrevious?: boolean` (по умолчанию `false`).

```ts
await store.asyncUpdate(
  "items",
  async (cur, signal) => {
    const response = await fetch("/api", { signal });
    return response.json();
  },
  { abortPrevious: true }
);
```

---

### 2.5. `store.cancelAsyncUpdates(path?: string | Accessor<any>): void`

Отменяет все незавершённые `asyncUpdate`. Если указан `path`, отменяет только для этого пути, иначе — для всех.

```ts
store.cancelAsyncUpdates(); // отменить все
store.cancelAsyncUpdates("items"); // отменить только для "items"
```

---

### 2.6. `store.reloadComponents(cacheKeys: Array<string | Accessor<any>>): void`

Инвалидирует указанные `cacheKeys`, чтобы все подписчики, передавшие эти ключи при подписке, получили уведомление и обновили компонент.

```ts
store.reloadComponents(["user.preferences.theme"]);
```

---

### 2.7. `store.useStore(paths: Array<string | Accessor<any>>, options?): any[]`

**React-хук.**

- `paths: Array<string | Accessor<any>>` — список путей (например, `["user.name", "user.age"]` или `[()=>state.count, "todos.length"]`).
- `options.cacheKeys?: Array<string | Accessor<any>>` — дополнительные ключи кеша.

Возвращает массив текущих значений для каждого из путей. Компонент ререндерится, если хотя бы одно значение изменилось (или был вызван `reloadComponents` для одного из cacheKeys).

```tsx
const [name, age] = userStore.useStore(["user.name", "user.age"]);
```

---

### 2.8. `store.useField(path: string | Accessor<any>, options?): [value, setValue]`

**React-хук.**

- `path: string | Accessor<any>` — один путь.
- `options.cacheKeys?: Array<string | Accessor<any>>`.

Возвращает кортеж `[value, setValue]`, где `value` — текущее значение, а `setValue` — функция для его обновления (`store.update(path, newValue)`).

```tsx
const [count, setCount] = counterStore.useField("counter.value");
setCount((c) => c + 1);
```

---

### 2.9. `store.useEffect(paths: Array<string | Accessor<any>>, effect, options?)`

**React-хуковый аналог `useEffect`,** который вызывается, когда хотя бы одно из значений по `paths` меняется (или срабатывает `reloadComponents` по cacheKey).

```tsx
counterStore.useEffect(["counter.value"], ([current]) => {
  console.log("Counter changed to", current);
});
```

---

## 3. Пример использования хуков

Допустим, у нас есть простой стор:

```ts
type UserState = {
  user: { name: string; age: number };
  online: boolean;
};

export const userStore = createReactStore<UserState>({
  user: { name: "Alice", age: 30 },
  online: false,
});
```

И в каком-то компоненте мы хотим подписаться на `user.name` и `online`:

```tsx
import React from "react";
import { userStore } from "./userStore";

export const Profile: React.FC = () => {
  // Берём одновременно user.name и online
  const [name, isOnline] = userStore.useStore(["user.name", "online"]);

  // Подписываемся только на user.age
  const [age, setAge] = userStore.useField("user.age");

  // Хук-эффект: срабатывает, когда возраст меняется
  userStore.useEffect(["user.age"], ([currentAge]) => {
    console.log("Новый возраст пользователя:", currentAge);
  });

  return (
    <div>
      <h2>
        {name} {isOnline ? "🟢" : "🔴"}
      </h2>
      <p>Возраст: {age}</p>
      <button onClick={() => setAge((a) => a + 1)}>Увеличить возраст</button>
    </div>
  );
};
```

Здесь:

- При изменении `user.name` или `online` компонент сразу ререндерится.
- Хук `useField("user.age")` даёт `age` и `setAge` (обновление через `store.update("user.age", newAge)`).
- `useEffect(["user.age"], callback)` будет вызываться при каждом изменении возраста.

---

## 4. Реализация игры 15-Puzzle

Ниже приведён полный пример игры «15-Puzzle», построенной на `createReactStore`. Все пути задаются строками вида `"board.0.0"`, но мы можем также использовать Accessor-функции.

---

### 4.1. Инициализация хранилища и логика

```ts
// store.ts
import { createReactStore } from "@qtpy/state-management-react";

export type PuzzleState = {
  board: (number | null)[][]; // 4×4 поле
  moves: number; // счётчик ходов
  isSolved: boolean; // флаг «решена ли»
};

export const { $, state, ...puzzleStore } = createReactStore<PuzzleState>({
  board: [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, null],
  ],
  moves: 0,
  isSolved: false,
});

/** Проверка, решена ли головоломка */
export const checkSolved = (board: (number | null)[][]): boolean => {
  const flat = board.flat();
  for (let i = 0; i < flat.length - 1; i++) {
    if (flat[i] !== i + 1) return false;
  }
  return true;
};

/** Поиск координат пустой ячейки */
export const findEmptyTile = (board: (number | null)[][]) => {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === null) {
        return { row: r, col: c };
      }
    }
  }
  throw new Error("Пустая ячейка не найдена");
};

/** Проверка возможности перемещения плитки */
export const canMoveTile = (
  row: number,
  col: number,
  empty: { row: number; col: number }
): boolean => {
  return (
    (Math.abs(row - empty.row) === 1 && col === empty.col) ||
    (Math.abs(col - empty.col) === 1 && row === empty.row)
  );
};

/** Сдвиг плитки и обновление состояния */
export const moveTile = (row: number, col: number) => {
  const board = puzzleStore.get("board")!;
  const empty = findEmptyTile(board);
  if (!canMoveTile(row, col, empty)) return;

  puzzleStore.batch(() => {
    // 1) Увеличиваем счётчик
    $.moves += 1; // или state.moves += 1;

    // 2) Меняем местами значения в board
    const tileValue = board[row][col]!;
    puzzleStore.update(`board.${row}.${col}`, null);
    puzzleStore.update((t) => board[t(empty.row)][t(empty.col)], tileValue);

    // 3) Проверяем, решена ли головоломка
    const newBoard = puzzleStore.get(() => $.board)!;
    puzzleStore.update(() => $.isSolved, checkSolved(newBoard));
  });
};

/** Перемешивание плиток */
export const shuffleTiles = () => {
  puzzleStore.batch(() => {
    const flat = puzzleStore.get("board")!.flat();
    const shuffled = [...flat].sort(() => Math.random() - 0.5);

    // Собираем новое поле 4×4
    const newBoard: (number | null)[][] = [];
    shuffled.forEach((val, i) => {
      const r = Math.floor(i / 4);
      if (!newBoard[r]) newBoard[r] = [];
      newBoard[r][i % 4] = val;
    });

    puzzleStore.update("board", newBoard);
    puzzleStore.update("moves", 0);
    puzzleStore.update("isSolved", false);
  });
};
```

---

### 4.2. Компонент плитки `Tile.tsx`

```tsx
// Tile.tsx
import { memo } from "react";
import { puzzleStore, $, moveTile } from "./store";

export const Tile = memo(({ row, col }: { row: number; col: number }) => {
  // Подписываемся только на эту ячейку
  const [value] = puzzleStore.useStore([(t) => $.board[t(row)][t(col)]]);
  // Подписываемся на флаг решения
  const [isSolved] = puzzleStore.useField(() => $.isSolved);

  return (
    <button
      onClick={() => moveTile(row, col)}
      disabled={value === null || isSolved}
      className="tile"
    >
      {value}
    </button>
  );
});
```

- `useStore([(t) => $.board[t(row)][t(col)]])` — подписка на конкретное поле `$.board[t(row)][t(col)`.
- `useField(() => $.isSolved)` — кортеж `[isSolved, setSolved]`, но мы здесь только читаем и отключаем кнопку, если головоломка решена.

---

### 4.3. Основной компонент `PuzzleGame.tsx`

```tsx
// PuzzleGame.tsx
import React from "react";
import { puzzleStore, shuffleTiles } from "./store";
import { Tile } from "./Tile";
import "./styles.css";
export const PuzzleGame: React.FC = () => {
  // Подписываемся сразу на два значения: number of moves и флаг isSolved
  const [moves, isSolved] = puzzleStore.useStore(["moves", "isSolved"]);

  return (
    <div className="puzzle-game">
      <h1>15-Puzzle</h1>
      <div className="controls">
        <button onClick={shuffleTiles}>Shuffle</button>
        <span>Moves: {moves}</span>
      </div>

      {isSolved && <div className="victory">🎉 You won!</div>}

      <div className="board">
        {Array.from({ length: 4 }).map((_, row) => (
          <div key={row} className="row">
            {Array.from({ length: 4 }).map((_, col) => (
              <Tile key={`${row}-${col}`} row={row} col={col} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
```

- При нажатии на кнопку `Shuffle` вызывается `shuffleTiles`, который перемешивает поле и сбрасывает счётчики.
- Каждый `<Tile>` рендерится отдельно и следит только за своим полем и флагом `isSolved`.

---

## Итоги

1. **Структура**. Мы создали `createReactStore`, используем массивы строк `string` или функций `Accessor<any>`.
2. **Хуки**.

   - `useStore(paths, { cacheKeys? })` — подписка на несколько полей.
   - `useField(path, { cacheKeys? })` — подписка на одно поле с функцией для обновления.
   - `useStoreEffect(paths, effect, { cacheKeys? })` — как `useEffect`, но срабатывает при изменении списка путей.
   - `reloadComponents(cacheKeys)` — вручную инвалидирует подписки по переданным ключам.

3. **Игра 15-Puzzle** демонстрирует:

   - Как описать тип состояния и инициализировать его.
   - Как подписать компонент плитки только на нужное поле.
   - Как подписать главный компонент сразу на несколько значений.
   - Как использовать `batch` для групповых обновлений, чтобы минимизировать ререндеры.

Таким образом, `createReactStore` предоставляет полный набор реактивных инструментов для построения динамических React-приложений с минимальным количеством шаблонного кода.
