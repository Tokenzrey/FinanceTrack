'use client'

import { useState } from 'react'
import { TransactionForm } from '@/modules/transactions/components/TransactionForm'
import { ScanDialog } from '@/modules/receipt-scanner/ScanDialog'
import { CommandPalette } from './CommandPalette'

/**
 * Holds the app-wide dialogs the command palette and keyboard shortcuts can open from
 * any page. Lives inside the protected layout so it mounts once, not per route.
 */
export function AppShell() {
  const [transactionOpen, setTransactionOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)

  return (
    <>
      <CommandPalette
        onNewTransaction={() => setTransactionOpen(true)}
        onScanReceipt={() => setScanOpen(true)}
      />
      <TransactionForm open={transactionOpen} onOpenChange={setTransactionOpen} />
      <ScanDialog open={scanOpen} onOpenChange={setScanOpen} />
    </>
  )
}
