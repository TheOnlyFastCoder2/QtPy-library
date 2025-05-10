# 🧩 Руководство по использованию `createReactStore`

💎 `createReactStore` — это мощная обёртка над `ObservableStore` с обширными возможностями реактивности, минимальным boilerplate и гибкими подписками.

🔗 Подробнее: [npm @qtpy/state-management-observable](https://www.npmjs.com/package/@qtpy/state-management-observable)

## 📑 Содержание

- 🔍 [Сигнатуры функций и описание](#-сигнатуры-функций-и-описание)
- 🧩 [Пример: Игра 15-Puzzle 🚀💡](#-пример-игра-15-puzzle-)
  - 🎨 [Компонент плитки `Tile.tsx`](#-компонент-плитки-tiletsx)
  - 🎲 [Основной компонент `PuzzleGame.tsx`](#-основной-компонент-puzzlegametsx)
- 🏁 [Итоги](#-итоги)

---

## 🔍 Сигнатуры функций и описание

### 1. `store.get(path: PathTracker<any, any>): any`

**Описание:**
Получение текущего значения по указанному пути. Возвращает `undefined`, если значение не найдено.

**Пример использования:**

```ts
const value = puzzleStore.get($board[0][0]);
console.log(value); // 1
```

---

### 2. `store.update(path: PathTracker<any, any>, value: any): void`

**Описание:**
Обновление значения по указанному пути. Если вызывается вне `batch`, сразу нотифицирует подписчиков.

**Пример использования:**

```ts
puzzleStore.update($moves, puzzleStore.get($moves)! + 1);
```

---

### 3. `store.batch(callback: () => void): void`

**Описание:**
Группировка нескольких вызовов `update` и прямых изменений `store.state` в одну реактивную итерацию, чтобы избежать лишних перерисовок.

**Пример использования:**

```ts
puzzleStore.batch(() => {
  puzzleStore.update($board[0][0], null);
  puzzleStore.update($board[3][3], 1);
  puzzleStore.state.moves += 1;
});
```

---

### 4. `store.asyncUpdate(path: PathTracker<any, any>, updater: (current: any, signal: AbortSignal) => Promise<any>): Promise<void>`

**Описание:**
Асинхронное обновление с поддержкой отмены через `AbortSignal`. Подходит для загрузки данных или задержанных эффектов.

**Пример использования:**

```ts
await puzzleStore.asyncUpdate($board, async (cur, signal) => {
  const newData = await fetchBoard(signal);
  return newData;
});
```

---

### 5. `store.reloadComponents(cacheKeys: CacheKey<T>[]): void`

**Описание:**
Принудительная инвалидация подписчиков по переданным ключам или путям. Компоненты, использующие эти `cacheKeys`, будут перерендерены.

**Пример использования:**

```ts
puzzleStore.reloadComponents([$board, $moves]);
```

---

### 6. `store.useStore(paths: PathTracker<any, any>[], options?: { cacheKeys?: CacheKey<T>[] }): any[]`

**Описание:**
React-хук для подписки на массив путей. При изменении любого из путей или указанных `cacheKeys` хук инициирует ререндер компонента, возвращая массив текущих значений.

**Пример использования:**

```tsx
const [moves, isSolved] = puzzleStore.useStore([$moves, $isSolved], {
  cacheKeys: [$board],
});
```

---

### 7. `store.useField(path: PathTracker<any, any>, options?: { cacheKeys?: CacheKey<T>[] }): [value: any, setValue: (v: any) => void]`

**Описание:**
Удобный React-хук для одного пути. Возвращает кортеж — текущее значение и функцию для его обновления.

**Пример использования:**

```tsx
const [moves, setMoves] = puzzleStore.useField($moves);
setMoves((m) => m + 1);
```

---

### 8. Опция `cacheKeys` в `subscribe`, `useStore`, `useField`

**Описание:**
Массив дополнительных ключей (или путей) для фильтрации подписок. Подписчик получит уведомление при изменении основного пути или при инвалидации по любому из `cacheKeys`.

**Пример использования:**

```tsx
const [board] = puzzleStore.useStore([$board], {
  cacheKeys: [() => "custom-key"],
});
// ... в другом месте:
puzzleStore.reloadComponents(["custom-key"]);
```

---

## 🧩 Пример: Игра 15-Puzzle 🚀💡

Ниже показан один файл `store.ts`, где объединены инициализация хранилища и вся логика игры:

```ts
// store.ts
import { createReactStore } from "@qtpy/state-management-react";

// Описание состояния головоломки
export type PuzzleState = {
  board: (number | null)[][]; // 4×4 поле
  moves: number; // счётчик ходов
  isSolved: boolean; // флаг "решена ли"
};

// Создаём реактивное хранилище
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

// Удобные прокси для путей
export const $board = puzzleStore.$.board;
export const $moves = puzzleStore.$.moves;
export const $isSolved = puzzleStore.$.isSolved;

// ------------------------------
// Функции с логикой игры
// ------------------------------

type Board = (number | null)[][];

/** Проверка, решена ли головоломка */
export const checkSolved = (board: Board): boolean => {
  const flat = board.flat();
  for (let i = 0; i < flat.length - 1; i++) {
    if (flat[i] !== i + 1) return false;
  }
  return true;
};

/** Поиск координат пустой ячейки */
export const findEmptyTile = (board: Board) => {
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      if (board[row][col] === null) {
        return { row, col };
      }
    }
  }
  throw new Error("No empty tile found");
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
  const board = puzzleStore.get($board)!;
  const empty = findEmptyTile(board);
  if (!canMoveTile(row, col, empty)) return;

  puzzleStore.batch(() => {
    // Увеличиваем счётчик ходов
    puzzleStore.state.moves += 1;

    // Меняем местами значения в board
    const tileValue = board[row][col]!;
    puzzleStore.update($board[row][col], null);
    puzzleStore.update($board[empty.row][empty.col], tileValue);

    // Проверяем, решена ли головоломка
    const newBoard = puzzleStore.get($board)!;
    puzzleStore.update($isSolved, checkSolved(newBoard));
  });
};

/** Перемешивание плиток */
export const shuffleTiles = () => {
  puzzleStore.batch(() => {
    const flat = puzzleStore.get($board)!.flat();
    const shuffled = flat.sort(() => Math.random() - 0.5);

    // Собираем новое поле 4×4
    const newBoard: Board = [];
    shuffled.forEach((val, i) => {
      const r = Math.floor(i / 4);
      if (!newBoard[r]) newBoard[r] = [];
      newBoard[r][i % 4] = val;
    });

    puzzleStore.update($board, newBoard);
    puzzleStore.update($moves, 0);
    puzzleStore.update($isSolved, false);
  });
};
```

### 4. 🎨 Компонент плитки `Tile.tsx`

```tsx
// Tile.tsx
import { memo } from "react";
import { $board, $isSolved, moveTile, puzzleStore } from "./store";

export const Tile = memo(({ row, col }: { row: number; col: number }) => {
  const [value] = puzzleStore.useStore([$board[row][col]]);
  const [isSolved] = puzzleStore.useField($isSolved);

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

### 5. 🎲 Основной компонент `PuzzleGame.tsx`

```tsx
// PuzzleGame.tsx
import { $isSolved, $moves, puzzleStore, shuffleTiles } from "./store";
import { Tile } from "./Tile";

export const PuzzleGame = () => {
  const [moves, isSolved] = puzzleStore.useStore([$moves, $isSolved]);

  return (
    <div className="puzzle-game">
      <h1>15-Puzzle</h1>
      <div className="controls">
        <button onClick={shuffleTiles}>Shuffle</button>
        <span>Moves: {moves}</span>
      </div>
      {isSolved && <div className="victory">You won! 🎉</div>}
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

## 🏁 Итоги

- **Минимальная связка**: `createReactStore` вкупе с `store.$`, `useStore`, `useField` и `batch` позволяет быстро и гибко работать с состоянием.
- **Гранулярная реактивность**: компоненты подписываются только на необходимые пути, что минимизирует лишние обновления.
- **Поддержка асинхрона**: `asyncUpdate` с отменой через `AbortSignal` делает работу с данными из сети удобной.
- **Инвалидация через cacheKeys**: ручная или автоматическая фильтрация вызовов подписчиков для оптимизации.
