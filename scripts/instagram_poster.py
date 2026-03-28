#!/usr/bin/env python3
"""
Instagram Reel Poster Script
Automatically posts reels from a Google Sheet campaign calendar to Instagram.

This script:
1. Reads the campaign Google Sheet for today's post
2. Downloads the video from Google Drive
3. Uploads to Instagram using the resumable upload flow
4. Publishes the reel with captions and hashtags
5. Updates the Google Sheet to mark as posted
"""

import os
import sys
import logging
import argparse
import requests
import json
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Dict, Tuple
import tempfile

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
    """Main class for posting reels to Instagram."""

    # API configuration
    META_API_VERSION = "v21.0"
    META_GRAPH_API_URL = "https://graph.facebook.com"
    META_UPLOAD_URL = "https://rupload.facebook.com"
    GOOGLE_SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets"
    GOOGLE_DRIVE_DOWNLOAD_URL = "https://drive.usercontent.google.com/download"

    # Retry configuration
    MAX_RETRIES = 3
    INITIAL_BACKOFF = 2  # seconds
    BACKOFF_MULTIPLIER = 2
    UPLOAD_POLL_INTERVAL = 2  # seconds
    UPLOAD_MAX_WAIT = 300  # 5 minutes

    # File size limits
    MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024  # 5GB
    MIN_VIDEO_SIZE = 100 * 1024  # 100KB

    def __init__(self, meta_token: str, sheets_api_key: str, ig_account_id: str,
                 campaign_sheet_id: str, dry_run: bool = False):
        """Initialize the Instagram Poster.

        Args:
            meta_token: Meta API access token
            sheets_api_key: Google Sheets API key
            ig_account_id: Instagram Business Account ID
            campaign_sheet_id: Campaign calendar Google Sheet ID
            dry_run: If True, don't actually post to Instagram
        """
        self.meta_token = meta_token
        self.sheets_api_key = sheets_api_key
        self.ig_account_id = ig_account_id
        self.campaign_sheet_id = campaign_sheet_id
        self.dry_run = dry_run

        if dry_run:
            logger.warning("DRY RUN MODE - No posts will be published")

        # Session for API requests
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Instagram-Reel-Poster/1.0'
        })

    def _get_today_date(self) -> str:
        """Get today's date in the format used by the spreadsheet."""
        today = datetime.now(timezone.utc)
        # Adjust for AEST (UTC+10), which is the campaign timezone
        aest = today.astimezone(timezone(timedelta(hours=10)))
        return aest.strftime('%Y-%m-%d')

    def _retry_request(self, method: str, url: str, **kwargs) -> Optional[requests.Response]:
        """Make an HTTP request with retry logic.

        Args:
            method: HTTP method (GET, POST, etc.)
            url: Request URL
            **kwargs: Additional arguments to pass to requests

        Returns:
            Response object or None if all retries failed
        """
        backoff = self.INITIAL_BACKOFF
        last_error = None

        for attempt in range(self.MAX_RETRIES):
            try:
                logger.debug(f"Attempt {attempt + 1}/{self.MAX_RETRIES}: {method} {url}")
                response = self.session.request(method, url, timeout=30, **kwargs)

                # Check for rate limiting or server errors (retry these)
                if response.status_code in [429, 500, 502, 503, 504]:
                    logger.warning(f"Retryable error {response.status_code}, backing off {backoff}s")
                    if attempt < self.MAX_RETRIES - 1:
                        time.sleep(backoff)
                        backoff *= self.BACKOFF_MULTIPLIER
                        continue

                return response

            except requests.exceptions.RequestException as e:
                last_error = e
                logger.warning(f"Request failed (attempt {attempt + 1}/{self.MAX_RETRIES}): {e}")
                if attempt < self.MAX_RETRIES - 1:
                    time.sleep(backoff)
                    backoff *= self.BACKOFF_MULTIPLIER
                    continue

        logger.error(f"All {self.MAX_RETRIES} retry attempts failed. Last error: {last_error}")
        return None

    def fetch_campaign_calendar(self) -> Optional[Dict]:
        """Fetch the campaign calendar from Google Sheets.

        Returns:
            Dictionary with sheet data or None on error
        """
        logger.info(f"Fetching campaign calendar (Sheet ID: {self.campaign_sheet_id})")

        url = f"{self.GOOGLE_SHEETS_API_URL}/{self.campaign_sheet_id}/values/30-Day Calendar"
        params = {
            'key': self.sheets_api_key,
            'majorDimension': 'ROWS'
        }

        response = self._retry_request('GET', url, params=params)
        if not response or response.status_code != 200:
            logger.error(f"Failed to fetch calendar: {response.status_code if response else 'No response'}")
            if response:
                logger.error(f"Response: {response.text}")
            return None

        try:
            data = response.json()
            logger.info(f"Calendar fetched successfully. Total rows: {len(data.get('values', []))}")
            return data
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse calendar JSON: {e}")
            return None

    def find_today_post(self, calendar_data: Dict) -> Optional[Dict]:
        """Find today's post in the campaign calendar.

        Expected columns: Day, Date, Day of Week, Format, Content Pillar,
                         Post Topic/Title, Caption, CTA, Hashtags, Video Source, Status, Posted?

        Args:
            calendar_data: Raw calendar data from Google Sheets

        Returns:
            Dictionary with post details or None if not found
        """
        values = calendar_data.get('values', [])
        if not values or len(values) < 2:
            logger.error("Calendar data is empty or missing header row")
            return None

        headers = values[0]
        logger.debug(f"Calendar headers: {headers}")

        # Find column indices
        try:
            date_idx = headers.index('Date')
            video_source_idx = headers.index('Video Source')
            caption_idx = headers.index('Caption')
            hashtags_idx = headers.index('Hashtags')
            status_idx = headers.index('Status')
            posted_idx = headers.index('Posted?')
            topic_idx = headers.index('Post Topic/Title')
            cta_idx = headers.index('CTA')
        except ValueError as e:
            logger.error(f"Missing required column: {e}")
            return None

        today = self._get_today_date()
        logger.info(f"Looking for post matching date: {today}")

        for row_idx, row in enumerate(values[1:], start=2):
            if not row or len(row) <= date_idx:
                continue

            row_date = row[date_idx].strip() if date_idx < len(row) else ""
            if row_date == today:
                logger.info(f"Found today's post at row {row_idx}")

                # Check if already posted
                posted_value = row[posted_idx].strip().lower() if posted_idx < len(row) else ""
                if posted_value in ['yes', 'true', '1']:
                    logger.warning("Today's post has already been marked as posted")
                    return None

                # Extract post details
                post = {
                    'row_idx': row_idx,
                    'date': row_date,
                    'video_source': row[video_source_idx].strip() if video_source_idx < len(row) else "",
                    'caption': row[caption_idx].strip() if caption_idx < len(row) else "",
                    'hashtags': row[hashtags_idx].strip() if hashtags_idx < len(row) else "",
                    'topic': row[topic_idx].strip() if topic_idx < len(row) else "",
                    'cta': row[cta_idx].strip() if cta_idx < len(row) else "",
                    'status': row[status_idx].strip() if status_idx < len(row) else "",
                }

                logger.info(f"Post details - Topic: {post['topic']}, Video: {post['video_source']}")
                return post

        logger.warning(f"No post found for today ({today})")
        return None

    def extract_drive_file_id(self, video_source: str) -> Optional[str]:
        """Extract Google Drive file ID from video source.

        Handles formats like:
        - Direct file ID: "1abc123def456..."
        - Google Drive URL: "https://drive.google.com/file/d/1abc123def456/view"
        - Filename: "video.mp4" (returns as-is)

        Args:
            video_source: Video source from sheet

        Returns:
            File ID/name or None if invalid
        """
        video_source = video_source.strip()

        # Check if it's a Google Drive URL
        if 'drive.google.com' in video_source:
            try:
                # Extract ID from URL like: https://drive.google.com/file/d/{id}/view
                parts = video_source.split('/d/')
                if len(parts) > 1:
                    file_id = parts[1].split('/')[0]
                    logger.debug(f"Extracted Drive file ID from URL: {file_id}")
                    return file_id
            except Exception as e:
                logger.warning(f"Failed to parse Drive URL: {e}")

        # If it looks like a file ID (long alphanumeric string)
        if len(video_source) > 20 and video_source.replace('-', '').replace('_', '').isalnum():
            logger.debug(f"Treating as Drive file ID: {video_source}")
            return video_source

        # Otherwise treat as filename
        logger.debug(f"Treating as filename: {video_source}")
        return video_source

    def download_video(self, file_id: str) -> Optional[bytes]:
        """Download video from Google Drive.

        Args:
            file_id: Google Drive file ID

        Returns:
            Video data as bytes or None on error
        """
        logger.info(f"Downloading video from Google Drive: {file_id}")

        url = self.GOOGLE_DRIVE_DOWNLOAD_URL
        params = {
            'id': file_id,
            'export': 'download',
            'confirm': 't'
        }

        response = self._retry_request('GET', url, params=params, stream=True)
        if not response or response.status_code != 200:
            logger.error(f"Failed to download video: {response.status_code if response else 'No response'}")
            return None

        try:
            # Stream the content to avoid loading entire file into memory
            video_data = b''
            downloaded_size = 0

            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    video_data += chunk
                    downloaded_size += len(chunk)

                    # Check size limit
                    if downloaded_size > self.MAX_VIDEO_SIZE:
                        logger.error(f"Video exceeds maximum size limit ({self.MAX_VIDEO_SIZE} bytes)")
                        return None

            if downloaded_size < self.MIN_VIDEO_SIZE:
                logger.error(f"Video is too small ({downloaded_size} bytes), minimum: {self.MIN_VIDEO_SIZE}")
                return None

            logger.info(f"Video downloaded successfully: {downloaded_size} bytes")
            return video_data

        except Exception as e:
            logger.error(f"Error downloading video: {e}")
            return None

    def upload_reel(self, video_data: bytes, caption: str, hashtags: str) -> Optional[str]:
        """Upload reel to Instagram using resumable upload flow.

        Args:
            video_data: Raw video file data
            caption: Post caption
            hashtags: Post hashtags

        Returns:
            Reel ID if successful, None on error
        """
        logger.info("Starting Instagram reel upload")

        # Step 1: Create media container
        logger.info("Step 1: Creating media container")
        full_caption = f"{caption}\n\n{hashtags}" if hashtags else caption

        create_url = f"{self.META_GRAPH_API_URL}/{self.META_API_VERSION}/{self.ig_account_id}/media"
        create_params = {
            'media_type': 'REELS',
            'upload_type': 'resumable',
            'caption': full_caption,
            'access_token': self.meta_token
        }

        if self.dry_run:
            logger.warning("DRY RUN: Would create media container")
            return "dry-run-reel-id"

        response = self._retry_request('POST', create_url, data=create_params)
        if not response or response.status_code != 200:
            logger.error(f"Failed to create media container: {response.status_code if response else 'No response'}")
            if response:
                logger.error(f"Response: {response.text}")
            return None

        try:
            container_data = response.json()
            container_id = container_data.get('id')
            if not container_id:
                logger.error(f"No container ID in response: {container_data}")
                return None
            logger.info(f"Media container created: {container_id}")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse container response: {e}")
            return None

        # Step 2: Upload video to resumable upload endpoint
        logger.info("Step 2: Uploading video data")
        video_size = len(video_data)

        upload_url = f"{self.META_UPLOAD_URL}/{self.META_API_VERSION}/{container_id}"
        upload_headers = {
            'Authorization': f'OAuth {self.meta_token}',
            'offset': '0',
            'file_size': str(video_size)
        }

        response = self._retry_request('POST', upload_url, headers=upload_headers, data=video_data)
        if not response or response.status_code != 200:
            logger.error(f"Failed to upload video: {response.status_code if response else 'No response'}")
            if response:
                logger.error(f"Response: {response.text}")
            return None

        try:
            upload_result = response.json()
            logger.info(f"Video upload response: {upload_result}")
        except json.JSONDecodeError:
            logger.info("Video uploaded successfully (no JSON response)")

        # Step 3: Poll for upload completion
        logger.info("Step 3: Polling for upload completion")
        start_time = time.time()
        poll_url = f"{self.META_GRAPH_API_URL}/{self.META_API_VERSION}/{container_id}"
        poll_params = {
            'fields': 'status_code',
            'access_token': self.meta_token
        }

        while time.time() - start_time < self.UPLOAD_MAX_WAIT:
            response = self._retry_request('GET', poll_url, params=poll_params)
            if not response or response.status_code != 200:
                logger.warning(f"Failed to poll status: {response.status_code if response else 'No response'}")
                time.sleep(self.UPLOAD_POLL_INTERVAL)
                continue

            try:
                status_data = response.json()
                status_code = status_data.get('status_code')
                logger.debug(f"Upload status: {status_code}")

                if status_code == 'FINISHED':
                    logger.info("Upload completed successfully")
                    return container_id
                elif status_code == 'FAILED':
                    logger.error("Upload failed")
                    return None
                else:
                    logger.debug(f"Still uploading... ({status_code})")
                    time.sleep(self.UPLOAD_POLL_INTERVAL)

            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse status response: {e}")
                time.sleep(self.UPLOAD_POLL_INTERVAL)

        logger.error(f"Upload polling timed out after {self.UPLOAD_MAX_WAIT} seconds")
        return None

    def publish_reel(self, container_id: str) -> Optional[str]:
        """Publish the uploaded reel.

        Args:
            container_id: Media container ID from upload

        Returns:
            Reel ID if successful, None on error
        """
        logger.info("Publishing reel")

        if self.dry_run:
            logger.warning("DRY RUN: Would publish reel")
            return container_id

        publish_url = f"{self.META_GRAPH_API_URL}/{self.META_API_VERSION}/{self.ig_account_id}/media_publish"
        publish_params = {
            'creation_id': container_id,
            'access_token': self.meta_token
        }

        response = self._retry_request('POST', publish_url, data=publish_params)
        if not response or response.status_code != 200:
            logger.error(f"Failed to publish reel: {response.status_code if response else 'No response'}")
            if response:
                logger.error(f"Response: {response.text}")
            return None

        try:
            publish_data = response.json()
            reel_id = publish_data.get('id')
            if not reel_id:
                logger.error(f"No reel ID in response: {publish_data}")
                return None
            logger.info(f"Reel published successfully: {reel_id}")
            return reel_id
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse publish response: {e}")
            return None

    def mark_post_as_posted(self, row_idx: int, reel_id: str) -> bool:
        """Mark the post as posted in the campaign calendar.

        Args:
            row_idx: Row index in the sheet
            reel_id: Instagram reel ID

        Returns:
            True if successful, False otherwise
        """
        logger.info(f"Marking post as posted in sheet (row {row_idx}, reel {reel_id})")

        if self.dry_run:
            logger.warning("DRY RUN: Would mark post as posted")
            return True

        # Update the "Posted?" column (column L = 12)
        cell_range = f"30-Day Calendar!L{row_idx}"
        update_url = f"{self.GOOGLE_SHEETS_API_URL}/{self.campaign_sheet_id}/values/{cell_range}"

        update_params = {
            'key': self.sheets_api_key,
            'valueInputOption': 'RAW'
        }

        update_data = {
            'values': [['Yes']]
        }

        response = self._retry_request('PUT', update_url, params=update_params, json=update_data)
        if not response or response.status_code != 200:
            logger.error(f"Failed to update sheet: {response.status_code if response else 'No response'}")
            if response:
                logger.error(f"Response: {response.text}")
            return False

        logger.info("Post marked as posted in sheet")
        return True

    def run(self) -> bool:
        """Main workflow: fetch, download, upload, and post.

        Returns:
            True if successful, False otherwise
        """
        logger.info("="*60)
        logger.info("Instagram Reel Posting Workflow Started")
        logger.info("="*60)

        try:
            # Step 1: Fetch campaign calendar
            calendar_data = self.fetch_campaign_calendar()
            if not calendar_data:
                logger.error("Failed to fetch campaign calendar")
                return False

            # Step 2: Find today's post
            post = self.find_today_post(calendar_data)
            if not post:
                logger.info("No post to publish today")
                return True  # Not an error condition

            # Step 3: Extract file ID and download video
            file_id = self.extract_drive_file_id(post['video_source'])
            if not file_id:
                logger.error("Invalid video source in post")
                return False

            video_data = self.download_video(file_id)
            if not video_data:
                logger.error("Failed to download video")
                return False

            # Step 4: Upload reel
            container_id = self.upload_reel(video_data, post['caption'], post['hashtags'])
            if not container_id:
                logger.error("Failed to upload reel")
                return False

            # Step 5: Publish reel
            reel_id = self.publish_reel(container_id)
            if not reel_id:
                logger.error("Failed to publish reel")
                return False

            # Step 6: Mark as posted
            if not self.mark_post_as_posted(post['row_idx'], reel_id):
                logger.warning("Failed to update sheet, but reel was posted successfully")
                # Don't fail here since the reel is posted

            logger.info("="*60)
            logger.info("SUCCESS: Reel posted and marked in calendar")
            logger.info(f"Reel ID: {reel_id}")
            logger.info("="*60)
            return True

        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
            return False


def main():
    """Entry point."""
    parser = argparse.ArgumentParser(
        description='Automatically post Instagram reels from Google Sheet campaign calendar'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Run without actually posting to Instagram'
    )

    args = parser.parse_args()

    # Get configuration from environment
    meta_token = os.environ.get('META_ACCESS_TOKEN')
    sheets_api_key = os.environ.get('GOOGLE_SHEETS_API_KEY')
    ig_account_id = os.environ.get('INSTAGRAM_BUSINESS_ACCOUNT_ID')
    campaign_sheet_id = os.environ.get('CAMPAIGN_SHEET_ID')

    # Check for dry-run in environment (from workflow_dispatch)
    env_dry_run = os.environ.get('DRY_RUN', 'false').lower() == 'true'
    dry_run = args.dry_run or env_dry_run

    # Validate configuration
    if not all([meta_token, sheets_api_key, ig_account_id, campaign_sheet_id]):
        logger.error("Missing required environment variables:")
        logger.error(f"  META_ACCESS_TOKEN: {bool(meta_token)}")
        logger.error(f"  GOOGLE_SHEETS_API_KEY: {bool(sheets_api_key)}")
        logger.error(f"  INSTAGRAM_BUSINESS_ACCOUNT_ID: {bool(ig_account_id)}")
        logger.error(f"  CAMPAIGN_SHEET_ID: {bool(campaign_sheet_id)}")
        return 1

    # Run the poster
    poster = InstagramPoster(
        meta_token=meta_token,
        sheets_api_key=sheets_api_key,
        ig_account_id=ig_account_id,
        campaign_sheet_id=campaign_sheet_id,
        dry_run=dry_run
    )

    success = poster.run()
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
