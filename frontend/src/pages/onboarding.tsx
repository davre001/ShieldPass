'use client'

import { useState } from 'react'
import { api } from '../../lib/api'

export default function Page() {
  const [submitting, setSubmitting] = useState(false)
  const [issued, setIssued] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const form = new FormData(e.currentTarget)
      await api.post('/kyc/submit', {
        fullName: form.get('fullName'),
        dateOfBirth: form.get('dateOfBirth'),
        countryCode: form.get('countryCode'),
      })
      await api.post('/compliance/issue-attestation')
      setIssued(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (issued) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h2 className="text-2xl font-semibold">Your compliance pass is ready</h2>
        <p className="mt-2 text-gray-600">
          Your details were checked once, by our issuer, and never touch the
          blockchain.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4 py-16">
      <h2 className="text-2xl font-semibold">Get Your Pass</h2>
      <input name="fullName" placeholder="Full name" className="w-full rounded-md border px-3 py-2" required />
      <input name="dateOfBirth" type="date" className="w-full rounded-md border px-3 py-2" required />
      <input name="countryCode" placeholder="Country code (e.g. US)" className="w-full rounded-md border px-3 py-2" required />
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? 'Generating your compliance pass…' : 'Submit'}
      </button>
    </form>
  )
}
