# Google Sheets API Setup Guide

## Overview
This guide will help you set up Google Sheets API access to replace the CSV fallback approach with direct API integration.

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Sheets API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

## Step 2: Create Service Account Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the service account details:
   - Name: "PIM Sheets Access" (or your preferred name)
   - Description: "Service account for PIM system to access Google Sheets"
4. Click "Create and Continue"
5. Skip role assignment (optional step)
6. Click "Done"

## Step 3: Generate and Download Credentials

1. Find your newly created service account in the list
2. Click on the service account name
3. Go to the "Keys" tab
4. Click "Add Key" > "Create New Key"
5. Select "JSON" format
6. Click "Create" - this will download a JSON file

## Step 4: Share Your Google Sheet

1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1-y7zKw6ro93nsB04zbeEEEO800q2cysTnXyADnVLfw4
2. Click "Share" button
3. Add the service account email (from the JSON file, field: "client_email")
4. Give it "Editor" permissions
5. Click "Send"

## Step 5: Configure Your Environment

1. Save the downloaded JSON file as `credentials.json` in your project root
2. Set the environment variable:
   ```bash
   export GOOGLE_CREDENTIALS_JSON='credentials.json'
   ```

   Or for production, set the JSON content directly:
   ```bash
   export GOOGLE_CREDENTIALS_JSON='{"type": "service_account", "project_id": "...", ...}'
   ```

## Step 6: Verify Setup

Run the test script:
```bash
python test_sheets_connection.py
```

## Security Notes

- Never commit the credentials.json file to version control
- Add `credentials.json` to your `.gitignore` file
- Use environment variables in production
- Restrict service account permissions to only what's needed

## Troubleshooting

### Common Issues:
1. **Permission denied**: Make sure you shared the sheet with the service account email
2. **API not enabled**: Ensure Google Sheets API is enabled in your Google Cloud project
3. **Credentials not found**: Check that the JSON file path is correct and accessible

### Environment Variable Options:
- `GOOGLE_CREDENTIALS_JSON`: Path to JSON file OR JSON content as string
- `SINKS_SPREADSHEET_ID`: Your Google Sheets ID (already configured)

## Current Spreadsheet Configuration

- **Sinks Spreadsheet ID**: `1-y7zKw6ro93nsB04zbeEEEO800q2cysTnXyADnVLfw4`
- **URL**: https://docs.google.com/spreadsheets/d/1-y7zKw6ro93nsB04zbeEEEO800q2cysTnXyADnVLfw4