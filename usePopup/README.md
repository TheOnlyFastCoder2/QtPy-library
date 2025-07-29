# `usePopup` — хук для управления модальными окнами

Хук `usePopup` предназначен для управления отображением модального окна в React. Он предоставляет набор функций и компонент, позволяющий удобно открывать и закрывать модалки, а также настраивать поведение и внешний вид через свойства.

## Содержание

1. Общее описание  
   1.1. [Аргументы хука](#11-аргументы-хука)  
   1.2. [Возвращаемые значения](#12-возвращаемые-значения)  
   1.3. [Свойства компонента `<Popup />`](#13-свойства-компонента-popup-)

2. Примеры использования  
   2.1. [Базовый пример](#21-базовый-пример)  
   2.2. [Стилизация и анимация](#22-стилизация-и-анимация)

3. `useSimplePopup` — обёртка над `usePopup`  
   3.1. [Назначение](#31-назначение)  
   3.2. [Пример реализации](#32-пример-реализации)  
   3.3. [Пример использования](#33-пример-использования)

4. [Рекомендации](#4-рекомендации)

---

### 1.1. Аргументы хука

| Аргумент | Тип    | Описание                                                   |
| -------- | ------ | ---------------------------------------------------------- |
| `delay`  | number | Задержка перед закрытием (в секундах). По умолчанию — `0`. |

---

### 1.2. Возвращаемые значения

| Имя             | Тип               | Описание                                           |
| --------------- | ----------------- | -------------------------------------------------- |
| `isShowed`      | `boolean`         | Признак того, отображается ли модальное окно       |
| `toOpenPopup`   | `() => void`      | Функция для открытия модального окна               |
| `toTogglePopup` | `() => void`      | Функция для переключения состояния модального окна |
| `toClosePopup`  | `() => void`      | Функция для закрытия окна                          |
| `Popup`         | `React.Component` | Компонент модального окна, выводимый через портал  |

---

### 1.3. Свойства компонента `<Popup />`

| Свойство | Тип | Описание |
| --- | --- | --- |
| `children` | `ReactNode` | Контент, отображаемый внутри модального окна |
| `className` | `string` | Дополнительные CSS-классы (например, `"MWBottom"` для анимации снизу) |
| `isOnCloseBG` | `boolean` | Разрешить закрытие окна при клике на фон. По умолчанию — `true` |
| `domPortalById` | `string` | ID DOM-элемента, в который рендерится портал. По умолчанию `'root'` или `document.body` |

---

### 2.1. Базовый пример

```tsx
import usePopup from '@qtpy/use-popup';
import '@qtpy/use-popup/index.css';

function App() {
  const { isShowed, toOpenPopup, toClosePopup, Popup } = usePopup(0.3);

  return (
    <div>
      <button onClick={toOpenPopup}>Показать</button>
      <Popup className="MWBottom" isOnCloseBG domPortalById="root">
        <h2>Заголовок</h2>
        <p>Контент модалки</p>
        <button onClick={toClosePopup}>Закрыть</button>
      </Popup>
    </div>
  );
}

export default App;
```

---

### 2.2. Стилизация и анимация

Пример стилей для модального окна, появляющегося снизу (`MWBottom`):

```css
@starting-style {
  .Popup.MWBottom .Popup_container {
    transform: translateY(100%);
  }
}

.Popup.MWBottom {
  &::before {
    opacity: 0;
    transition: opacity 0.6s;
  }

  &.isVisible::before {
    opacity: 0.8;
  }

  .Popup_container {
    transition: transform 0.6s ease-out;
    justify-content: flex-end;
    align-items: center;
  }

  &.isRemove .Popup_container {
    transform: translateY(180%);
  }
}
```

---

## `useSimplePopup` — обёртка над `usePopup`

### 3.1. Назначение

`useSimplePopup` — это обёртка над `usePopup`, упрощающая повторное использование модалки с фиксированным шаблоном. Полезна для однотипных модальных окон.

---

### 3.2. Пример реализации

```tsx
// useSimplePopup.ts
import { useMemo } from 'react';
import usePopup from '@qtpy/use-popup';
import '@qtpy/use-popup/index.css';

export default function useSimplePopup() {
  const { Popup, toOpenPopup, toClosePopup, isShowed } = usePopup(0.5);

  return {
    toOpenPopup,
    toClosePopup,
    isShowed,

    // Обёртка Popup с предустановленным контентом
    Popup: () =>
      useMemo(
        () => (
          <Popup className="MWBottom">
            <div style={{ padding: 20, background: '#fff', borderRadius: 8 }}>
              <h2>Простое модальное окно</h2>
              <p>Это контент по умолчанию.</p>
              <button onClick={toClosePopup}>Закрыть</button>
            </div>
          </Popup>
        ),
        [isShowed]
      ),
  };
}
```

---

### 3.3. Пример использования

```tsx
// App.tsx
import useSimplePopup from './useSimplePopup';

export default function App() {
  const { toOpenPopup, Popup } = useSimplePopup();

  return (
    <div>
      <button onClick={toOpenPopup}>Открыть модалку</button>
      <Popup />
    </div>
  );
}
```

---

## 4. Рекомендации

- Используйте `useSimplePopup`, когда требуется быстрое внедрение модального окна без кастомизации.
- Для более гибкого управления стилями и поведением — применяйте `usePopup` напрямую.
- Обязательно стилизуйте классы `.Popup`, `.Popup_container` и анимационные состояния (`.isVisible`, `.isRemove`) в соответствии с UX/UI вашего приложения.
- Не забудьте добавить корневой элемент с соответствующим ID (`root`), если он не определён по умолчанию в вашем DOM.
