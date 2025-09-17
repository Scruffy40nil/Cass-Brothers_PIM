"""
Application Settings and Configuration
Centralizes all environment variables and app-wide settings
Enhanced with Shopify integration support and ChatGPT for features/care instructions
"""
import os
import json
from pathlib import Path

class Settings:
    """Main application settings with Shopify integration and ChatGPT support"""

    def __init__(self):
        self.load_environment_variables()
        self.setup_shopify_config()
        self.setup_logging_config()
        self.setup_flask_config()
        self.setup_api_config()
        self.setup_chatgpt_config()
        self.setup_google_scripts_config()
        self.setup_feature_flags()

    def load_environment_variables(self):
        """Load all environment variables"""
        # Core API Keys
        self.OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
        self.GOOGLE_CREDENTIALS_JSON = os.environ.get('GOOGLE_CREDENTIALS_JSON', '')

        # Flask Configuration
        self.FLASK_SECRET_KEY = os.environ.get('FLASK_SECRET_KEY', 'dev-key-change-in-production')
        self.FLASK_ENV = os.environ.get('FLASK_ENV', 'production')
        self.DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'

        # Google Spreadsheet IDs
        self.SINKS_SPREADSHEET_ID = os.environ.get('SINKS_SPREADSHEET_ID', '')
        self.TAPS_SPREADSHEET_ID = os.environ.get('TAPS_SPREADSHEET_ID', '')
        self.LIGHTING_SPREADSHEET_ID = os.environ.get('LIGHTING_SPREADSHEET_ID', '')

        # Apps Script URLs
        self.SINKS_APPS_SCRIPT_URL = os.environ.get('SINKS_APPS_SCRIPT_URL',
            'https://script.google.com/macros/s/AKfycbzT0wG7As2ETfwzMgSWRHcH1-6gsbQUK6XU-heHH3Q-I_QBEQPX3mMIBBTv92mR0QCI/exec')
        self.TAPS_APPS_SCRIPT_URL = os.environ.get('TAPS_APPS_SCRIPT_URL', '')
        self.LIGHTING_APPS_SCRIPT_URL = os.environ.get('LIGHTING_APPS_SCRIPT_URL', '')

        # Performance Settings
        self.REQUEST_TIMEOUT = int(os.environ.get('REQUEST_TIMEOUT', '180'))
        self.AI_REQUEST_TIMEOUT = int(os.environ.get('AI_REQUEST_TIMEOUT', '120'))
        self.BATCH_SIZE = int(os.environ.get('BATCH_SIZE', '10'))

        # Rate Limiting - Now uses parallel processing so delay is less critical
        # Reduced default delay from 2.0s to 0.5s for faster processing with parallel workers
        self.AI_DELAY_BETWEEN_REQUESTS = float(os.environ.get('AI_DELAY_BETWEEN_REQUESTS', '0.5'))
        self.SHEETS_DELAY_BETWEEN_REQUESTS = float(os.environ.get('SHEETS_DELAY_BETWEEN_REQUESTS', '0.5'))

        # ChatGPT-specific environment variables
        self.CHATGPT_MODEL = os.environ.get('CHATGPT_MODEL', 'gpt-4')
        self.CHATGPT_MAX_TOKENS = int(os.environ.get('CHATGPT_MAX_TOKENS', '1000'))
        self.CHATGPT_TEMPERATURE = float(os.environ.get('CHATGPT_TEMPERATURE', '0.7'))
        self.CHATGPT_MIN_REQUEST_INTERVAL = float(os.environ.get('CHATGPT_MIN_REQUEST_INTERVAL', '1.0'))
        self.CHATGPT_ENABLED = os.environ.get('CHATGPT_ENABLED', 'true').lower() == 'true'

    def setup_shopify_config(self):
        """Setup Shopify integration configuration"""
        self.SHOPIFY_CONFIG = {
            # Core Shopify Settings
            'ENABLED': os.environ.get('SHOPIFY_ENABLED', 'false').lower() == 'true',
            'SHOP_URL': os.environ.get('SHOPIFY_SHOP_URL', ''),
            'ACCESS_TOKEN': os.environ.get('SHOPIFY_ACCESS_TOKEN', ''),
            'API_VERSION': os.environ.get('SHOPIFY_API_VERSION', '2024-01'),

            # Product Settings
            'DEFAULT_STATUS': os.environ.get('SHOPIFY_DEFAULT_STATUS', 'draft'),
            'DEFAULT_VENDOR': os.environ.get('SHOPIFY_DEFAULT_VENDOR', 'Cass Brothers'),

            # Column Mapping
            'ID_COLUMN': os.environ.get('SHOPIFY_ID_COLUMN', 'Column D'),
            'VARIANT_ID_COLUMN': os.environ.get('SHOPIFY_VARIANT_ID_COLUMN', 'shopify_variant_id'),

            # Image Settings
            'IMAGE_SYNC_ENABLED': os.environ.get('SHOPIFY_IMAGE_SYNC_ENABLED', 'true').lower() == 'true',
            'IMAGE_ALT_TEXT': os.environ.get('SHOPIFY_IMAGE_ALT_TEXT', 'Product Image'),
            'MAX_IMAGES': int(os.environ.get('SHOPIFY_MAX_IMAGES', '10')),

            # Rate Limiting & Performance
            'RATE_LIMIT_DELAY': float(os.environ.get('SHOPIFY_RATE_LIMIT_DELAY', '0.5')),
            'BULK_OPERATION_DELAY': float(os.environ.get('SHOPIFY_BULK_OPERATION_DELAY', '1.0')),
            'REQUEST_TIMEOUT': int(os.environ.get('SHOPIFY_REQUEST_TIMEOUT', '30')),

            # Collection Mappings (optional)
            'COLLECTION_MAPPINGS': {
                'sinks': os.environ.get('SHOPIFY_COLLECTION_SINKS', None),
                'taps': os.environ.get('SHOPIFY_COLLECTION_TAPS', None),
                'lighting': os.environ.get('SHOPIFY_COLLECTION_LIGHTING', None),
            },

            # Webhook Settings (optional)
            'WEBHOOK_SECRET': os.environ.get('SHOPIFY_WEBHOOK_SECRET', ''),
            'WEBHOOK_ENABLED': os.environ.get('SHOPIFY_WEBHOOK_ENABLED', 'false').lower() == 'true',

            # Advanced Settings
            'AUTO_SYNC_IMAGES': os.environ.get('SHOPIFY_AUTO_SYNC_IMAGES', 'false').lower() == 'true',
            'AUTO_SET_ACTIVE': os.environ.get('SHOPIFY_AUTO_SET_ACTIVE', 'false').lower() == 'true',
            'SYNC_INVENTORY': os.environ.get('SHOPIFY_SYNC_INVENTORY', 'true').lower() == 'true',
        }

    def setup_logging_config(self):
        """Setup logging configuration"""
        self.LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')
        self.LOG_FILE = os.environ.get('LOG_FILE', '/home/cassbrothers/mysite/logs/app.log')

        # Create logs directory if it doesn't exist
        log_dir = Path(self.LOG_FILE).parent
        log_dir.mkdir(exist_ok=True)

        self.LOGGING_CONFIG = {
            'version': 1,
            'disable_existing_loggers': False,
            'formatters': {
                'standard': {
                    'format': '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
                },
                'detailed': {
                    'format': '%(asctime)s - %(name)s - %(levelname)s - %(module)s - %(funcName)s - %(message)s'
                }
            },
            'handlers': {
                'console': {
                    'class': 'logging.StreamHandler',
                    'level': self.LOG_LEVEL,
                    'formatter': 'standard',
                    'stream': 'ext://sys.stdout'
                },
                'file': {
                    'class': 'logging.FileHandler',
                    'level': self.LOG_LEVEL,
                    'formatter': 'detailed',
                    'filename': self.LOG_FILE,
                    'mode': 'a',
                }
            },
            'loggers': {
                '': {  # root logger
                    'handlers': ['console', 'file'],
                    'level': self.LOG_LEVEL,
                    'propagate': False
                }
            }
        }

    def setup_flask_config(self):
        """Setup Flask-specific configuration"""
        self.FLASK_CONFIG = {
            'SECRET_KEY': self.FLASK_SECRET_KEY,
            'DEBUG': self.DEBUG,
            'TESTING': False,
            'MAX_CONTENT_LENGTH': 16 * 1024 * 1024,  # 16MB max file upload
            'JSON_SORT_KEYS': False,
            'JSONIFY_PRETTYPRINT_REGULAR': True if self.DEBUG else False
        }

        # Socket.IO Configuration
        self.SOCKETIO_CONFIG = {
            'async_mode': "threading",
            'cors_allowed_origins': "*",
            'transports': ["polling"],
            'logger': self.DEBUG,
            'engineio_logger': self.DEBUG,
            'ping_timeout': 60,
            'ping_interval': 25,
            'manage_session': False,
            'cookie': False,
            'allow_upgrades': False  # Prevent WebSocket upgrade attempts on PythonAnywhere
        }

    def setup_api_config(self):
        """Setup API-related configuration"""
        self.API_CONFIG = {
            'OPENAI_MODEL': os.environ.get('OPENAI_MODEL', 'gpt-4o'),
            'OPENAI_DESCRIPTION_MODEL': os.environ.get('OPENAI_DESCRIPTION_MODEL', 'gpt-3.5-turbo'),
            'OPENAI_MAX_TOKENS': int(os.environ.get('OPENAI_MAX_TOKENS', '4000')),
            'OPENAI_TEMPERATURE': float(os.environ.get('OPENAI_TEMPERATURE', '0.1')),
            'OPENAI_DESCRIPTION_MAX_TOKENS': int(os.environ.get('OPENAI_DESCRIPTION_MAX_TOKENS', '200')),
            'OPENAI_DESCRIPTION_TEMPERATURE': float(os.environ.get('OPENAI_DESCRIPTION_TEMPERATURE', '0.7')),
            'HTML_MAX_LENGTH': int(os.environ.get('HTML_MAX_LENGTH', '50000')),
            'USER_AGENT': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }

    def setup_chatgpt_config(self):
        """Setup ChatGPT-specific configuration for features and care instructions"""
        self.CHATGPT_CONFIG = {
            # Core ChatGPT Settings
            'ENABLED': self.CHATGPT_ENABLED,
            'MODEL': self.CHATGPT_MODEL,
            'MAX_TOKENS': self.CHATGPT_MAX_TOKENS,
            'TEMPERATURE': self.CHATGPT_TEMPERATURE,
            'MIN_REQUEST_INTERVAL': self.CHATGPT_MIN_REQUEST_INTERVAL,
            
            # Request Settings
            'REQUEST_TIMEOUT': int(os.environ.get('CHATGPT_REQUEST_TIMEOUT', '60')),
            'MAX_RETRIES': int(os.environ.get('CHATGPT_MAX_RETRIES', '3')),
            'RETRY_DELAY': float(os.environ.get('CHATGPT_RETRY_DELAY', '1.0')),
            
            # Content Settings
            'FEATURES_ENABLED': os.environ.get('CHATGPT_FEATURES_ENABLED', 'true').lower() == 'true',
            'CARE_INSTRUCTIONS_ENABLED': os.environ.get('CHATGPT_CARE_ENABLED', 'true').lower() == 'true',
            'USE_URL_CONTENT': os.environ.get('CHATGPT_USE_URL_CONTENT', 'true').lower() == 'true',
            
            # Rate Limiting
            'REQUESTS_PER_MINUTE': int(os.environ.get('CHATGPT_REQUESTS_PER_MINUTE', '20')),
            'DAILY_REQUEST_LIMIT': int(os.environ.get('CHATGPT_DAILY_LIMIT', '1000')),
            
            # Collection-specific settings
            'COLLECTION_MODELS': {
                'sinks': os.environ.get('CHATGPT_SINKS_MODEL', self.CHATGPT_MODEL),
                'taps': os.environ.get('CHATGPT_TAPS_MODEL', self.CHATGPT_MODEL),
                'lighting': os.environ.get('CHATGPT_LIGHTING_MODEL', self.CHATGPT_MODEL),
            },
            
            # Quality settings
            'MIN_FEATURES_COUNT': int(os.environ.get('CHATGPT_MIN_FEATURES', '4')),
            'MAX_FEATURES_COUNT': int(os.environ.get('CHATGPT_MAX_FEATURES', '6')),
            'MIN_CARE_INSTRUCTIONS': int(os.environ.get('CHATGPT_MIN_CARE_STEPS', '3')),
        }

    def setup_google_scripts_config(self):
        """Setup Google Apps Script integration configuration"""
        self.GOOGLE_SCRIPTS = {
            'SINKS_SCRIPT_ID': os.getenv('GOOGLE_SCRIPTS_SINKS_SCRIPT_ID'),
            'TAPS_SCRIPT_ID': os.getenv('GOOGLE_SCRIPTS_TAPS_SCRIPT_ID'),
            'LIGHTING_SCRIPT_ID': os.getenv('GOOGLE_SCRIPTS_LIGHTING_SCRIPT_ID'),
            'SINKS_WEBHOOK_URL': os.getenv('GOOGLE_SCRIPTS_SINKS_WEBHOOK_URL'),
            'TAPS_WEBHOOK_URL': os.getenv('GOOGLE_SCRIPTS_TAPS_WEBHOOK_URL'),
            'LIGHTING_WEBHOOK_URL': os.getenv('GOOGLE_SCRIPTS_LIGHTING_WEBHOOK_URL'),
            'ENABLED': os.getenv('GOOGLE_SCRIPTS_ENABLED', 'false').lower() == 'true',
            'AUTO_TRIGGER': os.getenv('GOOGLE_SCRIPTS_AUTO_TRIGGER', 'true').lower() == 'true'
        }

    def setup_feature_flags(self):
        """Setup feature flags for enabling/disabling functionality"""
        self.FEATURES = {
            # Existing Features
            'AI_EXTRACTION_ENABLED': os.environ.get('AI_EXTRACTION_ENABLED', 'True').lower() == 'true',
            'AI_DESCRIPTIONS_ENABLED': os.environ.get('AI_DESCRIPTIONS_ENABLED', 'True').lower() == 'true',
            'BULK_OPERATIONS_ENABLED': os.environ.get('BULK_OPERATIONS_ENABLED', 'True').lower() == 'true',
            'DATA_CLEANING_ENABLED': os.environ.get('DATA_CLEANING_ENABLED', 'True').lower() == 'true',
            'QUALITY_SCORING_ENABLED': os.environ.get('QUALITY_SCORING_ENABLED', 'True').lower() == 'true',
            'SOCKETIO_ENABLED': os.environ.get('SOCKETIO_ENABLED', 'False').lower() == 'true',
            'DEBUG_MODE': self.DEBUG,
            'CACHING_ENABLED': os.environ.get('CACHING_ENABLED', 'False').lower() == 'true',
            'MONITORING_ENABLED': os.environ.get('MONITORING_ENABLED', 'False').lower() == 'true',

            # Shopify Features
            'SHOPIFY_INTEGRATION_ENABLED': self.SHOPIFY_CONFIG['ENABLED'],
            'SHOPIFY_IMAGE_SYNC_ENABLED': self.SHOPIFY_CONFIG['IMAGE_SYNC_ENABLED'],
            'SHOPIFY_WEBHOOK_ENABLED': self.SHOPIFY_CONFIG['WEBHOOK_ENABLED'],
            'SHOPIFY_AUTO_SYNC_ENABLED': self.SHOPIFY_CONFIG['AUTO_SYNC_IMAGES'],
            
            # ChatGPT Features
            'CHATGPT_ENABLED': self.CHATGPT_CONFIG['ENABLED'],
            'CHATGPT_FEATURES_ENABLED': self.CHATGPT_CONFIG['FEATURES_ENABLED'],
            'CHATGPT_CARE_ENABLED': self.CHATGPT_CONFIG['CARE_INSTRUCTIONS_ENABLED'],
            'CHATGPT_URL_CONTENT_ENABLED': self.CHATGPT_CONFIG['USE_URL_CONTENT'],
        }

    def get_apps_script_url(self, collection_name):
        """Get Apps Script URL for a specific collection"""
        url_mapping = {
            'sinks': self.SINKS_APPS_SCRIPT_URL,
            'taps': self.TAPS_APPS_SCRIPT_URL,
            'lighting': self.LIGHTING_APPS_SCRIPT_URL
        }
        return url_mapping.get(collection_name, '')

    def get_spreadsheet_id(self, collection_name):
        """Get spreadsheet ID for a specific collection"""
        id_mapping = {
            'sinks': self.SINKS_SPREADSHEET_ID,
            'taps': self.TAPS_SPREADSHEET_ID,
            'lighting': self.LIGHTING_SPREADSHEET_ID
        }
        return id_mapping.get(collection_name, '')

    def get_shopify_base_url(self):
        """Get the base Shopify API URL"""
        if not self.SHOPIFY_CONFIG['SHOP_URL']:
            return ''

        shop_url = self.SHOPIFY_CONFIG['SHOP_URL']
        if not shop_url.startswith('https://'):
            shop_url = f"https://{shop_url}"
        if not shop_url.endswith('.myshopify.com'):
            if '.myshopify.com' not in shop_url:
                shop_url = f"{shop_url}.myshopify.com"

        return f"{shop_url}/admin/api/{self.SHOPIFY_CONFIG['API_VERSION']}"

    def get_shopify_headers(self):
        """Get headers for Shopify API requests"""
        return {
            'X-Shopify-Access-Token': self.SHOPIFY_CONFIG['ACCESS_TOKEN'],
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }

    def get_shopify_collection_id(self, collection_name):
        """Get Shopify collection ID for a given collection name"""
        return self.SHOPIFY_CONFIG['COLLECTION_MAPPINGS'].get(collection_name)

    def is_shopify_configured(self):
        """Check if Shopify is properly configured"""
        if not self.SHOPIFY_CONFIG['ENABLED']:
            return False, "Shopify integration is disabled"

        if not self.SHOPIFY_CONFIG['SHOP_URL']:
            return False, "SHOPIFY_SHOP_URL not configured"

        if not self.SHOPIFY_CONFIG['ACCESS_TOKEN']:
            return False, "SHOPIFY_ACCESS_TOKEN not configured"

        return True, "Shopify configuration is valid"

    def is_chatgpt_configured(self):
        """Check if ChatGPT is properly configured"""
        if not self.CHATGPT_CONFIG['ENABLED']:
            return False, "ChatGPT integration is disabled"

        if not self.OPENAI_API_KEY:
            return False, "OPENAI_API_KEY not configured"

        valid_models = ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo', 'gpt-4o']
        if self.CHATGPT_CONFIG['MODEL'] not in valid_models:
            return False, f"Invalid ChatGPT model: {self.CHATGPT_CONFIG['MODEL']}"

        return True, "ChatGPT configuration is valid"

    def get_chatgpt_model_for_collection(self, collection_name):
        """Get the ChatGPT model to use for a specific collection"""
        return self.CHATGPT_CONFIG['COLLECTION_MODELS'].get(
            collection_name, 
            self.CHATGPT_CONFIG['MODEL']
        )

    def get_chatgpt_headers(self):
        """Get headers for ChatGPT API requests"""
        return {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.OPENAI_API_KEY}',
        }

    def validate_required_settings(self):
        """Validate that required settings are present"""
        required_settings = [
            ('GOOGLE_CREDENTIALS_JSON', self.GOOGLE_CREDENTIALS_JSON),
            ('OPENAI_API_KEY', self.OPENAI_API_KEY),
            ('SINKS_SPREADSHEET_ID', self.SINKS_SPREADSHEET_ID)
        ]

        missing_settings = []
        warnings = []

        # Check required settings
        for setting_name, setting_value in required_settings:
            if not setting_value:
                missing_settings.append(setting_name)

        # Check Shopify settings if enabled
        if self.SHOPIFY_CONFIG['ENABLED']:
            shopify_required = [
                ('SHOPIFY_SHOP_URL', self.SHOPIFY_CONFIG['SHOP_URL']),
                ('SHOPIFY_ACCESS_TOKEN', self.SHOPIFY_CONFIG['ACCESS_TOKEN'])
            ]

            for setting_name, setting_value in shopify_required:
                if not setting_value:
                    missing_settings.append(setting_name)

        # Check ChatGPT settings if enabled
        if self.CHATGPT_CONFIG['ENABLED']:
            if not self.OPENAI_API_KEY:
                warnings.append("ChatGPT enabled but OPENAI_API_KEY already checked in required settings")

        # Build validation message
        if missing_settings:
            return False, f"Missing required environment variables: {', '.join(missing_settings)}"

        # Build status message with optional features
        status_parts = ["All required settings are present"]

        if self.SHOPIFY_CONFIG['ENABLED']:
            status_parts.append("Shopify integration enabled")

        if self.CHATGPT_CONFIG['ENABLED']:
            status_parts.append("ChatGPT integration enabled")

        if self.FEATURES['AI_EXTRACTION_ENABLED']:
            status_parts.append("AI extraction enabled")

        if self.FEATURES['DATA_CLEANING_ENABLED']:
            status_parts.append("Data cleaning enabled")

        return True, "; ".join(status_parts)

    def get_environment_status(self):
        """Get comprehensive environment status"""
        status = {
            'core_configured': bool(self.GOOGLE_CREDENTIALS_JSON and self.OPENAI_API_KEY),
            'google_sheets_configured': bool(self.GOOGLE_CREDENTIALS_JSON),
            'openai_configured': bool(self.OPENAI_API_KEY),
            'shopify_configured': self.SHOPIFY_CONFIG['ENABLED'] and bool(
                self.SHOPIFY_CONFIG['SHOP_URL'] and self.SHOPIFY_CONFIG['ACCESS_TOKEN']
            ),
            'shopify_enabled': self.SHOPIFY_CONFIG['ENABLED'],
            'chatgpt_configured': self.CHATGPT_CONFIG['ENABLED'] and bool(self.OPENAI_API_KEY),
            'chatgpt_enabled': self.CHATGPT_CONFIG['ENABLED'],
            'collections': {
                'sinks': bool(self.SINKS_SPREADSHEET_ID),
                'taps': bool(self.TAPS_SPREADSHEET_ID),
                'lighting': bool(self.LIGHTING_SPREADSHEET_ID)
            },
            'features_enabled': {
                key: value for key, value in self.FEATURES.items() if value
            },
            'chatgpt_features': {
                'features_generation': self.CHATGPT_CONFIG['FEATURES_ENABLED'],
                'care_instructions': self.CHATGPT_CONFIG['CARE_INSTRUCTIONS_ENABLED'],
                'url_content_usage': self.CHATGPT_CONFIG['USE_URL_CONTENT'],
                'model': self.CHATGPT_CONFIG['MODEL']
            }
        }
        return status

    def refresh_shopify_config(self):
        """Refresh Shopify configuration from environment variables"""
        from dotenv import load_dotenv

        # Force reload environment variables
        load_dotenv(override=True)

        # Re-read Shopify settings
        self.SHOPIFY_CONFIG.update({
            'ENABLED': os.environ.get('SHOPIFY_ENABLED', 'false').lower() == 'true',
            'SHOP_URL': os.environ.get('SHOPIFY_SHOP_URL', ''),
            'ACCESS_TOKEN': os.environ.get('SHOPIFY_ACCESS_TOKEN', ''),
            'API_VERSION': os.environ.get('SHOPIFY_API_VERSION', '2024-01'),
            'DEFAULT_STATUS': os.environ.get('SHOPIFY_DEFAULT_STATUS', 'draft'),
            'DEFAULT_VENDOR': os.environ.get('SHOPIFY_DEFAULT_VENDOR', 'Cass Brothers'),
        })

        # Update feature flags
        self.FEATURES['SHOPIFY_INTEGRATION_ENABLED'] = self.SHOPIFY_CONFIG['ENABLED']

        return self.SHOPIFY_CONFIG['ENABLED']

    def refresh_chatgpt_config(self):
        """Refresh ChatGPT configuration from environment variables"""
        from dotenv import load_dotenv

        # Force reload environment variables
        load_dotenv(override=True)

        # Re-read ChatGPT settings
        self.CHATGPT_CONFIG.update({
            'ENABLED': os.environ.get('CHATGPT_ENABLED', 'true').lower() == 'true',
            'MODEL': os.environ.get('CHATGPT_MODEL', 'gpt-4'),
            'MAX_TOKENS': int(os.environ.get('CHATGPT_MAX_TOKENS', '1000')),
            'TEMPERATURE': float(os.environ.get('CHATGPT_TEMPERATURE', '0.7')),
            'FEATURES_ENABLED': os.environ.get('CHATGPT_FEATURES_ENABLED', 'true').lower() == 'true',
            'CARE_INSTRUCTIONS_ENABLED': os.environ.get('CHATGPT_CARE_ENABLED', 'true').lower() == 'true',
        })

        # Update feature flags
        self.FEATURES['CHATGPT_ENABLED'] = self.CHATGPT_CONFIG['ENABLED']
        self.FEATURES['CHATGPT_FEATURES_ENABLED'] = self.CHATGPT_CONFIG['FEATURES_ENABLED']
        self.FEATURES['CHATGPT_CARE_ENABLED'] = self.CHATGPT_CONFIG['CARE_INSTRUCTIONS_ENABLED']

        return self.CHATGPT_CONFIG['ENABLED']

    def get_cost_estimate(self, num_products, model=None):
        """Estimate the cost of ChatGPT generation"""
        if model is None:
            model = self.CHATGPT_CONFIG['MODEL']

        # Average tokens per request for sinks/taps/lighting (input + output)
        avg_tokens_per_product = 900

        # Pricing per 1K tokens (as of 2024)
        pricing = {
            "gpt-4": 0.045,  # Average of input/output pricing
            "gpt-4o": 0.035,  # Slightly cheaper
            "gpt-3.5-turbo": 0.002
        }

        cost_per_1k = pricing.get(model, 0.045)
        total_tokens = num_products * avg_tokens_per_product
        estimated_cost = (total_tokens / 1000) * cost_per_1k

        return {
            'total_cost': round(estimated_cost, 3),
            'cost_per_product': round(estimated_cost / num_products, 4) if num_products > 0 else 0,
            'model': model,
            'estimated_tokens': total_tokens
        }

# Global settings instance
settings = Settings()

def get_settings():
    """Get the global settings instance"""
    return settings

def validate_environment():
    """Validate the current environment setup"""
    return settings.validate_required_settings()

def get_chatgpt_status():
    """Get ChatGPT configuration status"""
    settings_instance = get_settings()
    is_configured, message = settings_instance.is_chatgpt_configured()
    
    return {
        'configured': is_configured,
        'message': message,
        'enabled': settings_instance.CHATGPT_CONFIG['ENABLED'],
        'model': settings_instance.CHATGPT_CONFIG['MODEL'],
        'features_enabled': settings_instance.CHATGPT_CONFIG['FEATURES_ENABLED'],
        'care_enabled': settings_instance.CHATGPT_CONFIG['CARE_INSTRUCTIONS_ENABLED'],
    }