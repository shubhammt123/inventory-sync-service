import axios from 'axios';
import * as cron from 'node-cron';
import { MarketplaceBAdapter } from '../adapters/marketplace-b.adapter';
import { inventoryService } from './inventory.service';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis.config';

/**
 * PollingService - Polls Marketplace B API every 5 minutes
 */
export class PollingService {
  private isRunning: boolean = false;
  private cronJob: any | null = null;
  private consecutiveFailures: number = 0;
  private readonly MAX_FAILURES = 3;
  
  private readonly MARKETPLACE_B_API = process.env.MARKETPLACE_B_API || 'https://api.marketplace-b.com';
  private readonly API_KEY = process.env.MARKETPLACE_B_API_KEY || 'test-key';
  
  /**
   * Start polling service
   */
  start(): void {
    // Run every 5 minutes
    this.cronJob = cron.schedule('*/5 * * * *', async () => {
      await this.poll();
    });
    
    logger.info('Polling service started - will run every 5 minutes');
    
    // Run immediately on startup
    this.poll();
  }
  
  /**
   * Stop polling service
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Polling service stopped');
    }
  }
  
  /**
   * Execute polling
   */
  private async poll(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Polling already in progress, skipping this cycle');
      return;
    }
    
    // Circuit breaker check
    if (this.consecutiveFailures >= this.MAX_FAILURES) {
      logger.error('Circuit breaker activated - too many failures', {
        failures: this.consecutiveFailures
      });
      
      // Wait for 15 minutes before trying again
      setTimeout(() => {
        this.consecutiveFailures = 0;
        logger.info('Circuit breaker reset');
      }, 15 * 60 * 1000);
      
      return;
    }
    
    this.isRunning = true;
    
    try {
      logger.info('Starting Marketplace B polling cycle');
      
      // Get last processed timestamp from Redis
      const lastTimestamp = await this.getLastProcessedTimestamp();
      
      // Fetch updates from Marketplace B
      const updates = await this.fetchUpdates(lastTimestamp);
      
      logger.info('Fetched updates from Marketplace B', {
        count: updates.length
      });
      
      if (updates.length === 0) {
        logger.info('No new updates from Marketplace B');
        this.consecutiveFailures = 0;
        return;
      }
      
      // Transform to internal format
      const transformed = MarketplaceBAdapter.transformBatch(updates);
      
      // Process batch
      await inventoryService.processBatch(transformed);
      
      // Update last processed timestamp
      await this.updateLastProcessedTimestamp();
      
      // Reset failure counter on success
      this.consecutiveFailures = 0;
      
      logger.info('Marketplace B polling cycle completed successfully', {
        processed: transformed.length
      });
    } catch (error) {
      this.consecutiveFailures++;
      logger.error('Marketplace B polling failed', {
        error,
        failures: this.consecutiveFailures
      });
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * Fetch updates from Marketplace B API
   */
  private async fetchUpdates(sinceTimestamp: number): Promise<any[]> {
    try {
      const response = await axios.get(`${this.MARKETPLACE_B_API}/inventory/updates`, {
        headers: {
          'Authorization': `Bearer ${this.API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: {
          since: sinceTimestamp,
          limit: 100
        },
        timeout: 10000 // 10 second timeout
      });
      
      return response.data.items || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error('Marketplace B API error', {
          status: error.response?.status,
          message: error.message
        });
      }
      throw error;
    }
  }
  
  /**
   * Get last processed timestamp from Redis
   */
  private async getLastProcessedTimestamp(): Promise<number> {
    const timestamp = await redisClient.get('marketplace_b:last_timestamp');
    return timestamp ? parseInt(timestamp) : Math.floor(Date.now() / 1000) - 3600;
  }
  
  /**
   * Update last processed timestamp in Redis
   */
  private async updateLastProcessedTimestamp(): Promise<void> {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    await redisClient.set('marketplace_b:last_timestamp', currentTimestamp.toString());
  }
  
  /**
   * Manual trigger for polling (useful for testing)
   */
  async triggerManual(): Promise<void> {
    logger.info('Manual polling triggered');
    await this.poll();
  }
}

export const pollingService = new PollingService();