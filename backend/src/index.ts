import 'dotenv/config';
import { app } from './app';
import { expireStaleTrades } from './routes/trades';

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

setInterval(() => {
  expireStaleTrades()
    .then((n) => { if (n > 0) console.log(`[timeout] cancelled ${n} unpaid trade(s)`); })
    .catch((e) => console.error('[timeout] sweep failed', e));
}, 60_000);
