"""
Collection-Aware AI Extractor with ChatGPT Integration and Apps Script Trigger
Handles AI extraction and description generation for different product collections
Now includes ChatGPT for features and care instructions, AI-powered image extraction, 
feature validation, and Google Apps Script integration for automated processing
"""
import json
import re
import logging
import time
import asyncio
import aiohttp
from typing import Dict, List, Any, Optional
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

from config.settings import get_settings
from config.collections import get_collection_config, CollectionConfig
from core.google_apps_script_manager import google_apps_script_manager

logger = logging.getLogger(__name__)

class AIExtractor:
    """Collection-aware AI extractor for product data with ChatGPT integration, AI image extraction, and Apps Script integration"""
    
    def __init__(self):
        self.settings = get_settings()
        self.api_key = self.settings.OPENAI_API_KEY

        # Apps Script integration settings
        self.apps_script_url = getattr(self.settings, 'APPS_SCRIPT_WEB_APP_URL', None)
        self.apps_script_enabled = getattr(self.settings, 'ENABLE_APPS_SCRIPT_TRIGGER', True)

        # Rate limiting for ChatGPT
        self.last_chatgpt_request = 0
        self.chatgpt_min_interval = getattr(self.settings, 'CHATGPT_MIN_REQUEST_INTERVAL', 0.1)

        # Collection-specific prompts (your existing ones)
        self.extraction_prompts = {
            'sinks': self._build_sinks_extraction_prompt,
            'taps': self._build_taps_extraction_prompt,
            'lighting': self._build_lighting_extraction_prompt
        }

        # Collection-specific description prompts (your existing ones)
        self.description_prompts = {
            'sinks': self._build_sinks_description_prompt,
            'taps': self._build_taps_description_prompt,
            'lighting': self._build_lighting_description_prompt
        }

        # Collection-specific ChatGPT prompts for features and care
        self.chatgpt_features_prompts = {
            'sinks': self._build_sinks_features_prompt,
            'taps': self._build_taps_features_prompt,
            'lighting': self._build_lighting_features_prompt
        }

        self.chatgpt_care_prompts = {
            'sinks': self._build_sinks_care_prompt,
            'taps': self._build_taps_care_prompt,
            'lighting': self._build_lighting_care_prompt
        }

    async def trigger_google_apps_script_cleaning(self, collection_name: str, row_number: int, operation_type: str) -> bool:
        """
        Trigger Google Apps Script cleaning after AI operation completion

        Args:
            collection_name: The collection being processed
            row_number: The row number that was processed
            operation_type: Type of AI operation completed (description, features, images, etc.)
        """
        try:
            if not self.settings.GOOGLE_SCRIPTS.get('ENABLED') or not self.settings.GOOGLE_SCRIPTS.get('AUTO_TRIGGER'):
                logger.debug(f"🔄 Google Apps Script integration disabled - skipping trigger for {collection_name} row {row_number}")
                return False

            logger.info(f"🚀 Triggering Google Apps Script cleaning for {collection_name} row {row_number} after {operation_type}")

            # Use the Google Apps Script manager for the actual triggering
            result = await google_apps_script_manager.trigger_post_ai_cleaning(
                collection_name=collection_name,
                row_number=row_number,
                operation_type=operation_type
            )

            if result['success']:
                logger.info(f"✅ Google Apps Script triggered successfully for {collection_name} row {row_number}: {result.get('message', 'Success')}")
                return True
            else:
                logger.warning(f"⚠️ Google Apps Script trigger failed for {collection_name} row {row_number}: {result.get('error', 'Unknown error')}")
                return False

        except Exception as e:
            logger.error(f"❌ Error triggering Google Apps Script for {collection_name} row {row_number}: {e}")
            return False
    
    # ==================== APPS SCRIPT INTEGRATION METHODS ====================
    
    def trigger_apps_script_processing(self, success: bool = True, message: str = "AI extraction complete", 
                                     collection_name: str = "", url: str = "", 
                                     extracted_fields_count: int = 0) -> bool:
        """
        Trigger Google Apps Script processing after AI extraction is complete
        
        Args:
            success: Whether the AI extraction was successful
            message: Optional message to send to Apps Script
            collection_name: Name of the product collection processed
            url: URL that was processed
            extracted_fields_count: Number of fields successfully extracted
            
        Returns:
            bool: True if trigger was successful, False otherwise
        """
        if not self.apps_script_enabled:
            logger.debug("Apps Script trigger disabled in settings")
            return True
        
        if not self.apps_script_url:
            logger.warning("No Apps Script URL configured - skipping trigger")
            return False
            
        try:
            payload = {
                "action": "process_data",
                "ai_extraction_complete": success,
                "message": message,
                "collection_name": collection_name,
                "source_url": url,
                "extracted_fields_count": extracted_fields_count,
                "timestamp": time.time(),
                "status": "success" if success else "error"
            }
            
            logger.info(f"🚀 Triggering Apps Script processing: {message}")
            
            response = requests.post(
                self.apps_script_url,
                json=payload,
                timeout=30,
                headers={
                    'Content-Type': 'application/json',
                    'User-Agent': self.settings.API_CONFIG['USER_AGENT']
                }
            )
            
            if response.status_code == 200:
                logger.info("✅ Successfully triggered Apps Script processing")
                try:
                    response_data = response.json()
                    if response_data.get('status') == 'success':
                        logger.info(f"📋 Apps Script response: {response_data.get('message', 'Processing started')}")
                    else:
                        logger.warning(f"⚠️ Apps Script returned: {response_data}")
                except:
                    logger.info("📋 Apps Script processing triggered successfully")
                return True
            else:
                logger.error(f"❌ Apps Script trigger failed: HTTP {response.status_code}")
                logger.error(f"Response: {response.text}")
                return False
                
        except requests.exceptions.Timeout:
            logger.error("❌ Apps Script trigger timed out (30s)")
            return False
        except requests.exceptions.ConnectionError:
            logger.error("❌ Could not connect to Apps Script endpoint")
            return False
        except Exception as e:
            logger.error(f"❌ Error triggering Apps Script: {e}")
            return False
    
    def process_product_with_apps_script_trigger(self, collection_name: str, url: str, 
                                               generate_content: bool = True,
                                               content_fields: List[str] = None) -> Dict[str, Any]:
        """
        Complete product processing pipeline with automatic Apps Script trigger
        
        Args:
            collection_name: Product collection type (sinks, taps, lighting)
            url: Product page URL to process
            generate_content: Whether to generate additional content (description, features, care)
            content_fields: Specific content fields to generate
            
        Returns:
            Dict containing all extracted and generated data
        """
        result = {
            'success': False,
            'extracted_data': {},
            'generated_content': {},
            'images': [],
            'errors': []
        }
        
        try:
            logger.info(f"🔄 Starting complete product processing for {collection_name}: {url}")
            
            # Step 1: Extract basic product data
            html_content = self.fetch_html(url)
            if not html_content:
                error_msg = f"Failed to fetch HTML content from {url}"
                result['errors'].append(error_msg)
                self.trigger_apps_script_processing(
                    success=False, 
                    message=error_msg,
                    collection_name=collection_name,
                    url=url
                )
                return result
            
            # Step 2: AI extraction
            extracted_data = self.extract_product_data(collection_name, html_content, url)
            if extracted_data:
                result['extracted_data'] = extracted_data
                logger.info(f"✅ AI extraction successful: {len(extracted_data)} fields")
            else:
                error_msg = f"AI extraction failed for {url}"
                result['errors'].append(error_msg)
                logger.error(error_msg)
            
            # Step 3: Generate additional content if requested
            if generate_content and extracted_data:
                if not content_fields:
                    content_fields = ['description', 'features', 'care_instructions']
                
                generated_content = self.generate_product_content(
                    collection_name=collection_name,
                    product_data=extracted_data,
                    url=url,
                    use_url_content=True,
                    fields_to_generate=content_fields
                )
                
                if generated_content:
                    result['generated_content'] = generated_content
                    logger.info(f"✅ Content generation successful: {list(generated_content.keys())}")
            
            # Step 4: Extract images if enabled for collection
            config = get_collection_config(collection_name)
            if hasattr(config, 'extract_images') and config.extract_images:
                try:
                    product_context = self._build_product_context_for_images(extracted_data)
                    images = self.extract_product_images_with_ai(html_content, url, product_context)
                    if images:
                        result['images'] = images
                        logger.info(f"✅ Image extraction successful: {len(images)} images")
                except Exception as e:
                    logger.error(f"⚠️ Image extraction failed: {e}")
                    result['errors'].append(f"Image extraction failed: {str(e)}")
            
            # Step 5: Determine overall success
            success = bool(extracted_data)
            result['success'] = success
            
            # Step 6: Trigger Apps Script processing
            if success:
                trigger_message = f"AI processing complete for {collection_name} product"
                if result['generated_content']:
                    trigger_message += f" with {len(result['generated_content'])} content fields"
                if result['images']:
                    trigger_message += f" and {len(result['images'])} images"
            else:
                trigger_message = f"AI processing failed for {collection_name} product"
            
            apps_script_success = self.trigger_apps_script_processing(
                success=success,
                message=trigger_message,
                collection_name=collection_name,
                url=url,
                extracted_fields_count=len(extracted_data) if extracted_data else 0
            )
            
            if not apps_script_success:
                result['errors'].append("Apps Script trigger failed")
            
            return result
            
        except Exception as e:
            error_msg = f"Pipeline error for {url}: {str(e)}"
            logger.error(error_msg)
            result['errors'].append(error_msg)
            
            # Try to trigger Apps Script even on error
            self.trigger_apps_script_processing(
                success=False,
                message=error_msg,
                collection_name=collection_name,
                url=url
            )
            
            return result
    
    def batch_process_products_with_apps_script(self, products: List[Dict[str, str]], 
                                              generate_content: bool = True) -> Dict[str, Any]:
        """
        Process multiple products in batch with single Apps Script trigger at the end
        
        Args:
            products: List of dicts with 'collection_name', 'url', and optionally 'content_fields'
            generate_content: Whether to generate additional content fields
            
        Returns:
            Dict with batch processing results
        """
        batch_result = {
            'total_processed': 0,
            'successful': 0,
            'failed': 0,
            'results': [],
            'errors': []
        }
        
        try:
            logger.info(f"🚀 Starting batch processing of {len(products)} products")
            
            for i, product in enumerate(products, 1):
                collection_name = product.get('collection_name')
                url = product.get('url')
                content_fields = product.get('content_fields')
                
                logger.info(f"📦 Processing {i}/{len(products)}: {collection_name} - {url}")
                
                # Process individual product (without Apps Script trigger)
                result = self._process_single_product_no_trigger(
                    collection_name, url, generate_content, content_fields
                )
                
                batch_result['results'].append({
                    'product_index': i,
                    'collection_name': collection_name,
                    'url': url,
                    'result': result
                })
                
                batch_result['total_processed'] += 1
                if result['success']:
                    batch_result['successful'] += 1
                else:
                    batch_result['failed'] += 1
                    batch_result['errors'].extend(result.get('errors', []))
                
                # Rate limiting between products (OPTIMIZED)
                time.sleep(0.1)
            
            # Single Apps Script trigger for entire batch
            batch_success = batch_result['successful'] > 0
            trigger_message = (f"Batch processing complete: {batch_result['successful']}/{batch_result['total_processed']} "
                             f"products processed successfully")
            
            apps_script_success = self.trigger_apps_script_processing(
                success=batch_success,
                message=trigger_message,
                collection_name="batch",
                url=f"{len(products)} products",
                extracted_fields_count=batch_result['successful']
            )
            
            if not apps_script_success:
                batch_result['errors'].append("Apps Script batch trigger failed")
            
            logger.info(f"✅ Batch processing complete: {batch_result['successful']}/{batch_result['total_processed']} successful")
            return batch_result
            
        except Exception as e:
            error_msg = f"Batch processing error: {str(e)}"
            logger.error(error_msg)
            batch_result['errors'].append(error_msg)
            
            # Try to trigger Apps Script even on error
            self.trigger_apps_script_processing(
                success=False,
                message=error_msg,
                collection_name="batch",
                url=f"{len(products)} products"
            )
            
            return batch_result
    
    def _process_single_product_no_trigger(self, collection_name: str, url: str,
                                         generate_content: bool = True,
                                         content_fields: List[str] = None) -> Dict[str, Any]:
        """Process single product without Apps Script trigger (for batch processing)"""
        result = {
            'success': False,
            'extracted_data': {},
            'generated_content': {},
            'images': [],
            'errors': []
        }
        
        try:
            # Extract basic product data
            html_content = self.fetch_html(url)
            if not html_content:
                result['errors'].append(f"Failed to fetch HTML content from {url}")
                return result
            
            # AI extraction
            extracted_data = self.extract_product_data(collection_name, html_content, url)
            if extracted_data:
                result['extracted_data'] = extracted_data
            else:
                result['errors'].append(f"AI extraction failed for {url}")
                return result
            
            # Generate additional content if requested
            if generate_content:
                if not content_fields:
                    content_fields = ['description', 'features', 'care_instructions']
                
                generated_content = self.generate_product_content(
                    collection_name=collection_name,
                    product_data=extracted_data,
                    url=url,
                    use_url_content=True,
                    fields_to_generate=content_fields
                )
                
                if generated_content:
                    result['generated_content'] = generated_content
            
            # Extract images if enabled
            config = get_collection_config(collection_name)
            if hasattr(config, 'extract_images') and config.extract_images:
                try:
                    product_context = self._build_product_context_for_images(extracted_data)
                    images = self.extract_product_images_with_ai(html_content, url, product_context)
                    if images:
                        result['images'] = images
                except Exception as e:
                    result['errors'].append(f"Image extraction failed: {str(e)}")
            
            result['success'] = True
            return result
            
        except Exception as e:
            result['errors'].append(f"Processing error: {str(e)}")
            return result

    # ==================== FAQ GENERATION METHODS ====================

    def generate_faqs_from_sheets_data(self, collection_name: str, product_row: int = None,
                                     faq_types: List[str] = None, num_faqs_per_type: int = 3) -> Dict[str, Any]:
        """
        Generate FAQs based on Google Sheets product data using ChatGPT

        Args:
            collection_name: Name of the collection (sinks, taps, lighting)
            product_row: Specific product row number (None for general collection FAQs)
            faq_types: List of FAQ types to generate
            num_faqs_per_type: Number of FAQs to generate per type

        Returns:
            Dict containing generated FAQs organized by type
        """
        try:
            if not self.api_key:
                return {'success': False, 'error': 'No OpenAI API key configured'}

            # Default FAQ types if none provided
            if not faq_types:
                faq_types = ['installation', 'maintenance', 'compatibility', 'warranty', 'technical']

            logger.info(f"🔄 Generating FAQs for {collection_name}, product row: {product_row}, types: {faq_types}")

            # Get product data from Google Sheets
            from core.sheets_manager import get_sheets_manager
            sheets_manager = get_sheets_manager()

            product_data = None
            collection_context = self._get_collection_context(collection_name)

            if product_row:
                # Get specific product data
                product_data = sheets_manager.get_single_product(collection_name, product_row)
                if not product_data:
                    return {'success': False, 'error': f'Product not found at row {product_row}'}
                logger.info(f"✅ Retrieved product data for row {product_row}")
            else:
                # Get general collection data for context
                all_products = sheets_manager.get_all_products(collection_name)
                if all_products:
                    # Use first few products as context
                    sample_products = list(all_products.values())[:3]
                    product_data = self._create_collection_summary(sample_products, collection_name)
                    logger.info(f"✅ Created collection summary from {len(sample_products)} sample products")
                else:
                    # Fallback to basic collection info
                    product_data = {'collection': collection_name}
                    logger.warning(f"⚠️ No products found, using basic collection context")

            # Apply rate limiting
            self._apply_chatgpt_rate_limit()

            # Generate FAQs using ChatGPT
            faq_results = {}

            for faq_type in faq_types:
                logger.info(f"🔄 Generating {faq_type} FAQs...")

                # Build specific prompt for this FAQ type
                prompt = self._build_faq_prompt(
                    collection_name=collection_name,
                    product_data=product_data,
                    faq_type=faq_type,
                    num_faqs=num_faqs_per_type,
                    is_specific_product=bool(product_row)
                )

                # Make ChatGPT request
                response = self._make_chatgpt_request(prompt)

                if response:
                    # Parse FAQ response
                    parsed_faqs = self._parse_faq_response(response, faq_type)
                    if parsed_faqs:
                        faq_results[faq_type] = parsed_faqs
                        logger.info(f"✅ Generated {len(parsed_faqs)} {faq_type} FAQs")
                    else:
                        logger.warning(f"⚠️ Failed to parse {faq_type} FAQs")
                else:
                    logger.error(f"❌ No response for {faq_type} FAQs")

                # Rate limiting between requests (OPTIMIZED)
                time.sleep(0.1)

            if faq_results:
                result = {
                    'success': True,
                    'faqs': faq_results,
                    'collection': collection_name,
                    'product_row': product_row,
                    'generated_count': sum(len(faqs) for faqs in faq_results.values()),
                    'types_generated': list(faq_results.keys())
                }

                logger.info(f"✅ FAQ generation complete: {result['generated_count']} FAQs across {len(result['types_generated'])} types")
                return result
            else:
                return {'success': False, 'error': 'No FAQs could be generated'}

        except Exception as e:
            logger.error(f"❌ Error generating FAQs: {e}")
            return {'success': False, 'error': str(e)}

    def _get_collection_context(self, collection_name: str) -> Dict[str, str]:
        """Get contextual information about the collection type"""
        context_map = {
            'sinks': {
                'product_type': 'Kitchen and bathroom sinks',
                'key_features': 'Installation types, materials, bowl configurations, drain systems',
                'common_concerns': 'Installation requirements, maintenance, compatibility with cabinets/countertops',
                'target_users': 'Homeowners, contractors, kitchen designers, bathroom renovators'
            },
            'taps': {
                'product_type': 'Kitchen and bathroom taps and faucets',
                'key_features': 'Flow control, mounting types, finishes, valve systems, handle operations',
                'common_concerns': 'Installation, water pressure, maintenance, finish care, compatibility',
                'target_users': 'Homeowners, plumbers, contractors, interior designers'
            },
            'lighting': {
                'product_type': 'Indoor and outdoor lighting fixtures',
                'key_features': 'Bulb types, dimming, mounting options, energy efficiency, IP ratings',
                'common_concerns': 'Installation, electrical requirements, bulb compatibility, maintenance',
                'target_users': 'Homeowners, electricians, interior designers, lighting designers'
            }
        }
        return context_map.get(collection_name, {
            'product_type': f'{collection_name.title()} products',
            'key_features': 'Various product features and specifications',
            'common_concerns': 'Installation, maintenance, compatibility',
            'target_users': 'Customers and professionals'
        })

    def _create_collection_summary(self, sample_products: List[Dict], collection_name: str) -> Dict[str, Any]:
        """Create a summary of collection characteristics from sample products"""
        summary = {'collection': collection_name}

        # Extract common fields across products
        common_fields = ['brand_name', 'vendor', 'product_material', 'style', 'installation_type',
                        'tap_type', 'material', 'finish', 'light_type', 'bulb_type']

        field_values = {}
        for field in common_fields:
            values = [product.get(field, '') for product in sample_products if product.get(field)]
            if values:
                # Get unique values
                unique_values = list(set(values))
                field_values[field] = unique_values[:5]  # Limit to 5 examples

        summary['common_attributes'] = field_values
        summary['sample_count'] = len(sample_products)

        return summary

    def _build_faq_prompt(self, collection_name: str, product_data: Dict[str, Any],
                         faq_type: str, num_faqs: int = 3, is_specific_product: bool = False) -> str:
        """Build ChatGPT prompt for FAQ generation"""

        collection_context = self._get_collection_context(collection_name)

        # Build product context
        if is_specific_product:
            product_context = self._format_product_data_for_faq(product_data)
            context_description = f"specific {collection_name.rstrip('s')} product"
        else:
            if 'common_attributes' in product_data:
                # Collection summary
                attr_strings = []
                for field, values in product_data['common_attributes'].items():
                    if values:
                        attr_strings.append(f"{field.replace('_', ' ')}: {', '.join(values)}")
                product_context = "Collection attributes:\n" + "\n".join(attr_strings)
            else:
                product_context = f"General {collection_name} collection information"
            context_description = f"{collection_name} collection"

        # Get FAQ type specific instructions
        faq_instructions = self._get_faq_type_instructions(faq_type, collection_name)

        prompt = f"""
Generate {num_faqs} frequently asked questions and detailed answers for a {context_description}.

COLLECTION: {collection_name.upper()}
PRODUCT TYPE: {collection_context['product_type']}
FAQ CATEGORY: {faq_type.upper()}

PRODUCT INFORMATION:
{product_context}

COLLECTION CONTEXT:
- Key Features: {collection_context['key_features']}
- Common Concerns: {collection_context['common_concerns']}
- Target Users: {collection_context['target_users']}

FAQ TYPE INSTRUCTIONS:
{faq_instructions}

REQUIREMENTS:
1. Generate exactly {num_faqs} question-answer pairs
2. Questions should be natural and realistic (what customers actually ask)
3. Answers should be comprehensive, accurate, and helpful
4. Use technical terms appropriately but explain complex concepts
5. Include specific details when possible based on the product information
6. Address both professional and consumer audiences
7. Make answers actionable with specific steps or recommendations

RESPONSE FORMAT:
Return a valid JSON array with this exact structure:
[
  {{
    "question": "Clear, specific question customers would ask",
    "answer": "Comprehensive, helpful answer with specific details and recommendations",
    "category": "{faq_type}",
    "target_audience": "homeowner|professional|both"
  }}
]

Focus on providing genuinely useful information that addresses real customer concerns and questions.
"""

        return prompt

    def _get_faq_type_instructions(self, faq_type: str, collection_name: str) -> str:
        """Get specific instructions for different FAQ types"""

        base_instructions = {
            'installation': {
                'focus': 'Installation procedures, requirements, tools, preparation, professional vs DIY',
                'examples': 'mounting requirements, clearances, electrical/plumbing connections, tool lists'
            },
            'maintenance': {
                'focus': 'Cleaning, care, routine maintenance, troubleshooting minor issues',
                'examples': 'cleaning products, maintenance schedules, what to avoid, signs of wear'
            },
            'compatibility': {
                'focus': 'Compatibility with existing systems, sizing, fitment, standards',
                'examples': 'cabinet sizes, plumbing connections, electrical requirements, mounting compatibility'
            },
            'warranty': {
                'focus': 'Warranty coverage, claims process, what\'s covered/excluded, support options',
                'examples': 'warranty periods, claim procedures, coverage limitations, contact information'
            },
            'technical': {
                'focus': 'Specifications, performance, features, technical capabilities',
                'examples': 'dimensions, flow rates, power consumption, certifications, ratings'
            },
            'troubleshooting': {
                'focus': 'Common problems, diagnostic steps, solutions, when to call professionals',
                'examples': 'common issues, step-by-step diagnostics, repair vs replace decisions'
            }
        }

        # Collection-specific modifications
        collection_specific = {
            'sinks': {
                'installation': 'Include undermount vs topmount considerations, cabinet modifications, plumbing connections',
                'maintenance': 'Focus on stain prevention, proper cleaning for different materials, drain care',
                'compatibility': 'Cabinet sizes, countertop compatibility, faucet hole requirements'
            },
            'taps': {
                'installation': 'Include valve types, water pressure requirements, mounting procedures',
                'maintenance': 'Focus on aerator cleaning, finish care, valve maintenance',
                'compatibility': 'Thread sizes, pressure requirements, mounting hole compatibility'
            },
            'lighting': {
                'installation': 'Include electrical requirements, mounting types, switch compatibility',
                'maintenance': 'Focus on bulb replacement, fixture cleaning, electrical safety',
                'compatibility': 'Bulb types, dimmer compatibility, ceiling/wall mounting options'
            }
        }

        base = base_instructions.get(faq_type, {})
        specific = collection_specific.get(collection_name, {}).get(faq_type, '')

        instruction = f"FOCUS: {base.get('focus', 'General information and guidance')}"
        if base.get('examples'):
            instruction += f"\nINCLUDE: {base['examples']}"
        if specific:
            instruction += f"\nCOLLECTION-SPECIFIC: {specific}"

        return instruction

    def _format_product_data_for_faq(self, product_data: Dict[str, Any]) -> str:
        """Format product data for inclusion in FAQ prompt"""
        formatted_lines = []

        # Priority fields for FAQ context
        priority_fields = [
            'title', 'brand_name', 'vendor', 'sku', 'variant_sku',
            'installation_type', 'product_material', 'style', 'application_location',
            'tap_type', 'material', 'finish', 'mounting_type', 'spout_type',
            'light_type', 'bulb_type', 'wattage', 'color_temperature',
            'bowls_number', 'holes_number', 'has_overflow'
        ]

        # Add priority fields first
        for field in priority_fields:
            if product_data.get(field):
                clean_field = field.replace('_', ' ').title()
                formatted_lines.append(f"{clean_field}: {product_data[field]}")

        # Add other non-empty fields
        for field, value in product_data.items():
            if field not in priority_fields and value and str(value).strip():
                # Skip URL and internal fields
                if field in ['url', 'row_number', 'quality_score']:
                    continue
                clean_field = field.replace('_', ' ').title()
                formatted_lines.append(f"{clean_field}: {value}")

        return "\n".join(formatted_lines) if formatted_lines else "Limited product information available"

    def _parse_faq_response(self, response: str, faq_type: str) -> List[Dict[str, str]]:
        """Parse ChatGPT FAQ response into structured format"""
        try:
            # Try to parse as JSON first
            parsed = json.loads(response)

            if isinstance(parsed, list):
                # Validate and clean FAQ items
                clean_faqs = []
                for item in parsed:
                    if isinstance(item, dict) and 'question' in item and 'answer' in item:
                        clean_faq = {
                            'question': str(item['question']).strip(),
                            'answer': str(item['answer']).strip(),
                            'category': item.get('category', faq_type),
                            'target_audience': item.get('target_audience', 'both')
                        }
                        if clean_faq['question'] and clean_faq['answer']:
                            clean_faqs.append(clean_faq)

                return clean_faqs

        except json.JSONDecodeError:
            logger.warning("FAQ response is not valid JSON, attempting text extraction")
            return self._extract_faqs_from_text(response, faq_type)

        return []

    def _extract_faqs_from_text(self, text: str, faq_type: str) -> List[Dict[str, str]]:
        """Extract FAQs from plain text response as fallback"""
        faqs = []

        # Look for Q: A: patterns
        qa_pattern = r'(?:Q(?:uestion)?[:.]?\s*)(.*?)(?:A(?:nswer)?[:.]?\s*)(.*?)(?=Q(?:uestion)?[:.]?|$)'
        matches = re.findall(qa_pattern, text, re.DOTALL | re.IGNORECASE)

        for question, answer in matches:
            question = question.strip()
            answer = answer.strip()

            if question and answer:
                faqs.append({
                    'question': question,
                    'answer': answer,
                    'category': faq_type,
                    'target_audience': 'both'
                })

        # If no Q/A patterns found, try numbered lists
        if not faqs:
            lines = text.split('\n')
            current_question = None
            current_answer = []

            for line in lines:
                line = line.strip()
                if not line:
                    continue

                # Look for question indicators
                if (line.startswith(('1.', '2.', '3.', '4.', '5.')) or
                    '?' in line and len(line) < 200):

                    # Save previous FAQ if exists
                    if current_question and current_answer:
                        faqs.append({
                            'question': current_question,
                            'answer': ' '.join(current_answer),
                            'category': faq_type,
                            'target_audience': 'both'
                        })

                    # Start new FAQ
                    current_question = line.lstrip('1234567890. ')
                    current_answer = []
                else:
                    # Accumulate answer lines
                    if current_question:
                        current_answer.append(line)

            # Save last FAQ
            if current_question and current_answer:
                faqs.append({
                    'question': current_question,
                    'answer': ' '.join(current_answer),
                    'category': faq_type,
                    'target_audience': 'both'
                })

        return faqs

    # ==================== EXISTING METHODS (UNCHANGED) ====================

    def fetch_html(self, url: str) -> Optional[str]:
        """Fetch HTML content from a URL"""
        headers = {
            'User-Agent': self.settings.API_CONFIG['USER_AGENT'],
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        
        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            logger.debug(f"✅ Successfully fetched HTML from {url} ({len(response.text)} chars)")
            return response.text
            
        except Exception as e:
            logger.error(f"❌ HTML fetch error for {url}: {e}")
            return None
    
    def extract_product_data(self, collection_name: str, html_content: str, url: str) -> Optional[Dict[str, Any]]:
        """Extract product data using AI for a specific collection"""
        if not self.api_key:
            logger.error("❌ No OpenAI API key configured")
            return None
        
        # Get collection-specific prompt
        prompt_builder = self.extraction_prompts.get(collection_name)
        if not prompt_builder:
            logger.error(f"❌ No extraction prompt defined for collection: {collection_name}")
            return None
        
        prompt = prompt_builder(url)
        
        # Truncate HTML content if too long
        max_length = self.settings.API_CONFIG['HTML_MAX_LENGTH']
        if len(html_content) > max_length:
            soup = BeautifulSoup(html_content, 'html.parser')
            # Remove script and style tags
            for script in soup(["script", "style"]):
                script.decompose()
            html_content = str(soup)[:max_length] + "...[truncated]"
        
        try:
            response = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {self.api_key}',
                },
                json={
                    'model': self.settings.API_CONFIG['OPENAI_MODEL'],
                    'messages': [
                        {'role': 'user', 'content': prompt + "\n\nHTML Content:\n" + html_content}
                    ],
                    'max_tokens': self.settings.API_CONFIG['OPENAI_MAX_TOKENS'],
                    'temperature': self.settings.API_CONFIG['OPENAI_TEMPERATURE']
                },
                timeout=self.settings.AI_REQUEST_TIMEOUT
            )
            
            response.raise_for_status()
            result = response.json()
            
            if 'choices' in result and result['choices']:
                text = result['choices'][0]['message']['content'].strip()
                
                try:
                    extracted_data = json.loads(text)
                    # Filter to only include allowed AI extraction fields
                    filtered_data = self._filter_extracted_fields(collection_name, extracted_data)
                    
                    # Add AI-powered image extraction with comma-separated format
                    config = get_collection_config(collection_name)
                    if hasattr(config, 'extract_images') and config.extract_images:
                        logger.info(f"🖼️ Starting AI image extraction for {url}")
                        
                        # Build product context for AI
                        product_context = self._build_product_context_for_images(filtered_data)
                        
                        # Extract images using AI
                        image_urls = self.extract_product_images_with_ai(html_content, url, product_context)
                        
                        if image_urls:
                            # Combine all images into comma-separated string for single column
                            combined_images = ', '.join(image_urls)
                            
                            # Map to single shopify_images field (Column AT)
                            if 'shopify_images' in config.ai_extraction_fields:
                                filtered_data['shopify_images'] = combined_images
                                logger.info(f"✅ AI extracted {len(image_urls)} product images → Column AT")
                            else:
                                logger.warning("shopify_images not in ai_extraction_fields")
                        else:
                            logger.warning(f"⚠️ No product images identified by AI for {url}")
                    
                    logger.info(f"✅ AI extraction successful for {collection_name}: {len(filtered_data)} fields extracted")
                    return filtered_data
                    
                except json.JSONDecodeError:
                    # Try to extract JSON from the response
                    json_match = re.search(r'\{.*\}', text, re.DOTALL)
                    if json_match:
                        try:
                            extracted_data = json.loads(json_match.group())
                            filtered_data = self._filter_extracted_fields(collection_name, extracted_data)
                            logger.info(f"✅ AI extraction successful (recovered JSON) for {collection_name}: {len(filtered_data)} fields")
                            return filtered_data
                        except json.JSONDecodeError:
                            pass
                    
                    logger.error(f"❌ Could not parse JSON from AI response for {collection_name}")
                    logger.debug(f"AI response text: {text[:500]}...")
                    return None
            else:
                logger.error(f"❌ No valid response from OpenAI API for {collection_name}")
                return None
                
        except Exception as e:
            logger.error(f"❌ AI extraction error for {collection_name}: {e}")
            return None
    
    def _build_product_context_for_images(self, extracted_data: Dict[str, Any]) -> str:
        """Build product context string for AI image analysis"""
        context_parts = []
        
        # Key fields that help identify product images
        key_fields = ['title', 'brand_name', 'sku', 'product_material', 'style', 'tap_type', 'light_type']
        
        for field in key_fields:
            if extracted_data.get(field):
                context_parts.append(f"{field}: {extracted_data[field]}")
        
        return " | ".join(context_parts) if context_parts else "Product information"
    
    # ==================== NEW CHATGPT VISION IMAGE EXTRACTION METHODS ====================
    
    def extract_images_from_page(self, collection_name: str, html_content: str, url: str) -> List[Dict[str, Any]]:
        """
        Extract and analyze images from a webpage using ChatGPT Vision API
        
        Args:
            collection_name: Name of the collection (for context)
            html_content: HTML content of the page
            url: Source URL
            
        Returns:
            List of dictionaries containing image analysis data
        """
        try:
            # Take screenshot of the page
            screenshot_base64 = self._take_screenshot_from_html(html_content, url)
            if not screenshot_base64:
                logger.error(f"Failed to take screenshot for image extraction: {url}")
                return []
            
            # Use ChatGPT Vision to analyze images in the screenshot
            prompt = f"""Analyze this webpage screenshot and extract ALL images you can see.

For each image found, provide:
1. Description of what the image shows
2. Estimated image type (product_photo, diagram, logo, banner, thumbnail, etc.)
3. Approximate position on page (top-left, center, bottom-right, etc.)
4. Alt text if visible or readable
5. If it's a product image, describe the product
6. Image quality assessment (high, medium, low)
7. Suggested filename based on content
8. Whether it appears to be the main product image

Return as JSON array:
[
  {{
    "description": "detailed description",
    "type": "product_photo|diagram|logo|banner|thumbnail|other",
    "position": "top-left|top-center|top-right|middle-left|center|middle-right|bottom-left|bottom-center|bottom-right",
    "alt_text": "alt text if visible",
    "product_info": "if product image, describe the product",
    "quality": "high|medium|low",
    "suggested_filename": "descriptive-filename.jpg",
    "is_main_product": true/false,
    "approximate_size": "large|medium|small"
  }}
]

Focus on identifying product images, technical diagrams, and any images that contain important information.
Source URL: {url}
Collection: {collection_name}"""

            response = self._call_chatgpt_vision_api(prompt, screenshot_base64)
            
            if response:
                # Parse JSON from response
                try:
                    json_match = re.search(r'\[[\s\S]*\]', response)
                    if json_match:
                        image_data = json.loads(json_match.group(0))
                        logger.info(f"Successfully extracted {len(image_data)} images from {url}")
                        return image_data
                    else:
                        logger.warning(f"No JSON array found in ChatGPT response for {url}")
                        return []
                        
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse image extraction JSON for {url}: {e}")
                    return []
            
            logger.warning(f"No valid response from ChatGPT for image extraction: {url}")
            return []
            
        except Exception as e:
            logger.error(f"Error extracting images from {url}: {e}")
            return []

    def _take_screenshot_from_html(self, html_content: str, url: str) -> Optional[str]:
        """
        Take a screenshot of HTML content and return as base64
        
        Args:
            html_content: HTML content to render
            url: Source URL for context
            
        Returns:
            Base64 encoded screenshot or None if failed
        """
        try:
            from selenium import webdriver
            from selenium.webdriver.chrome.options import Options
            from selenium.webdriver.chrome.service import Service
            from webdriver_manager.chrome import ChromeDriverManager
            import base64
            import time
            
            # Configure Chrome options for headless operation
            chrome_options = Options()
            chrome_options.add_argument('--headless')
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            chrome_options.add_argument('--disable-gpu')
            chrome_options.add_argument('--window-size=1920,1080')
            chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')
            chrome_options.add_argument('--disable-blink-features=AutomationControlled')
            chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
            chrome_options.add_experimental_option('useAutomationExtension', False)
            
            # Initialize webdriver
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)
            
            try:
                # Navigate to the URL directly (better than loading HTML content)
                driver.get(url)
                
                # Wait for page to load and images to render (OPTIMIZED)
                time.sleep(2)
                
                # Scroll to load lazy images
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight/2);")
                time.sleep(0.5)
                driver.execute_script("window.scrollTo(0, 0);")
                time.sleep(0.5)
                
                # Take screenshot
                screenshot_png = driver.get_screenshot_as_png()
                
                # Convert to base64
                screenshot_base64 = base64.b64encode(screenshot_png).decode('utf-8')
                
                logger.info(f"Successfully captured screenshot for {url}")
                return screenshot_base64
                
            finally:
                driver.quit()
                
        except ImportError as e:
            logger.error(f"Missing required packages for screenshot: {e}")
            logger.error("Install with: pip install selenium webdriver-manager")
            return None
        except Exception as e:
            logger.error(f"Failed to take screenshot for {url}: {e}")
            return None

    def _call_chatgpt_vision_api(self, prompt: str, image_base64: str) -> Optional[str]:
        """
        Call ChatGPT Vision API with text prompt and image
        
        Args:
            prompt: Text prompt for ChatGPT
            image_base64: Base64 encoded image
            
        Returns:
            Response text or None if failed
        """
        try:
            if not self.api_key:
                logger.error("No OpenAI API key configured")
                return None
            
            # Apply rate limiting for image analysis requests
            self._apply_chatgpt_rate_limit()
            
            # Prepare the request payload
            payload = {
                'model': getattr(self.settings, 'OPENAI_VISION_MODEL', 'gpt-4-vision-preview'),
                'messages': [
                    {
                        'role': 'system',
                        'content': 'You are an expert at analyzing webpage screenshots to identify and categorize images. Always respond with valid JSON in the exact format requested.'
                    },
                    {
                        'role': 'user',
                        'content': [
                            {
                                'type': 'text',
                                'text': prompt
                            },
                            {
                                'type': 'image_url',
                                'image_url': {
                                    'url': f'data:image/png;base64,{image_base64}',
                                    'detail': 'high'
                                }
                            }
                        ]
                    }
                ],
                'max_tokens': getattr(self.settings, 'OPENAI_VISION_MAX_TOKENS', 1500),
                'temperature': 0.1  # Low temperature for consistent analysis
            }
            
            # Make the request
            response = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {self.api_key}',
                },
                json=payload,
                timeout=getattr(self.settings, 'OPENAI_VISION_TIMEOUT', 60)
            )
            
            response.raise_for_status()
            result = response.json()
            
            if 'choices' in result and result['choices']:
                content = result['choices'][0]['message']['content'].strip()
                logger.info(f"Successfully analyzed screenshot with ChatGPT Vision")
                return content
            else:
                logger.error("No valid response from ChatGPT Vision API")
                return None
                
        except requests.exceptions.RequestException as e:
            if "rate_limit" in str(e).lower():
                logger.warning("ChatGPT Vision rate limit hit, waiting...")
                time.sleep(5)  # Wait 5 seconds (OPTIMIZED)
                return self._call_chatgpt_vision_api(prompt, image_base64)  # Retry once
            else:
                logger.error(f"ChatGPT Vision API error: {e}")
                return None
        except Exception as e:
            logger.error(f"Unexpected error calling ChatGPT Vision: {e}")
            return None
    
    # ==================== EXISTING AI IMAGE EXTRACTION METHODS ====================
    
    def extract_product_images_with_ai(self, html_content: str, url: str, product_context: str = "") -> List[str]:
        """
        Extract product images using AI analysis to identify the best product photos
        
        Args:
            html_content: Raw HTML content from the product page
            url: Product page URL for absolute URL conversion
            product_context: Product info (title, brand, etc.) to help AI identify relevant images
            
        Returns:
            List of product image URLs ranked by AI confidence
        """
        try:
            # Step 1: Extract all images with context using BeautifulSoup
            image_candidates = self._extract_images_with_context(html_content, url)
            
            if not image_candidates:
                logger.warning(f"No images found on {url}")
                return []
            
            logger.info(f"Found {len(image_candidates)} image candidates on {url}")
            
            # Step 2: Use AI to analyze and rank images
            ai_analysis = self._analyze_images_with_ai(image_candidates, product_context, url)
            
            if not ai_analysis:
                logger.warning(f"AI analysis failed for {url}, falling back to heuristic selection")
                return self._fallback_image_selection(image_candidates)
            
            # Step 3: Extract ranked product image URLs
            product_images = [img['src'] for img in ai_analysis.get('product_images', [])]
            
            logger.info(f"AI identified {len(product_images)} product images from {url}")
            return product_images
            
        except Exception as e:
            logger.error(f"Error in AI image extraction for {url}: {e}")
            return []

    def _extract_images_with_context(self, html_content: str, base_url: str) -> List[Dict[str, Any]]:
        """Extract all images with rich context for AI analysis"""
        soup = BeautifulSoup(html_content, 'html.parser')
        image_candidates = []
        
        # Find all img tags
        img_tags = soup.find_all('img')
        
        for i, img in enumerate(img_tags):
            # Get image source (handle different loading patterns)
            src = (img.get('src') or 
                   img.get('data-src') or 
                   img.get('data-lazy-src') or 
                   img.get('data-original') or
                   img.get('data-zoom-image'))
            
            if not src:
                continue
            
            # Convert to absolute URL
            if src.startswith('//'):
                src = 'https:' + src
            elif src.startswith('/'):
                src = urljoin(base_url, src)
            elif not src.startswith('http'):
                continue
            
            # Skip obviously irrelevant images (tiny, base64, etc.)
            if not self._is_valid_image_url(src):
                continue
            
            # Gather rich context for AI analysis
            context = {
                'src': src,
                'alt_text': img.get('alt', '').strip(),
                'title': img.get('title', '').strip(),
                'css_classes': ' '.join(img.get('class', [])),
                'width': img.get('width'),
                'height': img.get('height'),
                'loading': img.get('loading', ''),
                'position_index': i,
                'parent_context': self._get_parent_context(img),
                'surrounding_text': self._get_surrounding_text(img),
                'url_indicators': self._analyze_url_patterns(src),
                'file_size_indicators': self._get_size_indicators(src)
            }
            
            image_candidates.append(context)
        
        # Also check for CSS background images in likely product containers
        bg_images = self._extract_background_images(soup, base_url)
        image_candidates.extend(bg_images)
        
        return image_candidates

    def _get_parent_context(self, img_tag) -> Dict[str, str]:
        """Analyze parent elements for product image indicators"""
        parent_info = {}
        
        # Check immediate parent
        parent = img_tag.parent
        if parent:
            parent_info['parent_tag'] = parent.name
            parent_info['parent_classes'] = ' '.join(parent.get('class', []))
            parent_info['parent_id'] = parent.get('id', '')
        
        # Look for product-related containers up the tree
        current = img_tag
        for level in range(5):  # Check up to 5 levels up
            current = current.parent
            if not current:
                break
                
            classes = ' '.join(current.get('class', []))
            element_id = current.get('id', '')
            
            # Look for product-related keywords
            product_keywords = ['product', 'gallery', 'image', 'photo', 'main', 'hero', 'detail']
            if any(keyword in (classes + element_id).lower() for keyword in product_keywords):
                parent_info[f'container_level_{level}'] = {
                    'tag': current.name,
                    'classes': classes,
                    'id': element_id
                }
        
        return parent_info

    def _get_surrounding_text(self, img_tag, radius: int = 100) -> str:
        """Extract text around the image for context"""
        try:
            # Get text from siblings and nearby elements
            surrounding_elements = []
            
            # Previous siblings
            for sibling in img_tag.previous_siblings:
                if hasattr(sibling, 'get_text'):
                    text = sibling.get_text(strip=True)
                    if text:
                        surrounding_elements.append(text)
                elif isinstance(sibling, str):
                    text = sibling.strip()
                    if text:
                        surrounding_elements.append(text)
            
            # Next siblings  
            for sibling in img_tag.next_siblings:
                if hasattr(sibling, 'get_text'):
                    text = sibling.get_text(strip=True)
                    if text:
                        surrounding_elements.append(text)
                elif isinstance(sibling, str):
                    text = sibling.strip()
                    if text:
                        surrounding_elements.append(text)
            
            # Parent text content
            if img_tag.parent:
                parent_text = img_tag.parent.get_text(strip=True)
                if parent_text:
                    surrounding_elements.append(parent_text[:200])  # Limit parent text
            
            # Join and limit total length
            surrounding_text = ' '.join(surrounding_elements)
            return surrounding_text[:radius] if len(surrounding_text) > radius else surrounding_text
            
        except Exception:
            return ""

    def _analyze_url_patterns(self, url: str) -> Dict[str, bool]:
        """Analyze URL patterns that indicate product images"""
        url_lower = url.lower()
        
        return {
            'has_product_indicator': any(term in url_lower for term in ['product', 'item', 'goods']),
            'has_size_indicator': any(size in url_lower for size in ['large', 'xl', '1200', '1000', '800', 'full']),
            'is_thumbnail': any(thumb in url_lower for thumb in ['thumb', 'small', '150', '200', 'mini']),
            'has_main_indicator': any(main in url_lower for main in ['main', 'hero', 'primary', 'featured']),
            'has_gallery_indicator': any(gal in url_lower for gal in ['gallery', 'slide', 'zoom']),
            'is_icon': any(icon in url_lower for icon in ['icon', 'logo', 'sprite', 'symbol'])
        }

    def _get_size_indicators(self, url: str) -> Dict[str, Any]:
        """Extract size indicators from URL"""
        # Look for dimension patterns in URL
        dimension_pattern = r'(\d{2,4})[x\-_](\d{2,4})'
        single_size_pattern = r'(\d{3,4})(?:px|w|h)?'
        
        dimensions = re.findall(dimension_pattern, url.lower())
        single_sizes = re.findall(single_size_pattern, url.lower())
        
        return {
            'found_dimensions': dimensions,
            'found_sizes': single_sizes,
            'likely_large': any(int(size) > 600 for size in single_sizes) if single_sizes else False
        }

    def _extract_background_images(self, soup, base_url: str) -> List[Dict[str, Any]]:
        """Extract CSS background images that might be product images"""
        bg_images = []
        
        # Look for inline styles with background images
        elements_with_bg = soup.find_all(attrs={'style': re.compile(r'background.*image')})
        
        for element in elements_with_bg:
            style = element.get('style', '')
            
            # Extract URL from background-image CSS
            url_match = re.search(r'background-image:\s*url\(["\']?([^"\']+)["\']?\)', style)
            if url_match:
                bg_url = url_match.group(1)
                
                # Convert to absolute URL
                if bg_url.startswith('/'):
                    bg_url = urljoin(base_url, bg_url)
                elif not bg_url.startswith('http'):
                    continue
                
                context = {
                    'src': bg_url,
                    'alt_text': '',
                    'title': '',
                    'css_classes': ' '.join(element.get('class', [])),
                    'width': None,
                    'height': None,
                    'loading': '',
                    'position_index': -1,  # Mark as background image
                    'parent_context': {'is_background_image': True},
                    'surrounding_text': element.get_text(strip=True)[:100],
                    'url_indicators': self._analyze_url_patterns(bg_url),
                    'file_size_indicators': self._get_size_indicators(bg_url)
                }
                
                bg_images.append(context)
        
        return bg_images

    def _is_valid_image_url(self, url: str) -> bool:
        """Check if URL is valid for a product image"""
        if not url or len(url) < 10:
            return False
        
        # Skip data URLs, SVGs, and very small images
        if url.startswith('data:'):
            return False
        
        # Skip common non-product patterns
        skip_patterns = [
            'pixel', 'transparent', '1x1', 'spacer', 'blank',
            'sprite', 'icon', 'bullet', 'arrow', 'star'
        ]
        
        url_lower = url.lower()
        return not any(pattern in url_lower for pattern in skip_patterns)

    def _analyze_images_with_ai(self, image_candidates: List[Dict], product_context: str, url: str) -> Optional[Dict]:
        """Use AI to analyze images and identify product photos"""
        try:
            # Limit candidates to avoid token limits (top 20 by heuristics)
            filtered_candidates = self._prefilter_candidates(image_candidates)[:20]
            
            # Build AI prompt
            prompt = self._build_image_analysis_prompt(filtered_candidates, product_context, url)
            
            # Make AI request
            response = self._make_ai_request_for_images(prompt)
            
            if response:
                return self._parse_image_analysis_response(response)
            
            return None
            
        except Exception as e:
            logger.error(f"AI image analysis error: {e}")
            return None

    def _prefilter_candidates(self, candidates: List[Dict]) -> List[Dict]:
        """Pre-filter candidates using heuristics to reduce token usage"""
        scored_candidates = []
        
        for candidate in candidates:
            score = 0
            url = candidate['src'].lower()
            classes = candidate.get('css_classes', '').lower()
            alt_text = candidate.get('alt_text', '').lower()
            
            # Positive indicators
            if any(term in url for term in ['product', 'main', 'hero', 'large']):
                score += 10
            if any(term in classes for term in ['product', 'gallery', 'main', 'hero']):
                score += 8
            if any(term in alt_text for term in ['product', 'main', 'front', 'view']):
                score += 6
            if candidate.get('url_indicators', {}).get('likely_large'):
                score += 5

            # Position-based scoring: prioritize images that appear higher on the page
            position_index = candidate.get('position_index', 999)
            if position_index <= 5:  # First 5 images on page
                score += 12
            elif position_index <= 10:  # Next 5 images
                score += 8
            elif position_index <= 20:  # Next 10 images
                score += 4
            
            # Negative indicators
            if any(term in url for term in ['thumb', 'small', 'icon', 'logo']):
                score -= 10
            if candidate.get('url_indicators', {}).get('is_thumbnail'):
                score -= 8
            if candidate.get('url_indicators', {}).get('is_icon'):
                score -= 15
            
            scored_candidates.append((score, candidate))
        
        # Sort by score and return top candidates
        scored_candidates.sort(key=lambda x: x[0], reverse=True)
        return [candidate for score, candidate in scored_candidates]

    def _build_image_analysis_prompt(self, candidates: List[Dict], product_context: str, url: str) -> str:
        """Build AI prompt for image analysis"""
        
        # Simplify candidates for prompt
        simplified_candidates = []
        for i, candidate in enumerate(candidates):
            simplified = {
                'index': i,
                'src': candidate['src'],
                'alt_text': candidate.get('alt_text', ''),
                'css_classes': candidate.get('css_classes', ''),
                'url_indicators': candidate.get('url_indicators', {}),
                'surrounding_text': candidate.get('surrounding_text', '')[:100],
                'position_index': candidate.get('position_index', 999)  # Position on page (lower = higher up)
            }
            simplified_candidates.append(simplified)
        
        prompt = f"""
TASK: Analyze images from a product webpage and identify the best product photos.

PRODUCT PAGE: {url}
PRODUCT CONTEXT: {product_context}

IMAGES TO ANALYZE:
{json.dumps(simplified_candidates, indent=2)}

INSTRUCTIONS:
1. Identify which images are most likely to be PRIMARY PRODUCT PHOTOS
2. Rank them by confidence (0.0 to 1.0)
3. Consider: alt text, CSS classes, URL patterns, and context
4. Prefer larger, main product images over thumbnails or decorative images
5. **PRIORITIZE images with LOWER position_index values (these appear higher/earlier on the webpage)**
6. Hero/main product images are typically in the first few images on the page
7. Return max 5 best product images

AVOID:
- Icons, logos, or branding images
- Navigation or UI elements  
- Thumbnails or very small images
- Related/recommended products
- Decorative or background images

RESPONSE FORMAT (valid JSON only):
{{
    "product_images": [
        {{
            "index": 0,
            "src": "full_image_url",
            "confidence": 0.95,
            "reason": "Main product photo with product name in alt text"
        }},
        {{
            "index": 3,
            "src": "full_image_url", 
            "confidence": 0.80,
            "reason": "Secondary product angle, positioned in gallery"
        }}
    ]
}}
"""
        
        return prompt

    def _make_ai_request_for_images(self, prompt: str) -> Optional[str]:
        """Make AI request specifically for image analysis"""
        try:
            response = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {self.api_key}',
                },
                json={
                    'model': getattr(self.settings, 'OPENAI_IMAGE_ANALYSIS_MODEL', 'gpt-4'),
                    'messages': [
                        {
                            'role': 'system',
                            'content': 'You are an expert at analyzing webpage content to identify product images. Always respond with valid JSON in the exact format requested.'
                        },
                        {
                            'role': 'user',
                            'content': prompt
                        }
                    ],
                    'max_tokens': getattr(self.settings, 'OPENAI_IMAGE_MAX_TOKENS', 800),
                    'temperature': 0.3  # Lower temperature for more consistent analysis
                },
                timeout=self.settings.AI_REQUEST_TIMEOUT
            )
            
            response.raise_for_status()
            result = response.json()
            
            if 'choices' in result and result['choices']:
                return result['choices'][0]['message']['content'].strip()
                
            return None
            
        except Exception as e:
            logger.error(f"AI image analysis request failed: {e}")
            return None

    def _parse_image_analysis_response(self, response: str) -> Optional[Dict]:
        """Parse AI response for image analysis"""
        try:
            # Try direct JSON parsing
            analysis = json.loads(response)
            
            # Validate response structure
            if 'product_images' in analysis:
                # Filter out any images with confidence below threshold
                min_confidence = 0.5
                filtered_images = [
                    img for img in analysis['product_images'] 
                    if img.get('confidence', 0) >= min_confidence
                ]
                
                analysis['product_images'] = filtered_images
                return analysis
                
            return None
            
        except json.JSONDecodeError:
            logger.warning("Failed to parse AI image analysis response as JSON")
            return None

    def _fallback_image_selection(self, candidates: List[Dict]) -> List[str]:
        """Fallback heuristic selection if AI analysis fails"""
        # Simple heuristic ranking
        scored_images = []
        
        for candidate in candidates:
            score = 0
            url = candidate['src'].lower()
            alt_text = candidate.get('alt_text', '').lower()
            classes = candidate.get('css_classes', '').lower()
            
            # Positive scoring
            if 'product' in url or 'product' in alt_text or 'product' in classes:
                score += 20
            if any(term in url for term in ['main', 'hero', 'large', 'xl']):
                score += 15
            if any(term in alt_text for term in ['main', 'front', 'view']):
                score += 10
            
            # Negative scoring
            if any(term in url for term in ['thumb', 'small', 'icon', 'logo']):
                score -= 20
            if candidate.get('position_index', 999) < 3:  # Very early in page might be logo
                score -= 5
            
            scored_images.append((score, candidate['src']))
        
        # Sort by score and return top 3
        scored_images.sort(key=lambda x: x[0], reverse=True)
        return [src for score, src in scored_images[:3] if score > 0]
    
    # ==================== FEATURE VALIDATION METHODS ====================
    
    def _validate_feature_length(self, features_text: str, max_words: int = 10) -> str:
        """
        Validate and truncate features to ensure each feature is max_words or less
        
        Args:
            features_text: Raw features text from AI (usually bullet points)
            max_words: Maximum words per feature (default 10)
            
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

    def _validate_feature_count(self, features_text: str, target_count: int = 5) -> str:
        """
        Validate and adjust feature count to ensure exactly target_count features

        Args:
            features_text: Raw features text from AI (usually bullet points)
            target_count: Target number of features (default 5)

        Returns:
            Features text with exactly target_count features
        """
        if not features_text or not features_text.strip():
            return features_text

        # Split into lines and extract actual features
        lines = features_text.strip().split('\n')
        features = []

        for line in lines:
            line = line.strip()
            if line and not line.startswith(('#', '**', '---')):  # Skip headers and separators
                # Ensure it has bullet point format
                if not line.startswith(('•', '-', '*', '+')):
                    features.append(f"• {line}")
                else:
                    features.append(line)

        feature_count = len(features)

        if feature_count == target_count:
            logger.info(f"✅ Feature count validation: Perfect! Found exactly {target_count} features")
            return '\n'.join(features)
        elif feature_count > target_count:
            # Too many features - keep the first target_count
            logger.info(f"✂️ Feature count validation: Trimming {feature_count} features to {target_count}")
            return '\n'.join(features[:target_count])
        else:
            # Too few features - pad with generic features
            logger.info(f"➕ Feature count validation: Padding {feature_count} features to {target_count}")

            # Create generic features to pad to target count
            generic_features = [
                "• High quality construction and materials",
                "• Easy installation and maintenance",
                "• Stylish design complements modern decor",
                "• Durable finish resists wear and corrosion",
                "• Professional grade performance and reliability"
            ]

            # Add generic features until we reach target count
            while len(features) < target_count and generic_features:
                features.append(generic_features.pop(0))

            return '\n'.join(features)

    # ==================== EXISTING METHODS (UNCHANGED) ====================
    
    def _filter_extracted_fields(self, collection_name: str, extracted_data: Dict[str, Any]) -> Dict[str, Any]:
        """Filter extracted data to only include allowed AI extraction fields"""
        config = get_collection_config(collection_name)
        filtered_data = {}
        
        for field, value in extracted_data.items():
            if field in config.ai_extraction_fields:
                filtered_data[field] = value
            else:
                logger.debug(f"🚫 Filtered out {field} (not in AI extraction fields for {collection_name})")
        
        return filtered_data
    
    def generate_description(self, collection_name: str, product_data: Dict[str, Any], 
                           url: Optional[str] = None, use_url_content: bool = False) -> Optional[str]:
        """Generate product description using AI for a specific collection"""
        if not self.api_key:
            logger.error("❌ No OpenAI API key configured")
            return None
        
        # Get collection-specific description prompt
        prompt_builder = self.description_prompts.get(collection_name)
        if not prompt_builder:
            logger.error(f"❌ No description prompt defined for collection: {collection_name}")
            return None
        
        try:
            # Build description prompt based on product data
            prompt = prompt_builder(product_data)
            
            # Optionally add URL content for richer context
            additional_context = ""
            if use_url_content and url:
                logger.debug(f"🌐 Fetching URL content for richer description context: {url}")
                html_content = self.fetch_html(url)
                if html_content:
                    # Extract key product info from HTML
                    soup = BeautifulSoup(html_content, 'html.parser')
                    # Remove scripts and styles
                    for script in soup(["script", "style"]):
                        script.decompose()
                    
                    # Get relevant text content (first 2000 chars)
                    text_content = soup.get_text()[:600]
                    additional_context = f"\n\nAdditional context from product page:\n{text_content}"
            
            # Make API call
            response = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {self.api_key}',
                },
                json={
                    'model': self.settings.API_CONFIG['OPENAI_DESCRIPTION_MODEL'],
                    'messages': [
                        {
                            'role': 'user',
                            'content': prompt + additional_context
                        }
                    ],
                    'max_tokens': self.settings.API_CONFIG['OPENAI_DESCRIPTION_MAX_TOKENS'],
                    'temperature': self.settings.API_CONFIG['OPENAI_DESCRIPTION_TEMPERATURE']
                },
                timeout=self.settings.AI_REQUEST_TIMEOUT
            )
            
            response.raise_for_status()
            result = response.json()
            
            if 'choices' in result and result['choices']:
                description = result['choices'][0]['message']['content'].strip()
                
                # Clean up the description
                description = self._clean_description(description)
                
                logger.info(f"✅ Generated description for {collection_name}: {description[:100]}...")
                return description
            else:
                logger.error(f"❌ No description generated from API response for {collection_name}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Description generation error for {collection_name}: {e}")
            return None
    
    def generate_product_content(self, collection_name: str, product_data: Dict[str, Any], 
                               url: Optional[str] = None, use_url_content: bool = False,
                               fields_to_generate: List[str] = None, max_feature_words: int = 10) -> Dict[str, str]:
        """
        Generate multiple content fields using ChatGPT for features and care instructions
        
        Args:
            collection_name: Name of the collection (sinks, taps, lighting)
            product_data: Existing product data
            url: Product URL (optional)
            use_url_content: Whether to fetch URL content for richer generation
            fields_to_generate: List of fields to generate ['description', 'features', 'care_instructions']
            max_feature_words: Maximum words per feature (default 10)
        
        Returns:
            Dict with generated content for each field
        """
        if not fields_to_generate:
            fields_to_generate = ['description', 'features', 'care_instructions']
        
        try:
            # Separate fields by AI provider
            chatgpt_fields = []
            other_fields = []
            
            for field in fields_to_generate:
                if field in ['features', 'care_instructions']:
                    chatgpt_fields.append(field)
                else:
                    other_fields.append(field)
            
            results = {}
            
            # Generate ChatGPT fields if any
            if chatgpt_fields:
                chatgpt_results = self._generate_with_chatgpt(
                    collection_name, product_data, url, use_url_content, chatgpt_fields, max_feature_words
                )
                results.update(chatgpt_results)
            
            # Generate other fields with your existing AI (for descriptions)
            if other_fields:
                other_results = self._generate_with_existing_ai(
                    collection_name, product_data, url, use_url_content, other_fields
                )
                results.update(other_results)
            
            return results
            
        except Exception as e:
            logger.error(f"Error in generate_product_content: {e}")
            return {}
    
    def _generate_with_chatgpt(self, collection_name: str, product_data: Dict[str, Any],
                             url: Optional[str], use_url_content: bool, 
                             fields_to_generate: List[str], max_feature_words: int = 10) -> Dict[str, str]:
        """Generate content using ChatGPT for features and care instructions"""
        
        try:
            # Apply rate limiting
            self._apply_chatgpt_rate_limit()
            
            # Prepare context
            context = self._prepare_product_context(product_data, url, use_url_content)
            
            # Build ChatGPT prompt
            prompt = self._build_chatgpt_prompt(collection_name, context, fields_to_generate)
            
            # Make ChatGPT request
            response = self._make_chatgpt_request(prompt)
            
            if not response:
                logger.error("No response from ChatGPT")
                return {}
            
            # Parse the response
            parsed_results = self._parse_chatgpt_response(response, fields_to_generate)
            
            # Apply feature validation if features were generated
            if 'features' in parsed_results and parsed_results['features']:
                logger.info(f"🔧 Validating features for exactly 5 features with max {max_feature_words} words per feature...")
                original_features = parsed_results['features']

                # First validate feature count and ensure exactly 5 features
                count_validated_features = self._validate_feature_count(original_features, target_count=5)

                # Then validate word length
                validated_features = self._validate_feature_length(count_validated_features, max_feature_words)

                parsed_results['features'] = validated_features

                if original_features != validated_features:
                    logger.info(f"✂️ Features modified for count and word limit compliance")
            
            return parsed_results
            
        except Exception as e:
            logger.error(f"Error generating with ChatGPT: {e}")
            return {}
    
    def _make_chatgpt_request(self, prompt: str) -> Optional[str]:
        """Make a request to ChatGPT API using your existing request structure"""
        try:
            chatgpt_model = getattr(self.settings, 'CHATGPT_MODEL', 'gpt-4o-mini')
            
            response = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {self.api_key}',
                },
                json={
                    'model': chatgpt_model,
                    'messages': [
                        {
                            "role": "system", 
                            "content": "You are an expert product content writer specializing in creating compelling product features and detailed care instructions for sinks, taps, and lighting fixtures. Always respond in the exact JSON format requested. For features, keep each feature to 5 words or less while maintaining clarity and impact."
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    'max_tokens': getattr(self.settings, 'CHATGPT_MAX_TOKENS', 1000),
                    'temperature': getattr(self.settings, 'CHATGPT_TEMPERATURE', 0.7)
                },
                timeout=self.settings.AI_REQUEST_TIMEOUT
            )
            
            response.raise_for_status()
            result = response.json()
            
            if 'choices' in result and result['choices']:
                content = result['choices'][0]['message']['content'].strip()
                logger.debug(f"ChatGPT response: {content[:200]}...")
                return content
            else:
                logger.error("Empty response from ChatGPT")
                return None
                
        except requests.exceptions.RequestException as e:
            if "rate_limit" in str(e).lower():
                logger.warning("ChatGPT rate limit hit, waiting...")
                time.sleep(5)  # Wait 5 seconds (OPTIMIZED)
                return self._make_chatgpt_request(prompt)  # Retry once
            else:
                logger.error(f"ChatGPT API error: {e}")
                return None
            
        except Exception as e:
            logger.error(f"Unexpected error calling ChatGPT: {e}")
            return None
    
    def _build_chatgpt_prompt(self, collection_name: str, context: str, 
                            fields_to_generate: List[str]) -> str:
        """Build optimized prompt for ChatGPT based on collection type"""
        
        # Get collection-specific guidance
        collection_guidance = self._get_chatgpt_collection_guidance(collection_name)
        
        # Build field instructions
        field_instructions = []
        
        if 'features' in fields_to_generate:
            features_prompt = self.chatgpt_features_prompts.get(collection_name)
            if features_prompt:
                field_instructions.append(f'"features": {features_prompt(context)}')
            else:
                field_instructions.append('"features": "Generate exactly 5 key product features as bullet points (• Feature description) - keep each feature to 10 words maximum for clarity and impact"')
        
        if 'care_instructions' in fields_to_generate:
            care_prompt = self.chatgpt_care_prompts.get(collection_name)
            if care_prompt:
                field_instructions.append(f'"care_instructions": {care_prompt(context)}')
            else:
                field_instructions.append('"care_instructions": "Provide specific care and maintenance instructions"')
        
        prompt = f"""
PRODUCT INFORMATION:
{context}

COLLECTION TYPE: {collection_name.upper()}
{collection_guidance}

GENERATE THE FOLLOWING:
{chr(10).join(field_instructions)}

RESPONSE FORMAT:
Return a valid JSON object with only the requested fields:
{{
{', '.join([f'    "{field}": "..."' for field in fields_to_generate])}
}}

REQUIREMENTS:
- Use professional, technical language appropriate for {collection_name} products
- Be specific and detailed, not generic
- Focus on benefits and practical information
- Ensure accuracy based on the product information provided
- For features: Keep each feature to 5 words maximum while maintaining clarity
- Make care instructions actionable and clear
"""
        
        return prompt
    
    def _get_chatgpt_collection_guidance(self, collection_name: str) -> str:
        """Get collection-specific guidance for ChatGPT"""
        
        guidance_map = {
            'sinks': """
FOCUS: Kitchen and bathroom sinks
- Emphasize material quality, durability, and installation benefits
- Include capacity, bowl configuration, and drain features
- Care instructions should cover cleaning, stain prevention, and maintenance
- Mention compatibility with different kitchen/bathroom styles""",
            
            'taps': """
FOCUS: Kitchen and bathroom taps/faucets  
- Highlight flow control, operation smoothness, and finish quality
- Include mounting type, handle operation, and water efficiency
- Care instructions must cover finish maintenance, valve care, and cleaning
- Mention installation requirements and compatibility""",
            
            'lighting': """
FOCUS: Lighting fixtures
- Focus on illumination quality, energy efficiency, and installation benefits
- Include bulb compatibility, dimming capabilities, and mounting options
- Care instructions should cover cleaning, bulb replacement, and electrical safety
- Mention room suitability and ambiance creation"""
        }
        
        return guidance_map.get(collection_name.lower(), f"""
FOCUS: {collection_name.title()}
- Focus on quality, functionality, and value proposition
- Include relevant technical specifications
- Provide appropriate care and maintenance guidance
- Consider typical use cases for this product category""")
    
    def _prepare_product_context(self, product_data: Dict[str, Any], 
                               url: Optional[str], use_url_content: bool) -> str:
        """Prepare product context for ChatGPT processing"""
        
        context_parts = []
        
        # Core product info
        essential_fields = ['title', 'sku', 'brand_name', 'vendor']
        for field in essential_fields:
            if product_data.get(field):
                context_parts.append(f"{field.replace('_', ' ').title()}: {product_data[field]}")
        
        # Add existing features first (high priority for feature generation)
        if product_data.get('features'):
            features_content = product_data['features']
            # Clean up the features formatting more thoroughly
            cleaned_features = features_content.replace("• ['• ", "• ").replace("',", "").replace("'", "").replace("[", "").replace("]", "").strip()
            # Remove any malformed bullet points and normalize
            cleaned_features = '\n'.join([line.strip() for line in cleaned_features.split('\n') if line.strip()])
            context_parts.append(f"Existing Features (to be reformatted): {cleaned_features}")

        # Collection-specific details
        detail_fields = [
            'installation_type', 'product_material', 'grade_of_material', 'style',
            'warranty_years', 'bowls_number', 'tap_holes_number', 'has_overflow',
            'length_mm', 'overall_width_mm', 'overall_depth_mm', 'bowl_depth_mm',
            'tap_type', 'material', 'finish', 'mounting_type', 'spout_type',
            'light_type', 'bulb_type', 'wattage', 'color_temperature'
        ]

        for field in detail_fields:
            if product_data.get(field):
                context_parts.append(f"{field.replace('_', ' ').title()}: {product_data[field]}")
        
        # Add any other relevant fields (excluding features which we already added)
        excluded_fields = essential_fields + detail_fields + ['url', 'features']
        for key, value in product_data.items():
            if key not in excluded_fields and value:
                clean_key = key.replace('_', ' ').title()
                context_parts.append(f"{clean_key}: {value}")
        
        # Add URL content if requested
        if use_url_content and url:
            url_content = self._fetch_url_content_for_chatgpt(url)
            if url_content:
                context_parts.append(f"Additional Details from Website: {url_content[:800]}...")
        
        return "\n".join(context_parts)
    
    def _fetch_url_content_for_chatgpt(self, url: str) -> Optional[str]:
        """Fetch and extract relevant content from URL for ChatGPT context"""
        try:
            html_content = self.fetch_html(url)
            if not html_content:
                return None
            
            soup = BeautifulSoup(html_content, 'html.parser')
            # Remove scripts and styles
            for script in soup(["script", "style"]):
                script.decompose()
            
            # Get clean text content
            text_content = soup.get_text()
            # Clean up whitespace
            text_content = re.sub(r'\s+', ' ', text_content).strip()
            
            return text_content
            
        except Exception as e:
            logger.error(f"Error fetching URL content for ChatGPT: {e}")
            return None
    
    def _parse_chatgpt_response(self, response: str, fields_to_generate: List[str]) -> Dict[str, str]:
        """Parse ChatGPT JSON response"""
        try:
            # Try to parse as JSON first
            parsed = json.loads(response)
            
            result = {}
            for field in fields_to_generate:
                if field in parsed and parsed[field]:
                    content = str(parsed[field]).strip()
                    if content and content != "...":
                        result[field] = content
            
            return result
            
        except json.JSONDecodeError:
            logger.warning("ChatGPT response is not valid JSON, attempting text extraction")
            return self._extract_content_from_text(response, fields_to_generate)
    
    def _extract_content_from_text(self, text: str, fields_to_generate: List[str]) -> Dict[str, str]:
        """Extract content from plain text response as fallback"""
        result = {}
        
        # Look for field patterns in the text
        for field in fields_to_generate:
            patterns = [
                f'"{field}":', f'{field}:', field.upper() + ':', 
                field.replace('_', ' ').title() + ':'
            ]
            
            for pattern in patterns:
                if pattern in text:
                    # Find content after the pattern
                    start_idx = text.find(pattern) + len(pattern)
                    
                    # Find end (next field or end of text)
                    end_idx = len(text)
                    for other_field in fields_to_generate:
                        if other_field != field:
                            for other_pattern in [f'"{other_field}":', f'{other_field}:']:
                                other_idx = text.find(other_pattern, start_idx)
                                if other_idx != -1:
                                    end_idx = min(end_idx, other_idx)
                    
                    # Extract and clean content
                    content = text[start_idx:end_idx].strip()
                    content = content.strip('",\n\r')
                    
                    if content:
                        result[field] = content
                    break
        
        return result
    
    def _generate_with_existing_ai(self, collection_name: str, product_data: Dict[str, Any],
                                 url: Optional[str], use_url_content: bool, 
                                 fields_to_generate: List[str]) -> Dict[str, str]:
        """Generate content using your existing AI for other fields (like description)"""
        results = {}
        
        for field in fields_to_generate:
            if field == 'description':
                # Use your existing description generation method
                description = self.generate_description(
                    collection_name=collection_name,
                    product_data=product_data,
                    url=url,
                    use_url_content=use_url_content
                )
                if description:
                    results[field] = description
        
        return results
    
    def _apply_chatgpt_rate_limit(self):
        """Apply rate limiting between ChatGPT requests"""
        current_time = time.time()
        time_since_last = current_time - self.last_chatgpt_request
        
        if time_since_last < self.chatgpt_min_interval:
            sleep_time = self.chatgpt_min_interval - time_since_last
            time.sleep(sleep_time)
        
        self.last_chatgpt_request = time.time()
    
    def _clean_description(self, description: str) -> str:
        """Clean and format the generated description"""
        # Remove quotes if the AI wrapped the description
        description = description.strip('"').strip("'")
        
        # Remove any unwanted prefixes
        prefixes_to_remove = [
            "Description:", "Product Description:", "Here's the description:",
            "Here is the description:", "Product summary:", "Product:"
        ]
        
        for prefix in prefixes_to_remove:
            if description.lower().startswith(prefix.lower()):
                description = description[len(prefix):].strip()
        
        # Ensure proper capitalization
        if description and not description[0].isupper():
            description = description[0].upper() + description[1:]
        
        # Limit length (approximately 70 words)
        words = description.split()
        if len(words) > 70:
            description = ' '.join(words[:70]) + '...'
        
        return description
    
    # ==================== COLLECTION-SPECIFIC PROMPT BUILDERS ====================
    
    # Collection-specific ChatGPT prompt builders for features (UPDATED to generate exactly 5 features with 10-word limit)
    def _build_sinks_features_prompt(self, context: str) -> str:
        """Build features prompt for sinks collection using existing features and tech specs"""
        return '''Transform the existing features into exactly 5 technical bullet points using the specifications provided.

TASK: Clean up and enhance the existing features with technical details from the product specifications.

OUTPUT FORMAT: Exactly 5 lines, each starting with • followed by 5-8 words
NO JSON arrays, NO quotes, NO brackets - just clean bullet points

EXAMPLE:
• Marine Grade 316 stainless steel construction
• Double bowl with 855mm overall length
• Top mount and undermount compatible
• 25-year manufacturer warranty included
• Professional 210mm depth capacity

Transform the existing features above using the technical specifications. Keep each feature concise and technical.'''
    
    def _build_taps_features_prompt(self, context: str) -> str:
        """Build features prompt for taps collection"""
        return '''List exactly 5 key features (max 8 words each):
- Water flow control and efficiency features
- Handle operation and mounting advantages
- Finish quality and durability benefits
- Spout functionality and reach capabilities
- Valve technology and reliability features
Format as clean bullet points (• Feature description)
IMPORTANT: Generate exactly 5 features, keep each feature to 10 words maximum for clarity and impact'''
    
    def _build_lighting_features_prompt(self, context: str) -> str:
        """Build features prompt for lighting collection"""
        return '''List exactly 5 key features (max 8 words each):
- Illumination quality and light distribution
- Energy efficiency and bulb compatibility
- Dimming capabilities and control options
- Installation type and mounting benefits
- Material quality and finish durability
Format as clean bullet points (• Feature description)
IMPORTANT: Generate exactly 5 features, keep each feature to 10 words maximum for clarity and impact'''
    
    # Collection-specific ChatGPT prompt builders for care instructions (unchanged)
    def _build_sinks_care_prompt(self, context: str) -> str:
        """Build care instructions prompt for sinks collection"""
        return '''Provide specific care and maintenance instructions including:
- Daily cleaning methods and recommended products
- Stain prevention and removal techniques specific to the material
- Proper maintenance of drains and overflow systems
- What to avoid to prevent damage (chemicals, abrasives, etc.)
- Periodic deep cleaning and maintenance schedules
Write in clear, actionable steps'''
    
    def _build_taps_care_prompt(self, context: str) -> str:
        """Build care instructions prompt for taps collection"""
        return '''Provide specific care and maintenance instructions including:
- Daily cleaning methods to maintain finish quality
- Aerator cleaning and maintenance procedures
- Valve and handle maintenance requirements
- What cleaning products to use and avoid
- Seasonal maintenance tasks and troubleshooting
Write in clear, actionable steps'''
    
    def _build_lighting_care_prompt(self, context: str) -> str:
        """Build care instructions prompt for lighting collection"""
        return '''Provide specific care and maintenance instructions including:
- Safe cleaning methods for different materials and finishes
- Bulb replacement procedures and compatibility guidelines
- Electrical safety precautions during maintenance
- Fixture cleaning schedules and techniques
- Environmental considerations and protection methods
Write in clear, actionable steps'''
    
    # Collection-specific extraction prompts (unchanged)
    def _build_sinks_extraction_prompt(self, url: str) -> str:
        """Build extraction prompt for sinks collection"""
        config = get_collection_config('sinks')
        fields_json = {field: "string, number, boolean, or null" for field in config.ai_extraction_fields}
        
        return f"""Please analyze this webpage HTML content and extract product specifications for a kitchen or bathroom sink product.

URL: {url}

Extract information and return as JSON. ONLY extract these specific fields:

{json.dumps(fields_json, indent=2)}

Field guidelines:
- sku: Product SKU or model number
- title: Product name/title
- brand_name: Manufacturer or brand name
- installation_type: Topmount, Undermount, Flushmount, Wallmount, Apron Front, etc.
- product_material: Stainless Steel, Granite, Ceramic, Fireclay, etc.
- grade_of_material: 304 Stainless Steel, 316 Marine Grade, etc.
- style: Modern, Traditional, Farmhouse, etc.
- is_undermount_sink: boolean - true if undermount installation
- is_islet_sink: boolean - true if topmount/drop-in installation
- has_overflow: boolean - true if has overflow drain
- holes_number: number of faucet holes (0-5)
- bowls_number: number of sink bowls (1-4)
- range: product line or series name
- application_location: Kitchen, Bathroom, Laundry, etc.
- drain_position: Center, Left, Right, Rear, Front

IMPORTANT: Do NOT extract warranty information, dimensions, or pricing. Only extract the fields listed above.

Return ONLY the JSON object."""

    def _build_taps_extraction_prompt(self, url: str) -> str:
        """Build extraction prompt for taps collection"""
        config = get_collection_config('taps')
        fields_json = {field: "string, number, boolean, or null" for field in config.ai_extraction_fields}
        
        return f"""Please analyze this webpage HTML content and extract product specifications for a kitchen or bathroom tap/faucet product.

URL: {url}

Extract information and return as JSON. ONLY extract these specific fields:

{json.dumps(fields_json, indent=2)}

Field guidelines:
- sku: Product SKU or model number
- title: Product name/title
- brand_name: Manufacturer or brand name
- tap_type: Kitchen Mixer, Basin Mixer, Bath Mixer, Shower Mixer, etc.
- material: Stainless Steel, Brass, Chrome, Ceramic, etc.
- finish: Chrome, Brushed Nickel, Matte Black, Brushed Gold, etc.
- mounting_type: Deck Mount, Wall Mount, etc.
- spout_type: Fixed, Swivel, Pull-out, Pull-down, etc.
- handle_type: Single Handle, Double Handle, etc.
- water_flow_rate: Flow rate in L/min
- aerator_type: Standard, Water-saving, etc.
- valve_type: Ceramic, Ball, Cartridge, etc.

Return ONLY the JSON object."""

    def _build_lighting_extraction_prompt(self, url: str) -> str:
        """Build extraction prompt for lighting collection"""
        config = get_collection_config('lighting')
        fields_json = {field: "string, number, boolean, or null" for field in config.ai_extraction_fields}
        
        return f"""Please analyze this webpage HTML content and extract product specifications for a lighting fixture product.

URL: {url}

Extract information and return as JSON. ONLY extract these specific fields:

{json.dumps(fields_json, indent=2)}

Field guidelines:
- sku: Product SKU or model number
- title: Product name/title
- brand_name: Manufacturer or brand name
- light_type: Pendant, Chandelier, Ceiling Mount, Wall Sconce, etc.
- bulb_type: LED, Halogen, Incandescent, Fluorescent
- wattage: Power consumption in watts
- color_temperature: Color temperature in Kelvin (e.g., 3000K, 4000K)
- dimming_compatible: boolean - true if dimmable
- ip_rating: IP rating for water/dust protection (e.g., IP44, IP65)
- material: Metal, Glass, Fabric, Wood, etc.
- finish: Chrome, Brushed Nickel, Black, White, etc.
- mounting_type: Ceiling, Wall, Pendant, Recessed, etc.

Return ONLY the JSON object."""

    # Collection-specific description prompts (unchanged)
    def _build_sinks_description_prompt(self, product_data: Dict[str, Any]) -> str:
        """Build description prompt for sinks collection"""
        # Extract key product information
        title = product_data.get('title', '')
        brand = product_data.get('brand_name', '') or product_data.get('vendor', '')
        material = product_data.get('product_material', '')
        installation = product_data.get('installation_type', '')
        style = product_data.get('style', '')
        bowls = product_data.get('bowls_number', '')
        application = product_data.get('application_location', '')
        
        # Build structured product info
        product_info = []
        if title: product_info.append(f"Product: {title}")
        if brand: product_info.append(f"Brand: {brand}")
        if material: product_info.append(f"Material: {material}")
        if installation: product_info.append(f"Installation: {installation}")
        if style: product_info.append(f"Style: {style}")
        if bowls: product_info.append(f"Bowls: {bowls}")
        if application: product_info.append(f"Application: {application}")
        
        product_summary = "\n".join(product_info) if product_info else "Limited product information available"
        
        return f"""You are Morgan Freeman, known for your calm, professional, and reassuring narration.
Write a clear, professional product description for this kitchen or bathroom sink, using language consistent with Morgan Freeman's tone of measured authority and warm confidence.

Product Information:
{product_summary}

Requirements:
- Write exactly 3 sentences, each between 15 and 25 words.
- Use precise, factual language focused on construction, durability, and design.
- Avoid sales buzzwords like "sleek," "modern," "elegant," or "efficiency."
- Use phrases that convey reliability, quality, and lasting value.
- Do not include introductions, sign-offs, or personal opinions.

Write only the description text, no additional formatting or labels."""

    def _build_taps_description_prompt(self, product_data: Dict[str, Any]) -> str:
        """Build description prompt for taps collection"""
        # Extract key product information
        title = product_data.get('title', '')
        brand = product_data.get('brand_name', '') or product_data.get('vendor', '')
        tap_type = product_data.get('tap_type', '')
        material = product_data.get('material', '')
        finish = product_data.get('finish', '')
        
        # Build structured product info
        product_info = []
        if title: product_info.append(f"Product: {title}")
        if brand: product_info.append(f"Brand: {brand}")
        if tap_type: product_info.append(f"Type: {tap_type}")
        if material: product_info.append(f"Material: {material}")
        if finish: product_info.append(f"Finish: {finish}")
        
        product_summary = "\n".join(product_info) if product_info else "Limited product information available"
        
        return f"""Write a professional product description for this kitchen or bathroom tap/faucet.

Product Information:
{product_summary}

Requirements:
- Write exactly 3 sentences, each between 15 and 25 words.
- Focus on functionality, build quality, and design features.
- Use professional language emphasizing reliability and performance.
- Avoid marketing buzzwords, focus on factual attributes.

Write only the description text, no additional formatting or labels."""

    def _build_lighting_description_prompt(self, product_data: Dict[str, Any]) -> str:
        """Build description prompt for lighting collection"""
        # Extract key product information
        title = product_data.get('title', '')
        brand = product_data.get('brand_name', '') or product_data.get('vendor', '')
        light_type = product_data.get('light_type', '')
        bulb_type = product_data.get('bulb_type', '')
        wattage = product_data.get('wattage', '')
        
        # Build structured product info
        product_info = []
        if title: product_info.append(f"Product: {title}")
        if brand: product_info.append(f"Brand: {brand}")
        if light_type: product_info.append(f"Type: {light_type}")
        if bulb_type: product_info.append(f"Bulb Type: {bulb_type}")
        if wattage: product_info.append(f"Wattage: {wattage}W")
        
        product_summary = "\n".join(product_info) if product_info else "Limited product information available"
        
        return f"""Write a professional product description for this lighting fixture.

Product Information:
{product_summary}

Requirements:
- Write exactly 3 sentences, each between 15 and 25 words.
- Focus on illumination quality, design features, and installation benefits.
- Use professional language emphasizing functionality and aesthetic value.
- Avoid marketing buzzwords, focus on lighting performance and practical benefits.

Write only the description text, no additional formatting or labels."""

    def generate_seo_product_title(self, product_data: Dict[str, Any], collection_name: str = 'sinks') -> Dict[str, Any]:
        """
        Generate SEO-optimized product title using ChatGPT with all available product data
        """
        try:
            import requests

            if not self.api_key:
                return {"error": "OpenAI API key not configured"}

            # Format all available product data for ChatGPT
            formatted_data = self._format_complete_product_data(product_data)

            # Build collection-specific title generation prompt
            prompt = self._build_title_generation_prompt(formatted_data, collection_name)

            # Make ChatGPT API request
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }

            payload = {
                'model': 'gpt-4',
                'messages': [
                    {
                        'role': 'system',
                        'content': 'You are an expert SEO copywriter specializing in product titles for e-commerce. Generate compelling, search-optimized product titles that drive conversions and improve search rankings.'
                    },
                    {
                        'role': 'user',
                        'content': prompt
                    }
                ],
                'max_tokens': 200,
                'temperature': 0.7,
                'top_p': 0.9
            }

            response = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers=headers,
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                result = response.json()
                generated_title = result['choices'][0]['message']['content'].strip()

                # Parse the response to extract title variants
                titles = self._parse_title_response(generated_title)

                logger.info(f"Generated {len(titles)} title variants for {collection_name} product")

                return {
                    'success': True,
                    'titles': titles,
                    'primary_title': titles[0] if titles else generated_title,
                    'tokens_used': result.get('usage', {}).get('total_tokens', 0),
                    'collection': collection_name
                }
            else:
                logger.error(f"ChatGPT API error {response.status_code}: {response.text}")
                return {
                    'success': False,
                    'error': f"API error: {response.status_code}",
                    'fallback_title': self._generate_fallback_title(product_data)
                }

        except Exception as e:
            logger.error(f"Error generating product title: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'fallback_title': self._generate_fallback_title(product_data)
            }

    def _format_complete_product_data(self, product_data: Dict[str, Any]) -> str:
        """Format all available product data for title generation prompt"""
        formatted_lines = []

        # Prioritize key fields for title generation
        title_priority_fields = [
            'brand_name', 'vendor', 'style', 'product_material', 'installation_type',
            'bowls_number', 'holes_number'
        ]

        # Add priority fields first
        for field in title_priority_fields:
            value = product_data.get(field)
            if value and str(value).strip():
                clean_field = field.replace('_', ' ').title()
                formatted_lines.append(f"• {clean_field}: {value}")

        # Add current title as reference if exists
        current_title = product_data.get('title')
        if current_title:
            formatted_lines.insert(0, f"• Current Title: {current_title}")

        return "\n".join(formatted_lines) if formatted_lines else "Limited product information available"

    def _build_title_generation_prompt(self, formatted_data: str, collection_name: str) -> str:
        """Build collection-specific prompt for title generation"""

        # Collection-specific brand-first guidelines
        collection_guidelines = {
            'sinks': {
                'format': 'Brand + Material + Style + Bowl Configuration + Installation Type + "Sink"',
                'examples': [
                    'Kraus 33" Stainless Steel Farmhouse Single Bowl Kitchen Sink',
                    'Blanco SILGRANIT Granite Composite Undermount Double Bowl Sink',
                    'Rohl Fireclay Traditional Single Bowl Apron Front Sink'
                ],
                'keywords': 'kitchen sink, undermount, farmhouse, stainless steel, granite composite'
            },
            'taps': {
                'format': 'Brand + Style + Finish + Spout Type + Mount Type + "Faucet"',
                'examples': [
                    'Moen Arbor Matte Black Pull-Down Kitchen Faucet',
                    'Delta Trinsic Chrome Single Handle Bathroom Faucet',
                    'Kohler Purist Brushed Nickel Wall Mount Kitchen Faucet'
                ],
                'keywords': 'kitchen faucet, bathroom faucet, pull-down, single handle'
            },
            'lighting': {
                'format': 'Brand + Style + Finish + Light Type + Wattage + Application',
                'examples': [
                    'Philips Hue Modern LED Pendant Light 15W Kitchen Island',
                    'Hunter Traditional Crystal Chandelier Chrome Dining Room',
                    'Progress Industrial Track Lighting Bronze 4-Light Ceiling'
                ],
                'keywords': 'LED light, pendant light, chandelier, ceiling light'
            }
        }

        guidelines = collection_guidelines.get(collection_name, collection_guidelines['sinks'])

        prompt = f"""Create 3 SEO-optimized product titles for a {collection_name} product using the following data:

PRODUCT INFORMATION:
{formatted_data}

CRITICAL REQUIREMENTS:
• ALWAYS start with the brand name first (if available)
• Follow this format: {guidelines['format']}
• Length: 50-70 characters optimal for SEO
• Include relevant keywords: {guidelines['keywords']}

GOOD EXAMPLES (notice brand comes first):
{chr(10).join(f'• {example}' for example in guidelines['examples'])}

Please provide 3 title variants in this format:
1. [Primary SEO-focused title - BRAND FIRST]
2. [Customer-friendly alternative - BRAND FIRST]
3. [Feature-focused variant - BRAND FIRST]

IMPORTANT: Each title MUST start with the brand name if available in the product data. This is non-negotiable for brand recognition."""

        return prompt

    def _parse_title_response(self, response: str) -> List[str]:
        """Parse ChatGPT response to extract title variants"""
        titles = []

        # Look for numbered list format
        lines = response.strip().split('\n')
        for line in lines:
            line = line.strip()

            # Match numbered items: "1. Title", "2. Title", etc.
            if re.match(r'^\d+\.\s*', line):
                title = re.sub(r'^\d+\.\s*', '', line).strip()
                if title:
                    titles.append(title)

        return titles if titles else [response.strip()]

    def _generate_fallback_title(self, product_data: Dict[str, Any]) -> str:
        """Generate a basic fallback title when AI fails"""
        parts = []

        # Add brand if available
        if product_data.get('brand_name'):
            parts.append(product_data['brand_name'])
        elif product_data.get('vendor'):
            parts.append(product_data['vendor'])

        # Add material
        if product_data.get('product_material'):
            parts.append(product_data['product_material'])

        # Add style
        if product_data.get('style'):
            parts.append(product_data['style'])

        # Add product type
        parts.append("Sink")  # Default to sink, could be made dynamic

        return " ".join(parts) if parts else "Product Title"

    def analyze_competitor_titles(self, product_data: Dict[str, Any], collection_name: str = 'sinks') -> Dict[str, Any]:
        """
        Search Google for competitor product titles and analyze naming patterns
        """
        try:
            import requests
            from urllib.parse import quote
            import time

            # Build search query from product data
            search_query = self._build_competitor_search_query(product_data, collection_name)

            # Use Google Custom Search API or web scraping
            competitor_data = self._search_competitor_titles(search_query)

            # If no real data found, use mock data for demonstration
            if not competitor_data:
                logger.info("No competitor data found, using mock data for demonstration")
                competitor_data = self._generate_mock_competitor_data(product_data, collection_name)

            if competitor_data:
                # Analyze patterns in competitor titles
                analysis = self._analyze_title_patterns(competitor_data, product_data)

                return {
                    'success': True,
                    'search_query': search_query,
                    'competitor_data': competitor_data,
                    'competitor_titles': [item['title'] for item in competitor_data],  # For backward compatibility
                    'analysis': analysis,
                    'insights': analysis.get('insights', []),
                    'is_mock_data': len(competitor_data) > 0 and competitor_data[0].get('competitor') in ['Harvey Norman', 'Bunnings', 'Reece']
                }
            else:
                return {
                    'success': False,
                    'error': 'No competitor titles found',
                    'search_query': search_query
                }

        except Exception as e:
            logger.error(f"Error analyzing competitor titles: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }

    def _build_competitor_search_query(self, product_data: Dict[str, Any], collection_name: str) -> str:
        """Build targeted search query for finding competitor products"""
        query_parts = []

        # Add product material
        if product_data.get('product_material'):
            query_parts.append(product_data['product_material'])

        # Add style
        if product_data.get('style'):
            query_parts.append(product_data['style'])

        # Add product type
        if collection_name == 'sinks':
            if product_data.get('installation_type'):
                query_parts.append(product_data['installation_type'])
            if product_data.get('bowls_number') == '1':
                query_parts.append('single bowl')
            elif product_data.get('bowls_number') == '2':
                query_parts.append('double bowl')
            query_parts.append('kitchen sink')
        elif collection_name == 'taps':
            query_parts.append('kitchen faucet')
        elif collection_name == 'lighting':
            query_parts.append('light fixture')

        # Add site restrictions to focus on Australian retail competitors
        competitor_sites = [
            'site:agcequipment.com.au',
            'site:appliancesonline.com.au',
            'site:austpek.com.au',
            'site:binglee.com.au',
            'site:blueleafbath.com.au',
            'site:brandsdirectonline.com.au',
            'site:buildmat.com.au',
            'site:cookandbathe.com.au',
            'site:eands.com.au',
            'site:harveynorman.com.au',
            'site:idealbathroomcentre.com.au',
            'site:justbathroomware.com.au',
            'site:plumbingsales.com.au',
            'site:powerland.com.au',
            'site:saappliancewarehouse.com.au',
            'site:samedayhotwaterservice.com.au',
            'site:shireskylights.com.au',
            'site:thebluespace.com.au',
            'site:wellsons.com.au',
            'site:winnings.com.au'
        ]

        retail_sites = ' OR '.join(competitor_sites)

        search_query = f'{" ".join(query_parts)} {retail_sites}'
        return search_query

    def _search_competitor_titles(self, search_query: str) -> List[Dict]:
        """Search for competitor product titles using Google"""
        try:
            import requests
            from bs4 import BeautifulSoup
            from urllib.parse import quote
            import time

            # Use Google search with user agent
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }

            # First try the specific competitor search
            google_url = f"https://www.google.com/search?q={quote(search_query)}&num=20"

            logger.info(f"Searching Google with: {search_query}")
            response = requests.get(google_url, headers=headers, timeout=10)

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')

                # Extract titles with their source URLs
                competitor_data = []

                # Try multiple selectors for Google results (Google changes these frequently)
                search_results = soup.find_all('div', class_='g') or soup.find_all('div', {'data-ved': True})

                logger.info(f"Found {len(search_results)} potential search results")

                for result in search_results:
                    # Extract title
                    title_elem = result.find('h3')
                    if not title_elem:
                        continue

                    title_text = title_elem.get_text().strip()
                    if not title_text or len(title_text) <= 10:
                        continue

                    # Extract URL to identify competitor
                    url_elem = result.find('a')
                    competitor_name = 'Unknown'

                    if url_elem and url_elem.get('href'):
                        url = url_elem.get('href')
                        # Extract domain name
                        if 'agcequipment' in url:
                            competitor_name = 'AGC Equipment'
                        elif 'appliancesonline' in url:
                            competitor_name = 'Appliances Online'
                        elif 'austpek' in url:
                            competitor_name = 'Austpek'
                        elif 'binglee' in url:
                            competitor_name = 'Bing Lee'
                        elif 'blueleafbath' in url:
                            competitor_name = 'Blue Leaf Bath'
                        elif 'brandsdirectonline' in url:
                            competitor_name = 'Brands Direct Online'
                        elif 'buildmat' in url:
                            competitor_name = 'Buildmat'
                        elif 'cookandbathe' in url:
                            competitor_name = 'Cook & Bathe'
                        elif 'eands' in url:
                            competitor_name = 'E&S Trading'
                        elif 'harveynorman' in url:
                            competitor_name = 'Harvey Norman'
                        elif 'idealbathroomcentre' in url:
                            competitor_name = 'Ideal Bathroom Centre'
                        elif 'justbathroomware' in url:
                            competitor_name = 'Just Bathroomware'
                        elif 'plumbingsales' in url:
                            competitor_name = 'Plumbing Sales'
                        elif 'powerland' in url:
                            competitor_name = 'Powerland'
                        elif 'saappliancewarehouse' in url:
                            competitor_name = 'SA Appliance Warehouse'
                        elif 'samedayhotwaterservice' in url:
                            competitor_name = 'Same Day Hot Water'
                        elif 'shireskylights' in url:
                            competitor_name = 'Shire Skylights'
                        elif 'thebluespace' in url:
                            competitor_name = 'The Blue Space'
                        elif 'wellsons' in url:
                            competitor_name = 'Wellsons'
                        elif 'winnings' in url:
                            competitor_name = 'Winnings'

                    competitor_data.append({
                        'title': title_text,
                        'competitor': competitor_name,
                        'url': url if url_elem else ''
                    })

                logger.info(f"Successfully extracted {len(competitor_data)} competitor titles")

                # If we found results, return them
                if competitor_data:
                    return competitor_data[:20]

                # If no results with specific competitors, try a broader search
                logger.info("No results from specific competitors, trying broader search...")
                return self._fallback_search(search_query)

            logger.warning(f"Google search returned status code: {response.status_code}")
            return []

        except Exception as e:
            logger.error(f"Error searching competitor titles: {str(e)}")
            return []

    def _fallback_search(self, original_query: str) -> List[Dict]:
        """Fallback search with broader terms and common Australian retailers"""
        try:
            from urllib.parse import quote
            import requests
            from bs4 import BeautifulSoup

            # Extract just the product terms (remove site restrictions)
            query_parts = original_query.split(' site:')[0]

            # Add some common Australian retailers for broader search
            fallback_query = f'{query_parts} site:bunnings.com.au OR site:reece.com.au OR australia'

            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }

            google_url = f"https://www.google.com/search?q={quote(fallback_query)}&num=10"
            logger.info(f"Fallback search with: {fallback_query}")

            response = requests.get(google_url, headers=headers, timeout=10)

            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                fallback_data = []

                # Simpler parsing for fallback
                h3_elements = soup.find_all('h3')

                for h3 in h3_elements:
                    title_text = h3.get_text().strip()
                    if title_text and len(title_text) > 15:
                        # Try to determine retailer from URL
                        parent_link = h3.find_parent('a')
                        retailer = 'Australian Retailer'

                        if parent_link and parent_link.get('href'):
                            url = parent_link.get('href')
                            if 'bunnings' in url:
                                retailer = 'Bunnings'
                            elif 'reece' in url:
                                retailer = 'Reece'
                            elif any(comp in url for comp in ['harvey', 'appliances', 'kitchen', 'bathroom']):
                                retailer = 'Major Retailer'

                        fallback_data.append({
                            'title': title_text,
                            'competitor': retailer,
                            'url': url if parent_link else ''
                        })

                logger.info(f"Fallback search found {len(fallback_data)} results")
                return fallback_data[:15]

            return []

        except Exception as e:
            logger.error(f"Error in fallback search: {str(e)}")
            return []

    def _generate_mock_competitor_data(self, product_data: Dict[str, Any], collection_name: str) -> List[Dict]:
        """Generate realistic mock competitor data for testing purposes"""
        try:
            material = product_data.get('product_material', 'Stainless Steel')
            style = product_data.get('style', 'Modern')
            bowls = product_data.get('bowls_number', '1')
            installation = product_data.get('installation_type', 'Undermount')

            if collection_name == 'sinks':
                bowl_text = "Single Bowl" if bowls == '1' else "Double Bowl"

                mock_competitors = [
                    {
                        'title': f'Oliveri Professional {material} {bowl_text} {installation} Kitchen Sink',
                        'competitor': 'Harvey Norman',
                        'url': 'https://harveynorman.com.au/...'
                    },
                    {
                        'title': f'Franke Kubus {bowl_text} {material} Kitchen Sink - {installation}',
                        'competitor': 'Bunnings',
                        'url': 'https://bunnings.com.au/...'
                    },
                    {
                        'title': f'Blanco Diamond {material} {style} {bowl_text} Sink',
                        'competitor': 'Reece',
                        'url': 'https://reece.com.au/...'
                    },
                    {
                        'title': f'Clark Advance {bowl_text} {material} {installation} Kitchen Sink',
                        'competitor': 'Cook & Bathe',
                        'url': 'https://cookandbathe.com.au/...'
                    },
                    {
                        'title': f'Abey Schock {material} {bowl_text} {style} Kitchen Sink',
                        'competitor': 'Blue Leaf Bath',
                        'url': 'https://blueleafbath.com.au/...'
                    },
                    {
                        'title': f'Schweigen {material} {bowl_text} {installation} Sink with Drainer',
                        'competitor': 'Appliances Online',
                        'url': 'https://appliancesonline.com.au/...'
                    },
                    {
                        'title': f'Mondella {style} {material} {bowl_text} Kitchen Sink',
                        'competitor': 'Just Bathroomware',
                        'url': 'https://justbathroomware.com.au/...'
                    },
                    {
                        'title': f'Phoenix Tapware {material} {bowl_text} {installation} Kitchen Sink',
                        'competitor': 'Ideal Bathroom Centre',
                        'url': 'https://idealbathroomcentre.com.au/...'
                    }
                ]

            elif collection_name == 'taps':
                mock_competitors = [
                    {
                        'title': f'Moen Arbor {style} Kitchen Faucet with Pull-Down Spray',
                        'competitor': 'Harvey Norman',
                        'url': 'https://harveynorman.com.au/...'
                    },
                    {
                        'title': f'Delta Trinsic Single Handle Kitchen Faucet - Chrome',
                        'competitor': 'Bunnings',
                        'url': 'https://bunnings.com.au/...'
                    },
                    {
                        'title': f'Kohler Purist {style} Kitchen Faucet Wall Mount',
                        'competitor': 'Reece',
                        'url': 'https://reece.com.au/...'
                    }
                ]

            else:  # lighting
                mock_competitors = [
                    {
                        'title': f'{style} LED Pendant Light for Kitchen Island',
                        'competitor': 'Harvey Norman',
                        'url': 'https://harveynorman.com.au/...'
                    },
                    {
                        'title': f'Track Lighting {style} 4-Light Ceiling Mount',
                        'competitor': 'Bunnings',
                        'url': 'https://bunnings.com.au/...'
                    }
                ]

            logger.info(f"Generated {len(mock_competitors)} mock competitor entries")
            return mock_competitors

        except Exception as e:
            logger.error(f"Error generating mock competitor data: {str(e)}")
            return []

    def _analyze_title_patterns(self, competitor_data: List[Dict], product_data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze patterns in competitor product titles with competitor attribution"""
        try:
            analysis = {
                'total_titles': len(competitor_data),
                'common_keywords': [],
                'brand_patterns': [],
                'length_analysis': {},
                'insights': [],
                'competitor_breakdown': {}
            }

            if not competitor_data:
                return analysis

            # Extract titles and organize by competitor
            competitor_titles = [item['title'] for item in competitor_data]

            # Group by competitor
            for item in competitor_data:
                competitor = item['competitor']
                if competitor not in analysis['competitor_breakdown']:
                    analysis['competitor_breakdown'][competitor] = []
                analysis['competitor_breakdown'][competitor].append(item['title'])

            # Analyze title lengths
            lengths = [len(title) for title in competitor_titles]
            analysis['length_analysis'] = {
                'average': sum(lengths) / len(lengths),
                'min': min(lengths),
                'max': max(lengths),
                'recommended': f"{int(sum(lengths) / len(lengths)) - 5}-{int(sum(lengths) / len(lengths)) + 5} characters"
            }

            # Find common keywords
            all_words = []
            for title in competitor_titles:
                words = [word.lower().strip('.,!?()[]') for word in title.split()]
                all_words.extend(words)

            # Count word frequency
            word_freq = {}
            for word in all_words:
                if len(word) > 2:  # Ignore very short words
                    word_freq[word] = word_freq.get(word, 0) + 1

            # Get most common keywords (excluding our brand)
            our_brand = product_data.get('brand_name', '').lower()
            common_keywords = []
            for word, freq in sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:10]:
                if word != our_brand and freq > 1:
                    common_keywords.append(f"{word} ({freq}x)")

            analysis['common_keywords'] = common_keywords

            # Generate insights
            insights = []

            if analysis['length_analysis']['average'] > 60:
                insights.append("Competitors use longer, more descriptive titles")
            else:
                insights.append("Competitors prefer shorter, punchier titles")

            if common_keywords:
                insights.append(f"Popular keywords: {', '.join([kw.split('(')[0].strip() for kw in common_keywords[:3]])}")

            # Brand positioning analysis
            brand_first_count = 0
            for title in competitor_titles:
                words = title.split()
                if len(words) > 0:
                    first_word = words[0].lower()
                    # Check if first word looks like a brand (capitalized, not common words)
                    if first_word not in ['kitchen', 'bathroom', 'stainless', 'modern', 'traditional']:
                        brand_first_count += 1

            if brand_first_count > len(competitor_titles) / 2:
                insights.append("Most competitors lead with brand name")
            else:
                insights.append("Competitors often lead with product features")

            analysis['insights'] = insights

            return analysis

        except Exception as e:
            logger.error(f"Error analyzing title patterns: {str(e)}")
            return {'error': str(e)}

    def generate_seo_product_title_with_competitor_analysis(self, product_data: Dict[str, Any], collection_name: str = 'sinks') -> Dict[str, Any]:
        """
        Generate SEO-optimized product title with competitor intelligence
        """
        try:
            # First, analyze competitor titles
            competitor_analysis = self.analyze_competitor_titles(product_data, collection_name)

            # Enhanced prompt with competitor insights
            formatted_data = self._format_complete_product_data(product_data)
            prompt = self._build_competitor_enhanced_prompt(formatted_data, collection_name, competitor_analysis)

            if not self.api_key:
                return {"error": "OpenAI API key not configured"}

            # Make ChatGPT API request with competitor insights
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }

            payload = {
                'model': 'gpt-4',
                'messages': [
                    {
                        'role': 'system',
                        'content': 'You are an expert SEO copywriter and competitive intelligence analyst. Use competitor analysis to create superior product titles that outperform the competition while maintaining brand leadership.'
                    },
                    {
                        'role': 'user',
                        'content': prompt
                    }
                ],
                'max_tokens': 300,
                'temperature': 0.7,
                'top_p': 0.9
            }

            response = requests.post(
                'https://api.openai.com/v1/chat/completions',
                headers=headers,
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                result = response.json()
                generated_title = result['choices'][0]['message']['content'].strip()
                titles = self._parse_title_response(generated_title)

                return {
                    'success': True,
                    'titles': titles,
                    'primary_title': titles[0] if titles else generated_title,
                    'tokens_used': result.get('usage', {}).get('total_tokens', 0),
                    'collection': collection_name,
                    'competitor_analysis': competitor_analysis,
                    'search_query': competitor_analysis.get('search_query'),
                    'insights_used': competitor_analysis.get('insights', [])
                }
            else:
                # Fallback to regular generation
                return self.generate_seo_product_title(product_data, collection_name)

        except Exception as e:
            logger.error(f"Error generating competitor-enhanced title: {str(e)}")
            # Fallback to regular generation
            return self.generate_seo_product_title(product_data, collection_name)

    def _build_competitor_enhanced_prompt(self, formatted_data: str, collection_name: str, competitor_analysis: Dict[str, Any]) -> str:
        """Build enhanced prompt with competitor intelligence"""

        base_prompt = self._build_title_generation_prompt(formatted_data, collection_name)

        if not competitor_analysis.get('success'):
            return base_prompt

        competitor_section = f"""

COMPETITOR INTELLIGENCE:
• Search Query Used: {competitor_analysis.get('search_query', 'N/A')}
• Competitor Titles Found: {competitor_analysis.get('analysis', {}).get('total_titles', 0)}
• Market Insights: {', '.join(competitor_analysis.get('insights', []))}
• Popular Keywords: {', '.join(competitor_analysis.get('analysis', {}).get('common_keywords', [])[:5])}
• Average Title Length: {competitor_analysis.get('analysis', {}).get('length_analysis', {}).get('recommended', 'N/A')}

COMPETITIVE ADVANTAGE INSTRUCTIONS:
• Use competitor insights to create BETTER titles than the market
• Incorporate popular keywords while maintaining brand leadership
• Ensure our titles stand out from competitor patterns
• Balance SEO optimization with competitive differentiation"""

        return base_prompt + competitor_section

# Global instance
ai_extractor = AIExtractor()

def get_ai_extractor() -> AIExtractor:
    """Get the global AI extractor instance"""
    return ai_extractor
