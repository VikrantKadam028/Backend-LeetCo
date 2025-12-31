const express = require('express');
const DataService = require('../services/dataService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/problem
 * Query by slug or title with optional time range filter
 * 
 * Query params:
 * - slug: problem slug (e.g., "two-sum")
 * - title: problem title (e.g., "Two Sum")
 * - range: time range filter (30, 60, 90, all)
 */
router.get('/problem', (req, res) => {
  const startTime = Date.now();
  
  try {
    const { slug, title, range } = req.query;

    // Validate input
    if (!slug && !title) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Either "slug" or "title" query parameter is required'
      });
    }

    // Validate range if provided
    if (range && !['30', '90', '180', 'all'].includes(range)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid range. Must be one of: 30, 90, 180, all'
      });
    }

    // Query by slug or title
    let result;
    if (slug) {
      result = DataService.queryBySlug(slug, range);
    } else {
      result = DataService.queryByTitle(title, range);
    }

    if (!result) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Problem not found in database'
      });
    }

    const duration = Date.now() - startTime;
    logger.debug(`Query completed in ${duration}ms`);

    res.json(result);
  } catch (error) {
    logger.error('Error in /problem endpoint:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process request'
    });
  }
});

/**
 * GET /api/search
 * Search for problems by partial title match
 * 
 * Query params:
 * - q: search query
 * - limit: maximum number of results (default: 10)
 */
router.get('/search', (req, res) => {
  try {
    const { q, limit } = req.query;

    if (!q) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Query parameter "q" is required'
      });
    }

    const maxLimit = Math.min(parseInt(limit) || 10, 50);
    const results = DataService.searchProblems(q, maxLimit);

    res.json({
      query: q,
      count: results.length,
      results: results
    });
  } catch (error) {
    logger.error('Error in /search endpoint:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process search'
    });
  }
});

/**
 * POST /api/refresh
 * Manually trigger data refresh (admin endpoint)
 */
router.post('/refresh', async (req, res) => {
  try {
    logger.info('Manual data refresh triggered');
    await DataService.updateData();
    
    res.json({
      success: true,
      message: 'Data refreshed successfully',
      status: DataService.getStatus()
    });
  } catch (error) {
    logger.error('Error refreshing data:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to refresh data'
    });
  }
});

module.exports = router;