# Supplier URL Sync Guide

## Purpose

Automatically populate the supplier URL column (column A) in the Taps Google Sheet by matching SKUs from the `supplier_products.db` database.

## How It Works

1. Reads all taps products from `supplier_products.db`
2. Reads all products from the Taps Google Sheet
3. Matches products by SKU (case-insensitive)
4. Updates the `url` column (column A) for products that:
   - Have a SKU
   - Don't already have a URL
   - Match a product in the database

## Usage

### On PythonAnywhere

```bash
cd ~/mysite
python sync_supplier_urls_to_taps.py
```

### On Local Development

```bash
python sync_supplier_urls_to_taps.py
```

## What It Does

The script will:
1. Show how many products are in the database
2. Show how many rows are in the sheet
3. Display matching statistics:
   - How many matched
   - How many skipped (no SKU)
   - How many skipped (already have URL)
   - How many skipped (no match found)
4. Show the first 5 examples of what will be updated
5. **Ask for confirmation before making any changes**

## Example Output

```
================================================================================
SYNC SUPPLIER URLs TO TAPS GOOGLE SHEET
================================================================================

1. Connecting to database: supplier_products.db
   ✅ Found 110 taps products in database
   📊 Created lookup table with 110 unique SKUs

2. Connecting to Taps Google Sheet...
   Collection: Taps & Faucets
   Spreadsheet ID: 1jJ5thuNoxcITHkFAfFKPmUfaLYC3dSo2oppiN0s7i1U
   Worksheet: Raw_Data

3. Reading products from Google Sheet...
   ✅ Found 50 rows in sheet

4. Matching SKUs and updating URLs...

   📊 Matching Results:
      ✅ Matched: 35
      ⏭️  Skipped (no SKU): 5
      ⏭️  Skipped (already has URL): 10
      ⚠️  Skipped (no match in database): 0

5. Ready to update 35 products

First 5 examples:
   1. Row 3: ABC123 -> https://supplier.com/product/abc123...
   2. Row 5: XYZ789 -> https://supplier.com/product/xyz789...
   ...

Proceed with updates? (yes/no):
```

## Safety Features

- **Confirmation required**: Won't update anything unless you type "yes"
- **Skips existing URLs**: Won't overwrite URLs that are already populated
- **Progress tracking**: Shows progress every 10 updates
- **Error handling**: Continues processing even if individual updates fail

## After Running

The script will show a summary:
```
================================================================================
SYNC COMPLETE
================================================================================
✅ Successfully updated: 35
❌ Errors: 0
📊 Total products in database: 110
📊 Total rows in sheet: 50
================================================================================
```

## Troubleshooting

### No matches found

- Check that SKUs in the sheet match SKUs in the database
- SKU matching is case-insensitive, but must be exact otherwise
- Run this to see database SKUs:
  ```bash
  sqlite3 supplier_products.db "SELECT sku FROM supplier_products WHERE detected_collection IN ('taps', 'tap', 'faucet', 'mixer') LIMIT 10"
  ```

### Database not found

- Make sure you've run `import_supplier_sheet.py` first
- The database should be at `supplier_products.db` in the same directory

### All products skipped (already have URL)

- This is normal if you've already run the script
- The script won't overwrite existing URLs
- If you want to update existing URLs, you'll need to clear them first or modify the script

## Re-running the Script

You can run the script multiple times safely:
- It will only update products without URLs
- It won't duplicate or overwrite existing data
- Useful after adding new products to the database
