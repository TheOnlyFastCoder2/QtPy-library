import React, { useRef, useEffect, useCallback, useState } from 'react';
import useAnimationFrame from '@qtpy/use-animation-frame';
import useEvent from '@qtpy/use-event';

export type BrowserConfig = {
  dumping: number;
  velocity: number;
  threshold: number;
  maxVelocity: number;
  ignoreEffect?: boolean;
};

export type DelayScroll = {
  scrollBase: number;
  scrollByTo: number;
};

export type ScrollConfig = {
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

// Интерфейс для рефов хука
interface ScrollRefs {
  config: React.RefObject<ScrollConfig>;
  scrollElement: React.RefObject<HTMLElement | Window>;
  thumb: React.RefObject<HTMLDivElement | null>;
  scrollContainer: React.RefObject<HTMLDivElement | null>;
  isDragging: React.RefObject<boolean>;
  dragStartY: React.RefObject<number>;
  dragStartScrollTop: React.RefObject<number>;
  hideTimeout: React.RefObject<NodeJS.Timeout | null>;
  prevScrollTop: React.RefObject<number>;
  direction: React.RefObject<-1 | 1 | 0>;
}

// Константы для строковых значений
const CONSTANTS = {
  CLASS_MOBILE: 'isMobile',
  CLASS_DESKTOP: 'isDesktop',
  CLASS_SCROLL_HIDDEN: 'isScrollHidden',
  CLASS_FOCUS_SCROLL: 'isFocusScroll',
  STYLE_AUTO: 'auto',
  STYLE_HIDDEN: 'hidden',
  STYLE_NONE: 'none',
  STYLE_DEFAULT: 'default',
  STYLE_GRAB: 'grab',
  STYLE_ABSOLUTE: 'absolute',
  STYLE_FIXED: 'fixed',
  FULL_HEIGHT: '100%',
} as const;

// Утилита: Определение типа устройства
const getDeviceType = (): 'desktop' | 'mobile' => {
  const ua = navigator.userAgent;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(ua);
  const isTablet = /iPad|Tablet|Kindle|PlayBook|Silk/i.test(ua);
  const isMobileScreen = window.matchMedia('(max-width: 768px)').matches;
  return isMobile || isTablet || (hasTouch && isMobileScreen) ? 'mobile' : 'desktop';
};

// Утилита: Определение типа браузера
const getBrowserType = (): 'safari' | 'chrome' | 'firefox' | 'other' => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('safari') && !ua.includes('chrome')) return 'safari';
  if (ua.includes('chrome')) return 'chrome';
  if (ua.includes('firefox')) return 'firefox';
  return 'other';
};

// Утилита: Получение данных о скролле
const getScrollData = (el: HTMLElement | Window) => {
  const doc = document.documentElement;
  const isWindow = el === window;
  const target = el as HTMLElement;
  return {
    scrollTop: isWindow ? window.scrollY : target.scrollTop,
    scrollHeight: isWindow ? doc.scrollHeight : target.scrollHeight,
    clientHeight: isWindow ? window.innerHeight : target.clientHeight,
  };
};

// Утилита: Установка позиции ползунка
const setThumbTop = (thumb: HTMLDivElement, top: number) => {
  thumb.style.top = `${top}px`;
};

// Утилита: Математические вычисления для скролла
const scrollMath = {
  /**
   * Вычисляет позицию ползунка скроллбара.
   * @param scrollTop Текущая позиция скролла
   * @param scrollHeight Полная высота содержимого
   * @param clientHeight Высота видимой области
   * @param thumbHeight Высота ползунка
   * @returns Позиция ползунка (top) в пикселях
   */
  calculateThumbPosition: (
    scrollTop: number,
    scrollHeight: number,
    clientHeight: number,
    thumbHeight: number
  ) => {
    const maxScroll = scrollHeight - clientHeight;
    return (scrollTop / maxScroll) * (clientHeight - thumbHeight);
  },

  /**
   * Вычисляет прогресс скролла (0–1).
   * @param scrollTop Текущая позиция скролла
   * @param scrollHeight Полная высота содержимого
   * @param clientHeight Высота видимой области
   * @returns Прогресс скролла (0–1)
   */
  calculateScrollProgress: (scrollTop: number, scrollHeight: number, clientHeight: number) => {
    const maxScroll = scrollHeight - clientHeight;
    return scrollTop / maxScroll;
  },

  /**
   * Вычисляет новую позицию скролла и ползунка при перетаскивании.
   * @param deltaY Смещение мыши
   * @param startScrollTop Начальная позиция скролла
   * @param scrollHeight Полная высота содержимого
   * @param clientHeight Высота видимой области
   * @param thumbHeight Высота ползунка
   * @returns Новая позиция скролла и ползунка
   */
  calculateDragScrollTop: (
    deltaY: number,
    startScrollTop: number,
    scrollHeight: number,
    clientHeight: number,
    thumbHeight: number
  ) => {
    const maxScroll = scrollHeight - clientHeight;
    const maxThumbTop = clientHeight - thumbHeight;
    const startRatio = startScrollTop / maxScroll;
    const newThumbTop = Math.max(0, Math.min(startRatio * maxThumbTop + deltaY, maxThumbTop));
    return {
      newScrollTop: (newThumbTop / maxThumbTop) * maxScroll,
      newThumbTop,
    };
  },

  /**
   * Вычисляет скорость скролла для события колесика мыши.
   * @param deltaY Смещение колесика
   * @param velocityFactor Множитель скорости
   * @param maxVelocity Максимальная скорость
   * @returns Скорость скролла
   */
  calculateWheelVelocity: (deltaY: number, velocityFactor: number, maxVelocity: number) => {
    const rawVelocity = deltaY * velocityFactor;
    return Math.sign(rawVelocity) * Math.min(Math.abs(rawVelocity), maxVelocity);
  },

  /**
   * Вычисляет следующую скорость для анимации скролла.
   * @param currentVelocity Текущая скорость
   * @param dumping Фактор затухания
   * @returns Новая скорость
   */
  calculateNextVelocity: (currentVelocity: number, dumping: number) => {
    return currentVelocity * dumping;
  },
};

// Утилита: Проверка валидности рефов
const areRefsValid = (scrollElement: HTMLElement | Window | null, thumb: HTMLDivElement | null) => {
  return scrollElement && thumb;
};

// Утилита: Получение класса для устройства
const getDeviceClass = (isMobile: boolean) => {
  return isMobile ? CONSTANTS.CLASS_MOBILE : CONSTANTS.CLASS_DESKTOP;
};

// Утилита: Определение направления скролла
const getScrollDirection = (current: number, previous: number) => {
  return current > previous ? 1 : current < previous ? -1 : 0;
};

// Утилита: Выполнение скролла
const performScroll = (element: HTMLElement | Window, scrollTop: number) => {
  if (element === window) {
    window.scrollTo(0, scrollTop);
  } else {
    (element as HTMLElement).scrollTop = scrollTop;
  }
};

// Утилита: Получение высоты контейнера
const getContainerHeight = (element: HTMLElement | Window) => {
  return element === window ? CONSTANTS.FULL_HEIGHT : `${(element as HTMLElement)?.clientHeight || 0}px`;
};

export default function useScrollFx() {
  const browser = getBrowserType();
  const [isMobile, setIsMobile] = useState(false);
  const [delayScroll, setDelayScroll] = useState<DelayScroll>({
    scrollBase: 2,
    scrollByTo: 2
  });

  // Группировка всех рефов
  const refs: ScrollRefs = {
    config: useRef<ScrollConfig>({
      timeoutVisible: undefined,
      browserConfigs: {
        default: {ignoreEffect:false, dumping: 0.91, velocity: 1, threshold: 0.25, maxVelocity: 2 },
        safari: {ignoreEffect:false, dumping: 0.87, velocity: 1.2, threshold: 0.3, maxVelocity: 3 },
        chrome: {ignoreEffect:false, dumping: 0.91, velocity: 1, threshold: 0.25, maxVelocity: 2 },
        firefox: {ignoreEffect:false, dumping: 0.85, velocity: 1.1, threshold: 0.3, maxVelocity: 2.5 },
      },
    }),
    scrollElement: useRef<HTMLElement | Window>(window),
    thumb: useRef<HTMLDivElement>(null),
    scrollContainer: useRef<HTMLDivElement>(null),
    isDragging: useRef(false),
    dragStartY: useRef(0),
    dragStartScrollTop: useRef(0),
    hideTimeout: useRef<NodeJS.Timeout | null>(null),
    prevScrollTop: useRef(0),
    direction: useRef<-1 | 1 | 0>(0),
  };

  // Получение конфигурации браузера
  const getBrowserConfig = () => {
    const configs = refs.config.current.browserConfigs;
    return configs[browser as keyof typeof configs] || configs.default;
  };

  // Обновление направления скролла (для мобильных устройств)
  const updateScrollDirection = (scrollTop: number) => {
    if (!isMobile) return;
    refs.direction.current = getScrollDirection(scrollTop, refs.prevScrollTop.current);
    refs.prevScrollTop.current = scrollTop;
  };

  // Вызов пользовательского колбэка
  const triggerCallback = (thumbPosition: number, maxScroll: number, scrollProgress: number) => {
    if (refs.config.current.callback) {
      refs.config.current.callback({
        thumbPosition,
        maxScroll,
        direction: refs.direction.current,
        scrollProgress,
      });
    }
  };

  // Обновление позиции скролла при перетаскивании
  const updateDragScroll = (scrollData: ReturnType<typeof getScrollData>, thumbHeight: number, deltaY: number) => {
    const { scrollHeight, clientHeight } = scrollData;
    const { newScrollTop, newThumbTop } = scrollMath.calculateDragScrollTop(
      deltaY,
      refs.dragStartScrollTop.current,
      scrollHeight,
      clientHeight,
      thumbHeight
    );

    refs.direction.current = getScrollDirection(newScrollTop, refs.dragStartScrollTop.current);
    performScroll(refs.scrollElement.current, newScrollTop);
    setThumbTop(refs.thumb.current!, newThumbTop);
    triggerCallback(newThumbTop, scrollHeight - clientHeight, scrollMath.calculateScrollProgress(newScrollTop, scrollHeight, clientHeight));
  };

  // Обновление позиции ползунка и связанной логики
  const updateThumbPosition = () => {
    const { scrollElement, thumb } = refs;
    if (!areRefsValid(scrollElement.current, thumb.current)) return;

    const { scrollTop, scrollHeight, clientHeight } = getScrollData(scrollElement.current);
    const thumbHeight = thumb.current!.offsetHeight;
    const maxScroll = scrollHeight - clientHeight;

    const thumbTop = scrollMath.calculateThumbPosition(scrollTop, scrollHeight, clientHeight, thumbHeight);
    setThumbTop(thumb.current!, thumbTop);

    updateScrollDirection(scrollTop);
    triggerCallback(thumbTop, maxScroll, scrollMath.calculateScrollProgress(scrollTop, scrollHeight, clientHeight));

    hideScrollbarWithDelay();
  };

  // Скрытие скроллбара с задержкой
  const hideScrollbarWithDelay = () => {
    if (!refs.config.current.timeoutVisible) return;
    const domEl = refs.scrollContainer.current;
    domEl?.classList.remove(CONSTANTS.CLASS_SCROLL_HIDDEN);
    clearTimeout(refs.hideTimeout.current!);
    refs.hideTimeout.current = setTimeout(
      () => domEl?.classList.add(CONSTANTS.CLASS_SCROLL_HIDDEN),
      refs.config.current.timeoutVisible
    );
  };

  // Анимация скролла с использованием requestAnimationFrame
  const animFrameScroll = useAnimationFrame<{ velocity: number }>(
    ({ velocity }) => {
      const { scrollElement } = refs;
      if (!scrollElement.current || isMobile) return;

      scrollElement.current === window
        ? window.scrollBy(0, velocity)
        : ((scrollElement.current as HTMLElement).scrollTop += velocity);

      const { dumping, threshold } = getBrowserConfig();
      const nextVelocity = scrollMath.calculateNextVelocity(velocity, dumping);
      Math.abs(nextVelocity) > threshold
        ? animFrameScroll.setData({ velocity: nextVelocity })
        : animFrameScroll.stop();

      refs.direction.current = getScrollDirection(velocity, 0);
      updateThumbPosition();
    },
    delayScroll.scrollBase
  );

  // Анимация для scrollTo
  const scrollToAnimation = useAnimationFrame<{
    target: number;
    start: number;
    progress: number;
  }>(
    ({ target, start, progress }) => {
      const { scrollElement, thumb } = refs;
      if (!areRefsValid(scrollElement.current, thumb.current)) {
        scrollToAnimation.stop();
        return;
      }

      const { scrollHeight, clientHeight } = getScrollData(scrollElement.current);
      const thumbHeight = thumb.current!.offsetHeight;
      const maxScroll = scrollHeight - clientHeight;
      const clampedTarget = Math.max(0, Math.min(target, maxScroll));

      const { ignoreEffect, dumping, velocity, threshold } = getBrowserConfig();

      if (ignoreEffect) {
        performScroll(scrollElement.current, clampedTarget);
        const thumbTop = scrollMath.calculateThumbPosition(clampedTarget, scrollHeight, clientHeight, thumbHeight);
        setThumbTop(thumb.current!, thumbTop);
        refs.direction.current = getScrollDirection(clampedTarget, start);
        triggerCallback(thumbTop, maxScroll, scrollMath.calculateScrollProgress(clampedTarget, scrollHeight, clientHeight));
        scrollToAnimation.stop();
        return;
      }

      const ease = (t: number) => 1 - Math.pow(1 - t, 3); 
      const progressIncrement = 0.05 * velocity;
      const newProgress = Math.min(progress + progressIncrement * (1 - dumping), 1);
      const currentScroll = start + (clampedTarget - start) * ease(newProgress);

      performScroll(scrollElement.current, currentScroll);
      const thumbTop = scrollMath.calculateThumbPosition(currentScroll, scrollHeight, clientHeight, thumbHeight);
      setThumbTop(thumb.current!, thumbTop);
      refs.direction.current = getScrollDirection(currentScroll, start);
      triggerCallback(thumbTop, maxScroll, scrollMath.calculateScrollProgress(currentScroll, scrollHeight, clientHeight));

      if (Math.abs(clampedTarget - currentScroll) > threshold && newProgress < 1) {
        scrollToAnimation.setData({ target, start, progress: newProgress });
      } else {
        scrollToAnimation.stop();
      }
    },
    delayScroll.scrollByTo
  );


  const scrollTo = (value: number) => {
    const { scrollElement } = refs;
    if (!scrollElement.current) return;

    animFrameScroll.stop();
    const { scrollTop } = getScrollData(scrollElement.current);
    scrollToAnimation.setData({ target: value, start: scrollTop, progress: 0 });
    scrollToAnimation.start();
  };


  const getRefTop = (refObject: HTMLElement|Element): number|void => {
    const { scrollElement } = refs;
    if (!scrollElement.current || !refObject) return;

    const isWindow = scrollElement.current === window;
    const scrollData = getScrollData(scrollElement.current);
    const elementRect = refObject.getBoundingClientRect();

    const elementTop = isWindow
      ? elementRect.top + scrollData.scrollTop
      : elementRect.top + scrollData.scrollTop - (scrollElement.current as HTMLElement).getBoundingClientRect().top;

    return elementTop
  };


  // Обработчик начала перетаскивания ползунка
  const handleThumbMouseDown = (e: React.MouseEvent) => {
    if (isMobile) return;
    e.preventDefault();
    refs.isDragging.current = true;
    refs.dragStartY.current = e.clientY;
    const el = refs.scrollElement.current;
    refs.dragStartScrollTop.current = el === window ? window.scrollY : (el as HTMLElement).scrollTop;
    animFrameScroll.stop();
    document.documentElement?.classList.add(CONSTANTS.CLASS_FOCUS_SCROLL);
  };

  // Обработчик движения мыши при перетаскивании
  const handleDocumentMouseMove = (e: MouseEvent) => {
    if (!refs.isDragging.current || isMobile) return;
    e.preventDefault();

    const { scrollElement, thumb } = refs;
    if (!areRefsValid(scrollElement.current, thumb.current)) return;

    const scrollData = getScrollData(scrollElement.current);
    const thumbHeight = thumb.current!.offsetHeight;
    const deltaY = e.clientY - refs.dragStartY.current;

    updateDragScroll(scrollData, thumbHeight, deltaY);
  };

  // Обработчик окончания перетаскивания
  const handleDocumentMouseUp = useCallback(() => {
    refs.isDragging.current = false;
    document.documentElement?.classList.remove(CONSTANTS.CLASS_FOCUS_SCROLL);
  }, []);

  // Установка обработчиков мыши
  useEffect(() => {
    if (isMobile) return;
    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, [isMobile, handleDocumentMouseMove, handleDocumentMouseUp]);

  // Обработчик события колесика мыши
  useEvent(
    'wheel',
    (e) => {
      if (isMobile) return;
      if (getBrowserConfig().ignoreEffect) return;

      const { scrollElement } = refs;
      if (!scrollElement.current || (scrollElement.current !== window && !(scrollElement.current as HTMLElement).contains(e.target as HTMLElement))) return;

      const { velocity: velocityFactor, maxVelocity } = getBrowserConfig();
      const clampedVelocity = scrollMath.calculateWheelVelocity(e.deltaY, velocityFactor, maxVelocity);

      refs.direction.current = getScrollDirection(clampedVelocity, 0);
      animFrameScroll.setData({ velocity: clampedVelocity });
      !animFrameScroll.refIsRunning.current && animFrameScroll.start();
    },
    { passive: false }
  );

  // Обработчик скролла для мобильных устройств
  useEvent('scroll', () => (isMobile || getBrowserConfig().ignoreEffect) && updateThumbPosition(), { passive: true });

  // Инициализация и очистка
  useEffect(() => {
    const isMob = getDeviceType() === 'mobile';
    const isIgnore = getBrowserConfig().ignoreEffect;
    setIsMobile(isMob);
    document.documentElement.style.overflow = isMob || !isIgnore ? CONSTANTS.STYLE_AUTO : CONSTANTS.STYLE_HIDDEN;
    updateThumbPosition();

    return () => {
      document.documentElement.style.overflow = '';
      clearTimeout(refs.hideTimeout.current!);
    };
  }, []);

  // Стили для контейнера скроллбара
  const scrollContainerStyles = {
    position: refs.scrollElement.current === window ? CONSTANTS.STYLE_FIXED : CONSTANTS.STYLE_ABSOLUTE,
    userSelect: refs.isDragging.current ? CONSTANTS.STYLE_NONE : CONSTANTS.STYLE_AUTO,
    pointerEvents: isMobile ? CONSTANTS.STYLE_NONE : CONSTANTS.STYLE_AUTO,
    height: getContainerHeight(refs.scrollElement.current),
  };

  // Стили для ползунка
  const thumbStyles = {
    userSelect: CONSTANTS.STYLE_NONE,
    position: CONSTANTS.STYLE_ABSOLUTE,
    cursor: isMobile ? CONSTANTS.STYLE_DEFAULT : CONSTANTS.STYLE_GRAB,
    pointerEvents: isMobile ? CONSTANTS.STYLE_NONE : CONSTANTS.STYLE_AUTO,
    willChange: 'transform',
  };

  // Компонент скроллбара
  const Scroll = useCallback(
    ({ className='', ...props }:React.HTMLAttributes<HTMLDivElement>) => (
      <div { ...props } ref={ refs.scrollContainer } className={ `ScrollFx ${className} ${getDeviceClass(isMobile)}` } style={ scrollContainerStyles }>
        <div ref={ refs.thumb } className="ScrollFx_thumb" style={ thumbStyles } onMouseDown={ handleThumbMouseDown } />
      </div>
    ),
    [isMobile, handleThumbMouseDown]
  );

  // Установка конфигурации скролла
  const setConfig = (config: ScrollConfig, el: HTMLElement | Window = window) => {
    refs.config.current = config;
    refs.scrollElement.current = el;
    hideScrollbarWithDelay();
  };

  return { setConfig, Scroll, scrollTo, getRefTop, setDelayScroll };
}