import { Router } from 'express';
import { submitSigned } from '../services/passkey';

const router = Router();

// Gasless submit relay: the browser passkey signs, the backend submits via the Channels relayer.
router.post('/submit', async (req, res) => {
  const { signedXdr } = req.body;
  if (!signedXdr || typeof signedXdr !== 'string') {
    return res.status(400).json({ error: 'signedXdr (string) is required.' });
  }
  try {
    const hash = await submitSigned(signedXdr);
    return res.json({ success: true, hash });
  } catch (e: any) {
    console.error('[wallet] channels submit failed:', e);
    return res.status(502).json({ error: 'Gasless submission failed.', detail: e.message });
  }
});

export default router;
