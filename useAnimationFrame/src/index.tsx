import { useEffect, useRef } from 'react';

export default function useAnimationFrame  <T = void>(
  callback: (someData: T, deltaTime: number) => void,
  delay: number = 16.67
)  {
  const refRequest = useRef<number | null>(null);
  const refPreviousTime = useRef<number | null>(null);
  const refIsRunning = useRef(false);
  const refCallback = useRef(callback);
  const refSomeData = useRef<T>(undefined);

  refCallback.current = callback;

  const animate = (time: number) => {
    if (refPreviousTime.current === null) {
      refPreviousTime.current = time;
    }

    const deltaTime = time - refPreviousTime.current;

    if (deltaTime >= delay) {
      refCallback.current(refSomeData.current!, deltaTime);
      refPreviousTime.current = time;
    }

    if (!document.hidden && refIsRunning.current) {
      refRequest.current = requestAnimationFrame(animate);
    }
  };

  const start = () => {
    if (!refIsRunning.current) {
      refIsRunning.current = true;
      refPreviousTime.current = null;
      if (!document.hidden) {
        refRequest.current = requestAnimationFrame(animate);
      }
    }
  };

  const stop = () => {
    refIsRunning.current = false;
    if (refRequest.current !== null) {
      cancelAnimationFrame(refRequest.current);
      refRequest.current = null;
    }
  };

  const setData = (data: T): T => {
    refSomeData.current = data;
    return data as T
  };
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && refIsRunning.current) {
        refRequest.current = requestAnimationFrame(animate);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (refIsRunning.current) {
      stop();
      start();
    }
  }, [delay]);

  return { start, stop, refIsRunning, setData };
};
