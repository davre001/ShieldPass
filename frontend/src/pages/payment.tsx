'use client'

import { useState } from 'react'
import { ProofGenerator } from '../../components/ProofGenerator'
import { TransactionExplorerLink } from '../../components/TransactionExplorerLink'
import { useProofFlowStore } from '../../store/useProofFlowStore'

export default function Page() {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const { stage, txHash } = useProofFlowStore()

  return (
    <div className="mx-auto max-w-md space-y-6 py-16">
      <h2 className="text-2xl font-semibold">Send Payment</h2>
      <input
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder="Recipient Stellar address"
        className="w-full rounded-md border px-3 py-2"
      />
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount (USDC)"
        className="w-full rounded-md border px-3 py-2"
      />
      <ProofGenerator />
      {stage === 'confirmed' && txHash && <TransactionExplorerLink txHash={txHash} />}
    </div>
  )
}
