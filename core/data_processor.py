"""
Collection-Agnostic Data Processing Engine
Orchestrates AI extraction, data processing, and quality management for any product collection
IMPROVED VERSION: Enhanced care instructions support and robust field mapping + 5-word feature limit + IMAGE EXTRACTION
"""
import logging
import time
import re
from typing import Dict, List, Any, Optional, Callable, Tuple
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor, as_completed

from config.settings import get_settings
from config.collections import get_collection_config
from config.validation import validate_product_data
from core.sheets_manager import get_sheets_manager
from core.ai_extractor import get_ai_extractor

logger = logging.getLogger(__name__)

@dataclass
class ProcessingResult:
    """Result of a processing operation"""
    row_num: int
    url: str
    success: bool
    error: Optional[str] = None
    extracted_fields: Optional[List[str]] = None
    skipped: bool = False
    processing_time: float = 0.0
    quality_score: Optional[int] = None
    generated_content: Optional[Dict[str, str]] = None
    image_count: Optional[int] = None  # NEW: For image extraction results

class DataProcessor:
    """Collection-agnostic data processor with enhanced care instructions support, feature validation, and image extraction"""
    
    def __init__(self):
        self.settings = get_settings()
        self.sheets_manager = get_sheets_manager()
        self.ai_extractor = get_ai_extractor()
        
        # Processing statistics
        self.stats = {
            'total_processed': 0,
            'successful': 0,
            'failed': 0,
            'skipped': 0,
            'total_time': 0.0
        }
    
    def _validate_feature_length(self, features_text: str, max_words: int = 5) -> str:
        """
        Validate and truncate features to ensure each feature is max_words or less
        
        Args:
            features_text: Raw features text from AI (usually bullet points)
            max_words: Maximum words per feature (default 5)
            
        Returns:
            Validated features text with truncated features
        """
        if not features_text or not features_text.strip():
            return features_text
        
        # Split into lines and process each feature
        lines = features_text.strip().split('\n')
        validated_lines = []
        truncated_count = 0
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Remove bullet point markers if present
            cleaned_line = re.sub(r'^[•\-\*\+]\s*', '', line)
            
            # Count words (split by whitespace)
            words = cleaned_line.split()
            
            if len(words) > max_words:
                # Truncate to max_words
                truncated_feature = ' '.join(words[:max_words])
                
                # Preserve bullet point format
                if line.startswith(('•', '-', '*', '+')):
                    bullet = line[0]
                    validated_lines.append(f"{bullet} {truncated_feature}")
                else:
                    validated_lines.append(f"• {truncated_feature}")
                
                truncated_count += 1
                logger.info(f"🔧 Truncated feature: '{cleaned_line}' → '{truncated_feature}' ({len(words)} words → {max_words} words)")
            else:
                # Feature is within limit, keep as is
                if not line.startswith(('•', '-', '*', '+')):
                    validated_lines.append(f"• {cleaned_line}")
                else:
                    validated_lines.append(line)
        
        validated_text = '\n'.join(validated_lines)
        
        if truncated_count > 0:
            logger.info(f"✂️ Feature validation complete: {truncated_count} features truncated to {max_words} words each")
        else:
            logger.info(f"✅ Feature validation complete: All features within {max_words} word limit")
        
        return validated_text
    
    # ==========================================
    # NEW: IMAGE EXTRACTION METHODS
    # ==========================================
    
    def extract_images_from_urls(self, collection_name: str, selected_rows: Optional[List[int]] = None, 
                               progress_callback: Optional[Callable] = None) -> Dict[str, Any]:
        """
        Extract images from URLs for a specific collection (images only)
        
        Args:
            collection_name: Name of the collection to process
            selected_rows: List of specific rows to process (None = all rows)
            progress_callback: Optional callback function for progress updates
        """
        logger.info(f"Starting image extraction for {collection_name} collection")
        
        # Get collection configuration
        try:
            config = get_collection_config(collection_name)
        except ValueError as e:
            return {"success": False, "message": str(e)}
        
        # Get URLs to process
        urls = self.sheets_manager.get_urls_from_collection(collection_name)
        if not urls:
            return {"success": False, "message": f"No URLs found in {collection_name} collection"}
        
        # Filter to selected rows if specified
        if selected_rows:
            urls = [(row_num, url) for row_num, url in urls if row_num in selected_rows]
            logger.info(f"Processing {len(urls)} selected rows for image extraction")
        
        if not urls:
            return {"success": False, "message": "No URLs match selected rows"}
        
        logger.info(f"Extracting images from {len(urls)} URLs in {collection_name}")
        
        # Process URLs for image extraction only
        results = []
        total_urls = len(urls)
        start_time = time.time()
        
        for i, (row_num, url) in enumerate(urls):
            if progress_callback:
                progress_callback(i + 1, total_urls, f"Extracting images from row {row_num}")
            
            result = self._extract_images_single_url(collection_name, row_num, url)
            results.append(result)
            
            # Add delay between requests to avoid rate limiting
            if i < total_urls - 1:
                time.sleep(self.settings.AI_DELAY_BETWEEN_REQUESTS)
        
        # Calculate summary
        processing_time = time.time() - start_time
        successful = [r for r in results if r.success]
        failed = [r for r in results if not r.success]
        
        total_images = sum(r.image_count or 0 for r in successful)
        
        logger.info(f"{collection_name} image extraction complete: {len(successful)} success, {len(failed)} failed, {total_images} images extracted in {processing_time:.1f}s")
        
        return {
            "success": True,
            "collection": collection_name,
            "results": [self._result_to_dict(r) for r in results],
            "summary": {
                "total_processed": len(results),
                "successful": len(successful),
                "failed": len(failed),
                "total_images_extracted": total_images,
                "processing_time": round(processing_time, 2)
            }
        }
    
    def _extract_images_single_url(self, collection_name: str, row_num: int, url: str) -> ProcessingResult:
        """Extract images from a single URL"""
        start_time = time.time()
        
        try:
            logger.info(f"🖼️ Extracting images from row {row_num}: {url}")
            
            # Fetch HTML content
            html_content = self.ai_extractor.fetch_html(url)
            if not html_content:
                return ProcessingResult(
                    row_num=row_num,
                    url=url,
                    success=False,
                    error="Failed to fetch HTML content",
                    processing_time=time.time() - start_time,
                    image_count=0
                )
            
            # Extract images using AI
            image_data = self.ai_extractor.extract_images_from_page(collection_name, html_content, url)
            if not image_data:
                return ProcessingResult(
                    row_num=row_num,
                    url=url,
                    success=False,
                    error="No images found or extraction failed",
                    processing_time=time.time() - start_time,
                    image_count=0
                )
            
            logger.info(f"✅ Found {len(image_data)} images in row {row_num}")
            
            # Save to dedicated images sheet
            success = self._save_images_to_sheet(collection_name, row_num, url, image_data)
            
            if success:
                # Trigger Google Apps Script data cleaning after successful image extraction
                try:
                    cleaning_triggered = self.sheets_manager.trigger_data_cleaning(collection_name, row_num)
                    if cleaning_triggered:
                        logger.info(f"✅ Triggered data cleaning after image extraction for {collection_name} row {row_num}")
                    else:
                        logger.warning(f"⚠️ Failed to trigger data cleaning after image extraction for {collection_name} row {row_num}")
                except Exception as e:
                    logger.error(f"❌ Error triggering data cleaning after image extraction for {collection_name} row {row_num}: {e}")
                    # Don't fail the whole extraction if cleaning trigger fails

                return ProcessingResult(
                    row_num=row_num,
                    url=url,
                    success=True,
                    extracted_fields=[f"image_{i}" for i in range(len(image_data))],
                    processing_time=time.time() - start_time,
                    image_count=len(image_data)
                )
            else:
                return ProcessingResult(
                    row_num=row_num,
                    url=url,
                    success=False,
                    error="Failed to save images to sheet",
                    processing_time=time.time() - start_time,
                    image_count=len(image_data)
                )
                
        except Exception as e:
            logger.error(f"Error extracting images from row {row_num}: {e}")
            return ProcessingResult(
                row_num=row_num,
                url=url,
                success=False,
                error=str(e),
                processing_time=time.time() - start_time,
                image_count=0
            )
    
    def _save_images_to_sheet(self, collection_name: str, row_num: int, url: str, image_data: List[Dict]) -> bool:
        """Save extracted image data to dedicated images sheet"""
        try:
            logger.info(f"📝 Saving {len(image_data)} images from row {row_num} to dedicated sheet")
            
            # Call the sheets manager to save images
            # This method should be implemented in your sheets_manager
            success = self.sheets_manager.save_images_to_dedicated_sheet(
                collection_name=collection_name,
                row_num=row_num,
                source_url=url,
                image_data=image_data
            )
            
            if success:
                logger.info(f"✅ Successfully saved {len(image_data)} images for row {row_num}")
            else:
                logger.error(f"❌ Failed to save images for row {row_num}")
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to save images to sheet: {e}")
            return False
    
    def extract_images_from_single_url(self, collection_name: str, url: str) -> Dict[str, Any]:
        """
        Extract images from a single URL (not tied to any existing row)
        
        Args:
            collection_name: Name of the collection (for context)
            url: URL to extract images from
        """
        logger.info(f"Starting single URL image extraction: {url}")
        
        start_time = time.time()
        
        try:
            # Fetch HTML content
            html_content = self.ai_extractor.fetch_html(url)
            if not html_content:
                return {
                    "success": False,
                    "message": "Failed to fetch HTML content from URL",
                    "url": url,
                    "image_count": 0
                }
            
            # Extract images using AI
            image_data = self.ai_extractor.extract_images_from_page(collection_name, html_content, url)
            if not image_data:
                return {
                    "success": False,
                    "message": "No images found or extraction failed",
                    "url": url,
                    "image_count": 0
                }
            
            logger.info(f"✅ Found {len(image_data)} images from URL: {url}")
            
            # Save to dedicated images sheet (use row_num = 0 for single URL extractions)
            success = self._save_images_to_sheet(collection_name, 0, url, image_data)
            
            processing_time = time.time() - start_time
            
            if success:
                return {
                    "success": True,
                    "message": f"Successfully extracted {len(image_data)} images",
                    "url": url,
                    "image_count": len(image_data),
                    "processing_time": round(processing_time, 2),
                    "images": image_data
                }
            else:
                return {
                    "success": False,
                    "message": "Failed to save images to sheet",
                    "url": url,
                    "image_count": len(image_data),
                    "processing_time": round(processing_time, 2)
                }
                
        except Exception as e:
            logger.error(f"Error extracting images from single URL {url}: {e}")
            return {
                "success": False,
                "message": f"Error during image extraction: {str(e)}",
                "url": url,
                "image_count": 0,
                "processing_time": round(time.time() - start_time, 2)
            }
    
    # ==========================================
    # EXISTING METHODS (UNCHANGED)
    # ==========================================
    
    def extract_from_urls(self, collection_name: str, selected_rows: Optional[List[int]] = None, 
                         overwrite_mode: bool = True, progress_callback: Optional[Callable] = None) -> Dict[str, Any]:
        """
        Extract data from URLs for a specific collection
        
        Args:
            collection_name: Name of the collection to process
            selected_rows: List of specific rows to process (None = all rows)
            overwrite_mode: Whether to overwrite existing data
            progress_callback: Optional callback function for progress updates
        """
        logger.info(f"Starting AI extraction for {collection_name} collection")
        
        # Get collection configuration
        try:
            config = get_collection_config(collection_name)
        except ValueError as e:
            return {"success": False, "message": str(e)}
        
        # Get URLs to process
        urls = self.sheets_manager.get_urls_from_collection(collection_name)
        if not urls:
            return {"success": False, "message": f"No URLs found in {collection_name} collection"}
        
        # Filter to selected rows if specified
        if selected_rows:
            urls = [(row_num, url) for row_num, url in urls if row_num in selected_rows]
            logger.info(f"Processing {len(urls)} selected rows from {collection_name}")
        
        if not urls:
            return {"success": False, "message": "No URLs match selected rows"}
        
        logger.info(f"AI will extract/update these fields for {collection_name}: {config.ai_extraction_fields}")
        
        # Process URLs
        results = []
        total_urls = len(urls)
        start_time = time.time()
        
        for i, (row_num, url) in enumerate(urls):
            if progress_callback:
                progress_callback(i + 1, total_urls, f"Processing row {row_num}")
            
            result = self._process_single_url(collection_name, row_num, url, overwrite_mode)
            results.append(result)
            
            # Add delay between requests to avoid rate limiting
            if i < total_urls - 1:  # Don't delay after the last request
                time.sleep(self.settings.AI_DELAY_BETWEEN_REQUESTS)
        
        # Calculate summary
        processing_time = time.time() - start_time
        successful = [r for r in results if r.success and not r.skipped]
        failed = [r for r in results if not r.success]
        skipped = [r for r in results if r.skipped]
        
        logger.info(f"{collection_name} extraction complete: {len(successful)} success, {len(failed)} failed, {len(skipped)} skipped in {processing_time:.1f}s")
        
        return {
            "success": True,
            "collection": collection_name,
            "results": [self._result_to_dict(r) for r in results],
            "summary": {
                "total_processed": len(results),
                "successful": len(successful),
                "failed": len(failed),
                "skipped": len(skipped),
                "processing_time": round(processing_time, 2),
                "ai_fields_updated": config.ai_extraction_fields
            }
        }
    
    def _process_single_url(self, collection_name: str, row_num: int, url: str, overwrite_mode: bool) -> ProcessingResult:
        """Process a single URL for AI extraction"""
        start_time = time.time()
        
        try:
            # Check if row needs processing
            if not self.sheets_manager.row_needs_processing(collection_name, row_num, force_overwrite=overwrite_mode):
                return ProcessingResult(
                    row_num=row_num,
                    url=url,
                    success=True,
                    skipped=True,
                    processing_time=time.time() - start_time
                )
            
            # Fetch HTML content
            html_content = self.ai_extractor.fetch_html(url)
            if not html_content:
                return ProcessingResult(
                    row_num=row_num,
                    url=url,
                    success=False,
                    error="Failed to fetch HTML content",
                    processing_time=time.time() - start_time
                )
            
            # AI extraction
            extracted_data = self.ai_extractor.extract_product_data(collection_name, html_content, url)
            if not extracted_data:
                return ProcessingResult(
                    row_num=row_num,
                    url=url,
                    success=False,
                    error="AI extraction failed",
                    processing_time=time.time() - start_time
                )
            
            # Get collection config for allowed fields
            config = get_collection_config(collection_name)
            
            # Update sheet with extracted data (only AI extraction fields)
            success = self.sheets_manager.update_product_row(
                collection_name=collection_name,
                row_num=row_num,
                data=extracted_data,
                overwrite_mode=overwrite_mode,
                allowed_fields=config.ai_extraction_fields
            )
            
            if success:
                # Trigger Google Apps Script data cleaning after successful AI extraction
                logger.info(f"🔄 AI extraction successful, attempting to trigger data cleaning for {collection_name} row {row_num}")
                try:
                    cleaning_triggered = self.sheets_manager.trigger_data_cleaning(collection_name, row_num)
                    if cleaning_triggered:
                        logger.info(f"✅ Successfully triggered data cleaning for {collection_name} row {row_num}")
                    else:
                        logger.warning(f"⚠️ Failed to trigger data cleaning for {collection_name} row {row_num} - webhook returned False")
                except Exception as e:
                    logger.error(f"❌ Error triggering data cleaning for {collection_name} row {row_num}: {e}")
                    import traceback
                    logger.error(f"❌ Full traceback: {traceback.format_exc()}")
                    # Don't fail the whole extraction if cleaning trigger fails

                return ProcessingResult(
                    row_num=row_num,
                    url=url,
                    success=True,
                    extracted_fields=list(extracted_data.keys()),
                    processing_time=time.time() - start_time
                )
            else:
                return ProcessingResult(
                    row_num=row_num,
                    url=url,
                    success=False,
                    error="Failed to update Google Sheet",
                    processing_time=time.time() - start_time
                )
                
        except Exception as e:
            logger.error(f"Error processing row {row_num} ({collection_name}): {e}")
            return ProcessingResult(
                row_num=row_num,
                url=url,
                success=False,
                error=str(e),
                processing_time=time.time() - start_time
            )
    
    def generate_product_content(self, collection_name: str, selected_rows: Optional[List[int]] = None, 
                               use_url_content: bool = False, progress_callback: Optional[Callable] = None,
                               fields_to_generate: Optional[List[str]] = None, max_feature_words: int = 5) -> Dict[str, Any]:
        """
        ENHANCED: Generate multiple AI content fields for products in one go (description, features, care instructions)
        
        Args:
            collection_name: Name of the collection to process
            selected_rows: List of specific rows to process (None = all rows with products)
            use_url_content: Whether to fetch URL content for richer content generation
            progress_callback: Optional callback function for progress updates
            fields_to_generate: List of fields to generate (defaults to ['description', 'care_instructions'])
            max_feature_words: Maximum words per feature (default 5)
        """
        logger.info(f"ENHANCED: Starting multi-field content generation for {collection_name} collection")
        logger.info(f"🔧 Feature word limit: {max_feature_words} words per feature")
        
        # Get collection configuration
        try:
            config = get_collection_config(collection_name)
        except ValueError as e:
            return {"success": False, "message": str(e)}
        
        # Default fields to generate if none specified
        if fields_to_generate is None:
            fields_to_generate = ['description', 'care_instructions']
        
        logger.info(f"REQUESTED FIELDS: {fields_to_generate}")
        
        # ENHANCED: More robust field validation and mapping
        supported_fields = []
        field_mapping = {}
        field_warnings = []
        
        for field in fields_to_generate:
            field_mapped = False
            
            # Handle description fields (multiple aliases)
            if field in ['body_html', 'description', 'desc']:
                description_field = self._find_collection_field(config, ['ai_description_field', 'description_field'])
                if description_field:
                    supported_fields.append('description')  # Normalize to 'description' for AI extractor
                    field_mapping['description'] = description_field
                    logger.info(f"✅ DESCRIPTION: {field} -> {description_field}")
                    field_mapped = True
                else:
                    field_warnings.append(f"Description field not configured for collection {collection_name}")
            
            # Handle care instructions (multiple aliases)
            elif field in ['care_instructions', 'care', 'washing_instructions']:
                care_field = self._find_collection_field(config, ['ai_care_field', 'care_field', 'care_instructions_field'])
                if care_field:
                    supported_fields.append('care_instructions')
                    field_mapping['care_instructions'] = care_field
                    logger.info(f"✅ CARE INSTRUCTIONS: {field} -> {care_field}")
                    field_mapped = True
                else:
                    # FALLBACK: Try to find any field with "care" in the name
                    care_fallback = self._find_care_field_fallback(config)
                    if care_fallback:
                        supported_fields.append('care_instructions')
                        field_mapping['care_instructions'] = care_fallback
                        logger.info(f"✅ CARE INSTRUCTIONS (FALLBACK): {field} -> {care_fallback}")
                        field_mapped = True
                    else:
                        field_warnings.append(f"Care instructions field not configured for collection {collection_name}")
            
            # Handle features
            elif field in ['features', 'product_features']:
                features_field = self._find_collection_field(config, ['ai_features_field', 'features_field'])
                if features_field:
                    supported_fields.append('features')
                    field_mapping['features'] = features_field
                    logger.info(f"✅ FEATURES: {field} -> {features_field}")
                    field_mapped = True
                else:
                    field_warnings.append(f"Features field not configured for collection {collection_name}")
            
            # Unknown field
            else:
                field_warnings.append(f"Unknown field '{field}' requested for {collection_name}")
            
            if not field_mapped:
                logger.warning(f"❌ FIELD MAPPING FAILED: {field}")
        
        # Log all warnings
        for warning in field_warnings:
            logger.warning(warning)
        
        # Check if we have any supported fields
        if not supported_fields:
            error_msg = f"No supported content fields found for {collection_name}. Requested: {fields_to_generate}. Warnings: {field_warnings}"
            logger.error(error_msg)
            return {"success": False, "message": error_msg}
        
        logger.info(f"✅ FINAL SUPPORTED FIELDS: {supported_fields}")
        logger.info(f"✅ FIELD MAPPINGS: {field_mapping}")
        
        # Get products to process
        if selected_rows:
            products_to_process = selected_rows
            logger.info(f"Processing selected rows: {selected_rows}")
        else:
            # Get all products from the collection
            all_products = self.sheets_manager.get_all_products(collection_name)
            products_to_process = list(all_products.keys())
            logger.info(f"Processing all products: {len(products_to_process)} found")
        
        if not products_to_process:
            return {"success": False, "message": f"No products found to process in {collection_name}"}
        
        logger.info(f"Generating content for {len(products_to_process)} products in {collection_name}, use_url: {use_url_content}")
        
        # Process products
        results = []
        total_products = len(products_to_process)
        start_time = time.time()
        
        for i, row_num in enumerate(products_to_process):
            if progress_callback:
                progress_callback(i + 1, total_products, f"Generating content for row {row_num}")
            
            result = self._generate_product_content_single(
                collection_name, row_num, use_url_content, supported_fields, field_mapping, max_feature_words
            )
            results.append(result)
            
            # Add delay between requests to avoid rate limiting
            if i < total_products - 1:  # Don't delay after the last request
                time.sleep(self.settings.AI_DELAY_BETWEEN_REQUESTS)
        
        # Calculate summary
        processing_time = time.time() - start_time
        successful = [r for r in results if r.success]
        failed = [r for r in results if not r.success]
        
        logger.info(f"{collection_name} content generation complete: {len(successful)} success, {len(failed)} failed in {processing_time:.1f}s")
        
        return {
            "success": True,
            "collection": collection_name,
            "results": [self._result_to_dict(r) for r in results],
            "summary": {
                "total_processed": len(results),
                "successful": len(successful),
                "failed": len(failed),
                "processing_time": round(processing_time, 2),
                "fields_generated": supported_fields,
                "sheet_columns_updated": list(field_mapping.values()),
                "field_warnings": field_warnings,
                "max_feature_words": max_feature_words
            }
        }
    
    def _find_collection_field(self, config, field_names: List[str]) -> Optional[str]:
        """
        ENHANCED: Try to find a field in the collection config by checking multiple possible attribute names
        """
        for field_name in field_names:
            if hasattr(config, field_name):
                field_value = getattr(config, field_name)
                if field_value:  # Make sure it's not empty
                    return field_value
        return None
    
    def _find_care_field_fallback(self, config) -> Optional[str]:
        """
        FALLBACK: Try to find any field that might contain care instructions by scanning column mappings
        """
        try:
            # Check if config has column_mapping
            if hasattr(config, 'column_mapping'):
                for field_name, column_name in config.column_mapping.items():
                    if any(keyword in field_name.lower() for keyword in ['care', 'wash', 'clean', 'instruction']):
                        logger.info(f"🔍 FALLBACK: Found potential care field: {field_name} -> {column_name}")
                        return field_name
            
            # Check all attributes for care-related fields
            for attr_name in dir(config):
                if not attr_name.startswith('_'):  # Skip private attributes
                    if any(keyword in attr_name.lower() for keyword in ['care', 'wash', 'clean', 'instruction']):
                        attr_value = getattr(config, attr_name)
                        if isinstance(attr_value, str) and attr_value:
                            logger.info(f"🔍 FALLBACK: Found potential care attribute: {attr_name} -> {attr_value}")
                            return attr_value
        except Exception as e:
            logger.warning(f"Error in care field fallback search: {e}")
        
        return None
    
    def _generate_product_content_single(self, collection_name: str, row_num: int, use_url_content: bool,
                                       fields_to_generate: List[str], field_mapping: Dict[str, str], 
                                       max_feature_words: int = 5) -> ProcessingResult:
        """ENHANCED: Generate multiple content fields for a single product with better error handling and feature validation"""
        start_time = time.time()
        
        try:
            # Get product data
            product_data = self.sheets_manager.get_single_product(collection_name, row_num)
            if not product_data:
                return ProcessingResult(
                    row_num=row_num,
                    url="",
                    success=False,
                    error="Product not found",
                    processing_time=time.time() - start_time
                )
            
            # Get URL if needed
            url = product_data.get('url', '') if use_url_content else None
            logger.info(f"🤖 Generating content for row {row_num}, fields: {fields_to_generate}, URL: {bool(url)}")
            
            # ENHANCED: Generate all content fields using AI extractor with better error handling
            try:
                generated_content = self.ai_extractor.generate_product_content(
                    collection_name=collection_name,
                    product_data=product_data,
                    url=url,
                    use_url_content=use_url_content,
                    fields_to_generate=fields_to_generate
                )
            except Exception as ai_error:
                logger.error(f"AI extractor failed for row {row_num}: {ai_error}")
                return ProcessingResult(
                    row_num=row_num,
                    url=url or "",
                    success=False,
                    error=f"AI generation failed: {str(ai_error)}",
                    processing_time=time.time() - start_time
                )
            
            if not generated_content:
                return ProcessingResult(
                    row_num=row_num,
                    url=url or "",
                    success=False,
                    error="AI extractor returned no content",
                    processing_time=time.time() - start_time
                )
            
            logger.info(f"✅ AI extractor returned content for fields: {list(generated_content.keys())}")
            
            # 🔧 NEW: Validate features length if features were generated
            if 'features' in generated_content and generated_content['features']:
                logger.info(f"🔧 Validating features for max {max_feature_words} words per feature...")
                original_features = generated_content['features']
                validated_features = self._validate_feature_length(original_features, max_feature_words)
                generated_content['features'] = validated_features
                
                if original_features != validated_features:
                    logger.info(f"✂️ Features modified for word limit compliance")
            
            # ENHANCED: Map generated content to sheet columns with better validation
            updates_data = {}
            successful_fields = []
            failed_fields = []
            
            for field_key, sheet_column in field_mapping.items():
                if field_key in generated_content:
                    content = generated_content[field_key]
                    if content and str(content).strip():  # Make sure content is not empty
                        updates_data[sheet_column] = content
                        successful_fields.append(field_key)
                        logger.info(f"✅ MAPPED: {field_key} -> {sheet_column} ({len(str(content))} chars)")
                    else:
                        failed_fields.append(f"{field_key} (empty content)")
                        logger.warning(f"⚠️ EMPTY CONTENT for field: {field_key}")
                else:
                    failed_fields.append(f"{field_key} (not generated)")
                    logger.warning(f"❌ NO CONTENT generated for field: {field_key}")
            
            if not updates_data:
                error_msg = f"No valid content generated for any fields. Failed: {failed_fields}"
                logger.error(error_msg)
                return ProcessingResult(
                    row_num=row_num,
                    url=url or "",
                    success=False,
                    error=error_msg,
                    processing_time=time.time() - start_time
                )
            
            logger.info(f"📝 Updating sheet with {len(updates_data)} fields: {list(updates_data.keys())}")
            
            # ENHANCED: Save all content to sheet at once with better error handling
            try:
                success = self.sheets_manager.update_multiple_fields(
                    collection_name=collection_name,
                    row_num=row_num,
                    field_updates=updates_data
                )
            except Exception as sheet_error:
                logger.error(f"Sheet update failed for row {row_num}: {sheet_error}")
                return ProcessingResult(
                    row_num=row_num,
                    url=url or "",
                    success=False,
                    error=f"Failed to save to sheet: {str(sheet_error)}",
                    processing_time=time.time() - start_time
                )
            
            if success:
                success_msg = f"Successfully saved {len(successful_fields)} fields: {successful_fields}"
                if failed_fields:
                    success_msg += f" (Failed: {failed_fields})"
                logger.info(f"✅ {success_msg}")
                
                return ProcessingResult(
                    row_num=row_num,
                    url=url or "",
                    success=True,
                    extracted_fields=list(updates_data.keys()),
                    processing_time=time.time() - start_time,
                    generated_content=generated_content
                )
            else:
                return ProcessingResult(
                    row_num=row_num,
                    url=url or "",
                    success=False,
                    error="Sheet update returned False",
                    processing_time=time.time() - start_time
                )
                
        except Exception as e:
            logger.error(f"❌ CRITICAL ERROR generating content for row {row_num} ({collection_name}): {e}")
            return ProcessingResult(
                row_num=row_num,
                url="",
                success=False,
                error=f"Critical error: {str(e)}",
                processing_time=time.time() - start_time
            )
    
    def generate_descriptions(self, collection_name: str, selected_rows: Optional[List[int]] = None, 
                            use_url_content: bool = False, progress_callback: Optional[Callable] = None) -> Dict[str, Any]:
        """
        Generate AI descriptions for products in a collection (legacy method - use generate_product_content instead)
        """
        logger.info(f"Using legacy description generation - consider using generate_product_content instead")
        
        # Use the new multi-field method but only generate descriptions
        return self.generate_product_content(
            collection_name=collection_name,
            selected_rows=selected_rows,
            use_url_content=use_url_content,
            progress_callback=progress_callback,
            fields_to_generate=['description']
        )
    
    def validate_collection_data(self, collection_name: str, selected_rows: Optional[List[int]] = None) -> Dict[str, Any]:
        """
        Validate data quality for products in a collection
        
        Args:
            collection_name: Name of the collection to validate
            selected_rows: List of specific rows to validate (None = all rows)
        """
        logger.info(f"Starting data validation for {collection_name} collection")
        
        try:
            config = get_collection_config(collection_name)
        except ValueError as e:
            return {"success": False, "message": str(e)}
        
        # Get products to validate
        if selected_rows:
            products = {}
            for row_num in selected_rows:
                product = self.sheets_manager.get_single_product(collection_name, row_num)
                if product:
                    products[row_num] = product
        else:
            products = self.sheets_manager.get_all_products(collection_name)
        
        if not products:
            return {"success": False, "message": f"No products found to validate in {collection_name}"}
        
        # Validate each product
        validation_results = []
        quality_scores = []
        
        for row_num, product_data in products.items():
            validation_result = validate_product_data(collection_name, product_data)
            validation_result['row_num'] = row_num
            validation_results.append(validation_result)
            quality_scores.append(validation_result['quality_score'])
        
        # Calculate summary statistics
        avg_quality = sum(quality_scores) / len(quality_scores) if quality_scores else 0
        high_quality_count = sum(1 for score in quality_scores if score >= 80)
        medium_quality_count = sum(1 for score in quality_scores if 50 <= score < 80)
        low_quality_count = sum(1 for score in quality_scores if score < 50)
        
        logger.info(f"{collection_name} validation complete: {len(products)} products validated, avg quality: {avg_quality:.1f}%")
        
        return {
            "success": True,
            "collection": collection_name,
            "validation_results": validation_results,
            "summary": {
                "total_validated": len(products),
                "average_quality": round(avg_quality, 1),
                "high_quality_count": high_quality_count,  # 80%+
                "medium_quality_count": medium_quality_count,  # 50-79%
                "low_quality_count": low_quality_count,  # <50%
                "quality_distribution": {
                    "excellent": sum(1 for score in quality_scores if score >= 90),
                    "good": sum(1 for score in quality_scores if 80 <= score < 90),
                    "fair": sum(1 for score in quality_scores if 50 <= score < 80),
                    "poor": sum(1 for score in quality_scores if score < 50)
                }
            }
        }
    
    def get_processing_statistics(self, collection_name: Optional[str] = None) -> Dict[str, Any]:
        """Get processing statistics for a collection or overall"""
        if collection_name:
            stats = self.sheets_manager.get_collection_stats(collection_name)
            stats['collection'] = collection_name
        else:
            # Get overall statistics across all collections
            from config.collections import get_all_collections
            all_configs = get_all_collections()
            
            stats = {
                'total_products': 0,
                'complete_products': 0,
                'missing_info_products': 0,
                'collections': {}
            }
            
            total_quality = 0
            collection_count = 0
            
            for name, config in all_configs.items():
                try:
                    collection_stats = self.sheets_manager.get_collection_stats(name)
                    stats['collections'][name] = collection_stats
                    
                    stats['total_products'] += collection_stats['total_products']
                    stats['complete_products'] += collection_stats['complete_products']
                    stats['missing_info_products'] += collection_stats['missing_info_products']
                    
                    if collection_stats['total_products'] > 0:
                        total_quality += collection_stats['data_quality_percent']
                        collection_count += 1
                        
                except Exception as e:
                    logger.warning(f"Could not get stats for {name}: {e}")
                    stats['collections'][name] = {'error': str(e)}
            
            stats['data_quality_percent'] = int(total_quality / collection_count) if collection_count > 0 else 0
        
        return stats
    
    def _result_to_dict(self, result: ProcessingResult) -> Dict[str, Any]:
        """Convert ProcessingResult to dictionary"""
        result_dict = {
            "row": result.row_num,
            "url": result.url,
            "success": result.success,
            "error": result.error,
            "extracted_fields": result.extracted_fields,
            "skipped": result.skipped,
            "processing_time": round(result.processing_time, 2),
            "quality_score": result.quality_score
        }
        
        # Include generated content if available
        if result.generated_content:
            result_dict["generated_content"] = result.generated_content
        
        # Include image count if available
        if result.image_count is not None:
            result_dict["image_count"] = result.image_count
        
        return result_dict

# Global instance
data_processor = DataProcessor()

def get_data_processor() -> DataProcessor:
    """Get the global data processor instance"""
    return data_processor