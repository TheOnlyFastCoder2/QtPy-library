Конечно! Ниже добавлен **раздел "Содержание"** с якорными ссылками для быстрого перехода к соответствующим темам:

---

# 📚 Содержание

- [📦 Введение](#-документация-по-createreactstore)
- [🔧 Основная функция `createReactStore`](#-основная-функция)
- [🧩 Хук `useStore`](#-хук-usestore)
- [🧷 Хук `useField`](#-хук-usefield)
- [🔁 Метод `reloadComponents`](#-метод-reloadcomponents)
- [🧠 Что такое `CacheKey`?](#-что-такое-cachekey)
- [🚀 Продвинутые возможности](#-продвинутые-возможности)
- [🎯 Когда использовать?](#-когда-использовать)
- [🧪 Пример использования](#-пример-использования)
- [🔑 Примеры работы с `cacheKeys`](#-примеры-работы-с-cachekeys)

  - [✅ Пример 1: `useStore`](#-пример-1-использование-cachekeys-в-usestore)
  - [✅ Пример 2: `useField`](#-пример-2-использование-cachekeys-в-usefield)
  - [🧠 Пример 3: Ключ-функция](#-пример-3-ключ-функция)
  - [🧰 Пример 4: Комбинированные ключи](#-пример-4-комбинированные-cachekeys--paths)

- [⚡ Почему это важно?](#-почему-это-важно)
- [📌 Заключение](#-заключение)
- [🧩 Финальный пример игры 15-пазл](#-финальный-пример-игры-15-пазл)

  - [`store.ts`](#storets--глобальное-хранилище-и-логика-игры)
  - [`Tile.tsx`](#tiletsx--отображение-одной-плитки)
  - [`PuzzleGame.tsx`](#puzzlegametsx--основной-компонент-игры)
  - [`styles.css`](#stylescss--стили-игры)

- [🧠 Как `createReactStore` делает код чище](#-как-createreactstore-делает-код-чище-и-разработку-проще)

  - [`createReactStore`](#storets--создание-и-использование-хранилища)
  - [Обновление `update`](#-обновление-значений-с-update)
  - [Группировка `batch`](#-группировка-обновлений-с-batch)
  - [Чтение `get`](#-чтение-состояния-с-get)
  - [Подписка `useStore`](#-подписка-на-части-состояния-с-usestore)
  - [Подписка + обновление `useField`](#-подписка--обновление-с-usefield)
  - [Ручной вызов `reloadComponents`](#-ручной-вызов-подписчиков-с-reloadcomponents)

---

# 📦 Документация по `createReactStore`

`createReactStore` — это высокоуровневая обёртка над `@qtpy/state-management-observable/types`, обеспечивающая удобную интеграцию реактивного хранилища состояния с компонентами **React**. Библиотека создана с учётом производительности, предсказуемости и масштабируемости.

---

## 🔧 Основная функция

```ts
createReactStore<T extends object>(initialState: T): ReactStore<T>
```

Создаёт реактивное хранилище с полным API управления состоянием и хуками для React-компонентов.

### Параметры:

- `initialState` — начальное состояние типа `T`.

### Возвращает:

Экземпляр `ReactStore<T>`, содержащий:

- Методы хранилища (`get`, `update`, `subscribe`, `transaction`, и др.)
- Специализированные хуки: `useStore`, `useField`
- Метод `reloadComponents` для принудительной перерисовки компонентов по `cacheKeys`.

---

## 🧩 Хук `useStore`

```ts
useStore<P extends Paths<T>[]>(paths: [...P], options?: {
  cacheKeys?: CacheKey<T>[];
}): UseStoreReturnType<T, P>
```

Хук для подписки на несколько путей состояния.

### Аргументы:

- `paths`: массив путей до нужных данных в состоянии (например, `["user.name", "settings.theme"]`)
- `options.cacheKeys`: опциональные ключи кэширования для оптимизации обновлений

### Возвращает:

Массив значений, соответствующих указанным путям.

### Пример:

```tsx
const [name, theme] = store.useStore(["user.name", "settings.theme"]);
```

---

## 🧷 Хук `useField`

```ts
useField<P extends Paths<T>>(path: P, options?: {
  equalityFn?: (a: any, b: any) => boolean;
  cacheKeys?: CacheKey<T>[];
}): readonly [value: ExtractPathType<T, P>, setValue: (val: ExtractPathType<T, P> | UpdateFn<T, P>) => void]
```

Удобный хук для подписки на отдельное поле и возможности его обновления.

### Аргументы:

- `path`: путь до нужного поля
- `equalityFn`: опциональная функция сравнения для предотвращения лишних рендеров
- `cacheKeys`: ключи для кэш-подписки

### Возвращает:

Кортеж из текущего значения и функции для его обновления.

### Пример:

```tsx
const [name, setName] = store.useField("user.name");

setName("Новое имя");
```

---

## 🔁 Метод `reloadComponents`

```ts
reloadComponents(cacheKeys: CacheKey<T>[]): void
```

Принудительно триггерит перерисовку всех компонентов, подписанных на указанные `cacheKeys`.

### Пример:

```ts
store.reloadComponents([["user", "name"]]);
```

---

## 🧠 Что такое `CacheKey`?

`CacheKey` — это:

- путь (`Paths<T>`, например: `"user.name"`)
- массив строк (`["user", "name"]`)
- функция `(state: T) => string`

Позволяет идентифицировать, изменилось ли логически важное подмножество состояния.

Это мощный способ **оптимизировать перерисовки компонентов**, даже если вы следите за множеством путей.

---

## 🚀 Продвинутые возможности

Так как `createReactStore` построен на `createObservableStore`, вы получаете весь его API:

### ✅ Поддержка:

- `batch` — пакетные обновления
- `updateAsync`, `updateManyAsync` — асинхронные обновления
- `optimisticUpdate` — оптимистичные обновления с откатом при ошибке
- `debouncedUpdate` — отложенные обновления с отменой предыдущих
- `transaction` — атомарные цепочки действий
- `subscribeToPath` — подписка на конкретный путь
- `invalidateCache` — принудительная инвалидация подписчиков

---

## 🎯 Когда использовать?

`createReactStore` идеально подходит, если вы:

- хотите централизованное управление состоянием без лишней магии
- предпочитаете явные обновления (path-based)
- хотите детальную подписку на подмножества состояния
- заботитесь о производительности и контроле над обновлениями

---

## 🧪 Пример использования

```tsx
const store = createReactStore({
  user: { name: "Аня", age: 30 },
  settings: { theme: "light" },
});

function Profile() {
  const [name, setName] = store.useField("user.name");

  return (
    <div>
      <p>Имя: {name}</p>
      <button onClick={() => setName("Олег")}>Изменить имя</button>
    </div>
  );
}
```

Отлично! Давай добавим примеры использования **ключей кэширования (cacheKeys)** в библиотеке `createReactStore`. Они особенно полезны для **точечной перерисовки компонентов** и **повторного использования подписок**.

---

# 🔑 Примеры работы с `cacheKeys`

## 📌 Что такое `cacheKeys`?

Ключи кэширования — это **механизм управления подписками**, позволяющий:

- группировать подписки под логическим именем
- обновлять несколько компонентов сразу по ключу, а не по пути
- вручную "инвалидировать" часть подписчиков, даже если значение не изменилось

---

## ✅ Пример 1: Использование `cacheKeys` в `useStore`

```tsx
const store = createReactStore({
  user: { name: "Аня", age: 30 },
  settings: { theme: "light" },
});

function UserNameDisplay() {
  const [name] = store.useStore(["user.name"], {
    cacheKeys: [["user", "profile"]], // логический ключ
  });

  return <p>Имя пользователя: {name}</p>;
}
```

Если потом вызвать:

```ts
store.reloadComponents([["user", "profile"]]);
```

Компонент `UserNameDisplay` **форсированно перерисуется**, даже если значение `user.name` не изменилось.

---

## ✅ Пример 2: Использование `cacheKeys` в `useField`

```tsx
function ThemeToggle() {
  const [theme, setTheme] = store.useField("settings.theme", {
    cacheKeys: [["ui", "theme"]],
  });

  return (
    <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
      Переключить тему ({theme})
    </button>
  );
}
```

Если вы хотите "освежить" все компоненты, подписанные на тему, можно вызвать:

```ts
store.reloadComponents([["ui", "theme"]]);
```

---

## 🧠 Пример 3: Ключ-функция

```tsx
const store = createReactStore({
  user: { name: "Иван", status: "online" },
});

const cacheKeyFn = (state: typeof store.getState) => {
  return state.user.status === "online" ? "online-users" : "offline-users";
};

function UserStatusBadge() {
  const [status] = store.useStore(["user.status"], {
    cacheKeys: [cacheKeyFn],
  });

  return <div>{status === "online" ? "🟢 В сети" : "⚪ Не в сети"}</div>;
}
```

Теперь вы можете перерисовать все компоненты, зависящие от "логического" статуса:

```ts
store.reloadComponents(["online-users"]);
```

---

## 🧰 Пример 4: Комбинированные `cacheKeys` + `paths`

```tsx
function ComponentA() {
  const [theme, name] = store.useStore(["settings.theme", "user.name"], {
    cacheKeys: [
      ["app", "visuals"],
      ["user", "identity"],
    ],
  });

  return (
    <div>
      {name} использует тему: {theme}
    </div>
  );
}
```

Вызов:

```ts
store.reloadComponents([["user", "identity"]]);
```

триггерит `ComponentA`, даже если `settings.theme` не изменился — потому что `cacheKeys` используются как дополнительная точка подписки.

---

## ⚡ Почему это важно?

Использование `cacheKeys` особенно актуально для:

- сложных компонентных деревьев (меньше подписок = быстрее)
- кэшируемых блоков (например, `React.memo`, `Suspense`)
- управления глобальными событиями (например, “тема приложения изменилась”)

---

## 📌 Заключение

`createReactStore` — это мощный инструмент для работы с состоянием в React, сочетающий **реактивность**, **гибкость подписок** и **гарантию контроля над обновлениями**. Он легко масштабируется, дружелюбен к производительности и даёт возможность точечно оптимизировать ререндеры.

---

Отлично! В завершение — полный **финальный пример** игры "15-пазл", основанный на `createReactStore`. Этот пример полностью функционален, **иллюстрирует все возможности библиотеки**, и при этом остаётся лаконичным и читаемым благодаря архитектуре с `createReactStore`.

---

# 🧩 Финальный пример игры 15-пазл

---

## `store.ts` — глобальное хранилище и логика игры

```ts
import { createReactStore } from "./createReactStore";

type Cell = number | null;
type Board = Cell[][];

export type PuzzleState = {
  board: Cell[][];
  moves: number;
  isSolved: boolean;
};

// Создание реактивного хранилища состояния игры
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

// Проверка на решённость
const checkSolved = (board: Board): boolean => {
  const flat = board.flat();
  return flat.every((val, i) =>
    i === flat.length - 1 ? val === null : val === i + 1
  );
};

// Поиск пустой плитки
const findEmpty = (board: Board) => {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (board[r][c] === null) return { row: r, col: c };
  throw new Error("Empty tile not found");
};

// Проверка возможности хода
const canMove = (r: number, c: number, empty: { row: number; col: number }) =>
  (Math.abs(r - empty.row) === 1 && c === empty.col) ||
  (Math.abs(c - empty.col) === 1 && r === empty.row);

// Ход игрока
export const moveTile = (row: number, col: number) => {
  const board = puzzleStore.get("board");
  const empty = findEmpty(board);
  if (canMove(row, col, empty)) {
    puzzleStore.batch(() => {
      puzzleStore.update(`board.${empty.row}.${empty.col}`, board[row][col]);
      puzzleStore.update(`board.${row}.${col}`, null);
      puzzleStore.update("moves", (m) => m + 1);
      puzzleStore.update("isSolved", checkSolved(board));
    });
  }
};

// Перемешивание плиток
export const shuffle = () => {
  puzzleStore.batch(() => {
    const flat = puzzleStore
      .get("board")
      .flat()
      .sort(() => Math.random() - 0.5);
    const board: Board = [];
    for (let i = 0; i < 4; i++) {
      board.push(flat.slice(i * 4, i * 4 + 4));
    }
    puzzleStore.update("board", board);
    puzzleStore.update("moves", 0);
    puzzleStore.update("isSolved", false);
  });
};
```

---

## `Tile.tsx` — отображение одной плитки

```tsx
import { memo } from "react";
import { moveTile, puzzleStore } from "./store";

export const Tile = memo(({ row, col }: { row: number; col: number }) => {
  const [value] = puzzleStore.useStore([`board.${row}.${col}`]);
  const [isSolved] = puzzleStore.useStore(["isSolved"]);

  return (
    <button
      className="tile"
      onClick={() => moveTile(row, col)}
      disabled={value === null || isSolved}
    >
      {value}
    </button>
  );
});
```

---

## `PuzzleGame.tsx` — основной компонент игры

```tsx
import "./styles.css";
import { puzzleStore, shuffle } from "./store";
import { Tile } from "./Tile";

export const PuzzleGame = () => {
  const [moves, isSolved] = puzzleStore.useStore(["moves", "isSolved"]);

  return (
    <div className="puzzle-game">
      <h1>15 Puzzle</h1>
      <div className="controls">
        <button onClick={shuffle}>Shuffle</button>
        <span>Moves: {moves}</span>
      </div>
      {isSolved && <div className="victory">You won! 🎉</div>}
      <div className="board">
        {Array.from({ length: 4 }, (_, row) => (
          <div key={row} className="row">
            {Array.from({ length: 4 }, (_, col) => (
              <Tile key={`${row}-${col}`} row={row} col={col} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## `styles.css` — стили игры

```css
.puzzle-game {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  font-family: sans-serif;
}

.controls {
  display: flex;
  gap: 16px;
  align-items: center;
}

.board {
  display: grid;
  grid-template-rows: repeat(4, 80px);
  grid-template-columns: repeat(4, 80px);
  gap: 4px;
}

.row {
  display: contents;
}

.tile {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #6200ee;
  color: white;
  font-size: 24px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: transform 0.2s;
}

.tile:disabled {
  background: #121212;
  cursor: not-allowed;
}

.tile:hover:not(:disabled) {
  transform: scale(1.03);
}

.victory {
  font-size: 24px;
  color: #4caf50;
  font-weight: bold;
}
```

---

Вот подробная документация и объяснение того, **как `createReactStore` упрощает и структурирует код**, на примере игры в 15-пазл. Также добавлены **комментарии к методам `createReactStore`**, чтобы было понятно, как они работают и зачем нужны.

---

# 🧠 Как `createReactStore` делает код чище и разработку проще

### До `createReactStore`:

- приходилось вручную писать `useState`, `useReducer` или `useContext`
- трудно делить глобальное и локальное состояние
- невозможно было подписываться на часть вложенного состояния без лишнего рендера

### С `createReactStore`:

- централизованное глобальное хранилище
- подписка **точечно** на любые пути (`board.2.3`)
- автоматическая оптимизация производительности (без лишних ререндеров)
- гибкое обновление: обычным значением или функцией
- поддержка `batch`, `invalidateCache`, `cacheKeys`, `useField`, и др.

---

## 💾 `store.ts` — создание и использование хранилища

```ts
export const puzzleStore = createReactStore<PuzzleState>({
  board: [...],
  moves: 0,
  isSolved: false,
});
```

📌 **`createReactStore<T>(initialState)`**
Создаёт **реактивное хранилище** со следующими возможностями:

- `.useStore(paths, options?)` — подписка на массив путей, автоматическая перерисовка
- `.useField(path, options?)` — подписка на одно поле с удобной записью
- `.update(path, value | fn)` — обновление любого вложенного значения
- `.get(path)` — чтение вложенного значения
- `.batch(fn)` — сгруппированное обновление без промежуточных ререндеров
- `.reloadComponents(cacheKeys)` — вручную триггерит компоненты по ключам

---

## ✅ Обновление значений с `update`

```ts
puzzleStore.update("moves", (m) => m + 1);
```

🔄 **`.update(path, newValue | updateFn)`**
Обновляет вложенное значение по строковому пути. Можно передавать:

- новое значение (`42`)
- функцию от текущего значения (`(prev) => prev + 1`)

---

## 📦 Группировка обновлений с `batch`

```ts
puzzleStore.batch(() => {
  puzzleStore.update("moves", (m) => m + 1);
  puzzleStore.update("isSolved", checkSolved(board));
});
```

⚡ **`.batch(fn)`**
Позволяет обновить несколько значений **одновременно**, вызвав подписки только **один раз**. Это ускоряет обновления и предотвращает лишние ререндеры.

---

## 👀 Чтение состояния с `get`

```ts
const board = puzzleStore.get("board");
```

🔍 **`.get(path)`**
Получает текущее значение по строковому пути. Не вызывает подписку, просто читает.

---

## 🎯 Подписка на части состояния с `useStore`

```tsx
const [moves, isSolved] = puzzleStore.useStore(["moves", "isSolved"]);
```

👂 **`.useStore(["path.a", "path.b"], options?)`**
Хук для подписки на один или несколько путей в состоянии. При любом изменении значений по этим путям компонент будет перерисован.

Преимущества:

- подписка только на нужные поля
- оптимизированные ререндеры
- опциональные `cacheKeys` для контроля подписки вручную

---

## ✍️ Подписка + обновление с `useField`

```tsx
const [theme, setTheme] = store.useField("settings.theme");
```

🛠️ **`.useField(path)`**
Удобный способ получить:

- текущее значение
- функцию `setValue` для обновления

Возвращает: `[value, setValue]`, как `useState`, но глобально.

---

## 🧪 Ручной вызов подписчиков с `reloadComponents`

```ts
puzzleStore.reloadComponents([["ui", "theme"]]);
```

🔁 **`.reloadComponents(cacheKeys)`**
Программно вызывает перерисовку всех компонентов, подписанных по указанным `cacheKeys`, даже если значение не изменилось.

---

## 🧩 `Tile.tsx` и `PuzzleGame` — как всё стало проще

```tsx
const [value] = puzzleStore.useStore([`board.${row}.${col}`]);
```

🔹 Простая подписка только на нужную ячейку
🔹 Не нужен `useContext`, `memo`, или глубокая проп-цепочка

---

```tsx
puzzleStore.update("isSolved", checkSolved(board));
```

🔹 Проверка состояния и мгновенное обновление
🔹 Логика и состояние теперь рядом, читаемо и удобно

---

# ✨ Что выигрывает разработчик

| До                                    | С `createReactStore`                    |
| ------------------------------------- | --------------------------------------- |
| Муторные `useReducer` и `dispatch`    | Простой `.update()`                     |
| Невозможно подписаться на `user.name` | `useStore(["user.name"])` работает 💡   |
| Сложность с оптимизацией ререндеров   | Точная подписка по пути, `batch`        |
| Ручное пробрасывание пропсов вниз     | Все компоненты могут использовать store |
| Нет контроля над подписками           | Есть `cacheKeys`, `reloadComponents`    |

---
