import express from 'express';
import cors from 'cors';
import kycRoutes from './routes/kyc';
import p2pRoutes from './routes/p2p';
import relayerRoutes from './routes/relayer';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Basic health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'shieldpass-backend' });
});

// Routes
app.use('/kyc', kycRoutes);
app.use('/p2p', p2pRoutes);
app.use('/verify', relayerRoutes);

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
