/**
 * Download management routes
 * POST /api/download - Start new download job
 * GET /api/download - List all jobs
 * GET /api/download/:jobId - Get job status
 * DELETE /api/download/:jobId - Cancel/delete job
 * PATCH /api/download/:jobId/rename - Rename job
 * PATCH /api/download/:jobId/location - Update location metadata
 * PATCH /api/download/:jobId/extend - Extend zoom levels
 * POST /api/download/estimate - Estimate download size
 */

import { Router } from 'express';
import { isValidSource, getAvailableSources } from '../../config/sources.js';
import { isValidBounds, isValidZoomRange } from '../../core/TileCalculator.js';

/**
 * Create download router
 * @param {TileForge} tileforge - TileForge instance
 * @returns {Router}
 */
export function createDownloadRouter(tileforge) {
  const router = Router();

  /**
   * POST /api/download
   * Start a new download job
   */
  router.post('/', async (req, res) => {
    try {
      const { name, source, bounds, minZoom, maxZoom } = req.body;

      // Validate required fields
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Name is required'
        });
      }

      if (!source) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Source is required'
        });
      }

      if (!isValidSource(source)) {
        return res.status(400).json({
          error: 'Invalid source',
          message: `Unknown source: ${source}. Available: ${getAvailableSources().map(s => s.id).join(', ')}`
        });
      }

      if (!bounds) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Bounds is required'
        });
      }

      if (!isValidBounds(bounds)) {
        return res.status(400).json({
          error: 'Invalid bounds',
          message: 'Bounds must include valid north, south, east, west coordinates'
        });
      }

      if (minZoom === undefined || maxZoom === undefined) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'minZoom and maxZoom are required'
        });
      }

      if (!isValidZoomRange(minZoom, maxZoom)) {
        return res.status(400).json({
          error: 'Invalid zoom range',
          message: 'Zoom must be between 0-22 and minZoom <= maxZoom'
        });
      }

      // Start download
      const result = await tileforge.download({
        name: name.trim(),
        source,
        bounds,
        minZoom,
        maxZoom
      });

      res.status(201).json({
        message: 'Download started',
        ...result
      });
    } catch (error) {
      res.status(500).json({
        error: 'Download failed',
        message: error.message
      });
    }
  });

  /**
   * GET /api/download
   * List all download jobs
   */
  router.get('/', (req, res) => {
    const jobs = tileforge.getJobs();
    res.json(jobs);
  });

  /**
   * POST /api/download/estimate
   * Estimate download size and time
   */
  router.post('/estimate', (req, res) => {
    try {
      const { bounds, minZoom, maxZoom } = req.body;

      if (!bounds || !isValidBounds(bounds)) {
        return res.status(400).json({
          error: 'Invalid bounds',
          message: 'Bounds must include valid north, south, east, west coordinates'
        });
      }

      if (!isValidZoomRange(minZoom, maxZoom)) {
        return res.status(400).json({
          error: 'Invalid zoom range',
          message: 'Zoom must be between 0-22 and minZoom <= maxZoom'
        });
      }

      const estimate = tileforge.estimate({ bounds, minZoom, maxZoom });
      res.json(estimate);
    } catch (error) {
      res.status(500).json({
        error: 'Estimate failed',
        message: error.message
      });
    }
  });

  /**
   * GET /api/download/:jobId
   * Get job status
   */
  router.get('/:jobId', (req, res) => {
    const { jobId } = req.params;

    const status = tileforge.getJobStatus(jobId);

    if (!status) {
      return res.status(404).json({
        error: 'Job not found',
        message: `No job found with ID: ${jobId}`
      });
    }

    res.json(status);
  });

  /**
   * DELETE /api/download/:jobId
   * Cancel or delete a job
   */
  router.delete('/:jobId', (req, res) => {
    const { jobId } = req.params;
    const deleteTiles = req.query.deleteTiles !== 'false';

    const result = tileforge.deleteJob(jobId, deleteTiles);

    if (!result.deleted) {
      return res.status(404).json({
        error: 'Job not found',
        message: `No job found with ID: ${jobId}`
      });
    }

    res.json({
      message: 'Job deleted',
      jobId,
      tilesDeleted: result.tilesDeleted
    });
  });

  /**
   * PATCH /api/download/:jobId/rename
   * Rename a job
   */
  router.patch('/:jobId/rename', (req, res) => {
    const { jobId } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Name is required'
      });
    }

    const success = tileforge.renameJob(jobId, name.trim());

    if (!success) {
      return res.status(404).json({
        error: 'Job not found',
        message: `No job found with ID: ${jobId}`
      });
    }

    res.json({
      message: 'Job renamed',
      jobId,
      name: name.trim()
    });
  });

  /**
   * PATCH /api/download/:jobId/location
   * Update job location metadata
   */
  router.patch('/:jobId/location', (req, res) => {
    const { jobId } = req.params;
    const { country, city } = req.body;

    const success = tileforge.updateJobLocation(jobId, country || null, city || null);

    if (!success) {
      return res.status(404).json({
        error: 'Job not found',
        message: `No job found with ID: ${jobId}`
      });
    }

    res.json({
      message: 'Location updated',
      jobId,
      country: country || null,
      city: city || null
    });
  });

  /**
   * PATCH /api/download/:jobId/extend
   * Extend zoom levels for existing job
   */
  router.patch('/:jobId/extend', async (req, res) => {
    try {
      const { jobId } = req.params;
      const { minZoom, maxZoom } = req.body;

      if (!isValidZoomRange(minZoom, maxZoom)) {
        return res.status(400).json({
          error: 'Invalid zoom range',
          message: 'Zoom must be between 0-22 and minZoom <= maxZoom'
        });
      }

      const result = await tileforge.extendJob(jobId, { minZoom, maxZoom });

      res.json({
        message: 'Zoom levels extended',
        ...result
      });
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Job not found',
          message: error.message
        });
      }
      res.status(500).json({
        error: 'Extension failed',
        message: error.message
      });
    }
  });

  return router;
}
