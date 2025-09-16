#!/usr/bin/env python3
"""
Simple test script to verify Google Apps Script webhook integration
"""
import os
import sys
sys.path.append('.')

from core.sheets_manager import sheets_manager

def test_webhook():
    print("=== Google Apps Script Webhook Test ===")

    # Check environment variable
    script_id = os.getenv('GOOGLE_APPS_SCRIPT_ID', 'NOT_SET')
    print(f"Environment variable GOOGLE_APPS_SCRIPT_ID: {script_id}")

    # Check settings
    try:
        data_cleaning_enabled = sheets_manager.settings.DATA_CLEANING_ENABLED
        print(f"DATA_CLEANING_ENABLED setting: {data_cleaning_enabled}")
    except Exception as e:
        print(f"Error accessing settings: {e}")
        return

    if not data_cleaning_enabled:
        print("❌ Data cleaning is disabled - webhook won't trigger")
        return

    if script_id == 'NOT_SET' or script_id == 'YOUR_SCRIPT_ID_HERE':
        print(f"❌ Google Apps Script ID not configured properly: {script_id}")
        return

    # Test the webhook trigger
    print(f"\nTesting webhook trigger for sinks row 2...")
    try:
        result = sheets_manager.trigger_data_cleaning('sinks', 2)
        print(f"Webhook result: {result}")
        if result:
            print("✅ Webhook test successful!")
        else:
            print("❌ Webhook test failed!")
    except Exception as e:
        print(f"❌ Webhook test error: {e}")
        import traceback
        print(f"Full traceback:\n{traceback.format_exc()}")

if __name__ == "__main__":
    test_webhook()