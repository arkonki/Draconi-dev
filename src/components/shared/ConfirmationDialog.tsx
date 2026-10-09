import React from 'react';
import { Button } from './Button';
import { AccessibleDialog } from './AccessibleDialog';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
  /** Extra content shown under the description, such as a list of what will be affected. */
  children?: React.ReactNode;
  /** Keeps the confirm button disabled, for example while details are still loading. */
  confirmDisabled?: boolean;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  isDestructive?: boolean;
  icon?: React.ReactNode;
}

export function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmDisabled = false,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isLoading = false,
  isDestructive = false,
  icon,
}: ConfirmationDialogProps) {
  return (
    <AccessibleDialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      icon={icon && <div className={`flex h-12 w-12 items-center justify-center rounded-full ${isDestructive ? 'bg-red-100' : 'bg-blue-100'}`}>{icon}</div>}
      size="md"
      layer="critical"
      closeDisabled={isLoading}
      bodyClassName={children ? 'px-4 pb-2 sm:px-6' : 'hidden'}
      footerClassName="border-t-0 pt-2 sm:pb-6"
      footer={(
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
            className="mt-3 sm:mt-0 w-full sm:w-auto"
          >
            {cancelText}
          </Button>
          <Button
            variant={isDestructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={isLoading}
            disabled={confirmDisabled}
            className="w-full sm:w-auto"
          >
            {confirmText}
          </Button>
        </div>
      )}
    >
      {children ?? <span />}
    </AccessibleDialog>
  );
}
