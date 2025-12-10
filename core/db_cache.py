"""
SQLite Database Cache for Product Data
Provides fast local caching of Google Sheets data
"""
import sqlite3
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
from pathlib import Path

logger = logging.getLogger(__name__)

class DatabaseCache:
    """SQLite-based cache for product data"""

    def __init__(self, db_path: str = None):
        # Default to project directory for better persistence on PythonAnywhere
        if db_path is None:
            import os
            project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            db_path = os.path.join(project_dir, 'pim_cache.db')
        """Initialize database cache

        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self._init_database()

    def _init_database(self):
        """Initialize database schema"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Products table - stores all product data as JSON
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS products (
                    collection TEXT NOT NULL,
                    row_number INTEGER NOT NULL,
                    data TEXT NOT NULL,
                    last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (collection, row_number)
                )
            ''')

            # Sync log table - tracks sync history
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sync_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    collection TEXT NOT NULL,
                    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    products_count INTEGER NOT NULL,
                    sync_duration_seconds REAL,
                    status TEXT DEFAULT 'success'
                )
            ''')

            # Index for faster lookups
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_collection
                ON products(collection)
            ''')

            conn.commit()
            conn.close()
            logger.info(f"✅ Database initialized at {self.db_path}")
        except Exception as e:
            logger.error(f"❌ Failed to initialize database: {e}")
            raise

    def get_all_products(self, collection_name: str) -> Optional[Dict[int, Dict[str, Any]]]:
        """Get all products for a collection from cache

        Args:
            collection_name: Name of the collection

        Returns:
            Dictionary of products keyed by row_number, or None if not cached
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute('''
                SELECT row_number, data
                FROM products
                WHERE collection = ?
                ORDER BY row_number
            ''', (collection_name,))

            rows = cursor.fetchall()
            conn.close()

            if not rows:
                logger.info(f"📭 No cached data found for {collection_name}")
                return None

            # Convert to dictionary format
            products = {}
            for row_number, data_json in rows:
                products[row_number] = json.loads(data_json)

            logger.info(f"✅ Loaded {len(products)} products from cache for {collection_name}")
            return products

        except Exception as e:
            logger.error(f"❌ Failed to get products from cache: {e}")
            return None

    def save_all_products(self, collection_name: str, products: Dict[int, Dict[str, Any]],
                         sync_duration: float = 0) -> bool:
        """Save all products for a collection to cache

        Args:
            collection_name: Name of the collection
            products: Dictionary of products keyed by row_number
            sync_duration: Time taken to sync (seconds)

        Returns:
            True if successful, False otherwise
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Delete existing products for this collection
            cursor.execute('DELETE FROM products WHERE collection = ?', (collection_name,))

            # Insert all products
            for row_number, product_data in products.items():
                cursor.execute('''
                    INSERT INTO products (collection, row_number, data, last_synced)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ''', (collection_name, row_number, json.dumps(product_data)))

            # Log sync
            cursor.execute('''
                INSERT INTO sync_log (collection, products_count, sync_duration_seconds)
                VALUES (?, ?, ?)
            ''', (collection_name, len(products), sync_duration))

            conn.commit()
            conn.close()

            logger.info(f"✅ Saved {len(products)} products to cache for {collection_name}")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to save products to cache: {e}")
            return False

    def update_single_product(self, collection_name: str, row_number: int,
                             product_data: Dict[str, Any]) -> bool:
        """Update a single product in the cache

        Args:
            collection_name: Name of the collection
            row_number: Row number of the product
            product_data: Updated product data

        Returns:
            True if successful, False otherwise
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Check if product exists
            cursor.execute('''
                SELECT COUNT(*) FROM products
                WHERE collection = ? AND row_number = ?
            ''', (collection_name, row_number))

            exists = cursor.fetchone()[0] > 0

            if exists:
                # Update existing product
                cursor.execute('''
                    UPDATE products
                    SET data = ?, last_synced = CURRENT_TIMESTAMP
                    WHERE collection = ? AND row_number = ?
                ''', (json.dumps(product_data), collection_name, row_number))
                logger.info(f"✅ Updated product {row_number} in cache for {collection_name}")
            else:
                # Insert new product
                cursor.execute('''
                    INSERT INTO products (collection, row_number, data, last_synced)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ''', (collection_name, row_number, json.dumps(product_data)))
                logger.info(f"✅ Inserted new product {row_number} in cache for {collection_name}")

            conn.commit()
            conn.close()
            return True

        except Exception as e:
            logger.error(f"❌ Failed to update product in cache: {e}")
            return False

    def update_product_fields(self, collection_name: str, row_number: int,
                              fields: Dict[str, Any]) -> bool:
        """Update specific fields of a product in the cache (faster than full replacement)

        Args:
            collection_name: Name of the collection
            row_number: Row number of the product
            fields: Dictionary of field names and values to update

        Returns:
            True if successful, False otherwise
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Get existing product data
            cursor.execute('''
                SELECT data FROM products
                WHERE collection = ? AND row_number = ?
            ''', (collection_name, row_number))

            row = cursor.fetchone()
            if row:
                # Merge new fields into existing data
                existing_data = json.loads(row[0])
                existing_data.update(fields)

                # Update with merged data
                cursor.execute('''
                    UPDATE products
                    SET data = ?, last_synced = CURRENT_TIMESTAMP
                    WHERE collection = ? AND row_number = ?
                ''', (json.dumps(existing_data), collection_name, row_number))
                logger.info(f"✅ Updated {len(fields)} fields for product {row_number} in cache")
            else:
                # Product doesn't exist in cache, insert it
                cursor.execute('''
                    INSERT INTO products (collection, row_number, data, last_synced)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ''', (collection_name, row_number, json.dumps(fields)))
                logger.info(f"✅ Inserted new product {row_number} in cache with {len(fields)} fields")

            conn.commit()
            conn.close()
            return True

        except Exception as e:
            logger.error(f"❌ Failed to update product fields in cache: {e}")
            return False

    def delete_product(self, collection_name: str, row_number: int) -> bool:
        """Delete a product from the cache

        Args:
            collection_name: Name of the collection
            row_number: Row number of the product to delete

        Returns:
            True if successful, False otherwise
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute('''
                DELETE FROM products
                WHERE collection = ? AND row_number = ?
            ''', (collection_name, row_number))

            deleted_count = cursor.rowcount
            conn.commit()
            conn.close()

            if deleted_count > 0:
                logger.info(f"✅ Deleted product {row_number} from cache for {collection_name}")
                return True
            else:
                logger.warning(f"⚠️ Product {row_number} not found in cache for {collection_name}")
                return False

        except Exception as e:
            logger.error(f"❌ Failed to delete product from cache: {e}")
            return False

    def clear_collection_cache(self, collection_name: str) -> bool:
        """Clear all cached products for a specific collection

        Args:
            collection_name: Name of the collection to clear

        Returns:
            True if successful, False otherwise
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute('''
                DELETE FROM products
                WHERE collection = ?
            ''', (collection_name,))

            deleted_count = cursor.rowcount
            conn.commit()
            conn.close()

            logger.info(f"✅ Cleared {deleted_count} products from cache for {collection_name}")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to clear collection cache: {e}")
            return False

    def get_last_sync_time(self, collection_name: str) -> Optional[datetime]:
        """Get the last sync timestamp for a collection

        Args:
            collection_name: Name of the collection

        Returns:
            Datetime of last sync, or None if never synced
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute('''
                SELECT synced_at
                FROM sync_log
                WHERE collection = ? AND status = 'success'
                ORDER BY synced_at DESC
                LIMIT 1
            ''', (collection_name,))

            row = cursor.fetchone()
            conn.close()

            if row:
                return datetime.fromisoformat(row[0])
            return None

        except Exception as e:
            logger.error(f"❌ Failed to get last sync time: {e}")
            return None

    def get_sync_history(self, collection_name: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get sync history for a collection

        Args:
            collection_name: Name of the collection
            limit: Maximum number of records to return

        Returns:
            List of sync records
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            cursor.execute('''
                SELECT synced_at, products_count, sync_duration_seconds, status
                FROM sync_log
                WHERE collection = ?
                ORDER BY synced_at DESC
                LIMIT ?
            ''', (collection_name, limit))

            rows = cursor.fetchall()
            conn.close()

            history = []
            for row in rows:
                history.append({
                    'synced_at': row[0],
                    'products_count': row[1],
                    'sync_duration_seconds': row[2],
                    'status': row[3]
                })

            return history

        except Exception as e:
            logger.error(f"❌ Failed to get sync history: {e}")
            return []

    def is_cache_valid(self, collection_name: str, max_age_seconds: int = 300) -> bool:
        """Check if cache is valid (not too old)

        Args:
            collection_name: Name of the collection
            max_age_seconds: Maximum age in seconds (default 5 minutes)

        Returns:
            True if cache is valid, False otherwise
        """
        last_sync = self.get_last_sync_time(collection_name)
        if not last_sync:
            return False

        age_seconds = (datetime.now() - last_sync).total_seconds()
        return age_seconds < max_age_seconds

    def clear_cache(self, collection_name: Optional[str] = None) -> bool:
        """Clear cache for a collection or all collections

        Args:
            collection_name: Name of collection to clear, or None for all

        Returns:
            True if successful
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            if collection_name:
                cursor.execute('DELETE FROM products WHERE collection = ?', (collection_name,))
                logger.info(f"🗑️ Cleared cache for {collection_name}")
            else:
                cursor.execute('DELETE FROM products')
                logger.info("🗑️ Cleared all cache")

            conn.commit()
            conn.close()
            return True

        except Exception as e:
            logger.error(f"❌ Failed to clear cache: {e}")
            return False

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get statistics about the cache

        Returns:
            Dictionary with cache statistics
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Get products count per collection
            cursor.execute('''
                SELECT collection, COUNT(*) as count
                FROM products
                GROUP BY collection
            ''')
            collections = dict(cursor.fetchall())

            # Get total size
            cursor.execute("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")
            db_size = cursor.fetchone()[0]

            # Get last sync for each collection
            cursor.execute('''
                SELECT collection, MAX(synced_at) as last_sync
                FROM sync_log
                WHERE status = 'success'
                GROUP BY collection
            ''')
            last_syncs = dict(cursor.fetchall())

            conn.close()

            return {
                'collections': collections,
                'total_products': sum(collections.values()),
                'database_size_bytes': db_size,
                'last_syncs': last_syncs
            }

        except Exception as e:
            logger.error(f"❌ Failed to get cache stats: {e}")
            return {}


# Singleton instance
_db_cache = None

def get_db_cache() -> DatabaseCache:
    """Get singleton database cache instance"""
    global _db_cache
    if _db_cache is None:
        _db_cache = DatabaseCache()
    return _db_cache
