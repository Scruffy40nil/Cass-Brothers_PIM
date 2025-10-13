#!/usr/bin/env python3
"""
Quick diagnostic script to check WIP job status

Usage:
  python check_wip_job_status.py                    # Show all recent jobs
  python check_wip_job_status.py <job_id>           # Show specific job
  python check_wip_job_status.py --collection sinks # Show jobs for collection
"""

import sys
import sqlite3
from datetime import datetime
import json

def format_timestamp(ts_str):
    """Format timestamp for display"""
    if not ts_str:
        return "N/A"
    try:
        dt = datetime.fromisoformat(ts_str)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except:
        return ts_str

def format_duration(start_str, end_str):
    """Calculate duration between timestamps"""
    if not start_str or not end_str:
        return "N/A"
    try:
        start = datetime.fromisoformat(start_str)
        end = datetime.fromisoformat(end_str)
        duration = (end - start).total_seconds()
        if duration < 60:
            return f"{duration:.1f}s"
        elif duration < 3600:
            return f"{duration/60:.1f}m"
        else:
            return f"{duration/3600:.1f}h"
    except:
        return "N/A"

def show_job(job_id):
    """Show detailed info for a specific job"""
    conn = sqlite3.connect('supplier_products.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM wip_jobs WHERE job_id = ?', (job_id,))
    job = cursor.fetchone()

    if not job:
        print(f"❌ Job {job_id} not found")
        conn.close()
        return

    print("=" * 80)
    print(f"JOB: {job['job_id']}")
    print("=" * 80)
    print(f"Collection:     {job['collection_name']}")
    print(f"Status:         {job['status']}")
    print(f"Progress:       {job['processed_products']}/{job['total_products']} products")
    print(f"Successful:     {job['successful_products']}")
    print(f"Failed:         {job['failed_products']}")
    print(f"Created:        {format_timestamp(job['created_at'])}")
    print(f"Started:        {format_timestamp(job['started_at'])}")
    print(f"Completed:      {format_timestamp(job['completed_at'])}")

    if job['started_at'] and not job['completed_at']:
        elapsed = format_duration(job['started_at'], datetime.now().isoformat())
        print(f"Running for:    {elapsed}")
    elif job['started_at'] and job['completed_at']:
        duration = format_duration(job['started_at'], job['completed_at'])
        print(f"Duration:       {duration}")

    if job['error']:
        print(f"\n❌ ERROR: {job['error']}")

    # Show WIP IDs
    wip_ids = json.loads(job['wip_ids'])
    print(f"\nWIP IDs:        {wip_ids}")

    # Show results if available
    if job['results']:
        results = json.loads(job['results'])
        if results:
            print(f"\nRESULTS ({len(results)}):")
            for i, result in enumerate(results, 1):
                status_icon = "✅" if result.get('success') else "❌"
                sku = result.get('sku', 'N/A')
                error = result.get('error', '')
                duration = result.get('duration', 0)
                print(f"  {i}. {status_icon} SKU: {sku}")
                if duration:
                    print(f"     Duration: {duration:.1f}s")
                if error:
                    print(f"     Error: {error}")

    # Check WIP product statuses
    print(f"\nWIP PRODUCT STATUSES:")
    for wip_id in wip_ids:
        cursor.execute('''
            SELECT w.id, w.status, w.error_message, s.sku
            FROM wip_products w
            JOIN supplier_products s ON w.supplier_product_id = s.id
            WHERE w.id = ?
        ''', (wip_id,))
        wip = cursor.fetchone()
        if wip:
            status_icon = "🔄" if wip['status'] in ['extracting', 'generating', 'cleaning'] else ("✅" if wip['status'] == 'ready' else "⏸️")
            print(f"  {status_icon} WIP {wip['id']}: {wip['sku']} - {wip['status']}")
            if wip['error_message']:
                print(f"     Error: {wip['error_message']}")
        else:
            print(f"  ⚠️  WIP {wip_id}: Not found in database")

    conn.close()
    print("=" * 80)

def list_recent_jobs(collection_name=None, limit=10):
    """List recent jobs"""
    conn = sqlite3.connect('supplier_products.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    if collection_name:
        cursor.execute('''
            SELECT * FROM wip_jobs
            WHERE collection_name = ?
            ORDER BY created_at DESC
            LIMIT ?
        ''', (collection_name, limit))
    else:
        cursor.execute('''
            SELECT * FROM wip_jobs
            ORDER BY created_at DESC
            LIMIT ?
        ''', (limit,))

    jobs = cursor.fetchall()

    if not jobs:
        print("No jobs found")
        conn.close()
        return

    print("=" * 120)
    print(f"{'Job ID':<40} {'Collection':<15} {'Status':<10} {'Progress':<12} {'Created':<20}")
    print("=" * 120)

    for job in jobs:
        progress = f"{job['processed_products']}/{job['total_products']}"
        created = format_timestamp(job['created_at'])

        status_icon = {
            'queued': '⏸️',
            'running': '🔄',
            'completed': '✅',
            'failed': '❌',
            'cancelled': '🚫'
        }.get(job['status'], '❓')

        print(f"{job['job_id']:<40} {job['collection_name']:<15} {status_icon} {job['status']:<8} {progress:<12} {created:<20}")

    conn.close()
    print("=" * 120)
    print(f"\nShowing {len(jobs)} most recent jobs")
    print(f"Use: python check_wip_job_status.py <job_id> for details")

if __name__ == '__main__':
    if len(sys.argv) == 1:
        # No arguments - show all recent jobs
        list_recent_jobs()
    elif sys.argv[1] == '--collection' and len(sys.argv) > 2:
        # Show jobs for specific collection
        list_recent_jobs(collection_name=sys.argv[2])
    elif sys.argv[1].startswith('--'):
        # Help
        print(__doc__)
    else:
        # Show specific job
        show_job(sys.argv[1])
