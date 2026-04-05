import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path from 'path';
import authRoutes   from './routes/auth.js';
import userRoutes   from './routes/users.js';
import recordRoutes from './routes/records.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Security headers ──────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// ── Rate limiting ─────────────────────────────────────────────
// Strict limit on auth endpoints to slow brute-force attempts
const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,  // 15 minutes
  max:              20,               // 20 attempts per window
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: 'Too many requests, please try again later' },
});

// General API limit — generous for polling clients
const apiLimiter = rateLimit({
  windowMs:         60 * 1000,        // 1 minute
  max:              300,              // 300 req/min per IP
  standardHeaders:  true,
  legacyHeaders:    false,
  message:          { error: 'Too many requests, please try again later' },
});

app.use('/api/auth',    authLimiter);
app.use('/api',         apiLimiter);

// ── Static frontend ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/users',   userRoutes);
app.use('/api/records', recordRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// SPA fallback
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(err.status ?? 500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => console.log(`Financial Dashboard API on http://localhost:${PORT}`));

export default app;
