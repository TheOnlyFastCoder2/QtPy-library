# 🧩 Руководство по использованию `createReactStore`

💎 `createReactStore` — это мощная обёртка над `ObservableStore` с обширными возможностями реактивности, минимальным boilerplate и гибкими подписками.

🔗 Подробнее: [npm @qtpy/state-management-observable](https://www.npmjs.com/package/@qtpy/state-management-observable)

## 📑 Содержание

- 📦 [Свойства хранилища](#-свойства-хранилища)
- 🔍 [Сигнатуры функций и описание](#-сигнатуры-функций-и-описание)
- 🧩 [Пример: Игра 15-Puzzle](#-Пример-Игра-15-Puzzle-)

  - 🎨 [Компонент плитки `Tile.tsx`](#-Компонент-плитки-tiletsx)
  - 🎲 [Основной компонент `PuzzleGame.tsx`](#-Основной-компонент-PuzzleGametsx)

- 🏁 [Итоги](#-итоги)

## 📦 Свойства хранилища

| Свойство | Тип            | Описание                                          |
| -------- | -------------- | ------------------------------------------------- |
| `state`  | `T`            | Прокси-объект для чтения и прямого присваивания.  |
| `$`      | `PathProxy<T>` | Генератор “path trackers” для подписок и`update`. |

---

## 🔍 Сигнатуры функций и описание

### 1. `store.get`

```ts
store.get(path: PathTracker<any, any>): any
```

**Описание:**
Получение текущего значения по указанному пути. Возвращает `undefined`, если значение не найдено.

| Свойство       | Тип                     | Описание                                           |
| -------------- | ----------------------- | -------------------------------------------------- |
| `path`         | `PathTracker<any, any>` | Трассировщик пути к нужному полю состояния         |
| **Возвращает** | `any`                   | Текущее значение по указанному пути или`undefined` |

**Пример использования:**

```ts
const value = puzzleStore.get($board[0][0]);
console.log(value); // 1
```

---

### 2. `store.update`

```ts
store.update(path: PathTracker<any, any>, value: any): void
```

**Описание:**
Обновление значения по указанному пути. Если вызывается вне `batch`, сразу нотифицирует подписчиков.

| Свойство       | Тип                     | Описание                                                     |
| -------------- | ----------------------- | ------------------------------------------------------------ |
| `path`         | `PathTracker<any, any>` | Путь к полю, которое нужно обновить                          |
| `value`        | `any`                   | Новое значение                                               |
| **Возвращает** | `void`                  | После обновления — уведомляет подписчиков (если не в`batch`) |

**Пример использования:**

```ts
puzzleStore.update($moves, puzzleStore.get($moves)! + 1);
```

---

### 3. `store.batch`

```ts
store.batch(callback: () => void): void
```

**Описание:**
Группировка нескольких вызовов `update` и прямых изменений `store.state` в одну реактивную итерацию, чтобы избежать лишних перерисовок.

| Свойство       | Тип          | Описание                                                              |
| -------------- | ------------ | --------------------------------------------------------------------- |
| `callback`     | `() => void` | Функция с набором изменений — несколько`update` и прямых присваиваний |
| **Возвращает** | `void`       | Все уведомления подписчиков будут отложены до конца`batch`            |

**Пример использования:**

```ts
puzzleStore.batch(() => {
  puzzleStore.update($board[0][0], null);
  puzzleStore.update($board[3][3], 1);
  puzzleStore.state.moves += 1;
});
```

---

### 4. `store.asyncUpdate`

> **Назначение:**
> Асинхронное обновление с опциональной отменой «устаревших» запросов. По умолчанию новые вызовы **не** отменяют предыдущие, но если передать `options.abortPrevious = true`, то при старте нового запроса предыдущий будет прерван через `AbortController`.

### ⚙️ Сигнатура

```ts
asyncUpdate<P extends PathTracker<any, any>>(
  path: P,
  asyncUpdater: (
    cur: P[typeof TYPE_SYMBOL],
    signal: AbortSignal
  ) => Promise<P[typeof TYPE_SYMBOL]>,
  options?: {
    /**
     * Если `true`, то перед запуском этого обновления
     * будет отменён (abort) любой ещё не завершившийся
     * предыдущий запрос на том же `path`.
     * По умолчанию — `false`.
     */
    abortPrevious?: boolean
  }
): Promise<void>;
```

### 📝 Описание

- Передаёт в `asyncUpdater` текущий `cur` и `AbortSignal` для отмены.
- **`options.abortPrevious`** = `true` прерывает незавершённые запросы по тому же пути; по умолчанию — `false`, все вызовы выполняются до конца.

### ▶️ Пример

```ts
// Один вызов asyncUpdate без отмены предыдущего
await store.asyncUpdate(
  store.$.user.age,
  async (currentAge, signal) => fetchAgeFromApi(signal),
  { abortPrevious: true }
);
```

---

### 5. `store.reloadComponents`

```ts
store.reloadComponents(cacheKeys: CacheKey<T>[]): void
```

**Описание:**
Принудительная инвалидация подписчиков по переданным ключам или путям. Компоненты, использующие эти `cacheKeys`, будут перерендерены.

| Свойство       | Тип             | Описание                                                                  |
| -------------- | --------------- | ------------------------------------------------------------------------- |
| `cacheKeys`    | `CacheKey<T>[]` | Массив ключей или путей для ручной инвалидации подписок                   |
| **Возвращает** | `void`          | Принудительно перерисовывает компоненты, использующие указанные cacheKeys |

**Пример использования:**

```ts
puzzleStore.reloadComponents([$board, $moves]);
```

---

### 6. `store.useStore`

```ts
store.useStore(
  paths: PathTracker<any, any>[],
  options?: { cacheKeys?: CacheKey<T>[] }
): any[]
```

**Описание:**
React-хук для подписки на массив путей. При изменении любого из путей или указанных `cacheKeys` хук инициирует ререндер компонента, возвращая массив текущих значений.

| Свойство       | Тип                             | Описание                                                           |
| -------------- | ------------------------------- | ------------------------------------------------------------------ |
| `paths`        | `PathTracker<any, any>[]`       | Массив путей для подписки                                          |
| `options`      | `{ cacheKeys?: CacheKey<T>[] }` | Опционально: дополнительные ключи для фильтрации подписок          |
| **Возвращает** | `any[]`                         | Массив текущих значений по каждому пути; обновляется при изменении |

**Пример использования:**

```tsx
const [moves, isSolved] = puzzleStore.useStore([$moves, $isSolved], {
  cacheKeys: [$board],
});
```

---

### 7. `store.useField`

```ts
store.useField(
  path: PathTracker<any, any>,
  options?: { cacheKeys?: CacheKey<T>[] }
): [value: any, setValue: (v: any) => void]
```

**Описание:**
Удобный React-хук для одного пути. Возвращает кортеж — текущее значение и функцию для его обновления.

| Свойство       | Тип                             | Описание                                                  |
| -------------- | ------------------------------- | --------------------------------------------------------- |
| `path`         | `PathTracker<any, any>`         | Путь к одиночному полю состояния                          |
| `options`      | `{ cacheKeys?: CacheKey<T>[] }` | Опционально: дополнительные ключи для фильтрации подписок |
| **Возвращает** | `[any, (v: any) => void]`       | Кортеж: текущее значение и функция для его обновления     |

**Пример использования:**

```tsx
const [moves, setMoves] = puzzleStore.useField($moves);
setMoves((m) => m + 1);
```

---

### 8. Опция `cacheKeys` в `subscribe`, `useStore`, `useField`

```ts
// Пример использования cacheKeys
const [board] = puzzleStore.useStore([$board], {
  cacheKeys: [() => "custom-key"],
});
// ... в другом месте:
puzzleStore.reloadComponents(["custom-key"]);
```

**Описание:**
Массив дополнительных ключей (или путей) для фильтрации подписок. Подписчик получит уведомление при изменении основного пути или при инвалидации по любому из `cacheKeys`.

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

### 🎨 Компонент плитки `Tile.tsx`

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

### 🎲 Основной компонент `PuzzleGame.tsx`

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
