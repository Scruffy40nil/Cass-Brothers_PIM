# PythonAnywhere Deployment Guide

## Current Status
✅ All code pushed to GitHub
✅ Supplier database created (16,487 products imported)
❌ `.env` file needs to be created manually on PythonAnywhere

## Why .env is Not Pushed to GitHub
The `.env` file contains sensitive credentials (Google service account JSON) and is listed in `.gitignore` for security. You must manually create this file on PythonAnywhere.

## Step 1: Pull Latest Code on PythonAnywhere

```bash
cd ~/Cass-Brothers_PIM
git pull origin main
```

## Step 2: Create .env File on PythonAnywhere

Open the .env file in nano:
```bash
nano ~/Cass-Brothers_PIM/.env
```

Paste the following content (use the exact values from your local .env):

```bash
# Google Sheets Spreadsheet IDs
SINKS_SPREADSHEET_ID=1-y7zKw6ro93nsB04zbeEEEO800q2cysTnXyADnVLfw4
TAPS_SPREADSHEET_ID=1jJ5thuNoxcITHkFAfFKPmUfaLYC3dSo2oppiN0s7i1U
LIGHTING_SPREADSHEET_ID=

# Google Service Account Credentials (JSON format)
GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"YOUR_PROJECT_ID",...full JSON content here...}

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here
```

**Important:** Replace the placeholder values with your actual credentials from your local `.env` file.

Save and exit nano:
- Press `Ctrl + O` (save)
- Press `Enter` (confirm filename)
- Press `Ctrl + X` (exit)

## Step 3: Verify .env File

```bash
cat ~/Cass-Brothers_PIM/.env
```

Make sure all required variables are present:
- `TAPS_SPREADSHEET_ID`
- `SINKS_SPREADSHEET_ID`
- `GOOGLE_CREDENTIALS_JSON`
- `OPENAI_API_KEY`

## Step 4: Reload Web App

1. Go to PythonAnywhere Web tab
2. Click the green "Reload" button for your web app
3. Check the error log for any issues

## Step 5: Test WELS Integration

1. Open your PIM app in browser
2. Navigate to Taps collection
3. Click "Extract" on a hansgrohe or Villeroy & Boch product (they have WELS data)
4. Verify that WELS Rating, Flow Rate, and WELS Registration Number are populated with raw numbers (e.g., "6", "4.5", "T44688")

## Verification Checklist

- [ ] Code pulled from GitHub
- [ ] `.env` file created with all required variables
- [ ] Web app reloaded
- [ ] No "No spreadsheet ID configured for taps" error
- [ ] WELS data populates correctly with raw numbers (no "L/min" or "Star" suffixes)
- [ ] Supplier database exists at `~/Cass-Brothers_PIM/supplier_products.db`

## Troubleshooting

### Error: "No spreadsheet ID configured for taps"
**Cause:** `.env` file missing or `TAPS_SPREADSHEET_ID` not set
**Solution:** Follow Step 2 to create `.env` with correct spreadsheet ID

### Error: "Failed to connect to WELS sheet"
**Cause:** `GOOGLE_CREDENTIALS_JSON` not set or invalid
**Solution:** Copy the full JSON credentials from your local `.env` file

### WELS Data Not Appearing
**Check logs for:**
- ⚠️ Worksheet not found → Brand name mismatch (check case sensitivity)
- ⚠️ SKU not found → Product not in WELS reference sheet
- ✅ Found WELS data → Should see values in sheet

## What's New in This Deployment

### WELS Lookup Integration
- New module: `core/wels_lookup.py`
- Automatically looks up WELS data from reference sheet during extraction
- Case-insensitive brand matching (hansgrohe → HANSGROHE)
- Direct sheet-to-sheet copy (no AI reformatting)

### WELS Reference Sheet
- Spreadsheet: https://docs.google.com/spreadsheets/d/19OZSFFzSOzcy-5NYIYqy3rFWWrceDitR6uSVqY23FGY
- Each tab = brand name
- Columns: Model code, Star rating, Water consumption (Litres), Registration number

### Data Flow
1. AI extracts product data from URL (excludes WELS fields)
2. WELS lookup runs AFTER AI extraction using SKU + brand
3. Raw WELS values added to extracted data
4. Combined data written to Google Sheets

## Files Modified

- `core/wels_lookup.py` (NEW) - WELS data lookup module
- `core/data_processor.py` - Added WELS enrichment after AI extraction
- `core/ai_extractor.py` - Removed WELS enrichment to prevent AI reformatting
- `config/collections.py` - Separated `wels_lookup_fields` from `ai_extraction_fields`
- `.env.template` (NEW) - Template for environment variables

## Next Steps After Deployment

1. Test WELS integration on a few products
2. Monitor logs for any WELS lookup errors
3. If needed, add more brands to WELS reference sheet
