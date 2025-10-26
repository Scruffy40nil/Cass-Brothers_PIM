#!/usr/bin/env python3
"""
WSGI configuration for PythonAnywhere deployment
This file is used by PythonAnywhere to run the Flask application

IMPORTANT: PythonAnywhere uses this file instead of running flask_app.py directly
Update the project_home variable below with your PythonAnywhere username
"""

import sys
import os

# IMPORTANT: UPDATE THIS with your PythonAnywhere username
project_home = '/home/YOUR_USERNAME/Cass-Brothers_PIM'

if project_home not in sys.path:
    sys.path.insert(0, project_home)

os.chdir(project_home)

# CRITICAL: Load environment variables BEFORE importing the app
from dotenv import load_dotenv
env_path = os.path.join(project_home, '.env')
load_dotenv(env_path)

# Verify critical environment variables are loaded
taps_id = os.environ.get('TAPS_SPREADSHEET_ID')
if not taps_id:
    raise RuntimeError(
        f"TAPS_SPREADSHEET_ID not found in environment! "
        f"Checked .env at: {env_path} "
        f"(exists: {os.path.exists(env_path)})"
    )

# Import the Flask app
from flask_app import app as application

# For debugging
print(f"✅ WSGI loaded with TAPS_SPREADSHEET_ID: {taps_id[:20]}...")
