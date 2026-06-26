/**
 * useInsertProof — reusable hook for the client-side merkle_insert flow.
 *
 * Usage:
 *   const { insertProof } = useInsertProof();
 *   const { index } = await insertProof(commitment.toString(), setStatus);
 *
 * Flow:
 *   1. POST /tree/assign  — backend reserves the next index and returns circuit input.
 *   2. Download merkle_insert.wasm + merkle_insert_final.zkey (cached after first load).
 *   3. Run prove() in a Web Worker (UI stays responsive).
 *   4. POST /tree/confirm — backend submits proof on-chain, marks leaf confirmed.
 *
 * The function never throws for proof/confirm failures — it logs a warning and
 * returns the assigned index anyway. The deposit is already safe on-chain; the
 * leaf index is what the frontend needs to show the shielded balance.
 */

import { api } from './api';


// Module-level cache so circuit files are only downloaded once per page load.
let cachedWasm: Uint8Array | null = null;
let cachedZkey: Uint8Array | null = null;

async function loadCircuits(): Promise<{ wasmBytes: Uint8Array; zkeyBytes: Uint8Array }> {
    if (!cachedWasm || !cachedZkey) {
        const [wasmBuf, zkeyBuf] = await Promise.all([
            fetch('/merkle_insert.wasm').then((r) => r.arrayBuffer()),
            fetch('/merkle_insert_final.zkey').then((r) => r.arrayBuffer()),
        ]);
        cachedWasm = new Uint8Array(wasmBuf);
        cachedZkey = new Uint8Array(zkeyBuf);
    }
    return { wasmBytes: cachedWasm!, zkeyBytes: cachedZkey! };
}

function runProofInWorker(
    input: Record<string, unknown>,
    wasmBytes: Uint8Array,
    zkeyBytes: Uint8Array,
): Promise<{ bundle: any }> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('../workers/prover.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (e) => {
            worker.terminate();
            if (e.data.type === 'result') resolve({ bundle: e.data.bundle });
            else reject(new Error(e.data.message));
        };
        worker.onerror = (err) => {
            worker.terminate();
            reject(new Error(err.message));
        };
        // Transfer ownership of ArrayBuffers for zero-copy transfer to worker.
        worker.postMessage({ input, wasmBytes, zkeyBytes },
            [wasmBytes.buffer, zkeyBytes.buffer]);
    });
}

export function useInsertProof() {
    /**
     * Run the full assign → prove → confirm flow for one commitment.
     * @param commitment  Decimal string field element (e.g. commitment.toString())
     * @param setStatus   Optional UI status setter
     * @returns { index } — the leaf index assigned (always returned, even on prove failure)
     */
    const insertProof = async (
        commitment: string,
        setStatus?: (s: string) => void,
    ): Promise<{ index: number }> => {
        // Step 1: assign — fast DB write, returns circuit input
        setStatus?.('Reserving slot in the shielded tree…');
        const { index, circuitInput } = await api.treeAssign(commitment);

        // Step 2: download circuits (cached after first call)
        setStatus?.('Loading ZK circuit…');
        const { wasmBytes, zkeyBytes } = await loadCircuits();

        // Step 3: prove in Web Worker (non-blocking)
        setStatus?.('Generating proof in your browser…');
        let bundle: any;
        try {
            ({ bundle } = await runProofInWorker(circuitInput, wasmBytes, zkeyBytes));
        } catch (proveErr: any) {
            // Non-fatal: return the index so the caller can save the note.
            console.warn('[useInsertProof] proof generation failed (note still saved):', proveErr?.message);
            return { index };
        }

        // Step 4: confirm — backend submits proof on-chain
        setStatus?.('Submitting proof…');
        try {
            await api.treeConfirm(index, {
                proof_a: Array.from(bundle.proof.a),
                proof_b: Array.from(bundle.proof.b),
                proof_c: Array.from(bundle.proof.c),
                public_signals: bundle.publicSignals.map((s: Uint8Array) => Array.from(s)),
            });
        } catch (confirmErr: any) {
            // Non-fatal: index is reserved; the leaf can be confirmed later.
            console.warn('[useInsertProof] confirm failed (note still saved):', confirmErr?.message);
        }

        return { index };
    };

    return { insertProof };
}
