# ⚛️ QtPy State Management: реактивный стор с granular подписками и идеальной интеграцией с React

`createObservableStore` — это продуманная и гибкая система управления состоянием, которая сочетает реактивность, типобезопасность и удобную работу с асинхронными данными. Благодаря прозрачной архитектуре и удобной обёртке для React, она помогает строить UI с точным контролем, минимальным количеством шаблонного кода и высокой отзывчивостью.  
Два пакета дополняют друг друга:

- [`@qtpy/state-management-observable`](https://www.npmjs.com/package/@qtpy/state-management-observable) — ядро: типобезопасный реактивный Proxy-стор
- [`@qtpy/state-management-react`](https://www.npmjs.com/package/@qtpy/state-management-react) — обёртка для React с хуками

Система подойдёт тем, кто ценит контроль, предсказуемость и строгую типизацию — без излишней сложности в API.

## 📦 Часть 1: `@qtpy/state-management-observable`

Типобезопасный реактивный стор, не зависящий от фреймворка. Построен на Proxy, поддерживает подписки, middleware, batching, async, undo/redo и многое другое.

### 🔍 Архитектура и особенности

| Возможность        | Описание                                                         |
| ------------------ | ---------------------------------------------------------------- |
| `Proxy`-структура  | Все обращения идут через `store.$` и перехватываются Proxy       |
| Подписка по пути   | `subscribeToPath` на строку или Accessor-функцию                 |
| `cacheKeys`        | Логическая группировка зависимостей, инвалидируемых вручную      |
| Middleware         | Цепочка логики для обработки изменений                           |
| История undo/redo  | Откат и повтор на уровне пути с лимитами хранения                |
| Batching и async   | Группировка синхронных и асинхронных изменений                   |
| Работа с массивами | Мутации через методы (`push`, `splice`) → реактивные уведомления |
| `DepthPath`        | Контроль глубины типизации путей с автокомплитом                 |

### 🧠 Типовой код

```ts
import { createObservableStore } from "@qtpy/state-management-observable";

interface User {
  name: string;
  age: number;
}

interface AppState {
  user: User;
  items: number[];
  theme: string;
}
const initialState: AppState = {
  user: { name: "Alice", age: 30 },
  items: [1, 2, 3],
  theme: "light",
};
type DeepMax = 2;
const store = createObservableStore<initialState, DeepMax>(initialState, [], {
  customLimitsHistory: ($) => [
    ["user.age", 5],
    [(t) => $.items[t(1)], 3],
  ],
});

// Точечная подписка
store.subscribeToPath("user.age", (newAge) => {
  console.log("Возраст изменился:", newAge);
});

// Тихое обновление
store.update("user.age", 35, { keepQuiet: true });

// История
store.undo("user.age");
store.redo("user.age");
```

### 🧩 Работа с массивами

- ✅ **Перед мутацией** создаётся snapshot
- ✅ **После мутации** — новый snapshot
- ✅ **Сравнение хешей** определяет — было ли изменение

Примеры:

```ts
store.$.items.push(2323); // → вызов подписки
store.$.items[2] = 42; // → точечное уведомление

store.update("items", (prev) => {
  prev.push(99);
  return prev;
});

store.update("items", (prev) => prev); // → изменений нет → уведомлений нет
```

### 🧰 Полный API

| Метод                        | Назначение                               |
| ---------------------------- | ---------------------------------------- |
| `get(path)`                  | Получить значение по строке или Accessor |
| `update(path, value, opts?)` | Обновить значение                        |
| `subscribe(callback, keys?)` | Глобальная подписка                      |
| `subscribeToPath(path, cb)`  | Подписка на конкретное поле              |
| `batch(callback)`            | Группировать изменения                   |
| `asyncUpdate(...)`           | Асинхронное обновление                   |
| `cancelAsyncUpdates(path?)`  | Отмена асинхронных операций              |
| `undo(path)` / `redo(path)`  | История изменений                        |

## ⚛️ Часть 2: `@qtpy/state-management-react`

Интеграция `ObservableStore` в React через `createReactStore`. Предоставляет набор реактивных хуков с granular подписками, тихими обновлениями и отменой рендеров.

### ✨ Возможности

| Хук / Метод            | Назначение                                   |
| ---------------------- | -------------------------------------------- |
| `useStore(paths)`      | Подписка на массив значений по путям         |
| `useField(path)`       | `[value, setValue]` с `setValue.quiet()`     |
| `useEffect(paths, fn)` | Вызывается при изменении хотя бы одного пути |

### 🧪 Компонентный пример: UserCard

```tsx
import { userStore } from "./store";

export const UserCard = () => {
  const [name, setName] = userStore.useField("user.name");
  const [age, setAge] = userStore.useField("user.age");

  // Реакция на изменение
  userStore.useEffect(["user.age"], ([age]) => {
    console.log("Возраст обновился:", age);
  });

  return (
    <div>
      <h2>{name}</h2>
      <p>Возраст: {age}</p>
      <button onClick={() => setAge((cur) => cur + 1)}>+</button>
      <button onClick={() => userStore.undo("user.age")}>Undo</button>
      <button onClick={() => userStore.redo("user.age")}>Redo</button>
    </div>
  );
};
```

### 🔕 Тихие обновления для оптимизации рендера

Иногда не нужно триггерить перерисовку:

```tsx
const [theme, setTheme] = store.useField("theme");
setTheme.quiet("dark"); // Тихо изменили тему
```

Вот пример описания раздела:

## 🎮 Практический кейс: Игра «15-пятнашек»

Эта реализация на `createReactStore` показывает, как granular-подписки и реактивные обновления могут использоваться не только в бизнес-логике, но и в интерактивных интерфейсах. В игре каждая плитка (`Tile`) подписывается только на конкретный элемент массива `board[row][col]`, а компонент реагирует лишь при изменении соответствующего поля. Все действия — сдвиги, проверки победы, счётчик ходов — выполнены через `batch`, `update` и `undo`, что делает логику прозрачной и производительной.

- Подписка на вложенное значение: `useStore([(t) => $.board[t(row)][t(col)]])`
- Реакция на флаг решения: `useField(() => $.isSolved)`
- Работа с `batch()` для группировки обновлений
- Проверка победы через `checkSolved()` и реактивное обновление `isSolved`

🧩 Код и компоненты разбиты на модули (`store.ts`, `Tile.tsx`, `PuzzleGame.tsx`) — удобно для масштабирования или адаптации под другие игры.

👉 [Ознакомиться с примером в документации](https://www.npmjs.com/package/@qtpy/state-management-react#3-%D1%80%D0%B5%D0%B0%D0%BB%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F-%D0%B8%D0%B3%D1%80%D1%8B-15-puzzle)

Хочешь, могу помочь сверстать карточку для галереи решений или адаптировать пример под другую механику — например, «2048» или «Сапёр». Думаю, твоя архитектура отлично подойдёт и для них тоже.

## 📘 Сравнение ключевых API

| Метод / Хук                 | ObservableStore | ReactStore | Назначение                   |
| --------------------------- | --------------- | ---------- | ---------------------------- |
| `get(path)`                 | ✅              | ✅         | Получить значение            |
| `update(path, val)`         | ✅              | ✅         | Обновить значение            |
| `batch(cb)`                 | ✅              | ✅         | Группировать изменения       |
| `asyncUpdate(...)`          | ✅              | ✅         | Асинхронное обновление       |
| `undo(path)` / `redo(path)` | ✅              | ✅         | История изменений            |
| `subscribeToPath(...)`      | ✅              | ✅         | Подписка на поле (вне React) |
| `useStore(paths)`           | ✅              | ✅         | Подписка на массив значений  |
| `useField(path)`            | ✅              | ✅         | Подписка на одно значение    |
| `useEffect(paths, fn)`      | ✅              | ✅         | Реакция на изменение         |
| `setValue.quiet(val)`       | ✅              | ✅         | Обновить без рендера         |

---

## 🚀 Вывод

\*_createObservableStore_ — это реактивная система нового поколения:

- 🔍 гранулярность - подписки на уровень конкретного свойства
- 🔄 Контроль истории изменений и отмены
- 🧠 Полная типобезопасность в TypeScript
- ⚛️ Чистая интеграция в React с удобными хуками

Меньше шаблонов — больше контроля. Разработка становится быстрее, предсказуемее и приятнее.

---
