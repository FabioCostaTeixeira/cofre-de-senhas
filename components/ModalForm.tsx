'use client';

import { useEffect } from 'react';

export interface ModalFormProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  /**
   * Plain form-field markup (labels, inputs, buttons, etc.) — NOT a nested
   * `<form>` element. `ModalForm` already renders its own `<form>` wrapper
   * around `children`; wrapping children in another `<form>` produces
   * invalid nested-form HTML with unpredictable browser repair behavior
   * (wrong submit-button binding, inconsistent Enter-key submission).
   * Works the same whether the form is wired via `onSubmit` or `action`.
   */
  children: React.ReactNode;
  submitLabel?: string;
  /**
   * Classic submit handler. Ignored if `action` is also provided.
   */
  onSubmit?: (e: React.FormEvent) => void | Promise<void>;
  /**
   * React 19 Server Action / client action function, passed straight through
   * to the native `<form action={...}>` prop. When provided, the `<form>`
   * handles its own submission natively (no `preventDefault`/manual
   * interception) and `onSubmit` is not attached to the element.
   * If both `action` and `onSubmit` are passed, `action` wins.
   */
  action?: (formData: FormData) => void | Promise<void>;
  isLoading?: boolean;
}

export function ModalForm({
  title,
  isOpen,
  onClose,
  children,
  submitLabel = 'Salvar',
  onSubmit,
  action,
  isLoading = false,
}: ModalFormProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose, isLoading]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isLoading) return;
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.(e);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="glass w-full max-w-md p-8 space-y-6 rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between">
          <h2 id="modal-title" className="text-xl font-semibold">
            {title}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-lg transition"
            aria-label="Fechar"
            type="button"
          >
            ✕
          </button>
        </div>

        <form
          {...(action ? { action } : { onSubmit: handleSubmit })}
          className="space-y-4"
        >
          {children}
          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-lg hover:bg-white/10 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary"
            >
              {isLoading ? '...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
