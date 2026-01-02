// @ts-ignore
import Redlock, { Lock } from 'redlock';
import { redisClient } from '../config/redis.config';
import { logger } from '../utils/logger';
import { LockOptions } from '../types/inventory.types';

/**
 * LockService - Prevents race conditions using Redlock algorithm
 */
export class LockService {
  private redlock: any; // Use any to bypass type checking
  
  private defaultOptions: LockOptions = {
    ttl: 10000,
    retries: 5,
    retryDelay: 200
  };
  
  constructor() {
    this.redlock = new Redlock(
      [redisClient],
      {
        driftFactor: 0.01,
        retryCount: this.defaultOptions.retries,
        retryDelay: this.defaultOptions.retryDelay,
        retryJitter: 100,
        automaticExtensionThreshold: 500
      }
    );
    
    this.redlock.on('error', (error: Error) => {
      logger.error('Redlock error', { error });
    });
  }
  
  async acquireLock(
    productId: string, 
    options: Partial<LockOptions> = {}
  ): Promise<Lock> {
    const opts = { ...this.defaultOptions, ...options };
    const lockKey = `lock:inventory:${productId}`;
    
    try {
      logger.debug('Attempting to acquire lock', { productId, lockKey });
      
      const lock = await this.redlock.acquire([lockKey], opts.ttl);
      
      logger.debug('Lock acquired successfully', { productId, lockKey });
      
      return lock;
    } catch (error) {
      logger.error('Failed to acquire lock', { 
        productId, 
        lockKey, 
        error 
      });
      throw new Error(`Unable to acquire lock for product ${productId}`);
    }
  }
  
  async releaseLock(lock: Lock): Promise<void> {
    try {
      await lock.release();
      logger.debug('Lock released successfully', { 
        resources: lock.resources 
      });
    } catch (error) {
      logger.error('Failed to release lock', { error, lock });
    }
  }
  
  async withLock<T>(
    productId: string,
    fn: () => Promise<T>,
    options: Partial<LockOptions> = {}
  ): Promise<T> {
    const lock = await this.acquireLock(productId, options);
    
    try {
      const result = await fn();
      return result;
    } finally {
      await this.releaseLock(lock);
    }
  }
  
  async isLocked(productId: string): Promise<boolean> {
    const lockKey = `lock:inventory:${productId}`;
    const exists = await redisClient.exists(lockKey);
    return exists === 1;
  }
}