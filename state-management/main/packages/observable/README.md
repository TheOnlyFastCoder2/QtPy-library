# Пример и краткая документация по `ObservableStore`

1. [Основная идея и архитектура](#основная-идея-и-архитектура)  
   1.1. [Прозрачная реактивность](#прозрачная-реактивность)  
   1.2. [Поддержка типизированных строковых ключей](#поддержка-типизированных-строковых-ключей)  
   1.3. [Подписки с «гранулярностью» путей](#подписки-с-гранулярностью-путей)  
   1.4. [Кэш-ключи (cacheKeys)](#кэш-ключи-cachekeys)  
   1.5. [Middleware-подход](#middleware-подход)  
   1.6. [Batching-обёртка](#batching-обёртка)  
   1.7. [Асинхронные обновления](#асинхронные-обновления)  
   1.8. [История изменений (undo/redo)](#история-изменений-undoredo)  
   1.9. [Интеграция с любым фреймворком](#интеграция-с-любым-фреймворком)

2. [Пример создания основного store (с middleware)](#пример-создания-основного-store-с-middleware)  
   2.1 [Что делает `DepthPath` и зачем он нужен](#что-делает-DepthPath-и-зачем-он-нужен)  
   2.2 [Что такое `Accessor` и зачем он нужен](#что-такое-Accessor-и-зачем-он-нужен)  
   2.3 [Что такое `CacheKeys` и зачем они нужен](#что-такое-CacheKeys-и-зачем-они-нужен)

3. [API createObservableStore](#api-createobservablestore)  
   3.1. [`store.subscribe(callback, cacheKeys?)`](#storesubscribecallback-cachekeys)  
   3.2. [`store.subscribeToPath(pathOrAccessor, callback, options?)`](#storesubscribetopathpathoraccessor-callback-options)  
   3.3. [`store.invalidate(cacheKey)`](#storeinvalidatecachekey)  
   3.4. [`store.get(pathOrAccessor)`](#storegetpathoraccessor)  
   3.5. [`store.update(pathOrAccessor, valueOrFn, options)`](#storeupdatepathoraccessor-valueorfn-options)  
   3.6. [`store.resolveValue(pathOrAccessor, valueOrFn)`](#storeresolvevaluepathoraccessor-valueorfn)  
   3.7. [`store.resolvePath(pathOrAccessor)`](#storeresolvepathpathoraccessor)

4. [Асинхронные обновления](#асинхронные-обновления)  
   4.1. [`store.asyncUpdate(pathOrAccessor, asyncUpdater, options?)`](#storeasyncupdatepathoraccessor-asyncupdater-options)  
   4.2. [`store.cancelAsyncUpdates(pathOrAccessor?)`](#storecancelasyncupdatespathoraccessor)

5. [Батчинг (`store.batch`)](#батчинг-storebatch)

6. [История (undo/redo)](#история-undoredo)  
   6.1. [`store.undo(pathOrAccessor)`](#storeundopathoraccessor)  
   6.2. [`store.redo(pathOrAccessor)`](#storeredopathoraccessor)  
   6.4. [`store.getUndo(pathOrAccessor, step)`](#storegetundopathoraccessor-step)  
   6.3. [`store.getRedo(pathOrAccessor, step)`](#storegetredopathoraccessor-step)  
   6.5. [`store.getHistory(pathOrAccessor)`](#storegetHistorypathoraccessor)  
   6.6. [`store.clearHistoryPath(pathOrAccessor)`](#storeclearHistoryPathpathoraccessor)  
   6.7. [`store.clearAllHistory()`](#storeclearAllHistory)

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

1. #### Прозрачная реактивность
   Реактивность реализована через систему подписок и JavaScript Proxy:

    - **Система подписок**: Хранит подписчиков (`subscribers`, `pathSubscribers`) и уведомляет их об изменениях через `notifyInvalidate`. Работает независимо от прокси, используя `getRaw` и `setRaw`.
    - **Система прокси**: Перехватывает операции чтения (`get`), записи (`set`) и удаления, собирает зависимости в `trackedPaths` и инициирует обновления через `store.update`, уведомляя подписчиков.
    - **Взаимодействие**: Подписки независимы, прокси зависит от них для уведомлений. Middleware интегрируется в цепочку обновлений.

2. #### Поддержка типизированных строковых ключей

   - В ObservableStore реализована строго типизированная система строковых путей, которая позволяет:
   - безопасно указывать строки путей вроде "user.settings.theme" без риска ошибок типов;
   - получать автодополнение путей при использовании TypeScript;
   - обеспечивать валидацию пути и значения: если путь некорректен — TypeScript подскажет об ошибке на этапе компиляции;
   - поддерживать доступ к кортежам и массивам по индексам, например: "items.0" или "list.2.name".

   - пример: [ссылка на картинку](https://raw.githubusercontent.com/TheOnlyFastCoder2/QtPy-library/refs/heads/main/state-management/main/packages/observable/assets/picture_autocomplete.png)

     <img src="https://raw.githubusercontent.com/TheOnlyFastCoder2/QtPy-library/refs/heads/main/state-management/main/packages/observable/assets/picture_autocomplete.png" width="1200"/>

3. #### Подписки с «гранулярностью» путей

   - Можно подписаться на любое конкретное поле вложенного объекта, используя либо строку-путь (`"user.settings.theme"`), либо Accessor: `($, t) => $.user.settings.theme`.
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

   - Для указанных в `customLimitsHistory` свойств сохраняется история изменений с заданным лимитом.
   - Методы `undo(pathOrAccessor)` и `redo(pathOrAccessor)` позволяют откатиться на предыдущие/следующие значения.

9. #### Интеграция с любым фреймворком

   - Базовое API стора не зависит от React/Vue и т. д.
   - Для React достаточно написать хук `useObservableStore`, который внутри использует `store.subscribeToPath` с Accessor’ом, и диспатчит обновление компонента. Аналогично для Vue/Svelte/Solid достаточно написать адаптер, который на изменение Proxy вызывает реактивное обновление.

---

## Пример создания основного `store` (с middleware)

```ts
// ObservableStore.ts
import { createObservableStore, Middleware } from '@qtpy/state-management-observable';
// 1) Определяем начальный interface :
interface StoreState {
  user: {
    name: string;
    age: number;
    settings: {
      theme: string;
      locale: string;
    };
  };
  items: number[];
  counter: number;
}

// 2) Определяем начальный стейт:
const initialState = {
  user: {
    name: 'Alice',
    age: 30,
    settings: {
      theme: 'light',
      locale: 'ru',
    },
  },
  items: [1, 2, 3],
  counter: 0,
};
// 3) Глубина тип поиска строковых путей
type DepthPath = 14;
// 3) Пример middleware: простой логгер перед и после update
const loggerMiddleware: Middleware<StoreState, DepthPath> = (store, next) => {
  return (path, value) => {
    console.log(`[Logger] До обновления: путь="${path}", старое значение=`, store.get(path));
    next(path, value);
    console.log(`[Logger] После обновления: путь="${path}", новое значение=`, store.get(path));
  };
};

// 3) Создаём стор с middleware и ограничением истории:
export const store = createObservableStore<StoreState, DepthPath>(
  initialState,
  [loggerMiddleware], // цепочка middleware
  {
    customLimitsHistory: [
      // Для свойства counter сохраняем до 3 предыдущих состояний
      ['counter', 3],
      // Для locale — до 2 состояний
      ['user.settings.locale', 2],
      // Для 4-го элемента массива items через аксцессор — до 3 состояний
      [($) => $.items[3], 3],
      // Для всего массива items — до 3 состояний
      [($) => $.items, 3],
    ],
  }
);

// Теперь при вызове store.update(...) или при прямой записи в store.state
// сработают middleware и, при изменении, уведомятся подписчики.
```

## API `createObservableStore`

### `store.subscribe(callback, cacheKeys?)`

Это метод глобальной подписки на любые изменения в состоянии, вне зависимости от затронутого поля. Он позволяет отслеживать все обновления стора. При указании массива `cacheKeys`, подписка будет срабатывать только при изменениях, затрагивающих указанные зависимости. Это удобно для логгирования, аналитики, синхронизации и системного поведения, которое должно реагировать на любые модификации состояния.

- **Параметры:**

  1. `callback: (state) => void` — вызывается после каждого «батча» изменений.
  2. `cacheKeys?: string[]` — массив строковых ключей (cacheKey). Если указан, уведомление придёт только тогда, когда:

- **Пример:**

  ```ts
  // Подписываемся на все апдейты:
  const unsubAll = store.subscribe((fullState) => {
    console.log('Весь стейт изменился:', fullState);
  });

  // Подписка, опирающаяся на cacheKey "user.settings.theme":
  const unsubFiltered = store.subscribe(
    (fullState) => console.log('Тема пользователя:', fullState.user.settings.theme),
    ['user.settings.theme']
  );

  // Отписка:
  unsubAll();
  unsubFiltered();
  ```

---

### `store.subscribeToPath(pathOrAccessor, callback, options?)`

subscribeToPath позволяет подписаться на изменения конкретного поля в состоянии, указав путь как строку или Accessor-функцию. Срабатывает только при изменении указанного участка данных, обеспечивая точный контроль над реактивностью.

- **Параметры:**

  1. `pathOrAccessor`
  2. `callback: (newValue) => void` — вызывается при изменении указанного пути.
  3. `options?: { immediate?: boolean; cacheKeys?: string[] }` —
     - `immediate: true` — сразу вызываем callback с текущим значением, даже до первого изменения.
     - `cacheKeys: string[]` — список cacheKeys; колбэк будет вызываться при этом событии, даже если путь не менялся напрямую (см. `store.invalidate`).

- **Примеры:**

  ```ts
  // 1) Подписка на изменение user.name по строковому пути:
  const unsubName = store.subscribeToPath('user.name', (newName) => console.log('Имя пользователя:', newName), {
    immediate: true,
  });

  // 2) Подписка на первый элемент массива items:
  //    Здесь index может меняться динамически внутри Accessor через t(index)
  let idx = 0;
  const unsubFirstItem = store.subscribeToPath(
    ($, t) => $.items[t(idx)], // Accessor<any>
    (val) => console.log('Первый элемент массива:', val),
    { cacheKeys: ['counter'] }
  );

  // 3) Отписка:
  unsubName();
  unsubFirstItem();
  ```

---

### `store.invalidate(cacheKey)`

Инвалидирует указанный строковый ключ (`cacheKey`). Всем глобальным подписчикам, которые при подписке передали этот ключ в `cacheKeys`, придёт уведомление (даже если напрямую значение по их пути не менялось).

- **Пример:**

  ```ts
  // Если где-то в логике нужно форсировать оповещение по подписчикам, полагающимся на cacheKey:
  store.invalidate('user.settings.theme');
  ```

---

### `store.get(pathOrAccessor)`

Метод store.get(pathOrAccessor) используется для безопасного получения значения из стора — по строковому пути ("user.age") или Accessor-функции. В отличие от прямого доступа через $.myObject, он гарантирует корректное извлечение даже при работе с реактивными объектами, проксями и вложенными структурами. Это особенно важно,`чтобы избежать ошибок вроде Uncaught TypeError: Illegal invocation`, которые могут возникнуть при вызове нативных методов DOM или работы с объектами вне контекста. Метод также улучшает читаемость, типизацию и делает код предсказуемым при масштабировании.

- **Пример:**

  ```ts
  const age = store.get('user.age'); // 30
  console.log('Возраст:', age);

  // Пример с Accessor: читаем элемент массива по динамическому индексу
  let idx = 1;
  const firstItem = store.get(($, t) => $.items[t(idx)]);
  console.log('Второй элемент массива:', firstItem); // 2
  ```

---

### `store.update(pathOrAccessor, valueOrFn, options)`

Метод для синхронного обновления значения в хранилище. Он принимает:

- `pathOrAccessor`: строку типа `"user.age"` или Accessor-функцию
- `valueOrFn`: новое значение или функцию `(cur) => next`
- `options`: объект с параметрами, включая `keepQuiet`

---

#### Механизм Snapshot перед/после обновления

При каждом вызове `update()`:

- Перед обновлением создаётся снимок (snapshot) текущей структуры объекта или массива без инстанцирования нового экземпляра.
- Старое значение сохраняется в историю (до `maxHistoryLength`).
- Запускаются middleware (в порядке регистрации).
- Применяется фактическое обновление.
- После обновления формируется новый снимок и сравниваются хеши старого и нового состояний, чтобы точно определить, что изменилось.
- Подписчики уведомляются только при реальных отличиях в данных.

Это позволяет:

- Минимизировать лишние обновления UI
- Обеспечить корректную работу undo/redo
- Эффективно отследить изменения для дебага

---

#### Поддержка мутаций массивов через Proxy

Даже косвенные изменения через методы `push`, `splice`, `sort` и другие — отслеживаются:

- Все обращения проходят через `store.$`, перехватываются `Proxy`
- Изменения через методы → автоматически вызывают `store.update(...)`
- Поддерживается история, middleware, нотификации

Примеры:

```ts
store.$.items.push(100); // вызовет уведомление
store.$.items.splice(1, 2); // → нотификация по "items"
store.$.user.name = 'Charlie'; // → нотификация по "user.name"
```

---

#### Использование `update()` — варианты

1. **По строковому пути**:

```ts
store.update('user.age', 35);
```

2. **Через функцию**:

```ts
store.update('user.age', (cur) => cur + 1);
```

3. **С `keepQuiet`** — чтобы не уведомлять подписчиков:

```ts
store.update('user.age', 36, { keepQuiet: true });
store.update.quiet('user.age', 36);
```

4. **Через Accessor с динамикой**:

```ts
let idx = 2;
store.update(
  ($, t) => $.items[t(idx)],
  (cur) => cur * 10
);
```

5. **Массив и сравнение snapshot**:

```ts
store.update('items', (prev) => {
  return prev.reverse(); // вызовет уведомление
});
store.update('items', (prev) => {
  return prev; // не вызовет — snapshot не изменился
});
```

---

### `store.resolvePath(pathOrAccessor)`

`resolvePath` преобразует путь к данным (строку вида `'a.b'` или функцию `$ => $.a.b`) в строковый формат для внутреннего использования в хранилище. Гарантирует валидность пути и соответствие глубине вложенности.

**Может пригодиться в Middleware**

- **Пример:**

```ts
store.resolvePath('user.name'); // → 'user.name'
store.resolvePath(($) => $.profile.age); // → 'profile.age'
```

---

### `store.resolveValue(pathOrAccessor, valueOrFn)`

Этот метод для безопасного "предпросмотра" обновления состояния. Он рассчитывает, каким будет итоговое значение после применения функции или прямого значения, не меняя данные в сторе. Это удобно, когда нужно сделать условную проверку, провести валидацию, сравнить с текущим значением или подготовить сложную логику обновления, не рискуя триггерить подписки или ререндеры.

**Может пригодиться в Middleware**

- **Пример:**

```ts
const nextCounter = store.resolveValue('counter', (cur) => cur + 5);
console.log('Будет следующий counter:', nextCounter);
// Но store.get("counter") остаётся прежним.
```

---

## Асинхронные обновления

### `store.asyncUpdate(pathOrAccessor, asyncUpdater, options?)`

Асинхронный метод обновления - полезно если нужно отменить предыдущий запрос. При включённой опции `abortPrevious: true`, все незавершённые обновления по тому же пути автоматически прерываются, исключая гонки данных и обеспечивая корректное состояние. Это удобно при вводе в поле, дебаунсе, сетевых запросах или при переключении контекста.

- Если указан `options.abortPrevious: true`, предыдущий незавершённый запрос по тому же пути будет отменён при помощи `AbortController`.

- **Пример:**

  ```ts
  // Загрузим список с сервера и запишем в $.items:
  await store.asyncUpdate(
    'items',
    async (currentItems, signal) => {
      const response = await fetch('/api/items', { signal });
      const data = await response.json();
      return data.list;
    },
    { abortPrevious: true }
  );
  ```

---
### `store.asyncUpdate.quiet(pathOrAccessor, asyncUpdater, options?)`

Вариант `asyncUpdate`, который **не вызывает перерисовку компонентов и не активирует подписки**. Это удобно для фоновых обновлений или временных значений, которые не должны вызывать реакцию в UI.


- **Пример:**

  ```ts
  // Временно устанавливаем $.status = 'loading', без триггера подписок
  await store.asyncUpdate.quiet(
    'status',
    async (_, signal) => {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, 1000);
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      return 'idle';
    },
    { abortPrevious: true }
  );
  ```
---

### `store.cancelAsyncUpdates(pathOrAccessor?)`

Метод для отмены активных асинхронных обновлений, запущенных через asyncUpdate. Если передать конкретный путь, отменяются запросы только по нему; если вызвать без аргументов — завершатся все «висящие» обновления во всём сторе. Это помогает избежать конфликтов данных, гонок, или лишней нагрузки, особенно при переключении экрана, logout'е, или повторном вводе данных.

- **Пример:**

  ```ts
  // Отменить все асинхронные обновления:
  store.cancelAsyncUpdates();

  // Отменить только для пути "items":
  store.cancelAsyncUpdates('items');
  ```

---

## Батчинг (`store.batch`)

### `store.batch(callback)`

Позволяет объединить несколько изменений состояния в один реактивный блок, при этом уведомления подписчикам отправляются только после завершения всех операций. Это уменьшает количество лишних ререндеров, увеличивает производительность и делает логику обновлений более предсказуемой. Особенно полезно при комплексных изменениях, когда нужно обновить сразу несколько полей без промежуточных реакций.

- **Примеры:**

  ```ts
  // 1) Через метод update:
  await store.batch(() => {
    store.update('user.name', 'Charlie');
    store.update('user.age', (cur) => cur + 2);
    store.update('items.0', 100);
    store.update('items.0', 200); // два изменения одного пути
  });
  // Подписчики получат одно уведомление:
  // - user.name = "Charlie"
  // - user.age = previous + 2
  // - items.0 = 200  (только последнее)

  // 2) С прямыми присваиваниями:
  await store.batch(() => {
    store.$.user.name = 'Charlie';
    store.$.user.age = 23;
    store.$.items[0] = 100;
    store.$.items[0] = 200; // два присваивания
  });
  // Подписчики увидят изменения:
  // "user.name", "user.age", "items.0" — со значением 200
  ```

---

## История (undo/redo)

История изменений (undo/redo) не отслеживается автоматически для всех полей состояния. Чтобы активировать историю для конкретных свойств, необходимо явно указать их в параметре customLimitsHistory при создании хранилища.

```ts
const store = createObservableStore<AppState, DepthPath>(initialState, [], {
  customLimitsHistory: [
    ['user.age', 5], // [path, лимит]
    [($) => $.items[0], 3], // [accessor, лимит]
  ],
});
```

- **Важно:** история не реагирует на косвенные изменения массивов через методы (например, `store.$.items.push(23)`), поэтому такие правки **не** попадают в стек `undo/redo`.

### `store.undo(pathOrAccessor)`

- **Что делает:** откатывает (undo) последнее изменение по указанному пути (или Accessor).

  - Если есть предыдущая запись, возвращает `true` и восстанавливает предыдущее значение. Иначе возвращает `false`.

- **Пример:**

  ```ts
  store.update('counter', 10);
  store.update('counter', 20);

  console.log(store.get('counter')); // 20
  store.undo('counter');
  console.log(store.get('counter')); // 10
  ```

---

### `store.redo(pathOrAccessor)`

- **Что делает:** повторяет (redo) последнее откатное изменение по указанному пути.

  - Если есть «отменённое» значение, возвращает `true` и применяет его. Иначе `false`.

- **Пример:**

  ```ts
  // Продолжение предыдущего примера:
  store.undo('counter'); // возвращает к 10
  store.redo('counter');
  console.log(store.get('counter')); // 20
  ```

---

Вот документация в таком же формате для методов `store.getUndo`, `store.getRedo` и `store.getHistory`:

---

### `store.getUndo(pathOrAccessor, step)`

- **Что делает:** возвращает значение из undo-истории на указанное количество шагов назад по пути `pathOrAccessor`.

  - `step = 0` — текущее значение.
  - `step = 1` — предыдущее значение.
  - Если шаг выходит за границы undo-истории, возвращает `undefined`.

- **Пример:**

  ```ts
  store.$.counter = 10;
  store.$.counter = 20;
  store.$.counter = 30;

  store.getUndo('counter', 0); // 30
  store.getUndo('counter', 1); // 20
  store.getUndo('counter', 2); // 10
  store.getUndo('counter', 3); // undefined
  ```

---

### `store.getRedo(pathOrAccessor, step)`

- **Что делает:** возвращает значение из redo-истории на указанное количество шагов вперёд по пути `pathOrAccessor`.

  - `step = 0` — ближайшее значение для повтора.
  - `step = 1` — следующее за ним и т.д.
  - Если redo-история пуста или шаг выходит за границы, возвращает `undefined`.

- **Пример:**

  ```ts
  store.update('counter', 10);
  store.update('counter', 20);
  store.undo('counter'); // возвращает к 10
  store.undo('counter'); // возвращает к undefined

  store.getRedo('counter', 0); // 10
  store.getRedo('counter', 1); // 20
  store.getRedo('counter', 2); // undefined
  ```

---

### `store.getHistory(pathOrAccessor)`

- **Что делает:** возвращает полную историю изменений по указанному пути в виде объекта `{ undo, redo }`.

  - `undo` — массив значений, от самого первого до текущего.
  - `redo` — массив отменённых значений, доступных для повторного применения.

- **Пример:**

  ```ts
  store.update('counter', 10);
  store.update('counter', 20);
  store.undo('counter');

  const history = store.getHistory('counter');
  console.log(history.undo); // [10]
  console.log(history.redo); // [20]
  ```

---

### `store.clearHistoryPath(pathOrAccessor)`

Этот метод для точечной очистки истории изменений (undo/redo stack) конкретного поля состояния. Он полностью удаляет все сохранённые промежуточные состояния для указанного пути, но не затрагивает само текущее значение в сторе.

- **Пример:**

```ts
store.clearHistoryPath('user.age'); // или
store.clearHistoryPath(($) => $.user.age);
```

### `store.clearAllHistory()`

Этот метод для полного сброса всей истории изменений во всём сторе. Удаляет все сохранённые состояния undo/redo для всех полей одновременно.

- **Пример:**

```ts
store.clearAllHistory();
```

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
  console.log('Глобальных подписчиков:', stats.subscribersCount);
  console.log('Подписок по путям:', stats.pathSubscribersCount);
  console.log('История:', stats.historyEntries);
  ```

---

### `store.clearStore()`

- **Что делает:** полностью очищает хранилище:

  - Удаляет все подписки (глобальные и по путям).
  - Отменяет все «висящие» асинхронные обновления.
  - Очищает историю.

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
  2. прямой записи через Proxy (`store.$.some.key = newValue`).

- Если обновление обойти Proxy (например, напрямую поменять внутренний «сырой» объект вне Proxy), middleware не запустятся.

```ts
// Гарантированная активация middleware:
store.update('user.name', 'Dmitry');
store.$.user.name = 'Dmitry'; // Proxy перехватывает и идёт через middleware

// НЕ активирует middleware (не рекомендуется):
// (внутренний «сырый» объект здесь не трогает Proxy)
(store as any).rawState.user.name = 'Eve';
```

---

### 2. Изменение `value` внутри middleware

Внутри middleware есть доступ к исходному `path` и `value`. Можно изменить `value` перед тем, как передать его дальше по цепочке, вызвав `next(path, newValue)`.

```ts
const clampAgeMiddleware: Middleware<typeof initialState> = (store, next) => {
  return (path, value) => {
    const resVal = store.resolveValue(path, value);
    if (path === 'user.age') {
      // Ограничиваем возраст от 0 до 99:
      const clamped = Math.max(0, Math.min(99, resVal));
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
    if (path === 'user.age') {
      console.warn('[Middleware] Изменение user.age заблокировано');
      // Не вызываем next → изменение не произойдёт
      return;
    }
    next(path, value);
  };
};

// Пробуем:
store.update('user.age', 40);
// Лог: [Middleware] Изменение user.age заблокировано
// Возраст остаётся прежним

store.update('user.name', 'Bob');
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
    const resVal = store.resolveValue(path, value);
    const resPath = store.resolvePath(path);

    console.log('[MW1] До', path, resPath, resVal);
    next(path, value);
    console.log('[MW1] После', path, store.get(path), resPath);
  };
};

const mw2: Middleware<typeof initialState> = (store, next) => {
  return (path, value) => {
    const resPath = store.resolvePath(path);

    console.log('[MW2] Проверяем', path);
    if (resPath === 'items.0') {
      console.log('[MW2] Блокируем изменение items.0');
      return; // mw3 и ядро не выполнятся
    }
    next(path, value);
  };
};

const mw3: Middleware<typeof initialState> = (store, next) => {
  return (path, value) => {
    console.log('[MW3] Логика MW3');
    next(path, value);
  };
};

const store = createObservableStore(initialState, [mw1, mw2, mw3]);

// Пример:
store.update('items.0', 999);
// Лог:
// [MW1] До items.0 999
// [MW2] Проверяем items.0
// [MW2] Блокируем изменение items.0
// → mw1 не продолжит после next, mw3 не вызовется, update не применится.

store.update('user.name', 'Dmitry');
// Лог:
// [MW1] До user.name Dmitry
// [MW2] Проверяем user.name
// [MW3] Логика MW3
// [MW1] После user.name Dmitry
// → Значение применено.
```

---

## Что делает `DepthPath` и зачем он нужен

`DepthPath` управляет тем, насколько глубоко TypeScript будет "раскрывать" вложенные свойства объекта, чтобы сгенерировать возможные строковые пути вида `"user.settings.locale"`, `"items.0"` и т. д.

```
По умолчанию стоит `DepthPath=0`.
```

---

#### ✅ `DepthPath = 0`

- **Типы путей не вычисляются вообще.**
- Все проверки типов путей (`SafePaths`, `PathExtract`, `PathOrAccessor`) становятся заглушками.
- Значения принимаются по произвольным строкам, но:

  - ❌ **автокомплита нет**,
  - ❌ **типовая проверка путей и значений отключена**,
  - ✅ Это может быть удобно для моков, тестов, или свободной работы без ограничений.

#### ⚠️ `DepthPath = 14` и выше

- ⚠️ **Потенциально медленно**: генерация union-типов путей становится экспоненциальной.
- ✅ Позволяет обращаться к глубоко вложенным путям, если они есть.
- ❌ Но может:

  - привести к **замедлению или зависанию TypeScript/IDE (VSCode)**,
  - вызвать **ошибки "Type instantiation is excessively deep..."** при сложных типах.

**Рекомендуется:**

> Не использовать `DepthPath > 10`, **если только это не оправдано реально вложенными структурами.**

### Итог

| `DepthPath` | Поведение                                                               |
| ----------- | ----------------------------------------------------------------------- |
| `0`         | Заглушка: любые строки, нет проверки и автокомплита                     |
| `1–7`       | Оптимально: безопасные пути, разумная глубина                           |
| `8–13`      | Допустимо, но уже может тормозить IDE                                   |
| `14+`       | Риск перегрузки компилятора, не рекомендуется без крайней необходимости |

---

## Что такое `Accessor` и зачем он нужен

`Accessor<T, R>` — это **магическая вспомогательная функция**, которая позволяет безопасно обращаться к значениям в состоянии `store`, особенно когда путь к данным содержит **динамическую часть** (например, индекс массива или ID).

---

### Сигнатура

```ts
export type Accessor<T, R = any> = ($: T, t: <K>(arg: K) => K) => R;
```

- `$` — сам `store` (его `proxy`-версия, например `store.$`)
- `t(...)` — специальная обертка для **динамических значений** в пути

На первый взгляд выглядит странно, но суть очень простая:

- Ты пишешь обычный доступ к данным, используя `store.$`, например:

  ```ts
  store.$.items[2];
  ```

- А теперь представь, что `2` — это переменная `index`, которая может меняться:

  ```ts
  const accessor = ($, t) => $.items[t(index)];
  ```

🔮 t(...) — просто обёртка, которая говорит системе:

> «Эта часть пути — динамическая, её нужно сохранить как выражение, а потом превратить в строку.»

---

### Что происходит под капотом

- `Accessor` никак не исполняется напрямую.
- Вместо этого `store` вызывает `toString()` на `Accessor`, и получает строку вроде:

  ```ts
  'items.5';
  ```

- Это делается через **анализ тела функции и регулярки**:

  - Внутри `t(index)` → `5`
  - `$.items[t(index)]` превращается в `"items.5"`

> 💡 Это очень лёгкий способ выразить динамические пути **без генерации миллионов типов и union'ов**, что делает работу в VSCode быстрой и безопасной.

---

### Примеры

```ts
const index = 1;

store.update(($, t) => $.items[t(index)], 999);
// Аналогично: store.update("items.1", 999)
```

```ts
store.get(($, t) => $.user.settings[t('locale')]);
// Аналогично: store.get("user.settings.locale")
```

```ts
store.subscribeToPath(
  ($, t) => $.items[t(dynamicIndex)],
  (val) => {
    console.log('Изменился элемент массива:', val);
  }
);
```

---

### Почему это лучше, чем `store.update("items." + index, ...)`

- ✅ Работает с автодополнением
- ✅ Проверяется типами (`PathExtract`, `AssertValidPath`)
- ✅ Не требует ручной склейки строк
- ✅ Не нагружает IDE (в отличие от большого количества вложенных `union`-типов)

---

## ⚠️ На заметку

- Функция `Accessor` используется **только как сигнатура и для парсинга**, она не вызывает `store.$` реально.
- Не стоит использовать сложные условия внутри неё — только прямой доступ через `t(...)`.

---

## Что такое `CacheKeys` и зачем они нужен

`cacheKeys` — это **специальное поле в состоянии `store`**, которое позволяет задавать **кастомные пути для кеширования или подписки**, в том числе с **автодополнением и типовой безопасностью**.

---

### Для чего это нужно

Иногда нам нужно явно указать, **какие части состояния можно инвалидировать, подписывать или использовать в автодополнении**, особенно если они **формируются динамически** или зависят от логики.

В таких случаях на помощь приходит `cacheKeys` — объект, в котором мы описываем возможные "виртуальные" пути, которые будут:

- ✅ поддерживать **автодополнение**
- ✅ работать с методами `store.invalidate(...)`, `store.subscribeToPath(...)` и др.
- ✅ проверяться **типами** при использовании

---

### Пример

```ts
interface StoreState {
  items: number[];
  counter: number;
  cacheKeys?: {
    'lol.items': number[]; // <- виртуальный путь
  };
}

const initialState = {
  items: [1, 2, 3],
  counter: 0,
};

export const store = createObservableStore<StoreState>(initialState, []);
```

Теперь можно использовать путь `"cacheKeys.lol.items.0"` в методах:

```ts
store.invalidate('cacheKeys.lol.items.0');
```

> ☝️ Это путь не к реальным данным, а к **виртуальному представлению**, которое вы определили в `cacheKeys`.

---

### Автодополнение

Добавив ключ в `cacheKeys`, вы получаете:

- ✅ Поддержку автодополнения в строках путей
- ✅ Подсказки по индексам (если это массив)
- ✅ Безопасность при работе с методами `invalidate`, `subscribeToPath`, `get` и др.

---

### Как это работает под капотом

- `cacheKeys` — это просто поле в типе состояния, которое **не обязательно должно существовать в `initialState`**.
- Оно используется **только для построения типа возможных путей**.
- Вы можете задавать вложенные объекты и массивы, чтобы IDE и типы могли "понять", что доступно по строковому пути.

---

### Пример с подпиской

```ts
store.subscribeToPath('cacheKeys.lol.items.2', (val) => {
  console.log('Элемент lol.items[2] изменился:', val);
});
```

---

### Зачем использовать `cacheKeys`, если можно напрямую

```ts
store.invalidate('lol.items.0'); // ❌ Может не существовать или не иметь автодополнения
```

**Вместо:**

```ts
store.invalidate('cacheKeys.lol.items.0');
```

`cacheKeys` позволяет:

- ✅ Явно указать, какие ключи **имеют смысл**
- ✅ Сделать систему **расширяемой и предсказуемой**
- ✅ Избежать магии и багов, связанных с "плавающими" строками

---

## ⚠️ На заметку

- `cacheKeys` — **исключительно типовая конструкция**, не обязательная в `initialState`
- Работает даже если `cacheKeys` нет в runtime, **главное — чтобы она была в интерфейсе `StoreState`**
- Можно использовать вместе с `Accessor`, если путь динамический:

```ts
const idx = 1;
store.invalidate((t) => store.$['cacheKeys'].lol.items[t(idx)]);
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
