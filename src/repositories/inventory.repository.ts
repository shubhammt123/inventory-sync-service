import pool from '../config/database.config';
import { InternalInventory, InventoryRecord } from '../types/inventory.types';
import { logger } from '../utils/logger';

/**
 * InventoryRepository - Database operations for inventory
 * 
 * Features:
 * - UPSERT operations (Insert or Update)
 * - Audit trail logging
 * - Transaction support
 * - Row-level locking for additional safety
 */
export class InventoryRepository {
  /**
   * Upsert inventory record
   * Uses PostgreSQL's ON CONFLICT to handle duplicates
   */
  async upsert(inventory: InternalInventory): Promise<InventoryRecord> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get old quantity for audit
      const oldRecord = await client.query<InventoryRecord>(
        'SELECT * FROM inventory WHERE product_id = $1 AND source = $2 FOR UPDATE',
        [inventory.productId, inventory.source]
      );
      
      const oldQuantity = oldRecord.rows[0]?.quantity || null;
      
      // Upsert inventory
      const result = await client.query<InventoryRecord>(
        `
        INSERT INTO inventory (product_id, quantity, source, warehouse_id, updated_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (product_id, source)
        DO UPDATE SET
          quantity = EXCLUDED.quantity,
          warehouse_id = EXCLUDED.warehouse_id,
          updated_at = EXCLUDED.updated_at,
          metadata = EXCLUDED.metadata
        RETURNING *
        `,
        [
          inventory.productId,
          inventory.quantity,
          inventory.source,
          inventory.warehouseId || null,
          inventory.updatedAt,
          inventory.metadata || null
        ]
      );
      
      // Create audit log
      await client.query(
        `
        INSERT INTO inventory_audit (product_id, old_quantity, new_quantity, source, metadata)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          inventory.productId,
          oldQuantity,
          inventory.quantity,
          inventory.source,
          { ...inventory.metadata, warehouse_id: inventory.warehouseId }
        ]
      );
      
      await client.query('COMMIT');
      
      logger.info('Inventory upserted successfully', {
        productId: inventory.productId,
        source: inventory.source,
        oldQuantity,
        newQuantity: inventory.quantity
      });
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Inventory upsert failed', { error, inventory });
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get current inventory for a product
   */
  async getByProductId(productId: string): Promise<InventoryRecord[]> {
    const result = await pool.query<InventoryRecord>(
      'SELECT * FROM inventory WHERE product_id = $1 ORDER BY source',
      [productId]
    );
    
    return result.rows;
  }
  
  /**
   * Get inventory by source
   */
  async getBySource(source: string, limit: number = 100): Promise<InventoryRecord[]> {
    const result = await pool.query<InventoryRecord>(
      'SELECT * FROM inventory WHERE source = $1 ORDER BY updated_at DESC LIMIT $2',
      [source, limit]
    );
    
    return result.rows;
  }
  
  /**
   * Get audit history for a product
   */
  async getAuditHistory(productId: string, limit: number = 50) {
    const result = await pool.query(
      `
      SELECT * FROM inventory_audit 
      WHERE product_id = $1 
      ORDER BY changed_at DESC 
      LIMIT $2
      `,
      [productId, limit]
    );
    
    return result.rows;
  }
  
  /**
   * Get products with low stock
   */
  async getLowStock(threshold: number = 10): Promise<InventoryRecord[]> {
    const result = await pool.query<InventoryRecord>(
      'SELECT * FROM inventory WHERE quantity <= $1 ORDER BY quantity ASC',
      [threshold]
    );
    
    return result.rows;
  }
  
  /**
   * Batch upsert for polling service
   */
  async batchUpsert(inventories: InternalInventory[]): Promise<number> {
    let successCount = 0;
    
    for (const inventory of inventories) {
      try {
        await this.upsert(inventory);
        successCount++;
      } catch (error) {
        logger.error('Batch upsert item failed', { error, inventory });
        // Continue with other items
      }
    }
    
    logger.info('Batch upsert completed', {
      total: inventories.length,
      success: successCount,
      failed: inventories.length - successCount
    });
    
    return successCount;
  }
}

export const inventoryRepository = new InventoryRepository();