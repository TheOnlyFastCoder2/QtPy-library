import { useRef } from 'react';
import useHook , { DynamicRule, UseResponsiveValueBase, CalculateFunction } from './main';

export type { DynamicRule, UseResponsiveValueBase, CalculateFunction };

export interface ExtendsMethods extends UseResponsiveValueBase {
  decrement: (base: number, step: number) => DynamicRule;
  getDeltaSize: (
    minViewport: number,
    maxViewport: number,
    fromSize: number,
    toSize: number,
    factor?: number
  ) => DynamicRule;
}

const useBreakpoints = useHook as ExtendsMethods;

useBreakpoints.decrement = (base, step) => {
  const refValue = useRef(base);
  const refViewport = useRef(0);
  return useBreakpoints.rule((currViewport) => {
    refValue.current += currViewport > refViewport.current ? step : -step;
    refViewport.current = currViewport;
    return refValue.current;
  });
};

useBreakpoints.getDeltaSize = (
  minViewport,
  maxViewport,
  fromSize,
  toSize,
  step = 1.18
) => {
  return useBreakpoints.rule<number>((currentWidth) => {
    if (currentWidth > maxViewport) return fromSize;
    if (currentWidth < minViewport) return toSize;

    const widthDiff = maxViewport - currentWidth;
    const widthRange = maxViewport - minViewport;
    const steps = widthDiff / step;

    const sizeDiff = Math.abs(fromSize - toSize) * (steps / widthRange);

    return (
      fromSize > toSize
        ? Math.max(toSize, fromSize - sizeDiff)
        : Math.min(toSize, fromSize + sizeDiff)
    )
  });
};

export default useBreakpoints;
