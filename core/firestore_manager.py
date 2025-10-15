"""
Firestore Manager - Cloud Database for Product Information Management
Replaces Google Sheets for scalable storage of 30,000+ products
"""
import json
import logging
import time
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    logging.warning("Firebase Admin SDK not installed. Run: pip install firebase-admin")

from config.settings import get_settings
from config.collections import get_collection_config
from config.validation import validate_product_data

logger = logging.getLogger(__name__)

class FirestoreManager:
    """
    Firestore-based product database manager

    Collections structure:
    - collections/{collection_name}/products/{row_number}
    - collections/{collection_name}/wip_products/{wip_id}
    - collections/{collection_name}/metadata/stats
    """

    def __init__(self):
        self.db = None
        self.settings = get_settings()
        self._initialized = False

        if FIREBASE_AVAILABLE:
            self.setup_firestore()

    def setup_firestore(self) -> bool:
        """Initialize Firestore connection"""
        try:
            if self._initialized:
                return True

            # Check if Firebase is already initialized
            if not firebase_admin._apps:
                # Load credentials from settings (same as Google Sheets)
                if self.settings.GOOGLE_CREDENTIALS_JSON:
                    if self.settings.GOOGLE_CREDENTIALS_JSON.startswith('{'):
                        creds_dict = json.loads(self.settings.GOOGLE_CREDENTIALS_JSON)
                    else:
                        with open(self.settings.GOOGLE_CREDENTIALS_JSON, 'r') as f:
                            creds_dict = json.load(f)

                    # Initialize Firebase Admin SDK
                    cred = credentials.Certificate(creds_dict)
                    firebase_admin.initialize_app(cred)
                    logger.info("✅ Firebase Admin SDK initialized")
                else:
                    logger.error("❌ No Google credentials found for Firestore")
                    return False

            # Get Firestore client
            self.db = firestore.client()
            self._initialized = True
            logger.info("✅ Firestore connection established")
            return True

        except Exception as e:
            logger.error(f"❌ Firestore initialization failed: {e}")
            return False

    def get_collection_ref(self, collection_name: str):
        """Get Firestore collection reference for a product collection"""
        if not self.db:
            return None
        return self.db.collection('collections').document(collection_name).collection('products')

    def get_single_product(self, collection_name: str, row_num: int) -> Optional[Dict[str, Any]]:
        """
        Get a single product by row number

        Args:
            collection_name: Name of the collection (e.g., 'sinks', 'lighting')
            row_num: Row number (unique ID for each product)

        Returns:
            Product data dict or None if not found
        """
        try:
            if not self.db:
                logger.error("Firestore not initialized")
                return None

            # Get product document
            product_ref = self.get_collection_ref(collection_name).document(str(row_num))
            product_doc = product_ref.get()

            if not product_doc.exists:
                logger.warning(f"Product not found: {collection_name} row {row_num}")
                return None

            product_data = product_doc.to_dict()
            product_data['row_number'] = row_num  # Add row number to data

            logger.debug(f"✅ Retrieved product {row_num} from {collection_name}")
            return product_data

        except Exception as e:
            logger.error(f"Error retrieving product {row_num} from {collection_name}: {e}")
            return None

    def get_all_products(self, collection_name: str) -> Dict[int, Dict[str, Any]]:
        """
        Get all products from a collection

        Returns:
            Dict mapping row numbers to product data
        """
        try:
            if not self.db:
                logger.error("Firestore not initialized")
                return {}

            start_time = time.time()
            products = {}

            # Query all products in the collection
            products_ref = self.get_collection_ref(collection_name)
            docs = products_ref.stream()

            for doc in docs:
                product_data = doc.to_dict()
                row_num = int(doc.id)  # Document ID is the row number
                product_data['row_number'] = row_num
                products[row_num] = product_data

            elapsed_time = (time.time() - start_time) * 1000
            logger.info(f"✅ Retrieved {len(products)} products from {collection_name} in {elapsed_time:.1f}ms")

            return products

        except Exception as e:
            logger.error(f"Error retrieving all products from {collection_name}: {e}")
            return {}

    def add_product(self, collection_name: str, data: Dict[str, Any]) -> int:
        """
        Add a new product to Firestore

        Args:
            collection_name: Collection name
            data: Product data

        Returns:
            Row number of the new product
        """
        try:
            if not self.db:
                raise Exception("Firestore not initialized")

            # Get the next row number
            next_row = self._get_next_row_number(collection_name)

            # Add metadata
            data['created_at'] = firestore.SERVER_TIMESTAMP
            data['updated_at'] = firestore.SERVER_TIMESTAMP
            data['row_number'] = next_row

            # Save to Firestore
            product_ref = self.get_collection_ref(collection_name).document(str(next_row))
            product_ref.set(data)

            logger.info(f"✅ Added product at row {next_row} to {collection_name}")

            # Update collection stats
            self._update_collection_stats(collection_name)

            return next_row

        except Exception as e:
            logger.error(f"Error adding product to {collection_name}: {e}")
            raise

    def update_product_row(self, collection_name: str, row_num: int, data: Dict[str, Any],
                          overwrite_mode: bool = True, allowed_fields: Optional[List[str]] = None) -> bool:
        """
        Update a product with selective field updating

        Args:
            collection_name: Collection name
            row_num: Row number to update
            data: Data to update
            overwrite_mode: Whether to overwrite existing data
            allowed_fields: List of allowed fields (None = all fields)

        Returns:
            True if successful
        """
        try:
            if not self.db:
                return False

            product_ref = self.get_collection_ref(collection_name).document(str(row_num))

            # Filter fields if needed
            update_data = {}
            for field, value in data.items():
                if allowed_fields is not None and field not in allowed_fields:
                    continue
                if not overwrite_mode and (value is None or str(value).strip() == ''):
                    continue
                update_data[field] = value

            if not update_data:
                logger.info(f"No fields to update for row {row_num}")
                return False

            # Add update timestamp
            update_data['updated_at'] = firestore.SERVER_TIMESTAMP

            # Update in Firestore
            product_ref.update(update_data)

            logger.info(f"✅ Updated {len(update_data)} fields in row {row_num} ({collection_name})")
            return True

        except Exception as e:
            logger.error(f"Error updating row {row_num} in {collection_name}: {e}")
            return False

    def update_single_field(self, collection_name: str, row_num: int, field: str, value: Any) -> bool:
        """Update a single field in a product"""
        return self.update_product_row(collection_name, row_num, {field: value}, overwrite_mode=True)

    def _get_next_row_number(self, collection_name: str) -> int:
        """Get the next available row number for a collection"""
        try:
            # Get metadata document that tracks the last row number
            metadata_ref = self.db.collection('collections').document(collection_name).collection('metadata').document('stats')
            metadata = metadata_ref.get()

            if metadata.exists:
                last_row = metadata.to_dict().get('last_row_number', 1)
                next_row = last_row + 1
            else:
                next_row = 2  # Start at row 2 (row 1 is headers in Google Sheets)

            # Update the metadata
            metadata_ref.set({'last_row_number': next_row}, merge=True)

            return next_row

        except Exception as e:
            logger.error(f"Error getting next row number: {e}")
            # Fallback: count existing products + 1
            products = self.get_all_products(collection_name)
            return max(products.keys()) + 1 if products else 2

    def _update_collection_stats(self, collection_name: str):
        """Update collection statistics"""
        try:
            products = self.get_all_products(collection_name)
            total_products = len(products)

            # Calculate quality stats
            total_quality = sum(p.get('quality_score', 0) for p in products.values())
            avg_quality = int(total_quality / total_products) if total_products > 0 else 0

            complete_products = sum(1 for p in products.values() if p.get('quality_score', 0) >= 80)

            stats = {
                'total_products': total_products,
                'complete_products': complete_products,
                'missing_info_products': total_products - complete_products,
                'avg_quality': avg_quality,
                'last_updated': firestore.SERVER_TIMESTAMP
            }

            # Save stats
            stats_ref = self.db.collection('collections').document(collection_name).collection('metadata').document('stats')
            stats_ref.set(stats, merge=True)

        except Exception as e:
            logger.error(f"Error updating collection stats: {e}")

    def get_collection_stats(self, collection_name: str) -> Dict[str, Any]:
        """Get statistics for a collection"""
        try:
            stats_ref = self.db.collection('collections').document(collection_name).collection('metadata').document('stats')
            stats_doc = stats_ref.get()

            if stats_doc.exists:
                return stats_doc.to_dict()
            else:
                # Calculate fresh if not cached
                products = self.get_all_products(collection_name)
                total = len(products)
                return {
                    'total_products': total,
                    'complete_products': 0,
                    'missing_info_products': total,
                    'avg_quality': 0
                }
        except Exception as e:
            logger.error(f"Error getting collection stats: {e}")
            return {'total_products': 0, 'complete_products': 0, 'missing_info_products': 0, 'avg_quality': 0}

    def validate_collection_access(self, collection_name: str) -> Tuple[bool, str]:
        """Validate Firestore access for a collection"""
        try:
            if not self.db:
                return False, "Firestore not initialized"

            # Try to read from the collection
            collection_ref = self.get_collection_ref(collection_name)
            # Just check if we can access it
            list(collection_ref.limit(1).stream())

            return True, f"Successfully validated access to {collection_name}"

        except Exception as e:
            return False, f"Validation error for {collection_name}: {str(e)}"

# Global instance
firestore_manager = FirestoreManager()

def get_firestore_manager() -> FirestoreManager:
    """Get the global Firestore manager instance"""
    return firestore_manager
