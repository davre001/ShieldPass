import express from 'express';
import cors from 'cors';
import kycRoutes from './routes/kyc';
import relayerRoutes from './routes/relayer';
import swapRoutes from './routes/swap';
import banksRoutes from './routes/banks';
import walletRoutes from './routes/wallet';

export const app = express();

app.use(cors());
// Capture the raw request body so the payments webhook can verify Paystack's HMAC signature.
app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf.toString('utf8'); } }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'shieldpass-backend' }));

app.use('/kyc', kycRoutes);
app.use('/swap', swapRoutes);
app.use('/banks', banksRoutes);
app.use('/verify', relayerRoutes);
app.use('/wallet', walletRoutes);
