import { 
  MarketplaceAPayload, 
  InternalInventory,
  MarketplaceAPayloadSchema 
} from '../types/inventory.types';
import { logger } from '../utils/logger';

export class MarketplaceAAdapter {
  /**
   * Transform Marketplace A payload to internal format
   */
  static transform(payload: unknown): InternalInventory {
    try {
      // Validate input
      const validated = MarketplaceAPayloadSchema.parse(payload);
      
      // Transform to internal format
      const internal: InternalInventory = {
        productId: validated.product_code,
        quantity: validated.available_stock,
        source: 'marketplace_a',
        warehouseId: validated.warehouse,
        updatedAt: validated.timestamp,
        metadata: validated.metadata
      };
      
      logger.debug('Marketplace A data transformed', { 
        original: validated, 
        transformed: internal 
      });
      
      return internal;
    } catch (error) {
      logger.error('Marketplace A transformation error', { error, payload });
      throw new Error(`Invalid Marketplace A payload: ${error}`);
    }
  }
  
  /**
   * Validate webhook signature (HMAC)
   */
  static validateSignature(payload: string, signature: string): boolean {
    const crypto = require('crypto');
    const secret = process.env.MARKETPLACE_A_SECRET || 'secret';
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}