# Bulk AI Extraction Setup Guide for Toilets

## Quick Start

This guide shows you how to set up bulk AI extraction for your entire toilets Google Sheet using the automated Google Apps Script.

## What It Does

- ✅ Automatically extracts specifications from all toilet spec sheet PDFs
- ✅ Handles both text PDFs (PARISI) and technical drawing PDFs (Fienza/RAK) with Vision API
- ✅ Skips products that are already extracted (checks `installation_type` column)
- ✅ Processes in batches to avoid timeouts and quota limits
- ✅ Shows progress, cost estimates, and error reporting

## Setup Steps

### 1. Open Your Toilets Google Sheet

Navigate to your toilets collection Google Sheet.

### 2. Open Apps Script Editor

1. Click **Extensions** → **Apps Script**
2. This opens the Google Apps Script editor in a new tab

### 3. Create New Script File

1. In the Apps Script editor, click the **+** button next to "Files"
2. Choose **Script**
3. Name it: `BULK_AI_EXTRACTION_TOILETS`
4. Delete any default code in the editor

### 4. Copy the Script

1. Open this file on your computer or GitHub:
   ```
   google_apps_scripts/BULK_AI_EXTRACTION_TOILETS.js
   ```

2. Copy the entire contents

3. Paste into the Apps Script editor

### 5. Save and Run Setup

1. Click **Save** (disk icon) or press `Ctrl+S` / `Cmd+S`
2. In the function dropdown (top center), select **`setupMenu`**
3. Click **Run** (play button)
4. **Grant permissions** when prompted:
   - Click "Review permissions"
   - Choose your Google account
   - Click "Advanced" → "Go to [your project name] (unsafe)"
   - Click "Allow"

### 6. Refresh Your Google Sheet

1. Go back to your Google Sheet tab
2. Refresh the page (`F5` or `Cmd+R`)
3. You should now see a new menu: **🤖 AI Extraction**

## Usage

### Option 1: Extract All Products (Recommended for First Run)

1. Click **🤖 AI Extraction** → **📊 Count Products Ready for Extraction**
2. Review the report showing:
   - How many products need extraction
   - Estimated cost (~$0.005 per product)
   - Estimated time (~10-15 sec per product)
3. Click **YES** to start extraction
4. Wait for processing (script will show progress toasts)
5. Review final results dialog

### Option 2: Extract Specific Range

1. Click **🤖 AI Extraction** → **🔢 Extract Specific Range**
2. Enter range (e.g., `2-50` for rows 2 through 50)
3. Confirm and wait for processing

### Option 3: Extract Selected Rows

1. Select rows in your sheet (click row numbers while holding Shift)
2. Click **🤖 AI Extraction** → **🎯 Extract Selected Rows**
3. Confirm and wait for processing

## Processing Details

### Batch Configuration

- **Batch size**: 5 products per batch
- **Delay between batches**: 65 seconds (to avoid quota limits)
- **Delay between requests**: 8 seconds

### Example Timing

- **10 products**: ~2-3 minutes
- **50 products**: ~12-15 minutes
- **100 products**: ~30-40 minutes
- **200 products**: ~60-80 minutes

### What Gets Extracted

The AI extracts these fields from spec sheet PDFs:

**Installation Details**:
- `installation_type` (Close Coupled, Back to Wall, Wall Hung)
- `trap_type` (P-Trap, S-Trap)
- `inlet_type` (Top, Bottom, Left/Right)

**Features**:
- `actuation_type` (Dual Flush, Single Flush)
- `toilet_seat_type` (Soft Close, Standard, Quick Release)
- `toilet_rim_design` (Rimless, Standard)

**Dimensions**:
- `pan_height` (mm)
- `pan_width` (mm)
- `pan_depth` (mm)
- `overall_width_depth_height_mm` (WxDxH format)

**Specifications**:
- `model_name`
- `product_material` (Ceramic, Vitreous China)
- `wels_rating` (e.g., "4 Star")
- `flow_rate_L_per_min` (e.g., "4.5/3L")
- `warranty_years`

### How It Skips Already-Extracted Products

The script checks Column I (`installation_type`). If this field is filled, the product is considered already extracted and will be skipped.

To **re-extract** a product:
1. Clear the `installation_type` cell (Column I)
2. Run extraction again

## Cost Estimates

### Per Product Costs

- **Text-based PDFs** (PARISI format): ~$0.001 per product
- **Technical drawing PDFs** (Fienza/RAK format): ~$0.01 per product
- **Average cost**: ~$0.005 per product

### Example Costs

- **50 products**: ~$0.25
- **100 products**: ~$0.50
- **200 products**: ~$1.00
- **500 products**: ~$2.50

## Monitoring Progress

### During Processing

The script shows progress in two ways:

1. **Toast notifications** (bottom-right corner):
   - "Batch 1/10: Extracting rows 2, 3, 4, 5, 6"
   - "Waiting 65s before next batch... (1/10 complete)"

2. **Logs** (View → Executions in Apps Script editor):
   - Detailed logs of each API call
   - Success/failure status for each product
   - Error messages if extraction fails

### After Processing

You'll see a summary dialog:
```
✅ BULK EXTRACTION COMPLETE

Total: 50
✓ Succeeded: 48
✗ Failed: 2
⏭️ Skipped: 0

⏱️ Time: 12.3 minutes

⚠️ Errors:
Row 23: AI extraction failed - Could not parse JSON
Row 45: Failed to fetch PDF content
```

## Troubleshooting

### Error: "API error (500): Server error"

**Cause**: PythonAnywhere web app might be sleeping or overloaded

**Solution**:
1. Open your PythonAnywhere dashboard
2. Go to "Web" tab
3. Click "Reload" button
4. Try extraction again

### Error: "Failed to fetch PDF content"

**Cause**: PDF URL is invalid or inaccessible

**Solution**:
1. Check the spec sheet URL in Column AJ
2. Open the URL in a browser to verify it works
3. If broken, update the URL and try again

### Error: "Could not parse JSON from AI response"

**Cause**: AI returned malformed data (rare)

**Solution**:
1. Note the row number from error
2. Try extracting that single row again
3. If it fails consistently, the PDF might be too complex
4. You may need to manually enter data for that product

### Script Times Out

**Cause**: Processing too many products at once

**Solution**:
1. Reduce batch size from 5 to 3 (edit script line 27)
2. Or process in smaller ranges (e.g., 2-50, 51-100, etc.)

### "Already extracted" but data is wrong

**Solution**:
1. Clear the `installation_type` cell (Column I) for that row
2. Run extraction again on that row

## Advanced: Modify Configuration

To change processing speed or batch size:

1. Open Apps Script editor
2. Edit these lines at the top:

```javascript
const BATCH_SIZE = 5;                    // Lower = slower but safer
const DELAY_BETWEEN_BATCHES = 65000;     // Milliseconds (65s)
const DELAY_BETWEEN_REQUESTS = 8000;     // Milliseconds (8s)
```

3. Save the script
4. Run extraction again

## Help Menu

Click **🤖 AI Extraction** → **ℹ️ Help** for in-sheet help dialog with:
- Feature overview
- What gets extracted
- Cost and time estimates
- Usage instructions

## Files Reference

- **Script**: `google_apps_scripts/BULK_AI_EXTRACTION_TOILETS.js`
- **API Endpoint**: `https://cassbrothers.pythonanywhere.com/api/toilets/process/extract`
- **Collection**: `toilets`

## Next Steps

After bulk extraction completes:

1. **Review extracted data** - Check a few random rows to verify accuracy
2. **Fix any errors** - Manually correct any failed extractions
3. **Run WELS lookup** - Use the WELS lookup script to populate WELS data
4. **Populate warranty** - Use the warranty lookup script
5. **Ready for Shopify upload!** - Your data is now complete

---

**Questions or issues?** Check the logs in Apps Script editor (View → Executions) for detailed error messages.
