import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Modal({ title, description, open, onOpenChange, children }: { title: string; description?: string; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="modal-overlay" /><Dialog.Content className="modal-content" {...(!description ? { 'aria-describedby': undefined } : {})}>
    <div className="modal-heading"><Dialog.Title>{title}</Dialog.Title><Dialog.Close className="icon-button" aria-label="Close dialog"><X size={20} /></Dialog.Close></div>
    {description && <Dialog.Description>{description}</Dialog.Description>}
    {children}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
