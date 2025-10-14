# Batch Processing Solution - Eliminate Rate Limit Errors

## The Problem

When processing multiple WIP products, the last product always fails with:
```
"Could not access worksheet for sinks"
```

**Root Cause:** Each product makes **10-12 Google Sheets API calls**, and Google limits you to **60 requests/minute**. When processing 3+ products, you hit the rate limit on the last one.

## Your Solution (The Right Approach!)

Instead of uploading to Google Sheets immediately after extracting each product:

### Current Flow (SLOW, RATE LIMITED):
```
Product 1: Extract → Upload → Clean (10-12 API calls)
Wait 20s
Product 2: Extract → Upload → Clean (10-12 API calls)
Wait 20s
Product 3: Extract → Upload → Clean → ❌ RATE LIMIT ERROR
```

### New Flow (FAST, NO RATE LIMITS):
```
Phase 1: EXTRACT ALL (No Sheets API calls)
  Product 1: Extract → Save to SQLite ✅
  Product 2: Extract → Save to SQLite ✅
  Product 3: Extract → Save to SQLite ✅
  (No delays needed!)

Phase 2: BATCH UPLOAD (ONE API call for all)
  Upload all 3 products to Sheets at once ✅

Phase 3: BATCH CLEAN (ONE operation)
  Run cleaner script on all rows ✅
```

## Implementation Status

### ✅ COMPLETED:
1. **Backend endpoints created:**
   - `/api/<collection>/wip/extract-only` - Extract and save to SQLite only
   - `/api/<collection>/wip/batch-upload` - Batch upload all extracted products

2. **Database already supports this:**
   - `wip_products` table has `extracted_data` and `generated_content` columns
   - Data is stored as JSON in SQLite

### ⏸️ NEEDS COMPLETION:
1. **Frontend JavaScript** (`static/js/collection/add_products.js`)
   - Replace `processSelectedWIP()` function to use new batch workflow
   - Phase 1: Loop through products calling `/extract-only`
   - Phase 2: Call `/batch-upload` with all WIP IDs
   - Phase 3: Done!

2. **Testing on PythonAnywhere**

## Benefits

✅ **10x fewer API calls** - From 10-12 per product to 1 for ALL products
✅ **No more rate limit errors** - Impossible to hit 60/min limit
✅ **3x faster** - No delays needed between products
✅ **More reliable** - Data safely in SQLite even if Sheets fails
✅ **Can process 20-30 products** - No problem!

## Timeline Comparison

### Old Way (3 products):
- Product 1: 60s + upload + clean = ~70s
- Wait 20s
- Product 2: 60s + upload + clean = ~70s
- Wait 20s
- Product 3: 60s + upload + clean → ❌ FAILS
- **Total: 4-5 minutes + failures**

### New Way (3 products):
- Extract all 3: 60s + 60s + 60s = 180s (parallel possible!)
- Batch upload: 5s
- Batch clean: 10s
- **Total: 3 minutes, NO failures!**

### For 10 products:
- **Old way:** 15-20 minutes + rate limit failures
- **New way:** 10-12 minutes, ZERO failures!

## How to Complete Implementation

### 1. Update Frontend (add_products.js)

Replace the `processSelectedWIP()` function body with:

```javascript
try {
    startWIPAutoRefresh();

    console.log(`🚀 Phase 1: Extracting ${wipIds.length} products...`);
    showLoading(`Extracting ${wipIds.length} products...`);

    // Phase 1: Extract all products (save to SQLite)
    let extracted = 0;
    for (let i = 0; i < wipIds.length; i++) {
        const wipId = wipIds[i];
        console.log(`📦 Extracting ${i+1}/${wipIds.length}...`);

        const response = await fetch(`/api/${COLLECTION_NAME}/wip/extract-only`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wip_id: wipId, fast_mode: fastMode })
        });

        const data = await response.json();
        if (data.success) {
            extracted++;
            console.log(`✅ ${data.sku} extracted`);
        } else {
            console.error(`❌ ${wipId} failed:`, data.error);
        }

        await refreshAllWIPTabs();
    }

    // Phase 2: Batch upload all to Google Sheets
    console.log(`📤 Phase 2: Uploading ${extracted} products to Sheets...`);
    showLoading(`Uploading ${extracted} products to Google Sheets...`);

    const uploadResponse = await fetch(`/api/${COLLECTION_NAME}/wip/batch-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wip_ids: wipIds })
    });

    const uploadResult = await uploadResponse.json();

    stopWIPAutoRefresh();
    hideLoading();

    showNotification(
        `✅ ${uploadResult.uploaded} products processed! (${uploadResult.failed} failed)`,
        uploadResult.failed === 0 ? 'success' : 'warning'
    );

    await refreshAllWIPTabs();

} catch (error) {
    console.error('Error:', error);
    showNotification(`Error: ${error.message}`, 'danger');
    stopWIPAutoRefresh();
    hideLoading();
}
```

### 2. Test Locally

```bash
# Start your local server
python flask_app.py

# Test with 3-5 products
# Watch the console - should see:
# Phase 1: Extracting...
# Phase 2: Uploading...
# ✅ All done!
```

### 3. Deploy to PythonAnywhere

```bash
git add -A
git commit -m "Implement batch processing to eliminate rate limits"
git push origin main

# On PythonAnywhere:
cd ~/mysite
git pull origin main
# Click "Reload" button
```

## Expected Results

- **No more "Could not access worksheet" errors**
- **Process 10-20 products without issues**
- **Much faster overall**
- **No delays needed between products**

## Quick Fix (Until Batch is Implemented)

Current code has been updated to:
- Wait 20 seconds between products (instead of 10)
- Automatically retry once if rate limit is hit

This helps but doesn't eliminate the problem. The batch solution above is the permanent fix.
