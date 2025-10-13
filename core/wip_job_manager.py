"""
Background Job Manager for WIP Product Processing

Handles asynchronous processing of work-in-progress products with:
- Job status tracking
- Progress updates via Socket.IO
- Error handling and recovery
- Concurrent processing with rate limiting
"""

import threading
import time
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import sqlite3
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class JobStatus(Enum):
    """Job status enumeration"""
    QUEUED = 'queued'
    RUNNING = 'running'
    COMPLETED = 'completed'
    FAILED = 'failed'
    CANCELLED = 'cancelled'


@dataclass
class WIPJob:
    """Represents a WIP processing job"""
    job_id: str
    collection_name: str
    wip_ids: List[int]
    status: JobStatus
    total_products: int
    processed_products: int = 0
    successful_products: int = 0
    failed_products: int = 0
    results: List[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: datetime = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    def __post_init__(self):
        if self.results is None:
            self.results = []
        if self.created_at is None:
            self.created_at = datetime.now()


class WIPJobManager:
    """Manages background processing of WIP products"""

    def __init__(self, db_path: str = 'supplier_products.db'):
        self.db_path = db_path
        self.jobs: Dict[str, WIPJob] = {}
        self.active_threads: Dict[str, threading.Thread] = {}
        self.lock = threading.Lock()
        self._ensure_job_table()
        self._socketio = None  # Will be set by flask app

    def set_socketio(self, socketio):
        """Set the Socket.IO instance for real-time updates"""
        self._socketio = socketio

    def _ensure_job_table(self):
        """Ensure the jobs table exists in the database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS wip_jobs (
                job_id TEXT PRIMARY KEY,
                collection_name TEXT NOT NULL,
                wip_ids TEXT NOT NULL,
                status TEXT NOT NULL,
                total_products INTEGER NOT NULL,
                processed_products INTEGER DEFAULT 0,
                successful_products INTEGER DEFAULT 0,
                failed_products INTEGER DEFAULT 0,
                results TEXT,
                error TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP
            )
        ''')

        conn.commit()
        conn.close()

    def create_job(self, collection_name: str, wip_ids: List[int]) -> str:
        """Create a new WIP processing job"""
        import uuid

        job_id = str(uuid.uuid4())
        job = WIPJob(
            job_id=job_id,
            collection_name=collection_name,
            wip_ids=wip_ids,
            status=JobStatus.QUEUED,
            total_products=len(wip_ids)
        )

        with self.lock:
            self.jobs[job_id] = job

        # Save to database
        self._save_job_to_db(job)

        logger.info(f"Created WIP job {job_id} for {len(wip_ids)} products in {collection_name}")

        return job_id

    def start_job(self, job_id: str, processor_func, *args, **kwargs):
        """Start processing a job in the background"""
        with self.lock:
            if job_id not in self.jobs:
                raise ValueError(f"Job {job_id} not found")

            job = self.jobs[job_id]
            if job.status != JobStatus.QUEUED:
                raise ValueError(f"Job {job_id} is not in queued state")

            job.status = JobStatus.RUNNING
            job.started_at = datetime.now()

        # Create and start background thread
        thread = threading.Thread(
            target=self._process_job,
            args=(job_id, processor_func, args, kwargs),
            daemon=True
        )

        with self.lock:
            self.active_threads[job_id] = thread

        thread.start()
        self._save_job_to_db(job)

        logger.info(f"Started background processing for job {job_id}")

    def _process_job(self, job_id: str, processor_func, args, kwargs):
        """Process a job in the background (runs in separate thread)"""
        try:
            job = self.jobs[job_id]

            # Emit start event
            self._emit_progress(job_id, {
                'status': 'started',
                'total': job.total_products,
                'processed': 0
            })

            # Call the processor function with progress callback
            processor_func(
                job_id=job_id,
                wip_ids=job.wip_ids,
                collection_name=job.collection_name,
                progress_callback=self._update_progress,
                *args,
                **kwargs
            )

            # Mark job as completed
            with self.lock:
                job.status = JobStatus.COMPLETED
                job.completed_at = datetime.now()

            self._save_job_to_db(job)

            # Emit completion event
            self._emit_progress(job_id, {
                'status': 'completed',
                'total': job.total_products,
                'processed': job.processed_products,
                'successful': job.successful_products,
                'failed': job.failed_products
            })

            logger.info(f"Job {job_id} completed: {job.successful_products}/{job.total_products} successful")

        except Exception as e:
            logger.error(f"Error processing job {job_id}: {e}", exc_info=True)

            with self.lock:
                job = self.jobs[job_id]
                job.status = JobStatus.FAILED
                job.error = str(e)
                job.completed_at = datetime.now()

            self._save_job_to_db(job)

            # Emit error event
            self._emit_progress(job_id, {
                'status': 'failed',
                'error': str(e)
            })

        finally:
            # Clean up thread reference
            with self.lock:
                if job_id in self.active_threads:
                    del self.active_threads[job_id]

    def _update_progress(self, job_id: str, product_result: Dict[str, Any]):
        """Update job progress (called by processor for each product)"""
        with self.lock:
            if job_id not in self.jobs:
                return

            job = self.jobs[job_id]
            job.processed_products += 1

            if product_result.get('success'):
                job.successful_products += 1
            else:
                job.failed_products += 1

            job.results.append(product_result)

        # Save progress to DB
        self._save_job_to_db(job)

        # Emit progress event
        self._emit_progress(job_id, {
            'status': 'processing',
            'total': job.total_products,
            'processed': job.processed_products,
            'successful': job.successful_products,
            'failed': job.failed_products,
            'current_product': product_result
        })

        logger.info(f"Job {job_id} progress: {job.processed_products}/{job.total_products}")

    def _emit_progress(self, job_id: str, data: Dict[str, Any]):
        """Emit progress event via Socket.IO"""
        if self._socketio:
            try:
                self._socketio.emit('wip_job_progress', {
                    'job_id': job_id,
                    **data
                })
            except Exception as e:
                logger.warning(f"Failed to emit Socket.IO event: {e}")

    def get_job(self, job_id: str) -> Optional[WIPJob]:
        """Get job by ID"""
        with self.lock:
            return self.jobs.get(job_id)

    def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job status as dictionary"""
        job = self.get_job(job_id)
        if not job:
            return None

        return {
            'job_id': job.job_id,
            'collection_name': job.collection_name,
            'status': job.status.value,
            'total_products': job.total_products,
            'processed_products': job.processed_products,
            'successful_products': job.successful_products,
            'failed_products': job.failed_products,
            'results': job.results,
            'error': job.error,
            'created_at': job.created_at.isoformat() if job.created_at else None,
            'started_at': job.started_at.isoformat() if job.started_at else None,
            'completed_at': job.completed_at.isoformat() if job.completed_at else None
        }

    def cancel_job(self, job_id: str) -> bool:
        """Cancel a running job"""
        with self.lock:
            if job_id not in self.jobs:
                return False

            job = self.jobs[job_id]
            if job.status not in [JobStatus.QUEUED, JobStatus.RUNNING]:
                return False

            job.status = JobStatus.CANCELLED
            job.completed_at = datetime.now()

        self._save_job_to_db(job)

        # Note: We can't forcefully stop the thread, but the processor should check status
        logger.info(f"Job {job_id} cancelled")

        return True

    def _save_job_to_db(self, job: WIPJob):
        """Save job state to database"""
        import json

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT OR REPLACE INTO wip_jobs (
                job_id, collection_name, wip_ids, status,
                total_products, processed_products, successful_products, failed_products,
                results, error, created_at, started_at, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            job.job_id,
            job.collection_name,
            json.dumps(job.wip_ids),
            job.status.value,
            job.total_products,
            job.processed_products,
            job.successful_products,
            job.failed_products,
            json.dumps(job.results),
            job.error,
            job.created_at.isoformat() if job.created_at else None,
            job.started_at.isoformat() if job.started_at else None,
            job.completed_at.isoformat() if job.completed_at else None
        ))

        conn.commit()
        conn.close()

    def load_job_from_db(self, job_id: str) -> Optional[WIPJob]:
        """Load job from database"""
        import json

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM wip_jobs WHERE job_id = ?', (job_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return None

        job = WIPJob(
            job_id=row['job_id'],
            collection_name=row['collection_name'],
            wip_ids=json.loads(row['wip_ids']),
            status=JobStatus(row['status']),
            total_products=row['total_products'],
            processed_products=row['processed_products'],
            successful_products=row['successful_products'],
            failed_products=row['failed_products'],
            results=json.loads(row['results']) if row['results'] else [],
            error=row['error'],
            created_at=datetime.fromisoformat(row['created_at']) if row['created_at'] else None,
            started_at=datetime.fromisoformat(row['started_at']) if row['started_at'] else None,
            completed_at=datetime.fromisoformat(row['completed_at']) if row['completed_at'] else None
        )

        with self.lock:
            self.jobs[job_id] = job

        return job

    def list_jobs(self, collection_name: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """List recent jobs"""
        conn = sqlite3.connect(self.db_path)
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

        rows = cursor.fetchall()
        conn.close()

        jobs = []
        for row in rows:
            jobs.append({
                'job_id': row['job_id'],
                'collection_name': row['collection_name'],
                'status': row['status'],
                'total_products': row['total_products'],
                'processed_products': row['processed_products'],
                'successful_products': row['successful_products'],
                'failed_products': row['failed_products'],
                'error': row['error'],
                'created_at': row['created_at'],
                'started_at': row['started_at'],
                'completed_at': row['completed_at']
            })

        return jobs


# Global instance
_job_manager = None


def get_wip_job_manager(db_path: str = 'supplier_products.db') -> WIPJobManager:
    """Get or create the global WIP job manager instance"""
    global _job_manager
    if _job_manager is None:
        _job_manager = WIPJobManager(db_path)
    return _job_manager
