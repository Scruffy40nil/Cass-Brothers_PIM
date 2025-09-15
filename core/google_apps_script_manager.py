"""
Google Apps Script Integration Manager
Triggers Google Apps Script functions after AI extraction completion
"""
import logging
import requests
import json
from typing import Dict, Any, Optional
from config.settings import get_settings

logger = logging.getLogger(__name__)

class GoogleAppsScriptManager:
    """
    Manages integration with Google Apps Script for post-AI processing
    """

    def __init__(self):
        self.settings = get_settings()
        self.script_configs = self._load_script_configs()

    def _load_script_configs(self) -> Dict[str, Any]:
        """Load Google Apps Script configurations"""
        return {
            'sinks': {
                'script_id': self.settings.GOOGLE_SCRIPTS.get('SINKS_SCRIPT_ID'),
                'function_name': 'cleanSingleRow',
                'trigger_function': 'processAllCheckedRows',
                'webhook_url': self.settings.GOOGLE_SCRIPTS.get('SINKS_WEBHOOK_URL')
            },
            'taps': {
                'script_id': self.settings.GOOGLE_SCRIPTS.get('TAPS_SCRIPT_ID'),
                'function_name': 'cleanSingleRow',
                'trigger_function': 'processAllCheckedRows',
                'webhook_url': self.settings.GOOGLE_SCRIPTS.get('TAPS_WEBHOOK_URL')
            },
            'lighting': {
                'script_id': self.settings.GOOGLE_SCRIPTS.get('LIGHTING_SCRIPT_ID'),
                'function_name': 'cleanSingleRow',
                'trigger_function': 'processAllCheckedRows',
                'webhook_url': self.settings.GOOGLE_SCRIPTS.get('LIGHTING_WEBHOOK_URL')
            }
        }

    async def trigger_post_ai_cleaning(self, collection_name: str, row_number: int, operation_type: str) -> Dict[str, Any]:
        """
        Trigger Google Apps Script cleaning after AI operations

        Args:
            collection_name: The collection being processed
            row_number: The row number that was processed
            operation_type: Type of AI operation completed (description, features, images, etc.)
        """
        try:
            logger.info(f"🔄 Triggering Google Apps Script cleaning for {collection_name} row {row_number} after {operation_type}")

            config = self.script_configs.get(collection_name)
            if not config:
                logger.warning(f"⚠️ No Google Apps Script config found for collection: {collection_name}")
                return {'success': False, 'error': 'No script configuration found'}

            # Method 1: Try webhook approach first (fastest)
            if config.get('webhook_url'):
                result = await self._trigger_via_webhook(config, row_number, operation_type)
                if result['success']:
                    return result

            # Method 2: Try Google Apps Script API
            if config.get('script_id'):
                result = await self._trigger_via_apps_script_api(config, row_number, operation_type)
                if result['success']:
                    return result

            # Method 3: Fallback to checkbox setting (requires manual trigger)
            result = await self._set_checkbox_for_cleaning(collection_name, row_number)
            return result

        except Exception as e:
            logger.error(f"❌ Error triggering Google Apps Script: {e}")
            return {'success': False, 'error': str(e)}

    async def _trigger_via_webhook(self, config: Dict[str, Any], row_number: int, operation_type: str) -> Dict[str, Any]:
        """Trigger Google Apps Script via webhook (fastest method)"""
        try:
            webhook_url = config['webhook_url']

            payload = {
                'row_number': row_number,
                'operation_type': operation_type,
                'trigger_cleaning': True,
                'source': 'PIM_AI_System'
            }

            logger.info(f"📡 Sending webhook to: {webhook_url}")

            response = requests.post(
                webhook_url,
                json=payload,
                timeout=30,
                headers={'Content-Type': 'application/json'}
            )

            if response.status_code == 200:
                result = response.json()
                logger.info(f"✅ Webhook successful: {result}")
                return {'success': True, 'method': 'webhook', 'result': result}
            else:
                logger.warning(f"⚠️ Webhook failed with status {response.status_code}: {response.text}")
                return {'success': False, 'error': f'Webhook failed: {response.status_code}'}

        except Exception as e:
            logger.error(f"❌ Webhook error: {e}")
            return {'success': False, 'error': str(e)}

    async def _trigger_via_apps_script_api(self, config: Dict[str, Any], row_number: int, operation_type: str) -> Dict[str, Any]:
        """Trigger Google Apps Script via Google Apps Script API"""
        try:
            script_id = config['script_id']
            function_name = config['function_name']

            # This requires Google Apps Script API to be enabled and proper authentication
            # For now, we'll implement a basic version

            logger.info(f"📋 Would trigger Google Apps Script API for script {script_id}, function {function_name}")

            # TODO: Implement full Google Apps Script API integration
            # This requires:
            # 1. Google Apps Script API enabled
            # 2. OAuth 2.0 credentials
            # 3. Script deployment as executable

            return {'success': False, 'error': 'Apps Script API not implemented yet'}

        except Exception as e:
            logger.error(f"❌ Apps Script API error: {e}")
            return {'success': False, 'error': str(e)}

    async def _set_checkbox_for_cleaning(self, collection_name: str, row_number: int) -> Dict[str, Any]:
        """
        Set checkbox in Google Sheets to trigger cleaning
        This is a fallback method that requires the Google Sheets integration
        """
        try:
            from core.sheets_manager import get_sheets_manager

            logger.info(f"☑️ Setting checkbox for row {row_number} in {collection_name}")

            sheets_manager = get_sheets_manager()

            # Set checkbox in column BE (57) to trigger cleaning
            result = sheets_manager.update_product_row(
                collection_name=collection_name,
                row_num=row_number,
                data={'checkbox_trigger': True}  # This would need to map to the correct column
            )

            if result:
                logger.info(f"✅ Checkbox set for row {row_number} - Google Apps Script should trigger automatically")
                return {
                    'success': True,
                    'method': 'checkbox',
                    'message': f'Checkbox set for row {row_number} to trigger cleaning'
                }
            else:
                return {'success': False, 'error': 'Failed to set checkbox'}

        except Exception as e:
            logger.error(f"❌ Checkbox setting error: {e}")
            return {'success': False, 'error': str(e)}

    def create_webhook_setup_instructions(self, collection_name: str) -> str:
        """
        Generate instructions for setting up webhook integration
        """
        return f"""
🔧 GOOGLE APPS SCRIPT WEBHOOK SETUP for {collection_name.upper()}

1. Open your Google Apps Script project
2. Add this webhook function to your script:

```javascript
// Webhook endpoint for PIM AI system integration
function doPost(e) {{
  try {{
    const data = JSON.parse(e.postData.contents);

    // Verify request is from PIM system
    if (data.source !== 'PIM_AI_System') {{
      return ContentService
        .createTextOutput(JSON.stringify({{'error': 'Unauthorized'}}))
        .setMimeType(ContentService.MimeType.JSON);
    }}

    const rowNumber = data.row_number;
    const operationType = data.operation_type;

    console.log(`🔄 PIM AI completed ${{operationType}} for row ${{rowNumber}}, starting cleanup...`);

    // Trigger your cleaning function
    if (data.trigger_cleaning && rowNumber) {{
      cleanSingleRow(rowNumber);

      return ContentService
        .createTextOutput(JSON.stringify({{
          'success': true,
          'message': `Row ${{rowNumber}} cleaned after ${{operationType}}`
        }}))
        .setMimeType(ContentService.MimeType.JSON);
    }}

    return ContentService
      .createTextOutput(JSON.stringify({{'success': false, 'error': 'Invalid request'}}))
      .setMimeType(ContentService.MimeType.JSON);

  }} catch (error) {{
    console.error('Webhook error:', error);
    return ContentService
      .createTextOutput(JSON.stringify({{'error': error.toString()}}))
      .setMimeType(ContentService.MimeType.JSON);
  }}
}}
```

3. Deploy as web app:
   - Click "Deploy" → "New deployment"
   - Choose "Web app" as type
   - Set execute as "Me"
   - Set access to "Anyone" (or "Anyone with Google account")
   - Click "Deploy"

4. Copy the webhook URL and add to your .env file:
   GOOGLE_SCRIPTS_SINKS_WEBHOOK_URL=your_webhook_url_here

5. Test the integration by running AI operations in the PIM system

🎯 RESULT: After AI extraction completes, your Google Apps Script will automatically clean the data!
"""

    def get_integration_status(self) -> Dict[str, Any]:
        """Get status of Google Apps Script integration for all collections"""
        status = {}

        for collection_name, config in self.script_configs.items():
            status[collection_name] = {
                'has_webhook': bool(config.get('webhook_url')),
                'has_script_id': bool(config.get('script_id')),
                'webhook_url': config.get('webhook_url', 'Not configured'),
                'script_id': config.get('script_id', 'Not configured'),
                'ready': bool(config.get('webhook_url') or config.get('script_id'))
            }

        return status

# Global instance
google_apps_script_manager = GoogleAppsScriptManager()