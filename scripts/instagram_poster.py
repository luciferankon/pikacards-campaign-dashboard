#!/usr/bin/env python3
"""Instagram Reel Poster Script

Accepts a Google Drive file ID, caption, and hashtags via environment variables.
Downloads the video, uploads it to Instagram as a Reel using the resumable
upload flow, and publishes it.

Designed to be triggered by Cowork (orchestrator) via GitHub Actions
workflow_dispatch with inputs.
"""

import os
import sys
import logging
import json
import time
import requests

# Configure logging
log_file = "instagram_poster.log"
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class InstagramPoster:
    META_API_VERSION = "v21.0"
    META_GRAPH_URL = "https://graph.facebook.com"
    META_UPLOAD_URL = "https://rupload.facebook.com"
    DRIVE_DOWNLOAD_URL = "https://drive.usercontent.google.com/download"

    MAX_RETRIES = 3
    BACKOFF_START = 2
    POLL_INTERVAL = 3
    POLL_TIMEOUT = 300  # 5 min
    MIN_VIDEO_SIZE = 50 * 1024  # 50 KB

    def __init__(self, meta_token: str, ig_account_id: str, dry_run: bool = False):
        self.meta_token = meta_token
        self.ig_account_id = ig_account_id
        self.dry_run = dry_run
        self.session = requests.Session()

    # -- helpers ----------------------------------------------------------

    def _req(self, method, url, **kw):
        """HTTP request with retries + exponential backoff."""
        backoff = self.BACKOFF_START
        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                r = self.session.request(method, url, timeout=60, **kw)
                if r.status_code in (429, 500, 502, 503, 504) and attempt < self.MAX_RETRIES:
                    logger.warning(f"Retryable {r.status_code}, wait {backoff}s")
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                return r
            except requests.RequestException as e:
                logger.warning(f"Request error (attempt {attempt}): {e}")
                if attempt < self.MAX_RETRIES:
                    time.sleep(backoff)
                    backoff *= 2
        return None

    # -- pipeline steps ---------------------------------------------------

    def download_video(self, drive_file_id: str) -> bytes | None:
        """Download video from Google Drive (file must be publicly shared)."""
        logger.info(f"Downloading video from Drive: {drive_file_id}")
        url = self.DRIVE_DOWNLOAD_URL
        params = {'id': drive_file_id, 'export': 'download', 'confirm': 't'}

        r = self._req('GET', url, params=params, stream=True)
        if not r or r.status_code != 200:
            logger.error(f"Drive download failed: {r.status_code if r else 'no response'}")
            if r:
                logger.error(r.text[:500])
            return None

        data = b''
        for chunk in r.iter_content(8192):
            data += chunk

        if len(data) < self.MIN_VIDEO_SIZE:
            logger.error(f"File too small ({len(data)} bytes) — likely an HTML error page, not a video")
            return None

        logger.info(f"Downloaded {len(data):,} bytes")
        return data

    def create_container(self, caption: str) -> str | None:
        """Create a resumable-upload media container on Instagram."""
        logger.info("Creating media container")
        url = f"{self.META_GRAPH_URL}/{self.META_API_VERSION}/{self.ig_account_id}/media"
        payload = {
            'media_type': 'REELS',
            'upload_type': 'resumable',
            'caption': caption,
            'access_token': self.meta_token,
        }
        r = self._req('POST', url, data=payload)
        if not r or r.status_code != 200:
            logger.error(f"Container creation failed: {r.status_code if r else 'no response'}")
            if r:
                logger.error(r.text[:500])
            return None
        cid = r.json().get('id')
        logger.info(f"Container ID: {cid}")
        return cid

    def upload_bytes(self, container_id: str, video_data: bytes) -> bool:
        """Upload raw video bytes to the resumable-upload endpoint."""
        logger.info(f"Uploading {len(video_data):,} bytes to container {container_id}")
        url = f"{self.META_UPLOAD_URL}/{self.META_API_VERSION}/{container_id}"
        headers = {
            'Authorization': f'OAuth {self.meta_token}',
            'offset': '0',
            'file_size': str(len(video_data)),
        }
        r = self._req('POST', url, headers=headers, data=video_data)
        if not r or r.status_code != 200:
            logger.error(f"Upload failed: {r.status_code if r else 'no response'}")
            if r:
                logger.error(r.text[:500])
            return False
        logger.info("Upload accepted")
        return True

    def wait_for_ready(self, container_id: str) -> bool:
        """Poll until Instagram finishes processing the video."""
        logger.info("Polling for processing completion…")
        url = f"{self.META_GRAPH_URL}/{self.META_API_VERSION}/{container_id}"
        params = {'fields': 'status_code', 'access_token': self.meta_token}
        deadline = time.time() + self.POLL_TIMEOUT

        while time.time() < deadline:
            r = self._req('GET', url, params=params)
            if r and r.status_code == 200:
                status = r.json().get('status_code', '')
                logger.info(f"Status: {status}")
                if status == 'FINISHED':
                    return True
                if status in ('ERROR', 'EXPIRED'):
                    logger.error(f"Processing failed with status: {status}")
                    return False
            time.sleep(self.POLL_INTERVAL)

        logger.error("Timed out waiting for processing")
        return False

    def publish(self, container_id: str) -> str | None:
        """Publish the processed container as a Reel."""
        logger.info("Publishing reel")
        url = f"{self.META_GRAPH_URL}/{self.META_API_VERSION}/{self.ig_account_id}/media_publish"
        payload = {'creation_id': container_id, 'access_token': self.meta_token}
        r = self._req('POST', url, data=payload)
        if not r or r.status_code != 200:
            logger.error(f"Publish failed: {r.status_code if r else 'no response'}")
            if r:
                logger.error(r.text[:500])
            return None
        reel_id = r.json().get('id')
        logger.info(f"Published! Reel ID: {reel_id}")
        return reel_id

    # -- main entry -------------------------------------------------------

    def run(self, drive_file_id: str, caption: str, hashtags: str) -> bool:
        full_caption = f"{caption}\n\n{hashtags}".strip() if hashtags else caption

        logger.info("=" * 60)
        logger.info("Instagram Reel Poster — start")
        logger.info(f"  Drive file ID : {drive_file_id}")
        logger.info(f"  Caption length: {len(full_caption)} chars")
        logger.info(f"  Dry run       : {self.dry_run}")
        logger.info("=" * 60)

        # 1. Download
        video = self.download_video(drive_file_id)
        if not video:
            return False

        if self.dry_run:
            logger.info("DRY RUN — skipping Instagram upload/publish")
            return True

        # 2. Create container
        cid = self.create_container(full_caption)
        if not cid:
            return False

        # 3. Upload bytes
        if not self.upload_bytes(cid, video):
            return False

        # 4. Wait for processing
        if not self.wait_for_ready(cid):
            return False

        # 5. Publish
        reel_id = self.publish(cid)
        if not reel_id:
            return False

        logger.info(f"SUCCESS — reel {reel_id} is live")
        return True


def main():
    meta_token = os.environ.get('META_ACCESS_TOKEN', '')
    ig_account_id = os.environ.get('INSTAGRAM_BUSINESS_ACCOUNT_ID', '')
    drive_file_id = os.environ.get('VIDEO_DRIVE_ID', '')
    caption = os.environ.get('CAPTION', '')
    hashtags = os.environ.get('HASHTAGS', '')
    dry_run = os.environ.get('DRY_RUN', 'false').lower() == 'true'

    if not meta_token or not ig_account_id or not drive_file_id:
        logger.error("Missing required env vars (META_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID, VIDEO_DRIVE_ID)")
        return 1

    poster = InstagramPoster(meta_token, ig_account_id, dry_run)
    ok = poster.run(drive_file_id, caption, hashtags)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
