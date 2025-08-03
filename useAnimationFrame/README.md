# `useAnimationFrame` — хук для управления анимацией через `requestAnimationFrame`

## Содержание

1. [Описание](#описание)
2. [Параметры](#параметры)
3. [Возвращаемое значение](#возвращаемое-значение)
4. [Пример использования: Плавная прокрутка](#пример-использования-плавная-прокрутка)
5. [Особенности](#особенности)
6. [Безопасность и производительность](#безопасность-и-производительность)

---

## Описание

Хук `useAnimationFrame` предназначен для запуска анимации или повторяющихся действий с использованием `requestAnimationFrame`, ограничивая частоту вызовов и учитывая состояние вкладки (видимость).

Он предоставляет:

* управление запуском/остановкой;
* передачу данных в анимационный цикл (`setData`);
* защиту от лишнего использования ресурсов при `document.hidden`.

---

## Параметры

| Параметр   | Тип                                        | По умолчанию | Описание                                                                   |
| ---------- | ------------------------------------------ | ------------ | -------------------------------------------------------------------------- |
| `callback` | `(someData: T, deltaTime: number) => void` | —            | Функция, вызываемая при каждом кадре. Получает данные и `deltaTime`.       |
| `delay`    | `number`                                   | `16.67`      | Минимальное время между кадрами в миллисекундах (по умолчанию — \~60 FPS). |

---

## Возвращаемое значение

| Имя            | Тип                               | Описание                                              |
| -------------- | --------------------------------- | ----------------------------------------------------- |
| `start()`      | `() => void`                      | Запускает цикл.                                       |
| `stop()`       | `() => void`                      | Останавливает цикл и очищает `requestAnimationFrame`. |
| `setData()`    | `(data: T) => T`                  | Устанавливает данные, передающиеся в `callback`.      |
| `refIsRunning` | `React.MutableRefObject<boolean>` | Показывает, активен ли цикл в данный момент.          |

---

## Пример использования: **Плавная прокрутка с затуханием**

ссылка на hook [useEvent](https://www.npmjs.com/package/@qtpy/use-event)

```tsx
import { useEffect } from 'react';
import useAnimationFrame from '@qtpy/use-animation-frame';
import useEvent from '@qtpy/use-event';

function SmoothScroll() {
  const animFrameScroll = useAnimationFrame<{ velocity: number }>(
    ({ velocity }) => {
      window.scrollBy(0, velocity);

      const damping = 0.91; // коэффициент затухания
      const newVelocity = velocity * damping;
      const VELOCITY_THRESHOLD = 0.25;

      Math.abs(newVelocity) > VELOCITY_THRESHOLD
        ? animFrameScroll.setData({ velocity: newVelocity })
        : animFrameScroll.stop();
    },
    2 // высокая частота обновлений (меньше задержка)
  );

  useEvent('wheel', (e) => {
    const delta = e.deltaY;
    const initialVelocity = delta * 0.2;

    animFrameScroll.setData({ velocity: initialVelocity });

    if (!animFrameScroll.refIsRunning.current) {
      animFrameScroll.start();
    }
  });

  useEffect(() => {
    document.documentElement.style.overflow = 'hidden'; // отключаем стандартный скролл
  }, []);

  return <div style={{ height: '5000px' }}>Скроль меня колесиком</div>;
}
```

---

## Особенности

* Поддерживает передачу и обновление пользовательских данных между кадрами (`setData`).
* Учитывает `visibilitychange`: при возврате к активной вкладке анимация продолжается.
* Отменяет `requestAnimationFrame`, если вкладка не активна или цикл остановлен.
* Обновление `callback` происходит через `ref`, без лишних ререндеров.

---

## Безопасность и производительность

* **Безопасность:** Все внутренние `ref` проверяются на актуальность, `requestAnimationFrame` корректно отменяется.
* **Производительность:** Не вызывает `callback`, если `delay` не прошёл или документ скрыт.
* **Устойчивость:** Работает корректно даже при быстрой смене данных, благодаря `refCallback`.
