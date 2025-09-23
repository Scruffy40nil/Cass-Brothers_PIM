"""
Collection Builder - Automated Collection Creation System
Creates new product collections without coding through a wizard interface
"""

import os
import json
import logging
import time
from typing import Dict, List, Any, Optional
import gspread
from google.oauth2.service_account import Credentials

from config.settings import get_settings
from config.collections import CollectionConfig, COLLECTIONS

logger = logging.getLogger(__name__)

class CollectionBuilder:
    """
    Automated collection creation system that generates:
    - Collection configuration
    - Google Sheets templates
    - AI extraction prompts
    - Frontend templates
    - Google Apps Script code
    """

    def __init__(self):
        self.settings = get_settings()
        self.gc = None
        self.setup_credentials()

    def setup_credentials(self) -> bool:
        """Setup Google Sheets credentials for automated sheet creation"""
        try:
            if self.settings.GOOGLE_CREDENTIALS_JSON:
                if self.settings.GOOGLE_CREDENTIALS_JSON.startswith('{'):
                    creds_dict = json.loads(self.settings.GOOGLE_CREDENTIALS_JSON)
                else:
                    with open(self.settings.GOOGLE_CREDENTIALS_JSON, 'r') as f:
                        creds_dict = json.load(f)

                creds = Credentials.from_service_account_info(
                    creds_dict,
                    scopes=['https://www.googleapis.com/auth/spreadsheets']
                )
                self.gc = gspread.authorize(creds)
                logger.info("✅ Google Sheets authentication successful for Collection Builder")
                return True
            else:
                logger.warning("⚠️ No Google credentials configured - sheet creation will be skipped")
                return False
        except Exception as e:
            logger.error(f"❌ Failed to setup Google credentials: {e}")
            return False

    def get_available_templates(self) -> List[Dict[str, Any]]:
        """Get available collection templates"""
        templates = [
            {
                'id': 'plumbing_fixtures',
                'name': 'Plumbing Fixtures',
                'description': 'Sinks, taps, faucets, mixers, and plumbing accessories',
                'icon': 'fa-faucet',
                'category': 'plumbing',
                'base_fields': ['sku', 'title', 'brand_name', 'installation_type', 'product_material',
                               'grade_of_material', 'style', 'warranty_years', 'dimensions'],
                'ai_prompts': {
                    'extraction': self._get_plumbing_extraction_prompt_template(),
                    'features': self._get_plumbing_features_prompt_template(),
                    'care': self._get_plumbing_care_prompt_template()
                }
            },
            {
                'id': 'lighting',
                'name': 'Lighting Fixtures',
                'description': 'Indoor and outdoor lighting, bulbs, and electrical fixtures',
                'icon': 'fa-lightbulb',
                'category': 'lighting',
                'base_fields': ['sku', 'title', 'brand_name', 'light_type', 'bulb_type', 'wattage',
                               'color_temperature', 'dimming_compatible', 'ip_rating', 'material'],
                'ai_prompts': {
                    'extraction': self._get_lighting_extraction_prompt_template(),
                    'features': self._get_lighting_features_prompt_template(),
                    'care': self._get_lighting_care_prompt_template()
                }
            },
            {
                'id': 'hardware',
                'name': 'Hardware & Accessories',
                'description': 'Tools, fasteners, accessories, and hardware components',
                'icon': 'fa-tools',
                'category': 'hardware',
                'base_fields': ['sku', 'title', 'brand_name', 'material', 'size', 'finish',
                               'compatibility', 'application', 'grade'],
                'ai_prompts': {
                    'extraction': self._get_hardware_extraction_prompt_template(),
                    'features': self._get_hardware_features_prompt_template(),
                    'care': self._get_hardware_care_prompt_template()
                }
            },
            {
                'id': 'appliances',
                'name': 'Appliances',
                'description': 'Kitchen and household appliances',
                'icon': 'fa-blender',
                'category': 'appliances',
                'base_fields': ['sku', 'title', 'brand_name', 'appliance_type', 'power_rating',
                               'capacity', 'energy_rating', 'dimensions', 'weight'],
                'ai_prompts': {
                    'extraction': self._get_appliances_extraction_prompt_template(),
                    'features': self._get_appliances_features_prompt_template(),
                    'care': self._get_appliances_care_prompt_template()
                }
            },
            {
                'id': 'generic',
                'name': 'Generic Product',
                'description': 'Start with basic fields for any product type',
                'icon': 'fa-cube',
                'category': 'general',
                'base_fields': ['sku', 'title', 'brand_name', 'model', 'description',
                               'dimensions', 'weight', 'warranty_years'],
                'ai_prompts': {
                    'extraction': self._get_generic_extraction_prompt_template(),
                    'features': self._get_generic_features_prompt_template(),
                    'care': self._get_generic_care_prompt_template()
                }
            }
        ]
        return templates

    def get_field_library(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get comprehensive field library organized by category"""
        return {
            'Essential': [
                {'id': 'sku', 'name': 'SKU/Model Number', 'type': 'text', 'required': True, 'description': 'Unique product identifier'},
                {'id': 'title', 'name': 'Product Title', 'type': 'text', 'required': True, 'description': 'Product name and title'},
                {'id': 'brand_name', 'name': 'Brand/Manufacturer', 'type': 'text', 'required': True, 'description': 'Brand or manufacturer name'},
                {'id': 'vendor', 'name': 'Vendor/Supplier', 'type': 'text', 'required': False, 'description': 'Supplier or vendor name'},
                {'id': 'description', 'name': 'Product Description', 'type': 'textarea', 'required': False, 'description': 'Detailed product description'}
            ],
            'Specifications': [
                {'id': 'material', 'name': 'Material', 'type': 'text', 'required': False, 'description': 'Primary material construction'},
                {'id': 'grade_of_material', 'name': 'Material Grade', 'type': 'text', 'required': False, 'description': 'Quality grade of material'},
                {'id': 'finish', 'name': 'Finish/Color', 'type': 'text', 'required': False, 'description': 'Surface finish or color'},
                {'id': 'style', 'name': 'Style/Design', 'type': 'text', 'required': False, 'description': 'Design style or aesthetic'},
                {'id': 'dimensions', 'name': 'Dimensions', 'type': 'text', 'required': False, 'description': 'Product dimensions'},
                {'id': 'weight', 'name': 'Weight', 'type': 'number', 'required': False, 'description': 'Product weight'},
                {'id': 'capacity', 'name': 'Capacity/Volume', 'type': 'text', 'required': False, 'description': 'Capacity or volume specs'}
            ],
            'Installation': [
                {'id': 'installation_type', 'name': 'Installation Type', 'type': 'text', 'required': False, 'description': 'How product is installed'},
                {'id': 'mounting_type', 'name': 'Mounting Type', 'type': 'text', 'required': False, 'description': 'Mounting method'},
                {'id': 'compatibility', 'name': 'Compatibility', 'type': 'text', 'required': False, 'description': 'Compatible with what systems'},
                {'id': 'application_location', 'name': 'Application Location', 'type': 'text', 'required': False, 'description': 'Where product is used'}
            ],
            'Technical': [
                {'id': 'power_rating', 'name': 'Power Rating', 'type': 'text', 'required': False, 'description': 'Electrical power specifications'},
                {'id': 'voltage', 'name': 'Voltage', 'type': 'text', 'required': False, 'description': 'Operating voltage'},
                {'id': 'pressure_rating', 'name': 'Pressure Rating', 'type': 'text', 'required': False, 'description': 'Maximum pressure rating'},
                {'id': 'temperature_rating', 'name': 'Temperature Rating', 'type': 'text', 'required': False, 'description': 'Operating temperature range'},
                {'id': 'ip_rating', 'name': 'IP Rating', 'type': 'text', 'required': False, 'description': 'Ingress protection rating'}
            ],
            'Commercial': [
                {'id': 'warranty_years', 'name': 'Warranty (Years)', 'type': 'number', 'required': False, 'description': 'Warranty period in years'},
                {'id': 'shopify_price', 'name': 'Selling Price', 'type': 'number', 'required': False, 'description': 'Current selling price'},
                {'id': 'shopify_compare_price', 'name': 'RRP/Compare Price', 'type': 'number', 'required': False, 'description': 'Recommended retail price'},
                {'id': 'availability', 'name': 'Availability', 'type': 'text', 'required': False, 'description': 'Stock availability status'}
            ],
            'Content': [
                {'id': 'body_html', 'name': 'Product Description (HTML)', 'type': 'textarea', 'required': False, 'description': 'Rich HTML description'},
                {'id': 'features', 'name': 'Key Features', 'type': 'textarea', 'required': False, 'description': 'Bullet point features'},
                {'id': 'care_instructions', 'name': 'Care Instructions', 'type': 'textarea', 'required': False, 'description': 'Maintenance and care'},
                {'id': 'seo_title', 'name': 'SEO Title', 'type': 'text', 'required': False, 'description': 'Search engine optimized title'},
                {'id': 'seo_description', 'name': 'SEO Description', 'type': 'textarea', 'required': False, 'description': 'Meta description for SEO'}
            ]
        }

    def preview_collection(self, collection_data: Dict[str, Any]) -> Dict[str, Any]:
        """Preview what will be created for a collection"""
        try:
            # Get template data
            template = self._get_template_by_id(collection_data.get('template'))

            # Generate column mappings
            column_mappings = self._generate_column_mappings(collection_data.get('fields', []))

            # Generate AI prompts
            ai_prompts = self._generate_ai_prompts(collection_data, template)

            preview = {
                'collection_info': {
                    'name': collection_data.get('name'),
                    'display_name': collection_data.get('displayName'),
                    'description': collection_data.get('description'),
                    'product_type': collection_data.get('productType'),
                    'template_used': template['name'] if template else 'Custom'
                },
                'fields_count': len(collection_data.get('fields', [])),
                'column_mappings_preview': list(column_mappings.keys())[:10],  # First 10 fields
                'ai_prompts_preview': {
                    'extraction_length': len(ai_prompts.get('extraction', '')),
                    'features_length': len(ai_prompts.get('features', '')),
                    'care_length': len(ai_prompts.get('care', ''))
                },
                'features_enabled': {
                    'pricing': collection_data.get('enablePricing', False),
                    'images': collection_data.get('enableImages', False),
                    'quality': collection_data.get('enableQuality', False)
                },
                'files_to_create': [
                    f'config/collections.py (add {collection_data.get("name", "collection")} class)',
                    f'templates/collection/{collection_data.get("name", "collection")}.html',
                    f'static/js/collection/{collection_data.get("name", "collection")}.js',
                    'Google Sheets template',
                    f'{collection_data.get("name", "collection")}_rules.gs (Apps Script)'
                ]
            }

            return preview

        except Exception as e:
            logger.error(f"Error generating collection preview: {e}")
            raise

    def create_collection(self, collection_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a complete new collection"""
        try:
            collection_name = collection_data.get('name')
            logger.info(f"🚀 Starting collection creation: {collection_name}")

            # Validate input data
            validation_result = self._validate_collection_data(collection_data)
            if not validation_result['valid']:
                return {
                    'success': False,
                    'error': f"Validation failed: {validation_result['error']}"
                }

            # Check if collection already exists
            if collection_name in COLLECTIONS:
                return {
                    'success': False,
                    'error': f"Collection '{collection_name}' already exists"
                }

            creation_steps = []

            # Step 1: Generate collection configuration
            logger.info("📝 Step 1: Generating collection configuration...")
            config_result = self._generate_collection_config(collection_data)
            if not config_result['success']:
                return config_result
            creation_steps.append("✅ Collection configuration generated")

            # Step 2: Create Google Sheets template (if credentials available)
            logger.info("📊 Step 2: Creating Google Sheets template...")
            sheets_result = self._create_google_sheets_template(collection_data)
            if sheets_result['success']:
                creation_steps.append(f"✅ Google Sheets template created: {sheets_result['spreadsheet_url']}")
                collection_data['spreadsheet_id'] = sheets_result['spreadsheet_id']
            else:
                creation_steps.append(f"⚠️ Google Sheets creation skipped: {sheets_result['error']}")

            # Step 3: Generate AI prompts
            logger.info("🤖 Step 3: Generating AI extraction prompts...")
            ai_result = self._generate_ai_prompts_files(collection_data)
            if ai_result['success']:
                creation_steps.append("✅ AI extraction prompts generated")
            else:
                creation_steps.append(f"⚠️ AI prompts generation failed: {ai_result['error']}")

            # Step 4: Generate frontend templates
            logger.info("🎨 Step 4: Generating frontend templates...")
            frontend_result = self._generate_frontend_templates(collection_data)
            if frontend_result['success']:
                creation_steps.append("✅ Frontend templates generated")
            else:
                creation_steps.append(f"⚠️ Frontend generation failed: {frontend_result['error']}")

            # Step 5: Generate Google Apps Script
            logger.info("📜 Step 5: Generating Google Apps Script...")
            apps_script_result = self._generate_apps_script(collection_data)
            if apps_script_result['success']:
                creation_steps.append("✅ Google Apps Script generated")
            else:
                creation_steps.append(f"⚠️ Apps Script generation failed: {apps_script_result['error']}")

            # Step 6: Update collections registry
            logger.info("🔧 Step 6: Updating collections registry...")
            registry_result = self._update_collections_registry(collection_data)
            if registry_result['success']:
                creation_steps.append("✅ Collections registry updated")
            else:
                creation_steps.append(f"⚠️ Registry update failed: {registry_result['error']}")

            logger.info(f"✨ Collection '{collection_name}' created successfully!")

            return {
                'success': True,
                'message': f"Collection '{collection_name}' created successfully",
                'collection_name': collection_name,
                'spreadsheet_id': collection_data.get('spreadsheet_id'),
                'spreadsheet_url': sheets_result.get('spreadsheet_url') if sheets_result['success'] else None,
                'steps_completed': creation_steps,
                'next_steps': [
                    f"Visit /{collection_name} to start managing products",
                    "Upload product data to the Google Sheets template",
                    "Configure validation rules in the rule sheets",
                    "Copy the generated Apps Script to your Google Sheets"
                ]
            }

        except Exception as e:
            logger.error(f"❌ Error creating collection: {str(e)}")
            return {
                'success': False,
                'error': f"Failed to create collection: {str(e)}"
            }

    # =============================================
    # PRIVATE HELPER METHODS
    # =============================================

    def _validate_collection_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate collection creation data"""
        required_fields = ['name', 'displayName', 'description', 'productType']

        for field in required_fields:
            if not data.get(field):
                return {
                    'valid': False,
                    'error': f"Missing required field: {field}"
                }

        # Validate collection name format
        name = data['name']
        if not name.replace('_', '').replace('-', '').isalnum():
            return {
                'valid': False,
                'error': "Collection name must contain only letters, numbers, underscores, and hyphens"
            }

        return {'valid': True}

    def _get_template_by_id(self, template_id: str) -> Optional[Dict[str, Any]]:
        """Get template configuration by ID"""
        templates = self.get_available_templates()
        for template in templates:
            if template['id'] == template_id:
                return template
        return None

    def _generate_column_mappings(self, selected_fields: List[str]) -> Dict[str, int]:
        """Generate column mappings for selected fields"""
        mappings = {}

        # Standard system fields always come first
        base_fields = [
            'url', 'variant_sku', 'key', 'id', 'handle', 'title', 'vendor'
        ]

        current_col = 1

        # Add base fields
        for field in base_fields:
            mappings[field] = current_col
            current_col += 1

        # Add selected fields
        for field in selected_fields:
            if field not in mappings:  # Don't duplicate base fields
                mappings[field] = current_col
                current_col += 1

        # Add standard e-commerce fields
        ecommerce_fields = [
            'shopify_price', 'shopify_compare_price', 'shopify_weight',
            'shopify_tags', 'seo_title', 'seo_description', 'shopify_images',
            'shopify_collections', 'shopify_url', 'last_shopify_sync'
        ]

        for field in ecommerce_fields:
            if field not in mappings:
                mappings[field] = current_col
                current_col += 1

        return mappings

    def _generate_ai_prompts(self, collection_data: Dict[str, Any], template: Optional[Dict[str, Any]]) -> Dict[str, str]:
        """Generate AI extraction prompts based on template and customization"""
        prompts = {}

        if template and 'ai_prompts' in template:
            # Use template prompts as base
            prompts = template['ai_prompts'].copy()
        else:
            # Generate generic prompts
            prompts = {
                'extraction': self._get_generic_extraction_prompt_template(),
                'features': self._get_generic_features_prompt_template(),
                'care': self._get_generic_care_prompt_template()
            }

        # Customize prompts with collection-specific data
        selected_fields = collection_data.get('fields', [])
        field_descriptions = self._generate_field_descriptions(selected_fields)

        # Replace placeholders in prompts
        for prompt_type, prompt_text in prompts.items():
            prompts[prompt_type] = prompt_text.format(
                collection_name=collection_data.get('displayName', 'Product'),
                collection_description=collection_data.get('description', ''),
                product_type=collection_data.get('productType', 'product'),
                field_descriptions=field_descriptions
            )

        return prompts

    def _generate_field_descriptions(self, selected_fields: List[str]) -> str:
        """Generate field descriptions for AI prompts"""
        field_library = self.get_field_library()
        all_fields = {}

        # Flatten field library
        for category, fields in field_library.items():
            for field in fields:
                all_fields[field['id']] = field

        descriptions = []
        for field_id in selected_fields:
            if field_id in all_fields:
                field = all_fields[field_id]
                descriptions.append(f"- {field_id}: {field['description']}")

        return '\n'.join(descriptions)

    # =============================================
    # PROMPT TEMPLATES
    # =============================================

    def _get_plumbing_extraction_prompt_template(self) -> str:
        return """Please analyze this webpage HTML content and extract product specifications for a {product_type} product.

Extract information and return as JSON. Focus on these fields:
{field_descriptions}

Field guidelines for plumbing fixtures:
- sku: Product SKU or model number
- title: Product name/title
- brand_name: Manufacturer or brand name
- installation_type: Topmount, Undermount, Flushmount, Wallmount, etc.
- product_material: Stainless Steel, Granite, Ceramic, Fireclay, etc.
- grade_of_material: 304 Stainless Steel, 316 Marine Grade, etc.
- style: Modern, Traditional, Farmhouse, etc.

IMPORTANT: Only extract the fields listed above. Return ONLY the JSON object."""

    def _get_lighting_extraction_prompt_template(self) -> str:
        return """Please analyze this webpage HTML content and extract product specifications for a {product_type} product.

Extract information and return as JSON. Focus on these fields:
{field_descriptions}

Field guidelines for lighting fixtures:
- sku: Product SKU or model number
- title: Product name/title
- brand_name: Manufacturer or brand name
- light_type: LED, Halogen, Fluorescent, etc.
- wattage: Power consumption in watts
- color_temperature: Warm white, Cool white, etc.
- ip_rating: IP65, IP44, etc. for outdoor/bathroom lights

IMPORTANT: Only extract the fields listed above. Return ONLY the JSON object."""

    def _get_hardware_extraction_prompt_template(self) -> str:
        return """Please analyze this webpage HTML content and extract product specifications for a {product_type} product.

Extract information and return as JSON. Focus on these fields:
{field_descriptions}

Field guidelines for hardware & accessories:
- sku: Product SKU or model number
- title: Product name/title
- brand_name: Manufacturer or brand name
- material: Steel, Aluminum, Plastic, etc.
- size: Dimensions or size specifications
- finish: Chrome, Brushed, Painted, etc.
- compatibility: What systems or products this works with

IMPORTANT: Only extract the fields listed above. Return ONLY the JSON object."""

    def _get_appliances_extraction_prompt_template(self) -> str:
        return """Please analyze this webpage HTML content and extract product specifications for a {product_type} product.

Extract information and return as JSON. Focus on these fields:
{field_descriptions}

Field guidelines for appliances:
- sku: Product SKU or model number
- title: Product name/title
- brand_name: Manufacturer or brand name
- appliance_type: Microwave, Dishwasher, Oven, etc.
- power_rating: Power consumption specifications
- capacity: Volume or capacity specifications
- energy_rating: Energy star rating or efficiency

IMPORTANT: Only extract the fields listed above. Return ONLY the JSON object."""

    def _get_generic_extraction_prompt_template(self) -> str:
        return """Please analyze this webpage HTML content and extract product specifications for a {product_type} product.

Extract information and return as JSON. Focus on these fields:
{field_descriptions}

Field guidelines:
- sku: Product SKU or model number
- title: Product name/title
- brand_name: Manufacturer or brand name
- Extract only factual product specifications
- Do not extract pricing or availability information

IMPORTANT: Only extract the fields listed above. Return ONLY the JSON object."""

    def _get_plumbing_features_prompt_template(self) -> str:
        return """Generate key product features for this {collection_name} based on the provided product information.

Focus on:
- Installation benefits and ease of use
- Material quality and durability
- Design and aesthetic appeal
- Functional features and performance
- Maintenance and care advantages

Format as bullet points, 3-5 key features maximum."""

    def _get_lighting_features_prompt_template(self) -> str:
        return """Generate key product features for this {collection_name} based on the provided product information.

Focus on:
- Light quality and performance
- Energy efficiency
- Design and aesthetic appeal
- Installation and control features
- Durability and weather resistance (if applicable)

Format as bullet points, 3-5 key features maximum."""

    def _get_hardware_features_prompt_template(self) -> str:
        return """Generate key product features for this {collection_name} based on the provided product information.

Focus on:
- Build quality and durability
- Compatibility and versatility
- Ease of installation/use
- Performance and reliability
- Design and finish quality

Format as bullet points, 3-5 key features maximum."""

    def _get_appliances_features_prompt_template(self) -> str:
        return """Generate key product features for this {collection_name} based on the provided product information.

Focus on:
- Performance and efficiency
- Capacity and functionality
- User-friendly features
- Energy saving benefits
- Design and build quality

Format as bullet points, 3-5 key features maximum."""

    def _get_generic_features_prompt_template(self) -> str:
        return """Generate key product features for this {collection_name} based on the provided product information.

Focus on:
- Quality and construction
- Key functional benefits
- Design and aesthetics
- Value and performance
- User benefits

Format as bullet points, 3-5 key features maximum."""

    def _get_plumbing_care_prompt_template(self) -> str:
        return """Generate care and maintenance instructions for this {collection_name}.

Include guidance on:
- Regular cleaning procedures
- Recommended cleaning products
- Preventing damage and wear
- Professional maintenance recommendations
- Warranty care requirements

Keep instructions practical and easy to follow."""

    def _get_lighting_care_prompt_template(self) -> str:
        return """Generate care and maintenance instructions for this {collection_name}.

Include guidance on:
- Safe cleaning procedures
- Bulb replacement (if applicable)
- Electrical safety considerations
- Weather protection (for outdoor fixtures)
- Professional maintenance recommendations

Keep instructions practical and easy to follow."""

    def _get_hardware_care_prompt_template(self) -> str:
        return """Generate care and maintenance instructions for this {collection_name}.

Include guidance on:
- Regular inspection and maintenance
- Cleaning and preservation
- Lubrication (if applicable)
- Storage recommendations
- Replacement indicators

Keep instructions practical and easy to follow."""

    def _get_appliances_care_prompt_template(self) -> str:
        return """Generate care and maintenance instructions for this {collection_name}.

Include guidance on:
- Regular cleaning and maintenance
- Filter replacement (if applicable)
- Energy efficiency tips
- Safety considerations
- Professional service recommendations

Keep instructions practical and easy to follow."""

    def _get_generic_care_prompt_template(self) -> str:
        return """Generate care and maintenance instructions for this {collection_name}.

Include guidance on:
- Regular maintenance procedures
- Cleaning recommendations
- Storage and handling
- Longevity tips
- Safety considerations

Keep instructions practical and easy to follow."""

    # =============================================
    # IMPLEMENTATION STUBS
    # =============================================

    def _generate_collection_config(self, collection_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate collection configuration class and add to collections.py"""
        try:
            collection_name = collection_data['name']
            display_name = collection_data['displayName']
            description = collection_data['description']
            selected_fields = collection_data.get('fields', [])
            template = self._get_template_by_id(collection_data.get('template'))

            # Generate column mappings
            column_mappings = self._generate_column_mappings(selected_fields)

            # Generate the collection class code
            class_name = ''.join(word.capitalize() for word in collection_name.split('_')) + 'Collection'

            collection_class_code = f'''
class {class_name}(CollectionConfig):
    """Configuration for {display_name} collection"""

    def setup_fields(self):
        # Enable AI image extraction and pricing comparison
        self.extract_images = {collection_data.get('enableImages', True)}
        self.pricing_enabled = {collection_data.get('enablePricing', True)}

        self.ai_extraction_fields = {self._format_field_list(selected_fields[:15])}  # Limit for AI extraction

        self.quality_fields = {self._format_field_list(selected_fields)}

        # Pricing fields configuration for caprice feature
        self.pricing_fields = {{
            'our_current_price': 'our_current_price',
            'competitor_name': 'competitor_name',
            'competitor_price': 'competitor_price',
            'price_last_updated': 'price_last_updated'
        }}

        self.column_mapping = {self._format_column_mapping(column_mappings)}

        self.ai_description_field = 'body_html'
        self.ai_features_field = 'features'
        self.ai_care_field = 'care_instructions'
'''

            # Read current collections.py file
            collections_file_path = '/workspaces/Cass-Brothers_PIM/config/collections.py'
            with open(collections_file_path, 'r') as f:
                content = f.read()

            # Find the insertion point (before the Collection Registry)
            registry_start = content.find('# Collection Registry')
            if registry_start == -1:
                registry_start = content.find('COLLECTIONS = {')

            if registry_start == -1:
                return {
                    'success': False,
                    'error': 'Could not find insertion point in collections.py'
                }

            # Insert the new class
            new_content = (
                content[:registry_start] +
                collection_class_code +
                '\n\n' +
                content[registry_start:]
            )

            # Add to COLLECTIONS registry
            registry_entry = f"""    '{collection_name}': {class_name}(
        name='{display_name}',
        description='{description}',
        spreadsheet_id=os.environ.get('{collection_name.upper()}_SPREADSHEET_ID', ''),
        worksheet_name='Raw_Data',
        checkbox_column='selected'
    ),"""

            # Find the end of COLLECTIONS dict and insert before the closing brace
            collections_end = new_content.rfind('}')
            collections_start = new_content.rfind('COLLECTIONS = {')

            if collections_start != -1 and collections_end != -1:
                # Insert the new collection entry
                new_content = (
                    new_content[:collections_end] +
                    registry_entry + '\n' +
                    new_content[collections_end:]
                )

            # Write back to file
            with open(collections_file_path, 'w') as f:
                f.write(new_content)

            logger.info(f"✅ Added {class_name} to collections.py")
            return {'success': True, 'class_name': class_name}

        except Exception as e:
            logger.error(f"❌ Error generating collection config: {e}")
            return {
                'success': False,
                'error': f'Failed to generate collection config: {str(e)}'
            }

    def _create_google_sheets_template(self, collection_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create Google Sheets template with proper headers and formatting"""
        # TODO: Implement Google Sheets template creation
        return {
            'success': False,
            'error': 'Google Sheets creation not yet implemented'
        }

    def _generate_ai_prompts_files(self, collection_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate AI prompt configuration files"""
        # TODO: Implement AI prompts file generation
        return {'success': True}

    def _generate_frontend_templates(self, collection_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate frontend HTML/JS templates"""
        try:
            collection_name = collection_data['name']
            display_name = collection_data['displayName']
            selected_fields = collection_data.get('fields', [])
            template = self._get_template_by_id(collection_data.get('template'))

            # Generate HTML template
            html_result = self._generate_html_template(collection_data, template)
            if not html_result['success']:
                return html_result

            # Generate JavaScript template
            js_result = self._generate_javascript_template(collection_data, template)
            if not js_result['success']:
                return js_result

            logger.info(f"✅ Generated frontend templates for {collection_name}")
            return {
                'success': True,
                'files_created': [
                    f'templates/collection/{collection_name}.html',
                    f'static/js/collection/{collection_name}.js'
                ]
            }

        except Exception as e:
            logger.error(f"❌ Error generating frontend templates: {e}")
            return {
                'success': False,
                'error': f'Failed to generate frontend templates: {str(e)}'
            }

    def _generate_html_template(self, collection_data: Dict[str, Any], template: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate HTML template file"""
        try:
            collection_name = collection_data['name']
            display_name = collection_data['displayName']
            category = collection_data.get('productType', 'general')

            # Generate collection-specific styles based on category
            category_styles = self._generate_category_styles(category, collection_name)

            html_content = f'''{{% extends "collection/base.html" %}}

{{% block extra_styles %}}
/* {display_name}-specific styles */
{category_styles}

/* Modal body with white border spacing */
.modal-body-spaced {{
  background: white;
  padding: 20px !important;
  border-radius: 8px;
  margin: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}}

/* Modal footer with matching white border spacing */
.modal-footer {{
  background: white;
  margin: 0 20px 20px 20px;
  border-radius: 0 0 8px 8px;
  border-top: 1px solid #dee2e6;
}}

/* Collection-specific badges */
.{collection_name}-badge {{
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
}}

/* Specification sections */
.{collection_name}-specs {{
  background: #f8f9fa;
  border-radius: 6px;
  padding: 15px;
  margin-bottom: 15px;
  border: 1px solid #e9ecef;
}}
{{% endblock %}}

{{% block collection_specific_js %}}
<script src="{{{{ url_for('static', filename='js/collection/{collection_name}.js') }}}}"></script>
{{% endblock %}}

{{% block collection_name %}}{{{{ collection.name | title }}}}{{% endblock %}}
{{% block page_title %}}{{{{ collection.name | title }}}} - Product Management{{% endblock %}}
'''

            # Write HTML template file
            html_file_path = f'/workspaces/Cass-Brothers_PIM/templates/collection/{collection_name}.html'
            with open(html_file_path, 'w') as f:
                f.write(html_content)

            logger.info(f"✅ Generated HTML template: {html_file_path}")
            return {'success': True, 'file_path': html_file_path}

        except Exception as e:
            logger.error(f"❌ Error generating HTML template: {e}")
            return {
                'success': False,
                'error': f'Failed to generate HTML template: {str(e)}'
            }

    def _generate_javascript_template(self, collection_data: Dict[str, Any], template: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate JavaScript template file"""
        try:
            collection_name = collection_data['name']
            display_name = collection_data['displayName']
            selected_fields = collection_data.get('fields', [])

            # Generate field mappings
            field_mappings = self._generate_javascript_field_mappings(selected_fields)

            # Generate render function
            render_function = self._generate_render_function(collection_data, template)

            js_content = f'''/**
 * {display_name} Collection JavaScript - Specific functionality for {collection_name} collection
 */

// {display_name}-specific field mappings (extends base mappings)
const {collection_name.upper()}_FIELD_MAPPINGS = {{
{field_mappings}
}};

/**
 * Render {collection_name}-specific product specifications
 */
function renderProductSpecs(product) {{
{render_function}
}}

/**
 * Get {collection_name}-specific validation rules
 */
function getValidationRules() {{
    return {{
        // Add {collection_name}-specific validation rules here
        'required_fields': ['sku', 'title', 'brand_name'],
        'numeric_fields': ['price', 'weight', 'warranty_years'],
        'boolean_fields': []
    }};
}}

/**
 * Format {collection_name}-specific display values
 */
function formatDisplayValue(fieldName, value) {{
    if (!value) return '';

    // Add {collection_name}-specific formatting logic here
    switch(fieldName) {{
        case 'warranty_years':
            return value + ' year' + (value !== 1 ? 's' : '');
        case 'weight':
            return value + 'kg';
        default:
            return value;
    }}
}}

/**
 * Get {collection_name}-specific field categories for organization
 */
function getFieldCategories() {{
    return {{
        'essential': ['sku', 'title', 'brand_name'],
        'specifications': {self._get_spec_fields(selected_fields)},
        'commercial': ['shopify_price', 'shopify_compare_price', 'warranty_years'],
        'content': ['body_html', 'features', 'care_instructions']
    }};
}}

// Export field mappings for use in base.js
window.COLLECTION_FIELD_MAPPINGS = {collection_name.upper()}_FIELD_MAPPINGS;
'''

            # Write JavaScript template file
            js_file_path = f'/workspaces/Cass-Brothers_PIM/static/js/collection/{collection_name}.js'
            with open(js_file_path, 'w') as f:
                f.write(js_content)

            logger.info(f"✅ Generated JavaScript template: {js_file_path}")
            return {'success': True, 'file_path': js_file_path}

        except Exception as e:
            logger.error(f"❌ Error generating JavaScript template: {e}")
            return {
                'success': False,
                'error': f'Failed to generate JavaScript template: {str(e)}'
            }

    def _generate_category_styles(self, category: str, collection_name: str) -> str:
        """Generate CSS styles based on product category"""
        color_schemes = {
            'plumbing': {'primary': '#1976d2', 'secondary': '#e3f2fd', 'accent': '#0d47a1'},
            'lighting': {'primary': '#f57c00', 'secondary': '#fff8e1', 'accent': '#e65100'},
            'hardware': {'primary': '#388e3c', 'secondary': '#e8f5e8', 'accent': '#1b5e20'},
            'appliances': {'primary': '#7b1fa2', 'secondary': '#f3e5f5', 'accent': '#4a148c'},
            'electronics': {'primary': '#303f9f', 'secondary': '#e8eaf6', 'accent': '#1a237e'},
            'general': {'primary': '#546e7a', 'secondary': '#eceff1', 'accent': '#263238'}
        }

        colors = color_schemes.get(category, color_schemes['general'])

        return f'''.{collection_name}-primary {{
    background: {colors['primary']};
    color: white;
}}

.{collection_name}-secondary {{
    background: {colors['secondary']};
    border-radius: 6px;
    padding: 15px;
    margin-bottom: 15px;
    border: 1px solid #e9ecef;
}}

.{collection_name}-accent {{
    background: {colors['accent']};
    color: white;
}}'''

    def _generate_javascript_field_mappings(self, selected_fields: List[str]) -> str:
        """Generate JavaScript field mappings"""
        mappings = []

        # Always include essential fields
        essential_mappings = [
            "'editSku': 'variant_sku'",
            "'editTitle': 'title'",
            "'editVendor': 'vendor'",
            "'editBrandName': 'brand_name'"
        ]
        mappings.extend(essential_mappings)

        # Add selected fields
        for field in selected_fields:
            if field not in ['variant_sku', 'title', 'vendor', 'brand_name']:  # Don't duplicate
                camel_case = 'edit' + ''.join(word.capitalize() for word in field.split('_'))
                mappings.append(f"    '{camel_case}': '{field}'")

        return ',\n    '.join(mappings)

    def _generate_render_function(self, collection_data: Dict[str, Any], template: Optional[Dict[str, Any]]) -> str:
        """Generate the renderProductSpecs function"""
        collection_name = collection_data['name']
        selected_fields = collection_data.get('fields', [])

        # Generate specs based on selected fields
        spec_items = []
        for field in selected_fields[:10]:  # Limit to first 10 for display
            if field in ['sku', 'title', 'brand_name']:  # Skip essential fields
                continue

            display_name = field.replace('_', ' ').title()
            spec_items.append(f'''    if (product.{field}) {{
        specs.push(`<div class="spec-item"><strong>{display_name}:</strong> ${{formatDisplayValue('{field}', product.{field})}}</div>`);
    }}''')

        return f'''    const specs = [];

{chr(10).join(spec_items)}

    return specs.length > 0 ?
        `<div class="{collection_name}-specs">${{specs.join('')}}</div>` :
        '<div class="text-muted">No specifications available</div>';'''

    def _get_spec_fields(self, selected_fields: List[str]) -> str:
        """Get specification fields as JavaScript array"""
        spec_fields = [f for f in selected_fields if f not in ['sku', 'title', 'brand_name', 'body_html', 'features']]
        return str(spec_fields).replace("'", '"')

    def _generate_apps_script(self, collection_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate Google Apps Script code"""
        try:
            collection_name = collection_data['name']
            display_name = collection_data['displayName']
            selected_fields = collection_data.get('fields', [])

            # Generate column mappings for Apps Script
            column_mappings = self._generate_column_mappings(selected_fields)

            # Generate Apps Script code
            apps_script_content = self._generate_apps_script_content(collection_data, column_mappings)

            # Write Apps Script file
            script_file_path = f'/workspaces/Cass-Brothers_PIM/static/{collection_name}_rules.gs'
            with open(script_file_path, 'w') as f:
                f.write(apps_script_content)

            logger.info(f"✅ Generated Apps Script: {script_file_path}")
            return {
                'success': True,
                'file_path': script_file_path,
                'instructions': f'''
To deploy this Apps Script:
1. Open your Google Sheets for {display_name}
2. Go to Extensions > Apps Script
3. Delete the default code
4. Copy and paste the content from {collection_name}_rules.gs
5. Save the script
6. Deploy as Web App (Execute as: Me, Access: Anyone)
7. Copy the Web App URL and add it to your webhook configuration
'''
            }

        except Exception as e:
            logger.error(f"❌ Error generating Apps Script: {e}")
            return {
                'success': False,
                'error': f'Failed to generate Apps Script: {str(e)}'
            }

    def _generate_apps_script_content(self, collection_data: Dict[str, Any], column_mappings: Dict[str, int]) -> str:
        """Generate the Apps Script code content"""
        collection_name = collection_data['name']
        display_name = collection_data['displayName']
        selected_fields = collection_data.get('fields', [])

        # Generate rule type mappings based on selected fields
        rule_mappings = self._generate_rule_mappings(selected_fields, column_mappings)

        # Generate quality score fields
        quality_fields = [f"'{field}'" for field in selected_fields if field not in ['url', 'variant_sku', 'key', 'id']]

        apps_script_code = f'''/**
 * {display_name} Collection Rules - Google Apps Script
 * Auto-generated by Collection Builder
 *
 * This script handles:
 * - Data validation and cleaning
 * - Quality score calculation
 * - Rule-based field population
 * - Webhook responses for PIM system
 */

// Configuration Constants
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const DATA_WORKSHEET = 'Raw_Data';
const WEBHOOK_URL = 'YOUR_WEBHOOK_URL_HERE'; // Replace with your actual webhook URL

// Quality Score Fields for {display_name}
const QUALITY_SCORE_FIELDS = [
{', '.join(quality_fields)}
];

// Column Mappings for {display_name}
const COLUMN_MAPPINGS = {{
{self._format_column_mappings_for_js(column_mappings)}
}};

// Rule Type Mappings - maps column numbers to rule types
const RULE_TYPE_MAPPINGS = {{
{rule_mappings}
}};

// Rule Sheet Names
const RULE_SHEET_MAP = {{
{self._generate_rule_sheet_map(selected_fields)}
}};

/**
 * Main entry point - called when sheet is edited
 */
function onEdit(e) {{
  try {{
    console.log('✅ {display_name} sheet edited, processing...');

    const range = e.range;
    const row = range.getRow();
    const col = range.getColumn();

    // Skip header row
    if (row <= 1) return;

    // Process the edited cell
    processEditedCell(row, col, e.value);

    // Calculate quality score for the row
    calculateQualityScore(row);

  }} catch (error) {{
    console.error('❌ Error in onEdit:', error);
  }}
}}

/**
 * Process individual cell edits
 */
function processEditedCell(row, col, value) {{
  if (!value) return;

  const sheet = SpreadsheetApp.getActiveSheet();

  // Apply rules based on column type
  const ruleType = RULE_TYPE_MAPPINGS[col];
  if (ruleType) {{
    applyRule(sheet, row, col, value, ruleType);
  }}

  // Clean and format the value
  const cleanedValue = cleanFieldValue(value, col);
  if (cleanedValue !== value) {{
    sheet.getRange(row, col).setValue(cleanedValue);
  }}
}}

/**
 * Apply validation rules
 */
function applyRule(sheet, row, col, value, ruleType) {{
  try {{
    const ruleSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RULE_SHEET_MAP[ruleType]);
    if (!ruleSheet) return;

    // Get rules data
    const rules = ruleSheet.getDataRange().getValues();

    // Find matching rule
    for (let i = 1; i < rules.length; i++) {{
      const rule = rules[i];
      if (rule[0] && value.toLowerCase().includes(rule[0].toLowerCase())) {{
        // Apply the rule - update cell with standardized value
        if (rule[1]) {{
          sheet.getRange(row, col).setValue(rule[1]);
        }}
        break;
      }}
    }}

  }} catch (error) {{
    console.error(`❌ Error applying rule for ${{ruleType}}:`, error);
  }}
}}

/**
 * Clean and format field values
 */
function cleanFieldValue(value, col) {{
  if (!value) return value;

  let cleaned = value.toString().trim();

  // Apply column-specific cleaning
  switch(col) {{
{self._generate_cleaning_rules(selected_fields, column_mappings)}
    default:
      // General cleaning
      cleaned = cleaned.replace(/\\s+/g, ' ').trim();
      break;
  }}

  return cleaned;
}}

/**
 * Calculate quality score for a row
 */
function calculateQualityScore(row) {{
  try {{
    const sheet = SpreadsheetApp.getActiveSheet();
    let totalScore = 0;
    let maxScore = 0;

    // Check each quality field
    QUALITY_SCORE_FIELDS.forEach(field => {{
      const col = COLUMN_MAPPINGS[field];
      if (col) {{
        maxScore += 10;
        const value = sheet.getRange(row, col).getValue();
        if (value && value.toString().trim()) {{
          totalScore += 10;
        }}
      }}
    }});

    // Calculate percentage
    const qualityScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

    // Update quality score column (assuming it exists)
    const qualityCol = COLUMN_MAPPINGS['quality_score'];
    if (qualityCol) {{
      sheet.getRange(row, qualityCol).setValue(qualityScore + '%');
    }}

    console.log(`✅ Quality score for row ${{row}}: ${{qualityScore}}%`);

  }} catch (error) {{
    console.error('❌ Error calculating quality score:', error);
  }}
}}

/**
 * Webhook endpoint for PIM system
 */
function doPost(e) {{
  try {{
    const data = JSON.parse(e.postData.contents);
    console.log('📨 Received webhook data:', data);

    // Process the webhook data
    const result = processWebhookData(data);

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  }} catch (error) {{
    console.error('❌ Webhook error:', error);
    return ContentService
      .createTextOutput(JSON.stringify({{error: error.toString()}}))
      .setMimeType(ContentService.MimeType.JSON);
  }}
}}

/**
 * Process webhook data from PIM system
 */
function processWebhookData(data) {{
  // Handle different webhook types
  switch(data.type) {{
    case 'quality_check':
      return runQualityCheck();
    case 'bulk_update':
      return processBulkUpdate(data.updates);
    case 'export_data':
      return exportSheetData();
    default:
      return {{error: 'Unknown webhook type'}};
  }}
}}

/**
 * Run quality check on all rows
 */
function runQualityCheck() {{
  try {{
    const sheet = SpreadsheetApp.getActiveSheet();
    const lastRow = sheet.getLastRow();

    for (let row = 2; row <= lastRow; row++) {{
      calculateQualityScore(row);
    }}

    return {{success: true, message: `Quality check completed for ${{lastRow - 1}} products`}};

  }} catch (error) {{
    return {{success: false, error: error.toString()}};
  }}
}}

/**
 * Export sheet data for PIM system
 */
function exportSheetData() {{
  try {{
    const sheet = SpreadsheetApp.getActiveSheet();
    const data = sheet.getDataRange().getValues();

    return {{
      success: true,
      data: data,
      lastUpdated: new Date().toISOString(),
      collection: '{collection_name}'
    }};

  }} catch (error) {{
    return {{success: false, error: error.toString()}};
  }}
}}

/**
 * Initialize {display_name} collection rules
 */
function initialize{display_name.replace(' ', '')}Rules() {{
  console.log('🚀 Initializing {display_name} collection rules...');

  // Create rule sheets if they don't exist
  createRuleSheets();

  // Set up initial formatting
  formatHeaders();

  console.log('✅ {display_name} rules initialized successfully');
}}

/**
 * Create rule sheets for validation
 */
function createRuleSheets() {{
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  Object.values(RULE_SHEET_MAP).forEach(sheetName => {{
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {{
      sheet = spreadsheet.insertSheet(sheetName);

      // Add headers
      sheet.getRange(1, 1, 1, 3).setValues([['Input Pattern', 'Standardized Output', 'Notes']]);
      sheet.getRange(1, 1, 1, 3).setFontWeight('bold');

      console.log(`📋 Created rule sheet: ${{sheetName}}`);
    }}
  }});
}}

/**
 * Format header row
 */
function formatHeaders() {{
  const sheet = SpreadsheetApp.getActiveSheet();
  const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());

  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4285f4');
  headerRange.setFontColor('white');

  console.log('✅ Headers formatted for {display_name}');
}}

// Auto-run initialization when script is deployed
initialize{display_name.replace(' ', '')}Rules();
'''

        return apps_script_code

    def _generate_rule_mappings(self, selected_fields: List[str], column_mappings: Dict[str, int]) -> str:
        """Generate rule type mappings for Apps Script"""
        mappings = []

        # Map specific fields to rule types
        field_to_rule_type = {
            'material': 'material',
            'product_material': 'material',
            'grade_of_material': 'grade',
            'style': 'style',
            'installation_type': 'installation',
            'valve_type': 'valve_type',
            'finish': 'finish',
            'brand_name': 'brand'
        }

        for field in selected_fields:
            if field in field_to_rule_type and field in column_mappings:
                rule_type = field_to_rule_type[field]
                col_num = column_mappings[field]
                mappings.append(f"  {col_num}: '{rule_type}'")

        return ',\\n'.join(mappings) if mappings else '  // No rule mappings defined'

    def _generate_rule_sheet_map(self, selected_fields: List[str]) -> str:
        """Generate rule sheet mapping"""
        rule_sheets = set()

        field_to_rule_type = {
            'material': 'Material_Rules',
            'product_material': 'Material_Rules',
            'grade_of_material': 'Grade_Rules',
            'style': 'Style_Rules',
            'installation_type': 'Installation_Rules',
            'valve_type': 'Valve_Type_Rules',
            'finish': 'Finish_Rules',
            'brand_name': 'Brand_Rules'
        }

        for field in selected_fields:
            if field in field_to_rule_type:
                rule_type = field.replace('_', '')
                sheet_name = field_to_rule_type[field]
                rule_sheets.add(f"  '{rule_type}': '{sheet_name}'")

        return ',\\n'.join(sorted(rule_sheets)) if rule_sheets else "  'general': 'General_Rules'"

    def _format_column_mappings_for_js(self, column_mappings: Dict[str, int]) -> str:
        """Format column mappings for JavaScript"""
        mappings = []
        for field, col in sorted(column_mappings.items(), key=lambda x: x[1]):
            mappings.append(f"  '{field}': {col}")

        return ',\\n'.join(mappings)

    def _generate_cleaning_rules(self, selected_fields: List[str], column_mappings: Dict[str, int]) -> str:
        """Generate field-specific cleaning rules"""
        rules = []

        for field in selected_fields:
            if field not in column_mappings:
                continue

            col = column_mappings[field]

            if 'price' in field:
                rules.append(f'''    case {col}: // {field}
      cleaned = cleaned.replace(/[^\\d\\.]/g, '');
      if (cleaned && !isNaN(cleaned)) {{
        cleaned = parseFloat(cleaned).toFixed(2);
      }}
      break;''')
            elif 'weight' in field:
                rules.append(f'''    case {col}: // {field}
      cleaned = cleaned.replace(/[^\\d\\.]/g, '');
      break;''')
            elif 'dimension' in field or 'size' in field:
                rules.append(f'''    case {col}: // {field}
      cleaned = cleaned.replace(/\\s*x\\s*/gi, ' x ');
      break;''')

        return '\\n'.join(rules) if rules else '    // No specific cleaning rules'

    def _update_collections_registry(self, collection_data: Dict[str, Any]) -> Dict[str, Any]:
        """Update the collections registry to include new collection"""
        # This is handled in _generate_collection_config
        return {'success': True}

    def _format_field_list(self, fields: List[str]) -> str:
        """Format field list for Python code"""
        formatted_fields = [f"'{field}'" for field in fields]
        return '[\n            ' + ',\n            '.join(formatted_fields) + '\n        ]'

    def _format_column_mapping(self, mappings: Dict[str, int]) -> str:
        """Format column mappings for Python code"""
        formatted_mappings = []
        for field, col in mappings.items():
            formatted_mappings.append(f"'{field}': {col}")

        # Group into chunks for readability
        chunks = [formatted_mappings[i:i+4] for i in range(0, len(formatted_mappings), 4)]

        result = '{\n'
        for chunk in chunks:
            result += '            ' + ',\n            '.join(chunk) + ',\n'
        result = result.rstrip(',\n') + '\n        }'

        return result