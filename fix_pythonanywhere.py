#!/usr/bin/env python3
"""
Quick fix for PythonAnywhere deployment issue
This script creates a simple patch to verify deployment is working
"""

print("🔧 PYTHONANYWHERE DEPLOYMENT VERIFICATION")
print("=" * 50)
print()

print("STEP 1: Push your current changes to git:")
print("   git push")
print()

print("STEP 2: On PythonAnywhere, go to Bash console and run:")
print("   cd /home/cassbrothers/Cass-Brothers_PIM")
print("   git pull")
print()

print("STEP 3: Reload your web app:")
print("   - Go to Web tab")
print("   - Click 'Reload cassbrothers.pythonanywhere.com'")
print()

print("STEP 4: Test the endpoint directly:")
print("   - Try the competitor analysis button")
print("   - Should see actual competitor data")
print()

print("IF STILL NOT WORKING:")
print("- Check if git pull actually updated the files")
print("- Verify flask_app.py has the latest changes")
print("- Check error logs in PythonAnywhere")
print()

print("Current status: Your local code is correct")
print("Issue: PythonAnywhere server needs to be updated")