# 📚 Гайд по библиотеке `createQueryStore` (с примерами использования)

Библиотека **`createQueryStore`** — мощный инструмент для управления асинхронными запросами, кэшированием, мутациями и реактивным состоянием. Основана на `@qtpy/state-management-observable`.

---

## ⚙️ Установка

```bash
npm install @qtpy/state-management-query
```

---

## 🧠 Быстрый старт

```ts
import { createQueryStore } from "@qtpy/state-management-query";

const store = createQueryStore({
  user: { id: 0, name: "" },
  posts: [],
});
```

---

## 🔧 Полный API с примерами

### 1. `get<P extends Paths<T>>(path: P)` 🔍

Получение значения по вложенному пути.

```ts
const userName = store.get("user.name");
console.log("Имя пользователя:", userName);
```

---

### 2. `fetchDependent` ⏳

Зависимый асинхронный запрос, реагирующий на изменения других полей.

```ts
store.fetchDependent(
  "user-posts",
  async () => {
    const userId = store.get("user.id");
    return await fetch(`/api/users/${userId}/posts`).then((res) => res.json());
  },
  {
    dependsOn: ["user.id"],
  }
);

// при изменении store.set("user.id", 123) — fetch сработает повторно
```

---

### 3. `createMutation` 💥

Создание мутации + вызов:

```ts
const userMutation = store.createMutation({
  mutationFn: async (user) =>
    await fetch(`/api/users`, {
      method: "POST",
      body: JSON.stringify(user),
    }).then((res) => res.json()),
  invalidateTags: ["user"],
  onSuccess: (data) => {
    console.log("Пользователь обновлён:", data);
  },
});

// ВЫЗОВ мутации:
await userMutation.mutate({ id: 1, name: "Alice" });
```

---

### 4. `poll` 🔁

Периодический запрос:

```ts
store.poll(
  "posts",
  async () => {
    return await fetch("/api/posts").then((res) => res.json());
  },
  {
    interval: 5000,
    retryCount: 2,
    onError: (err) => console.error("Ошибка опроса:", err),
  }
);

// ❗ Не забудь остановить:
setTimeout(() => store.stopPolling("posts"), 20000);
```

---

### 5. `stopPolling(cacheKey: string)` 🛑

Останавливает polling по ключу:

```ts
store.stopPolling("posts");
```

---

### 6. `invalidate(cacheKey: string)` ❌

Принудительно инвалидирует данные:

```ts
store.invalidate("user-posts"); // вызовет повторный fetch
```

---

### 7. `onInvalidate` 🎯

Добавляет обработчик, срабатывающий при инвалидации:

```ts
store.onInvalidate("user-posts", () => {
  console.log("Кэш 'user-posts' был инвалидирован");
});
```

---

### 8. `addErrorHandler` ⚠️

Добавляет глобальный обработчик ошибок:

```ts
const handler = (error: unknown) => {
  console.error("Общая ошибка:", error);
};

store.addErrorHandler(handler);
```

---

### 9. `removeErrorHandler` 🧼

Удаляет обработчик ошибок:

```ts
store.removeErrorHandler(handler);
```

---

### 10. `cancelFetch(key: string)` ❌

Отменяет активный запрос:

```ts
store.cancelFetch("user-posts");
```

---

### 11. `cancelAllFetches()` ❌

Отменяет **все** активные запросы:

```ts
store.cancelAllFetches();
```

---

### 12. `clearCache()` 🧹

Очищает **весь** кэш:

```ts
store.clearCache();
```

---

### 13. `cleanupCache()` 🧼

Очищает только **устаревшие** записи по TTL:

```ts
store.cleanupCache();
```

---

### 14. `destroy()` 💥

Полностью уничтожает хранилище:

```ts
store.destroy();
```

---

## 🧩 Полный пример в контексте

```ts
import { createQueryStore } from "@qtpy/state-management-observable";

const store = createQueryStore({
  user: { id: 1, name: "Alice" },
  posts: [],
});

// 👇 fetchDependent: посты по user.id
store.fetchDependent(
  "user-posts",
  async () => {
    const id = store.get("user.id");
    return await fetch(`/api/users/${id}/posts`).then((r) => r.json());
  },
  { dependsOn: ["user.id"] }
);

// 👇 Мутация: обновить имя пользователя
const updateUser = store.createMutation({
  mutationFn: async (user) => {
    return await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify(user),
    }).then((r) => r.json());
  },
  invalidateTags: ["user", "user-posts"], // 👈 повторный fetch после мутации
});

// 👇 Вызов мутации
await updateUser.mutate({ id: 1, name: "Bob" });

// 👇 Polling: обновлять посты каждые 5 сек
store.poll(
  "posts",
  async () => {
    return await fetch("/api/posts").then((r) => r.json());
  },
  { interval: 5000 }
);

// 👇 Инвалидация
store.onInvalidate("user-posts", () => {
  console.log("Данные о постах обновлены");
});

// 👇 Глобальная ошибка
const handler = (e: unknown) => console.error("Ошибка:", e);
store.addErrorHandler(handler);

// Удаляем обработчик через 30 сек
setTimeout(() => store.removeErrorHandler(handler), 30000);
```

---

## ✅ Вывод

Библиотека `createQueryStore`:

- 🚀 Удобна для асинхронного фронтенда
- 🔗 Поддерживает зависимые запросы
- ♻️ Автоматически управляет кэшем
- 💥 Обрабатывает мутации
- 🔁 Имеет polling с retry и отменой
