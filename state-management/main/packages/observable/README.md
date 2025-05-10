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
14. [🏷️ state / 🛠️ `$`](#️-state--️-)
15. [🔗 Общий пример](#-общий-пример)

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
    cleanupInterval?: number;
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

| Имя                   | Тип               | Описание                                           |
| --------------------- | ----------------- | -------------------------------------------------- |
| `initialState`        | `T`               | Начальное состояние (любой объект).                |
| `middlewares?`        | `Middleware<T>[]` | Массив функций-перехватчиков `update`.             |
| `options?`            | `{…}`             | Дополнительные настройки:                          |
| └ `maxHistoryLength?` | `number`          | Макс. число записей истории на путь.               |
| └ `cleanupInterval?`  | `number`          | Интервал (мс) авто-очистки неиспользуемой истории. |

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
> Асинхронное обновление с отменой предыдущих.

### ⚙️ Сигнатура

```ts
asyncUpdate<P extends PathTracker<any, any>>(
  path: P,
  asyncUpdater: (
    cur: P[typeof TYPE_SYMBOL],
    signal: AbortSignal
  ) => Promise<P[typeof TYPE_SYMBOL]>
): Promise<void>;
```

### 📝 Описание

- Предоставляет `AbortSignal` для отмены.
- Предыдущие вызовы по тому же пути автоматически отменяются.

### ▶️ Пример

```ts
await store.asyncUpdate(store.$.user.age, async (cur, signal) => {
  const res = await fetchAgeFromApi(signal);
  return res;
});
```

---

## 📦 batch

> **Назначение:**
> Сгруппировать несколько операций в одну нотификацию.

### ⚙️ Сигнатура

```ts
batch(
  callback: () => void,
  isAsync?: boolean
): void;
```

### 📝 Описание

- Если `isAsync=true`, ждёт `Promise` внутри.
- Все `update` и `asyncUpdate` внутри выполняются без повторных уведомлений.

### ▶️ Пример

```ts
await store.batch(async () => {
  store.update(store.$.counter, 5);
  await store.asyncUpdate(store.$.user.age, async (a) => a * 2);
}, true);
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

---

## 🏷️ state / 🛠️ `$`

| Свойство | Тип            | Описание                                         |
| -------- | -------------- | ------------------------------------------------ |
| `state`  | `T`            | Прокси-объект для чтения и прямого присваивания. |
| `$`      | `PathProxy<T>` | Генератор “path trackers” для подписок и update. |

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
  }, true); // Конец батча

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
