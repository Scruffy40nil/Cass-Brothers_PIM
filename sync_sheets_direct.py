#!/usr/bin/env python3
"""
Direct Google Sheet to Google Sheet URL Sync
Match products from Supplier Sheet to Taps Sheet by Brand + SKU
"""

import os
import json
from dotenv import load_dotenv
import gspread
from google.oauth2.service_account import Credentials

load_dotenv()

# Sheet IDs
SUPPLIER_SHEET_ID = "1gt_DvS2E4WJNaylXYvwWfRwHzoDcRYxjmDpLevHffYQ"
TAPS_SHEET_ID = "1jJ5thuNoxcITHkFAfFKPmUfaLYC3dSo2oppiN0s7i1U"

# Brand mapping: brands in Taps sheet -> tab name in Supplier sheet
BRAND_MAPPING = {
    'ARMANDO VICARIO': 'Abey',
    'GARETH ASHTON': 'Abey',
    # Add more mappings here as needed
}

def get_google_sheets_client():
    """Get authenticated Google Sheets client"""
    creds_json = os.getenv('GOOGLE_CREDENTIALS_JSON')
    if creds_json.startswith('{'):
        creds_dict = json.loads(creds_json)
    else:
        with open(creds_json, 'r') as f:
            creds_dict = json.load(f)

    creds = Credentials.from_service_account_info(
        creds_dict,
        scopes=['https://www.googleapis.com/auth/spreadsheets']
    )

    return gspread.authorize(creds)

def sync_sheets_direct():
    print("=" * 80)
    print("DIRECT SHEET-TO-SHEET URL SYNC")
    print("=" * 80)

    # Connect to both sheets
    print("\n1. CONNECTING TO GOOGLE SHEETS...")
    client = get_google_sheets_client()

    supplier_sheet = client.open_by_key(SUPPLIER_SHEET_ID)
    taps_sheet = client.open_by_key(TAPS_SHEET_ID)
    taps_worksheet = taps_sheet.worksheet('Raw_Data')

    print(f"   ✅ Supplier Sheet: {supplier_sheet.title}")
    print(f"   ✅ Taps Sheet: {taps_sheet.title}")

    # Get Taps sheet data
    print("\n2. READING TAPS SHEET...")
    taps_data = taps_worksheet.get_all_values()
    headers = taps_data[0]

    # Find column indices
    url_col = headers.index('url') if 'url' in headers else 0
    sku_col = headers.index('variant_sku') if 'variant_sku' in headers else 1
    brand_col = headers.index('brand_name') if 'brand_name' in headers else 7

    print(f"   Column A (URL): {headers[url_col]}")
    print(f"   Column B (SKU): {headers[sku_col]}")
    print(f"   Column H (Brand): {headers[brand_col]}")

    # Build list of products that need URLs
    products_needing_urls = []
    for row_idx, row in enumerate(taps_data[1:], start=2):  # Start at row 2
        if len(row) > max(url_col, sku_col, brand_col):
            url = row[url_col] if url_col < len(row) else ''
            sku = row[sku_col] if sku_col < len(row) else ''
            brand = row[brand_col] if brand_col < len(row) else ''

            if not url.strip() and sku.strip() and brand.strip():
                products_needing_urls.append({
                    'row': row_idx,
                    'sku': sku.strip(),
                    'brand': brand.strip()
                })

    print(f"   Found {len(products_needing_urls)} products needing URLs")

    # Group by brand
    brands_needed = {}
    for product in products_needing_urls:
        brand = product['brand']
        if brand not in brands_needed:
            brands_needed[brand] = []
        brands_needed[brand].append(product)

    print(f"\n3. BRANDS NEEDING URLs:")
    for brand, products in sorted(brands_needed.items()):
        print(f"   {brand:<40} | {len(products):3d} products")

    # Load supplier data by brand
    print("\n4. LOADING SUPPLIER SHEETS BY BRAND...")
    supplier_data = {}

    for brand in brands_needed.keys():
        try:
            # Check if there's a brand mapping
            supplier_tab_name = BRAND_MAPPING.get(brand.upper(), brand)

            # Try to find a worksheet matching the brand name or mapped name
            worksheet = None
            for ws in supplier_sheet.worksheets():
                if ws.title.strip().upper() == supplier_tab_name.upper():
                    worksheet = ws
                    break

            if worksheet:
                # Get all data from this supplier tab
                data = worksheet.get_all_values()
                if len(data) > 1:
                    # Read headers to find SKU and URL columns
                    headers = [h.strip().upper() for h in data[0]]

                    # Find SKU column
                    sku_col = None
                    for i, h in enumerate(headers):
                        if 'SKU' in h:
                            sku_col = i
                            break

                    # Find URL column
                    url_col = None
                    for i, h in enumerate(headers):
                        if 'URL' in h:
                            url_col = i
                            break

                    if sku_col is None or url_col is None:
                        print(f"   ⚠️  {brand:<40} | Headers: {headers[:3]} - Can't find SKU or URL column")
                        continue

                    # SPECIAL CASE: Phoenix Tapware has backwards headers
                    # Check if data in "URL" column looks like SKUs and vice versa
                    if len(data) > 1:
                        first_sku_col_value = data[1][sku_col] if sku_col < len(data[1]) else ''
                        first_url_col_value = data[1][url_col] if url_col < len(data[1]) else ''

                        # If "SKU" column contains URLs and "URL" column contains SKUs, swap them
                        if (first_sku_col_value.startswith('http') and
                            not first_url_col_value.startswith('http') and
                            len(first_url_col_value) < 50):  # SKUs are usually short
                            print(f"   ⚠️  {brand:<40} | Detected backwards columns, swapping...")
                            sku_col, url_col = url_col, sku_col

                    # Build SKU -> URL mapping
                    supplier_data[brand] = {}
                    for row in data[1:]:  # Skip header
                        if len(row) > max(sku_col, url_col):
                            sku = row[sku_col].strip().upper() if sku_col < len(row) else ''
                            url = row[url_col].strip() if url_col < len(row) else ''

                            if sku and url:
                                supplier_data[brand][sku] = url

                    mapped_msg = f" (mapped to {supplier_tab_name})" if supplier_tab_name != brand else ""
                    print(f"   ✅ {brand:<40} | {len(supplier_data[brand]):4d} SKUs loaded{mapped_msg}")
            else:
                mapped_msg = f" (looking for '{supplier_tab_name}')" if supplier_tab_name != brand else ""
                print(f"   ⚠️  {brand:<40} | Tab not found{mapped_msg}")

        except Exception as e:
            print(f"   ❌ {brand:<40} | Error: {e}")

    # Match and prepare updates
    print("\n5. MATCHING SKUs...")
    updates = []
    matched = 0
    matched_fuzzy = 0
    not_matched = 0

    def find_sku_url(sku, brand_urls):
        """Try to find URL for SKU with fuzzy matching"""
        sku_upper = sku.upper()

        # Try exact match first
        if sku_upper in brand_urls:
            return brand_urls[sku_upper], 'exact'

        # Try removing last character (e.g., D666385B -> D666385)
        if len(sku_upper) > 1:
            base_sku = sku_upper[:-1]
            if base_sku in brand_urls:
                return brand_urls[base_sku], 'fuzzy (removed last char)'

        # Try removing suffix after dash (e.g., M515800-CH -> M515800)
        if '-' in sku_upper:
            base_sku = sku_upper.split('-')[0]
            if base_sku in brand_urls:
                return brand_urls[base_sku], 'fuzzy (removed suffix after -)'

        # Try removing suffix after plus (e.g., ABC123+XYZ -> ABC123)
        if '+' in sku_upper:
            base_sku = sku_upper.split('+')[0]
            if base_sku in brand_urls:
                return brand_urls[base_sku], 'fuzzy (removed suffix after +)'

        return None, None

    for brand, products in brands_needed.items():
        if brand not in supplier_data:
            not_matched += len(products)
            continue

        brand_urls = supplier_data[brand]

        for product in products:
            sku = product['sku']
            url, match_type = find_sku_url(sku, brand_urls)

            if url:
                updates.append({
                    'row': product['row'],
                    'brand': brand,
                    'sku': product['sku'],
                    'url': url,
                    'match_type': match_type
                })
                if match_type == 'exact':
                    matched += 1
                else:
                    matched_fuzzy += 1
            else:
                not_matched += 1

    print(f"\n   📊 RESULTS:")
    print(f"      ✅ Exact matches: {matched}")
    print(f"      🔍 Fuzzy matches: {matched_fuzzy}")
    print(f"      ⚠️  Not matched: {not_matched}")

    if not updates:
        print("\n   ℹ️  No matches found. SKUs in Taps sheet don't match Supplier sheet.")
        return

    # Show examples
    print(f"\n6. READY TO UPDATE {len(updates)} PRODUCTS")
    print("\n   First 10 examples:")
    for i, update in enumerate(updates[:10], 1):
        match_indicator = "🔍" if update['match_type'] != 'exact' else "✅"
        print(f"   {i:2d}. {match_indicator} Row {update['row']:3d} | {update['brand']:<20} | {update['sku']:<15} | {update['url'][:50]}...")

    # Ask for confirmation
    print(f"\n   Proceed with updating {len(updates)} URLs? (yes/no): ", end='')
    response = input().strip().lower()

    if response != 'yes':
        print("❌ Cancelled")
        return

    # Perform updates
    print("\n7. UPDATING TAPS SHEET...")
    update_count = 0
    error_count = 0

    # Batch updates for efficiency
    batch_updates = []
    for update in updates:
        row = update['row']
        url = update['url']

        # Column A is index 0, but gspread uses 1-based indexing
        cell = f'A{row}'
        batch_updates.append({
            'range': cell,
            'values': [[url]]
        })

    # Update in batches of 100
    batch_size = 100
    for i in range(0, len(batch_updates), batch_size):
        batch = batch_updates[i:i+batch_size]
        try:
            taps_worksheet.batch_update(batch)
            update_count += len(batch)
            print(f"   Progress: {update_count}/{len(updates)} updated...")
        except Exception as e:
            print(f"   ❌ Error in batch {i//batch_size + 1}: {e}")
            error_count += len(batch)

    # Summary
    print("\n" + "=" * 80)
    print("SYNC COMPLETE")
    print("=" * 80)
    print(f"✅ Successfully updated: {update_count}")
    print(f"❌ Errors: {error_count}")
    print(f"📊 Total SKUs matched: {matched}")
    print(f"⚠️  SKUs not found: {not_matched}")
    print("=" * 80)

if __name__ == '__main__':
    sync_sheets_direct()
