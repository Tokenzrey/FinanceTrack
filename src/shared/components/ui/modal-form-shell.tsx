'use client'

import type { ReactNode } from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/shared/components/ui/drawer'
import { useIsDesktop } from '@/shared/hooks/useMediaQuery'

/**
 * The frame every form modal shares: a pinned header, one scrolling body, and a pinned
 * footer for the primary action. Desktop renders a centered dialog, mobile a bottom
 * sheet — the caller writes the fields once and the footer once, not twice.
 *
 * Wire the submit button to the form with a shared id:
 *
 *   <ModalFormShell ... footer={<Button form="goal-form" type="submit">Simpan</Button>}>
 *     <form id="goal-form" onSubmit={...}>…fields…</form>
 *   </ModalFormShell>
 */
export function ModalFormShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  /** `md` for short forms, `lg` for the field-dense ones. Ignored on mobile. */
  size = 'lg',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const isDesktop = useIsDesktop()
  const maxWidth =
    size === 'sm' ? 'sm:max-w-sm' : size === 'md' ? 'sm:max-w-md' : 'sm:max-w-xl'

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={maxWidth}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <DialogBody>{children}</DialogBody>
          <DialogFooter>{footer}</DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <DrawerBody>{children}</DrawerBody>
        <DrawerFooter>{footer}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
