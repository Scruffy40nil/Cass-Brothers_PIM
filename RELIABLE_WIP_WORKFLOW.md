# Reliable WIP Workflow - Best Practices

## Overview
The WIP (Work-In-Progress) system now uses **reliable sequential processing** that works perfectly on PythonAnywhere. No more stuck jobs or rate limit errors!

## How It Works

### 1. Add Products to WIP
- Search by SKU or find missing products
- Select products you want to process
- Click **"Add to Work in Progress"**

### 2. Process Products (The Reliable Way)
1. Go to the **"Work in Progress"** tab
2. Go to **"Processing Queue"** sub-tab
3. Select the products you want to process (checkboxes)
4. Click **"Start Processing Selected"**
5. Choose **Fast Mode** (recommended) or Full Mode

### Processing Modes

#### ⚡ Fast Mode (RECOMMENDED)
- **Time:** 45-60 seconds per product
- **What it does:**
  - Adds product to Google Sheets
  - Runs AI extraction (all product data)
  - Cleans data with Apps Script
  - **Skips** AI content generation
- **When to use:** Almost always! You can add descriptions later
- **Example:** 10 products = ~10 minutes

#### 🐌 Full Mode
- **Time:** 3-5 minutes per product
- **What it does:** Everything Fast Mode does + AI content generation
- **When to use:** Only if you need AI descriptions immediately
- **Example:** 10 products = 30-50 minutes

### 3. Monitor Progress
- The page auto-refreshes every 10 seconds
- Watch products move through stages:
  - ⏳ **Pending** → Waiting in queue
  - 🤖 **Extracting** → AI is extracting data
  - 🧹 **Cleaning** → Apps Script is cleaning data
  - ✅ **Ready** → Ready for your review

### 4. Review & Finalize
- When products reach **"Ready for Review"** tab
- Click **"Review"** button to inspect the product
- Make any manual adjustments
- Save to finalize

## Why This Works

### ✅ No Threading Issues
- Processes ONE product at a time
- No background threads = no stuck jobs
- Works reliably on PythonAnywhere

### ✅ Rate Limit Protection
- 10-second delay between products
- Prevents Google Sheets API rate limits (60 req/min)
- Automatic error handling

### ✅ Fault Tolerance
- If one product fails, others continue
- Detailed error reporting
- Failed products can be retried

## Best Practices

### 1. Batch Size
- **Recommended:** 5-10 products at a time
- **Maximum:** 30 products (system enforced)
- Smaller batches = easier to monitor

### 2. Timing
- **Fast Mode:** ~1 minute per product + 10s delay
  - 5 products = ~6 minutes
  - 10 products = ~12 minutes
- **Plan accordingly** - don't start 30 products right before closing!

### 3. Handling Failures
If a product fails:
1. Check console for error message
2. Click **"Retry"** button on the product
3. Or reset it back to pending and reprocess

### 4. Common Errors & Solutions

#### "Failed to fetch HTML content"
- **Cause:** Couldn't load supplier webpage
- **Solution:** Check if URL is valid, then retry

#### "Quota exceeded for quota metric 'Read requests'"
- **Cause:** Too many Google Sheets API calls
- **Solution:** Wait 60 seconds, then retry
- **Prevention:** Use Fast Mode, process in smaller batches

#### Product stuck in "Extracting" for 20+ minutes
- **Cause:** Error occurred but status not updated
- **Solution:** Click **"Retry"** button to reset and reprocess

## Comparison: Old vs New

### ❌ Old System (Background Jobs)
- Used threading
- Got stuck on PythonAnywhere
- No progress visibility
- Jobs ran for hours with no result
- Rate limit errors

### ✅ New System (Sequential Processing)
- One product at a time
- Works everywhere
- Real-time progress
- Completes reliably
- Rate limit protection built-in

## Quick Start Example

Want to add 10 new products?

1. **Add to WIP** (30 seconds)
   - Search for 10 SKUs
   - Select all
   - Click "Add to Work in Progress"

2. **Process in Fast Mode** (~12 minutes)
   - Go to WIP tab → Processing Queue
   - Check "Select for processing" on all
   - Click "Start Processing Selected"
   - Choose Fast Mode (OK)
   - ☕ Take a coffee break

3. **Review & Finalize** (5-10 minutes)
   - Products appear in "Ready for Review"
   - Click "Review" on each
   - Make quick adjustments
   - Save

**Total time:** ~20 minutes for 10 products

## Summary

The new workflow is:
- ✅ **Reliable** - No more stuck jobs
- ✅ **Fast** - 45-60 seconds per product
- ✅ **Safe** - Rate limit protection
- ✅ **Transparent** - See progress in real-time
- ✅ **Foolproof** - Continues even if one fails

**Bottom line:** Select products, click "Start Processing", choose Fast Mode, and let it run. Check back in 10-15 minutes and your products are ready to review!
