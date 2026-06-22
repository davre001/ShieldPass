import { useState } from 'react'
import type { ShieldPassProver as ShieldPassProverType } from '@shieldpass/sdk/dist/prover'

export type ZkProofStatus = 'idle' | 'loading-circuit' | 'generating' | 'done' | 'error'

export interface ZkProofResult {
  proof: string       // hex-encoded proof bytes
  publicInputs: string[]
  nullifier: string
}

const DEPTH = 8

/**
 * Real in-browser ZK proving via the ShieldPass SDK. All cryptography (Poseidon, witness gen,
 * UltraHonk proving) lives in the SDK so frontend + backend share ONE verified implementation.
 *   - secretSalt : returned by /kyc/submit-bvn (private, never sent to a server)
 *   - merkleRoot : the real Poseidon root, also from the /kyc/submit-bvn response
 * generateProof RETURNS the result directly (do not read `result` right after awaiting — it is async state).
 */
export function useZkProof() {
  const [status, setStatus] = useState<ZkProofStatus>('idle')
  const [result, setResult] = useState<ZkProofResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])

  const addLog = (msg: string) => setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])

  const generateProof = async (secretSalt: string, merkleRoot: string, requireBvn: boolean, bvnVerified: boolean): Promise<ZkProofResult | null> => {
    setStatus('loading-circuit')
    setResult(null)
    setError(null)
    setLog([])

    try {
      addLog('Loading ShieldPass SDK (prover + Poseidon)...')
      const { ShieldPassProver } = await import('@shieldpass/sdk/dist/prover')
      const { computeNullifier } = await import('@shieldpass/sdk/dist/poseidon')
      const { proofToHex } = await import('@shieldpass/sdk/dist/utils')

      addLog('Fetching compiled circuit (reusable_kyc.json)...')
      const circuitRes = await fetch('/reusable_kyc.json')
      if (!circuitRes.ok) throw new Error('Failed to load circuit JSON. Is it in /public?')
      const circuit = await circuitRes.json()
      addLog('Circuit loaded.')

      const current_timestamp = Math.floor(Date.now() / 3_600_000).toString()
      const nullifier = computeNullifier(secretSalt, current_timestamp)

      const params = {
        secret_salt: secretSalt,
        is_human: '1',
        bvn_verified: bvnVerified ? '1' : '0',
        good_standing: '1',
        merkle_path: Array(DEPTH).fill('0'),
        merkle_indices: Array(DEPTH).fill('0'),
        merkle_root: merkleRoot,
        current_timestamp,
        nullifier,
        hardware_attested: '1',
        require_bvn: requireBvn ? '1' : '0',
      }

      addLog('Initializing Barretenberg + Noir...')
      setStatus('generating')
      const prover: ShieldPassProverType = new ShieldPassProver(circuit)
      await prover.init()

      addLog('Generating ZK proof in-browser... (10-30s)')
      const proofResult = await prover.proveKYC(params)
      addLog('ZK Proof generated.')

      const built: ZkProofResult = {
        proof: proofToHex(proofResult.proof),
        publicInputs: proofResult.publicInputs.map(String),
        nullifier: proofResult.nullifier,
      }
      setResult(built)
      setStatus('done')
      return built
    } catch (err: any) {
      console.error('[ZK Proof Error]', err)
      setError(err.message || 'Unknown error during proof generation')
      setStatus('error')
      return null
    }
  }

  const reset = () => {
    setStatus('idle')
    setResult(null)
    setError(null)
    setLog([])
  }

  return { status, result, error, log, generateProof, reset }
}
