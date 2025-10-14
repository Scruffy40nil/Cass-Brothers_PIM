#!/usr/bin/env python3
"""
Fix stuck jobs - Cancel them directly in the database
Run this on PythonAnywhere to clean up the stuck jobs
"""

import sqlite3
from datetime import datetime

# Connect to database
conn = sqlite3.connect('supplier_products.db')
cursor = conn.cursor()

# Get stuck jobs
cursor.execute("""
    SELECT job_id, status, processed_products, total_products, created_at, started_at
    FROM wip_jobs
    WHERE status = 'running' AND processed_products = 0
    ORDER BY created_at DESC
""")

stuck_jobs = cursor.fetchall()

print(f"Found {len(stuck_jobs)} stuck jobs:")
print("=" * 80)

for job in stuck_jobs:
    job_id, status, processed, total, created, started = job
    print(f"Job: {job_id}")
    print(f"  Status: {status}")
    print(f"  Progress: {processed}/{total}")
    print(f"  Created: {created}")
    print(f"  Started: {started}")
    print()

# Cancel all stuck jobs
if stuck_jobs:
    print("Cancelling all stuck jobs...")
    cursor.execute("""
        UPDATE wip_jobs
        SET status = 'cancelled',
            completed_at = ?,
            error = 'Cancelled: Job stuck with no progress'
        WHERE status = 'running' AND processed_products = 0
    """, (datetime.now().isoformat(),))

    conn.commit()
    print(f"✅ Cancelled {cursor.rowcount} jobs")
else:
    print("No stuck jobs found")

# Show final status
cursor.execute("SELECT status, COUNT(*) FROM wip_jobs GROUP BY status")
status_counts = cursor.fetchall()

print("\nFinal job status counts:")
for status, count in status_counts:
    print(f"  {status}: {count}")

conn.close()
print("\n✅ Done!")
