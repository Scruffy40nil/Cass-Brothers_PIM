#!/usr/bin/env python3
"""
Script to check PythonAnywhere logs via SFTP/SCP
Run this on PythonAnywhere console or use to SSH into the server
"""

import subprocess
import sys

def main():
    # Instructions for checking logs on PythonAnywhere
    print("=" * 80)
    print("PYTHONANYWHERE LOG CHECKING INSTRUCTIONS")
    print("=" * 80)
    print()
    print("Option 1: Via PythonAnywhere Console")
    print("-" * 80)
    print("1. Go to: https://www.pythonanywhere.com/")
    print("2. Click 'Consoles' tab")
    print("3. Start a new Bash console")
    print("4. Run these commands:")
    print()
    print("   cd ~/mysite")
    print("   tail -100 /var/log/cassbrothers.pythonanywhere.com.error.log")
    print()
    print("Option 2: Via Web Interface")
    print("-" * 80)
    print("1. Go to: https://www.pythonanywhere.com/")
    print("2. Click 'Web' tab")
    print("3. Scroll down to 'Log files' section")
    print("4. Click on 'Error log' link")
    print("5. Look for recent errors (last 50-100 lines)")
    print()
    print("Option 3: Check specific collection logs")
    print("-" * 80)
    print("   cd ~/mysite")
    print("   ls -la logs/")
    print("   tail -50 logs/toilets.log")
    print()
    print("=" * 80)
    print()
    print("What to look for:")
    print("-" * 80)
    print("1. PDF extraction messages:")
    print("   - '📄 PDF detected, extracting text from'")
    print("   - '✅ Successfully extracted X chars from PDF'")
    print()
    print("2. AI extraction messages:")
    print("   - 'Extracted X fields for toilets'")
    print("   - '❌ AI extraction failed'")
    print()
    print("3. Column mapping errors:")
    print("   - 'Field X not in column mapping'")
    print()
    print("4. Image extraction messages:")
    print("   - 'Extracted X images'")
    print("   - 'No images found'")
    print()

if __name__ == '__main__':
    main()
