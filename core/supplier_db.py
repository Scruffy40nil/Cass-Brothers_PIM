"""
Supplier Product Database Manager
Handles supplier product catalog and work-in-progress tracking
"""

import sqlite3
import json
import os
from datetime import datetime
from typing import Optional, Dict, List, Any
import logging

logger = logging.getLogger(__name__)


class SupplierDatabase:
    """Manage supplier products and WIP tracking"""

    def __init__(self, db_path: str = None):
        """Initialize supplier database"""
        if db_path is None:
            # Store in project directory alongside main cache
            project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            db_path = os.path.join(project_dir, 'supplier_products.db')

        self.db_path = db_path
        self._init_database()
        logger.info(f"✅ Supplier database initialized: {db_path}")

    def _init_database(self):
        """Create database tables if they don't exist"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Supplier product catalog
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS supplier_products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sku TEXT UNIQUE NOT NULL,
                supplier_name TEXT NOT NULL,
                product_url TEXT NOT NULL,
                product_name TEXT,
                image_url TEXT,
                detected_collection TEXT,
                confidence_score REAL,
                scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Create indexes for fast lookups
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_sku ON supplier_products(sku)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_supplier ON supplier_products(supplier_name)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_collection ON supplier_products(detected_collection)
        ''')

        # Work-in-progress products
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS wip_products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_product_id INTEGER NOT NULL,
                collection_name TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                extracted_data TEXT,
                user_notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                FOREIGN KEY (supplier_product_id) REFERENCES supplier_products(id)
            )
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_wip_collection ON wip_products(collection_name)
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_wip_status ON wip_products(status)
        ''')

        conn.commit()
        conn.close()

    def import_from_csv(self, csv_data: List[Dict[str, str]], auto_extract_images: bool = True) -> Dict[str, Any]:
        """
        Import supplier products from CSV data

        Expected CSV columns:
        - sku: Product SKU
        - supplier_name: Supplier name
        - product_url: Product page URL
        - product_name: (optional) Product name
        - image_url: (optional) Direct image URL

        Args:
            csv_data: List of product dictionaries
            auto_extract_images: If True, automatically extract images from product URLs

        Returns dict with import statistics
        """
        from .image_extractor import extract_og_image
        from .collection_detector import detect_collection

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        imported = 0
        updated = 0
        skipped = 0
        images_extracted = 0
        errors = []

        for row in csv_data:
            try:
                sku = row.get('sku', '').strip()
                supplier_name = row.get('supplier_name', '').strip()
                product_url = row.get('product_url', '').strip()
                product_name = row.get('product_name', '').strip()
                image_url = row.get('image_url', '').strip()

                if not sku or not supplier_name or not product_url:
                    skipped += 1
                    continue

                # Auto-extract image if not provided and auto_extract is enabled
                if auto_extract_images and not image_url and product_url:
                    try:
                        logger.info(f"Extracting image for {sku}...")
                        extracted_image = extract_og_image(product_url, timeout=15)
                        if extracted_image:
                            image_url = extracted_image
                            images_extracted += 1
                            logger.info(f"✅ Extracted image for {sku}")
                    except Exception as e:
                        logger.warning(f"Failed to extract image for {sku}: {e}")

                # Auto-detect collection
                detected_collection = None
                confidence_score = 0.0
                if product_name or product_url:
                    detected_collection, confidence_score = detect_collection(
                        product_name or '', product_url
                    )

                # Check if SKU already exists
                cursor.execute('SELECT id FROM supplier_products WHERE sku = ?', (sku,))
                existing = cursor.fetchone()

                if existing:
                    # Update existing record
                    cursor.execute('''
                        UPDATE supplier_products
                        SET supplier_name = ?, product_url = ?, product_name = ?,
                            image_url = ?, detected_collection = ?, confidence_score = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE sku = ?
                    ''', (supplier_name, product_url, product_name, image_url,
                          detected_collection, confidence_score, sku))
                    updated += 1
                else:
                    # Insert new record
                    cursor.execute('''
                        INSERT INTO supplier_products
                        (sku, supplier_name, product_url, product_name, image_url,
                         detected_collection, confidence_score)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (sku, supplier_name, product_url, product_name, image_url,
                          detected_collection, confidence_score))
                    imported += 1

            except Exception as e:
                errors.append(f"Row {row}: {str(e)}")
                logger.error(f"Error importing row: {e}")

        conn.commit()
        conn.close()

        result = {
            'imported': imported,
            'updated': updated,
            'skipped': skipped,
            'images_extracted': images_extracted,
            'errors': errors,
            'total_processed': imported + updated + skipped
        }

        logger.info(f"📊 Import complete: {result}")
        return result

    def search_by_sku(self, sku_list: List[str]) -> List[Dict[str, Any]]:
        """Search for products by SKU list"""
        if not sku_list:
            return []

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        placeholders = ','.join('?' * len(sku_list))
        query = f'''
            SELECT * FROM supplier_products
            WHERE sku IN ({placeholders})
        '''

        cursor.execute(query, sku_list)
        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def get_by_collection(self, collection_name: str, confidence_threshold: float = 0.9) -> List[Dict[str, Any]]:
        """Get products detected for a specific collection with high confidence"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT * FROM supplier_products
            WHERE detected_collection = ? AND confidence_score >= ?
            ORDER BY confidence_score DESC
        ''', (collection_name, confidence_threshold))

        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def update_collection_detection(self, sku: str, collection_name: str, confidence: float):
        """Update the detected collection for a product"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            UPDATE supplier_products
            SET detected_collection = ?, confidence_score = ?, updated_at = CURRENT_TIMESTAMP
            WHERE sku = ?
        ''', (collection_name, confidence, sku))

        conn.commit()
        conn.close()

    def add_to_wip(self, supplier_product_id: int, collection_name: str) -> int:
        """Add a supplier product to work-in-progress"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO wip_products (supplier_product_id, collection_name, status)
            VALUES (?, ?, 'pending')
        ''', (supplier_product_id, collection_name))

        wip_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return wip_id

    def get_wip_products(self, collection_name: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get work-in-progress products for a collection"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        if status:
            cursor.execute('''
                SELECT w.*, s.*
                FROM wip_products w
                JOIN supplier_products s ON w.supplier_product_id = s.id
                WHERE w.collection_name = ? AND w.status = ?
                ORDER BY w.created_at DESC
            ''', (collection_name, status))
        else:
            cursor.execute('''
                SELECT w.*, s.*
                FROM wip_products w
                JOIN supplier_products s ON w.supplier_product_id = s.id
                WHERE w.collection_name = ?
                ORDER BY w.created_at DESC
            ''', (collection_name,))

        rows = cursor.fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def update_wip_status(self, wip_id: int, status: str, extracted_data: Optional[Dict] = None):
        """Update WIP product status"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        if extracted_data:
            cursor.execute('''
                UPDATE wip_products
                SET status = ?, extracted_data = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (status, json.dumps(extracted_data), wip_id))
        else:
            cursor.execute('''
                UPDATE wip_products
                SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (status, wip_id))

        conn.commit()
        conn.close()

    def complete_wip(self, wip_id: int):
        """Mark WIP product as completed"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            UPDATE wip_products
            SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (wip_id,))

        conn.commit()
        conn.close()

    def get_statistics(self) -> Dict[str, Any]:
        """Get database statistics"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Total supplier products
        cursor.execute('SELECT COUNT(*) FROM supplier_products')
        total_products = cursor.fetchone()[0]

        # Products by collection
        cursor.execute('''
            SELECT detected_collection, COUNT(*) as count
            FROM supplier_products
            WHERE detected_collection IS NOT NULL
            GROUP BY detected_collection
        ''')
        by_collection = {row[0]: row[1] for row in cursor.fetchall()}

        # WIP statistics
        cursor.execute('''
            SELECT status, COUNT(*) as count
            FROM wip_products
            GROUP BY status
        ''')
        wip_by_status = {row[0]: row[1] for row in cursor.fetchall()}

        conn.close()

        return {
            'total_products': total_products,
            'by_collection': by_collection,
            'wip_by_status': wip_by_status
        }


# Singleton instance
_supplier_db_instance = None


def get_supplier_db() -> SupplierDatabase:
    """Get singleton supplier database instance"""
    global _supplier_db_instance
    if _supplier_db_instance is None:
        _supplier_db_instance = SupplierDatabase()
    return _supplier_db_instance
