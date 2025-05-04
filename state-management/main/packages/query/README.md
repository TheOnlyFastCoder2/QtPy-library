# 📚 Гайд по библиотеке createQueryStore

Библиотека **createQueryStore** — это мощный инструмент для управления состоянием и кэшированием запросов. Она основана на **@qtpy/state-management-observable** и предназначена для облегчения работы с асинхронными запросами, кэшированием данных и их обновлением. Ниже мы подробно разберём каждый метод этой библиотеки.

## ⚙️ Зависимости

Библиотека использует:

- **@qtpy/state-management-observable**: основной пакет для управления состоянием через observable-хранилища.
- Типы из **@qtpy/state-management-observable/types** и дополнительные внутренние типы.

---

## 🛠️ Основные методы и их описание

### 1. **createQueryStore** 🔄

Метод для создания хранилища с поддержкой запросов, кэширования, обновлений и мутаций.

```typescript
createQueryStore<T extends object>(
  initial: T,
  middlewares: Middleware<T>[] = [],
  userConfig: Partial<QueryStoreConfig> = {}
)
```

**Аргументы:**

- `initial`: Начальное состояние хранилища (объект). 📦
- `middlewares`: Массив middlewares для обработки состояния. 🛠️
- `userConfig`: Пользовательская конфигурация (опционально). ⚙️

**Возвращает**: Объект хранилища с возможностью инвалидации кэша и дополнительными методами. 📚

---

### 2. **addErrorHandler** ⚠️

Метод для добавления обработчиков ошибок.

```typescript
addErrorHandler<E = Error>(
  handler: ErrorHandler<T, E>,
  options: ErrorHandlerOptions = {}
)
```

**Аргументы:**

- `handler`: Функция-обработчик ошибки. 🚨
- `options`: Дополнительные опции (например, флаг, нужно ли продолжать пропагировать ошибку). ⚡

**Пример использования:**

```typescript
store.addErrorHandler(
  (error, context) => {
    console.error("Ошибка запроса:", error);
  },
  { propagate: false }
);
```

---

### 3. **removeErrorHandler** 🛑

Метод для удаления обработчика ошибок.

```typescript
removeErrorHandler(handler: ErrorHandler<T>)
```

**Аргументы:**

- `handler`: Функция обработчика ошибки, которую нужно удалить. 🗑️

---

### 4. **cleanupCache** 🧹

Метод для очистки кэша хранилища.

```typescript
cleanupCache();
```

**Очищает** все устаревшие данные в кэше. 🔥

---

### 5. **onInvalidate** 🔄

Метод для добавления коллбека, который будет вызван при инвалидации данных по ключу.

```typescript
onInvalidate(cacheKey: CacheKey, callback: InvalidationCallback)
```

**Аргументы:**

- `cacheKey`: Ключ кэша. 🔑
- `callback`: Функция, которая будет вызвана при инвалидации. 🔁

**Пример использования:**

```typescript
store.onInvalidate("some-cache-key", () => {
  console.log("Кэш был инвалидирован");
});
```

---

### 6. **invalidate** ❌

Метод для инвалидации данных в кэше.

```typescript
invalidate(cacheKey: CacheKey)
```

**Аргумент:**

- `cacheKey`: Ключ кэша, который необходимо инвалидировать. 🚫

---

### 7. **createMutation** 🔄

Метод для создания мутации, которая выполняет асинхронную операцию.

```typescript
createMutation<TInput, TOutput>(
  options: MutationOptions<TInput, TOutput>
): Mutation<TInput, TOutput>
```

**Аргументы:**

- `options`: Объект с параметрами мутации (например, функция запроса, теги для инвалидации). 🎯

**Пример использования:**

```typescript
const mutation = store.createMutation({
  mutationFn: async (input) => {
    return await someApiCall(input);
  },
  invalidateTags: ["user-data"],
  onSuccess: (data) => console.log("Мутация прошла успешно", data),
});
```

---

### 8. **fetchDependent** ⏳

Метод для выполнения асинхронного запроса с зависимостями от других путей.

```typescript
fetchDependent<P extends Paths<T>>(
  key: string,
  fetchFn: (signal?: AbortSignal) => Promise<ExtractPathType<T, P>>,
  options: { dependsOn?: Paths<T>[]; signal?: AbortSignal } = {}
)
```

**Аргументы:**

- `key`: Уникальный ключ запроса. 🔑
- `fetchFn`: Функция, которая выполняет запрос. 🔄
- `options`: Опции, включая зависимые пути и сигнал для отмены. 🔧

---

### 9. **poll** 🔄

Метод для опроса данных с возможностью повторных попыток.

```typescript
poll<P extends Paths<T>>(
  path: P,
  fetchFn: (current: ExtractPathType<T, P>) => Promise<ExtractPathType<T, P>>,
  options: {
    interval?: number;
    cacheKey?: CacheKey;
    retryCount?: number;
    retryDelay?: number;
    onError?: (error: unknown) => void;
    exponentialBackoff?: boolean;
  }
)
```

**Аргументы:**

- `path`: Путь к данным, которые нужно опрашивать. 🛣️
- `fetchFn`: Функция, которая выполняет запрос. 🔄
- `options`: Дополнительные опции для конфигурирования повторных попыток. 🔁

---

### 10. **stopPolling** 🛑

Метод для остановки опроса данных по ключу.

```typescript
stopPolling(cacheKey: CacheKey)
```

**Аргумент:**

- `cacheKey`: Ключ, по которому нужно остановить опрос. 🛑

---

### 11. **cancelFetch** ❌

Метод для отмены конкретного запроса.

```typescript
cancelFetch(key: CacheKey)
```

**Аргумент:**

- `key`: Ключ запроса, который нужно отменить. 🛑

---

### 12. **cancelAllFetches** ❌

Метод для отмены всех активных запросов.

```typescript
cancelAllFetches();
```

---

### 13. **clearCache** 🧹

Метод для очистки всего кэша.

```typescript
clearCache();
```

---

### 14. **destroy** 💥

Метод для уничтожения хранилища, очистки всех подписок и кэша.

```typescript
destroy();
```

---

## 🧩 Пример использования

```typescript
import { createQueryStore } from "@qtpy/state-management-observable";

// Создаем хранилище
const store = createQueryStore({ user: null });

// Добавляем обработчик ошибок
store.addErrorHandler((error) => {
  console.error("Ошибка запроса:", error);
});

// Выполняем мутацию
const userMutation = store.createMutation({
  mutationFn: async (input) => {
    return await someApiCall(input);
  },
  invalidateTags: ["user-data"],
  onSuccess: (data) => console.log("Мутация прошла успешно", data),
});
```

---

## 🧠 Заключение

Библиотека **createQueryStore** предоставляет мощные возможности для управления состоянием и кэшированием, позволяя создавать асинхронные запросы с поддержкой зависимостей, мутаций и повторных попыток. Это идеальный инструмент для работы с динамическими данными, когда требуется управление их состоянием, кэшированием и обработкой ошибок. 🚀

---
