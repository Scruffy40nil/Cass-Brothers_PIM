# PythonAnywhere Deployment Summary - Oct 27, 2025

## What Was Deployed

### 1. WELS Data Integration ✅
**Purpose:** Automatically look up water efficiency ratings for taps products

**Files Added/Modified:**
- `core/wels_lookup.py` - New WELS lookup module
- `core/data_processor.py` - Added WELS enrichment after AI extraction
- `core/ai_extractor.py` - Removed WELS from AI extraction (prevents reformatting)
- `config/collections.py` - Separated `wels_lookup_fields` from `ai_extraction_fields`

**How It Works:**
1. AI extracts product data (excluding WELS fields)
2. System reads brand name from Google Sheet column H
3. WELS lookup searches the brand's tab in WELS reference sheet
4. Returns raw numeric values (e.g., "6" not "6 Star")
5. Data written to Google Sheet

**WELS Reference Sheet:**
- URL: https://docs.google.com/spreadsheets/d/19OZSFFzSOzcy-5NYIYqy3rFWWrceDitR6uSVqY23FGY
- Each tab = brand name (case-insensitive matching)
- Columns: Model code, Star rating, Water consumption (Litres), Registration number

**Key Features:**
- ✅ Case-insensitive brand matching (hansgrohe → HANSGROHE)
- ✅ Raw value preservation (no AI reformatting)
- ✅ Post-AI enrichment (prevents "L/min" and "Star" suffixes)
- ✅ Multiple SKU column fallbacks

### 2. PythonAnywhere Configuration Fix ✅
**Issue:** "No spreadsheet ID configured for taps" error

**Root Cause:** WSGI file was missing `TAPS_SPREADSHEET_ID` environment variable

**Solution:**
Added to WSGI file (line ~10):
```python
os.environ['TAPS_SPREADSHEET_ID'] = '1jJ5thuNoxcITHkFAfFKPmUfaLYC3dSo2oppiN0s7i1U'
```

**Files Created:**
- `test_env_pythonanywhere.py` - Diagnostic script for environment variables
- `wsgi.py` - Template WSGI file with proper .env loading
- `PYTHONANYWHERE_FIX.md` - Quick troubleshooting guide
- `PYTHONANYWHERE_DEPLOYMENT_GUIDE.md` - Complete deployment guide

### 3. Supplier URL Sync Script ✅
**Purpose:** Sync supplier URLs from database to Google Sheet

**File:** `sync_supplier_urls_to_taps.py`

**Current Status:**
- Database has 49 supplier products (Abey, Clark, Zip Commercial)
- Google Sheet has 549 products
- **No automatic matching possible** - Different SKU systems
  - Database: Supplier SKUs (400160, 4012, 42208)
  - Sheet: Manufacturer SKUs (1B1, EB.01-1H, CU.01-1H)

**Recommendation:** Manual URL entry or brand-based lookup in future

**Files:**
- `sync_supplier_urls_to_taps.py` - Sync script (SKU-based)
- `check_sku_mismatch.py` - Diagnostic tool
- `SUPPLIER_URL_SYNC_GUIDE.md` - Usage guide

### 4. Brand Name Column Setup ✅
**Action:** User manually added brand names to Taps Google Sheet column H

**Impact:**
- ✅ Enables WELS lookup to work correctly
- ✅ AI extraction can now use brand for lookups
- ✅ Better organization and filtering

## Current System State

### Working Features ✅
1. Taps collection accessible on PythonAnywhere
2. WELS integration ready (requires brand name in sheet)
3. AI extraction for taps products
4. Environment variables properly configured
5. Supplier database populated (16,487 products total, 49 taps)

### Next Steps
1. **Test WELS Integration:**
   - Extract a hansgrohe or Villeroy & Boch product
   - Verify WELS data populates correctly
   - Check values are raw numbers (no "Star" or "L/min")

2. **Monitor Error Logs:**
   - Check PythonAnywhere error log for any WELS lookup issues
   - Watch for brand name mismatches

3. **Future Enhancements:**
   - Consider brand-based supplier URL lookup
   - Add more brands to WELS reference sheet as needed

## Files Pushed to GitHub

All code changes committed and pushed to `main` branch:
- c71ad0e - Add: SKU mismatch diagnostic tool
- c996521 - Add: Guide for syncing supplier URLs to Taps sheet
- f05c5ab - Add: Script to sync supplier URLs to Taps sheet from database
- 11b1d6d - Add: PythonAnywhere diagnostic and fix tools
- 68911a9 - Add: PythonAnywhere deployment guide and .env template
- b950027 - Add WELS data lookup integration for Taps collection

## Configuration Files

### PythonAnywhere WSGI (~/mysite)
Location: Via Web tab → WSGI configuration file

Required environment variables:
- `OPENAI_API_KEY` ✅
- `GOOGLE_CREDENTIALS_JSON` ✅
- `SINKS_SPREADSHEET_ID` ✅
- `TAPS_SPREADSHEET_ID` ✅ (ADDED TODAY)
- `FLASK_SECRET_KEY` ✅

### .env File (~/mysite/.env)
All environment variables also in `.env` file for consistency.

## Testing Checklist

- [ ] Taps collection loads without errors
- [ ] AI extraction works on taps products
- [ ] Brand name appears in column H after extraction
- [ ] WELS rating appears in column X
- [ ] Flow rate appears in column U (raw number, no "L/min")
- [ ] WELS registration appears in column Y
- [ ] Values are raw numbers, not formatted text

## Support Documents

Created on GitHub:
1. `PYTHONANYWHERE_DEPLOYMENT_GUIDE.md` - Complete deployment guide
2. `PYTHONANYWHERE_FIX.md` - Quick fix for common issues
3. `SUPPLIER_URL_SYNC_GUIDE.md` - How to sync supplier URLs
4. `DEPLOYMENT_SUMMARY.md` - This document

## Known Limitations

1. **Supplier URL Sync:** Cannot automatically match because:
   - Database uses supplier SKUs
   - Sheet uses manufacturer SKUs
   - No common identifier between them

2. **WELS Lookup:** Requires:
   - Brand name in column H
   - Brand must match a tab name in WELS reference sheet
   - Product SKU must exist in that brand's tab

3. **Manual Steps Required:**
   - Brand names must be in sheet (now done ✅)
   - Supplier URLs must be entered manually

## Contact & Resources

- WELS Reference Sheet: https://docs.google.com/spreadsheets/d/19OZSFFzSOzcy-5NYIYqy3rFWWrceDitR6uSVqY23FGY
- Taps Google Sheet: Column A (URL), Column H (Brand), Columns U,X,Y (WELS data)
- GitHub Repo: https://github.com/Scruffy40nil/Cass-Brothers_PIM
