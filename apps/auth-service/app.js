const { api, logger, client: promClient } = require('../common/observability');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8082;

app.use(cors());
app.use(express.json());

// Global HTTP request logger middleware
app.use((req, res, next) => {
  logger.info(`Auth-Service received request: ${req.method} ${req.url}`);
  next();
});

// Verify token endpoint
app.post('/verify', (req, res) => {
  const { token } = req.body || {};
  logger.info(`Verifying token: ${token}`);
  
  if (token === 'lgtm-secret-token') {
    logger.info('Token verification successful.');
    return res.json({ verified: true });
  }
  
  logger.warn('Invalid or missing token.');
  return res.status(401).json({ verified: false, error: 'Unauthorized: Invalid token' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'auth-service' });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

app.listen(PORT, () => {
  logger.info(`Auth service listening on port ${PORT}`);
});
