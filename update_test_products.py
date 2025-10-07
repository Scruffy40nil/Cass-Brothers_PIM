#!/usr/bin/env python3
"""
Manually set collection for test products
"""

import sys
import os
import sqlite3

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core.supplier_db import get_supplier_db

def main():
    supplier_db = get_supplier_db()

    # Get all test products
    conn = sqlite3.connect(supplier_db.db_path)
    cursor = conn.cursor()

    # Update all products to be detected as sinks with high confidence
    # (since they're all bowl sinks from Abey)
    cursor.execute('''
        UPDATE supplier_products
        SET detected_collection = 'sinks',
            confidence_score = 0.95
        WHERE supplier_name = 'Abey'
    ''')

    rows_updated = cursor.rowcount
    conn.commit()
    conn.close()

    print(f"✅ Updated {rows_updated} products to 'sinks' collection")

    # Show stats
    stats = supplier_db.get_statistics()
    print(f"\n📈 Database Statistics:")
    print(f"  - Total Products: {stats['total_products']}")
    print(f"  - By Collection:")
    for collection, count in stats['by_collection'].items():
        print(f"    - {collection}: {count}")

if __name__ == '__main__':
    main()
