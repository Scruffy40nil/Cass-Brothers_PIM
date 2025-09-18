#!/usr/bin/env python3
"""
Deployment script to copy the fixed flask_app.py code
This script shows the exact changes needed for PythonAnywhere
"""

print("🚀 DEPLOYMENT INSTRUCTIONS FOR PYTHONANYWHERE")
print("=" * 60)
print()

print("1. BACKUP YOUR CURRENT flask_app.py:")
print("   - Go to PythonAnywhere Files tab")
print("   - Copy your current flask_app.py to flask_app_backup.py")
print()

print("2. UPDATE THE COMPETITOR ANALYSIS ENDPOINT:")
print("   - Find this function in your flask_app.py:")
print("   @app.route('/api/<collection_name>/products/<int:row_num>/generate-title-with-competitors', methods=['POST'])")
print("   def api_generate_product_title_with_competitors(collection_name, row_num):")
print()

print("3. REPLACE IT WITH THE FIXED VERSION:")
print("   - Copy the entire function from the code block below")
print("   - Replace your existing function with this version")
print()

print("4. RELOAD YOUR WEB APP:")
print("   - Go to PythonAnywhere Web tab")
print("   - Click 'Reload' button")
print()

print("5. TEST THE FIX:")
print("   - Try the competitor analysis button")
print("   - Should see competitor data instead of '0 tokens'")
print()

print("FIXED CODE TO COPY:")
print("-" * 40)

# Read the current fixed flask_app.py content
with open('/workspaces/Cass-Brothers_PIM/flask_app.py', 'r') as f:
    content = f.read()

# Find the competitor analysis function
start_marker = "@app.route('/api/<collection_name>/products/<int:row_num>/generate-title-with-competitors'"
end_marker = "@app.route('/api/competitor-analysis/health-check'"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    function_code = content[start_idx:end_idx].strip()
    print(function_code)
else:
    print("Could not extract the function - please copy manually from flask_app.py")

print("\n" + "=" * 60)
print("After deployment, you should see:")
print("✅ Real competitor data from Australian retailers")
print("✅ Fallback titles when OpenAI API unavailable")
print("✅ No more 500 errors")
print("✅ Clear status messages")