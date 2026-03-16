/**
 * Backend API Server
 * Runs on Azure Functions or Azure App Service
 * 
 * Usage (local dev):
 *   npm install
 *   npm run dev
 * 
 * Production: Deploy to Azure Functions or App Service
 */

import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { CosmosClient } from '@azure/cosmos';
import jwt from 'express-jwt';
import jwksRsa from 'jwks-rsa';

dotenv.config();

const app = express();

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORT = process.env.PORT || 3001;
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || 'https://sizer.teeling.ai';
const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT;
const COSMOS_KEY = process.env.COSMOS_KEY;
const COSMOS_DATABASE = process.env.COSMOS_DATABASE || 'ax-calculator';
const COSMOS_CONTAINER = process.env.COSMOS_CONTAINER || 'configurations';

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(cors({
  origin: [
    'https://sizer.teeling.ai',
    'https://dev.teeling.ai',
    'http://localhost:3000',
    'http://localhost:8000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// JWT verification middleware
const checkJwt = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`
  }),
  audience: AUTH0_AUDIENCE,
  issuer: `https://${AUTH0_DOMAIN}/`,
  algorithms: ['RS256']
});

// ============================================================================
// DATABASE SETUP
// ============================================================================

const cosmosClient = new CosmosClient({
  endpoint: COSMOS_ENDPOINT,
  key: COSMOS_KEY
});

let container;

async function initializeDatabase() {
  try {
    const database = cosmosClient.database(COSMOS_DATABASE);
    container = database.container(COSMOS_CONTAINER);
    
    // Test connection
    await container.item('test').read().catch(() => {
      console.log('Container ready for first use');
    });
    
    console.log(`✅ Connected to Cosmos DB: ${COSMOS_DATABASE}/${COSMOS_CONTAINER}`);
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    process.exit(1);
  }
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: container ? 'connected' : 'disconnected'
  });
});

/**
 * Save a new configuration or update existing
 * POST /api/configs
 * 
 * Body: {
 *   metadata: { name, description, ... },
 *   uiState: { ... },
 *   calculation: { ... },
 *   state: { ... }
 * }
 * 
 * Response: { configId, success: true }
 */
app.post('/api/configs', checkJwt, async (req, res) => {
  try {
    const userId = req.auth.sub;
    const config = req.body;

    if (!config.metadata || !config.metadata.name) {
      return res.status(400).json({ error: 'Configuration must have a name' });
    }

    // Generate unique ID
    const configId = `${userId}#${Date.now()}#${Math.random().toString(36).substr(2, 9)}`;

    // Build document for Cosmos DB
    const document = {
      id: configId,
      userId,
      ...config,
      serverCreatedDate: new Date().toISOString()
    };

    // Save to Cosmos DB
    const { resource } = await container.items.create(document);

    console.log(`✅ Saved config for user ${userId}: ${configId}`);
    res.status(201).json({
      success: true,
      configId: resource.id,
      message: 'Configuration saved'
    });
  } catch (error) {
    console.error('❌ Error saving configuration:', error);
    res.status(500).json({
      error: 'Failed to save configuration',
      details: error.message
    });
  }
});

/**
 * Retrieve all configurations for authenticated user
 * GET /api/configs
 * 
 * Response: [ { id, metadata, ... }, ... ]
 */
app.get('/api/configs', checkJwt, async (req, res) => {
  try {
    const userId = req.auth.sub;

    // Query configurations for this user
    const query = `
      SELECT * FROM c 
      WHERE c.userId = '${userId}' 
      ORDER BY c.metadata.lastModified DESC
    `;

    const { resources } = await container.items
      .query(query)
      .fetchAll();

    console.log(`✅ Retrieved ${resources.length} configs for user ${userId}`);
    res.json(resources);
  } catch (error) {
    console.error('❌ Error retrieving configurations:', error);
    res.status(500).json({
      error: 'Failed to retrieve configurations',
      details: error.message
    });
  }
});

/**
 * Retrieve a single configuration
 * GET /api/configs/:configId
 * 
 * Response: { id, metadata, ... }
 */
app.get('/api/configs/:configId', checkJwt, async (req, res) => {
  try {
    const userId = req.auth.sub;
    const configId = req.params.configId;

    // Verify ownership
    const { resource } = await container.item(configId).read();

    if (resource.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    console.log(`✅ Retrieved config ${configId}`);
    res.json(resource);
  } catch (error) {
    console.error('❌ Error retrieving configuration:', error);
    res.status(404).json({
      error: 'Configuration not found',
      details: error.message
    });
  }
});

/**
 * Update a configuration
 * PUT /api/configs/:configId
 * 
 * Body: { metadata, uiState, calculation, ... }
 * Response: { success: true, configId }
 */
app.put('/api/configs/:configId', checkJwt, async (req, res) => {
  try {
    const userId = req.auth.sub;
    const configId = req.params.configId;

    // Get existing to verify ownership
    const { resource: existing } = await container.item(configId).read();

    if (existing.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update lastModified
    const updated = {
      ...existing,
      ...req.body,
      metadata: {
        ...existing.metadata,
        ...req.body.metadata,
        lastModified: new Date().toISOString()
      }
    };

    // Replace in Cosmos
    await container.item(configId).replace(updated);

    console.log(`✅ Updated config ${configId}`);
    res.json({
      success: true,
      configId,
      message: 'Configuration updated'
    });
  } catch (error) {
    console.error('❌ Error updating configuration:', error);
    res.status(500).json({
      error: 'Failed to update configuration',
      details: error.message
    });
  }
});

/**
 * Delete a configuration
 * DELETE /api/configs/:configId
 * 
 * Response: { success: true }
 */
app.delete('/api/configs/:configId', checkJwt, async (req, res) => {
  try {
    const userId = req.auth.sub;
    const configId = req.params.configId;

    // Get to verify ownership
    const { resource } = await container.item(configId).read();

    if (resource.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete
    await container.item(configId).delete();

    console.log(`✅ Deleted config ${configId}`);
    res.json({
      success: true,
      message: 'Configuration deleted'
    });
  } catch (error) {
    console.error('❌ Error deleting configuration:', error);
    res.status(500).json({
      error: 'Failed to delete configuration',
      details: error.message
    });
  }
});

/**
 * Get user profile info
 * GET /api/user
 * Returns: { userId, email, nickname, ... }
 */
app.get('/api/user', checkJwt, (req, res) => {
  try {
    res.json({
      userId: req.auth.sub,
      email: req.auth.email,
      nickname: req.auth.nickname || 'User'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err, req, res, next) => {
  console.error('🔴 Unhandled error:', err);

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
  }

  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function start() {
  await initializeDatabase();

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Auth0 Domain: ${AUTH0_DOMAIN}`);
    console.log(`📍 Cosmos DB: ${COSMOS_DATABASE}/${COSMOS_CONTAINER}`);
  });
}

start().catch(error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

export default app;
