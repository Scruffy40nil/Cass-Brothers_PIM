#!/usr/bin/env python3
"""
Check and fix collection configuration for ChatGPT features and care instructions
"""

def check_collection_config():
    """Check if your collection configuration supports ChatGPT fields"""
    print("🔍 Checking collection configuration...")
    
    try:
        from config.collections import get_collection_config
        
        # Check sinks collection
        try:
            config = get_collection_config('sinks')
            print(f"✅ Sinks collection found")
            
            # Check required fields
            required_fields = ['ai_features_field', 'ai_care_field', 'ai_description_field']
            missing_fields = []
            
            for field in required_fields:
                if hasattr(config, field):
                    field_value = getattr(config, field)
                    print(f"✅ {field}: {field_value}")
                else:
                    missing_fields.append(field)
                    print(f"❌ {field}: Missing")
            
            if missing_fields:
                print(f"\n🔧 You need to add these fields to your sinks collection config:")
                print(f"   ai_features_field = 'features'")
                print(f"   ai_care_field = 'care_instructions'")
                print(f"   ai_description_field = 'description'")
                return False
            else:
                print(f"✅ All required fields are configured!")
                return True
                
        except Exception as e:
            print(f"❌ Error loading sinks collection: {e}")
            return False
            
    except ImportError as e:
        print(f"❌ Cannot import collection config: {e}")
        return False

def check_ai_extractor():
    """Check if AI extractor has ChatGPT methods"""
    print("\n🔍 Checking AI extractor...")
    
    try:
        from core.ai_extractor import get_ai_extractor
        
        extractor = get_ai_extractor()
        
        # Check for required methods
        required_methods = [
            'generate_product_content',
            '_generate_with_chatgpt',
            '_make_chatgpt_request'
        ]
        
        missing_methods = []
        for method in required_methods:
            if hasattr(extractor, method):
                print(f"✅ {method}: Available")
            else:
                missing_methods.append(method)
                print(f"❌ {method}: Missing")
        
        if missing_methods:
            print(f"\n🔧 Your AI extractor needs to be updated with ChatGPT methods!")
            return False
        else:
            print(f"✅ AI extractor has all required ChatGPT methods!")
            return True
            
    except Exception as e:
        print(f"❌ Error checking AI extractor: {e}")
        return False

def check_sheets_manager():
    """Check if sheets manager has batch update methods"""
    print("\n🔍 Checking sheets manager...")
    
    try:
        from core.sheets_manager import get_sheets_manager
        
        sheets_manager = get_sheets_manager()
        
        # Check for required methods
        required_methods = [
            'update_multiple_fields',
            'get_empty_content_rows'
        ]
        
        missing_methods = []
        for method in required_methods:
            if hasattr(sheets_manager, method):
                print(f"✅ {method}: Available")
            else:
                missing_methods.append(method)
                print(f"❌ {method}: Missing")
        
        if missing_methods:
            print(f"\n🔧 Your sheets manager needs batch update methods!")
            return False
        else:
            print(f"✅ Sheets manager has all required methods!")
            return True
            
    except Exception as e:
        print(f"❌ Error checking sheets manager: {e}")
        return False

def check_data_processor():
    """Check if data processor has multi-field generation"""
    print("\n🔍 Checking data processor...")
    
    try:
        from core.data_processor import get_data_processor
        
        processor = get_data_processor()
        
        # Check for required methods
        if hasattr(processor, 'generate_product_content'):
            print(f"✅ generate_product_content: Available")
            return True
        else:
            print(f"❌ generate_product_content: Missing")
            print(f"\n🔧 Your data processor needs the new generate_product_content method!")
            return False
            
    except Exception as e:
        print(f"❌ Error checking data processor: {e}")
        return False

def suggest_fixes():
    """Suggest specific fixes based on what's missing"""
    print("\n🔧 TROUBLESHOOTING GUIDE:")
    print("=" * 50)
    
    print("\n1. **Environment Variables Issue:**")
    print("   Add to your .env file:")
    print("   ```")
    print("   CHATGPT_ENABLED=true")
    print("   CHATGPT_MODEL=gpt-4")
    print("   CHATGPT_MAX_TOKENS=1000")
    print("   CHATGPT_TEMPERATURE=0.7")
    print("   ```")
    
    print("\n2. **Collection Configuration Issue:**")
    print("   Your sinks collection config needs:")
    print("   ```python")
    print("   ai_features_field = 'features'")
    print("   ai_care_field = 'care_instructions'")
    print("   ai_description_field = 'description'")
    print("   ```")
    
    print("\n3. **Code Updates Needed:**")
    print("   You need to update these files with the ChatGPT integration:")
    print("   • config/settings.py (add ChatGPT config)")
    print("   • core/ai_extractor.py (add ChatGPT methods)")
    print("   • core/sheets_manager.py (add batch update methods)")
    print("   • core/data_processor.py (add generate_product_content)")
    
    print("\n4. **Google Sheets Column Setup:**")
    print("   Make sure your sinks spreadsheet has these columns:")
    print("   • 'features' column")
    print("   • 'care_instructions' column")
    print("   • 'description' column")
    
    print("\n5. **Testing Order:**")
    print("   Run in this order:")
    print("   1. Update .env file")
    print("   2. Update code files")
    print("   3. Add spreadsheet columns")
    print("   4. Run verification again")
    print("   5. Test with: generate_features_and_care_for_collection('sinks')")

def main():
    """Check everything needed for ChatGPT features and care instructions"""
    print("🔧 Cass Brothers ChatGPT Components Check")
    print("=" * 50)
    
    checks = [
        ("Collection Configuration", check_collection_config),
        ("AI Extractor", check_ai_extractor),
        ("Sheets Manager", check_sheets_manager),
        ("Data Processor", check_data_processor),
    ]
    
    passed = 0
    total = len(checks)
    
    for check_name, check_func in checks:
        print(f"\n📋 Checking: {check_name}")
        try:
            if check_func():
                passed += 1
                print(f"✅ {check_name}: OK")
            else:
                print(f"❌ {check_name}: NEEDS FIXING")
        except Exception as e:
            print(f"❌ {check_name}: ERROR - {e}")
    
    print(f"\n🎉 Components Check: {passed}/{total} ready")
    
    if passed < total:
        suggest_fixes()
        print(f"\n❌ {total - passed} components need fixing before ChatGPT will work")
    else:
        print(f"\n✅ All components ready! ChatGPT features and care instructions should work!")
        print(f"\nTo test, run:")
        print(f"generate_features_and_care_for_collection('sinks')")
    
    return passed == total

if __name__ == "__main__":
    main()