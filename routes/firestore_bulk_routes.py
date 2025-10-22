"""
Firestore Bulk Operations Routes
Handles bulk edit, delete, import/export for Firestore collections
"""
from flask import Blueprint, request, jsonify, send_file
import logging
import csv
import io
import time
from datetime import datetime
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

firestore_bulk_bp = Blueprint('firestore_bulk', __name__)


def setup_firestore_bulk_routes(app):
    """
    Setup Firestore bulk operation routes
    """
    from core.firestore_manager import get_firestore_manager
    from core.data_cleaner import get_data_cleaner

    # =============================================================================
    # BULK EDIT
    # =============================================================================

    @app.route('/api/<collection_name>/products/bulk-edit', methods=['POST'])
    def api_bulk_edit_firestore(collection_name):
        """
        Bulk edit multiple products in Firestore

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

            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({
                    'success': False,
                    'error': 'Firestore not initialized'
                }), 500

            logger.info(f"🔄 [Bulk Edit] Updating {len(product_ids)} products in {collection_name}")

            successful = []
            failed = []
            errors = []

            for row_num in product_ids:
                try:
                    # Get current product if append mode
                    if update_mode == 'append':
                        current_product = firestore_manager.get_single_product(collection_name, row_num)
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

                    # Apply updates
                    success = firestore_manager.update_product_row(
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
    def api_bulk_delete_firestore(collection_name):
        """
        Bulk delete multiple products from Firestore

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

            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({
                    'success': False,
                    'error': 'Firestore not initialized'
                }), 500

            logger.info(f"🗑️ [Bulk Delete] Deleting {len(product_ids)} products from {collection_name}")

            successful = []
            failed = []
            errors = []

            collection_ref = firestore_manager.get_collection_ref(collection_name)

            for row_num in product_ids:
                try:
                    # Delete the document
                    doc_ref = collection_ref.document(str(row_num))
                    doc_ref.delete()
                    successful.append(row_num)
                    logger.debug(f"✅ Deleted row {row_num}")

                except Exception as e:
                    failed.append(row_num)
                    errors.append(f"Row {row_num}: {str(e)}")
                    logger.error(f"Error deleting row {row_num}: {e}")

            # Invalidate cache
            firestore_manager._invalidate_cache(collection_name)

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
    # CSV/EXCEL UPLOAD
    # =============================================================================

    @app.route('/api/<collection_name>/products/import', methods=['POST'])
    def api_import_products_firestore(collection_name):
        """
        Import products from CSV/Excel file to Firestore

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
            if not file.filename.lower().endswith(('.csv', '.xlsx', '.xls')):
                return jsonify({
                    'success': False,
                    'error': 'Invalid file format. Please upload CSV or Excel file.'
                }), 400

            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({
                    'success': False,
                    'error': 'Firestore not initialized'
                }), 500

            logger.info(f"📤 [Import] Processing file: {file.filename}")

            # Read CSV file
            if file.filename.lower().endswith('.csv'):
                # Parse CSV
                stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
                csv_reader = csv.DictReader(stream)
                rows = list(csv_reader)
            else:
                # Parse Excel
                try:
                    import pandas as pd
                    df = pd.read_excel(file)
                    rows = df.to_dict('records')
                except ImportError:
                    return jsonify({
                        'success': False,
                        'error': 'Excel support not installed. Run: pip install pandas openpyxl'
                    }), 500

            if not rows:
                return jsonify({
                    'success': False,
                    'error': 'File is empty or invalid format'
                }), 400

            logger.info(f"📊 [Import] Found {len(rows)} rows to process")

            # Get data cleaner for post-processing
            data_cleaner = get_data_cleaner(firestore_manager.db)

            # Track results by action type
            imported = []
            updated = []
            deleted = []
            failed = []
            errors = []

            collection_ref = firestore_manager.get_collection_ref(collection_name)

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
                            all_products = firestore_manager.get_all_products(collection_name)
                            for r, product in all_products.items():
                                if product.get('variant_sku', '').strip() == sku:
                                    row_num = r
                                    break

                        if row_num:
                            doc_ref = collection_ref.document(str(row_num))
                            doc_ref.delete()
                            deleted.append(row_num)
                            logger.info(f"🗑️ Deleted row {row_num} (CSV line {i})")
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
                            all_products = firestore_manager.get_all_products(collection_name)
                            for r, product in all_products.items():
                                if product.get('variant_sku', '').strip() == sku:
                                    row_num = r
                                    break

                        if row_num:
                            # Update the product (overwrite existing data)
                            success = firestore_manager.update_product_row(
                                collection_name,
                                row_num,
                                clean_row,
                                overwrite_mode=True  # Overwrite existing data with new values
                            )

                            if success:
                                # Apply data cleaning
                                current_product = firestore_manager.get_single_product(collection_name, row_num)
                                cleaning_updates = data_cleaner.clean_product(collection_name, current_product)
                                if cleaning_updates:
                                    firestore_manager.update_product_row(
                                        collection_name,
                                        row_num,
                                        cleaning_updates,
                                        overwrite_mode=False
                                    )

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
                    # Add metadata
                    clean_row['created_at'] = datetime.utcnow().isoformat()
                    clean_row['imported_from'] = file.filename

                    # Add product to Firestore
                    row_num = firestore_manager.add_product(collection_name, clean_row)

                    # Apply data cleaning rules
                    product_with_row = {**clean_row, 'row_number': row_num}
                    cleaning_updates = data_cleaner.clean_product(collection_name, product_with_row)

                    if cleaning_updates:
                        firestore_manager.update_product_row(
                            collection_name,
                            row_num,
                            cleaning_updates,
                            overwrite_mode=False
                        )

                    imported.append(row_num)
                    logger.debug(f"✅ Imported row {i} as document {row_num}")

                except Exception as e:
                    failed.append(i)
                    errors.append(f"Row {i}: {str(e)}")
                    logger.error(f"Error processing row {i}: {e}")

            # Invalidate cache after all operations
            firestore_manager._invalidate_cache(collection_name)

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
    # CSV/EXCEL EXPORT
    # =============================================================================

    @app.route('/api/<collection_name>/products/export', methods=['GET'])
    def api_export_products_firestore(collection_name):
        """
        Export products to CSV or Excel format

        Query params:
        - format: 'csv' (default) or 'excel'
        - product_ids: Optional comma-separated list of row numbers to export
        - fields: Optional comma-separated list of fields to include

        Example: /api/sinks/products/export?format=csv&product_ids=2,3,5
        """
        try:
            export_format = request.args.get('format', 'csv').lower()
            product_ids_str = request.args.get('product_ids', '')
            fields_str = request.args.get('fields', '')

            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({
                    'success': False,
                    'error': 'Firestore not initialized'
                }), 500

            logger.info(f"📥 [Export] Exporting {collection_name} as {export_format}")

            # Get products
            if product_ids_str:
                # Export specific products
                product_ids = [int(id.strip()) for id in product_ids_str.split(',') if id.strip()]
                products = {}
                for row_num in product_ids:
                    product = firestore_manager.get_single_product(collection_name, row_num)
                    if product:
                        products[row_num] = product
            else:
                # Export all products
                products = firestore_manager.get_all_products(collection_name)

            if not products:
                return jsonify({
                    'success': False,
                    'error': 'No products found to export'
                }), 404

            # Get fields to export
            if fields_str:
                fields = [f.strip() for f in fields_str.split(',') if f.strip()]
            else:
                # Get all fields from first product
                first_product = next(iter(products.values()))
                fields = list(first_product.keys())

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

            logger.info(f"📊 [Export] Exporting {len(products)} products with {len(fields)} fields")

            # Generate export file
            if export_format == 'csv':
                # Generate CSV
                output = io.StringIO()
                writer = csv.DictWriter(output, fieldnames=fields, extrasaction='ignore')
                writer.writeheader()

                for row_num, product in sorted(products.items()):
                    # Only include requested fields
                    filtered_product = {k: product.get(k, '') for k in fields}
                    # Add empty _action column (user can fill in DELETE, UPDATE, etc.)
                    if '_action' not in filtered_product:
                        filtered_product['_action'] = ''
                    writer.writerow(filtered_product)

                output.seek(0)

                # Create response
                filename = f"{collection_name}_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
                return send_file(
                    io.BytesIO(output.getvalue().encode('utf-8')),
                    mimetype='text/csv',
                    as_attachment=True,
                    download_name=filename
                )

            elif export_format == 'excel':
                # Generate Excel
                try:
                    import pandas as pd

                    # Convert to DataFrame
                    data = []
                    for row_num, product in sorted(products.items()):
                        filtered_product = {k: product.get(k, '') for k in fields}
                        # Add empty _action column (user can fill in DELETE, UPDATE, etc.)
                        if '_action' not in filtered_product:
                            filtered_product['_action'] = ''
                        data.append(filtered_product)

                    df = pd.DataFrame(data)

                    # Create Excel file in memory
                    output = io.BytesIO()
                    with pd.ExcelWriter(output, engine='openpyxl') as writer:
                        df.to_excel(writer, index=False, sheet_name=collection_name)
                    output.seek(0)

                    filename = f"{collection_name}_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
                    return send_file(
                        output,
                        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        as_attachment=True,
                        download_name=filename
                    )

                except ImportError:
                    return jsonify({
                        'success': False,
                        'error': 'Excel support not installed. Run: pip install pandas openpyxl'
                    }), 500

            else:
                return jsonify({
                    'success': False,
                    'error': f'Invalid format: {export_format}. Use csv or excel.'
                }), 400

        except Exception as e:
            logger.error(f"❌ [Export] Error: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    # =============================================================================
    # TEMPLATE DOWNLOAD
    # =============================================================================

    @app.route('/api/<collection_name>/products/template', methods=['GET'])
    def api_download_import_template(collection_name):
        """
        Download CSV template for bulk import

        Query params:
        - format: 'csv' (default) or 'excel'
        """
        try:
            from config.collections import get_collection_config

            export_format = request.args.get('format', 'csv').lower()

            # Get collection config for field names
            config = get_collection_config(collection_name)
            if not config:
                return jsonify({
                    'success': False,
                    'error': f'Collection not found: {collection_name}'
                }), 404

            # Get field names from column mapping
            fields = list(config.column_mapping.values())

            # Remove system fields
            fields = [f for f in fields if f not in ['created_at', 'updated_at', 'row_number']]

            logger.info(f"📄 [Template] Generating template for {collection_name} with {len(fields)} fields")

            if export_format == 'csv':
                # Generate CSV template
                output = io.StringIO()
                writer = csv.DictWriter(output, fieldnames=fields)
                writer.writeheader()

                # Add example row
                example_row = {field: f'<{field}>' for field in fields}
                example_row['variant_sku'] = 'EXAMPLE-SKU-001'
                example_row['title'] = 'Example Product Title'
                writer.writerow(example_row)

                output.seek(0)

                filename = f"{collection_name}_import_template.csv"
                return send_file(
                    io.BytesIO(output.getvalue().encode('utf-8')),
                    mimetype='text/csv',
                    as_attachment=True,
                    download_name=filename
                )

            elif export_format == 'excel':
                try:
                    import pandas as pd

                    # Create example row
                    example_row = {field: f'<{field}>' for field in fields}
                    example_row['variant_sku'] = 'EXAMPLE-SKU-001'
                    example_row['title'] = 'Example Product Title'

                    df = pd.DataFrame([example_row])

                    output = io.BytesIO()
                    with pd.ExcelWriter(output, engine='openpyxl') as writer:
                        df.to_excel(writer, index=False, sheet_name='Template')
                    output.seek(0)

                    filename = f"{collection_name}_import_template.xlsx"
                    return send_file(
                        output,
                        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        as_attachment=True,
                        download_name=filename
                    )

                except ImportError:
                    return jsonify({
                        'success': False,
                        'error': 'Excel support not installed. Run: pip install pandas openpyxl'
                    }), 500

            else:
                return jsonify({
                    'success': False,
                    'error': f'Invalid format: {export_format}'
                }), 400

        except Exception as e:
            logger.error(f"❌ [Template] Error: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    logger.info("✅ Firestore bulk operation routes registered")
