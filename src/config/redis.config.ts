import Redis from 'ioredis';
import { logger } from '../utils/logger';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null, // Required for BullMQ
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
};

// Create Redis connection for BullMQ
export const createRedisConnection = () => {
  const connection = new Redis(redisConfig);
  
  connection.on('connect', () => {
    logger.info('Redis connected successfully');
  });
  
  connection.on('error', (err) => {
    logger.error('Redis connection error:', err);
  });
  
  return connection;
};

// Separate connection for Redlock
export const redisClient = new Redis(redisConfig);

export default redisConfig;