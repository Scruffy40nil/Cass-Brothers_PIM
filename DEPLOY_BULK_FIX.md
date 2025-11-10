# Deploy Bulk Extraction Fix to PythonAnywhere

## What Was Fixed

The Python API backend was looking for URLs in the wrong column:
- **Before**: Looked in Column A (`url` field - supplier URLs)
- **After**: Looks in Column AJ (`shopify_spec_sheet` field - spec sheet PDFs)

Files changed:
- `config/collections.py` - Added `url_field_for_extraction = 'shopify_spec_sheet'`
- `core/sheets_manager.py` - Modified `get_urls_from_collection()` to use configured field

## Deployment Steps

### 1. Open PythonAnywhere Bash Console

Log into PythonAnywhere and open a Bash console.

### 2. Navigate to Your Repository

```bash
cd ~/mysite
```

(Or wherever your repository is located - use `cd ~` then `ls` to find it)

### 3. Pull the Latest Code

```bash
git pull origin main
```

**Expected output**:
```
remote: Enumerating objects: X, done.
remote: Counting objects: 100% (X/X), done.
remote: Compressing objects: 100% (X/X), done.
remote: Total X (delta X), reused X (delta X)
Unpacking objects: 100% (X/X), done.
From https://github.com/...
   a4db83d..XXXXXXX  main       -> origin/main
Updating a4db83d..XXXXXXX
Fast-forward
 config/collections.py      | X ++++++
 core/sheets_manager.py     | X ++++++---
```

You should see `config/collections.py` and `core/sheets_manager.py` in the changed files.

### 4. Reload Your Web App

1. Go to PythonAnywhere dashboard
2. Click **Web** tab
3. Click the green **Reload** button for your web app
4. Wait for "Reloaded successfully" message

### 5. Test the Fix

#### Method 1: Quick API Test

Run this Python test from your PythonAnywhere Bash console:

```bash
python test_bulk_pdf_endpoint.py
```

**Expected**: Should see status 200 responses

#### Method 2: Test from Google Sheet

1. Open your toilets Google Sheet
2. Click **🤖 AI Extraction** → **📊 Count Products Ready for Extraction**
3. Should show count of products (e.g., "Found 150 products ready for extraction")
4. Click **YES** to start extraction for a small batch (or click NO and use "Extract Specific Range" for rows 2-5)
5. Watch for progress toasts in bottom-right corner

**Expected**:
- ✅ "Batch 1/1: Extracting rows 2, 3, 4, 5"
- ✅ "Extraction complete! Succeeded: 4"

**Previously you got**: ❌ "API error (500): No URLs match selected rows"

## Verification

After extraction completes, check your Google Sheet:
- Column I (installation_type) should be filled (e.g., "Back to Wall")
- Column J (trap_type) should be filled (e.g., "P-Trap")
- Column K (inlet_type) should be filled (e.g., "Bottom")
- Other columns should have extracted data

## If You Still Get Errors

### Error: "No URLs match selected rows"
**This means the fix wasn't deployed correctly**

Check:
1. Did `git pull` show the changed files?
2. Did you click "Reload" in the Web tab?
3. Check PythonAnywhere error logs for details

### Error: "Failed to fetch PDF content"
**This means URLs are invalid**

Check:
1. Column AJ (shopify_spec_sheet) has valid URLs
2. URLs start with `https://`
3. Open one URL in browser to verify it's accessible

### Error: "AI extraction failed"
**This could be Vision API or OpenAI issues**

Check:
1. OpenAI API key is configured in PythonAnywhere environment
2. Check PythonAnywhere error logs
3. Try running `python test_vision_extraction.py` to test Vision API

## Summary

- ✅ Google Apps Script was already correct (no changes needed)
- ✅ Python backend fix is in GitHub (committed)
- 🔄 Python backend fix needs deployment to PythonAnywhere (this guide)
- ✅ After deployment, bulk extraction should work correctly

## Next Steps After Successful Deployment

1. Run bulk extraction on all products (or in batches)
2. Review extracted data for accuracy
3. Run WELS lookup script to populate WELS data
4. Run warranty lookup script to populate warranty info
5. Ready for Shopify upload!
