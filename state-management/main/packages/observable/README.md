## 📚 Содержание

1. [🚀 Создание хранилища](#-создание-хранилища)
2. [📢 subscribe](#-subscribe)
3. [🎯 subscribeToPath](#-subscribetopath)
4. [✏️ update](#️-update)
5. [🔍 get](#-get)
6. [♻️ invalidate](#-invalidate)
7. [⏳ asyncUpdate](#-asyncupdate)
8. [📦 batch](#-batch)
9. [↩️ undo / ↪️ redo](#️-undo--️-redo)
10. [🛣️ resolvePath](#️-resolvepath)
11. [🧹 manualCleanup](#-manualcleanup)
12. [📊 getMemoryStats](#-getmemorystats)
13. [🗑️ clearStore](#-clearstore)
14. [🛠 Middleware](#-Middleware)
15. [🏷️ state / 🛠️ `$`](#️-state--️-)
16. [🚀 Гайд: asyncUpdate и batch в ObservableStore](#-Гайд-asyncUpdate-и-batch-в-ObservableStore)
17. [🔗 Общий пример](#-общий-пример)

---

## 🚀 Создание хранилища

> **Что делает:**
> Инициализирует реактивное хранилище с подписками, кеш-ключами, историей и батчингом.

### ⚙️ Сигнатура

```ts
function createObservableStore<T extends object>(
  initialState: T,
  middlewares?: Middleware<T>[],
  options?: {
    maxHistoryLength?: number;
  }
): ObservableStore<T>;
```

### 📝 Описание

- **state** через прокси (прямое присваивание работает).
- **Подписки** на все изменения и по конкретным путям.
- **CacheKey** для выборочной фильтрации уведомлений.
- **История** с возможностями `undo`/`redo`.
- **Асинхронные** обновления с поддержкой отмены.
- **Batching** нескольких операций за один цикл нотификаций.
- **Авто-очистка** неактивной истории.

### 📥 Параметры

| Имя                   | Тип               | Описание                               |
| --------------------- | ----------------- | -------------------------------------- |
| `initialState`        | `T`               | Начальное состояние (любой объект).    |
| `middlewares?`        | `Middleware<T>[]` | Массив функций-перехватчиков `update`. |
| `options?`            | `{…}`             | Дополнительные настройки:              |
| └ `maxHistoryLength?` | `number`          | Макс. число записей истории на путь.   |

### ▶️ Пример

```ts
const store = createObservableStore<{ counter: number }>(
  { counter: 0 },
  [loggerMiddleware],
  { maxHistoryLength: 50, cleanupInterval: 60000 }
);
```

---

## 📢 subscribe

> **Назначение:**
> Слушать **все** изменения состояния.

### ⚙️ Сигнатура

```ts
subscribe(
  callback: Subscriber<T>,
  cacheKeys?: CacheKey<T>[]
): Unsubscribe;
```

### 📝 Описание

- Срабатывает при любом `update` (или прямом `state`-присваивании).
- Можно фильтровать по массиву `cacheKeys`.

### 📥 Параметры

| Имя          | Тип                  | Описание                                          |
| ------------ | -------------------- | ------------------------------------------------- |
| `callback`   | `(state: T) => void` | Функция, получающая новый снимок всего состояния. |
| `cacheKeys?` | `CacheKey<T>[]`      | Список ключей/путей для селективных уведомлений.  |

### ▶️ Пример

```ts
const unsubscribe = store.subscribe(
  (s) => console.log("Все изменения:", s),
  [store.$.user.name, "customKey"]
);
```

---

## 🎯 subscribeToPath

> **Назначение:**
> Подписаться на изменение **конкретного** поля.

### ⚙️ Сигнатура

```ts
subscribeToPath<P extends PathTracker<any, any>>(
  path: P,
  callback: Subscriber<P>,
  options?: {
    immediate?: boolean;
    cacheKeys?: CacheKey<T>[];
  }
): Unsubscribe;
```

### 📝 Описание

- Срабатывает при изменении указанного `path`.
- Опция `immediate` позволяет вызвать колбэк сразу с текущим значением.

### 📥 Параметры

| Имя        | Тип                                               | Описание                                             |
| ---------- | ------------------------------------------------- | ---------------------------------------------------- |
| `path`     | `PathTracker<any, any>`                           | Трекер пути (через `store.$`).                       |
| `callback` | `(value: P[TYPE_SYMBOL]) => void`                 | Функция, получающая новое значение по пути.          |
| `options?` | `{ immediate?: boolean; cacheKeys?: CacheKey[] }` | `immediate`: сразу; `cacheKeys`: фильтр уведомлений. |

### ▶️ Пример

```ts
store.subscribeToPath(
  store.$.user.age,
  (age) => console.log("Новый возраст:", age),
  { immediate: true }
);
```

---

## ✏️ update

> **Назначение:**
> Изменить значение по пути.

### ⚙️ Сигнатура

```ts
update<P extends PathTracker<any, any>>(
  path: P,
  value:
    | P[typeof TYPE_SYMBOL]
    | ((cur: P[typeof TYPE_SYMBOL]) => P[typeof TYPE_SYMBOL])
): void;
```

### 📝 Описание

- Можно передать новое значение или функцию-обновитель.
- Автоматически сохраняет запись в историю.

### 📥 Параметры

| Имя     | Тип                                         | Описание                         |
| ------- | ------------------------------------------- | -------------------------------- |
| `path`  | `PathTracker<any, any>`                     | Трекер пути для обновления поля. |
| `value` | `NewValue` или `(cur: Current) => NewValue` | Новое значение или функция.      |

### ▶️ Пример

```ts
store.update(store.$.counter, (c) => c + 1);
store.update(store.$.user.name, "Alice");
```

---

## 🔍 get

> **Назначение:**
> Получить текущее значение по пути.

### ⚙️ Сигнатура

```ts
get<P extends PathTracker<any, any>>(
  path: P
): P[typeof TYPE_SYMBOL] | undefined;
```

### 📝 Описание

- Возвращает значение из хранилища или `undefined`, если нет.

### ▶️ Пример

```ts
const email = store.get(store.$.user.contacts.email);
console.log("Email:", email);
```

---

## ♻️ invalidate

> **Назначение:**
> Форсированно уведомить подписчиков по кеш-ключу.

### ⚙️ Сигнатура

```ts
invalidate(
  cacheKey: CacheKey<T>,
): void;
```

### 📝 Описание

- Повторно “дергает” подписку для указанного ключа.

### ▶️ Пример

```ts
store.invalidate(store.$.user.contacts.email);
store.invalidate("customCacheKeyEmail", true);
```

---

## ⏳ asyncUpdate

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

## 📦 batch

> **Назначение:**
> Сгруппировать несколько операций в одну нотификацию.

### ⚙️ Сигнатура

```ts
batch(
  callback: () => void,
): void;
```

### 📝 Описание

- Все `update` и `asyncUpdate` внутри выполняются без повторных уведомлений.

### ▶️ Пример

```ts
store.batch(async () => {
  store.update(store.$.counter, 5);
  await store.asyncUpdate(store.$.user.age, async (a) => a * 2);
});
```

---

## ↩️ undo / ↪️ redo

> **Назначение:**
> Отменить или повторить последнее изменение по пути.

### ⚙️ Сигнатура

```ts
undo(path: PathTracker<any, any>): void;
redo(path: PathTracker<any, any>): void;
```

### 📝 Описание

- Срабатывает только там, где есть история.
- `undo` → предыдущий слой, `redo` → обратно.

### ▶️ Пример

```ts
const $StoreAge = store.$.user.age; // можно сохранить ссылку и переиспользовать
store.update($StoreAge, 40);
store.undo($StoreAge); // вернулись к предыдущему значению
store.redo($StoreAge); // 40
```

---

## 🛣️ resolvePath

> **Назначение:**
> Получить строку пути в “dot.notation”.

### ⚙️ Сигнатура

```ts
resolvePath(
  proxyPath: PathTracker<any, any> | string
): string;
```

### 📝 Описание

- Конвертирует трекер или строку в `"user.name"` и т. д.

### ▶️ Пример

```ts
console.log(store.resolvePath(store.$.user.name)); // "user.name"
```

---

## 🧹 manualCleanup

> **Назначение:**
> Удалить историю для путей без подписчиков.

```ts
manualCleanup(): void;
```

---

## 📊 getMemoryStats

> **Назначение:**
> Получить статистику: подписчики, история, активные пути.

```ts
getMemoryStats(): MemoryStats;
```

---

## 🗑️ clearStore

> **Назначение:**
> Полностью очистить хранилище: подписки, async-задачи, кеш.

```ts
clearStore(): void;
```

## 🛠 Middleware

> **Назначение:**
> Позволяет перехватывать, дополнять или блокировать вызовы `store.update` (и, при желании, `asyncUpdate`), выполняя дополнительную логику до или после применения изменений.

### ⚙️ Сигнатура

```ts
export type Middleware<T> = (
  store: ObservableStore<T>,
  next: UpdateFunction<T>
) => (path: any, value: any) => void;
```

- **`store`** — экземпляр вашего `ObservableStore`, дающий доступ ко всем методам (`update`, `asyncUpdate`, `batch` и т.д.).
- **`next`** — «следующий» обработчик: либо следующий middleware в цепочке, либо оригинальный `store.update`.
- Middleware возвращает новую функцию с той же сигнатурой, где вы можете:

  - вызвать `next(path, value)` для пропуска управления дальше;
  - изменить `path` или `value` перед передачей;
  - вообще **не** вызывать `next` — чтобы заблокировать обновление.

---

### ▶️ Пример: три middleware с условием на `next`

```ts
// 1) Логирование всех обновлений
const logMiddleware: Middleware<MyState> = (store, next) => (path, value) => {
  console.log("[LOG]", store.resolvePath(path), "→", value);
  next(path, value);
};

// 2) Блокировка установки отрицательного возраста
const blockNegativeAge: Middleware<MyState> =
  (store, next) => (path, value) => {
    if (
      store.resolvePath(path) === "user.age" &&
      typeof value === "number" &&
      value < 0
    ) {
      console.warn("[BLOCKED] Отрицательный возраст:", value);
      return; // не вызываем next — обновление отменяется
    }
    next(path, value);
  };

// 3) Преобразование заголовков в верхний регистр
const uppercaseTitle: Middleware<MyState> = (store, next) => (path, value) => {
  if (store.resolvePath(path) === "post.title" && typeof value === "string") {
    next(path, value.toUpperCase());
  } else {
    next(path, value);
  }
};

// Создаем стор с тремя middleware
const store = createObservableStore<MyState>(initialState, [
  logMiddleware,
  blockNegativeAge,
  uppercaseTitle,
]);

// Демонстрация:
store.update(store.$.user.age, -5); // [BLOCKED] Отрицательный возраст: -5
store.update(store.$.user.age, 30); // [LOG] user.age → 30

store.update(store.$.post.title, "hello world");
// [LOG] post.title → HELLO WORLD
```

---

## 🏷️ state / 🛠️ `$`

| Свойство | Тип            | Описание                                         |
| -------- | -------------- | ------------------------------------------------ |
| `state`  | `T`            | Прокси-объект для чтения и прямого присваивания. |
| `$`      | `PathProxy<T>` | Генератор “path trackers” для подписок и update. |

---

# 🚀 Гайд: `asyncUpdate` и `batch` в `ObservableStore`

В этой версии:

- **`store.batch(fn)`** — единый синхронный батч с поддержкой вложенных контекстов через стек `pendingStack`.
- **`store.asyncUpdate(path, updater, { abortPrevious = false })`** — асинхронное обновление, по умолчанию **не отменяет** предыдущие запросы, но при необходимости можно включать отмену.

---

## ⚙️ Основные API

- **🔧 `store.update(path, value)`**  
  Синхронно меняет значение по `path`. Если вы внутри `store.batch`, изменение откладывается в текущий контекст; иначе сразу проходит через `doUpdate` (запись в историю + уведомление подписчиков).

- **📦 `store.batch(fn: () => void)`**  
  Группирует **синхронные** обновления в один атомарный коммит.

  - Каждому вызову создаётся свой `Map<string, any>` в `pendingStack`.
  - Вложенные `store.batch` аккуратно складывают изменения в родительский контекст.
  - По выходу из верхнего батча все накопленные изменения применяются одним пакетом.

- \*\*⏳ `store.asyncUpdate(`  
  &nbsp;&nbsp;`path, updater: (cur, signal) => Promise<any>,`  
  &nbsp;&nbsp;`opts?: { abortPrevious?: boolean }`  
  `)`  
  Асинхронный апдейт по `path`.
  - **`opts.abortPrevious = false`** (по умолчанию) — предыдущие вызовы **не отменяются**, все результаты будут применены по завершении.
  - **`opts.abortPrevious = true`** — перед стартом нового запроса предыдущий **прерывается** через `AbortController`, и его результат никогда не запишется в стор.

---

## ⚡ Как работает `batch`

1. Вход в `store.batch(fn)`:
   - `pendingStack.push(new Map())`, `batching = true`.
2. В теле `fn()` все `store.update(...)` и присвоения через `store.state.* = ...` откладываются в верхний `Map`.
3. Выход из batсh:
   - Если есть родительский `Map` (вложенный батч), просто сливаем дочерние изменения в родителя.
   - Иначе (верхний уровень) вызываем `commit(pending)`:
     - Для каждой пары `[path, val]` — пушим в историю, пишем в `rawState` и нотифицируем подписчиков.
   - Сбрасываем `batching = false`.

---

## 💻 Пример 1: Вложенные синхронные батчи

```ts
// Подписка на изменения count
store.subscribeToPath(store.$.count, (v) => console.log("count =", v));

// Начальное значение
store.update(store.$.count, 0); // → count = 0

// Внешний батч
store.batch(() => {
  store.update(store.$.count, 5); // откладывается в контекст1

  store.batch(() => {
    store.state.count = 10; // откладывается в контекст2
  });
  // контекст2 слит в контекст1

  store.state.count += 1; // теперь откладывается в контекст1: 10 + 1 = 11
});
// После выхода из верхнего batch все изменения применятся сразу → count = 11
```

---

## 💻 Пример 2: `asyncUpdate` без отмены (по умолчанию)

```ts
// Подписка
store.subscribeToPath(store.$.count, (v) => console.log("count =", v));

// Сброс
store.update(store.$.count, 0); // → count = 0

// Два параллельных asyncUpdate
store.asyncUpdate(
  store.$.count,
  async (v) => new Promise((res) => setTimeout(() => res(v + 10), 1000))
);
store.asyncUpdate(
  store.$.count,
  async (v) => new Promise((res) => setTimeout(() => res(v + 5), 500))
);
// Через ~500 мс: первый короткий завершится — count = 0 + 5 = 5
// Через ~1000 мс: длинный тоже запишет свой результат на текущем значении 5 → count = 15
```

---

## 💻 Пример 3: `asyncUpdate` с отменой предыдущего

```ts
// Снова сброс
store.update(store.$.count, 0); // → count = 0

// Включаем abortPrevious
store.asyncUpdate(
  store.$.count,
  async (v) => new Promise((res) => setTimeout(() => res(v + 10), 1000))
);
store.asyncUpdate(
  store.$.count,
  async (v) => new Promise((res) => setTimeout(() => res(v + 5), 500)),
  { abortPrevious: true }
);
// Второй вызов прерывает первый:
// Через ~500 мс: применится +5 → count = 5
// Первый после 1 с не выполнится из-за abort()
```

---

## 💻 Пример 4: Асинхронные вызовы внутри одного батча

```ts
store.subscribeToPath(store.$.count, (v) => console.log("count =", v));

// Сбрасываем
store.update(store.$.count, 0); // → count = 0

// Batch с двумя последовательными asyncUpdate
store.batch(async () => {
  await store.asyncUpdate(
    store.$.count,
    async (v) => new Promise((res) => setTimeout(() => res(v + 10), 1000))
  ); // после 1 с count = 10

  await store.asyncUpdate(
    store.$.count,
    async (v) => new Promise((res) => setTimeout(() => res(v + 5), 500))
  ); // ещё через 0.5 с count = 15
});
// По завершению batch в консоли будет: 10, затем 15
```

---

## 🎉 Итоги

- **Синхронный `batch`** с поддержкой вложений через стек — все изменения в одном атомарном коммите.
- **Асинхронный `asyncUpdate`** теперь управляется опцией `abortPrevious`, по умолчанию отключённой, но может быть включена для отказа от устаревших операций.
- Гибкость и явный контроль над порядком и отменой асинхронных вызовов помогает избежать гонок и сохранить консистентность состояния.
- Остальные механизмы (`history`, реактивный прокси, подписки) работают как прежде.

---

## 💻 Пример 2: `asyncUpdate` без отмены (по умолчанию)

```ts
// Подписка
store.subscribeToPath(store.$.count, (v) => console.log("count =", v));

// Сбросим
store.update(store.$.count, 0); // → count = 0

// Два параллельных asyncUpdate
store.asyncUpdate(
  store.$.count,
  async (v) => new Promise((res) => setTimeout(() => res(v + 10), 1000))
);
store.asyncUpdate(
  store.$.count,
  async (v) => new Promise((res) => setTimeout(() => res(v + 5), 500))
);
// Через ~500 мс: первый завершится — count = 0 + 5 = 5
// Через ~1000 мс: второй (долгий) тоже запишет свой результат к моменту запуска:
//   берёт текущее (5) + 10 = 15 → count = 15
```

---

## 💻 Пример 3: `asyncUpdate` с отменой предыдущего

```ts
// Снова сбрасываем
store.update(store.$.count, 0); // → count = 0

// Указываем opts.abortPrevious = true
store.asyncUpdate(
  store.$.count,
  async (v) => new Promise((res) => setTimeout(() => res(v + 10), 1000)),
  { abortPrevious: true }
);
store.asyncUpdate(
  store.$.count,
  async (v) => new Promise((res) => setTimeout(() => res(v + 5), 500)),
  { abortPrevious: true }
);
// Второй вызов прерывает первый:
// Через ~500 мс: только +5 применится → count = 5
// Первый после 1 с не сработает, т.к. был abort()
```

---

## 🎉 Итоги

- **Синхронный `batch`** с поддержкой вложений через стек — все изменения в одном атомарном коммите.
- **Асинхронный `asyncUpdate`** по умолчанию не отменяет предыдущие запросы, но опцию отмены можно включить через `{ abortPrevious: true }`.
- Гибкость и явный контроль над тем, нужно ли прерывать «устаревшие» операции, помогает избежать непредсказуемых гонок и сохранить максимальную производительность.
- История, `lazy`-прокси и уведомления подписчиков работают без изменений под этим новым API.

---

## 🔗 Общий пример

```ts
// Описание общего состояния приложения
interface AppState {
  counter: number; // Счётчик
  user: {
    // Объект пользователя
    name: string; // Имя пользователя
    age: number; // Возраст пользователя
    contacts: {
      // Контактные данные
      email: string; // Email пользователя
      phone?: string; // Необязательный телефон
      lol: {
        // Вложенный объект LOL
        value: number; // Значение LOL
      };
    };
  };
}

// Первое middleware: умножает целые числа на 2
const middlewareLogger1: Middleware<AppState> =
  (store, next) => (path, value) => {
    if (Number.isInteger(value)) {
      // Проверяем, целое ли число
      next(path, value * 2); // Передаём в next значение * 2
      return; // Прерываем далее выполнение
    }
    next(path, value); // Иначе передаём без изменений
  };
// Второе middleware: логгирует некорректные (нечисловые) значения
const middlewareLogger2: Middleware<AppState> =
  (store, next) => (path, value) => {
    console.log("not numbers", value, store.resolvePath(path)); // Выводим путь и значение
    next(path, value); // Передаём значение дальше
  };

// Создаем новое хранилище с начальным состоянием и подключаем middleware
const store = createObservableStore<AppState>(
  {
    counter: 0, // Инициализация счётчика
    user: {
      // Инициализация объекта пользователя
      name: "John", // Имя по умолчанию
      age: 30, // Возраст по умолчанию
      contacts: {
        // Контакты по умолчанию
        email: "john@example.com", // Email
        lol: { value: 2 }, // LOL значение
      },
    },
  },
  [middlewareLogger1, middlewareLogger2]
);

// Подписка на изменения возраста пользователя
store.subscribeToPath(store.$.user.age, (value) => {
  console.log("updated age:", value); // Логгируем новый возраст
});

const $StoreAge = store.$.user.age; // можно сохранить ссылку
store.update($StoreAge, 20); // Устанавливаем возраст в 20
store.undo($StoreAge); // Отмена последнего изменения (возвращаем 30)
store.redo($StoreAge); // Повтор последнего изменения (возвращаем 20)

// Подписка на изменение email с кеш-ключом
store.subscribe(
  (newStore) => {
    console.log("changed value email:", store.get(store.$.user.contacts.email)); // Логгируем email
  },
  [store.$.user.contacts.email, "customCacheKeyEmail"] // Кеш-ключи для фильтрации
);

// Глобальная подписка на все изменения состояния
store.subscribe((newStore) => {
  console.log("changed value:", newStore); // Логгируем всё состояние
});

// Дополнительные подписки на возраст
store.subscribeToPath(store.$.user.age, (value) => {
  console.log("updated age", value); // Логгируем возраст
});

// Подписка на возраст и имя с кеш-ключами
store.subscribeToPath(
  store.$.user.age, // Путь к возрасту
  (value) => {
    console.log("updated age:", value); // Логгируем возраст
    console.log("updated name:", store.get(store.$.user.name)); // Логгируем имя
  },
  { cacheKeys: [store.$.user.name, "customCacheKeyName"] } // Кеш-ключи
);

// Пример асинхронных операций и батчинга
const test = async () => {
  console.log("invalidate для email"); // Инвалидация email
  await store.invalidate(store.$.user.contacts.email); // Инвалидируем по пути
  await store.invalidate("customCacheKeyEmail"); // Инвалидируем по строковому ключу
  console.log("invalidate для name"); // Инвалидация имени
  await store.invalidate(store.$.user.name); // Инвалидируем по пути
  await store.invalidate("customCacheKeyName"); // Инвалидируем по строковому ключу

  await store.batch(async () => {
    // Начало батча (асинхронного)
    store.update(store.$.user.name, "QtPy"); // Меняем имя
    store.update(store.$.user.contacts.email, "my@emai.com"); // Меняем email
    await store.asyncUpdate(
      store.$.user.age,
      async (
        cur // Асинхронное удвоение возраста через 2 секунды
      ) =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(cur * 2);
          }, 2000)
        )
    );
    store.update(store.$.user.contacts.lol.value, 999999); // Изменяем lol значение
    store.update(store.$.counter, 2); // Устанавливаем счётчик
  }); // Конец батча

  await store.undo(store.$.user.age); // Отмена последнего асинхронного изменения возраста
  setTimeout(() => {
    store.undo(store.$.user.age); // Дополнительная отмена через 200 мс
  }, 200);

  // Демонстрация прямого присваивания через state-прокси
  store.state.counter += 23; // Инкремент счётчика напрямую
  store.state.user.contacts.email = "233333333333"; // Прямое обновление email
};
test();
```
