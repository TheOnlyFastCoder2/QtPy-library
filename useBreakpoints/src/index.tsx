import { useRef } from 'react';
import useHook , { DynamicRule, UseResponsiveValueBase, CalculateFunction } from './main';

export type { DynamicRule, UseResponsiveValueBase, CalculateFunction };

export interface ExtendsMethods extends UseResponsiveValueBase {
  decrement: (base: number, step: number) => DynamicRule;
  getDeltaSize: (
    minViewport: number,
    maxViewport: number,
    minSize: number,
    maxSize: number,
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

useBreakpoints.getDeltaSize = (minViewport, maxViewport, minSize, maxSize, step = 1.18) => {
  return useBreakpoints.rule<number>((currentWidth) => {
    if (currentWidth > maxViewport) return minSize;
    if (currentWidth < minViewport) return maxSize;
    const widthDecrease = maxViewport - currentWidth;
    const widthRange = maxViewport - minViewport;
    const steps = widthDecrease / step;
    const sizeDecrease = (minSize - maxSize) * (steps / widthRange);
    return Math.max(maxSize, minSize - sizeDecrease);
  });
};

export default useBreakpoints;
