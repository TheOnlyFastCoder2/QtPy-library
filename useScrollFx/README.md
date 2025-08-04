## Содержание
- [Возвращаемые значения](#возвращаемые-значения)  
- [Использование](#использование)  
  - [Базовое использование](#базовое-использование)  
  - [Императивное управление скроллом](#императивное-управление-скроллом)  
  - [Управление задержкой анимации](#управление-задержкой-анимации)  
  - [Получение позиции элемента](#получение-позиции-элемента)  
- [Типы](#типы)  
- [Примечания](#примечания)  

## Возвращаемые значения

Хук `useScrollFx` возвращает объект со следующими методами и компонентами:

| Метод/Свойство | Тип | Описание |
|----------------|-----|----------|
| `setConfig` | `(config: ScrollConfig, el?: HTMLElement \| Window) => void` | Устанавливает конфигурацию скролла и целевой элемент (`window` по умолчанию). |
| `Scroll` | `() => JSX.Element` | Компонент React, отображающий контейнер скроллбара и ползунок. |
| `scrollTo` | `(value: number) => void` | Прокручивает элемент до указанной позиции с анимацией (или без, если `ignoreEffect` включён). |
| `getRefTop` | `(refObject: HTMLElement \| Element) => number \| void` | Возвращает позицию верхней границы элемента относительно области скролла. |
| `setDelayScroll` | `(delay: DelayScroll) => void` | Устанавливает задержку для анимации скролла (`scrollBase` и `scrollByTo`). |

## Использование

### Базовое использование

Пример базового использования хука `useScrollFx` для создания кастомного скроллбара:

```jsx
import useScrollFx from '@qtpy/use-scroll-fx';
import './scroll.css'; // Стили для скроллбара

function App() {
  const { Scroll, setConfig } = useScrollFx();

  // Конфигурация скроллбара
  const scrollConfig = {
    timeoutVisible: 2000, // Скрывать скроллбар через 2 секунды
    callback: ({ thumbPosition, maxScroll, direction, scrollProgress }) => {
      console.log({ thumbPosition, maxScroll, direction, scrollProgress });
    },
    browserConfigs: {
      default: { dumping: 0.91, velocity: 1, threshold: 0.25, maxVelocity: 2 },
      safari: { dumping: 0.87, velocity: 1.2, threshold: 0.3, maxVelocity: 3 },
    },
  };

  // Установка конфигурации при монтировании
  useEffect(() => {
    setConfig(scrollConfig);
  }, []);

  return (
    <div style={{ height: '2000px' }}>
      <h1>Тест скроллбара</h1>
      <Scroll />
    </div>
  );
}
```

**Стили (scroll.css)**:
```css
html {
  &.isFocusScroll {
    cursor: grabbing;

    .ScrollFx_thumb {
      transform: translate(-8px, -2px);
      opacity: 1 !important;
    }
  }
}
.ScrollFx {
  display: flex;
  justify-content: center;
  width: 10px;
  right:0;
  background: rgba(0, 0, 0, 0.02);

  &.isMobile {
    width: 8px;
  }
  &.isScrollHidden {
    .ScrollFx_thumb {
      opacity: 0.2;
    }
  }
  z-index: 100;
  .ScrollFx_thumb {
    position: relative;
    height: 100px;
    width: 80%;
    top: 20%;

    background: linear-gradient(145deg, rgb(50, 50, 50), rgb(100, 100, 100));
    border-radius: 30px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 8px 20px rgba(0, 0, 0, 0.2),
      0 12px 30px rgba(0, 0, 0, 0.1), inset 0 -4px 8px rgba(0, 0, 0, 0.4),
      inset 0 2px 4px rgba(255, 255, 255, 0.1);

    transition: opacity 2s ease-out;
  }
}

* {
  /* скрываем скрол */
  -webkit-tap-highlight-color: transparent;
  &::-webkit-scrollbar {
    display: none;
  }
  scrollbar-width: none;
  -ms-overflow-style: none;
}
```

В этом примере хук `useScrollFx` используется для создания кастомного скроллбара с плавной анимацией и возможностью перетаскивания ползунка. Конфигурация задаётся через `setConfig`, а компонент `<Scroll />` отображает скроллбар.

### Императивное управление скроллом

Пример прокрутки к определённой позиции с использованием метода `scrollTo`:

```jsx
import useScrollFx from '@qtpy/use-scroll-fx';

function App() {
  const { Scroll, setConfig, scrollTo } = useScrollFx();

  useEffect(() => {
    setConfig({
      timeoutVisible: 2000,
      browserConfigs: { default: { dumping: 0.91, velocity: 1, threshold: 0.25, maxVelocity: 2 } },
    });
  }, []);

  const handleScrollTo = () => {
    scrollTo(500); // Прокрутка к позиции 500px
  };

  return (
    <div style={{ height: '2000px' }}>
      <button onClick={handleScrollTo}>Прокрутить к 500px</button>
      <Scroll />
    </div>
  );
}
```

Здесь метод `scrollTo` используется для плавной прокрутки к позиции 500px. Анимация учитывает конфигурацию браузера, включая параметры затухания и скорости.

### Управление задержкой анимации

Пример установки задержек для анимации скролла:

```jsx
import useScrollFx from '@qtpy/use-scroll-fx';

function App() {
  const { Scroll, setConfig, setDelayScroll } = useScrollFx();

  useEffect(() => {
    setConfig({
      timeoutVisible: 2000,
      browserConfigs: { default: { dumping: 0.91, velocity: 1, threshold: 0.25, maxVelocity: 2 } },
    });
    setDelayScroll({ scrollBase: 4, scrollByTo: 4 }); // Установка задержек
  }, []);

  return (
    <div style={{ height: '2000px' }}>
      <Scroll />
    </div>
  );
}
```

Метод `setDelayScroll` позволяет настроить задержку для базовой анимации (`scrollBase`) и анимации `scrollTo` (`scrollByTo`), что влияет на плавность и отзывчивость скролла.

### Получение позиции элемента

Пример использования `getRefTop` для получения позиции элемента:

```jsx
import useScrollFx from '@qtpy/use-scroll-fx';
import { useRef } from 'react';

function App() {
  const { Scroll, setConfig, getRefTop } = useScrollFx();
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConfig({
      timeoutVisible: 2000,
      browserConfigs: { default: { dumping: 0.91, velocity: 1, threshold: 0.25, maxVelocity: 2 } },
    });
  }, []);

  const logPosition = () => {
    if (sectionRef.current) {
      const top = getRefTop(sectionRef.current);
      console.log(`Позиция верхней границы секции: ${top}px`);
    }
  };

  return (
    <div style={{ height: '2000px' }}>
      <button onClick={logPosition}>Получить позицию секции</button>
      <div ref={sectionRef} style={{ marginTop: '500px' }}>Секция</div>
      <Scroll />
    </div>
  );
}
```

Метод `getRefTop` возвращает позицию верхней границы элемента относительно области скролла, что полезно для вычислений, связанных с видимостью или позиционированием.

## Типы

Хук `useScrollFx` использует следующие TypeScript-типы:

```typescript
type BrowserConfig = {
  dumping: number;
  velocity: number;
  threshold: number;
  maxVelocity: number;
  ignoreEffect?: boolean;
};

type DelayScroll = {
  scrollBase: number;
  scrollByTo: number;
};

type ScrollConfig = {
  timeoutVisible?: number;
  callback?: ({
    thumbPosition,
    maxScroll,
    direction,
    scrollProgress,
  }: {
    thumbPosition: number;
    maxScroll: number;
    direction: -1 | 1 | 0;
    scrollProgress: number;
  }) => void;
  browserConfigs: {
    default: BrowserConfig;
    safari?: BrowserConfig;
    chrome?: BrowserConfig;
    firefox?: BrowserConfig;
  };
};

```

- `BrowserConfig`: Конфигурация для конкретного браузера, определяющая параметры анимации.
- `DelayScroll`: Параметры задержки для анимаций скролла.
- `ScrollConfig`: Основная конфигурация хука, включая таймаут видимости, колбэк и настройки браузеров.
- `ScrollRefs`: Интерфейс для внутренних рефов хука.

## Примечания

- **Кроссбраузерность**: Хук поддерживает различные браузеры (`safari`, `chrome`, `firefox`, `other`) с индивидуальными настройками анимации через `browserConfigs`.
- **Мобильные устройства**: На мобильных устройствах скроллбар отключается (`pointerEvents: none`), и используется нативный скролл, если не указан `ignoreEffect`.
- **Анимация**: Используется `requestAnimationFrame` через хук `useAnimationFrame` для плавной анимации скролла и перетаскивания.
- **Скрытие скроллбара**: Параметр `timeoutVisible` в `ScrollConfig` позволяет скрывать скроллбар через заданное время бездействия.
- **Императивное управление**: Метод `scrollTo` позволяет программно управлять прокруткой, а `getRefTop` — получать позиции элементов для дополнительных вычислений.
- **Зависимости**: Хук использует `@qtpy/use-animation-frame` и `@qtpy/use-event` для анимации и обработки событий.
- **Ограничения**: На мобильных устройствах перетаскивание ползунка не поддерживается. Для отключения эффектов анимации используйте `ignoreEffect: true` в `browserConfigs`.