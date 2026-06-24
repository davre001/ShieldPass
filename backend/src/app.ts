import express from 'express';
import cors from 'cors';
import kycRoutes from './routes/kyc';
import relayerRoutes from './routes/relayer';
import swapRoutes from './routes/swap';
import treeRoutes from './routes/tree';
import notesRoutes from './routes/notes';
import notificationsRoutes from './routes/notifications';

import walletRoutes from './routes/wallet';

export const app = express();

app.use(cors());
// Capture the raw request body so Lenco webhooks can verify HMAC signatures.
app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf.toString('utf8'); } }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'shieldpass-backend' }));

app.use('/kyc', kycRoutes);
app.use('/swap', swapRoutes);
app.use('/tree', treeRoutes);
app.use('/notes', notesRoutes);
app.use('/notifications', notificationsRoutes);

app.use('/verify', relayerRoutes);
app.use('/wallet', walletRoutes);
