const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const problemRoutes = require('./routes/problem.routes');
const DataService = require('./services/dataService');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api', problemRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const status = DataService.getStatus();
  res.json({
    status: 'ok',
    dataVersion: status.lastUpdated,
    totalProblems: status.totalProblems,
    totalCompanies: status.totalCompanies
  });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize data on startup
async function initialize() {
  try {
    logger.info('Initializing application...');
    await DataService.initialize();
    logger.info('Data loaded successfully');
    
    // Schedule daily updates at 2 AM
    cron.schedule('0 2 * * *', async () => {
      logger.info('Running scheduled data update...');
      try {
        await DataService.updateData();
        logger.info('Scheduled update completed');
      } catch (error) {
        logger.error('Scheduled update failed:', error);
      }
    });
    
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    logger.error('Failed to initialize:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

initialize();