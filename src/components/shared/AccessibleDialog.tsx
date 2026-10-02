import React, { useContext, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { DialogLayerContext } from './dialogLayer';

type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'sheet';
type DialogLayer = 'base' | 'nested' | 'critical';

const sizeClasses: Record<DialogSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-5xl',
  sheet: 'sm:max-w-[1400px]',
};

const layerIndices: Record<DialogLayer, number> = {
  base: 80,
  nested: 100,
  critical: 120,
};

let dialogSequence = 0;
const openDialogs: { id: number; layer: number }[] = [];
let bodyOverflowBeforeDialogs = '';

function isTopDialog(id: number) {
  const top = openDialogs.reduce<(typeof openDialogs)[number] | undefined>((current, dialog) => (
    !current || dialog.layer > current.layer || (dialog.layer === current.layer && dialog.id > current.id)
      ? dialog : current
  ), undefined);
  return top?.id === id;
}

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>([
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(','))).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}

export interface AccessibleDialogProps {
  isOpen?: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  ariaLabel?: string;
  size?: DialogSize;
  layer?: DialogLayer;
  fullScreenMobile?: boolean;
  closeOnBackdrop?: boolean;
  closeDisabled?: boolean;
  showCloseButton?: boolean;
  hideHeader?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
  panelClassName?: string;
  headerClassName?: string;
  titleClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  bodyScrollable?: boolean;
}

export function AccessibleDialog({
  isOpen = true,
  onClose,
  title,
  description,
  children,
  footer,
  actions,
  icon,
  ariaLabel,
  size = 'md',
  layer = 'base',
  fullScreenMobile = false,
  closeOnBackdrop = true,
  closeDisabled = false,
  showCloseButton = true,
  hideHeader = false,
  initialFocusRef,
  panelClassName = '',
  headerClassName = '',
  titleClassName = '',
  bodyClassName = '',
  footerClassName = '',
  bodyScrollable = true,
}: AccessibleDialogProps) {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descriptionId = `${generatedId}-description`;
  const panelRef = useRef<HTMLDivElement>(null);
  const parentLayer = useContext(DialogLayerContext);
  const layerIndex = Math.max(layerIndices[layer], parentLayer + 20);
  const latestOptionsRef = useRef({ onClose, closeDisabled, initialFocusRef });
  latestOptionsRef.current = { onClose, closeDisabled, initialFocusRef };

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialogId = ++dialogSequence;
    if (openDialogs.length === 0) {
      bodyOverflowBeforeDialogs = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openDialogs.push({ id: dialogId, layer: layerIndex });

    const focusTimer = window.setTimeout(() => {
      if (!isTopDialog(dialogId) || !panelRef.current) return;
      const target = latestOptionsRef.current.initialFocusRef?.current || focusableElements(panelRef.current)[0] || panelRef.current;
      target?.focus({ preventScroll: true });
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog(dialogId) || !panelRef.current) return;
      if (event.key === 'Escape') {
        if (!latestOptionsRef.current.closeDisabled) {
          event.preventDefault();
          latestOptionsRef.current.onClose();
        }
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = focusableElements(panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      const index = openDialogs.findIndex(dialog => dialog.id === dialogId);
      if (index >= 0) openDialogs.splice(index, 1);
      if (openDialogs.length === 0) document.body.style.overflow = bodyOverflowBeforeDialogs;
      window.setTimeout(() => {
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      }, 0);
    };
  // Live sheet updates often create a new callback. They must not re-register
  // the dialog, steal focus, or scroll the sheet back to its first control.
  }, [isOpen, layerIndex]);

  if (!isOpen) return null;

  const mobilePanel = fullScreenMobile
    ? 'h-[100dvh] rounded-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[92dvh] sm:rounded-xl sm:p-0'
    : 'max-h-[calc(100dvh-1rem)] rounded-xl sm:max-h-[90dvh]';

  return createPortal(
    <DialogLayerContext.Provider value={layerIndex}>
    <div style={{ zIndex: layerIndex }} data-dialog-layer={layerIndex} className="fixed inset-0 flex items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => closeOnBackdrop && !closeDisabled && onClose()}
        aria-hidden="true"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel || hideHeader ? undefined : titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`relative flex w-full flex-col overflow-hidden bg-white shadow-2xl outline-none ${sizeClasses[size]} ${mobilePanel} ${panelClassName}`}
      >
        {!hideHeader && <div className={`flex shrink-0 flex-col items-stretch gap-3 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-4 ${headerClassName}`}>
          <div className="flex min-w-0 items-start gap-3 sm:flex-1">
            {icon && <div className="shrink-0" aria-hidden="true">{icon}</div>}
            <div className="min-w-0">
              <h2 id={titleId} className={`text-lg font-bold text-stone-900 ${titleClassName}`}>{title}</h2>
              {description && <div id={descriptionId} className="mt-1 text-sm text-stone-600">{description}</div>}
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:w-auto sm:shrink-0">
            {actions && <div className="min-w-0 flex-1 sm:flex-none">{actions}</div>}
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                disabled={closeDisabled}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>}
        <div data-dialog-scroll={bodyScrollable ? '' : undefined} className={`min-h-0 flex-1 ${bodyScrollable ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden'} ${bodyClassName}`}>
          {children}
        </div>
        {footer && (
          <div className={`shrink-0 border-t bg-white px-4 py-3 sm:px-6 ${footerClassName}`}>
            {footer}
          </div>
        )}
      </div>
    </div>
    </DialogLayerContext.Provider>,
    document.body,
  );
}
