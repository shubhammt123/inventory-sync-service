import { InternalInventory } from '../types/inventory.types';
import { queueService } from './queue.service';
import { LockService } from './lock.service';
import { inventoryRepository } from '../repositories/inventory.repository';
import { logger } from '../utils/logger';

/**
 * InventoryService - Core business logic for inventory updates
 * 
 * Responsibilities:
 * - Orchestrate the update flow
 * - Manage locking to prevent race conditions
 * - Enqueue updates for processing
 * - Handle errors and retries
 */
export class InventoryService {
  private lockService: LockService;
  
  constructor() {
    this.lockService = new LockService();
  }
  
  /**
   * Process inventory update with race condition prevention
   * 
   * Flow:
   * 1. Validate data
   * 2. Add to queue (ensures no data loss if DB is slow)
   * 3. Queue worker will acquire lock and update DB
   */
  async processUpdate(inventory: InternalInventory): Promise<string> {
    try {
      logger.info('Processing inventory update', {
        productId: inventory.productId,
        source: inventory.source
      });
      
      // Add to queue - this ensures reliability
      const jobId = await queueService.addInventoryUpdate({
        inventory,
        retryCount: 0
      });
      
      return jobId;
    } catch (error) {
      logger.error('Failed to process inventory update', { error, inventory });
      throw error;
    }
  }
  
  /**
   * Process batch updates (used by polling service)
   */
  async processBatch(inventories: InternalInventory[]): Promise<void> {
    try {
      logger.info('Processing batch inventory updates', {
        count: inventories.length
      });
      
      const jobData = inventories.map(inventory => ({
        inventory,
        retryCount: 0
      }));
      
      await queueService.addBatch(jobData);
      
      logger.info('Batch queued successfully', { count: inventories.length });
    } catch (error) {
      logger.error('Failed to process batch', { error });
      throw error;
    }
  }
  
  /**
   * Execute the actual database update with locking
   * Called by queue worker
   */
  async executeUpdate(inventory: InternalInventory): Promise<void> {
    // Use lock service to prevent race conditions
    await this.lockService.withLock(
      inventory.productId,
      async () => {
        logger.info('Executing database update with lock', {
          productId: inventory.productId,
          source: inventory.source
        });
        
        // Update database
        await inventoryRepository.upsert(inventory);
        
        logger.info('Database update completed', {
          productId: inventory.productId,
          quantity: inventory.quantity
        });
      },
      {
        ttl: 10000, // 10 seconds lock
        retries: 3,
        retryDelay: 500
      }
    );
  }
  
  /**
   * Get current inventory for a product
   */
  async getInventory(productId: string) {
    return inventoryRepository.getByProductId(productId);
  }
  
  /**
   * Get audit history
   */
  async getAuditHistory(productId: string) {
    return inventoryRepository.getAuditHistory(productId);
  }
  
  /**
   * Get queue statistics
   */
  async getQueueStats() {
    return queueService.getStats();
  }
}

export const inventoryService = new InventoryService();