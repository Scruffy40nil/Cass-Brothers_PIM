# Fix: "No spreadsheet ID configured for taps" on PythonAnywhere

## The Problem

The error occurs because `TAPS_SPREADSHEET_ID` is not loaded from the `.env` file.

## The Solution

### Step 1: Verify .env File Exists

On PythonAnywhere bash console:
```bash
cd ~/Cass-Brothers_PIM
ls -la .env
```

If missing, create it:
```bash
nano .env
```

Then add this line (plus all other content from your local .env):
```
TAPS_SPREADSHEET_ID=1jJ5thuNoxcITHkFAfFKPmUfaLYC3dSo2oppiN0s7i1U
```

### Step 2: Update WSGI File

The WSGI file needs to load the `.env` before importing the Flask app.

1. Go to PythonAnywhere **Web** tab
2. Click "WSGI configuration file" link
3. Find the lines that import your app
4. Add this BEFORE the import:

```python
# Load environment variables
from dotenv import load_dotenv
import os
env_path = '/home/YOUR_USERNAME/Cass-Brothers_PIM/.env'  # UPDATE YOUR_USERNAME
load_dotenv(env_path)
```

5. Save the file

### Step 3: Reload Web App

1. Go to PythonAnywhere Web tab
2. Click the green **"Reload"** button
3. Wait for reload to complete

### Step 4: Test

Run the diagnostic script:
```bash
cd ~/Cass-Brothers_PIM
python test_env_pythonanywhere.py
```

This will show if `TAPS_SPREADSHEET_ID` is now loaded correctly.

## Quick Verification

Check if the variable is in your .env:
```bash
grep TAPS_SPREADSHEET_ID ~/Cass-Brothers_PIM/.env
```

Expected output:
```
TAPS_SPREADSHEET_ID=1jJ5thuNoxcITHkFAfFKPmUfaLYC3dSo2oppiN0s7i1U
```

## Common Mistakes

1. **Typo**: `TAP_SPREADSHEET_ID` (missing S)
2. **Spaces**: `TAPS_SPREADSHEET_ID =` (space before =)
3. **Wrong location**: .env not in project root
4. **WSGI not loading .env**: WSGI imports app before loading .env
5. **Forgot to reload**: Changes don't take effect until reload

## Still Not Working?

Check the error log on PythonAnywhere Web tab for clues.
