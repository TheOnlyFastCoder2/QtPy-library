# `useBreakpoints` – React-хук для адаптивной работы с брейкпоинтами

`useBreakpoints` — кастомный React-хук для адаптивного управления значениями в зависимости от размеров окна браузера. Поддерживает числовые, текстовые значения, JSX и динамические правила (`DynamicRule`) для гибкой настройки.

Конечно! Вот содержание, адаптированное под твою документацию `useBreakpoints` с разметкой для якорей:

---

## 🚀 Быстрый старт

Простой пример использования для адаптивного размера шрифта:

```tsx
const fontSize = useBreakpoints({
  1200: 18, // На ширине ≥1200px
  768: 16,  // На ширине ≥768px
  0: 14     // На ширине <768px
});
```

---

## 📏 Поддержка брейкпоинтов

Ключи конфигурации могут быть:

- **Число**: Ширина окна (например, `1200` для ≥1200px).
- **Строка**: Ширина и высота в формате `"ширина,высота"` (например, `"1024,768"`).

Пример с шириной и высотой:

```tsx
const config = useBreakpoints({
  "1440,900": { fontSize: 20 },
  "768,600": { fontSize: 16 },
  0: { fontSize: 14 }
});
```

---

## 🔄 Динамические правила (`DynamicRule`)

Для сложных адаптивных сценариев используйте `useBreakpoints.rule`, передавая функцию, которая вычисляет значение на основе текущих размеров окна.

Пример:

```tsx
const fontSize = useBreakpoints({
  1440: useBreakpoints.rule((width) => width / 80),
  768: 16,
  0: 14
});
```

---

## 🧠 Мемоизация с `memoConfig`

Функция `useBreakpoints.memoConfig(config, deps)` предотвращает пересоздание объекта конфигурации при каждом рендере, что особенно важно для динамических правил и оптимизации производительности.

### Пример использования:

```tsx
const swiperDimensions = useBreakpoints(
  useBreakpoints.memoConfig(
    {
      1440: { width: 494 },
      700: { width: useBreakpoints.getDeltaSize(700, 1440, 294, 374, 1.2) },
      500: { width: useBreakpoints.getDeltaSize(500, 1024, 374, 283, 1.2) },
    },
    [] // Зависимости для мемоизации
  )()
);
```

> ⚠️ Без `memoConfig` каждый рендер создаёт новый объект конфигурации, что может привести к лишним слушателям событий и утечкам памяти.

---

## 🎨 Примеры использования

### 1. Адаптивный эффект Coverflow

```tsx
const coverflowEffectConfig = useBreakpoints({
  1440: { stretch: -50, depth: 1200, modifier: 0.3 },
  700: { stretch: -100, depth: 1200, modifier: 0.6 },
  270: { stretch: -100, depth: 1200, modifier: 0.8 },
});
```

### 2. Адаптивный текст или JSX

```tsx
const title = useBreakpoints({
  540: 'Открытая любовь',
  375: <span>Откр-ытая любовь</span>,
});
```

---

## 📉 `getDeltaSize`

Метод `getDeltaSize(minViewport, maxViewport, fromSize, toSize, step?)` создаёт плавное изменение значения в зависимости от ширины окна. Используется для линейной интерполяции между `fromSize` и `toSize`.

- **minViewport**: Минимальная ширина окна.
- **maxViewport**: Максимальная ширина окна.
- **fromSize**: Значение при ширине ≥ maxViewport.
- **toSize**: Значение при ширине ≤ minViewport.
- **step** (опционально): Шаг интерполяции (по умолчанию 1.18).

Пример:

```tsx
const width = useBreakpoints({
  1440: useBreakpoints.getDeltaSize(500, 1440, 374, 283, 1.2),
  0: 283
});
```

---

## 🛠 Расширение функциональности

Вы можете создавать кастомные методы для вычислений, используя `useBreakpoints.rule`. Функция принимает аргументы:

- `currentWidth`: Текущая ширина окна.
- `currentHeight`: Текущая высота окна.
- `breakpointWidth`: Ширина брейкпоинта.
- `breakpointHeight`: Высота брейкпоинта (если указана).

### Пример кастомного метода:

```ts
import { useRef } from 'react';
import useBreakpoints, { DynamicRule, UseResponsiveValueBase } from './useBreakpoints';

interface ExtendedMethods extends UseResponsiveValueBase {
  decrement: (base: number, step: number) => DynamicRule;
}

useBreakpoints.decrement = (base, step) => {
  const refValue = useRef(base);
  const refViewport = useRef(0);
  return useBreakpoints.rule((currViewport) => {
    refValue.current += currViewport > refViewport.current ? step : -step;
    refViewport.current = currViewport;
    return refValue.current;
  });
};

export default useBreakpoints as ExtendedMethods;
```

Использование:

```tsx
const value = useBreakpoints({
  1440: useBreakpoints.decrement(100, 5),
  0: 50
});
```

---

## 💡 Полезные советы

- Используйте `memoConfig` для всех динамических конфигураций, чтобы избежать лишних рендеров.
- Для сложных адаптивных правил комбинируйте `getDeltaSize` и кастомные методы через `useBreakpoints.rule`.
- Проверяйте производительность при большом количестве брейкпоинтов, чтобы избежать перегрузки слушателей.

---