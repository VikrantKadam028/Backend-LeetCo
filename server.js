/**
 * server.js — add these 3 lines to your existing file
 *
 * Lines marked  ← ADD  are new. Everything else is unchanged.
 */

const express          = require('express');
const cors             = require('cors');
const cron             = require('node-cron');
const problemRoutes    = require('./routes/problem.routes');
const complexityRoutes = require('./routes/complexity.routes');  // ← ADD
const DataService      = require('./services/dataService');
const logger           = require('./utils/logger');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.use('/api', problemRoutes);
app.use('/api', complexityRoutes);   // ← ADD  →  exposes POST /api/analyze-complexity

app.get('/api/health', (req, res) => {
  const status = DataService.getStatus();
  res.json({
    status        : 'ok',
    dataVersion   : status.lastUpdated,
    totalProblems : status.totalProblems,
    totalCompanies: status.totalCompanies,
  });
});

app.use((err, req, res, next) => {
  logger.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

async function initialize() {
  try {
    logger.info('Initializing application...');
    await DataService.initialize();
    logger.info('Data loaded successfully');

    cron.schedule('0 2 * * *', async () => {
      logger.info('Running scheduled data update...');
      try { await DataService.updateData(); logger.info('Scheduled update done'); }
      catch (e) { logger.error('Scheduled update failed:', e); }
    });

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`→ POST /api/analyze-complexity  [NEW]`);  // ← ADD
    });
  } catch (error) {
    logger.error('Failed to initialize:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => { logger.info('SIGTERM'); process.exit(0); });
process.on('SIGINT',  () => { logger.info('SIGINT');  process.exit(0); });

initialize();
