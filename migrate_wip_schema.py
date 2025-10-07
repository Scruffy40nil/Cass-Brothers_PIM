#!/usr/bin/env python3
"""
Migration script to update WIP products schema
Adds new columns: sheet_row_number, generated_content, error_message
"""

import sqlite3
import os
import sys

def migrate_wip_schema(db_path=None):
    """Add new columns to wip_products table"""

    if db_path is None:
        # Default to project directory
        project_dir = os.path.dirname(os.path.abspath(__file__))
        db_path = os.path.join(project_dir, 'supplier_products.db')

    if not os.path.exists(db_path):
        print(f"❌ Database not found at: {db_path}")
        return False

    print(f"📊 Migrating database: {db_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Get existing columns
    cursor.execute("PRAGMA table_info(wip_products)")
    existing_columns = [row[1] for row in cursor.fetchall()]
    print(f"📋 Existing columns: {', '.join(existing_columns)}")

    columns_to_add = []

    # Check and add sheet_row_number
    if 'sheet_row_number' not in existing_columns:
        columns_to_add.append(('sheet_row_number', 'INTEGER'))

    # Check and add generated_content
    if 'generated_content' not in existing_columns:
        columns_to_add.append(('generated_content', 'TEXT'))

    # Check and add error_message
    if 'error_message' not in existing_columns:
        columns_to_add.append(('error_message', 'TEXT'))

    if not columns_to_add:
        print("✅ Database schema is already up to date!")
        conn.close()
        return True

    # Add missing columns
    for column_name, column_type in columns_to_add:
        try:
            print(f"➕ Adding column: {column_name} ({column_type})")
            cursor.execute(f"ALTER TABLE wip_products ADD COLUMN {column_name} {column_type}")
            print(f"   ✅ Added {column_name}")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e):
                print(f"   ⚠️  Column {column_name} already exists")
            else:
                print(f"   ❌ Error adding {column_name}: {e}")
                conn.close()
                return False

    conn.commit()

    # Verify the changes
    cursor.execute("PRAGMA table_info(wip_products)")
    updated_columns = [row[1] for row in cursor.fetchall()]
    print(f"\n✅ Migration complete!")
    print(f"📋 Updated columns: {', '.join(updated_columns)}")

    conn.close()
    return True


if __name__ == '__main__':
    print("=" * 60)
    print("WIP PRODUCTS SCHEMA MIGRATION")
    print("=" * 60)
    print()

    # Allow custom database path as argument
    db_path = sys.argv[1] if len(sys.argv) > 1 else None

    success = migrate_wip_schema(db_path)

    if success:
        print("\n🎉 Migration successful!")
        print("\nYou can now use the WIP retry feature.")
    else:
        print("\n❌ Migration failed!")
        sys.exit(1)
