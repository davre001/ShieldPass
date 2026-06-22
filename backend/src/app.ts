import express from 'express';
import cors from 'cors';
import kycRoutes from './routes/kyc';
import p2pRoutes from './routes/p2p';
import relayerRoutes from './routes/relayer';
import paymentsRoutes from './routes/payments';
import tradesRoutes from './routes/trades';
import walletRoutes from './routes/wallet';

export const app = express();

app.use(cors());
// Capture the raw request body so the payments webhook can verify Paystack's HMAC signature.
app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf.toString('utf8'); } }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'shieldpass-backend' }));

app.use('/kyc', kycRoutes);
app.use('/p2p', p2pRoutes);
app.use('/p2p', tradesRoutes);
app.use('/verify', relayerRoutes);
app.use('/payments', paymentsRoutes);
app.use('/wallet', walletRoutes);
