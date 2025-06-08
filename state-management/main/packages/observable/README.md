# Пример и краткая документация по `ObservableStore`

1. [Основная идея и архитектура](#основная-идея-и-архитектура)  
   1.1. [Прозрачный Proxy](#прозрачный-proxy)  
   1.2. [Поддержка типизированных строковых ключей](#поддержка-типизированных-строковых-ключей)  
   1.3. [Подписки с «гранулярностью» путей](#подписки-с-гранулярностью-путей)  
   1.4. [Кэш-ключи (cacheKeys)](#кэш-ключи-cachekeys)  
   1.5. [Middleware-подход](#middleware-подход)  
   1.6. [Batching-обёртка](#batching-обёртка)  
   1.7. [Асинхронные обновления](#асинхронные-обновления)  
   1.8. [История изменений (undo/redo)](#история-изменений-undoredo)  
   1.9. [Интеграция с любым фреймворком](#интеграция-с-любым-фреймворком)

2. [Пример создания основного store (с middleware)](#пример-создания-основного-store-с-middleware)

3. [API createObservableStore](#api-createobservablestore)  
   3.1. [`store.state` / `store.$`](#storestate--store)  
   3.2. [`store.subscribe(callback, cacheKeys?)`](#storesubscribecallback-cachekeys)  
   3.3. [`store.subscribeToPath(pathOrAccessor, callback, options?)`](#storesubscribetopathpathoraccessor-callback-options)  
   3.4. [`store.invalidate(cacheKey)`](#storeinvalidatecachekey)  
   3.5. [`store.get(pathOrAccessor)`](#storegetpathoraccessor)  
   3.6. [`store.update(pathOrAccessor, valueOrFn)`](#storeupdatepathoraccessor-valueorfn)  
   3.7. [`store.resolveValue(pathOrAccessor, valueOrFn)`](#storeresolvevaluepathoraccessor-valueorfn)

4. [Асинхронные обновления](#асинхронные-обновления)  
   4.1. [`store.asyncUpdate(pathOrAccessor, asyncUpdater, options?)`](#storeasyncupdatepathoraccessor-asyncupdater-options)  
   4.2. [`store.cancelAsyncUpdates(pathOrAccessor?)`](#storecancelasyncupdatespathoraccessor)

5. [Батчинг (`store.batch`)](#батчинг-storebatch)

6. [История изменений (undo/redo)](#история-изменений-undoredo)  
   6.1. [`store.undo(pathOrAccessor)`](#storeundopathoraccessor)  
   6.2. [`store.redo(pathOrAccessor)`](#storeredopathoraccessor)

7. [Статистика и очистка](#статистика-и-очистка)  
   7.1. [`store.getMemoryStats()`](#storegetmemorystats)  
   7.2. [`store.clearStore()`](#storeclearstore)

8. [Промежуточная обработка (Middleware)](#промежуточная-обработка-middleware)  
   8.1. [Когда срабатывает middleware](#1-когда-срабатывает-middleware)  
   8.2. [Изменение `value` внутри middleware](#2-изменение-value-внутри-middleware)  
   8.3. [Блокировка изменения](#3-блокировка-изменения)  
   8.4. [Последовательность нескольких middleware](#4-последовательность-нескольких-middleware)

9. [Основные преимущества такого подхода](#основные-преимущества-такого-подхода)

10. [Вывод](#вывод)

---

Ниже приведён пример реализации универсального реактивного стора (ObservableStore), написанного на TypeScript без привязки к конкретному фреймворку. Такой стор можно легко «подключить» в любом фронтенд-фреймворке (React, Vue, Svelte, Solid и т. д.) путём написания нескольких обёрток (адаптеров) поверх базового API.

- Обертка под react: [@qtpy/state-management-react](https://www.npmjs.com/package/@qtpy/state-management-react)

---

## Основная идея и архитектура

1. #### Прозрачный Proxy

   Все обращения к состоянию (`state`) проходят через JavaScript Proxy, позволяющий автоматически отслеживать чтения и записи.

   - При чтении Proxy «собирает» зависимости: какие участки состояния используются внутри разных Accessor’ов или подписок.
   - При записи Proxy перехватывает изменение и в конце вызывает цепочку middleware и нотификации подписчиков.

2. #### Поддержка типизированных строковых ключей

   - В ObservableStore реализована строго типизированная система строковых путей, которая позволяет:

   - безопасно указывать строки путей вроде "user.settings.theme" без риска ошибок типов;

   - получать автодополнение путей при использовании TypeScript;

   - обеспечивать валидацию пути и значения: если путь некорректен — TypeScript подскажет об ошибке на этапе компиляции;

   - поддерживать доступ к кортежам и массивам по индексам, например: "items.0" или "list.2.name".

   - пример: [ссылка на картинку](https://raw.githubusercontent.com/TheOnlyFastCoder2/QtPy-library/refs/heads/main/state-management/main/packages/observable/assets/picture_autocomplete.png)

     <img src="https://raw.githubusercontent.com/TheOnlyFastCoder2/QtPy-library/refs/heads/main/state-management/main/packages/observable/assets/picture_autocomplete.png" width="1200"/>

3. #### Подписки с «гранулярностью» путей

   - Можно подписаться на любое конкретное поле вложенного объекта, используя либо строку-путь (`"user.settings.theme"`), либо Accessor: `(t) => store.state.user.settings.theme`.
   - При изменении именно этого поля подписчики получат уведомление. Изменения в других полях не затронут эту подписку.

4. #### Кэш-ключи (cacheKeys)

   - Позволяют группировать «логические зависимости» (например, вычисляемые свойства).
   - При вызове `store.invalidate(key)` все подписчики, передавшие этот `cacheKey` при подписке, будут уведомлены, даже если напрямую поле остался тем же.

5. #### Middleware-подход

   - При каждом `update` (или прямой записи через Proxy) можно выполнить цепочку middleware, чтобы логировать, валидировать или блокировать изменения.
   - Каждый middleware видит путь (`string`) и новое значение, может модифицировать или остановить дальнейшее распространение.

6. #### Batching-обёртка

   - Позволяет «склеивать» несколько изменений в одно уведомление. Это важно, чтобы не вызывать повторный ререндер UI при последовательных взаимосвязанных изменениях.

7. #### Асинхронные обновления

   - Метод `asyncUpdate(pathOrAccessor, asyncFn, options?)` позволяет выполнять асинхронные операции (fetch, таймеры, запросы) и автоматически отменять предыдущие, если они всё ещё в процессе (опция `abortPrevious`).

8. #### История изменений (undo/redo)

   - Для каждого пути автоматически поддерживается стек исторических значений (до `maxHistoryLength`).
   - Методы `undo(pathOrAccessor)` и `redo(pathOrAccessor)` позволяют откатиться на предыдущие/следующие значения.

9. #### Интеграция с любым фреймворком

   - Базовое API стора не зависит от React/Vue и т. д.
   - Для React достаточно написать хук `useObservableStore`, который внутри использует `store.subscribeToPath` с Accessor’ом, и диспатчит обновление компонента. Аналогично для Vue/Svelte/Solid достаточно написать адаптер, который на изменение Proxy вызывает реактивное обновление.

---

https://www.npmjs.com/package/@qtpy/state-management-react

## Пример создания основного `store` (с middleware)

```ts
// ObservableStore.ts
import {
  createObservableStore,
  Middleware,
  Accessor,
  SubscriptionCallback,
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

- **Что это:** реактивный Proxy-объект с текущим состоянием (readonly снаружи).

- **Как пользоваться:**

  ```ts
  // Чтение:
  console.log(store.state.user.name); // "Alice"
  console.log(store.$.items.length); // 3

  // Прямая запись (через Proxy) «автоматом» вызывает middleware и нотификации подписчиков:
  store.state.user.name = "Bob";
  store.state.items.push(4);
  ```

- **Примечание:** `store.$` — это просто синоним `store.state`. Удобно для внутрянки.

---

### `store.subscribe(callback, cacheKeys?)`

- **Что делает:** подписывает на **любой** апдейт всего состояния (глобальная подписка).

- **Параметры:**

  1. `callback: (newState: typeof initialState) => void` — вызывается после каждого «батча» изменений.
  2. `cacheKeys?: string[]` — массив строковых ключей (cacheKey). Если указан, уведомление придёт только тогда, когда:

     - изменился любой кусок стейта, и при этом один из этих cacheKeys был инвалидирован (`store.invalidate`), либо
     - напрямую было вызвано `store.invalidate(cacheKey)`.

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

- **Что делает:** подписывается на изменения **конкретного поля** (пути) в стейте, используя либо строку-путь, либо Accessor<T>.

- **Параметры:**

  1. `pathOrAccessor: string | Accessor<any>`

     - **`string`**: например, `"user.age"` или `"items.0"`
     - **`Accessor<any>`**: функция `(t?) => store.state.some.nested[t(dynamicIndex), …]`
       — если вам нужно подписаться, но индекс вычисляется динамически, можно передать Accessor.

  2. `callback: (newValue: any) => void` — вызывается при изменении указанного пути.
  3. `options?: { immediate?: boolean; cacheKeys?: string[] }` —

     - `immediate: true` — сразу вызываем callback с текущим значением, даже до первого изменения.
     - `cacheKeys: string[]` — список cacheKeys; колбэк будет вызываться при этом событии, даже если путь не менялся напрямую (см. `store.invalidate`).

- **Примеры:**

  ```ts
  // 1) Подписка на изменение user.name по строковому пути:
  const unsubName = store.subscribeToPath(
    "user.name",
    (newName) => console.log("Имя пользователя:", newName),
    { immediate: true }
  );

  // 2) Подписка на первый элемент массива items:
  //    Здесь index может меняться динамически внутри Accessor через t(index)
  let idx = 0;
  const unsubFirstItem = store.subscribeToPath(
    (t) => store.state.items[t(idx)], // Accessor<any>
    (val) => console.log("Первый элемент массива:", val),
    { cacheKeys: ["counter"] }
  );

  // 3) Отписка:
  unsubName();
  unsubFirstItem();
  ```

---

### `store.invalidate(cacheKey)`

- **Что делает:** инвалидирует указанный строковый ключ (`cacheKey`).

  - Всем глобальным подписчикам, которые при подписке передали этот ключ в `cacheKeys`, придёт уведомление (даже если напрямую значение по их пути не менялось).

- **Пример:**

  ```ts
  // Если где-то в логике нужно форсировать оповещение по подписчикам, полагающимся на cacheKey:
  store.invalidate("user.settings.theme");
  ```

---

### `store.get(pathOrAccessor)`

- **Что делает:** возвращает текущее значение по указанному `pathOrAccessor`.

  - Если передан `string` → возвращает `store.state[path]` (или `undefined`, если путь не найден).
  - Если передан `Accessor<any>` → внутри создаётся временная «заглушка» `t`(не обязательна), запускается Accessor, и возвращается результат.

- **Пример:**

  ```ts
  const age = store.get("user.age"); // 30
  console.log("Возраст:", age);

  // Пример с Accessor: читаем элемент массива по динамическому индексу
  let idx = 1;
  const firstItem = store.get((t) => store.state.items[t(idx)]);
  console.log("Второй элемент массива:", firstItem); // 2
  ```

---

### `store.update(pathOrAccessor, valueOrFn)`

- **Что делает:** синхронно обновляет значение по заданному `pathOrAccessor`.

  - `pathOrAccessor: string | Accessor<any>`

    - Если `string` → обновляем конкретный ключ.
    - Если `Accessor<any>` → внутри Accessor использует функцию `t(...)` для вычисления пути, затем обновляет это конкретное свойство.

  - `valueOrFn` может быть:

    1. **Прямым значением**:

       ```ts
       store.update("user.age", 35);
       ```

    2. **Функцией** `(cur) => next`: вычисляет новое значение на основе текущего:

       ```ts
       store.update("user.age", (cur) => cur + 1);
       ```

    3. **Если Accessor**: например,

       ```ts
       let idx = 2;
       store.update(
         (t) => store.state.items[t(idx)],
         (cur) => cur * 10
       );
       ```

       — тут `t(idx)` возвращает число `2`, и обновится `items[2]`.

  - При записи:

    - Сначала сохраняется старое значение в историю (до `maxHistoryLength`).
    - Запускаются middleware (в порядке регистрации).
    - Применяется фактическое обновление.
    - В конце уведомляются подписчики.

- **Примеры:**

  ```ts
  // 1) Обновление через строковый путь:
  store.update("user.age", 35);
  store.update("user.age", (cur) => cur + 1);

  // 2) Обновление через Accessor + динамический индекс:
  let dynamicIdx = 0;
  store.update((t) => store.state.items[t(dynamicIdx)], 42);
  // После этого items[0] станет 42.

  // 3) Прямые присваивания через Proxy:
  //    Proxy автоматически делегирует на store.update
  store.state.user.name = "Charlie";
  store.state.items[1] = 100;
  // → Подписчики на "user.name" и "items.1" получат нотификацию.
  ```

---

### `store.resolveValue(pathOrAccessor, valueOrFn)`

- **Что делает:** вычисляет, какое значение получится при применении `valueOrFn`, **но без фактической записи** в стор.

  - Удобно, когда нужно только узнать, как изменится значение, но ещё не применять это обновление.

- **Пример:**

  ```ts
  const nextCounter = store.resolveValue("counter", (cur) => cur + 5);
  console.log("Будет следующий counter:", nextCounter);
  // Но store.get("counter") остаётся прежним.
  ```

---

## Асинхронные обновления

### `store.asyncUpdate(pathOrAccessor, asyncUpdater, options?)`

- **Что делает:** выполняет асинхронную функцию, передающую текущее значение и `AbortSignal`, а затем записывает результат в указанный путь.

  - Если указан `options.abortPrevious: true`, предыдущий незавершённый запрос по тому же пути будет отменён при помощи `AbortController`.

- **Параметры:**

  1. `pathOrAccessor: string | Accessor<any>`
  2. `asyncUpdater: (currentValue: any, signal: AbortSignal) => Promise<any>`
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

- **Что делает:** отменяет все «висящие» (in-flight) `asyncUpdate` вызовы.

  - Если указан `pathOrAccessor`, то отменяет только для этого пути, иначе для всех.

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

- **Что делает:** группирует несколько изменений внутри одного блока, откладывая уведомления подписчикам до конца.

  - Внутри `callback` можно использовать как `store.update(...)`, так и прямые присваивания через `store.state` (Proxy).
  - После выхода из `callback` уведомления отправляются единовременно.

- **Примеры:**

  ```ts
  // 1) Через метод update:
  await store.batch(() => {
    store.update("user.name", "Charlie");
    store.update("user.age", (cur) => cur + 2);
    store.update("items.0", 100);
  });
  // Подписчики получат одно уведомление после всех изменений.

  // 2) С прямыми присваиваниями:
  await store.batch(() => {
    store.state.user.name = "Charlie";
    store.state.user.age = 23;
    store.state.items[0] = 100;
    store.state.items[2] = 2323; // всё в рамках одной батчи
  });
  // Подписчики увидят изменения по "user.name", "user.age" и "items.0", "items.2" одним колбэком.
  ```

---

## История изменений (undo/redo)

### `store.undo(pathOrAccessor)`

- **Что делает:** откатывает (undo) последнее изменение по указанному пути (или Accessor).

  - Если есть предыдущая запись, возвращает `true` и восстанавливает предыдущее значение. Иначе возвращает `false`.

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

- **Что делает:** повторяет (redo) последнее откатное изменение по указанному пути.

  - Если есть «отменённое» значение, возвращает `true` и применяет его. Иначе `false`.

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

- **Что делает:** возвращает объект с текущими статистическими данными:

  - `subscribersCount` — число глобальных подписчиков.
  - `pathSubscribersCount` — число подписок по конкретным путям/Accessor’ам.
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

- **Что делает:** полностью очищает хранилище:

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

- Middleware вызываются **только** при:

  1. вызове `store.update(...)`, или
  2. прямой записи через Proxy (`store.state.some.key = newValue`).

- Если обновление обойти Proxy (например, напрямую поменять внутренний «сырой» объект вне Proxy), middleware не запустятся.

```ts
// Гарантированная активация middleware:
store.update("user.name", "Dmitry");
store.state.user.name = "Dmitry"; // Proxy перехватывает и идёт через middleware

// НЕ активирует middleware (не рекомендуется):
// (внутренний «сырый» объект здесь не трогает Proxy)
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

При создании стора можно передать массив middleware, например: `[mw1, mw2, mw3]`. Порядок вызова (после реверса) таков:

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
      return; // mw3 и ядро не выполнятся
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
// → mw1 не продолжит после next, mw3 не вызовется, update не применится.

store.update("user.name", "Dmitry");
// Лог:
// [MW1] До user.name Dmitry
// [MW2] Проверяем user.name
// [MW3] Логика MW3
// [MW1] После user.name Dmitry
// → Значение применено.
```

---

## Основные преимущества такого подхода

1. **Фреймворк-агностичность**

   - Ядро стора написано «чисто» на TypeScript, без зависимостей от React/Vue/Svelte.
   - Для каждого фреймворка достаточно написать адаптер (хук или плагин), который будет цепляться к `store.subscribeToPath` и диспатчить обновления UI.

2. **Точная гранулярность подписок**

   - Подписки могут работать по строковому пути или через Accessor<T>, где внутри Accessor можно использовать функцию `t(…)` для динамических индексов.
   - Подписчики получают уведомления только по тем полям, на которые они подписаны.

3. **Middleware и валидаторы**

   - Можно централизованно описать проверки/блокировки/трансформации значений до их записи.
   - Каждый middleware может модифицировать `value` или полностью отменить обновление.

4. **Асинхронная логика ввода-вывода**

   - `asyncUpdate` с опцией `abortPrevious` позволяет элегантно обрабатывать взаимодействие с сетью, отменяя прежние запросы, если они больше не актуальны.

5. **История, undo/redo**

   - Автоматический стек изменений для каждого пути. Удобно в UI для кнопок «отменить»/«вернуть».

6. **Batching**

   - Позволяет сгруппировать сразу несколько взаимосвязанных обновлений, чтобы подписчики получили единое уведомление, и UI не перерендеривался по каждому мелкому изменению.

7. **Полная поддержка TypeScript**

   - Тип `Accessor<T> = (t: (arg: any) => any) => T` обеспечивает автодополнение и статическую проверку при работе с вложенными путями.
   - Вызовы `store.get` и `store.update` с Accessor’ом позволяют точно указывать нужное свойство без хардкода строк.

---

## Вывод

- **ObservableStore** — это универсальный реактивный стор, построенный на основе JavaScript Proxy, Accessor<T> для динамических путей, granular подписок и цепочек middleware.
- Благодаря «чистому» ядру, написанному на TypeScript, его можно без изменений подключать в React, Vue 3, Svelte, Solid и другие среды: достаточно написать лёгкие адаптеры для подписки и рендеринга.
- **Ключевые возможности**:

  1. Поддержка динамических путей через `Accessor<T>`, где внутри можно вызвать `t(index)` для вычисления индекса.
  2. Гранулярные подписки по точечному пути или Accessor’у.
  3. Middleware для валидации и логирования.
  4. Асинхронные обновления с отменой прошлых запросов (`asyncUpdate`).
  5. История изменений (undo/redo) для каждого пути.
  6. Бэчинг (`batch`) для группировки изменений.

Если вам нужен лёгкий, быстро работающий, максимально гибкий реактивный стор с поддержкой динамических Accessor’ов, изложенный **ObservableStore** предоставит все механизмы «из коробки».
