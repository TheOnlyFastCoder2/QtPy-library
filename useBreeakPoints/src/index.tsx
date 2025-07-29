import { useRef } from 'react';
import useBreakpoints, { DynamicRule, UseResponsiveValueBase } from './main';

interface ExtendsMethods extends UseResponsiveValueBase { 
  decrement: (base: number, step: number) => DynamicRule;
  getDeltaSize: (
    minViewport: number,
    maxViewport: number,
    fromSize: number,
    toSize: number,
    factor?: number
  ) => DynamicRule;
}

const extendedHook = useBreakpoints as ExtendsMethods;

extendedHook.decrement = (base, step) => {
  const refValue = useRef(base);
  const refViewport = useRef(0);
  return extendedHook.rule((currViewport) => {
    refValue.current += currViewport > refViewport.current ? step : -step;
    refViewport.current = currViewport;
    return refValue.current;
  });
};

extendedHook.getDeltaSize = (minViewport, maxViewport, fromSize, toSize, step = 1.18) => {
  return extendedHook.rule<number>((currentWidth) => {
    if (currentWidth > maxViewport) return fromSize;
    if (currentWidth < minViewport) return toSize;
    const widthDecrease = maxViewport - currentWidth;
    const widthRange = maxViewport - minViewport;
    const steps = widthDecrease / step;
    const sizeDecrease = (fromSize - toSize) * (steps / widthRange);
    return Math.max(toSize, fromSize - sizeDecrease);
  });
};

export default extendedHook;
