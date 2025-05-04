# 📦 `createObservableStore` — реактивное хранилище с подписками, батчингом и оптимистичными обновлениями

Библиотека предоставляет мощный способ управления состоянием с подпиской на всё или отдельные части состояния, поддержкой middleware, батчингом, дебаунсом, асинхронными и оптимистичными обновлениями.

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

### 📥 `subscribe(callback)`

Подписка на всё состояние.

```ts
const unsubscribe = store.subscribe((state) => {
  console.log("State updated:", state);
});
```

---

### 🧷 `subscribeToPath(path, callback, options?)`

Подписка на изменение по пути.

```ts
store.subscribeToPath(
  "user.name",
  (val) => {
    console.log("Name changed:", val);
  },
  { immediate: true }
);
```

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
