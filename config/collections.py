"""
Collection Configuration System
Defines different product collections (sinks, taps, lighting, etc.) with their specific configurations
Now includes AI image extraction support and Pricing Comparison (Caprice) functionality
"""
import os

class CollectionConfig:
    """Base class for collection configurations"""

    def __init__(self, name, description, spreadsheet_id, worksheet_name="Raw_Data", checkbox_column=None):
        self.name = name
        self.description = description
        self.spreadsheet_id = spreadsheet_id
        self.worksheet_name = worksheet_name
        self.checkbox_column = checkbox_column
        self.extract_images = False  # Default: no image extraction
        self.pricing_enabled = False  # Default: no pricing comparison
        self.setup_fields()

    def setup_fields(self):
        """Override in subclasses to define collection-specific fields"""
        self.ai_extraction_fields = []
        self.quality_fields = []
        self.column_mapping = {}
        self.ai_description_field = 'body_html'
        self.ai_features_field = 'features'
        self.ai_care_field = 'care_instructions'
        self.pricing_fields = {}  # Pricing field mappings

    def to_dict(self):
        """Convert configuration to dictionary"""
        return {
            'name': self.name,
            'description': self.description,
            'spreadsheet_id': self.spreadsheet_id,
            'worksheet_name': self.worksheet_name,
            'checkbox_column': self.checkbox_column,
            'extract_images': self.extract_images,
            'pricing_enabled': self.pricing_enabled,
            'ai_extraction_fields': self.ai_extraction_fields,
            'quality_fields': self.quality_fields,
            'column_mapping': self.column_mapping,
            'ai_description_field': self.ai_description_field,
            'ai_features_field': self.ai_features_field,
            'ai_care_field': self.ai_care_field,
            'pricing_fields': self.pricing_fields
        }


class SinksCollection(CollectionConfig):
    """Configuration for Sinks & Tubs collection"""

    def setup_fields(self):
        # Enable AI image extraction and pricing comparison for sinks
        self.extract_images = True
        self.pricing_enabled = False
        
        self.ai_extraction_fields = [
            'sku', 'title', 'brand_name', 'vendor', 'installation_type', 'product_material',
            'grade_of_material', 'style', 'is_undermount_sink', 'is_islet_sink',
            'has_overflow', 'holes_number', 'bowls_number', 'range',
            'application_location', 'drain_position', 'shopify_images'  # Added for AI image extraction
        ]

        self.quality_fields = [
            'brand_name', 'installation_type', 'product_material',
            'grade_of_material', 'style', 'warranty_years', 'waste_outlet_dimensions',
            'bowl_width_mm', 'bowl_depth_mm', 'bowl_height_mm', 'is_undermount', 'is_topmount',
            'has_overflow', 'tap_holes_number', 'bowls_number', 'length_mm', 'overall_width_mm',
            'overall_depth_mm', 'min_cabinet_size_mm', 'cutout_size_mm', 'application_location', 'drain_position',
            'body_html', 'features', 'care_instructions', 'faqs', 'shopify_spec_sheet'
        ]

        # Pricing fields configuration for caprice feature
        self.pricing_fields = {
            'our_current_price': 'our_current_price',
            'competitor_name': 'competitor_name', 
            'competitor_price': 'competitor_price',
            'price_last_updated': 'price_last_updated'
        }

        # Pricing sheet configuration for data lookup
        self.pricing_sheet_id = "1Kky3LE5qBgyeA7G-7g2pvfjDjoeRfRg1NQL7XiF8ToU"
        self.pricing_worksheet = "Prices Today"
        self.pricing_lookup_config = {
            'sku_column': 6,                    # Column F (Variant SKU) - lookup key
            'our_price_column': 10,             # Column J (Current Cass Price)
            'competitor_price_column': 25,      # Column Y (buildmat price)
            'competitor_name': 'buildmat',      # Primary competitor name
            'rrp_column': 8,                    # Column H (RRP)
            'lowest_price_column': 12           # Column L (Lowest Price)
        }

        self.column_mapping = {
            # System fields
            'url': 1,                               # A
            'variant_sku': 2,                       # B (maps to editSku)
            'key': 3,                               # C
            'id': 4,                                # D
            'handle': 5,                            # E

            # Basic product info
            'title': 6,                             # F
            'vendor': 7,                            # G
            'colour': 8,                            # H

            # Product specifications
            'installation_type': 9,                 # I
            'product_material': 10,                 # J
            'grade_of_material': 11,               # K
            'style': 12,                           # L
            'warranty_years': 13,                  # M
            'waste_outlet_dimensions': 14,         # N

            # Installation types
            'is_undermount': 15,                   # O
            'is_topmount': 16,                     # P
            'is_flushmount': 17,                   # Q

            # Features
            'has_overflow': 18,                    # R
            'tap_holes_number': 19,                # S
            'bowls_number': 20,                    # T

            # Dimensions
            'length_mm': 21,                       # U
            'overall_width_mm': 22,                # V
            'overall_depth_mm': 23,                # W
            'min_cabinet_size_mm': 24,             # X
            'cutout_size_mm': 25,                  # Y

            # Bowl dimensions
            'bowl_width_mm': 26,                   # Z
            'bowl_depth_mm': 27,                   # AA
            'bowl_height_mm': 28,                  # AB
            'second_bowl_width_mm': 29,            # AC - NEW (conditional)
            'second_bowl_depth_mm': 30,            # AD - NEW (conditional)
            'second_bowl_height_mm': 31,           # AE - NEW (conditional)

            # Brand and location
            'brand_name': 32,                      # AF
            'application_location': 33,            # AG - NEW (multi-select)
            'drain_position': 34,                  # AH - NEW

            # Content
            'body_html': 35,                       # AI
            'features': 36,                        # AJ
            'care_instructions': 37,               # AK - NEW

            # System fields
            'quality_score': 38,                   # AL
            'shopify_status': 39,                  # AM - NEW (form field)

            # E-commerce data
            'shopify_price': 40,                   # AN
            'shopify_compare_price': 41,           # AO
            'shopify_weight': 42,                  # AP
            'shopify_tags': 43,                    # AQ

            # SEO
            'seo_title': 44,                       # AR
            'seo_description': 45,                 # AS

            # Media
            'shopify_images': 46,                  # AT - AI extracted product images (comma-separated)
            'shopify_spec_sheet': 47,              # AU - NEW

            # System fields
            'shopify_collections': 48,             # AV
            'shopify_url': 49,                     # AW
            'last_shopify_sync': 50,               # AX

            # VLOOK fields (informational only - not editable)
            'length_vlook': 51,                    # AY
            'width_vlook': 52,                     # AZ
            'depth_vlook': 53,                     # BA
            'height_vlook': 54,                    # BB
            'ai_installation_type': 55,            # BC
            'scraped_installation_type': 56,       # BD

            # Clean Data column
            'clean_data': 57,                      # BE - 🧹 Clean Data checkbox

            # AI Generated Content
            'faqs': 58,                            # BF - FAQ's

            # Pricing Comparison Fields (Caprice) - These will be populated programmatically
            'our_current_price': 59,               # BG - Our current selling price
            'competitor_name': 60,                 # BH - Main competitor name
            'competitor_price': 61,                # BI - Competitor's price
            'price_last_updated': 62               # BJ - When pricing was last updated
        }

        self.ai_description_field = 'body_html'
        self.ai_features_field = 'features'
        self.ai_care_field = 'care_instructions'

class TapsCollection(CollectionConfig):
    """Configuration for Taps & Faucets collection"""

    def setup_fields(self):
        # Enable AI image extraction and pricing comparison for taps
        self.extract_images = True
        self.pricing_enabled = False

        self.ai_extraction_fields = [
            # Basic product info
            'variant_sku', 'title', 'brand_name', 'vendor', 'range', 'style',
            # Product specifications
            'mounting_type', 'colour_finish', 'material',
            # Handle & Operation
            'handle_type', 'handle_count', 'swivel_spout', 'cartridge_type',
            # Water Performance & WELS (EXCLUDED - auto-populated from WELS reference sheet via lookup, not AI extraction)
            # 'flow_rate', 'wels_rating', 'wels_registration_number',  # DO NOT extract via AI
            # Certifications & Compliance
            'watermark_certification', 'lead_free_compliance',
            # Additional
            'application_location',
            # Images (AI-extracted)
            'shopify_images'
        ]

        # WELS fields that are populated via lookup (not AI extraction)
        # These fields are added to the sheet AFTER AI extraction via WELS lookup
        self.wels_lookup_fields = [
            'flow_rate', 'wels_rating', 'wels_registration_number'
        ]

        self.quality_fields = [
            'brand_name', 'range', 'style', 'mounting_type', 'colour_finish',
            'material', 'warranty_years', 'spout_height_mm', 'spout_reach_mm',
            'handle_type', 'handle_count', 'swivel_spout', 'cartridge_type',
            'flow_rate', 'min_pressure_kpa', 'max_pressure_kpa', 'wels_rating',
            'wels_registration_number', 'watermark_certification', 'lead_free_compliance',
            'application_location', 'body_html', 'features', 'care_instructions',
            'faqs', 'shopify_spec_sheet'
        ]

        # Pricing fields configuration for caprice feature
        self.pricing_fields = {
            'our_current_price': 'our_current_price',
            'competitor_name': 'competitor_name',
            'competitor_price': 'competitor_price',
            'price_last_updated': 'price_last_updated'
        }

        self.column_mapping = {
            # System fields
            'url': 1,                               # A
            'variant_sku': 2,                       # B
            'key': 3,                               # C
            'id': 4,                                # D
            'handle': 5,                            # E

            # Basic product info
            'title': 6,                             # F
            'vendor': 7,                            # G
            'brand_name': 8,                        # H
            'range': 9,                             # I
            'style': 10,                            # J

            # Product specifications
            'mounting_type': 11,                    # K
            'colour_finish': 12,                    # L
            'material': 13,                         # M
            'warranty_years': 14,                   # N

            # Dimensions
            'spout_height_mm': 15,                  # O
            'spout_reach_mm': 16,                   # P

            # Handle & Operation
            'handle_type': 17,                      # Q
            'handle_count': 18,                     # R
            'swivel_spout': 19,                     # S
            'cartridge_type': 20,                   # T

            # Water performance
            'flow_rate': 21,                        # U
            'min_pressure_kpa': 22,                 # V
            'max_pressure_kpa': 23,                 # W

            # Certifications
            'wels_rating': 24,                      # X
            'wels_registration_number': 25,         # Y
            'watermark_certification': 26,          # Z
            'lead_free_compliance': 27,             # AA

            # Additional
            'application_location': 28,             # AB

            # Content
            'body_html': 29,                        # AC
            'features': 30,                         # AD
            'care_instructions': 31,                # AE

            # System fields
            'quality_score': 32,                    # AF
            'shopify_status': 33,                   # AG

            # E-commerce data
            'shopify_price': 34,                    # AH
            'shopify_compare_price': 35,            # AI
            'shopify_weight': 36,                   # AJ

            # SEO
            'shopify_tags': 37,                     # AK
            'seo_title': 38,                        # AL
            'seo_description': 39,                  # AM

            # Media
            'shopify_images': 40,                   # AN - AI extracted product images (comma-separated)
            'shopify_spec_sheet': 41,               # AO

            # System fields
            'shopify_collections': 42,              # AP
            'shopify_url': 43,                      # AQ
            'last_shopify_sync': 44,                # AR

            # VLOOK fields (informational only - not editable)
            'height_vlook': 45,                     # AS
            'reach_vlook': 46,                      # AT
            'flow_rate_vlook': 47,                  # AU
            'ai_tap_type': 48,                      # AV
            'scraped_tap_type': 49,                 # AW

            # Clean Data column
            'clean_data': 50,                       # AX - 🧹 Clean Data checkbox

            # AI Generated Content
            'faqs': 51,                             # AY - FAQ's

            # Pricing Comparison Fields (Caprice)
            'our_current_price': 52,                # AZ - Our current selling price
            'competitor_name': 53,                  # BA - Main competitor name
            'competitor_price': 54,                 # BB - Competitor's price
            'price_last_updated': 55,               # BC - When pricing was last updated
            'rrp_price': 56,                        # BD - RRP
            'sale_price': 57,                       # BE - Sale Price
            'cost_price': 58,                       # BF - Cost Price
            'margin_percentage': 59,                # BG - Margin %

            # Checkbox
            'selected': 60,                         # BH - Checkbox column
        }

        self.ai_description_field = 'body_html'
        self.ai_features_field = 'features'
        self.ai_care_field = 'care_instructions'

class LightingCollection(CollectionConfig):
    """Configuration for Lighting collection"""

    def setup_fields(self):
        # Enable AI image extraction and pricing comparison for lighting
        self.extract_images = True
        self.pricing_enabled = False

        self.ai_extraction_fields = [
            'sku', 'title', 'brand_name', 'vendor', 'light_type', 'bulb_type', 'wattage',
            'color_temperature', 'dimming_compatible', 'ip_rating', 'material',
            'finish', 'mounting_type', 'shopify_images'  # Added for AI image extraction
        ]

        self.quality_fields = [
            'brand_name', 'light_type', 'bulb_type', 'wattage',
            'voltage', 'color_temperature', 'lumens', 'dimming_compatible',
            'ip_rating', 'material', 'finish', 'mounting_type', 'dimensions_mm',
            'weight_kg', 'warranty_years', 'body_html', 'features', 'care_instructions', 'faqs'
        ]

        # Pricing fields configuration for caprice feature
        self.pricing_fields = {
            'our_current_price': 'our_current_price',
            'competitor_name': 'competitor_name',
            'competitor_price': 'competitor_price',
            'price_last_updated': 'price_last_updated'
        }

        self.column_mapping = {
            'url': 1,                               # A
            'sku': 2,                              # B
            'key': 3,                              # C
            'id': 4,                               # D
            'handle': 5,                           # E
            'title': 6,                            # F
            'vendor': 7,                           # G
            'light_type': 8,                       # H
            'bulb_type': 9,                        # I
            'wattage': 10,                         # J
            'voltage': 11,                         # K
            'color_temperature': 12,               # L
            'lumens': 13,                          # M
            'dimming_compatible': 14,              # N
            'ip_rating': 15,                       # O
            'material': 16,                        # P
            'finish': 17,                          # Q
            'mounting_type': 18,                   # R
            'dimensions_mm': 19,                   # S
            'weight_kg': 20,                       # T
            'warranty_years': 21,                  # U
            'brand_name': 22,                      # V
            'body_html': 23,                       # W
            'quality_score': 24,                   # X
            'shopify_images': 25,                  # Y - AI extracted product images (comma-separated)
            'features': 26,                        # Z
            'care_instructions': 27,               # AA
            'shopify_status': 28,                  # AB
            'shopify_price': 29,                   # AC
            'shopify_compare_price': 30,           # AD
            'shopify_weight': 31,                  # AE
            'shopify_tags': 32,                    # AF
            'seo_title': 33,                       # AG
            'seo_description': 34,                 # AH
            'shopify_spec_sheet': 35,              # AI
            'selected': 57,                        # BE - Checkbox column

            # AI Generated Content
            'faqs': 58,                            # BF - AI Generated FAQs

            # Pricing Comparison Fields (Caprice)
            'our_current_price': 59,               # BG - Our current selling price
            'competitor_name': 60,                 # BH - Main competitor name
            'competitor_price': 61,                # BI - Competitor's price
            'price_last_updated': 62               # BJ - When pricing was last updated
        }

        self.ai_description_field = 'body_html'
        self.ai_features_field = 'features'
        self.ai_care_field = 'care_instructions'



class ShowerMixersCollection(CollectionConfig):
    """Configuration for Shower Mixers collection"""

    def setup_fields(self):
        # Enable AI image extraction and pricing comparison
        self.extract_images = True
        self.pricing_enabled = False

        self.ai_extraction_fields = [
            'sku',
            'title',
            'brand_name',
            'vendor',
            'valve_type',
            'flow_rate',
            'pressure_rating',
            'material',
            'finish'
        ]  # Limit for AI extraction

        self.quality_fields = [
            'brand_name',
            'valve_type',
            'flow_rate',
            'pressure_rating',
            'material',
            'finish'
        ]

        # Pricing fields configuration for caprice feature
        self.pricing_fields = {
            'our_current_price': 'our_current_price',
            'competitor_name': 'competitor_name',
            'competitor_price': 'competitor_price',
            'price_last_updated': 'price_last_updated'
        }

        self.column_mapping = {
            'url': 1,
            'variant_sku': 2,
            'key': 3,
            'id': 4,
            'handle': 5,
            'title': 6,
            'vendor': 7,
            'sku': 8,
            'brand_name': 9,
            'valve_type': 10,
            'flow_rate': 11,
            'pressure_rating': 12,
            'material': 13,
            'finish': 14,
            'shopify_price': 15,
            'shopify_compare_price': 16,
            'shopify_weight': 17,
            'shopify_tags': 18,
            'seo_title': 19,
            'seo_description': 20,
            'shopify_images': 21,
            'shopify_collections': 22,
            'shopify_url': 23,
            'last_shopify_sync': 24
        }

        self.ai_description_field = 'body_html'
        self.ai_features_field = 'features'
        self.ai_care_field = 'care_instructions'



class BathroomVanitiesCollection(CollectionConfig):
    """Configuration for Bathroom Vanities collection"""

    def setup_fields(self):
        # Enable AI image extraction and pricing comparison
        self.extract_images = True
        self.pricing_enabled = False

        self.ai_extraction_fields = [
            'sku',
            'title',
            'brand_name',
            'vendor',
            'cabinet_material',
            'basin_material',
            'width_mm',
            'depth_mm',
            'height_mm',
            'door_style',
            'finish',
            'basin_type'
        ]  # Limit for AI extraction

        self.quality_fields = [
            'brand_name',
            'cabinet_material',
            'basin_material',
            'width_mm',
            'depth_mm',
            'height_mm',
            'door_style',
            'finish',
            'basin_type'
        ]

        # Pricing fields configuration for caprice feature
        self.pricing_fields = {
            'our_current_price': 'our_current_price',
            'competitor_name': 'competitor_name',
            'competitor_price': 'competitor_price',
            'price_last_updated': 'price_last_updated'
        }

        self.column_mapping = {
            'url': 1,
            'variant_sku': 2,
            'key': 3,
            'id': 4,
            'handle': 5,
            'title': 6,
            'vendor': 7,
            'sku': 8,
            'brand_name': 9,
            'cabinet_material': 10,
            'basin_material': 11,
            'width_mm': 12,
            'depth_mm': 13,
            'height_mm': 14,
            'door_style': 15,
            'finish': 16,
            'basin_type': 17,
            'shopify_price': 18,
            'shopify_compare_price': 19,
            'shopify_weight': 20,
            'shopify_tags': 21,
            'seo_title': 22,
            'seo_description': 23,
            'shopify_images': 24,
            'shopify_collections': 25,
            'shopify_url': 26,
            'last_shopify_sync': 27
        }

        self.ai_description_field = 'body_html'
        self.ai_features_field = 'features'
        self.ai_care_field = 'care_instructions'



class TestMinimalCollection(CollectionConfig):
    """Configuration for Test Minimal Collection collection"""

    def setup_fields(self):
        # Enable AI image extraction and pricing comparison
        self.extract_images = False
        self.pricing_enabled = False

        self.ai_extraction_fields = [
            'sku',
            'title',
            'brand_name',
            'vendor',
            'dimensions',
            'warranty_years'
        ]  # Limit for AI extraction

        self.quality_fields = [
            'brand_name',
            'dimensions',
            'warranty_years'
        ]

        # Pricing fields configuration for caprice feature
        self.pricing_fields = {
            'our_current_price': 'our_current_price',
            'competitor_name': 'competitor_name',
            'competitor_price': 'competitor_price',
            'price_last_updated': 'price_last_updated'
        }

        self.column_mapping = {
            'url': 1,
            'variant_sku': 2,
            'key': 3,
            'id': 4,
            'handle': 5,
            'title': 6,
            'vendor': 7,
            'sku': 8,
            'brand_name': 9,
            'dimensions': 10,
            'warranty_years': 11,
            'shopify_price': 12,
            'shopify_compare_price': 13,
            'shopify_weight': 14,
            'shopify_tags': 15,
            'seo_title': 16,
            'seo_description': 17,
            'shopify_images': 18,
            'shopify_collections': 19,
            'shopify_url': 20,
            'last_shopify_sync': 21
        }

        self.ai_description_field = 'body_html'
        self.ai_features_field = 'features'
        self.ai_care_field = 'care_instructions'


# Collection Registry
COLLECTIONS = {
    'sinks': SinksCollection(
        name='Sinks & Tubs',
        description='Undermount, topmount, and specialty sinks',
        spreadsheet_id=os.environ.get('SINKS_SPREADSHEET_ID', ''),
        worksheet_name='Raw_Data',
        checkbox_column='selected'  # Uses 'selected' field which maps to column BE
    ),
    'taps': TapsCollection(
        name='Taps & Faucets',
        description='Kitchen and bathroom taps and faucets',
        spreadsheet_id=os.environ.get('TAPS_SPREADSHEET_ID', ''),
        worksheet_name='Raw_Data',
        checkbox_column='selected'
    ),
    'lighting': LightingCollection(
        name='Lighting',
        description='Indoor and outdoor lighting fixtures',
        spreadsheet_id=os.environ.get('LIGHTING_SPREADSHEET_ID', ''),
        worksheet_name='Raw_Data',
        checkbox_column='selected'
    ),
    'shower_mixers': ShowerMixersCollection(
        name='Shower Mixers',
        description='Thermostatic and manual shower mixing valves',
        spreadsheet_id=os.environ.get('SHOWER_MIXERS_SPREADSHEET_ID', ''),
        worksheet_name='Raw_Data',
        checkbox_column='selected'
    ),
    'bathroom_vanities': BathroomVanitiesCollection(
        name='Bathroom Vanities',
        description='Bathroom vanity units and cabinets with integrated basins',
        spreadsheet_id=os.environ.get('BATHROOM_VANITIES_SPREADSHEET_ID', ''),
        worksheet_name='Raw_Data',
        checkbox_column='selected'
    ),
}

def get_collection_config(collection_name):
    """Get configuration for a specific collection"""
    if collection_name not in COLLECTIONS:
        raise ValueError(f"Unknown collection: {collection_name}. Available: {list(COLLECTIONS.keys())}")
    return COLLECTIONS[collection_name]

def get_all_collections():
    """Get all available collections"""
    return COLLECTIONS

def get_pricing_fields_for_collection(collection_name):
    """Get pricing field mappings for a specific collection"""
    config = get_collection_config(collection_name)
    if not config.pricing_enabled:
        return {    'test_minimal': TestMinimalCollection(
        name='Test Minimal Collection',
        description='Testing minimal field selection',
        spreadsheet_id=os.environ.get('TEST_MINIMAL_SPREADSHEET_ID', ''),
        worksheet_name='Raw_Data',
        checkbox_column='selected'
    ),
}
    return config.pricing_fields

def collection_supports_pricing(collection_name):
    """Check if a collection supports pricing comparison"""
    try:
        config = get_collection_config(collection_name)
        return config.pricing_enabled
    except ValueError:
        return False