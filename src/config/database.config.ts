import { Pool } from 'pg';
import { logger } from '../utils/logger';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'inventory_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20, // Maximum number of connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  logger.info('Database connected successfully');
});

pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
});

// Database initialization script
export const initDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        product_id VARCHAR(255) NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity >= 0),
        source VARCHAR(50) NOT NULL,
        warehouse_id VARCHAR(255),
        updated_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB,
        CONSTRAINT unique_product_source UNIQUE (product_id, source)
      );
      
      CREATE INDEX IF NOT EXISTS idx_product_id ON inventory(product_id);
      CREATE INDEX IF NOT EXISTS idx_source ON inventory(source);
      CREATE INDEX IF NOT EXISTS idx_updated_at ON inventory(updated_at);
      
      -- Audit log table
      CREATE TABLE IF NOT EXISTS inventory_audit (
        id SERIAL PRIMARY KEY,
        product_id VARCHAR(255) NOT NULL,
        old_quantity INTEGER,
        new_quantity INTEGER,
        source VARCHAR(50) NOT NULL,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB
      );
      
      CREATE INDEX IF NOT EXISTS idx_audit_product_id ON inventory_audit(product_id);
      CREATE INDEX IF NOT EXISTS idx_audit_changed_at ON inventory_audit(changed_at);
    `);
    
    logger.info('Database tables initialized successfully');
  } catch (error) {
    logger.error('Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
};

export default pool;