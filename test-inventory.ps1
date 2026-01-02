# inventory-test.ps1

function Test-InventoryService {
    $baseUrl = "http://localhost:3000"
    
    Write-Host "1. Checking Health..." -ForegroundColor Cyan
    try {
        $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get
        Write-Host "Status: $($health.data.status)" -ForegroundColor Green
    } catch {
        Write-Host "Health Check Failed: $_" -ForegroundColor Red
        return
    }
    
    Write-Host "`n2. Testing Webhook (Marketplace A)..." -ForegroundColor Cyan
    
    # Use a pre-formatted compact JSON string to ensure consistency between client and server
    # The server calculates signature on JSON.stringify(req.body)
    # sending compact JSON ensures that what we sign matches what the server signs (mostly)
    $jsonBody = '{"available_stock":50,"product_code":"PROD-ABC-123","timestamp":"2026-01-01T10:00:00Z","warehouse":"WH-NY-01"}'
    
    # Generate HMAC
    $secret = "secret"
    $hmac = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes($secret))
    $hashBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($jsonBody))
    $signature = [BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()

    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/webhooks/marketplace-a" `
            -Method Post `
            -Body $jsonBody `
            -Headers @{ "Content-Type" = "application/json"; "x-marketplace-signature" = $signature }
        
        Write-Host "Response: $($response.message)" -ForegroundColor Green
        Write-Host "Job ID: $($response.data.jobId)" -ForegroundColor DarkGray
    } catch {
        Write-Host "Webhook Failed: $_" -ForegroundColor Red
        # Read error details
        if ($_.Exception.Response) {
            $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            $errBody = $reader.ReadToEnd()
            Write-Host "Error Details: $errBody" -ForegroundColor Red
        }
    }

    Write-Host "`n3. Testing Polling Trigger (Marketplace B)..." -ForegroundColor Cyan
    try {
        $pollResponse = Invoke-RestMethod -Uri "$baseUrl/trigger-poll" -Method Post
        Write-Host "Response: $($pollResponse.message)" -ForegroundColor Green
    } catch {
        Write-Host "Polling Trigger Failed: $_" -ForegroundColor Red
    }
    
    Write-Host "`n4. Verifying Inventory..." -ForegroundColor Cyan
    Write-Host "Waiting 5 seconds for background worker..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 5 
    
    try {
        $inventory = Invoke-RestMethod -Uri "$baseUrl/inventory/PROD-ABC-123" -Method Get
        
        if ($inventory.success) {
            Write-Host "Product: $($inventory.data.product_id)" -ForegroundColor Green
            Write-Host "Quantity: $($inventory.data.quantity)" -ForegroundColor Green
            Write-Host "Source: $($inventory.data.source)" -ForegroundColor Green
            Write-Host "Last Updated: $($inventory.data.updated_at)" -ForegroundColor Green
        } else {
             Write-Host "Failed: $($inventory.error)" -ForegroundColor Red
        }
    } catch {
        Write-Host "Get Inventory Failed: $_" -ForegroundColor Red
        if ($_.Exception.Response) {
             $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
             Write-Host "Details: $($reader.ReadToEnd())" -ForegroundColor Red
        }
    }
}

Test-InventoryService
