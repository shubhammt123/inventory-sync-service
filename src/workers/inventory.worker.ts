import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../config/redis.config';
import { inventoryService } from '../services/inventory.service';
import { InventoryJobData } from '../types/inventory.types';
import { logger } from '../utils/logger';

/**
 * InventoryWorker - Processes inventory updates from the queue
 * 
 * Features:
 * - Concurrent processing (configurable)
 * - Automatic retry on failure
 * - Progress reporting
 * - Graceful shutdown
 */
class InventoryWorker {
  private worker: Worker<InventoryJobData>;
  
  constructor() {
    const connection = createRedisConnection();
    
    this.worker = new Worker<InventoryJobData>(
      'inventory-updates',
      async (job: Job<InventoryJobData>) => {
        return this.processJob(job);
      },
      {
        connection,
        concurrency: 5, // Process 5 jobs concurrently
        limiter: {
          max: 100, // Max 100 jobs
          duration: 1000 // per second
        }
      }
    );
    
    this.setupEventListeners();
  }
  
  /**
   * Process a single job
   */
  private async processJob(job: Job<InventoryJobData>): Promise<any> {
    const { inventory, retryCount = 0 } = job.data;
    
    logger.info('Processing job', {
      jobId: job.id,
      productId: inventory.productId,
      source: inventory.source,
      attempt: job.attemptsMade + 1,
      retryCount
    });
    
    try {
      // Update progress
      await job.updateProgress(10);
      
      // Execute the update with locking
      await inventoryService.executeUpdate(inventory);
      
      // Update progress
      await job.updateProgress(100);
      
      logger.info('Job completed successfully', {
        jobId: job.id,
        productId: inventory.productId
      });
      
      return {
        success: true,
        productId: inventory.productId,
        quantity: inventory.quantity
      };
    } catch (error) {
      logger.error('Job processing failed', {
        jobId: job.id,
        productId: inventory.productId,
        error,
        attempt: job.attemptsMade + 1
      });
      
      // Will trigger automatic retry
      throw error;
    }
  }
  
  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.worker.on('completed', (job) => {
      logger.info('Worker completed job', {
        jobId: job.id,
        duration: Date.now() - job.timestamp
      });
    });
    
    this.worker.on('failed', (job, error) => {
      logger.error('Worker job failed', {
        jobId: job?.id,
        error: error.message,
        attempts: job?.attemptsMade
      });
    });
    
    this.worker.on('error', (error) => {
      logger.error('Worker error', { error });
    });
    
    this.worker.on('stalled', (jobId) => {
      logger.warn('Job stalled', { jobId });
    });
  }
  
  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    logger.info('Shutting down worker...');
    await this.worker.close();
    logger.info('Worker shut down complete');
  }
}

// Initialize worker
const worker = new InventoryWorker();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await worker.close();
  process.exit(0);
});

logger.info('Inventory worker started');

export default worker;