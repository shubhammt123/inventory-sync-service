import { z } from 'zod';

// Internal unified inventory format
export const InternalInventorySchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(0),
  source: z.enum(['marketplace_a', 'marketplace_b']),
  warehouseId: z.string().optional(),
  updatedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.any()).optional()  // ✅ Fixed
});

export type InternalInventory = z.infer<typeof InternalInventorySchema>;

// Marketplace A webhook payload
export const MarketplaceAPayloadSchema = z.object({
  product_code: z.string(),
  available_stock: z.number().int(),
  timestamp: z.string(),
  warehouse: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional()  // ✅ Fixed
});

export type MarketplaceAPayload = z.infer<typeof MarketplaceAPayloadSchema>;

// Marketplace B API response
export const MarketplaceBPayloadSchema = z.object({
  sku: z.string(),
  qty: z.number().int(),
  location_id: z.string().optional(),
  last_modified: z.number(), // Unix timestamp
  additional_info: z.record(z.string(), z.any()).optional()  // ✅ Fixed
});

export type MarketplaceBPayload = z.infer<typeof MarketplaceBPayloadSchema>;

// Database model
export interface InventoryRecord {
  id: number;
  product_id: string;
  quantity: number;
  source: string;
  warehouse_id: string | null;
  updated_at: Date;
  created_at: Date;
  metadata: Record<string, any> | null;
}

// Queue job data
export interface InventoryJobData {
  inventory: InternalInventory;
  retryCount?: number;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Lock options
export interface LockOptions {
  ttl: number; // milliseconds
  retries: number;
  retryDelay: number; // milliseconds
}