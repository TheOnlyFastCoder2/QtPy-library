import { useState, memo, useRef, useEffect, useMemo, ReactNode } from "react";
import { createPortal } from "react-dom";
import "./styles.css";



/**
 * Popup component properties.
 */
interface PopupProps {
  children: ReactNode;
  className?: string;
  isOnCloseBG?: boolean;
  domPortalById?: string;
}

/**
 * A custom React hook for managing popup/dialog state and rendering.
 * 
 * @param {number} [delay=0] - The delay in seconds before the popup closes after triggering close.
 * @returns {Object} An object containing popup state and controls.
 */
export default function usePopup(delay: number = 0) {
  const refTimeId = useRef<NodeJS.Timeout | null>(null);
  const refContainer = useRef<HTMLDivElement | null>(null);
  const [isShowed, setIsShowed] = useState(false);

  const toOpenPopup = () => setIsShowed(true);
  const toClosePopup = (callback?: () => void) => {
    if (refTimeId.current !== null) return;
    refTimeId.current = setTimeout(() => {
      callback?.();
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
      refContainer.current.classList.add("__remove");
    }
    toClosePopup();
  };

  const handleClickOverlay = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target instanceof Element && e.target.parentElement === e.currentTarget) {
      handleClose();
    }
  };

  return useMemo(
    () => ({
      isShowed,
      toOpenPopup,
      toClosePopup: handleClose,
      Popup: memo(
        /**
         * Renders a popup component via React portal.
         * @param {PopupProps} props - Popup component properties.
         * @returns {React.ReactPortal|null} The portal-rendered popup or null if not shown.
         */
        ({ children, className = "", isOnCloseBG = true, domPortalById = 'root' }: PopupProps) => {
          const overlays = document.getElementById(domPortalById) || document.body;
          return isShowed && overlays
            ? createPortal(
              <div
                onClick={ isOnCloseBG ? handleClickOverlay : undefined }
                className={ `Popup ${className} ${isShowed ? "visible" : ""} ${isOnCloseBG ? "onCloseBG" : ""
                  }` }
                ref={ refContainer }
              >
                <div className="Popup_container">{ children }</div>
              </div>,
              overlays
            )
            : null
        }
      ),
    }),
    [isShowed]
  );
}
