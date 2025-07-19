# Документация по `createReactStore`

1. [Основная идея и архитектура](#основная-идея-и-архитектура)  
   1.1. [Что такое `createReactStore`](#основная-идея-и-архитектура)  
   1.2. [Как устроены подписки и хуки](#как-устроены-подписки-и-хуки)  
   1.3. [Преимущества и особенности подхода](#преимущества-и-особенности-подхода)
2. [API `createReactStore`](#1-api-createreactstore)  
   2.1. [`store.reloadComponents(cacheKeys)`](#16-storereloadcomponentspathOrAccessor)  
   2.2. [`store.useStore(paths, options?)`](#17-storeusestorepathOrAccessor-options)  
   2.3. [`store.useField(path, options?)`](#18-storeusefieldpathOrAccessor-options)  
   2.4. [`store.useEffect(paths, effect, options?)`](#19-storeuseeffectpathOrAccessor-effect-options)

3. [Примеры использования](#2-пример-использования-хуков)  
   3.1. [Типовое состояние `UserStore`](#21-типовое-состояние-userstore)  
   3.2. [Компонент `Profile`](#22-компонент-profile)

4. [Реализация игры 15-Puzzle](#3-реализация-игры-15-puzzle)  
   4.1. [Логика хранилища и действий](#31-инициализация-хранилища-и-логика)  
   4.2. [Компонент `Tile`](#32-компонент-плитки-tiletsx)  
   4.3. [Компонент `PuzzleGame`](#33-основной-компонент-puzzlegametsx)

5. [Итоги](#итоги)

---

## Основная идея и архитектура

`createReactStore` — это обёртка над [`@qtpy/state-management-observable`](https://www.npmjs.com/package/@qtpy/state-management-observable), адаптированная для React. Она создаёт хранилище, использующее под капотом прокси и middleware, и предоставляет удобные React-хуки:

### Как устроены подписки и хуки

- **`useStore`** — подписка на массив путей (строк или Accessor-ов), возвращающая их текущие значения и обновляющая компонент при изменении.
- **`useField`** — хук для работы с одним путём (строкой или Accessor), возвращающий `[value, setValue]`, где `setValue` имеет метод `.quiet()` для "тихого" обновления.
- **`useEffect`** (реализован как `useStoreEffect`) — аналог `useEffect`, но срабатывает при изменении значений по указанным путям.
- **`reloadComponents`** — ручная инвалидизация `cacheKeys` для форсированной перерисовки подписчиков.

### Преимущества и особенности подхода:

1. Используется `createObservableStore` из `@qtpy/state-management-observable`.
2. Реализация React-хуков основана на `useSyncExternalStore`, с хранением путей и кешей через `useRef` для минимизации лишних подписок и ререндеров.
3. Подписка осуществляется через массив путей вида `Array<string | Accessor<any>>`, что позволяет отслеживать вложенные и вычисляемые значения.

Такой подход сохраняет преимущество "чистого" ядра `ObservableStore` (подписки по пути, middleware, batching, undo/redo, async), но даёт удобный интерфейс React-хуков с минимальным boilerplate.

---

## 1. API `createReactStore`

### 1.6. `store.reloadComponents(pathOrAccessor[])`

Инвалидирует указанные `cacheKeys`, чтобы подписанные компоненты перерисовались.

```ts
store.reloadComponents(["user.preferences.theme"]);
```

---

### 1.7. `store.useStore(pathOrAccessor[], options?)`

Хук React для подписки на массив значений.

- `paths` — список путей (строк или Accessor).
- `options.cacheKeys?` — опциональные ключи кеша для ручной инвалидизации.

```tsx
const [name, age] = userStore.useStore(["user.name", "user.age"]);
```

---

### 1.8. `store.useField(pathOrAccessor, options?)`

Хук React для одного значения. Возвращает кортеж `[value, setValue]`, где `setValue` — функция с методом `.quiet()`.

```tsx
const [count, setCount] = counterStore.useField("counter.value");

setCount(42); // обычное обновление
setCount.quiet(43); // тихое обновление (без ререндеров)
```

---

### 1.9. `store.useEffect(pathOrAccessor[], effect, options?)`

Хук, вызывающий `effect`, если изменилось хотя бы одно из значений по путям.

```tsx
userStore.useEffect(["user.age"], ([age]) => {
  console.log("Возраст изменился:", age);
});
```

---

## 2. Пример использования хуков

### 2.1. [Типовое состояние `UserStore`](#типовое-состояние-userstore)

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

### 2.2. [Компонент `Profile`](#компонент-profile)

```tsx
const Profile: React.FC = () => {
  const [name, isOnline] = userStore.useStore(["user.name", "online"]);
  const [age, setAge] = userStore.useField("user.age");

  userStore.useEffect(["user.age"], ([age]) => {
    console.log("Возраст пользователя изменился:", age);
  });

  return (
    <div>
      <h2>
        {name} {isOnline ? "🟢" : "🔴"}
      </h2>
      <p>Возраст: {age}</p>
      <button onClick={() => setAge((a) => a + 1)}>+</button>
    </div>
  );
};
```

Здесь:

- При изменении `user.name` или `online` компонент сразу ререндерится.
- Хук `useField("user.age")` даёт `age` и `setAge` (обновление через `store.update("user.age", newAge)`).
- `useEffect(["user.age"], callback)` будет вызываться при каждом изменении возраста.

---

## 3. Реализация игры 15-Puzzle

Ниже приведён полный пример игры «15-Puzzle», построенной на `createReactStore`. Все пути задаются строками вида `"board.0.0"`, но мы можем также использовать Accessor-функции.

---

### 3.1. Инициализация хранилища и логика

```ts
// store.ts
import { createReactStore } from "@qtpy/state-management-react";

export type PuzzleState = {
  board: (number | null)[][]; // 4×4 поле
  moves: number; // счётчик ходов
  isSolved: boolean; // флаг «решена ли»
};

export const puzzleStore = createReactStore<PuzzleState>({
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
    puzzleStore.$.moves += 1;

    // 2) Меняем местами значения в board
    const tileValue = board[row][col]!;
    puzzleStore.update(`board.${row}.${col}`, null);
    puzzleStore.update(
      ($, t) => $.board[t(empty.row)][t(empty.col)],
      tileValue
    );

    // 3) Проверяем, решена ли головоломка
    const newBoard = puzzleStore.get(() => $.board)!;
    puzzleStore.update(($) => $.isSolved, checkSolved(newBoard));
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

### 3.2. Компонент плитки `Tile.tsx`

```tsx
// Tile.tsx
import { memo } from "react";
import { puzzleStore, moveTile } from "./store";

export const Tile = memo(({ row, col }: { row: number; col: number }) => {
  // Подписываемся только на эту ячейку
  const [value] = puzzleStore.useStore([($, t) => $.board[t(row)][t(col)]]);
  // Подписываемся на флаг решения
  const [isSolved] = puzzleStore.useField(($) => $.isSolved);

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

- `useStore([($, t) => $.board[t(row)][t(col)]])` — подписка на конкретное поле `puzzleStore.$.board[t(row)][t(col)`.
- `useField(($) => $.isSolved)` — кортеж `[isSolved, setSolved]`, но мы здесь только читаем и отключаем кнопку, если головоломка решена.

---

### 3.3. Основной компонент `PuzzleGame.tsx`

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
1. **Хуки**.

   - `useStore(paths, { cacheKeys? })` — подписка на несколько полей.
   - `useField(path, { cacheKeys? })` — подписка на одно поле с функцией для обновления.
   - `useStoreEffect(paths, effect, { cacheKeys? })` — как `useEffect`, но срабатывает при изменении списка путей.
   - `reloadComponents(cacheKeys)` — вручную инвалидирует подписки по переданным ключам.

1. **Игра 15-Puzzle** демонстрирует:

   - Как описать тип состояния и инициализировать его.
   - Как подписать компонент плитки только на нужное поле.
   - Как подписать главный компонент сразу на несколько значений.
   - Как использовать `batch` для групповых обновлений, чтобы минимизировать ререндеры.

Таким образом, `createReactStore` предоставляет полный набор реактивных инструментов для построения динамических React-приложений с минимальным количеством шаблонного кода.
