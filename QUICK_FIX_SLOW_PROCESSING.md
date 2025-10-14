# Quick Fix: Slow WIP Processing

## The Problem

WIP processing is taking **3-13 minutes per product** because of:
1. **AI Extraction (scraping)**: 2-10 minutes - REQUIRED
2. **Content Generation (3 fields)**: 1-3 minutes - OPTIONAL
3. **Google Apps Script**: ~10 seconds - REQUIRED

For 20 products: **60-260 minutes total (1-4+ hours!)**

## Quick Solutions

### Option 1: Skip Content Generation (FASTEST)

Process products with AI extraction ONLY, skip content generation for now:

**Modify the existing endpoint temporarily** or create products manually:

1. Add products to Google Sheets manually
2. Run AI extraction only (much faster - 2-5 min per product)
3. Generate descriptions later in bulk

**To do this**: Comment out content generation in the processor

### Option 2: Reduce Content Fields

Instead of generating 3 fields (body_html, features, care_instructions), generate only 1:

Change line 146 in `wip_background_processor.py`:
```python
fields_to_generate=['body_html']  # Only body, skip features & care
```

This cuts content generation time by ~66%.

### Option 3: Process in Smaller Batches

Instead of 20 products, do 5 at a time:
- **5 products**: 15-65 minutes
- Can monitor progress better
- Less risk of failure

### Option 4: Increase Delays (If Rate Limiting)

If you're getting 429 errors, increase the delay from 20s to 30s:

Line 52: `time.sleep(30)`

## Recommended Approach

**For your immediate need:**

1. **Cancel current job** (if it's stuck/too slow)
2. **Process 5 products at a time**
3. **Skip content generation** or do it separately later
4. **Monitor via** `/wip-jobs` page

## Why Is It So Slow?

The AI extraction involves:
1. Scraping the supplier website (can be slow)
2. Downloading images
3. Sending to OpenAI Vision API
4. Processing HTML content
5. Making multiple AI calls for different fields

Content generation:
1. Fetching scraped content from cache
2. Making 3 separate OpenAI API calls
3. Each call takes 20-60 seconds

**This is normal - AI processing is slow!**

## Faster Alternative Workflow

Instead of doing everything at once:

### Step 1: Quick Add (2-5 min per product)
- Add SKU + URL to sheets
- Run AI extraction only
- Products are now in sheets with data

### Step 2: Bulk Content Generation (later)
- Select 10-20 products
- Generate descriptions in bulk
- Runs in parallel, much faster

This way you get products into the system quickly, then enhance them later.

## Expected Timings

| Products | With Content Gen | Without Content Gen |
|----------|------------------|---------------------|
| 1        | 3-13 min         | 2-5 min             |
| 5        | 15-65 min        | 10-25 min           |
| 10       | 30-130 min       | 20-50 min           |
| 20       | 60-260 min       | 40-100 min          |

## Check If It's Actually Working

1. Go to: `https://your-domain/wip-jobs`
2. Look for job status: `running`
3. Check processed count: Should increment every 3-13 minutes
4. Check your Google Sheets: New rows appearing?
5. Check WIP product status: Should change from `extracting` → `generating` → `cleaning` → `ready`

## Is It Stuck or Just Slow?

**It's STUCK if:**
- No progress for 15+ minutes
- Status doesn't change
- No new rows in Google Sheets
- Logs show same message repeating

**It's SLOW but WORKING if:**
- Progress increments every few minutes
- Status changes: extracting → generating → cleaning
- New rows appear in sheets
- Logs show timestamps progressing

## Emergency: Cancel and Restart

```bash
# Via browser console
fetch('/api/sinks/wip/jobs/YOUR-JOB-ID/cancel', {method: 'POST'})
  .then(r => r.json())
  .then(d => console.log(d));

# Then start a smaller batch (3-5 products)
```

## Long-Term Solution

I'll create a "Fast Mode" option that:
- Skips content generation
- Processes extraction only
- 60-75% faster
- Content can be generated later in bulk

Would you like me to implement this?
