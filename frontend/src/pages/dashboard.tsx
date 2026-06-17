'use client'

import { useComplianceRoot } from '../../hooks/useComplianceRoot'

export default function Page() {
  const { data } = useComplianceRoot()

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-16">
      <h2 className="text-2xl font-semibold">Dashboard</h2>
      <div className="rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-500">Current Merkle root version</p>
        <p className="font-mono text-sm">{data?.version ?? '—'}</p>
      </div>
      <div className="rounded-lg border border-gray-200 p-4">
        <p className="text-sm text-gray-500">Pass status</p>
        <p className="font-medium">Active</p>
      </div>
    </div>
  )
}
