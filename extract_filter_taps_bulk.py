#!/usr/bin/env python3
"""
Bulk PDF Extraction Script for Filter Taps
Run this locally to extract data from all Filter Taps PDFs and write to Google Sheets
"""

# Load environment variables FIRST, before any imports
import os
from dotenv import load_dotenv
load_dotenv()

# Now import modules that depend on environment variables
import sys
import time
from core.ai_extractor import AIExtractor
from core.sheets_manager import SheetsManager

def main():
    print("=" * 80)
    print("Filter Taps Bulk PDF Extraction")
    print("=" * 80)

    # Verify OpenAI API key is loaded
    if not os.getenv('OPENAI_API_KEY'):
        print("\n❌ ERROR: OPENAI_API_KEY not found in environment variables")
        print("Make sure .env file exists and contains OPENAI_API_KEY")
        sys.exit(1)

    print(f"\n✅ OpenAI API key loaded (starts with: {os.getenv('OPENAI_API_KEY')[:20]}...)")

    # Initialize
    print("\n📥 Step 1: Initializing Google Sheets connection...")
    sheets_manager = SheetsManager()

    print("📥 Step 2: Fetching all Filter Taps products...")
    products = sheets_manager.get_all_products('filter_taps')
    print(f"✅ Retrieved {len(products)} products")

    # Filter products with PDFs that need extraction
    print("\n📥 Step 3: Filtering products with PDF spec sheets...")
    products_to_extract = []
    for row_num, product in products.items():
        spec_sheet_url = product.get('shopify_spec_sheet', '')

        if spec_sheet_url and '.pdf' in spec_sheet_url.lower():
            # Check if already has data (skip if yes)
            has_data = (
                product.get('material') or
                product.get('flow_rate') or
                product.get('wels_rating')
            )

            if not has_data:
                products_to_extract.append({
                    'row_num': row_num,
                    'sku': product.get('variant_sku', 'Unknown'),
                    'url': spec_sheet_url
                })

    total = len(products_to_extract)
    print(f"✅ Found {total} products that need extraction")

    if total == 0:
        print("✅ All products already have extracted data!")
        return

    # Ask for confirmation
    print(f"\nStarting extraction of {total} PDFs. This will take ~{int(total * 3 / 60)} minutes...")
    # Auto-confirm for batch processing
    # response = input(f"\nExtract data from {total} PDFs? This will take ~{int(total * 3 / 60)} minutes. (y/n): ")
    # if response.lower() != 'y':
    #     print("❌ Cancelled")
    #     return

    # Initialize AI extractor
    print("\n📥 Step 4: Initializing AI extractor...")
    ai_extractor = AIExtractor()
    print("✅ AI extractor ready")

    # Process products
    print(f"\n📥 Step 5: Processing {total} products...")
    print("=" * 80)

    results = {'succeeded': 0, 'failed': 0}
    batch_updates = []
    BATCH_SIZE = 10

    for idx, item in enumerate(products_to_extract):
        row_num = item['row_num']
        sku = item['sku']
        url = item['url']

        print(f"\n[{idx + 1}/{total}] Processing Row {row_num} - {sku}")
        print(f"  URL: {url[:80]}...")

        try:
            # Extract with AI
            result = ai_extractor._process_single_product_no_trigger(
                collection_name='filter_taps',
                url=url,
                generate_content=False
            )

            if result and result.get('success'):
                extracted_data = result.get('extracted_data', {})
                field_count = len(extracted_data)
                print(f"  ✅ Extracted {field_count} fields: {list(extracted_data.keys())[:5]}...")

                # Queue for batch write
                batch_updates.append({
                    'row_num': row_num,
                    'data': extracted_data
                })
                results['succeeded'] += 1

                # Write batch every BATCH_SIZE products
                if len(batch_updates) >= BATCH_SIZE:
                    print(f"\n💾 Writing batch of {len(batch_updates)} products to Google Sheets...")
                    write_result = sheets_manager.bulk_update_products(
                        'filter_taps',
                        batch_updates,
                        overwrite_mode=False
                    )
                    print(f"  ✅ Wrote {write_result['success_count']}/{len(batch_updates)} products")
                    batch_updates = []
                    time.sleep(1)  # Brief pause to avoid rate limits
            else:
                error_msg = result.get('error', 'Unknown error') if result else 'No result'
                print(f"  ❌ Failed: {error_msg}")
                results['failed'] += 1

        except Exception as e:
            print(f"  ❌ Error: {e}")
            results['failed'] += 1

        # Progress update
        if (idx + 1) % 10 == 0:
            print(f"\n📊 Progress: {idx + 1}/{total} ({int((idx + 1) / total * 100)}%)")
            print(f"   Succeeded: {results['succeeded']}, Failed: {results['failed']}")

    # Write remaining batch
    if batch_updates:
        print(f"\n💾 Writing final batch of {len(batch_updates)} products to Google Sheets...")
        write_result = sheets_manager.bulk_update_products(
            'filter_taps',
            batch_updates,
            overwrite_mode=False
        )
        print(f"  ✅ Wrote {write_result['success_count']}/{len(batch_updates)} products")

    # Final results
    print("\n" + "=" * 80)
    print("🎉 Extraction Complete!")
    print("=" * 80)
    print(f"Total Processed: {total}")
    print(f"Succeeded: {results['succeeded']}")
    print(f"Failed: {results['failed']}")
    print(f"Success Rate: {int(results['succeeded'] / total * 100)}%")
    print("\n✅ Data has been written to Google Sheets!")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
