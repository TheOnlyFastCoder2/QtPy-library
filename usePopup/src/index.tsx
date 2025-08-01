import { useState, useRef, useEffect, useMemo, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './index.css';

interface PopupProps {
  children: ReactNode;
  className?: string;
  isOnCloseBG?: boolean;
  domPortalById?: string;
}

export default function usePopup(delay: number = 0) {
  const refTimeId = useRef<NodeJS.Timeout | null>(null);
  const refContainer = useRef<HTMLDivElement | null>(null);
  const [isShowed, setIsShowed] = useState(false);

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
  }: PopupProps) => {
    const overlays = document.getElementById(domPortalById) || document.body;
    const clIsVisible = isShowed ? 'isVisible' : '';
    const clIsOnCloseBG = isShowed ? 'onCloseBG' : '';

    return isShowed && overlays
      ? createPortal(
        <div
          onClick={ isOnCloseBG ? handleClickOverlay : undefined }
          className={ `Popup ${className} ${clIsVisible} ${clIsOnCloseBG}` }
          ref={ refContainer }
        >
          <div className="Popup_container">{ children }</div>
        </div>,
        overlays
      )
      : null;
  };

  // Создаем расширение Popup.Memo с методом Memo для пользовательских оберток
  const PopupWithMemo = Object.assign(Popup, {
    Memo: function <T extends object = {}>(config: {
      toOpenPopup: () => void;
      toTogglePopup: () => void;
      toClosePopup: () => void;
      isShowed: boolean;
      Popup: React.FC<T>;
    } & T, deps: any[] = []) {

      return useMemo(() => ({
        ...config,
        toOpenPopup: config.toOpenPopup,
        toTogglePopup: config.toTogglePopup,
        isShowed: config.isShowed,
        Popup: config.Popup,
      }), [config.isShowed, ...deps]);
    },
  });

  return useMemo(() => {
    return {
      isShowed,
      toOpenPopup,
      toTogglePopup,
      toClosePopup: handleClose,
      Popup: PopupWithMemo,
    };
  }, [isShowed]);
}
