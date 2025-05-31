# Пример и краткая документация по `ObservableStore`

1. [Основная идея и архитектура](#основная-идея-и-архитектура)  
   1.1. [Прозрачный Proxy](#прозрачный-proxy)  
   1.2. [Подписки с «гранулярностью» путей](#подписки-с-гранулярностью-путей)  
   1.3. [Кэш-ключи (cacheKeys)](#кэш-ключи-cachekeys)  
   1.4. [Middleware-подход](#middleware-подход)  
   1.5. [Batching-обёртка](#batching-обёртка)  
   1.6. [Асинхронные обновления](#асинхронные-обновления)  
   1.7. [История изменений (undo/redo)](#история-изменений-undoredo)  
   1.8. [Интеграция с любым фреймворком](#интеграция-с-любым-фреймворком)

2. [Пример создания основного store (с middleware)](#пример-создания-основного-store-с-middleware)

3. [API createObservableStore](#api-createobservablestore)  
   3.1. [store.state / store.\$](#storestate--store)  
   3.2. [store.subscribe(callback, cacheKeys?)](#storesubscribecallback-cachekeys)  
   3.3. [store.subscribeToPath(pathOrAccessor, callback, options?)](#storesubscribetopathpathoraccessor-callback-options)  
   3.4. [store.invalidate(cacheKey)](#storeinvalidatecachekey)  
   3.5. [store.get(pathOrAccessor)](#storegetpathoraccessor)  
   3.6. [store.update(pathOrAccessor, valueOrFn)](#storeupdatepathoraccessor-valueorfn)  
   3.7. [store.resolveValue(pathOrAccessor, valueOrFn)](#storeresolvevaluepathoraccessor-valueorfn)

4. [Асинхронные обновления](#асинхронные-обновления)  
   4.1. [store.asyncUpdate(pathOrAccessor, asyncUpdater, options?)](#storeasyncupdatepathoraccessor-asyncupdater-options)  
   4.2. [store.cancelAsyncUpdates(pathOrAccessor?)](#storecancelasyncupdatespathoraccessor)

5. [Батчинг (store.batch)](#батчинг-storebatch)

6. [История изменений (undo/redo)](#история-изменений-undoredo)  
   6.1. [store.undo(pathOrAccessor)](#storeundopathoraccessor)  
   6.2. [store.redo(pathOrAccessor)](#storeredopathoraccessor)

7. [Статистика и очистка](#статистика-и-очистка)  
   7.1. [store.getMemoryStats()](#storegetmemorystats)  
   7.2. [store.clearStore()](#storeclearstore)

8. [Промежуточная обработка (Middleware)](#промежуточная-обработка-middleware)  
   8.1. [Когда срабатывает middleware](#1-когда-срабатывает-middleware)  
   8.2. [Изменение value внутри middleware](#2-изменение-value-внутри-middleware)  
   8.3. [Блокировка изменения](#3-блокировка-изменения)  
   8.4. [Последовательность нескольких middleware](#4-последовательность-нескольких-middleware)

9. [Основные преимущества такого подхода](#основные-преимущества-такого-подхода)

10. [Вывод](#вывод)

---

---

Ниже приведён пример реализации универсального реактивного стора (`ObservableStore`), написанного на TypeScript без привязки к конкретному фреймворку. Такой стор можно легко «подключить» в любом фронтенд-фреймворке (React, Vue, Svelte, Solid и т. д.) путём написания нескольких обёрток (адаптеров) поверх базового API.

## Основная идея и архитектура

1. #### Прозрачный Proxy

   Все обращения к состоянию (`state`) проходят через JavaScript Proxy, позволяющий автоматически отслеживать чтения и записи.

   - При чтении происходят «граббинги» зависимостей (чтобы знать, кто подписан на какой участок состояния).
   - При записи Proxy перехватывает изменение и уведомляет подписчиков.

2. #### Подписки с «гранулярностью» путей

   - Можно подписаться на любое конкретное поле вложенного объекта (например, `"user.settings.theme"`).
   - При изменении именно этого поля подписчики получат уведомление. Другие изменения в сторе не триггерят лишних колбэков.

3. #### Кэш-ключи (cacheKeys)

   - Позволяют группировать «логические зависимости» (например, вычисляемые свойства или отдельные куски UI).
   - При инвалидизации (вызове `invalidate(key)`) все подписчики, указавшие этот `cacheKey`, будут уведомлены, даже если напрямую поле могло не меняться.

4. #### Middleware-подход

   - При каждом `update` (или прямой записи через Proxy) можно выполнить цепочку middleware, чтобы логировать, валидировать или блокировать изменения.
   - Middleware вызываются в том порядке, в каком были зарегистрированы, но с учётом реверсивной передачи «вглубь» (чтобы окончательное ядро Update вызывалось только после прохода через всё дерево middleware).

5. #### Batching-обёртка

   - Позволяет «склеивать» несколько изменений в одно уведомление, чтобы избежать лишних перерендеров или запуска тяжёлых действий (API-запросов, пересчётов).

6. #### Асинхронные обновления

   - Метод `asyncUpdate(path, asyncFn, options?)` позволяет выполнять асинхронные операции (fetch, таймеры, запросы), автоматически отменяя предыдущие обновления по тому же пути при необходимости (опция `abortPrevious`).

7. #### История изменений (undo/redo)

   - Для каждого пути поддерживается стек исторических значений (до `maxHistoryLength`).
   - Методы `undo(path)` и `redo(path)` восстанавливают предыдущие или отменённые изменения.

8. #### Интеграция с любым фреймворком

   - Базовое API стpа не имеет зависимостей от React/Vue и т.д.
   - Для React достаточно написать хук `useObservableStore`, который будет подписываться на нужный путь и диспатчить обновление компонента. Аналогично для Vue/Svelte/Solid достаточно адаптера, который «слушает» изменения Proxy и вызывает соответствующие обновления.

---

## Пример создания основного `store` (с middleware)

```ts
// ObservableStore.ts
import {
  createObservableStore,
  Middleware,
  SubscriptionCallback,
  Accessor,
} from "./index";

// 1) Определяем начальный стейт:
const initialState = {
  user: {
    name: "Alice",
    age: 30,
    settings: {
      theme: "light",
      locale: "ru",
    },
  },
  items: [1, 2, 3],
  counter: 0,
};

// 2) Пример middleware: простой логгер перед и после update
const loggerMiddleware: Middleware<typeof initialState> = (store, next) => {
  return (path, value) => {
    console.log(
      `[Logger] До обновления: путь="${path}", старое значение=`,
      store.get(path)
    );
    next(path, value);
    console.log(
      `[Logger] После обновления: путь="${path}", новое значение=`,
      store.get(path)
    );
  };
};

// 3) Создаём стор с middleware и ограничением истории:
export const store = createObservableStore(
  initialState,
  [loggerMiddleware], // цепочка middleware
  { maxHistoryLength: 50 }
);

// Теперь при вызове store.update(...) или при прямой записи в store.state
// сработают middleware и, при изменении, уведомятся подписчики.
```

---

## API `createObservableStore`

### `store.state` / `store.$`

- **Что это:** реактивный Proxy-объект с текущим состоянием (readonly только «снаружи»).
- **Как пользоваться:**

  ```ts
  // Чтение:
  console.log(store.state.user.name); // Alice
  console.log(store.$.items.length); // 3

  // Прямая запись (через Proxy) «автоматом» вызывает middleware и нотификации подписчиков:
  store.state.user.name = "Bob";
  store.state.items.push(4);
  ```

- **Примечание:** `store.$`— это синоним `store.state`, просто позволяет использовать краткое обозначение внутри логики.

---

### `store.subscribe(callback, cacheKeys?)`

- **Что делает:** подписывает на **любой** апдейт всего состояния (глобальная подписка).
- **Параметры:**

  1. `callback: (newState) => void` — вызывается после каждого «батча» изменений.
  2. `cacheKeys?: string[]` — массив строковых ключей (cacheKey). Если указать, то уведомление придёт только тогда, когда:

     - изменился любой кусок стейта, и при этом хотя бы один `cacheKey` из списка был **инвалидирован** (см. `store.invalidate`), либо
     - внутри middleware/логики при обновлении явно вызывалась инвалидизация этого cacheKey.

- **Пример:**

  ```ts
  // Подписываемся на все апдейты:
  const unsubAll = store.subscribe((fullState) => {
    console.log("Весь стейт изменился:", fullState);
  });

  // Подписка, опирающаяся на cacheKey "user.settings.theme":
  const unsubFiltered = store.subscribe(
    (fullState) =>
      console.log("Тема пользователя:", fullState.user.settings.theme),
    ["user.settings.theme"]
  );

  // Отписка:
  unsubAll();
  unsubFiltered();
  ```

---

### `store.subscribeToPath(pathOrAccessor, callback, options?)`

- **Что делает:** подписывается на изменения **конкретного поля** (пути) в стейте.
- **Параметры:**

  1. `pathOrAccessor: string | (() => any)` — либо строка-путь (например, `"user.age"`), либо Accessor-функция, возвращающая нужное значение из `store.state`.
  2. `callback: (newValue) => void` — вызывается каждый раз при изменении указанного пути.
  3. `options?: { immediate?: boolean; cacheKeys?: string[] }` —

     - `immediate: true` — если указано, сразу вызываем callback с текущим значением, даже до первого изменения.
     - `cacheKeys: string[]` — если задан список cacheKeys, колбэк будет вызываться не только при прямом изменении пути, но и при инвалидизации хотя бы одного указанного ключа (см. `store.invalidate`).

- **Пример:**

  ```ts
  // Подписка на изменение user.name:
  const unsubName = store.subscribeToPath(
    "user.name",
    (newName) => console.log("Имя пользователя:", newName),
    { immediate: true }
  );

  // Подписка через Accessor и cacheKeys:
  const unsubFirstItem = store.subscribeToPath(
    () => store.state.items[0],
    (val) => console.log("Первый элемент массива:", val),
    { cacheKeys: ["counter"] }
  );

  // Отписаться:
  unsubName();
  unsubFirstItem();
  ```

---

### `store.invalidate(cacheKey)`

- **Что делает:**
  Инвалидирует указанный строковый ключ `cacheKey`.

  - Всем глобальным подписчикам, которые при подписке передали этот ключ в список `cacheKeys`, придёт уведомление (даже если напрямую значение по их пути не менялось).

- **Пример:**

  ```ts
  // Если где-то в логике нужно форсировать оповещение по подписчикам, полагающимся на cacheKey:
  store.invalidate("user.settings.theme");
  ```

---

### `store.get(pathOrAccessor)`

- **Что делает:**
  Возвращает «сырое» текущее значение по указанному пути или Accessor-функции.

  - Если путь не найден — возвращает undefined.

- **Пример:**

  ```ts
  const age = store.get("user.age"); // 30
  console.log("Возраст:", age);

  const firstItem = store.get(() => store.state.items[0]);
  console.log("Первый элемент:", firstItem); // 1
  ```

---

### `store.update(pathOrAccessor, valueOrFn)`

- **Что делает:**
  Синхронно обновляет значение по заданному пути (строка или Accessor).

  - `valueOrFn` может быть:

    1. Прямым значением: `store.update("user.age", 35)`
    2. Функцией `(cur) => next`: вычисляет следующее значение на основе текущего.

  - При записи в историю (до `maxHistoryLength`) пушится старое значение.
  - Вызываются middleware (в порядке регистрации), затем применяются изменения и уведомляются подписчики.
  - **Важное замечание:** Прямое присвоение через Proxy (`store.state.user.name = "Charlie"`) автоматически делегируется в `update` и тоже запускает весь цикл middleware и подписок.

- **Примеры:**

  ```ts
  // Обновление через метод:
  store.update("user.age", 35);
  store.update("user.age", (cur) => cur + 1);
  store.update(() => store.state.items[0], 42);

  // Прямые присваивания через Proxy:
  store.state.user.name = "Charlie";
  store.state.user.age = 23;
  store.state.items[0] = 100;
  // → Подписчики на "user.name", "user.age" и "items.0" будут вызваны автоматически.
  ```

---

### `store.resolveValue(pathOrAccessor, valueOrFn)`

- **Что делает:**
  Вычисляет, какое значение получено при применении `valueOrFn`, **но без фактической записи** в стор.
- **Пример:**

  ```ts
  const nextCounter = store.resolveValue("counter", (cur) => cur + 5);
  console.log("Будет следующий counter:", nextCounter);
  // При этом store.get("counter") остаётся прежним.
  ```

---

## Асинхронные обновления

### `store.asyncUpdate(pathOrAccessor, asyncUpdater, options?)`

- **Что делает:**
  Позволяет выполнить асинхронную функцию, передающую текущее значение и `AbortSignal`.

  - После завершения `asyncUpdater` возвращённое значение будет записано в стор по указанному пути.
  - Если в `options` указано `{ abortPrevious: true }`, предыдущий незавершённый асинхронный вызов по тому же пути будет отменён.

- **Параметры:**

  1. `pathOrAccessor: string | (() => any)`
  2. `asyncUpdater: (currentValue, signal) => Promise<nextValue>`
  3. `options?: { abortPrevious?: boolean }`

- **Пример:**

  ```ts
  // Загрузим список с сервера и запишем в state.items:
  await store.asyncUpdate(
    "items",
    async (currentItems, signal) => {
      const response = await fetch("/api/items", { signal });
      const data = await response.json();
      return data.list;
    },
    { abortPrevious: true }
  );
  ```

---

### `store.cancelAsyncUpdates(pathOrAccessor?)`

- **Что делает:**
  Отменяет все «висящие» (in-flight) asyncUpdate-запросы (через AbortSignal).

  - Если указан `pathOrAccessor`, то отменяет только для этого пути, иначе – для всех.

- **Пример:**

  ```ts
  // Отменить все асинхронные обновления:
  store.cancelAsyncUpdates();

  // Отменить только для пути "items":
  store.cancelAsyncUpdates("items");
  ```

---

## Батчинг (`store.batch`)

### `store.batch(callback)`

- **Что делает:**
  Группирует несколько изменений внутри одного колбэка, откладывая уведомления подписчикам до конца.

  - Внутри `callback` можно использовать как `store.update`, так и прямые присваивания через `store.state` (Proxy).
  - После выхода из `callback` уведомления отправляются единожды, даже если внутри было несколько изменений.

- **Примеры:**

  ```ts
  // Через метод update:
  await store.batch(() => {
    store.update("user.name", "Charlie");
    store.update("user.age", (cur) => cur + 2);
    store.update("items.0", 100);
  });
  // Подписчики получат одно уведомление после всех изменений.

  // С прямыми присваиваниями:
  await store.batch(() => {
    store.state.user.name = "Charlie";
    store.state.user.age = 23;
    store.state.items[0] = 100;
    store.state.items[0] = 2323; // перезапишется внутри той же батчи
  });
  // Подписчики увидят изменения по "user.name", "user.age" и "items.0" одним колбэком.
  ```

---

## История изменений (undo/redo)

### `store.undo(pathOrAccessor)`

- **Что делает:**
  Откатывает (undo) последнее изменение по указанному пути.

  - Если история по этому пути непуста, возвращает `true` и восстанавливает предыдущее значение, иначе `false`.

- **Пример:**

  ```ts
  store.update("counter", 10);
  store.update("counter", 20);

  console.log(store.get("counter")); // 20
  store.undo("counter");
  console.log(store.get("counter")); // 10
  ```

---

### `store.redo(pathOrAccessor)`

- **Что делает:**
  Повторяет (redo) последнее откатное изменение по указанному пути.

  - Если есть «отменённое» значение, возвращает `true` и применяет его, иначе `false`.

- **Пример:**

  ```ts
  // Продолжение предыдущего примера:
  store.undo("counter"); // возвращает к 10
  store.redo("counter");
  console.log(store.get("counter")); // 20
  ```

---

## Статистика и очистка

### `store.getMemoryStats()`

- **Что делает:**
  Возвращает объект с текущими статистическими данными:

  - `subscribersCount` — число глобальных подписчиков.
  - `pathSubscribersCount` — число подписок по конкретным путям.
  - `historyEntries` — список всех путей и длина их истории.
  - `activePathsCount` — число активных путей (за которыми кто-то следит).

- **Пример:**

  ```ts
  const stats = store.getMemoryStats();
  console.log("Глобальных подписчиков:", stats.subscribersCount);
  console.log("Подписок по путям:", stats.pathSubscribersCount);
  console.log("История:", stats.historyEntries);
  ```

---

### `store.clearStore()`

- **Что делает:**
  Полностью очищает хранилище:

  - Удаляет все подписки (глобальные и по путям).
  - Отменяет все «висящие» асинхронные обновления.
  - Очищает внутренние таймеры (если есть) и освобождает память.

- **Пример:**

  ```ts
  // Когда стор больше не нужен:
  store.clearStore();
  ```

---

## Промежуточная обработка (Middleware)

`Middleware` — это функции, которые «оборачивают» вызовы `store.update(...)` и дают возможность перехватывать (модифицировать, логировать, блокировать) запросы на изменение состояния.

### 1. Когда срабатывает middleware

- Middleware вызываются **только** при вызове `store.update(...)` или при прямом присвоении через `store.state` (через Proxy).
- Если обновление обойти Proxy (например, напрямую поменять внутренний объект вне Proxy), middleware не запустятся.

```ts
// Гарантированная активация middleware:
store.update("user.name", "Dmitry");
store.state.user.name = "Dmitry"; // тоже проксируется и идёт через middleware

// НЕ активирует middleware (не рекомендуется):
// (внутренний «сырый» объект здесь не трогает middleware):
(store as any).rawState.user.name = "Eve";
```

---

### 2. Изменение `value` внутри middleware

Внутри middleware есть доступ к исходному `path` и `value`. Можно изменить `value` перед тем, как передать его дальше по цепочке, вызвав `next(path, newValue)`.

```ts
const clampAgeMiddleware: Middleware<typeof initialState> = (store, next) => {
  return (path, value) => {
    if (path === "user.age") {
      // Ограничиваем возраст от 0 до 99:
      const clamped = Math.max(0, Math.min(99, value as number));
      next(path, clamped);
    } else {
      next(path, value);
    }
  };
};

// Теперь при store.update("user.age", 150) реально попадёт 99.
```

---

### 3. Блокировка изменения

Если внутри middleware **не вызвать** `next(path, value)`, весь дальнейший вызов метода `update` «глохнет» — изменения не применяются, а последующие middleware не вызываются.

```ts
const blockAgeMiddleware: Middleware<typeof initialState> = (store, next) => {
  return (path, value) => {
    if (path === "user.age") {
      console.warn("[Middleware] Изменение user.age заблокировано");
      // Не вызываем next → изменение не произойдёт
      return;
    }
    next(path, value);
  };
};

// Пробуем:
store.update("user.age", 40);
// Лог: [Middleware] Изменение user.age заблокировано
// Возраст остаётся прежним

store.update("user.name", "Bob");
// Проходит нормально, потому что для "user.name" вызывается next.
```

---

### 4. Последовательность нескольких middleware

При создании стора можно передать массив middleware, например: `[mw1, mw2, mw3]`.
Порядок вызова (после реверса) таков:

1. mw1 → вызывает mw2
2. mw2 → вызывает mw3
3. mw3 → вызывает «ядро» update

Если на каком-то этапе `next` не вызывается, дальнейшие middleware и само ядро не получат управление, и стор не обновится.

```ts
const mw1: Middleware<typeof initialState> = (store, next) => {
  return (path, value) => {
    console.log("[MW1] До", path, value);
    next(path, value);
    console.log("[MW1] После", path, store.get(path));
  };
};

const mw2: Middleware<typeof initialState> = (store, next) => {
  return (path, value) => {
    console.log("[MW2] Проверяем", path);
    if (path === "items.0") {
      console.log("[MW2] Блокируем изменение items.0");
      return; // не вызываем next → mw3 и ядро не выполняются
    }
    next(path, value);
  };
};

const mw3: Middleware<typeof initialState> = (store, next) => {
  return (path, value) => {
    console.log("[MW3] Логика MW3");
    next(path, value);
  };
};

const store = createObservableStore(initialState, [mw1, mw2, mw3]);

// Пример:
store.update("items.0", 999);
// Лог:
// [MW1] До items.0 999
// [MW2] Проверяем items.0
// [MW2] Блокируем изменение items.0
// → mw1 не получит управления после next, mw3 не вызовется, update не применится.

store.update("user.name", "Dmitry");
// Лог:
// [MW1] До user.name Dmitry
// [MW2] Проверяем user.name
// [MW3] Логика MW3
// [MW1] После user.name Dmitry
// → Реальное значение user.name изменено.
```

**Вывод по middleware:**

1. Middleware срабатывают только при использовании `store.update(...)` или записи через Proxy (`store.state`).
2. Внутри middleware можно изменить значение перед вызовом `next`.
3. Если не вызывать `next`, текущее обновление не дойдёт до следующих этапов.
4. Порядок middleware важен: тот, кто стоит раньше, может блокировать или модифицировать `path/value` до того, как это увидят следующие.

---

## Основные преимущества такого подхода

1. **Фреймворк-агностичность**

   - Ядро стора написано «чисто» на TypeScript без привязки к конкретному UI-фреймворку.
   - Для каждого фреймворка (React, Vue, Svelte, Solid и т. д.) достаточно написать лёгкий адаптер, который конвертирует `subscribeToPath` ↔️ ререндер в соответствующий способ.

2. **Точная гранулярность подписок**

   - Подписываются только на конкретные поля (пути) или на cacheKey.
   - Нет «лишних» уведомлений: если обновился `user.age`, подписчик на `items[0]` не будет вызван.

3. **Middleware и валидаторы**

   - Можно централизованно описать любые проверки/ограничения перед изменением состояния (блокировка, логирование, клэмпинг и т. д.).
   - Каждый middleware может модифицировать значение или полностью отменить update.

4. **Асинхронная логика ввода-вывода**

   - `asyncUpdate` с опцией `abortPrevious` позволяет элегантно обрабатывать запросы к серверу и отменять старые, если пришёл новый.

5. **История, undo/redo**

   - Для каждого пути автоматически накапливается стек изменений, что упрощает реализацию undo/redo в UI (например, в редакторах или сложных формах).

6. **Batching**

   - Позволяет сгруппировать сразу несколько связанных обновлений, чтобы подписчики получили единое уведомление, а UI не перерендерился по каждому маленькому изменению.

7. **Поддержка TypeScript**

   - Типизация `createObservableStore<RootState>(initialState, middleware, options)` даёт автодополнение и гарантии корректности путей при `store.get("user.age")` и `store.update("user.age", ...)`.

---

## # Вывод

1. **ObservableStore** — это универсальный реактивный стор, построенный на основе JavaScript Proxy, подписок по путям и цепочек middleware, который не зависит от конкретного фреймворка.
2. Благодаря «чистому» ядру, написанному на TypeScript, его можно без изменений подключать в React, Vue 3, Svelte, Solid и любых других средах: достаточно написать лёгкие «обёртки» (адаптеры) для подписки/рендера.
3. Вектор развития ObservableStore:

   - **Простая интеграция** с любым UI → адаптеры/хуки/реактивные примеси (Vue)
   - **Максимальная производительность** → granular подписки, batching
   - **Безопасность данных** → middleware для валидации, ограничения, логирования
   - **Дополнительные возможности** → undo/redo, асинхронные апдейты с отменой старых запросов, кэш-ключи для вычисляемых свойств

4. Если вам нужен лёгкий, быстро работающий, при этом максимально гибкий реактивный стор, который одинаково хорошо подойдёт под React, Vue, Svelte и другие фреймворки, описанный **ObservableStore** предоставит все необходимые механизмы «из коробки»: подписки по пути, middleware, асинхронная логика и история.
