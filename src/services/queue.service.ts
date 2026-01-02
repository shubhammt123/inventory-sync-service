import { Queue, QueueEvents } from 'bullmq';
import { createRedisConnection } from '../config/redis.config';
import { InventoryJobData } from '../types/inventory.types';
import { logger } from '../utils/logger';

/**
 * QueueService - Manages BullMQ queue for reliable inventory updates
 * 
 * Key Features:
 * - Redis-backed queue for persistence
 * - Automatic retry with exponential backoff
 * - Priority queue support
 * - Dead letter queue for failed jobs
 */
export class QueueService {
  private queue: Queue<InventoryJobData>;
  private queueEvents: QueueEvents;
  
  constructor() {
    const connection = createRedisConnection();
    
    this.queue = new Queue<InventoryJobData>('inventory-updates', {
      connection,
      defaultJobOptions: {
        attempts: 5, // Retry up to 5 times
        backoff: {
          type: 'exponential',
          delay: 2000 // Start with 2 seconds
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 1000 // Keep last 1000 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600 // Keep failed jobs for 7 days
        }
      }
    });
    
    // Monitor queue events
    this.queueEvents = new QueueEvents('inventory-updates', { connection });
    this.setupEventListeners();
  }
  
  /**
   * Add inventory update to queue
   */
  async addInventoryUpdate(
    jobData: InventoryJobData,
    priority: number = 0
  ): Promise<string> {
    try {
      const job = await this.queue.add(
        'process-inventory-update',
        jobData,
        {
          priority,
          jobId: `${jobData.inventory.source}-${jobData.inventory.productId}-${Date.now()}`
        }
      );
      
      logger.info('Job added to queue', {
        jobId: job.id,
        productId: jobData.inventory.productId,
        source: jobData.inventory.source
      });
      
      return job.id!;
    } catch (error) {
      logger.error('Failed to add job to queue', { error, jobData });
      throw error;
    }
  }
  
  /**
   * Add multiple updates as batch
   */
  async addBatch(updates: InventoryJobData[]): Promise<void> {
    try {
      const jobs = updates.map((data, index) => ({
        name: 'process-inventory-update',
        data,
        opts: {
          jobId: `${data.inventory.source}-${data.inventory.productId}-${Date.now()}-${index}`
        }
      }));
      
      await this.queue.addBulk(jobs);
      
      logger.info('Batch jobs added to queue', { count: updates.length });
    } catch (error) {
      logger.error('Failed to add batch to queue', { error });
      throw error;
    }
  }
  
  /**
   * Get queue statistics
   */
  async getStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount()
    ]);
    
    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed
    };
  }
  
  /**
   * Setup event listeners for monitoring
   */
  private setupEventListeners(): void {
    this.queueEvents.on('completed', ({ jobId, returnvalue }) => {
      logger.info('Job completed', { jobId, returnvalue });
    });
    
    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      logger.error('Job failed', { jobId, failedReason });
    });
    
    this.queueEvents.on('progress', ({ jobId, data }) => {
      logger.debug('Job progress', { jobId, progress: data });
    });
  }
  
  /**
   * Graceful shutdown
   */
  async close(): Promise<void> {
    await this.queue.close();
    await this.queueEvents.close();
    logger.info('Queue service closed');
  }
}

export const queueService = new QueueService();