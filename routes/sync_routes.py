"""
API routes for bi-directional sync between Google Sheets and Firestore
"""

import logging
from flask import jsonify, request
from core.firestore_manager import get_firestore_manager
from core.sheets_manager import get_sheets_manager
from config.collections import get_collection_config
from datetime import datetime
import time

logger = logging.getLogger(__name__)


def setup_sync_routes(app):
    """Setup sync-related API routes"""

    @app.route('/api/<collection_name>/sync/to-firestore', methods=['POST'])
    def api_sync_to_firestore(collection_name):
        """
        Sync Google Sheets → Firestore (push bulk edits)

        Request body:
        {
            "dry_run": false,  // Optional: if true, only shows what would change
            "rows": [2, 3, 4]  // Optional: specific rows to sync, or omit for all
        }
        """
        try:
            data = request.get_json() or {}
            dry_run = data.get('dry_run', False)
            specific_rows = data.get('rows', None)

            logger.info(f"{'[DRY RUN] ' if dry_run else ''}Starting Sheets → Firestore sync for {collection_name}")

            fm = get_firestore_manager()
            sm = get_sheets_manager()
            config = get_collection_config(collection_name)

            if not fm.db:
                return jsonify({'success': False, 'error': 'Firestore not initialized'}), 500

            stats = {
                'total_rows': 0,
                'updated': 0,
                'created': 0,
                'unchanged': 0,
                'errors': 0,
                'skipped': 0,
                'changes': []
            }

            # Get data from Google Sheets
            logger.info("📖 Reading data from Google Sheets...")
            all_products = sm.get_all_products(collection_name)
            logger.info(f"✅ Retrieved {len(all_products)} products from Google Sheets")

            # Get existing Firestore data for comparison
            firestore_products = fm.get_all_products(collection_name, force_refresh=True)

            # Filter to specific rows if requested
            if specific_rows:
                all_products = {k: v for k, v in all_products.items() if int(k) in specific_rows}
                stats['total_rows'] = len(all_products)
                logger.info(f"🎯 Syncing {len(all_products)} specific rows: {specific_rows[:10]}...")
            else:
                stats['total_rows'] = len(all_products)

            # Process each row
            for row_num, sheet_product in all_products.items():
                try:
                    # Skip header
                    if int(row_num) <= 1:
                        stats['skipped'] += 1
                        continue

                    # Skip if missing essential data
                    if not sheet_product.get('variant_sku') and not sheet_product.get('title'):
                        stats['skipped'] += 1
                        continue

                    # Get existing Firestore product
                    firestore_product = firestore_products.get(str(row_num), {})
                    is_new = not firestore_product or len(firestore_product) == 0

                    # Check for changes
                    has_changes, changed_fields = _compare_products(sheet_product, firestore_product)

                    if not has_changes and not is_new:
                        stats['unchanged'] += 1
                        continue

                    # Prepare data
                    product_data = {**sheet_product}
                    product_data['row_number'] = int(row_num)
                    product_data['updated_at'] = datetime.utcnow().isoformat()
                    product_data['synced_from_sheets'] = True

                    if dry_run:
                        action = "CREATE" if is_new else "UPDATE"
                        stats['changes'].append({
                            'row_num': row_num,
                            'action': action,
                            'sku': product_data.get('variant_sku', 'No SKU'),
                            'changed_fields': changed_fields if not is_new else []
                        })
                        if is_new:
                            stats['created'] += 1
                        else:
                            stats['updated'] += 1
                    else:
                        # Actually update
                        success = fm.update_product_row(
                            collection_name,
                            row_num,
                            product_data,
                            overwrite_mode=True
                        )

                        if success:
                            if is_new:
                                stats['created'] += 1
                            else:
                                stats['updated'] += 1

                            if stats['updated'] % 50 == 0:
                                logger.info(f"📊 Progress: {stats['updated']} products synced...")
                        else:
                            stats['errors'] += 1

                except Exception as e:
                    stats['errors'] += 1
                    logger.error(f"❌ Error processing row {row_num}: {e}")

            logger.info(f"✅ Sync complete: {stats['updated']} updated, {stats['created']} created")

            return jsonify({
                'success': True,
                'direction': 'sheets-to-firestore',
                'collection': collection_name,
                'dry_run': dry_run,
                'stats': stats,
                'message': f"Synced {stats['updated'] + stats['created']} products from Google Sheets to Firestore"
            })

        except Exception as e:
            logger.error(f"❌ Sync failed: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/<collection_name>/sync/to-sheets', methods=['POST'])
    def api_sync_to_sheets(collection_name):
        """
        Sync Firestore → Google Sheets (pull individual edits)

        Request body:
        {
            "dry_run": false,  // Optional: if true, only shows what would change
            "rows": [2, 3, 4]  // Optional: specific rows to sync, or omit for all
        }
        """
        try:
            data = request.get_json() or {}
            dry_run = data.get('dry_run', False)
            specific_rows = data.get('rows', None)

            logger.info(f"{'[DRY RUN] ' if dry_run else ''}Starting Firestore → Sheets sync for {collection_name}")

            fm = get_firestore_manager()
            sm = get_sheets_manager()

            if not fm.db:
                return jsonify({'success': False, 'error': 'Firestore not initialized'}), 500

            stats = {
                'total_products': 0,
                'updated': 0,
                'unchanged': 0,
                'errors': 0,
                'changes': []
            }

            # Get all products from Firestore
            logger.info("📖 Reading data from Firestore...")
            firestore_products = fm.get_all_products(collection_name, force_refresh=True)

            # Filter to specific rows if requested
            if specific_rows:
                firestore_products = {k: v for k, v in firestore_products.items() if int(k) in specific_rows}
                stats['total_products'] = len(firestore_products)
                logger.info(f"🎯 Syncing {len(firestore_products)} specific rows to Sheets...")
            else:
                stats['total_products'] = len(firestore_products)

            # Process each product
            for row_num, firestore_product in sorted(firestore_products.items(), key=lambda x: int(x[0])):
                try:
                    row_num = int(row_num)

                    # Prepare update data
                    update_data = {**firestore_product}

                    if dry_run:
                        stats['changes'].append({
                            'row_num': row_num,
                            'sku': firestore_product.get('variant_sku', 'No SKU')
                        })
                        stats['updated'] += 1
                    else:
                        # Update in Google Sheets
                        success = sm.update_product(collection_name, row_num, update_data)

                        if success:
                            stats['updated'] += 1
                            if stats['updated'] % 50 == 0:
                                logger.info(f"📊 Progress: {stats['updated']} rows updated in Sheets...")
                        else:
                            stats['errors'] += 1

                except Exception as e:
                    stats['errors'] += 1
                    logger.error(f"❌ Error processing row {row_num}: {e}")

            logger.info(f"✅ Sync complete: {stats['updated']} rows updated in Sheets")

            return jsonify({
                'success': True,
                'direction': 'firestore-to-sheets',
                'collection': collection_name,
                'dry_run': dry_run,
                'stats': stats,
                'message': f"Synced {stats['updated']} products from Firestore to Google Sheets"
            })

        except Exception as e:
            logger.error(f"❌ Sync failed: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/<collection_name>/sync/status', methods=['GET'])
    def api_sync_status(collection_name):
        """
        Get sync status - compare Sheets and Firestore to see what's out of sync
        """
        try:
            fm = get_firestore_manager()
            sm = get_sheets_manager()

            if not fm.db:
                return jsonify({'success': False, 'error': 'Firestore not initialized'}), 500

            # Get counts
            logger.info("📊 Checking sync status...")
            sheets_products = sm.get_all_products(collection_name)
            firestore_products = fm.get_all_products(collection_name, force_refresh=True)

            sheets_count = len(sheets_products)
            firestore_count = len(firestore_products)

            # Find differences
            sheets_only = set(sheets_products.keys()) - set(firestore_products.keys())
            firestore_only = set(firestore_products.keys()) - set(sheets_products.keys())
            common_rows = set(sheets_products.keys()) & set(firestore_products.keys())

            # Check for content differences in common rows
            differences = []
            for row_num in list(common_rows)[:100]:  # Sample first 100 for performance
                has_diff, changed_fields = _compare_products(
                    sheets_products[row_num],
                    firestore_products.get(str(row_num), {})
                )
                if has_diff:
                    differences.append({
                        'row_num': row_num,
                        'sku': sheets_products[row_num].get('variant_sku', 'No SKU'),
                        'changed_fields': changed_fields
                    })

            return jsonify({
                'success': True,
                'collection': collection_name,
                'sheets_count': sheets_count,
                'firestore_count': firestore_count,
                'in_sync': len(sheets_only) == 0 and len(firestore_only) == 0 and len(differences) == 0,
                'only_in_sheets': len(sheets_only),
                'only_in_firestore': len(firestore_only),
                'content_differences': len(differences),
                'sample_differences': differences[:10]  # Show first 10
            })

        except Exception as e:
            logger.error(f"❌ Failed to check sync status: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    logger.info("✅ Sync routes registered")


def _compare_products(sheet_product: dict, firestore_product: dict) -> tuple:
    """
    Compare two products to detect changes

    Returns:
        (has_changes: bool, changed_fields: list)
    """
    if not firestore_product:
        return (True, [])

    changed_fields = []

    for key, sheet_value in sheet_product.items():
        if key in ['row_number', 'updated_at', 'synced_from_sheets', '__hydratedFromApi']:
            continue

        firestore_value = firestore_product.get(key)

        # Normalize for comparison
        sheet_val_str = str(sheet_value).strip() if sheet_value else ""
        firestore_val_str = str(firestore_value).strip() if firestore_value else ""

        if sheet_val_str != firestore_val_str:
            changed_fields.append({
                'field': key,
                'sheets_value': sheet_val_str[:50],  # Truncate for display
                'firestore_value': firestore_val_str[:50]
            })

    return (len(changed_fields) > 0, changed_fields)
