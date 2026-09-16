import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'sheet';
type DialogLayer = 'base' | 'nested' | 'critical';

const sizeClasses: Record<DialogSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-5xl',
  sheet: 'sm:max-w-[1400px]',
};

const layerClasses: Record<DialogLayer, string> = {
  base: 'z-[80]',
  nested: 'z-[100]',
  critical: 'z-[120]',
};

let dialogSequence = 0;
const openDialogs: number[] = [];
let bodyOverflowBeforeDialogs = '';

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
}: AccessibleDialogProps) {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descriptionId = `${generatedId}-description`;
  const panelRef = useRef<HTMLDivElement>(null);
  const dialogIdRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialogId = ++dialogSequence;
    dialogIdRef.current = dialogId;
    if (openDialogs.length === 0) {
      bodyOverflowBeforeDialogs = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openDialogs.push(dialogId);

    const focusTimer = window.setTimeout(() => {
      const target = initialFocusRef?.current || focusableElements(panelRef.current!)[0] || panelRef.current;
      target?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== dialogId || !panelRef.current) return;
      if (event.key === 'Escape') {
        if (!closeDisabled) {
          event.preventDefault();
          onClose();
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
      const index = openDialogs.lastIndexOf(dialogId);
      if (index >= 0) openDialogs.splice(index, 1);
      if (openDialogs.length === 0) document.body.style.overflow = bodyOverflowBeforeDialogs;
      window.setTimeout(() => previousFocus?.focus(), 0);
    };
  }, [closeDisabled, initialFocusRef, isOpen, onClose]);

  if (!isOpen) return null;

  const mobilePanel = fullScreenMobile
    ? 'h-[100dvh] rounded-none sm:h-auto sm:max-h-[92dvh] sm:rounded-xl'
    : 'max-h-[calc(100dvh-1rem)] rounded-xl sm:max-h-[90dvh]';

  return (
    <div className={`fixed inset-0 ${layerClasses[layer]} flex items-center justify-center p-0 sm:p-4`}>
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
        {!hideHeader && <div className={`flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4 ${headerClassName}`}>
          <div className="flex min-w-0 items-start gap-3">
            {icon && <div className="shrink-0" aria-hidden="true">{icon}</div>}
            <div className="min-w-0">
              <h2 id={titleId} className={`text-lg font-bold text-stone-900 ${titleClassName}`}>{title}</h2>
              {description && <div id={descriptionId} className="mt-1 text-sm text-stone-600">{description}</div>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
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
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${bodyClassName}`}>
          {children}
        </div>
        {footer && (
          <div className={`shrink-0 border-t bg-white px-4 py-3 sm:px-6 ${footerClassName}`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
