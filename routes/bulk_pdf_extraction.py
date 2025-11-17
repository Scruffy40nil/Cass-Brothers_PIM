"""
Bulk PDF Extraction Routes
Handles batch processing of PDF spec sheets for automatic dimension extraction
"""
import logging
import time
import threading
from flask import request, jsonify
from extract_dimensions_from_pdf import PDFDimensionExtractor
from core.ai_extractor import AIExtractor
from config.collections import get_collection_config
import tempfile
import requests
import os

logger = logging.getLogger(__name__)

def setup_bulk_pdf_routes(app, sheets_manager, socketio):
    """Setup bulk PDF extraction routes"""

    def run_bulk_extraction_background(collection_name, batch_size, delay_seconds, specific_rows, overwrite):
        """Background thread function to run bulk PDF extraction"""
        import threading
        logger.info(f"🤖 Starting bulk PDF extraction in thread: {threading.current_thread().name}")
        logger.info(f"   Collection: {collection_name}, Batch size: {batch_size}, Delay: {delay_seconds}s, Overwrite: {overwrite}")

        try:
            logger.info(f"📥 Step 1: Fetching all products from Google Sheets...")
            # Get all products
            products = sheets_manager.get_all_products(collection_name)
            logger.info(f"✅ Step 1 complete: Retrieved {len(products)} products")

            # Filter products with PDF spec sheets
            products_with_pdfs = []
            for row_num, product in products.items():
                # Skip if specific rows requested and this isn't one of them
                if specific_rows and row_num not in specific_rows:
                    continue

                spec_sheet_url = product.get('shopify_spec_sheet', '')
                # Check if URL contains .pdf (handles both direct URLs and URLs with query parameters)
                if spec_sheet_url and '.pdf' in spec_sheet_url.lower():
                    # Check if we should skip (data already exists and overwrite=False)
                    if not overwrite:
                        # Skip if critical dimensions already exist (collection-specific)
                        if collection_name.lower() == 'filter_taps':
                            # For filter_taps, check if AI extracted fields exist
                            has_data = (
                                product.get('material') or
                                product.get('spout_height_mm') or
                                product.get('flow_rate') or
                                product.get('wels_rating')
                            )
                        elif collection_name.lower() in ['taps', 'tap', 'faucet', 'mixer']:
                            # For taps, check spout dimensions
                            has_data = (
                                product.get('spout_height_mm') or
                                product.get('spout_reach_mm')
                            )
                        else:
                            # For sinks and baths, check dimensions
                            has_data = (
                                product.get('length_mm') or
                                product.get('bowl_width_mm') or
                                product.get('bowl_depth_mm')
                            )

                        if has_data:
                            logger.info(f"⏭️  Skipping row {row_num} - already has dimension data")
                            continue

                    products_with_pdfs.append({
                        'row_number': row_num,
                        'sku': product.get('variant_sku', 'Unknown'),
                        'title': product.get('title', 'Unknown'),
                        'spec_sheet_url': spec_sheet_url,
                        'product': product
                    })

            total_count = len(products_with_pdfs)

            if total_count == 0:
                socketio.emit('pdf_extraction_complete', {
                    'total': 0,
                    'processed': 0,
                    'succeeded': 0,
                    'failed': 0,
                    'skipped': 0,
                    'errors': []
                }, namespace='/', room='bulk_extraction')
                logger.info("⏭️  No products with PDF spec sheets found (or all already have data)")
                return

            logger.info(f"📊 Found {total_count} products with PDF spec sheets to process")

            # Initialize extractor based on collection type
            logger.info(f"🔧 Step 2: Initializing AI extractor for {collection_name}...")
            use_ai_extraction = collection_name.lower() in ['filter_taps', 'baths']

            if use_ai_extraction:
                ai_extractor = AIExtractor()
                logger.info(f"✅ AI extractor initialized successfully for {collection_name}")
            else:
                dimension_extractor = PDFDimensionExtractor()
                logger.info(f"📐 Using dimension extraction for {collection_name}")

            # Track results
            results = {
                'total': total_count,
                'processed': 0,
                'succeeded': 0,
                'failed': 0,
                'skipped': 0,
                'errors': []
            }

            # Batch writing configuration
            SHEET_WRITE_BATCH_SIZE = 10  # Write to sheets every 10 products
            pending_updates = []  # Queue of updates to write

            # Process in batches
            for idx, item in enumerate(products_with_pdfs):
                row_num = item['row_number']
                sku = item['sku']
                spec_sheet_url = item['spec_sheet_url']
                product = item['product']

                try:
                    # Emit progress via SocketIO
                    progress = {
                        'current': idx + 1,
                        'total': total_count,
                        'percentage': int(((idx + 1) / total_count) * 100),
                        'row_number': row_num,
                        'sku': sku,
                        'status': 'processing'
                    }
                    socketio.emit('pdf_extraction_progress', progress, namespace='/', room='bulk_extraction')

                    logger.info(f"🔄 Processing {idx + 1}/{total_count}: Row {row_num} - {sku}")

                    # Download PDF
                    response = requests.get(spec_sheet_url, timeout=30)
                    response.raise_for_status()

                    # Save to temp file
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp_file:
                        tmp_file.write(response.content)
                        tmp_pdf_path = tmp_file.name

                    try:
                        # Extract data based on collection type
                        if use_ai_extraction:
                            # Use AI extraction for filter_taps and baths
                            logger.info(f"🤖 Extracting with AI from PDF: {spec_sheet_url}")
                            extraction_result = ai_extractor._process_single_product_no_trigger(
                                collection_name=collection_name,
                                url=spec_sheet_url,
                                generate_content=False  # Don't generate descriptions in bulk
                            )

                            if extraction_result and extraction_result.get('success'):
                                # Get extracted data
                                update_data = extraction_result.get('extracted_data', {})
                                logger.info(f"✅ AI extracted {len(update_data)} fields: {list(update_data.keys())}")

                                # Queue update for batch writing
                                if update_data:
                                    pending_updates.append({
                                        'row_num': row_num,
                                        'data': update_data,
                                        'sku': sku
                                    })
                                    logger.info(f"📝 Queued update for row {row_num} ({len(pending_updates)} in queue)")
                            else:
                                error_msg = extraction_result.get('error', 'AI extraction failed') if extraction_result else 'No extraction result'
                                logger.error(f"❌ AI extraction error: {error_msg}")
                                extraction_result = {'error': error_msg}
                                update_data = {}
                        else:
                            # Use dimension extraction for taps and sinks
                            extraction_result = dimension_extractor.extract_dimensions_from_pdf(tmp_pdf_path, collection_name)

                            if extraction_result and not extraction_result.get('error'):
                                # Map extracted data to sheet columns
                                update_data = {}

                                # Map dimensions based on collection type
                                if collection_name.lower() in ['taps', 'tap', 'faucet', 'mixer']:
                                    # Tap/Faucet specific dimensions
                                    if extraction_result.get('spout_height_mm'):
                                        update_data['spout_height_mm'] = extraction_result['spout_height_mm']
                                    if extraction_result.get('spout_reach_mm'):
                                        update_data['spout_reach_mm'] = extraction_result['spout_reach_mm']
                                    if extraction_result.get('height_mm'):
                                        # If spout_height not found, use general height
                                        if not update_data.get('spout_height_mm'):
                                            update_data['spout_height_mm'] = extraction_result['height_mm']
                                    if extraction_result.get('base_diameter_mm'):
                                        update_data['base_diameter_mm'] = extraction_result['base_diameter_mm']
                                    logger.info(f"📐 Tap dimensions mapped: {update_data}")
                                else:
                                    # Sink specific dimensions
                                    if extraction_result.get('overall_length_mm'):
                                        update_data['length_mm'] = extraction_result['overall_length_mm']
                                    if extraction_result.get('overall_width_mm'):
                                        update_data['overall_width_mm'] = extraction_result['overall_width_mm']
                                    if extraction_result.get('overall_depth_mm'):
                                        update_data['overall_depth_mm'] = extraction_result['overall_depth_mm']
                                    if extraction_result.get('bowl_width_mm'):
                                        update_data['bowl_width_mm'] = extraction_result['bowl_width_mm']
                                    if extraction_result.get('bowl_depth_mm'):
                                        update_data['bowl_depth_mm'] = extraction_result['bowl_depth_mm']
                                    if extraction_result.get('bowl_length_mm'):
                                        update_data['bowl_height_mm'] = extraction_result['bowl_length_mm']
                                    if extraction_result.get('second_bowl_width_mm'):
                                        update_data['second_bowl_width_mm'] = extraction_result['second_bowl_width_mm']
                                    if extraction_result.get('second_bowl_depth_mm'):
                                        update_data['second_bowl_depth_mm'] = extraction_result['second_bowl_depth_mm']
                                    if extraction_result.get('second_bowl_length_mm'):
                                        update_data['second_bowl_height_mm'] = extraction_result['second_bowl_length_mm']
                                    if extraction_result.get('minimum_cabinet_size_mm'):
                                        update_data['min_cabinet_size_mm'] = extraction_result['minimum_cabinet_size_mm']
                                    if extraction_result.get('cutout_length_mm'):
                                        update_data['cutout_size_mm'] = extraction_result['cutout_length_mm']

                                # Common fields for all collections
                                if extraction_result.get('material'):
                                    update_data['product_material'] = extraction_result['material']
                                if extraction_result.get('brand'):
                                    update_data['brand_name'] = extraction_result['brand']

                                # Queue update for batch writing
                                if update_data:
                                    pending_updates.append({
                                        'row_num': row_num,
                                        'data': update_data,
                                        'sku': sku
                                    })
                                    logger.info(f"📝 Queued dimension update for row {row_num} ({len(pending_updates)} in queue)")
                            else:
                                update_data = {}

                        # Update the product in Google Sheets
                        # Both AI and dimension extraction now write to sheet explicitly
                        if extraction_result and not extraction_result.get('error') and update_data:
                            # Data was extracted and written successfully
                            results['succeeded'] += 1
                            logger.info(f"✅ Row {row_num}: Extracted and saved {len(update_data)} fields")

                            # Emit success
                            progress['status'] = 'success'
                            progress['fields_extracted'] = len(update_data)
                            socketio.emit('pdf_extraction_progress', progress, namespace='/', room='bulk_extraction')
                        elif extraction_result and not extraction_result.get('error') and not update_data:
                            # Extraction succeeded but no data
                            results['skipped'] += 1
                            logger.warning(f"⏭️  Row {row_num}: No data extracted from PDF")
                        else:
                            # Extraction failed
                            results['failed'] += 1
                            error_msg = extraction_result.get('error', 'Unknown error') if extraction_result else 'No extraction result'
                            results['errors'].append({'row': row_num, 'sku': sku, 'error': error_msg})
                            logger.error(f"❌ Row {row_num}: {error_msg}")

                    finally:
                        # Clean up temp file
                        if os.path.exists(tmp_pdf_path):
                            os.unlink(tmp_pdf_path)

                except Exception as e:
                    results['failed'] += 1
                    error_msg = str(e)
                    results['errors'].append({'row': row_num, 'sku': sku, 'error': error_msg})
                    logger.error(f"❌ Row {row_num} error: {e}")

                    # Emit error
                    progress['status'] = 'error'
                    progress['error'] = error_msg
                    socketio.emit('pdf_extraction_progress', progress, namespace='/', room='bulk_extraction')

                results['processed'] += 1

                # Write queued updates to Google Sheets every SHEET_WRITE_BATCH_SIZE products
                if len(pending_updates) >= SHEET_WRITE_BATCH_SIZE:
                    logger.info(f"💾 Writing batch of {len(pending_updates)} updates to Google Sheets...")
                    result = sheets_manager.bulk_update_products(
                        collection_name,
                        pending_updates,
                        overwrite_mode=overwrite
                    )
                    logger.info(f"✅ Wrote {result['success_count']}/{len(pending_updates)} products to Google Sheets")
                    pending_updates = []  # Clear queue

                # Batch delay (rate limiting)
                if (idx + 1) % batch_size == 0 and (idx + 1) < total_count:
                    logger.info(f"⏸️  Batch complete. Waiting {delay_seconds}s before next batch...")
                    time.sleep(delay_seconds)

            # Write any remaining queued updates
            if pending_updates:
                logger.info(f"💾 Writing final batch of {len(pending_updates)} updates to Google Sheets...")
                result = sheets_manager.bulk_update_products(
                    collection_name,
                    pending_updates,
                    overwrite_mode=overwrite
                )
                logger.info(f"✅ Wrote {result['success_count']}/{len(pending_updates)} products to Google Sheets")
                pending_updates = []

            # Final results
            logger.info(f"🎉 Bulk extraction complete!")
            logger.info(f"   Total: {results['total']}, Succeeded: {results['succeeded']}, Failed: {results['failed']}, Skipped: {results['skipped']}")

            # Emit completion
            socketio.emit('pdf_extraction_complete', results, namespace='/', room='bulk_extraction')

        except Exception as e:
            logger.error(f"❌ Bulk PDF extraction error: {e}")
            socketio.emit('pdf_extraction_complete', {
                'total': 0,
                'processed': 0,
                'succeeded': 0,
                'failed': 1,
                'skipped': 0,
                'errors': [{'error': str(e)}]
            }, namespace='/', room='bulk_extraction')

    @app.route('/api/<collection_name>/bulk-extract-pdfs', methods=['POST'])
    def api_bulk_extract_pdfs(collection_name):
        """
        Start bulk extraction in background thread

        Request body:
        {
            "batch_size": 10,  # Optional: PDFs to process before delay (default: 5)
            "delay_seconds": 10,  # Optional: seconds to wait between batches (default: 5)
            "row_numbers": [2, 3, 4],  # Optional: specific rows to process
            "overwrite": false  # Optional: overwrite existing data (default: false)
        }
        """
        try:
            data = request.get_json() or {}
            batch_size = data.get('batch_size', 5)
            delay_seconds = data.get('delay_seconds', 5)
            specific_rows = data.get('row_numbers', [])
            overwrite = data.get('overwrite', False)

            # Start background thread (non-daemon so it keeps server alive)
            thread = threading.Thread(
                target=run_bulk_extraction_background,
                args=(collection_name, batch_size, delay_seconds, specific_rows, overwrite),
                name=f"BulkPDFExtraction-{collection_name}"
            )
            thread.daemon = False  # Keep server alive while extraction runs
            thread.start()

            logger.info(f"🚀 Started bulk PDF extraction in background thread: {thread.name}")
            logger.info(f"   Thread will keep server alive until extraction completes")

            return jsonify({
                'success': True,
                'message': 'Bulk extraction started in background. Monitor progress via SocketIO.',
                'status': 'started'
            }), 200

        except Exception as e:
            logger.error(f"❌ Failed to start bulk extraction: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/<collection_name>/count-pdfs', methods=['GET'])
    def api_count_pdfs(collection_name):
        """Count how many products have PDF spec sheets"""
        try:
            products = sheets_manager.get_all_products(collection_name)

            pdf_count = 0
            with_data = 0
            without_data = 0

            for row_num, product in products.items():
                spec_sheet_url = product.get('shopify_spec_sheet', '')
                # Check if URL contains .pdf (handles both direct URLs and URLs with query parameters)
                if spec_sheet_url and '.pdf' in spec_sheet_url.lower():
                    pdf_count += 1

                    # Check if has dimension data (collection-specific)
                    if collection_name.lower() == 'filter_taps':
                        # For filter_taps, check if AI extracted fields exist
                        has_data = (
                            product.get('material') or
                            product.get('spout_height_mm') or
                            product.get('flow_rate') or
                            product.get('wels_rating')
                        )
                    elif collection_name.lower() in ['taps', 'tap', 'faucet', 'mixer']:
                        # For taps, check spout dimensions
                        has_data = (
                            product.get('spout_height_mm') or
                            product.get('spout_reach_mm')
                        )
                    else:
                        # For sinks and baths, check dimensions
                        has_data = (
                            product.get('length_mm') or
                            product.get('bowl_width_mm') or
                            product.get('bowl_depth_mm')
                        )

                    if has_data:
                        with_data += 1
                    else:
                        without_data += 1

            return jsonify({
                'success': True,
                'total_products': len(products),
                'with_pdf': pdf_count,
                'with_data': with_data,
                'without_data': without_data,
                'ready_to_extract': without_data
            }), 200

        except Exception as e:
            logger.error(f"❌ Error counting PDFs: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    logger.info("✅ Bulk PDF extraction routes registered")
