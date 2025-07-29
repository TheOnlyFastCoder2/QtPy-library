import { memo, PropsWithChildren, useEffect, useRef } from 'react';
import { useMatch } from 'react-router-dom';

interface IProps extends PropsWithChildren {
  isValidRoutes: Array<string>;
  isInverted?: boolean;
  onLister?: (isShow: boolean, route: string | null) => void;
}
const RouteGuard = memo(({ onLister, isValidRoutes, children, isInverted = false }: IProps) => {
  const refListener = useRef(onLister)
  refListener.current = onLister;

  const matches = isValidRoutes.map((route) => ({
    isMatch: useMatch(route) !== null,
    route: route,
  }));

  const matchObject = matches.find(({ isMatch }) => isMatch);
  const { isMatch, route } = matchObject || { isMatch: false, route: null };

  useEffect(() => {
    refListener.current?.(isMatch, route);
  }, [isMatch, route]);

  if (isInverted) {
    return !isMatch ? children : null;
  }
  return isMatch ? children : null;
})

export default RouteGuard;