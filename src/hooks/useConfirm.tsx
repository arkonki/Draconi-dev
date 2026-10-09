import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ConfirmationDialog } from '../components/shared/ConfirmationDialog';

export interface ConfirmOptions {
  title: string;
  description: ReactNode;
  confirmText?: string;
  /** Styles the confirm button as dangerous. Defaults to true, since most confirmations guard a deletion. */
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Promise-based replacement for `window.confirm`: `if (!(await confirm({ ... }))) return;`.
 * Render the returned `dialog` once anywhere in the component.
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    pendingRef.current?.resolve(confirmed);
    pendingRef.current = null;
    setPending(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    pendingRef.current?.resolve(false);
    const next = { ...options, resolve };
    pendingRef.current = next;
    setPending(next);
  }), []);

  // A dialog that is still open when its owner unmounts counts as cancelled.
  useEffect(() => () => { pendingRef.current?.resolve(false); }, []);

  const dialog = (
    <ConfirmationDialog
      isOpen={pending !== null}
      onClose={() => settle(false)}
      onConfirm={() => settle(true)}
      title={pending?.title ?? ''}
      description={pending?.description ?? ''}
      confirmText={pending?.confirmText ?? 'Confirm'}
      isDestructive={pending?.destructive ?? true}
    />
  );

  return { confirm, dialog };
}
