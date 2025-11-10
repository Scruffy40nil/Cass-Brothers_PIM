#!/usr/bin/env python3
"""
Test that toilets collection uses the correct URL field for extraction
"""
from config.collections import get_collection_config

def test_toilets_url_field():
    """Test that toilets uses shopify_spec_sheet field"""
    print("=" * 80)
    print("Testing Toilets Collection URL Field Configuration")
    print("=" * 80)
    print()

    # Get toilets collection config
    config = get_collection_config('toilets')

    # Check if url_field_for_extraction is set
    url_field = getattr(config, 'url_field_for_extraction', 'url')

    print(f"Collection: toilets")
    print(f"URL field for extraction: {url_field}")
    print()

    if url_field == 'shopify_spec_sheet':
        print("✅ CORRECT: Toilets will use Column AJ (shopify_spec_sheet) for extraction")
        print()
        print("This means:")
        print("  - Google Apps Script sends row numbers like [2, 3, 4, 5]")
        print("  - Python API looks up those rows in Google Sheet")
        print("  - Python API gets URLs from Column AJ (shopify_spec_sheet)")
        print("  - PDFs like https://s3.ap-southeast-2.amazonaws.com/.../371380.pdf will be found")
        print()
        return True
    else:
        print(f"❌ WRONG: Toilets is using '{url_field}' field")
        print()
        print("This means:")
        print("  - Google Apps Script sends row numbers like [2, 3, 4, 5]")
        print("  - Python API looks up those rows in Google Sheet")
        print(f"  - Python API gets URLs from Column A ({url_field})")
        print("  - Spec sheet URLs in Column AJ won't be found")
        print("  - Error: 'No URLs match selected rows'")
        print()
        return False

if __name__ == '__main__':
    success = test_toilets_url_field()
    print("=" * 80)
    if success:
        print("✅ Configuration is correct!")
        print()
        print("Next steps:")
        print("1. Deploy this fix to PythonAnywhere:")
        print("   cd ~/mysite && git pull origin main")
        print("2. Reload web app in PythonAnywhere dashboard")
        print("3. Run bulk extraction from Google Sheet")
    else:
        print("❌ Configuration needs to be fixed")
    print("=" * 80)
