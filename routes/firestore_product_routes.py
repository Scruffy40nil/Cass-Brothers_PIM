"""
Firestore Product Routes
Replaces Google Sheets-based product endpoints with Firestore

Note: Sync between Google Sheets and Firestore is handled by Google Apps Script.
Google Sheets is the source of truth, and Apps Script automatically pushes changes to Firestore.
See: google-apps-script/SheetToFirestoreSync.gs and APPS_SCRIPT_SYNC_GUIDE.md
"""
from flask import Blueprint, request, jsonify
import logging
import time

logger = logging.getLogger(__name__)

# Create blueprint
firestore_products_bp = Blueprint('firestore_products', __name__)

# In-memory cache for expensive operations
_cache = {}
_cache_timestamps = {}


def _invalidate_route_cache(collection_name: str):
    """Invalidate route-level cache for a collection"""
    cache_key = f"missing_info_{collection_name}"
    if cache_key in _cache:
        del _cache[cache_key]
        del _cache_timestamps[cache_key]
        logger.info(f"🗑️ [Route Cache INVALIDATE] Cleared missing-info cache for {collection_name}")


def setup_firestore_product_routes(app):
    """
    Setup Firestore-based product routes

    These routes replace the Google Sheets-based product endpoints
    """
    from core.firestore_manager import get_firestore_manager
    from core.data_cleaner import get_data_cleaner

    @app.route('/api/<collection_name>/products/<int:row_num>', methods=['GET'])
    def api_get_single_product_firestore(collection_name, row_num):
        """Get a single product by row number from Firestore"""
        try:
            logger.info(f"📖 [Firestore] Getting product {row_num} for {collection_name}")

            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({
                    'success': False,
                    'error': 'Firestore not initialized'
                }), 500

            product = firestore_manager.get_single_product(collection_name, row_num)

            if not product:
                logger.warning(f"Product {row_num} not found in {collection_name}")
                return jsonify({
                    'success': False,
                    'error': 'Product not found'
                }), 404

            logger.info(f"✅ [Firestore] Retrieved product {row_num}")

            return jsonify({
                'success': True,
                'product': product,
                'collection': collection_name,
                'source': 'firestore'
            })

        except Exception as e:
            logger.error(f"❌ [Firestore] Error getting product {row_num}: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/<collection_name>/products/<int:row_num>/batch', methods=['PUT'])
    def api_batch_update_product_firestore(collection_name, row_num):
        """
        Batch update multiple fields for a single product in Firestore
        Applies data cleaning rules automatically
        """
        try:
            data = request.get_json()
            if not data or not isinstance(data, dict):
                return jsonify({
                    'success': False,
                    'error': 'Data object with field-value pairs is required'
                }), 400

            logger.info(f"📝 [Firestore] Batch updating {collection_name} row {row_num} with {len(data)} fields")

            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({
                    'success': False,
                    'error': 'Firestore not initialized'
                }), 500

            # Get current product data
            current_product = firestore_manager.get_single_product(collection_name, row_num)
            if not current_product:
                return jsonify({
                    'success': False,
                    'error': 'Product not found'
                }), 404

            # Merge updates with current data for cleaning
            merged_product = {**current_product, **data}

            # Apply data cleaning
            data_cleaner = get_data_cleaner(firestore_manager.db)
            cleaning_updates = data_cleaner.clean_product(collection_name, merged_product)

            # Combine user updates with cleaning updates
            all_updates = {**data, **cleaning_updates}

            logger.info(f"🧹 [Firestore] Applied {len(cleaning_updates)} cleaning updates")

            # Update in Firestore
            success = firestore_manager.update_product_row(
                collection_name,
                row_num,
                all_updates,
                overwrite_mode=False
            )

            if not success:
                return jsonify({
                    'success': False,
                    'error': 'Failed to update product'
                }), 500

            # Get updated product
            updated_product = firestore_manager.get_single_product(collection_name, row_num)

            # Invalidate route-level cache
            _invalidate_route_cache(collection_name)

            # Note: Sync to Google Sheets is handled by Apps Script (Sheets → Firestore)
            # No need to push back to Sheets - Apps Script is the source of truth

            logger.info(f"✅ [Firestore] Successfully updated {collection_name} row {row_num}")

            return jsonify({
                'success': True,
                'message': f'Updated {len(all_updates)} fields for row {row_num}',
                'fields_updated': len(data),
                'cleaning_applied': len(cleaning_updates),
                'product': updated_product,
                'source': 'firestore'
            })

        except Exception as e:
            logger.error(f"❌ [Firestore] Error updating product {row_num}: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/<collection_name>/products/all', methods=['GET'])
    def api_get_all_products_firestore(collection_name):
        """Get all products for a collection from Firestore"""
        try:
            logger.info(f"📖 [Firestore] Getting all products for {collection_name}")

            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({
                    'success': False,
                    'error': 'Firestore not initialized'
                }), 500

            # Get all products (returns a dict)
            products_dict = firestore_manager.get_all_products(collection_name)

            # Convert to list sorted by row number for consistent ordering
            products_list = [
                product_data
                for row_num, product_data in sorted(products_dict.items())
            ]

            logger.info(f"✅ [Firestore] Retrieved {len(products_list)} products")

            return jsonify({
                'success': True,
                'products': products_list,
                'count': len(products_list),
                'collection': collection_name,
                'source': 'firestore'
            })

        except Exception as e:
            logger.error(f"❌ [Firestore] Error getting all products: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/<collection_name>/products/paginated', methods=['GET'])
    def api_get_paginated_products_firestore(collection_name):
        """Get paginated products from Firestore using native pagination"""
        try:
            page = int(request.args.get('page', 1))
            # Support both 'limit' (frontend uses this) and 'per_page'
            per_page = int(request.args.get('limit', request.args.get('per_page', 50)))

            logger.info(f"📖 [Firestore] Getting paginated products for {collection_name} (page {page}, {per_page} per page)")

            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({
                    'success': False,
                    'error': 'Firestore not initialized'
                }), 500

            # CRITICAL OPTIMIZATION: For large requests (loading all products), use the cached get_all_products()
            # This prevents reading 1,200+ documents from Firestore on every page load!
            if per_page > 100:
                logger.info(f"💾 [OPTIMIZATION] Using cached get_all_products() for large request (limit={per_page})")

                # Get all products from cache (this uses the 5-minute cached version)
                all_products = firestore_manager.get_all_products(collection_name)

                # Calculate pagination for the cached data
                offset = (page - 1) * per_page
                total = len(all_products)

                # Get the subset for this page
                products_dict = {}
                for row_num, product in sorted(all_products.items(), key=lambda x: int(x[0])):
                    # Skip until we reach the offset
                    if len(products_dict) < offset:
                        continue
                    # Stop when we've collected enough products
                    if len(products_dict) >= per_page:
                        break
                    products_dict[str(row_num)] = product

                # If we want ALL products (page 1 with huge limit), just return everything
                if page == 1 and per_page >= total:
                    products_dict = {str(k): v for k, v in all_products.items()}

                logger.info(f"✅ [CACHE HIT] Served {len(products_dict)} products from cache - SAVED {len(products_dict)} Firestore reads!")

                return jsonify({
                    'success': True,
                    'products': products_dict,
                    'pagination': {
                        'page': page,
                        'per_page': per_page,
                        'total': total,
                        'total_pages': (total + per_page - 1) // per_page if total > 0 else 1,
                        'has_next': offset + per_page < total,
                        'has_prev': page > 1
                    },
                    'collection': collection_name,
                    'source': 'firestore_cached'
                })

            # Use Firestore's native pagination (much faster!)
            collection_ref = firestore_manager.get_collection_ref(collection_name)

            # Get total count (cached in metadata)
            try:
                metadata_ref = firestore_manager.db.collection('collections').document(collection_name).collection('metadata').document('stats')
                metadata = metadata_ref.get()
                total = metadata.to_dict().get('total_products', 0) if metadata.exists else 0
            except:
                # Fallback: estimate from last row number
                total = 1209  # Use known count for now

            # Calculate offset
            offset = (page - 1) * per_page

            # EFFICIENT PAGINATION: Use document IDs directly (no index needed!)
            # Since documents are stored with ID = row_number, we can fetch them directly
            # This only reads the documents we need (per_page documents), not all 1,170!

            # Calculate which row numbers we need for this page
            start_row = offset + 1  # Row numbers start at 1
            end_row = start_row + per_page

            # Fetch only the documents we need by ID
            docs = []
            for row_num in range(start_row, end_row):
                try:
                    doc_ref = collection_ref.document(str(row_num))
                    doc = doc_ref.get()
                    if doc.exists:
                        product_data = doc.to_dict()
                        product_data['row_number'] = row_num
                        docs.append(product_data)
                except Exception as doc_error:
                    # Skip documents that don't exist (gaps in row numbers)
                    continue

            logger.info(f"✅ [Firestore] Efficient pagination: Read only {len(docs)} documents (not all {total}!)")

            # Convert to list
            paginated_products = []
            if isinstance(docs, list) and docs and isinstance(docs[0], dict):
                # Already processed (fallback path)
                paginated_products = docs
            else:
                # Process document snapshots (normal path)
                for doc in docs:
                    product_data = doc.to_dict()
                    product_data['row_number'] = int(doc.id)  # Ensure row_number is set
                    paginated_products.append(product_data)

            logger.info(f"✅ [Firestore] Retrieved page {page} ({len(paginated_products)} products) using native pagination")

            # Convert list to dictionary keyed by row_number for frontend compatibility
            # Frontend expects products as {row_num: product_data}, not as a list
            products_dict = {}
            for product in paginated_products:
                row_num = product.get('row_number')
                if row_num:
                    products_dict[str(row_num)] = product

            return jsonify({
                'success': True,
                'products': products_dict,  # Dictionary keyed by row_number
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total': total,
                    'total_pages': (total + per_page - 1) // per_page if total > 0 else 1,
                    'has_next': offset + per_page < total,
                    'has_prev': page > 1
                },
                'collection': collection_name,
                'source': 'firestore'
            })

        except Exception as e:
            logger.error(f"❌ [Firestore] Error getting paginated products: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/<collection_name>/products/<int:row_num>/clean', methods=['POST'])
    def api_clean_product(collection_name, row_num):
        """
        Manually trigger data cleaning for a product
        Useful for re-cleaning existing products after rule updates
        """
        try:
            logger.info(f"🧹 [Firestore] Cleaning product {row_num} in {collection_name}")

            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({
                    'success': False,
                    'error': 'Firestore not initialized'
                }), 500

            # Get current product
            product = firestore_manager.get_single_product(collection_name, row_num)
            if not product:
                return jsonify({
                    'success': False,
                    'error': 'Product not found'
                }), 404

            # Apply cleaning
            data_cleaner = get_data_cleaner(firestore_manager.db)
            updates = data_cleaner.clean_product(collection_name, product)

            if not updates:
                return jsonify({
                    'success': True,
                    'message': 'No cleaning updates needed',
                    'updates': {},
                    'product': product
                })

            # Apply updates
            success = firestore_manager.update_product_row(
                collection_name,
                row_num,
                updates,
                overwrite_mode=False
            )

            if not success:
                return jsonify({
                    'success': False,
                    'error': 'Failed to apply cleaning updates'
                }), 500

            # Get updated product
            updated_product = firestore_manager.get_single_product(collection_name, row_num)

            logger.info(f"✅ [Firestore] Cleaned product {row_num}, applied {len(updates)} updates")

            return jsonify({
                'success': True,
                'message': f'Applied {len(updates)} cleaning updates',
                'updates': updates,
                'product': updated_product,
                'source': 'firestore'
            })

        except Exception as e:
            logger.error(f"❌ [Firestore] Error cleaning product {row_num}: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/<collection_name>/products/missing-info', methods=['GET'])
    def api_get_missing_info_firestore(collection_name):
        """Get detailed missing information analysis for products in a collection (Firestore version)"""
        try:
            # Check cache first (5 minute TTL)
            CACHE_TTL = 300  # 5 minutes
            cache_key = f"missing_info_{collection_name}"
            current_time = time.time()

            if cache_key in _cache and cache_key in _cache_timestamps:
                cache_age = current_time - _cache_timestamps[cache_key]
                if cache_age < CACHE_TTL:
                    logger.info(f"💾 [Cache HIT] Serving missing-info from cache ({cache_age:.0f}s old) - SAVED reading all 1,217 products!")
                    return jsonify(_cache[cache_key])

            logger.info(f"📖 [Firestore] Getting missing info analysis for {collection_name} (cache miss)")

            from config.collections import get_collection_config

            # Get collection configuration
            config = get_collection_config(collection_name)
            if not config:
                return jsonify({
                    'success': False,
                    'error': f'Collection not found: {collection_name}'
                }), 404

            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({
                    'success': False,
                    'error': 'Firestore not initialized'
                }), 500

            # Get all products from Firestore
            products_dict = firestore_manager.get_all_products(collection_name)

            if not products_dict:
                return jsonify({
                    'success': False,
                    'error': f'No products found for {collection_name}'
                }), 404

            # Analyze missing information for each product
            missing_info_analysis = []
            quality_fields = config.quality_fields

            for row_num, product in products_dict.items():
                # Skip completely blank or nearly blank rows
                essential_fields = ['title', 'variant_sku', 'brand_name', 'handle', 'url']
                essential_data_count = sum(1 for field in essential_fields
                                         if product.get(field, '').strip()
                                         and product.get(field, '').strip().lower() not in ['', 'none', 'null', 'n/a', '-', 'tbd', 'tbc'])

                # If product has fewer than 2 essential fields, skip it
                if essential_data_count < 2:
                    continue

                # Check for meaningful data
                meaningful_fields = [k for k, v in product.items()
                                   if v and str(v).strip()
                                   and str(v).strip().lower() not in ['', 'none', 'null', 'n/a', '-', 'tbd', 'tbc']
                                   and k not in ['row_number', 'id']]

                if len(meaningful_fields) < 3:
                    continue

                missing_fields = []

                # Check each quality field for missing data
                for field in quality_fields:
                    value = product.get(field, '') or ''
                    value = str(value).strip() if value else ''
                    if not value or value.lower() in ['', 'none', 'null', 'n/a', '-', 'tbd', 'tbc']:
                        missing_fields.append({
                            'field': field,
                            'display_name': field.replace('_', ' ').title(),
                            'is_critical': field in ['title', 'variant_sku', 'brand_name', 'product_material',
                                                    'installation_type', 'style', 'grade_of_material',
                                                    'waste_outlet_dimensions', 'body_html', 'features',
                                                    'care_instructions', 'faqs']
                        })

                # Only include products with missing fields
                if missing_fields:
                    critical_missing = [f for f in missing_fields if f['is_critical']]

                    missing_info_analysis.append({
                        'row_number': row_num,
                        'title': product.get('title', 'Untitled'),
                        'variant_sku': product.get('variant_sku', ''),
                        'brand_name': product.get('brand_name', ''),
                        'missing_fields': missing_fields,
                        'critical_missing_count': len(critical_missing),
                        'total_missing_count': len(missing_fields),
                        'quality_score': product.get('quality_score', 0)
                    })

            # Sort by critical missing count, then total missing count
            missing_info_analysis.sort(key=lambda x: (x['critical_missing_count'], x['total_missing_count']), reverse=True)

            logger.info(f"✅ [Firestore] Found {len(missing_info_analysis)} products with missing info")

            # Build response with summary object (frontend expects this structure)
            total_products = len(products_dict)
            products_with_missing = len(missing_info_analysis)
            products_missing_critical = len([p for p in missing_info_analysis if p['critical_missing_count'] > 0])
            products_missing_some = len([p for p in missing_info_analysis if p['critical_missing_count'] == 0])

            response_data = {
                'success': True,
                'collection': collection_name,
                'summary': {
                    'total_products': total_products,
                    'total_products_with_missing_info': products_with_missing,
                    'products_missing_critical': products_missing_critical,
                    'products_missing_some': products_missing_some
                },
                'total_products_with_missing_info': products_with_missing,  # Keep for backward compatibility
                'products_missing_critical': products_missing_critical,
                'products_missing_some': products_missing_some,
                'missing_info_analysis': missing_info_analysis,
                'source': 'firestore'
            }

            # Cache the result
            _cache[cache_key] = response_data
            _cache_timestamps[cache_key] = current_time
            logger.info(f"💾 [Cache STORE] Cached missing-info for {collection_name} (TTL: {CACHE_TTL}s)")

            return jsonify(response_data)

        except Exception as e:
            logger.error(f"❌ [Firestore] Error getting missing info: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/<collection_name>/supplier-products/missing', methods=['GET'])
    def api_get_missing_supplier_products_firestore(collection_name):
        """Get supplier products detected for this collection that aren't in PIM yet (Firestore version)"""
        try:
            from core.supplier_db import get_supplier_db

            supplier_db = get_supplier_db()

            # Get products detected for this collection
            detected_products = supplier_db.get_by_collection(collection_name, confidence_threshold=0.5)

            if not detected_products:
                return jsonify({
                    'success': True,
                    'products': [],
                    'count': 0,
                    'message': 'No products detected for this collection'
                })

            # Get existing product SKUs from Firestore (instead of Sheets)
            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({
                    'success': False,
                    'error': 'Firestore not initialized'
                }), 500

            existing_products_dict = firestore_manager.get_all_products(collection_name)
            existing_skus = set()

            for product in existing_products_dict.values():
                sku = product.get('variant_sku') or product.get('sku')
                if sku:
                    existing_skus.add(sku.strip().lower())

            # Filter out products that already exist
            missing_products = []
            for product in detected_products:
                supplier_sku = product.get('sku', '').strip().lower()
                if supplier_sku and supplier_sku not in existing_skus:
                    missing_products.append(product)

            logger.info(f"📖 [Firestore] Found {len(missing_products)} missing supplier products for {collection_name}")

            return jsonify({
                'success': True,
                'products': missing_products,
                'count': len(missing_products),
                'total_detected': len(detected_products),
                'existing_count': len(existing_skus),
                'source': 'firestore'
            })

        except Exception as e:
            logger.error(f"❌ [Firestore] Error getting missing supplier products: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/<collection_name>/wip/process-one-firestore', methods=['POST'])
    def api_process_one_wip_product_firestore(collection_name):
        """
        Process a SINGLE WIP product using Firestore (not Google Sheets)

        This endpoint:
        1. Extracts product data from supplier URL using AI
        2. Adds product to Firestore (not Google Sheets)
        3. Applies Python data cleaning (not Google Apps Script)
        4. Marks WIP product as ready for review

        Request: {"wip_id": 123, "fast_mode": true}
        Response: {"success": true, "wip_id": 123, "sku": "ABC123", "row_num": 1210, "duration": 45.2}
        """
        try:
            data = request.get_json()
            wip_id = data.get('wip_id')
            fast_mode = data.get('fast_mode', False)

            if not wip_id:
                return jsonify({'success': False, 'error': 'No WIP ID provided'}), 400

            import time
            start_time = time.time()

            from core.supplier_db import get_supplier_db
            from core.ai_extractor import get_ai_extractor

            supplier_db = get_supplier_db()
            ai_extractor = get_ai_extractor()
            firestore_manager = get_firestore_manager()

            if not firestore_manager.db:
                return jsonify({'success': False, 'error': 'Firestore not initialized'}), 500

            # Get WIP product
            wip_products = supplier_db.get_wip_products(collection_name)
            wip_product = next((p for p in wip_products if p.get('id') == wip_id), None)

            if not wip_product:
                return jsonify({'success': False, 'error': 'WIP product not found'}), 404

            sku = wip_product['sku']
            product_url = wip_product['product_url']
            logger.info(f"🚀 [Firestore] Processing {sku} ({'FAST' if fast_mode else 'FULL'} mode)")

            # Step 1: AI Extraction
            supplier_db.update_wip_status(wip_id, 'extracting')
            logger.info(f"🤖 [Firestore] Extracting data from {product_url}")

            extraction_result = ai_extractor.extract_product_data(
                url=product_url,
                collection_name=collection_name
            )

            if not extraction_result or not extraction_result.get('success'):
                error_msg = extraction_result.get('error', 'AI extraction failed') if extraction_result else 'AI extraction failed'
                supplier_db.update_wip_error(wip_id, error_msg)
                logger.error(f"❌ [Firestore] Extraction failed for {sku}: {error_msg}")
                return jsonify({'success': False, 'wip_id': wip_id, 'sku': sku, 'error': error_msg}), 500

            extracted_data = extraction_result.get('data', {})
            extracted_data['variant_sku'] = sku
            extracted_data['url'] = product_url

            logger.info(f"✅ [Firestore] Extracted {len(extracted_data)} fields for {sku}")

            # Step 2: Content Generation (skip in fast mode)
            if not fast_mode:
                supplier_db.update_wip_status(wip_id, 'generating')
                logger.info(f"✍️ [Firestore] Generating content for {sku}")

                from core.data_processor import get_data_processor
                data_proc = get_data_processor()

                # Generate content using extracted data
                # Note: This still needs the row to exist, so we'll add it first then generate
                pass  # We'll generate content after adding to Firestore

            # Step 3: Add product to Firestore
            supplier_db.update_wip_status(wip_id, 'cleaning')
            logger.info(f"💾 [Firestore] Adding product to Firestore")

            row_num = firestore_manager.add_product(collection_name, extracted_data)
            supplier_db.update_wip_sheet_row(wip_id, row_num)

            logger.info(f"✅ [Firestore] Added product to row {row_num}")

            # Step 4: Apply data cleaning
            logger.info(f"🧹 [Firestore] Applying data cleaning rules")

            data_cleaner = get_data_cleaner(firestore_manager.db)
            product_with_row = {**extracted_data, 'row_number': row_num}
            cleaning_updates = data_cleaner.clean_product(collection_name, product_with_row)

            if cleaning_updates:
                firestore_manager.update_product_row(
                    collection_name,
                    row_num,
                    cleaning_updates,
                    overwrite_mode=False
                )
                logger.info(f"✅ [Firestore] Applied {len(cleaning_updates)} cleaning updates")

            # Step 5: Mark as complete
            # Note: Sync to Google Sheets is handled by Apps Script (Sheets → Firestore)
            # No need to push back to Sheets - Apps Script is the source of truth
            supplier_db.complete_wip(wip_id)
            duration = time.time() - start_time

            logger.info(f"🎉 [Firestore] Processing complete for {sku} in {duration:.1f}s")

            return jsonify({
                'success': True,
                'wip_id': wip_id,
                'sku': sku,
                'row_num': row_num,
                'extracted_fields': list(extracted_data.keys()),
                'cleaning_applied': len(cleaning_updates) if cleaning_updates else 0,
                'duration': duration,
                'fast_mode': fast_mode,
                'source': 'firestore'
            })

        except Exception as e:
            logger.error(f"❌ [Firestore] Error processing WIP product: {e}", exc_info=True)
            import traceback
            traceback.print_exc()
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/api/<collection_name>/migrate-bowl-fields', methods=['POST'])
    def api_migrate_bowl_fields(collection_name):
        """
        Migrate bowl_height_mm → bowl_length_mm and second_bowl_height_mm → second_bowl_length_mm
        One-time migration to rename these fields across all products in Firestore
        """
        try:
            logger.info(f"🔄 [Firestore] Starting bowl field migration for {collection_name}")

            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({
                    'success': False,
                    'error': 'Firestore not initialized'
                }), 500

            # Get all products
            products = firestore_manager.get_all_products(collection_name, force_refresh=True)

            updated_count = 0
            skipped_count = 0
            error_count = 0
            migration_log = []

            for row_num, product in products.items():
                try:
                    updates = {}
                    changes = []

                    # Migrate bowl_height_mm → bowl_length_mm
                    if 'bowl_height_mm' in product:
                        value = product['bowl_height_mm']
                        if value and str(value).strip():
                            updates['bowl_length_mm'] = value
                            changes.append(f"bowl_height_mm({value}) → bowl_length_mm")
                        else:
                            # Set empty value for new field name
                            if 'bowl_length_mm' not in product:
                                updates['bowl_length_mm'] = ""
                                changes.append("Initialize bowl_length_mm")

                    # Migrate second_bowl_height_mm → second_bowl_length_mm
                    if 'second_bowl_height_mm' in product:
                        value = product['second_bowl_height_mm']
                        if value and str(value).strip():
                            updates['second_bowl_length_mm'] = value
                            changes.append(f"second_bowl_height_mm({value}) → second_bowl_length_mm")
                        else:
                            if 'second_bowl_length_mm' not in product:
                                updates['second_bowl_length_mm'] = ""
                                changes.append("Initialize second_bowl_length_mm")

                    # Apply updates
                    if updates:
                        success = firestore_manager.update_product_row(
                            collection_name,
                            row_num,
                            updates,
                            overwrite_mode=True
                        )

                        if success:
                            updated_count += 1
                            migration_log.append({
                                'row_num': row_num,
                                'sku': product.get('variant_sku', ''),
                                'changes': changes
                            })
                            if updated_count % 50 == 0:  # Log progress every 50 updates
                                logger.info(f"📊 Migration progress: {updated_count} products updated...")
                        else:
                            error_count += 1
                            logger.error(f"❌ Failed to update row {row_num}")
                    else:
                        skipped_count += 1

                except Exception as e:
                    error_count += 1
                    logger.error(f"❌ Error migrating row {row_num}: {e}")

            logger.info(f"✅ Migration complete: {updated_count} updated, {skipped_count} skipped, {error_count} errors")

            # Invalidate cache after migration
            _invalidate_route_cache(collection_name)

            return jsonify({
                'success': True,
                'collection': collection_name,
                'total_products': len(products),
                'updated': updated_count,
                'skipped': skipped_count,
                'errors': error_count,
                'migration_log': migration_log[:20],  # Return first 20 for inspection
                'message': f'Migrated bowl fields for {updated_count} products'
            })

        except Exception as e:
            logger.error(f"❌ Migration error: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    logger.info("✅ Firestore product routes registered")
