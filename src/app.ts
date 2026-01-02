import express, { Express, Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { webhookController } from './controllers/webhook.controller';
import { pollingService } from './services/polling.service';
import { initDatabase } from './config/database.config';
import logger  from './utils/logger';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  next();
});

// Routes
app.get('/health', (req, res) => webhookController.healthCheck(req, res));

// Marketplace A webhook endpoint
app.post('/webhooks/marketplace-a', (req, res) => 
  webhookController.handleMarketplaceA(req, res)
);

// Inventory query endpoints
app.get('/inventory/:productId', (req, res) => 
  webhookController.getInventory(req, res)
);

app.get('/inventory/:productId/audit', (req, res) => 
  webhookController.getAuditHistory(req, res)
);

// Manual polling trigger (for testing/debugging)
app.post('/trigger-poll', async (req, res) => {
  try {
    await pollingService.triggerManual();
    res.json({ success: true, message: 'Polling triggered' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Polling failed' });
  }
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', { error: err });
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Initialize and start server
const startServer = async () => {
  try {
    // Initialize database
    await initDatabase();
    logger.info('Database initialized');
    
    // Start polling service
    pollingService.start();
    logger.info('Polling service started');
    
    // Start Express server
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info('Service ready to accept requests');
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');
  
  pollingService.stop();
  
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the server
startServer();

export default app;