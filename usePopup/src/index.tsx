import { useState, useRef, useEffect, useMemo, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './index.css';

const getCheckIsSSR = () => {
  return typeof window === 'undefined';
};

export interface PopupProps {
  children: ReactNode;
  className?: string;
  isOnCloseBG?: boolean;
  domPortalById?: string;
  eventCloseBG?: PopupEvent;
}
export type PopupControl<T = any, TImp extends object = any> = {
  setData: (val: T) => void;
  [key: string]: any;
} & TImp;

export type ImperativePopupProps<T, TImp extends object> = {
  imperativeRef: React.RefObject<Partial<PopupControl<T, TImp>>>;
};

export default function usePopup<T = any, TImp extends object = any>(delay: number = 0) {
  const refTimeId = useRef<NodeJS.Timeout | null>(null);
  const refContainer = useRef<HTMLDivElement | null>(null);
  const [isShowed, setIsShowed] = useState(false);

  const refPortalData = useRef<Partial<PopupControl<T, TImp>>>({});
  const isSSR = getCheckIsSSR();
  const toOpenPopup = () => setIsShowed(true);

  const toClosePopup = () => {
    if (refTimeId.current !== null) return;
    refTimeId.current = setTimeout(() => {
      refTimeId.current = null;
      setIsShowed(false);
    }, delay * 1000);
  };

  useEffect(() => {
    return () => {
      clearTimeout(refTimeId.current as NodeJS.Timeout);
      refTimeId.current = null;
    };
  }, []);

  const handleClose = () => {
    if (refContainer?.current) {
      refContainer.current.classList.add('isRemove');
    }
    toClosePopup();
  };

  const showWithData = (data: T) => {
    if (!isShowed) setIsShowed(true);
    setTimeout(() => {
      refPortalData.current?.setData?.(data);
    }, 10);
  };
  const getImperativeData = () => {
    return refPortalData.current;
  };

  const toTogglePopup = () => {
    !isShowed ? toOpenPopup() : handleClose();
  };

  const handleClickOverlay = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target instanceof Element && e.target.parentElement === e.currentTarget) {
      handleClose();
    }
  };

  // Базовый компонент Popup
  const Popup = ({
    children,
    className = '',
    isOnCloseBG = true,
    domPortalById = 'root',
    eventCloseBG = 'onClick',
  }: PopupProps) => {
    if (isSSR) {
      return null;
    }
    const overlays = document.getElementById(domPortalById) || document.body;
    const clIsVisible = isShowed ? 'isVisible' : '';
    return isShowed && overlays
      ? createPortal(
          <div
            className={`Popup ${className} ${clIsVisible}`}
            ref={refContainer}
            {...{ [eventCloseBG]: isOnCloseBG ? handleClickOverlay : undefined }}
          >
            <div className="Popup_container">{children}</div>
          </div>,
          overlays
        )
      : null;
  };

  const PopupWithMemo = Object.assign(Popup, {
    Memo: function <TProps extends ImperativePopupProps<T, TImp>, TExtensions extends object = {}>(
      config: {
        toOpenPopup?: () => void;
        toTogglePopup?: () => void;
        toClosePopup?: () => void;
        showWithData?: (data: T) => void;
        getImperativeData?: () => Partial<PopupControl<T, TImp>>;
        isShowed?: boolean;
        Popup: React.FC<TProps>;
      } & TExtensions,
      deps: React.DependencyList[] = []
    ) {
      return useMemo(
        () => ({
          ...config,
          toOpenPopup: config.toOpenPopup,
          toTogglePopup: config.toTogglePopup,
          getImperativeData: getImperativeData,
          isShowed: config.isShowed,
          Popup: (props: Omit<TProps, 'imperativeRef'>) =>
            config.Popup({ ...props, imperativeRef: refPortalData } as TProps),
        }),
        [config.isShowed, ...deps]
      );
    },
  });

  return useMemo(() => {
    return {
      isShowed,
      toOpenPopup,
      toTogglePopup,
      showWithData,
      toClosePopup: handleClose,
      getImperativeData,
      Popup: PopupWithMemo,
    };
  }, [isShowed]);
}

type PopupEvent =
  | 'onClick'
  | 'onMouseDown'
  | 'onMouseUp'
  | 'onContextMenu'
  | 'onDoubleClick'
  | 'onMouseEnter'
  | 'onMouseLeave'
  | 'onMouseMove'
  | 'onKeyDown'
  | 'onKeyUp'
  | 'onKeyPress'
  | 'onTouchStart'
  | 'onTouchEnd'
  | 'onTouchCancel'
  | 'onTouchMove'
  | 'onFocus'
  | 'onBlur'
  | 'onWheel'
  | 'onPointerDown'
  | 'onPointerUp'
  | 'onPointerCancel';
