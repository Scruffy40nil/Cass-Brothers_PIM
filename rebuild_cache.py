#!/usr/bin/env python3
"""
Rebuild SQLite cache from Google Sheets
Run this if your cache gets out of sync
"""

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.db_cache import get_db_cache
from core.sheets_manager import get_sheets_manager
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def rebuild_cache(collection_name):
    """Rebuild cache for a specific collection"""

    print(f"\n{'='*60}")
    print(f"REBUILDING CACHE FOR: {collection_name}")
    print(f"{'='*60}\n")

    db_cache = get_db_cache()
    sheets_manager = get_sheets_manager()

    # Step 1: Clear existing cache
    print("Step 1: Clearing existing cache...")
    db_cache.clear_cache(collection_name)
    print("✅ Cache cleared\n")

    # Step 2: Fetch all products from Google Sheets
    print("Step 2: Fetching products from Google Sheets...")
    products = sheets_manager.get_all_products(collection_name)

    if not products:
        print("❌ No products found in Google Sheets")
        return False

    print(f"✅ Fetched {len(products)} products from Google Sheets\n")

    # Step 3: Cache all products
    print("Step 3: Caching products in SQLite...")
    cached_count = 0

    for row_num, product in products.items():
        try:
            db_cache.cache_product(collection_name, row_num, product)
            cached_count += 1

            if cached_count % 50 == 0:
                print(f"   Cached {cached_count}/{len(products)} products...")
        except Exception as e:
            logger.error(f"Error caching product at row {row_num}: {e}")

    print(f"✅ Cached {cached_count} products\n")

    # Step 4: Verify
    print("Step 4: Verifying cache...")
    stats = db_cache.get_cache_stats()
    collection_count = stats.get('by_collection', {}).get(collection_name, 0)

    print(f"✅ Cache now contains {collection_count} products for {collection_name}\n")

    print(f"{'='*60}")
    print("REBUILD COMPLETE!")
    print(f"{'='*60}\n")

    return True


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 rebuild_cache.py <collection_name>")
        print("Example: python3 rebuild_cache.py sinks")
        sys.exit(1)

    collection_name = sys.argv[1]
    success = rebuild_cache(collection_name)

    if not success:
        sys.exit(1)
