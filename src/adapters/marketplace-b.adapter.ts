import { 
  MarketplaceBPayload, 
  InternalInventory,
  MarketplaceBPayloadSchema 
} from '../types/inventory.types';
import { logger } from '../utils/logger';

export class MarketplaceBAdapter {
  /**
   * Transform Marketplace B payload to internal format
   */
  static transform(payload: unknown): InternalInventory {
    try {
      // Validate input
      const validated = MarketplaceBPayloadSchema.parse(payload);
      
      // Transform to internal format
      const internal: InternalInventory = {
        productId: validated.sku,
        quantity: validated.qty,
        source: 'marketplace_b',
        warehouseId: validated.location_id,
        // Convert Unix timestamp to ISO string
        updatedAt: new Date(validated.last_modified * 1000).toISOString(),
        metadata: validated.additional_info
      };
      
      logger.debug('Marketplace B data transformed', { 
        original: validated, 
        transformed: internal 
      });
      
      return internal;
    } catch (error) {
      logger.error('Marketplace B transformation error', { error, payload });
      throw new Error(`Invalid Marketplace B payload: ${error}`);
    }
  }
  
  /**
   * Transform batch of updates
   */
  static transformBatch(payloads: unknown[]): InternalInventory[] {
    return payloads
      .map(payload => {
        try {
          return this.transform(payload);
        } catch (error) {
          logger.warn('Skipping invalid payload in batch', { error, payload });
          return null;
        }
      })
      .filter((item): item is InternalInventory => item !== null);
  }
}