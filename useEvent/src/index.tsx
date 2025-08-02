import { useRef, useEffect } from 'react';

function useEvent<K extends keyof DocumentEventMap>(
  event: K,
  listener: (event: DocumentEventMap[K], removeListener: () => void) => void,
  options?: boolean | AddEventListenerOptions,
  target?: Document | Window | React.RefObject<Document | Window | null>,
  deps?: React.DependencyList
): void;

function useEvent<K extends keyof HTMLElementEventMap, T extends HTMLElement>(
  event: K,
  listener: (event: HTMLElementEventMap[K], removeListener: () => void) => void,
  options?: boolean | AddEventListenerOptions,
  target?: T | React.RefObject<T | null>,
  deps?: React.DependencyList
): void;

function useEvent<T extends EventTarget = Window>(
  event: string,
  listener: (event: Event, removeListener: () => void) => void,
  options?: boolean | AddEventListenerOptions,
  target?: T | React.RefObject<T | null>,
  deps?: React.DependencyList[]
): void;

function useEvent(
  event: string,
  listener: (event: Event, removeListener: () => void) => void,
  options?: boolean | AddEventListenerOptions,
  target: EventTarget | React.RefObject<EventTarget | null> = window,
  deps: React.DependencyList = []
) {
  const handlerRef = useRef(listener);
  handlerRef.current = listener;

  useEffect(() => {
    const element = target && 'current' in target ? target.current : target;
    if (!element?.addEventListener) return;

    const handler = (e: Event) => {
      handlerRef.current(e, () => {
        element.removeEventListener(event, handler, options);
      });
    };

    element.addEventListener(event, handler, options);
    return () => {
      element.removeEventListener(event, handler, options);
    };
  }, [event, target, options, ...deps]);
}

export default useEvent;
