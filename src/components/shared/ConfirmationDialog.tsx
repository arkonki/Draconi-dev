import React from 'react';
import { Button } from './Button';
import { AccessibleDialog } from './AccessibleDialog';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
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
      bodyClassName="hidden"
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
            className="w-full sm:w-auto"
          >
            {confirmText}
          </Button>
        </div>
      )}
    >
      <span />
    </AccessibleDialog>
  );
}
