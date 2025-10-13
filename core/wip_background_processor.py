"""
Background WIP Product Processor

Handles the actual processing of WIP products in the background,
including AI extraction, content generation, and Google Apps Script cleaning.
"""

import logging
import time
from typing import List, Dict, Any, Callable
import asyncio

logger = logging.getLogger(__name__)


def process_wip_products_background(
    job_id: str,
    wip_ids: List[int],
    collection_name: str,
    progress_callback: Callable[[str, Dict[str, Any]], None],
    supplier_db,
    sheets_manager,
    data_processor,
    google_apps_script_manager
):
    """
    Process WIP products in the background

    Args:
        job_id: The job ID for tracking
        wip_ids: List of WIP product IDs to process
        collection_name: Collection name
        progress_callback: Function to call with progress updates
        supplier_db: Supplier database instance
        sheets_manager: Google Sheets manager instance
        data_processor: Data processor instance
        google_apps_script_manager: Google Apps Script manager instance
    """

    logger.info(f"🚀 Starting background processing of {len(wip_ids)} WIP products for job {job_id}")

    for idx, wip_id in enumerate(wip_ids):
        product_start_time = time.time()

        try:
            # Add delay between products to avoid Google Sheets API rate limits
            # (60 requests/minute = 1 request/second max)
            # Each product uses ~15-20 API calls (add, extract, generate content, clean)
            # So wait 20 seconds between products to stay well under the limit
            if idx > 0:
                logger.info(f"⏳ Waiting 20 seconds before next product to avoid rate limits...")
                time.sleep(20)

            # Get WIP product data
            wip_products = supplier_db.get_wip_products(collection_name)
            wip_product = next((p for p in wip_products if p.get('id') == wip_id), None)

            if not wip_product:
                logger.warning(f"WIP product {wip_id} not found")
                progress_callback(job_id, {
                    'wip_id': wip_id,
                    'success': False,
                    'error': 'WIP product not found'
                })
                continue

            sku = wip_product['sku']
            logger.info(f"📦 Processing product {idx + 1}/{len(wip_ids)}: {sku} (WIP ID: {wip_id})")

            # Step 1: Add to Google Sheets (SKU + URL only)
            logger.info(f"📝 Adding {sku} to Google Sheets...")
            supplier_db.update_wip_status(wip_id, 'extracting')

            new_row_data = {
                'variant_sku': sku,
                'url': wip_product['product_url']
            }

            try:
                row_num = sheets_manager.add_product(collection_name, new_row_data)
                supplier_db.update_wip_sheet_row(wip_id, row_num)
                logger.info(f"✅ Added to sheet at row {row_num}")
            except Exception as e:
                logger.error(f"❌ Failed to add {sku} to Google Sheets: {e}")
                supplier_db.update_wip_error(wip_id, f"Failed to add to sheets: {str(e)}")
                progress_callback(job_id, {
                    'wip_id': wip_id,
                    'sku': sku,
                    'success': False,
                    'error': f"Failed to add to sheets: {str(e)}"
                })
                continue

            # Step 2: Run AI Extraction
            logger.info(f"🤖 Running AI extraction for {sku}...")
            try:
                result = data_processor._process_single_url(
                    collection_name,
                    row_num,
                    wip_product['product_url'],
                    overwrite_mode=True
                )

                if not result.success:
                    logger.error(f"❌ AI extraction failed for {sku}: {result.error}")
                    supplier_db.update_wip_error(wip_id, result.error or "Extraction failed")
                    progress_callback(job_id, {
                        'wip_id': wip_id,
                        'sku': sku,
                        'success': False,
                        'error': result.error
                    })
                    continue

                logger.info(f"✅ AI extraction completed for {sku}")

            except Exception as e:
                logger.error(f"❌ AI extraction exception for {sku}: {e}", exc_info=True)
                supplier_db.update_wip_error(wip_id, f"Extraction error: {str(e)}")
                progress_callback(job_id, {
                    'wip_id': wip_id,
                    'sku': sku,
                    'success': False,
                    'error': f"Extraction error: {str(e)}"
                })
                continue

            # Step 3: Generate Descriptions (Features, Care Instructions)
            logger.info(f"✍️  Generating descriptions for {sku}...")
            supplier_db.update_wip_status(wip_id, 'generating')

            try:
                # Generate all content types: body_html, features, care_instructions
                gen_result = data_processor.generate_product_content(
                    collection_name=collection_name,
                    selected_rows=[row_num],
                    use_url_content=True,  # Use scraped URL content for richer descriptions
                    fields_to_generate=['body_html', 'features', 'care_instructions']
                )

                logger.info(f"📊 Content generation result for {sku}: {gen_result}")

                if gen_result.get('success') and gen_result.get('results'):
                    gen_data = gen_result['results'][0]
                    logger.info(f"📊 Individual result for {sku}: {gen_data}")

                    if gen_data.get('success'):
                        generated_content = gen_data.get('generated_content', {})
                        supplier_db.update_wip_generated_content(wip_id, generated_content)
                        logger.info(f"✅ Generated content for {sku}: {list(generated_content.keys())}")
                    else:
                        error_msg = gen_data.get('error', 'Unknown error')
                        logger.warning(f"⚠️  Content generation failed for {sku}: {error_msg}")
                        supplier_db.update_wip_error(wip_id, f"Content generation failed: {error_msg}")
                else:
                    error_msg = gen_result.get('message', 'No results returned')
                    logger.warning(f"⚠️  Content generation returned no results for {sku}: {error_msg}")
                    supplier_db.update_wip_error(wip_id, f"Content generation failed: {error_msg}")

            except Exception as e:
                logger.error(f"❌ Content generation exception for {sku}: {e}", exc_info=True)
                supplier_db.update_wip_error(wip_id, f"Content generation error: {str(e)}")
                # Don't fail the whole product, continue to cleaning

            # Step 4: Trigger Google Apps Script to clean data
            logger.info(f"🧹 Cleaning data for {sku}...")
            supplier_db.update_wip_status(wip_id, 'cleaning')

            try:
                gas_result = asyncio.run(google_apps_script_manager.trigger_post_ai_cleaning(
                    collection_name=collection_name,
                    row_number=row_num,
                    operation_type='wip_processing'
                ))
                if gas_result['success']:
                    logger.info(f"✅ Google Apps Script cleaning completed for {sku}")
                else:
                    logger.warning(f"⚠️  Google Apps Script cleaning failed for {sku}: {gas_result.get('error')}")
            except Exception as gas_error:
                logger.warning(f"⚠️  Google Apps Script cleaning exception for {sku}: {gas_error}")

            # Mark as completed
            supplier_db.complete_wip(wip_id)  # Sets status to 'ready'

            product_duration = time.time() - product_start_time
            logger.info(f"✅ Completed processing for {sku} in {product_duration:.1f}s")

            # Report success
            progress_callback(job_id, {
                'wip_id': wip_id,
                'sku': sku,
                'row_num': row_num,
                'success': True,
                'extracted_fields': result.extracted_fields,
                'duration': product_duration
            })

        except Exception as e:
            logger.error(f"❌ Unexpected error processing WIP {wip_id}: {e}", exc_info=True)
            supplier_db.update_wip_error(wip_id, str(e))
            progress_callback(job_id, {
                'wip_id': wip_id,
                'success': False,
                'error': str(e)
            })

    logger.info(f"🎉 Background processing completed for job {job_id}")
