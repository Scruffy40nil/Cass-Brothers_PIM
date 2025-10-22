"""
Google Sheets Bulk Operations Routes
Handles bulk edit, delete, import/export for Google Sheets collections
"""
from flask import Blueprint, request, jsonify, send_file
import logging
import csv
import io
import time
from datetime import datetime
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

sheets_bulk_bp = Blueprint('sheets_bulk', __name__)


def setup_sheets_bulk_routes(app):
    """
    Setup Google Sheets bulk operation routes
    """
    from core.sheets_manager import get_sheets_manager
    from core.db_cache import get_db_cache
    from core.cache_manager import cache_manager
    from config.collections import get_collection_config

    # =============================================================================
    # BULK EDIT
    # =============================================================================

    @app.route('/api/<collection_name>/products/bulk-edit', methods=['POST'])
    def api_bulk_edit_sheets(collection_name):
        """
        Bulk edit multiple products in Google Sheets

        Request body:
        {
            "product_ids": [2, 3, 5, 10],
            "updates": {
                "vendor": "New Vendor",
                "tags": "tag1, tag2",
                "care_instructions": "Clean with..."
            },
            "update_mode": "replace"  // or "append"
        }
        """
        try:
            data = request.get_json()
            product_ids = data.get('product_ids', [])
            updates = data.get('updates', {})
            update_mode = data.get('update_mode', 'replace')

            if not product_ids:
                return jsonify({
                    'success': False,
                    'error': 'No product IDs provided'
                }), 400

            if not updates:
                return jsonify({
                    'success': False,
                    'error': 'No updates provided'
                }), 400

            sheets_manager = get_sheets_manager()

            logger.info(f"🔄 [Bulk Edit] Updating {len(product_ids)} products in {collection_name}")

            successful = []
            failed = []
            errors = []

            for row_num in product_ids:
                try:
                    # Get current product if append mode
                    if update_mode == 'append':
                        current_product = sheets_manager.get_product(collection_name, row_num)
                        if current_product:
                            # Merge updates (append tags, etc.)
                            merged_updates = {}
                            for field, new_value in updates.items():
                                current_value = current_product.get(field, '')
                                if field in ['tags', 'features']:
                                    # Append to comma-separated lists
                                    if current_value:
                                        merged_updates[field] = f"{current_value}, {new_value}"
                                    else:
                                        merged_updates[field] = new_value
                                else:
                                    merged_updates[field] = new_value
                            updates_to_apply = merged_updates
                        else:
                            updates_to_apply = updates
                    else:
                        updates_to_apply = updates

                    # Apply updates (overwrite mode = True for bulk edit)
                    success = sheets_manager.update_product_row(
                        collection_name,
                        row_num,
                        updates_to_apply,
                        overwrite_mode=True
                    )

                    if success:
                        successful.append(row_num)
                    else:
                        failed.append(row_num)
                        errors.append(f"Row {row_num}: Update failed")

                except Exception as e:
                    failed.append(row_num)
                    errors.append(f"Row {row_num}: {str(e)}")
                    logger.error(f"Error updating row {row_num}: {e}")

            # Clear cache
            db_cache = get_db_cache()
            db_cache.clear_collection_cache(collection_name)
            cache_manager.invalidate('products', collection_name)

            logger.info(f"✅ [Bulk Edit] Complete: {len(successful)} success, {len(failed)} failed")

            return jsonify({
                'success': len(successful) > 0,
                'message': f'Updated {len(successful)} products, {len(failed)} failed',
                'successful': successful,
                'failed': failed,
                'errors': errors[:20],  # Limit error list
                'total_updated': len(successful),
                'total_failed': len(failed)
            })

        except Exception as e:
            logger.error(f"❌ [Bulk Edit] Error: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    # =============================================================================
    # BULK DELETE
    # =============================================================================

    @app.route('/api/<collection_name>/products/bulk-delete', methods=['POST'])
    def api_bulk_delete_sheets(collection_name):
        """
        Bulk delete multiple products from Google Sheets

        Request body:
        {
            "product_ids": [2, 3, 5, 10]
        }
        """
        try:
            data = request.get_json()
            product_ids = data.get('product_ids', [])

            if not product_ids:
                return jsonify({
                    'success': False,
                    'error': 'No product IDs provided'
                }), 400

            sheets_manager = get_sheets_manager()

            logger.info(f"🗑️ [Bulk Delete] Deleting {len(product_ids)} products from {collection_name}")

            successful = []
            failed = []
            errors = []

            # Sort product_ids in descending order to delete from bottom up
            # This prevents row number shifts during deletion
            for row_num in sorted(product_ids, reverse=True):
                try:
                    success = sheets_manager.delete_product_row(collection_name, row_num)
                    if success:
                        successful.append(row_num)
                        logger.debug(f"✅ Deleted row {row_num}")
                    else:
                        failed.append(row_num)
                        errors.append(f"Row {row_num}: Delete failed")

                except Exception as e:
                    failed.append(row_num)
                    errors.append(f"Row {row_num}: {str(e)}")
                    logger.error(f"Error deleting row {row_num}: {e}")

            # Clear cache
            db_cache = get_db_cache()
            db_cache.clear_collection_cache(collection_name)
            cache_manager.invalidate('products', collection_name)

            logger.info(f"✅ [Bulk Delete] Complete: {len(successful)} deleted, {len(failed)} failed")

            return jsonify({
                'success': len(successful) > 0,
                'message': f'Deleted {len(successful)} products, {len(failed)} failed',
                'successful': successful,
                'failed': failed,
                'errors': errors,
                'total_deleted': len(successful),
                'total_failed': len(failed)
            })

        except Exception as e:
            logger.error(f"❌ [Bulk Delete] Error: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    # =============================================================================
    # CSV/EXCEL IMPORT with _action column
    # =============================================================================

    @app.route('/api/<collection_name>/products/import', methods=['POST'])
    def api_import_products_sheets(collection_name):
        """
        Import products from CSV file to Google Sheets

        Request: multipart/form-data with 'file' field
        CSV format: First row = headers matching field names

        Special column: _action
        - _action=DELETE: Delete the product (by row_number or variant_sku)
        - _action=UPDATE: Update existing product (by row_number or variant_sku)
        - No _action: Add new product (default)

        Example CSV:
        variant_sku,title,vendor,url,material,finish,_action
        ABC123,"Sink Name","Brand Name","http://...",...,
        DEF456,,,,,DELETE

        Or with row_number:
        row_number,variant_sku,title,_action
        2,ABC123,"Updated Title",UPDATE
        5,DEF456,,DELETE
        """
        try:
            if 'file' not in request.files:
                return jsonify({
                    'success': False,
                    'error': 'No file provided'
                }), 400

            file = request.files['file']
            if file.filename == '':
                return jsonify({
                    'success': False,
                    'error': 'No file selected'
                }), 400

            # Check file extension
            if not file.filename.lower().endswith('.csv'):
                return jsonify({
                    'success': False,
                    'error': 'Invalid file format. Please upload CSV file.'
                }), 400

            sheets_manager = get_sheets_manager()

            logger.info(f"📤 [Import] Processing file: {file.filename}")

            # Read CSV file with encoding fallback
            file_content = file.stream.read()
            try:
                # Try UTF-8 first
                content = file_content.decode('utf-8')
                logger.info("📄 [Import] Decoded as UTF-8")
            except UnicodeDecodeError:
                try:
                    # Fall back to Windows-1252 (common for Excel exports)
                    content = file_content.decode('windows-1252')
                    logger.info("📄 [Import] Decoded as Windows-1252")
                except UnicodeDecodeError:
                    # Last resort: ISO-8859-1 with error replacement
                    content = file_content.decode('iso-8859-1', errors='replace')
                    logger.info("📄 [Import] Decoded as ISO-8859-1 with error replacement")

            stream = io.StringIO(content, newline=None)
            csv_reader = csv.DictReader(stream)
            rows = list(csv_reader)

            if not rows:
                return jsonify({
                    'success': False,
                    'error': 'File is empty or invalid format'
                }), 400

            logger.info(f"📊 [Import] Found {len(rows)} rows to process")

            # Track results by action type
            imported = []
            updated = []
            deleted = []
            failed = []
            errors = []

            for i, row in enumerate(rows, start=1):
                try:
                    # Check for _action column
                    action = str(row.get('_action', '')).strip().upper()

                    # Clean the row (remove _action from data)
                    clean_row = {
                        k: (v if v != '' else None)
                        for k, v in row.items()
                        if v is not None and k != '_action'
                    }

                    # Skip completely empty rows
                    if not any(clean_row.values()):
                        continue

                    # Handle DELETE action
                    if action == 'DELETE':
                        # Find product by row_number or variant_sku
                        row_num = None

                        if 'row_number' in clean_row and clean_row['row_number']:
                            row_num = int(clean_row['row_number'])
                        elif 'variant_sku' in clean_row and clean_row['variant_sku']:
                            # Find by SKU
                            sku = str(clean_row['variant_sku']).strip()
                            all_products = sheets_manager.get_all_products(collection_name)
                            for r, product in all_products.items():
                                if product.get('variant_sku', '').strip() == sku:
                                    row_num = r
                                    break

                        if row_num:
                            success = sheets_manager.delete_product_row(collection_name, row_num)
                            if success:
                                deleted.append(row_num)
                                logger.info(f"🗑️ Deleted row {row_num} (CSV line {i})")
                            else:
                                errors.append(f"Row {i}: DELETE failed - could not delete product")
                                failed.append(i)
                        else:
                            errors.append(f"Row {i}: DELETE failed - product not found")
                            failed.append(i)

                        continue

                    # Handle UPDATE action
                    if action == 'UPDATE':
                        # Find product by row_number or variant_sku
                        row_num = None

                        if 'row_number' in clean_row and clean_row['row_number']:
                            row_num = int(clean_row['row_number'])
                        elif 'variant_sku' in clean_row and clean_row['variant_sku']:
                            # Find by SKU
                            sku = str(clean_row['variant_sku']).strip()
                            all_products = sheets_manager.get_all_products(collection_name)
                            for r, product in all_products.items():
                                if product.get('variant_sku', '').strip() == sku:
                                    row_num = r
                                    break

                        if row_num:
                            # Update the product (overwrite existing data)
                            success = sheets_manager.update_product_row(
                                collection_name,
                                row_num,
                                clean_row,
                                overwrite_mode=True  # Overwrite existing data with new values
                            )

                            if success:
                                updated.append(row_num)
                                logger.info(f"✏️ Updated row {row_num} (CSV line {i})")
                            else:
                                errors.append(f"Row {i}: UPDATE failed - could not update product")
                                failed.append(i)
                        else:
                            errors.append(f"Row {i}: UPDATE failed - product not found")
                            failed.append(i)

                        continue

                    # Default: ADD new product
                    # Add product to Google Sheets
                    row_num = sheets_manager.add_product(collection_name, clean_row)

                    if row_num:
                        imported.append(row_num)
                        logger.debug(f"✅ Imported row {i} as row {row_num}")
                    else:
                        failed.append(i)
                        errors.append(f"Row {i}: Failed to add product")

                except Exception as e:
                    failed.append(i)
                    errors.append(f"Row {i}: {str(e)}")
                    logger.error(f"Error processing row {i}: {e}")

            # Clear cache after all operations
            db_cache = get_db_cache()
            db_cache.clear_collection_cache(collection_name)
            cache_manager.invalidate('products', collection_name)

            total_success = len(imported) + len(updated) + len(deleted)
            logger.info(f"✅ [Import] Complete: {len(imported)} imported, {len(updated)} updated, {len(deleted)} deleted, {len(failed)} failed")

            return jsonify({
                'success': total_success > 0,
                'message': f'Processed {total_success} products: {len(imported)} imported, {len(updated)} updated, {len(deleted)} deleted, {len(failed)} failed',
                'imported': imported,
                'updated': updated,
                'deleted': deleted,
                'failed': failed,
                'errors': errors[:20],
                'total_imported': len(imported),
                'total_updated': len(updated),
                'total_deleted': len(deleted),
                'total_failed': len(failed),
                'total_rows': len(rows)
            })

        except Exception as e:
            logger.error(f"❌ [Import] Error: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    # =============================================================================
    # CSV EXPORT with _action column
    # =============================================================================

    @app.route('/api/<collection_name>/products/export', methods=['GET'])
    def api_export_products_sheets(collection_name):
        """
        Export products to CSV format with _action column for re-import workflow

        Query params:
        - format: 'csv' (default)
        - product_ids: Optional comma-separated list of row numbers to export

        Example: /api/sinks/products/export?format=csv&product_ids=2,3,5
        """
        try:
            export_format = request.args.get('format', 'csv').lower()
            product_ids_str = request.args.get('product_ids', '')

            sheets_manager = get_sheets_manager()

            logger.info(f"📥 [Export] Exporting {collection_name} as {export_format}")

            # Get products
            if product_ids_str:
                # Export specific products
                product_ids = [int(id.strip()) for id in product_ids_str.split(',') if id.strip()]
                products = {}
                for row_num in product_ids:
                    product = sheets_manager.get_product(collection_name, row_num)
                    if product:
                        products[row_num] = product
            else:
                # Export all products
                products = sheets_manager.get_all_products(collection_name)

            if not products:
                return jsonify({
                    'success': False,
                    'error': 'No products found to export'
                }), 404

            logger.info(f"📊 [Export] Exporting {len(products)} products")

            # Collect all unique fields across all products
            fields = set()
            for product in products.values():
                fields.update(product.keys())

            # Convert to list and remove unwanted fields
            fields = list(fields)
            for unwanted in ['created_at', 'last_modified', 'id']:
                if unwanted in fields:
                    fields.remove(unwanted)

            # Reorder fields: SKU, row_number, title, id first, then others, _action last
            priority_fields = ['variant_sku', 'row_number', 'title', 'id']
            ordered_fields = []

            # Add priority fields first (if they exist)
            for field in priority_fields:
                if field in fields:
                    ordered_fields.append(field)
                    fields.remove(field)

            # Add remaining fields (except _action)
            remaining_fields = [f for f in fields if f != '_action']
            ordered_fields.extend(remaining_fields)

            # Add _action column to the end (for re-import workflow)
            ordered_fields.append('_action')

            fields = ordered_fields

            # Create CSV
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=fields, extrasaction='ignore')
            writer.writeheader()

            for row_num in sorted(products.keys()):
                product = products[row_num]
                # Add row_number if not already present
                if 'row_number' not in product:
                    product['row_number'] = row_num
                # Add empty _action column (user will fill it for DELETE/UPDATE)
                product['_action'] = ''
                writer.writerow(product)

            # Prepare file for download
            output.seek(0)
            filename = f"{collection_name}_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

            return send_file(
                io.BytesIO(output.getvalue().encode('utf-8')),
                mimetype='text/csv',
                as_attachment=True,
                download_name=filename
            )

        except Exception as e:
            logger.error(f"❌ [Export] Error: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    logger.info("✅ Google Sheets bulk operation routes registered")
