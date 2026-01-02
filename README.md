# Unified Inventory Synchronizer Service

## 1. System Architecture
This service is designed using a **Event-Driven, Queue-Based Architecture** to ensure high reliability, scalability, and data consistency when synchronizing inventory from multiple disparate sources.


## 2. Key Design Decisions

### **2.1. Ingestion Strategy: Push vs. Pull**
-   **Marketplace A (Push/Webhook)**: Implemented an Express endpoint (`/webhooks/marketplace-a`) that validates HMAC signatures for security before accepting data. ensuring we only process authentic requests.
-   **Marketplace B (Pull/Polling)**: Implemented a background service (`PollingService`) using `node-cron`.
    -   *Optimization*: Added a **Circuit Breaker** pattern to prevent cascading failures if Marketplace B is down.
    -   *Optimization*: Uses `since` timestamp (stored in Redis) to fetch only incremental updates (delta sync) rather than full dumps.

### **2.2. Data Standardization (Adapter Pattern)**
-   Used the **Adapter API Pattern** to decouple external schemas from internal domain logic.
-   Each marketplace has a dedicated adapter (`MarketplaceAAdapter`, `MarketplaceBAdapter`) that transforms incoming payloads efficiently into a strict `InternalInventory` TypeScript type (validated with **Zod**).
-   **Benefit**: Adding Marketplace C in the future only requires a new Adapter, without touching the core logic.

### **2.3. Reliability & Scalability (Queue-Based Load Leveling)**
-   **Problem**: Direct database writes during webhooks can cause timeouts if the DB is under load or down.
-   **Solution**: Decoupled ingestion from processing using **BullMQ (Redis)**.
    -   Endpoints return `202 Accepted` immediately after enqueueing.
    -   Workers process jobs asynchronously.
    -   **Retry Mechanism**: Transient failures (e.g., DB blips) are automatically retried with exponential backoff.

### **2.4. Race Condition Handling (Distributed Locking)**
-   **Problem**: If two webhooks for Product X arrive at `t=0` and `t=1ms`, parallel workers might overwrite the newer data with older data (Last-Write-Wins issue).
-   **Solution**: Implemented **Redlock** (Distributed Lock with Redis).
    -   Before updating `Product X`, the worker must acquire `lock:inventory:{productId}`.
    -   This enforces **Linearizability** for operations on the same product, while allowing full parallelism for different products.
---

## 3. How to Test

### Prerequisites
-   Docker & Docker Compose (running Redis & Postgres)
-   Node.js v18+

### Setup
1.  Start infrastructure:
    ```bash
    docker-compose up -d
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the Service (API):
    ```bash
    npm run dev
    ```
4.  Start the Worker (in a separate terminal):
    ```bash
    npm run worker
    ```

### Running Tests
A comprehensive test script is provided in `test-inventory.ps1`.
```powershell
./test-inventory.ps1
```
This script will:
1.  Check API Health.
2.  Send a signed Webhook payload (Marketplace A).
3.  Trigger a manual Poll cycle (Marketplace B).
4.  Verify the Database state for the updated product.
