const crypto = require('crypto');

// 1. Put your EXACT Postman JSON body here
// IMPORTANT: format it exactly as you will paste it into Postman (e.g. minified or not)
const body = JSON.stringify({ "product_code": "PROD-POSTMAN-001", "available_stock": 50, "timestamp": "2026-01-01T12:00:00Z", "warehouse": "WH-POSTMAN" });

// 2. Your Secret (from .env)
const secret = 'secret';

// 3. Generate Signature
const signature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

console.log('--- COPY THIS TO POSTMAN ---');
console.log('Body (Raw JSON):');
console.log(body);
console.log('\nHeader (x-marketplace-signature):');
console.log(signature);
console.log('----------------------------');
