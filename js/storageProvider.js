/**
 * Storage Provider
 * Handles all API calls to the backend for configuration persistence
 */

import { getAccessToken, isAuthenticated } from './auth.js';

const API_BASE = import.meta.env.VITE_API_URL || 'https://dev.teeling.ai/api';

/**
 * Save a configuration to the backend
 * @param {Object} config - The serialized configuration object
 * @returns {Promise<Object>} Response with configId
 */
export async function saveConfiguration(config) {
  if (!await isAuthenticated()) {
    throw new Error('User must be authenticated to save configurations');
  }

  try {
    const token = await getAccessToken();

    const response = await fetch(`${API_BASE}/configs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to save configuration (${response.status})`);
    }

    const result = await response.json();
    console.log('✅ Configuration saved:', result.configId);
    return result;
  } catch (error) {
    console.error('❌ Error saving configuration:', error);
    throw error;
  }
}

/**
 * Load all configurations for the authenticated user
 * @returns {Promise<Array>} List of configurations
 */
export async function loadConfigurations() {
  if (!await isAuthenticated()) {
    return [];
  }

  try {
    const token = await getAccessToken();

    const response = await fetch(`${API_BASE}/configs`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to load configurations (${response.status})`);
    }

    const configs = await response.json();
    console.log(`✅ Loaded ${configs.length} configurations`);
    return configs;
  } catch (error) {
    console.error('❌ Error loading configurations:', error);
    throw error;
  }
}

/**
 * Load a single configuration by ID
 * @param {string} configId - Configuration ID
 * @returns {Promise<Object>} The configuration
 */
export async function loadConfiguration(configId) {
  if (!await isAuthenticated()) {
    throw new Error('User must be authenticated');
  }

  try {
    const token = await getAccessToken();

    const response = await fetch(`${API_BASE}/configs/${configId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to load configuration (${response.status})`);
    }

    const config = await response.json();
    console.log('✅ Configuration loaded:', configId);
    return config;
  } catch (error) {
    console.error('❌ Error loading configuration:', error);
    throw error;
  }
}

/**
 * Update an existing configuration
 * @param {string} configId - Configuration ID
 * @param {Object} config - Updated configuration object
 * @returns {Promise<Object>} Response
 */
export async function updateConfiguration(configId, config) {
  if (!await isAuthenticated()) {
    throw new Error('User must be authenticated');
  }

  try {
    const token = await getAccessToken();

    const response = await fetch(`${API_BASE}/configs/${configId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(config)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Failed to update configuration (${response.status})`);
    }

    const result = await response.json();
    console.log('✅ Configuration updated:', configId);
    return result;
  } catch (error) {
    console.error('❌ Error updating configuration:', error);
    throw error;
  }
}

/**
 * Delete a configuration
 * @param {string} configId - Configuration ID
 * @returns {Promise<Object>} Response
 */
export async function deleteConfiguration(configId) {
  if (!await isAuthenticated()) {
    throw new Error('User must be authenticated');
  }

  try {
    const token = await getAccessToken();

    const response = await fetch(`${API_BASE}/configs/${configId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to delete configuration (${response.status})`);
    }

    console.log('✅ Configuration deleted:', configId);
    return { success: true };
  } catch (error) {
    console.error('❌ Error deleting configuration:', error);
    throw error;
  }
}

/**
 * Health check for the API
 * @returns {Promise<boolean>} True if API is available
 */
export async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET'
    });
    return response.ok;
  } catch (error) {
    console.warn('API health check failed:', error);
    return false;
  }
}
