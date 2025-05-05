# 📦 `createObservableStore` — реактивное хранилище с подписками, батчингом и оптимистичными обновлениями

Библиотека предоставляет мощный способ управления состоянием с подпиской на всё или отдельные части состояния, поддержкой middleware, батчингом, дебаунсом, асинхронными и оптимистичными обновлениями.

---

## ⚙️ Установка

```bash
npm install @qtpy/state-management-observable
```

---

## 📌 Импорт

```ts
import { createObservableStore } from "@qtpy/state-management-observable";
```

---

## 📚 Типы

```ts
type Paths<T> = ... // путь к значению в объекте (например, "user.name")
type ExtractPathType<T, P> = ... // тип значения по пути
type Middleware<T> = (store: ObservableStore<T>, next: UpdateFn<T>) => UpdateFn<T>
type UpdateFn<T, P> = (current: ExtractPathType<T, P>) => ExtractPathType<T, P>
type OptimisticUpdateOptions = {
  abortable?: boolean;
  cancelPrevious?: boolean;
  reason?: string;
}
```

---

## 🛠️ API `createObservableStore<T>(initialValue: T, middlewares?: Middleware<T>[])`

### ▶️ Пример использования:

```ts
const store = createObservableStore({ count: 0, user: { name: "Alice" } });
```

---

## 🧩 Методы

### 🔍 `get(path)`

Получить значение по пути.

```ts
store.get("user.name"); // => 'Alice'
```

---

### 🧬 `update(path, valueOrFn)`

Обновить значение по пути.

```ts
store.update("count", 1);
store.update("user.name", (prev) => prev + " Smith");
```

---

### 🧪 `updateAsync(path, asyncFn)`

Асинхронное обновление значения.

```ts
await store.updateAsync("user.name", async (prev) => {
  const result = await fetchName();
  return result;
});
```

---

### 🧵 `updateManyAsync([{ path, asyncFn }])`

Асинхронно обновляет несколько путей батчем.

```ts
await store.updateManyAsync([
  {
    path: "count",
    asyncFn: async (val) => val + 1,
  },
  {
    path: "user.name",
    asyncFn: async () => "Bob",
  },
]);
```

---

### 🧯 `transaction(asyncFn)`

Асинхронная транзакция с откатом при ошибке.

```ts
await store.transaction(async (s) => {
  s.update("count", 100);
  await someAsyncLogic();
  throw new Error("Ошибка");
});
// состояние откатится к предыдущему
```

---

### 🪄 `optimisticUpdate(path, asyncFn, optimisticValue, options?)`

Оптимистичное обновление: обновляет локально и затем подтверждает через async.

```ts
store.optimisticUpdate(
  "count",
  async (val) => {
    await delay(500);
    return val + 1;
  },
  store.get("count") + 1
);
```

**Опции:**

- `abortable` – позволяет отменить fetch
- `cancelPrevious` – отменить предыдущий запрос
- `reason` – причина отмены

---

### ⏳ `debouncedUpdate(path, asyncFn, delay = 300)`

Отложенное обновление с отменой предыдущего.

```ts
store.debouncedUpdate(
  "user.name",
  async (val) => {
    const name = await fetchUserName(val);
    return name;
  },
  500
);
```

---

### 📦 `batch(callback)`

Группировка обновлений.

```ts
store.batch(() => {
  store.update("count", (c) => c + 1);
  store.update("user.name", "Updated");
});
```

---

### 📥 `subscribe(callback, cacheKeys?)`

**Подписка на изменения в хранилище**

- **Без `cacheKeys`** – вызывается при любом изменении:

  ```js
  store.subscribe((state) => console.log("State changed:", state));
  ```

- **С `cacheKeys`** – вызывается только при изменении указанных ключей:
  ```js
  store.subscribe(
    (state) => console.log("User ID or theme changed"),
    ["user.id", "settings.theme"] // Пути к данным
  );
  ```

**Пример с разными типами `cacheKeys`:**

```js
store.subscribe(
  (state) => console.log("Сработало!"),
  [
    "user.id", // Путь в хранилище
    ["session", "theme"], // Массив строк
    (state) => `v${state.version}`, // Функция
  ]
);

// Вызовет callback:
store.update("user.id", 2); // Изменился путь
store.update("session", "new"); // Затронута строка в массиве
store.update("version", 2); // Изменился результат функции

// Не вызовет:
store.update("user.name", "Alex"); // Не в ключах
```

---

### 🧷 `subscribeToPath(path, callback, options?)`

**Подписка на конкретное поле**

- **Базовый вариант** – следит только за указанным путем:

  ```js
  store.subscribeToPath("user.name", (name) => {
    console.log("New name:", name);
  });
  ```

- **С `cacheKeys`** – дополнительная проверка по ключам:
  ```js
  store.subscribeToPath(
    "user",
    (user) => console.log("User обновлён (ID или роль изменились)"),
    {
      cacheKeys: ["user.id", (state) => state.user.role],
    }
  );
  ```

**Пример с `immediate: true`:**

```js
// Вызовется сразу при подписке + при изменениях
store.subscribeToPath(
  "settings.theme",
  (theme) => console.log("Тема:", theme),
  { immediate: true }
);
```

---

### Как работают `cacheKeys`?

1. **Пути (`'user.id'`)** – проверяет изменение значения по этому пути.
2. **Массив строк (`['key1', 'key2']`)** – срабатывает при изменении **любой** строки в массиве.
3. **Функции (`state => 'ключ'`)** – сравнивает **результат вызова** до и после обновления.

**Простое правило:**  
Callback вызовется, если хотя бы один из `cacheKeys` изменился.

---

### Пример для понимания

```js
const store = createObservableStore({
  user: { id: 1, name: "Alice" },
  version: 1,
});

// Подписка с комбинированными cacheKeys
store.subscribe(
  () => console.log("Данные обновлены!"),
  ["user.id", (state) => `v${state.version}`]
);

// Тест:
store.update("user.id", 2); // Вызовет (изменился путь)
store.update("version", 2); // Вызовет (изменилась функция)
store.update("user.name", "Bob"); // Не вызовет (не в ключах)
```

---

### 🔥 `invalidateCache(key | keys[])`

**Принудительный вызов подписчиков по ключам**

Позволяет вручную запустить обновление подписчиков, даже если данные не изменились. Работает со всеми типами ключей.

- **Базовый вариант** - инвалидация по одному ключу:

  ```js
  store.invalidateCache("user.name");
  ```

- **Массив ключей** - инвалидация нескольких зависимостей за раз:
  ```js
  store.invalidateCache([
    "user.id",
    ["cache", "version"],
    (state) => `custom_${state.user.role}`,
  ]);
  ```

---

### Типы поддерживаемых ключей

1. **Пути (`'user.id'`)**  
   Вызовет подписчиков с этим path или функциональными ключами, которые зависят от этого поля.

   ```js
   // Подписка:
   store.subscribe(cb, ["user.id"]);

   // Инвалидация:
   store.invalidateCache("user.id"); // Вызовет cb
   ```

2. **Массивы (`['cache', 'v2']`)**  
   Срабатывает для точного совпадения массива-ключа.

   ```js
   // Подписка:
   store.subscribe(cb, [["cache", "version"]]);

   // Инвалидация:
   store.invalidateCache(["cache", "version"]); // Вызовет cb
   ```

3. **Функции (`state => key`)**  
   Вычисляет ключ и находит всех подписчиков.

   ```js
   // Подписка:
   store.subscribe(cb, [(state) => state.user.role]);

   // Инвалидация:
   store.invalidateCache((state) => state.user.role); // Вызовет cb
   ```

---

### Практические примеры

**Сценарий 1:** Принудительное обновление UI

```js
// Подписка компонента:
store.subscribe(() => updateComponent(), ["cart.items", "user.balance"]);

// После успешного платежа:
await processPayment();
store.invalidateCache(["cart.items", "user.balance"]); // Форсируем перерисовку
```

**Сценарий 2:** Сброс кэша при выходе

```js
// Подписка с функциональным ключом:
store.subscribe(() => checkAuth(), [(state) => `session_${state.user.token}`]);

// При выходе:
store.invalidateCache((state) => `session_${state.user.token}`);
```

**Сценарий 3:** Групповая инвалидация

```js
// Комплексная подписка:
store.subscribe(refreshDashboard, [
  "stats",
  "notifications.count",
  (s) => s.user.role,
]);

// После важного действия:
store.invalidateCache([
  "stats",
  (state) => state.user.role, // Инвалидируем по функции
]);
```

---

### Особенности работы

1. **Нет изменений данных**  
   Инвалидация только вызывает подписчиков, но не меняет состояние.

2. **Точное соответствие**  
   Ключи сравниваются через `resolveCacheKey`, учитывая тип:

   ```js
   store.invalidateCache("user") !== store.invalidateCache(["user"]);
   ```

3. **Батчинг-дружественно**  
   Можно использовать внутри `batch()`:

   ```js
   store.batch(() => {
     store.update("user.name", "Alice");
     store.invalidateCache("user.name");
   });
   ```

4. **Отписка**  
   Автоматически очищается при вызове `unsubscribe()`.

---

> 💡 **Совет:** Используйте для синхронизации данных после внешних событий (WebSocket, таймеры) или когда точное изменение состояния отследить сложно.

---

### 🧹 `clearDebounceTimers()`

Отменяет все активные таймеры debounce и fetch'и.

```ts
store.clearDebounceTimers();
```

---

### 🧨 `destroy()`

Полностью уничтожает хранилище: подписки и таймеры.

```ts
store.destroy();
```

---

### 🛑 `cancelOptimisticUpdate(path, reason?)`

Отмена активного optimisticUpdate.

```ts
store.cancelOptimisticUpdate("count", "User canceled");
```

---

Вот как можно оформить твоё сообщение с хорошим визуальным и структурным оформлением:

---

## 🧱 Middleware

Middleware позволяет перехватывать `update` и выполнять дополнительные действия перед обновлением состояния.

```ts
const loggerMiddleware: Middleware<MyState> =
  (store, next) => (path, value) => {
    console.log(`Updating ${path} to`, value);
    next(path, value);
  };

const store = createObservableStore(initialValue, [loggerMiddleware]);
```

Отличный вопрос! Давай разберём два важных аспекта работы middleware:

---

## 🔁 Что если `next(path, value)` **не вызывается**

```ts
const middleware: Middleware<T> = (store, next) => (path, value) => {
  // Нет вызова next
};
```

Если `next` не вызывается внутри middleware, **обновление состояния не произойдёт**, и **дальнейшие middleware не будут вызваны**. То есть цепочка выполнения **прерывается на этом middleware**.

📌 Это может быть использовано, например, для фильтрации или отмены определённых обновлений:

```ts
const blockUpdateMiddleware: Middleware<MyState> =
  (store, next) => (path, value) => {
    if (path === "isLocked") return; // блокируем изменение
    next(path, value); // пропускаем дальше
  };
```

---

## ✍️ Можно ли менять `value` при передаче в `next`?

Да! Middleware может **модифицировать значение перед тем, как передать его дальше**:

```ts
const doubleValueMiddleware: Middleware<MyState> =
  (store, next) => (path, value) => {
    if (typeof value === "number") {
      next(path, value * 2); // удваиваем значение перед обновлением
    } else {
      next(path, value);
    }
  };
```

Это удобно для логики валидации, трансформации, округления и прочего:

```ts
const roundMiddleware: Middleware<MyState> = (store, next) => (path, value) => {
  if (path === "price") {
    next(path, Math.round(value * 100) / 100);
  } else {
    next(path, value);
  }
};
```

---

## 🔗 Итог: как работает цепочка middleware

Когда вы создаёте хранилище с несколькими middleware:

```ts
createObservableStore(initialValue, [mw1, mw2, mw3]);
```

Они оборачиваются **в обратном порядке** (последний — самый внутренний):

```
store.update = mw1(mw2(mw3(coreUpdate)));
```

Каждое middleware должно **вызвать `next`**, чтобы пропустить выполнение дальше. Иначе — цепочка обрывается.

---

## 🧪 Пример полного использования

```ts
type State = {
  counter: number;
  user: { name: string };
};

const store = createObservableStore<State>(
  { counter: 0, user: { name: "Alice" } },
  [
    (store, next) => (path, value) => {
      console.log("Middleware:", path, value);
      next(path, value);
    },
  ]
);

store.subscribe(console.log);
store.update("counter", (c) => c + 1);
```

---

## ✅ Плюсы

- 🔬 Тонкая подписка на поля
- 🔄 Батчинг
- ⚡ Оптимистичные обновления
- ⏲️ Debounce + Abort
- 🔁 Middleware
- 💥 Rollback транзакций

---
