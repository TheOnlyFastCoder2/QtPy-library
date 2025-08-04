## Содержание
- [Возвращаемые значения](#возвращаемые-значения)
- [Использование](#использование)
  - [Базовое использование](#базовое-использование)
  - [Императивное управление (вызов метода компонента)](#императивное-управление-вызов-метода-компонента)
  - [Удаление ссылки](#удаление-ссылки)
  - [Очистка всех ссылок](#очистка-всех-ссылок)
  - [Получение всех ключей](#получение-всех-ключей)
- [Типы](#типы)
- [Примечания](#примечания)

## Возвращаемые значения

Хук `useRefMap` возвращает объект со следующими методами и свойствами:

| Метод/Свойство | Тип                                      | Описание                                                                 |
|----------------|------------------------------------------|--------------------------------------------------------------------------|
| `getRef`       | `(key: string) => RefObject<T>`         | Возвращает ссылку (`RefObject`) для указанного ключа. Если ссылка не существует, создаётся новая с `current: null`. |
| `deleteRef`    | `(key: string) => void`                 | Удаляет ссылку и соответствующий ключ из внутреннего хранилища.          |
| `clearAllRefs` | `() => void`                            | Очищает все ссылки и ключи из внутреннего хранилища.                     |
| `getAllKeys`   | `() => string[]`                              | Возвращает массив всех ключей, связанных с существующими ссылками.       |

## Использование

### Базовое использование

Пример использования `useRefMap` с `map` для создания ссылок на элементы и обработки события прокрутки:

```jsx
import useRefMap from '@qtpy/use-ref-map';
import useEvent from '@qtpy/use-event'; // хук для обработки событий
import { useState } from 'react';

function ProjectsPage() {
  const { getRef, getAllKeys } = useRefMap<HTMLDivElement>();
  const [activeIndex, setActiveIndex] = useState(0);
  const projects = ['Проект 1', 'Проект 2', 'Проект 3'];

  useEvent('scroll', () => {
    for (let i = 0; i < projects.length; i++) {
      const key = `project_${i}`;
      const el = getRef(key).current;
      if (el) {
        const { top, height } = el.getBoundingClientRect();
        if (top + height < window.scrollY) {
          setActiveIndex(i); // Обновляем активный индекс при прокрутке
        }
      }
    }
  }, {});

  return (
    <div className="ProjectsPage">
      <h1>Проекты</h1>
      <div className="ProjectsPage_container">
        {projects.map((title, index) => (
          <div
            key={index}
            ref={getRef(`project_${index}`)}
            style={{ background: index === activeIndex ? '#e0e0e0' : 'white' }}
          >
            <h2>{title}</h2>
          </div>
        ))}
      </div>
      <p>Активный проект: {projects[activeIndex]}</p>
      <p>Ключи ссылок: {getAllKeys.join(', ')}</p>
    </div>
  );
}
```

Ссылка на хук [**useEvent**](https://www.npmjs.com/package/@qtpy/use-event)

В этом примере хук `useRefMap` используется для создания ссылок на элементы `<div>` с помощью метода `map` и ключей вида `project_${index}`. При прокрутке страницы хук `useEvent` проверяет положение каждого элемента через `getBoundingClientRect` и обновляет `activeIndex`, если элемент выходит за верхнюю границу окна, подсвечивая активный проект. Список ключей выводится через `getAllKeys`.

### Императивное управление (вызов метода компонента)

Пример императивного вызова метода компонента через `useRefMap`:

```jsx
import useRefMap from '@qtpy/use-ref-map';

interface AnimatedLabelComponent {
  setIsActive: (value: boolean) => void;
}

function AccordionCard({ keyName, title }: { keyName: string; title: string }) {
  const { getRef } = useRefMap<AnimatedLabelComponent>();

  return (
    <Accordion onClick={(value) => getRef(keyName).current?.setIsActive?.(value)}>
      <Accordion.Header>
        <AnimatedLabel ref={getRef(keyName)} title={title} />
      </Accordion.Header>
      <Accordion.Content>
        <div>Контент аккордеона</div>
      </Accordion.Content>
    </Accordion>
  );
}
```

В этом примере хук `useRefMap` используется для хранения ссылки на компонент `AnimatedLabel` по ключу `keyName`. При клике на аккордеон вызывается метод `setIsActive` компонента `AnimatedLabel` для управления его состоянием.

### Удаление ссылки

Удаление ненужной ссылки из хранилища:

```jsx
import useRefMap from '@qtpy/use-ref-map';

function Component() {
  const { getRef, deleteRef } = useRefMap<HTMLElement>();

  const removeRef = () => {
    deleteRef('section1');
    console.log('Ссылка на section1 удалена');
  };

  return (
    <div>
      <section ref={getRef('section1')}>Секция 1</section>
      <button onClick={removeRef}>Удалить ссылку</button>
    </div>
  );
}
```

### Очистка всех ссылок

Пример использования метода `clearAllRefs` для удаления всех ссылок:

```jsx
import useRefMap from '@qtpy/use-ref-map';

function Component() {
  const { getRef, clearAllRefs, getAllKeys } = useRefMap<HTMLElement>();

  const clearRefs = () => {
    clearAllRefs();
    console.log('Все ссылки очищены. Текущие ключи:', getAllKeys());
  };

  return (
    <div>
      <section ref={getRef('section1')}>Секция 1</section>
      <section ref={getRef('section2')}>Секция 2</section>
      <button onClick={clearRefs}>Очистить все ссылки</button>
      <p>Ключи: {getAllKeys().join(', ')}</p>
    </div>
  );
}
```

### Получение всех ключей

Получение списка всех ключей для проверки существующих ссылок:

```jsx
import useRefMap from '@qtpy/use-ref-map';

function Component() {
  const { getRef, getAllKeys } = useRefMap<HTMLElement>();

  const logKeys = () => {
    console.log('Текущие ключи:', getAllKeys());
  };

  return (
    <div>
      <section ref={getRef('section1')}>Секция 1</section>
      <section ref={getRef('section2')}>Секция 2</section>
      <button onClick={logKeys}>Вывести ключи</button>
      <p>Ключи: {getAllKeys().join(', ')}</p>
    </div>
  );
}
```

## Типы

Хук `useRefMap` использует следующие TypeScript-типы:

```typescript
export type RefMap<T> = Record<string, RefObject<T>>;

export type RefMapMethods<T> = {
  getRef: (key: string) => RefObject<T>;
  deleteRef: (key: string) => void;
  clearAllRefs: () => void;
  getAllKeys: () => string[];
};

export type UseRefMapReturn<T, E extends keyof RefMapMethods<T>> = Pick<RefMapMethods<T>, E>;
```

- `RefMap<T>`: Объект, где ключи — это строки, а значения — `RefObject<T>`.
- `RefMapMethods<T>`: Интерфейс, описывающий методы и свойства, возвращаемые хуком.
- `UseRefMapReturn<T, E>`: Тип возвращаемого значения хука, который позволяет указать подмножество методов/свойств через `E`.

## Примечания

- **Императивное управление**: Хук удобен для вызова методов компонентов (например, `setIsActive`) или DOM-операций, таких как `scrollIntoView`, `focus` или `getBoundingClientRect`, через свойство `current`.
- **Инициализация ссылок**: Метод `getRef` создаёт новую ссылку с `current: null`, если ссылка для указанного ключа ещё не существует.
- **Типизация**: Хук поддерживает обобщённый тип `T` для работы с любыми типами данных (например, пользовательскими интерфейсами компонентов или `HTMLElement`). В отличие от предыдущей версии, `getRef` возвращает `RefObject<T>` вместо `RefObject<Partial<T>>`, предполагая, что `current` может быть `null`, но типизация остаётся строгой.
- **Управление памятью**: Метод `deleteRef` удаляет отдельные ссылки, а `clearAllRefs` очищает все ссылки, предотвращая утечки памяти. Хук автоматически очищает все ссылки при размонтировании компонента через `useEffect`.
- **Сохранение состояния**: Хук использует `useRef` для хранения ссылок и ключей.
- **Ограничение типизации**: Свойство `getAllKeys` возвращает `string[]`.