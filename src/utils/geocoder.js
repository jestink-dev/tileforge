/**
 * Reverse geocoding utility to get country and city from coordinates
 * Uses Nominatim API (OpenStreetMap) - free, no API key required
 */

import axios from 'axios';
import { createLogger } from './logger.js';

const NOMINATIM_API = 'https://nominatim.openstreetmap.org/reverse';

/**
 * Get country and city from geographic bounds
 * Uses the center point of the bounding box
 * @param {Object} bounds - Geographic bounding box {north, south, east, west}
 * @param {object} options - Options
 * @param {string} options.logLevel - Log level
 * @returns {Promise<{country: string|null, city: string|null}>}
 */
export async function getLocationFromBounds(bounds, options = {}) {
  const logger = createLogger(options.logLevel || 'info');

  try {
    // Calculate center point
    const lat = (bounds.north + bounds.south) / 2;
    const lon = (bounds.east + bounds.west) / 2;

    logger.debug(`Reverse geocoding coordinates: ${lat}, ${lon}`);

    const response = await axios.get(NOMINATIM_API, {
      params: {
        lat,
        lon,
        format: 'json',
        addressdetails: 1,
        zoom: 10 // City level
      },
      headers: {
        'User-Agent': 'TileForge/1.0 (https://github.com/YOUR_USERNAME/tileforge)'
      },
      timeout: 5000 // 5 second timeout
    });

    if (response.data && response.data.address) {
      const address = response.data.address;

      // Extract country
      const country = address.country || null;

      // Extract city (try multiple fields in order of preference)
      const city = address.city
        || address.town
        || address.village
        || address.municipality
        || address.county
        || address.state
        || null;

      logger.debug(`Geocoding result: ${city}, ${country}`);

      return { country, city };
    }

    logger.warn('Geocoding returned no address data');
    return { country: null, city: null };

  } catch (error) {
    // Don't fail the download if geocoding fails
    logger.debug('Geocoding error:', error.message);
    return { country: null, city: null };
  }
}

/**
 * Validate and clean location strings
 * @param {string} str - String to clean
 * @returns {string|null}
 */
export function cleanLocationString(str) {
  if (!str) return null;
  const cleaned = str.trim();
  return cleaned.length > 0 ? cleaned : null;
}
