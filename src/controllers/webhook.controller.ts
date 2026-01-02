import { Request, Response } from 'express';
import { MarketplaceAAdapter } from '../adapters/marketplace-a.adapter';
import { inventoryService } from '../services/inventory.service';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types/inventory.types';

/**
 * WebhookController - Handles incoming webhooks from Marketplace A
 */
export class WebhookController {
  /**
   * Handle Marketplace A webhook
   */
  async handleMarketplaceA(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Received webhook from Marketplace A', {
        body: req.body
      });
      
      // Validate signature
      const signature = req.headers['x-marketplace-signature'] as string;
      const rawBody = JSON.stringify(req.body);
      
      if (!signature || !MarketplaceAAdapter.validateSignature(rawBody, signature)) {
        logger.warn('Invalid webhook signature', { signature });
        res.status(401).json({
          success: false,
          error: 'Invalid signature'
        } as ApiResponse);
        return;
      }
      
      // Transform data
      const internalInventory = MarketplaceAAdapter.transform(req.body);
      
      // Process update
      const jobId = await inventoryService.processUpdate(internalInventory);
      
      // Respond immediately (webhook acknowledgment)
      res.status(202).json({
        success: true,
        message: 'Update queued for processing',
        data: { jobId, productId: internalInventory.productId }
      } as ApiResponse);
      
      logger.info('Webhook processed successfully', {
        productId: internalInventory.productId,
        jobId
      });
    } catch (error) {
      logger.error('Webhook processing failed', { error });
      
      res.status(500).json({
        success: false,
        error: 'Failed to process webhook'
      } as ApiResponse);
    }
  }
  
  /**
   * Health check endpoint
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const stats = await inventoryService.getQueueStats();
      
      res.status(200).json({
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          queue: stats
        }
      } as ApiResponse);
    } catch (error) {
      res.status(503).json({
        success: false,
        error: 'Service unhealthy'
      } as ApiResponse);
    }
  }
  
  /**
   * Get inventory by product ID
   */
  async getInventory(req: Request, res: Response): Promise<void> {
    try {
      const { productId } = req.params;
      
      const inventory = await inventoryService.getInventory(productId);
      
      res.status(200).json({
        success: true,
        data: inventory
      } as ApiResponse);
    } catch (error) {
      logger.error('Failed to get inventory', { error });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve inventory'
      } as ApiResponse);
    }
  }
  
  /**
   * Get audit history
   */
  async getAuditHistory(req: Request, res: Response): Promise<void> {
    try {
      const { productId } = req.params;
      
      const history = await inventoryService.getAuditHistory(productId);
      
      res.status(200).json({
        success: true,
        data: history
      } as ApiResponse);
    } catch (error) {
      logger.error('Failed to get audit history', { error });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve audit history'
      } as ApiResponse);
    }
  }
}

export const webhookController = new WebhookController();