import React, { useState, useEffect, useMemo, useRef } from 'react';


export type CalculateFunction<T = any> = (
  currentWidth: number,
  currentHeight: number,
  breakpointWidth: number,
  breakpointHeight: number
) => T;

export interface DynamicRule<T = any> {
  calculate: CalculateFunction<T>;
}

export interface UseResponsiveValueBase {
  <T>(breakpoints: Record<string | number, T>): UnwrapDynamicRule<T>;
  <T>(breakpoints: Record<string | number, DynamicRule<T>>): T;
  <T>(breakpoints: Record<string | number, T | DynamicRule<T>>, delay: number): UnwrapDynamicRule<T>;
  rule: <T = any>(calculate: CalculateFunction<T>) => DynamicRule<T>;
  memoConfig: <T extends Record<string | number, any>>(config: T, deps: React.DependencyList) => () => T;
  getDeltaSize: (
    breakpointWidth: number,
    breakpointHeight: number,
    minScale: number,
    maxScale: number,
    step: number
  ) => DynamicRule<number>;
}

type UnwrapDynamicRule<T> = T extends DynamicRule<infer U> ? U : T;

const parseBreakpointKey = (key: string | number): { width: number; height: number } => {
  if (typeof key === 'number') {
    return { width: key, height: 0 };
  }

  const [widthStr, heightStr] = key.split(',');
  const width = parseInt(widthStr, 10);
  const height = heightStr ? parseInt(heightStr, 10) : 0;

  return { width, height };
};

const useBreakpoints = function <T>(breakpoints: Record<string | number, any>, delay: number = 1000): T {
  const refTimeout = useRef<NodeJS.Timeout | null>(null);
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  const sortedBreakpoints = useMemo(() => {
    return Object.entries(breakpoints)
      .map(([bp, val]) => {
        const { width, height } = parseBreakpointKey(bp);
        return { width, height, value: val };
      })
      .sort((a, b) => b.width - a.width || b.height - a.height);
  }, [breakpoints]);

  const {
    width: breakpointWidth,
    height: breakpointHeight,
    value: breakpointValue,
  } = useMemo(() => {
    const found =
      sortedBreakpoints.find(
        ({ width, height }: {width:number, height:number}) => windowSize.width >= width && (height === 0 || windowSize.height >= height)
      ) || sortedBreakpoints[sortedBreakpoints.length - 1];

    return found || { width: 0, height: 0, value: undefined as unknown as any };
  }, [sortedBreakpoints, windowSize]);

  useEffect(() => {
    const handleResize = () => {
      if (refTimeout.current) {
        clearTimeout(refTimeout.current);
      }
      refTimeout.current = setTimeout(() => {
        setWindowSize({
          width: window.innerWidth,
          height: window.innerHeight,
        });
        refTimeout.current = null;
      }, delay);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (refTimeout.current) {
        clearTimeout(refTimeout.current);
      }
    };
  }, [delay]);

  useEffect(() => {
    refTimeout.current && clearTimeout(refTimeout.current!);
  }, []);

  return useMemo(() => {
    const processValue = (value: any): any => {
      if (React.isValidElement(value) || typeof value !== 'object' || value === null) {
        return value;
      }

      if ('calculate' in value) {
        return value.calculate(windowSize.width, windowSize.height, breakpointWidth, breakpointHeight);
      }

      if (Array.isArray(value)) {
        return value.map(processValue);
      }

      const result: any = {};
      for (const key in value) {
        result[key] = processValue(value[key]);
      }
      return result;
    };

    return processValue(breakpointValue);
  }, [breakpointValue, windowSize, breakpointWidth, breakpointHeight]);
} as UseResponsiveValueBase;

useBreakpoints.rule = <T = any>(calculate: CalculateFunction<T>) => ({ calculate });
useBreakpoints.memoConfig = function <T>(config: T, deps: React.DependencyList): () => T {
  return () => useMemo(() => config, deps);
};

export default useBreakpoints;
