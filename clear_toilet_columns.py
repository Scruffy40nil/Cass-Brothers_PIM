#!/usr/bin/env python3
"""
Clear corrupted data from toilet specification columns (I through AA)
This prepares the sheet for fresh AI extraction with correct column mapping
"""

import sys
import time
from config.settings import get_settings
from core.sheets_manager import get_sheets_manager

def clear_toilet_specification_columns():
    """Clear columns I through AA (except S) for all toilet products"""

    settings = get_settings()
    sheets_manager = get_sheets_manager()

    collection_name = 'toilets'

    print(f"🧹 Clearing corrupted data from {collection_name} collection...")
    print(f"📋 Columns to clear: I through R and T through AA")
    print(f"📋 Preserving column S (shopify_spec_sheet / PDF URLs)")
    print()

    # Get worksheet
    worksheet = sheets_manager.get_worksheet(collection_name)
    if not worksheet:
        print(f"❌ Could not access worksheet for {collection_name}")
        return False

    # Get all data to determine number of rows
    all_values = worksheet.get_all_values()
    total_rows = len(all_values)

    if total_rows < 2:
        print("❌ No data rows found (only header row)")
        return False

    data_rows = total_rows - 1
    print(f"📊 Found {data_rows} data rows to process")
    print()

    # Confirm with user
    print("⚠️  WARNING: This will clear the following columns for all products:")
    print("   - I: installation_type")
    print("   - J: product_material")
    print("   - K: style")
    print("   - L: warranty_years")
    print("   - M: trap_type")
    print("   - N: actuation_type")
    print("   - O: inlet_type")
    print("   - P: wels_rating")
    print("   - Q: model_name")
    print("   - R: overall_width_depth_height_mm")
    print("   - S: product_specifications.pdf_urls")
    print("   - T: toilet_specifications.pan_height_mm")
    print("   - U: specifications.mount_type")
    print("   - V: flow_rate_L_per_min")
    print("   - W: wels_product_registration_number")
    print("   - X: application_location")
    print("   - Y: toilet_smart_functions")
    print("   - Z: toilet_seat_type")
    print("   - AA: toilet_rim_design")
    print()

    response = input("Type 'yes' to proceed: ").strip().lower()
    if response != 'yes':
        print("❌ Operation cancelled")
        return False

    print()
    print("🧹 Clearing columns...")

    # Clear columns I through AA (positions 9-27) for all data rows
    # Row 1 is headers, so data starts at row 2
    start_row = 2
    end_row = total_rows

    # Column range: I (9) to AA (27)
    start_col = 9
    end_col = 27
    num_cols = end_col - start_col + 1

    # Create empty data array
    empty_data = [[''] * num_cols for _ in range(data_rows)]

    # Convert column numbers to A1 notation range
    # I2:AA{total_rows}
    range_notation = f"I2:AA{total_rows}"

    print(f"📝 Updating range: {range_notation}")
    print(f"   ({data_rows} rows × {num_cols} columns = {data_rows * num_cols} cells)")

    try:
        # Update the range with empty values
        worksheet.update(range_notation, empty_data, value_input_option='RAW')

        print()
        print(f"✅ Successfully cleared {data_rows * num_cols} cells")
        print(f"✅ Columns I-AA are now ready for fresh AI extraction")
        print()
        print("📝 Next steps:")
        print("   1. On PythonAnywhere, run: cd ~/mysite && git pull origin main")
        print("   2. Reload your web app")
        print("   3. Re-run AI extraction on your toilet products")
        print()

        return True

    except Exception as e:
        print(f"❌ Error clearing columns: {e}")
        return False

if __name__ == '__main__':
    try:
        success = clear_toilet_specification_columns()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⚠️  Operation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
