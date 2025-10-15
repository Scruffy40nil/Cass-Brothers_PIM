"""
Migration Script: Google Sheets → Firestore
Migrates all products from Google Sheets to Firestore database

Usage:
    python migrate_sheets_to_firestore.py --collection sinks
    python migrate_sheets_to_firestore.py --collection sinks --dry-run
    python migrate_sheets_to_firestore.py --all
"""
import argparse
import logging
import time
from typing import Dict, Any

from core.sheets_manager import get_sheets_manager
from core.firestore_manager import get_firestore_manager, FIREBASE_AVAILABLE
from config.collections import get_all_collections

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def migrate_collection(collection_name: str, dry_run: bool = False) -> Dict[str, Any]:
    """
    Migrate a single collection from Google Sheets to Firestore

    Args:
        collection_name: Name of the collection to migrate
        dry_run: If True, don't actually write to Firestore

    Returns:
        Migration statistics
    """
    logger.info(f"{'[DRY RUN] ' if dry_run else ''}Starting migration for collection: {collection_name}")

    sheets_manager = get_sheets_manager()
    firestore_manager = get_firestore_manager()

    if not FIREBASE_AVAILABLE:
        logger.error("Firebase Admin SDK not installed. Run: pip install firebase-admin")
        return {'success': False, 'error': 'Firebase not available'}

    stats = {
        'collection': collection_name,
        'total_products': 0,
        'migrated': 0,
        'failed': 0,
        'errors': []
    }

    try:
        # Fetch all products from Google Sheets
        logger.info(f"📊 Fetching all products from Google Sheets for {collection_name}...")
        start_time = time.time()

        products = sheets_manager.get_all_products(collection_name, force_refresh=True)

        fetch_time = time.time() - start_time
        stats['total_products'] = len(products)

        logger.info(f"✅ Fetched {len(products)} products from Google Sheets in {fetch_time:.2f}s")

        if not products:
            logger.warning(f"No products found in {collection_name}")
            return stats

        # Migrate each product to Firestore
        logger.info(f"🔄 {'[DRY RUN] ' if dry_run else ''}Migrating products to Firestore...")

        for row_num, product_data in products.items():
            try:
                if dry_run:
                    logger.debug(f"[DRY RUN] Would migrate product at row {row_num}")
                    stats['migrated'] += 1
                else:
                    # Save to Firestore using row number as document ID
                    firestore_manager.get_collection_ref(collection_name).document(str(row_num)).set(product_data)
                    stats['migrated'] += 1

                    if stats['migrated'] % 100 == 0:
                        logger.info(f"Progress: {stats['migrated']}/{stats['total_products']} products migrated")

            except Exception as e:
                stats['failed'] += 1
                error_msg = f"Failed to migrate row {row_num}: {str(e)}"
                stats['errors'].append(error_msg)
                logger.error(error_msg)

        # Update collection metadata
        if not dry_run:
            logger.info("📊 Updating collection metadata...")
            firestore_manager._update_collection_stats(collection_name)

            # Set last row number
            metadata_ref = firestore_manager.db.collection('collections').document(collection_name).collection('metadata').document('stats')
            metadata_ref.set({'last_row_number': max(products.keys())}, merge=True)

        # Final stats
        end_time = time.time()
        total_time = end_time - start_time

        logger.info("=" * 60)
        logger.info(f"Migration {'[DRY RUN] ' if dry_run else ''}Complete for {collection_name}")
        logger.info(f"Total products: {stats['total_products']}")
        logger.info(f"Successfully migrated: {stats['migrated']}")
        logger.info(f"Failed: {stats['failed']}")
        logger.info(f"Total time: {total_time:.2f}s")
        logger.info(f"Average: {total_time/stats['total_products']:.3f}s per product")
        logger.info("=" * 60)

        stats['success'] = True
        stats['total_time'] = total_time

        return stats

    except Exception as e:
        logger.error(f"Migration failed for {collection_name}: {str(e)}")
        stats['success'] = False
        stats['error'] = str(e)
        return stats


def migrate_all_collections(dry_run: bool = False):
    """Migrate all configured collections"""
    all_collections = get_all_collections()

    logger.info(f"{'[DRY RUN] ' if dry_run else ''}Starting migration for ALL collections")
    logger.info(f"Collections to migrate: {list(all_collections.keys())}")

    overall_stats = {
        'collections': [],
        'total_products': 0,
        'total_migrated': 0,
        'total_failed': 0
    }

    for collection_name in all_collections.keys():
        stats = migrate_collection(collection_name, dry_run=dry_run)
        overall_stats['collections'].append(stats)
        overall_stats['total_products'] += stats.get('total_products', 0)
        overall_stats['total_migrated'] += stats.get('migrated', 0)
        overall_stats['total_failed'] += stats.get('failed', 0)

    logger.info("=" * 60)
    logger.info("OVERALL MIGRATION SUMMARY")
    logger.info(f"Total collections: {len(overall_stats['collections'])}")
    logger.info(f"Total products: {overall_stats['total_products']}")
    logger.info(f"Total migrated: {overall_stats['total_migrated']}")
    logger.info(f"Total failed: {overall_stats['total_failed']}")
    logger.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(description='Migrate products from Google Sheets to Firestore')
    parser.add_argument('--collection', help='Specific collection to migrate (e.g., sinks, lighting)')
    parser.add_argument('--all', action='store_true', help='Migrate all collections')
    parser.add_argument('--dry-run', action='store_true', help='Perform a dry run without writing to Firestore')

    args = parser.parse_args()

    if not args.collection and not args.all:
        parser.error("Please specify either --collection or --all")

    if args.all:
        migrate_all_collections(dry_run=args.dry_run)
    elif args.collection:
        migrate_collection(args.collection, dry_run=args.dry_run)


if __name__ == '__main__':
    main()
