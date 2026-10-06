"""
================================================================================
UVD (Universal Video Downloader) - Proprietary Software
Copyright (c) 2026 Ajeet Yadav. All Rights Reserved.
Author / Creator: Ajeet Yadav
Licensed exclusively to genuine users. Reverse engineering, decompilation,
unauthorized copying, rebranding, or redistribution is strictly prohibited.
================================================================================
"""

import os
import re
import sys
import json
import uuid
import time
import shutil
import asyncio
import hashlib
import sqlite3
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import imageio_ffmpeg
import threading

# Asynchronous non-blocking background pre-warming of yt_dlp for instant startup
def _warmup_ytdlp():
    try:
        import yt_dlp
    except Exception:
        pass

threading.Thread(target=_warmup_ytdlp, daemon=True).start()

# Hidden Digital Watermark & Cryptographic Author Signature
UVD_SECURITY_SIGNATURE = {
    "software": "UVD - Universal Video Downloader",
    "version": "2.1.0",
    "creator": "Ajeet Yadav",
    "copyright": "(c) 2026 Ajeet Yadav. All Rights Reserved.",
    "hash": "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069_ajeet_yadav_uvd"
}

# Paths, Settings & Version
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

APP_VERSION = "2.1.0"
APP_NAME = "UVD - Universal Video Downloader"
DEFAULT_UPDATE_URL = "https://raw.githubusercontent.com/ajeet-yadav/uvd-updates/main/version.json"

APP_DATA_DIR = Path.home() / ".omnidownloader"
APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
SETTINGS_FILE = APP_DATA_DIR / "app_settings.json"
DEFAULT_SETTINGS = {
    "download_dir": str(Path.home() / "Downloads" / "OmniDownloader"),
    "auto_clipboard": True,
    "auto_shutdown": False,
    "download_subtitles": False,
    "embed_thumbnail": True,
    "turbo_download": True,
    "auto_check_updates": True,
    "update_url": DEFAULT_UPDATE_URL
}

def load_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            merged = DEFAULT_SETTINGS.copy()
            merged.update(data)
            return merged
        except Exception:
            pass
    return DEFAULT_SETTINGS.copy()

def save_settings(data: dict):
    try:
        SETTINGS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        print("Failed to save settings", e)

def get_download_dir() -> Path:
    settings = load_settings()
    target_path = settings.get("download_dir") or str(Path.home() / "Downloads" / "OmniDownloader")
    target = Path(target_path)
    try:
        target.mkdir(parents=True, exist_ok=True)
    except Exception:
        target = Path.home() / "Downloads" / "OmniDownloader"
        target.mkdir(parents=True, exist_ok=True)
    return target

def parse_time_str(t_str: Optional[str]) -> Optional[float]:
    if not t_str:
        return None
    try:
        parts = list(map(float, str(t_str).strip().split(':')))
        if len(parts) == 1:
            return parts[0]
        elif len(parts) == 2:
            return parts[0] * 60 + parts[1]
        elif len(parts) == 3:
            return parts[0] * 3600 + parts[1] * 60 + parts[2]
    except Exception:
        pass
    return None

DOWNLOAD_DIR = get_download_dir()

TEMP_DIR = APP_DATA_DIR / "temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

PLAYLISTS_DB = APP_DATA_DIR / "saved_playlists.json"
if not PLAYLISTS_DB.exists():
    PLAYLISTS_DB.write_text("{}", encoding="utf-8")

METADATA_DB = APP_DATA_DIR / "downloads_metadata.json"
if not METADATA_DB.exists():
    METADATA_DB.write_text("{}", encoding="utf-8")

ACTIVE_TASKS_DB = APP_DATA_DIR / "active_tasks.json"
if not ACTIVE_TASKS_DB.exists():
    ACTIVE_TASKS_DB.write_text("{}", encoding="utf-8")

def load_active_tasks() -> Dict[str, Any]:
    if ACTIVE_TASKS_DB.exists():
        try:
            return json.loads(ACTIVE_TASKS_DB.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

def save_active_tasks(tasks: Dict[str, Any]):
    try:
        ACTIVE_TASKS_DB.write_text(json.dumps(tasks, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        print("Failed to save active tasks", e)

def record_active_task(task_id: str, data: Dict[str, Any]):
    tasks = load_active_tasks()
    if task_id in tasks:
        tasks[task_id].update(data)
    else:
        tasks[task_id] = data
    save_active_tasks(tasks)

def remove_active_task(task_id: str):
    tasks = load_active_tasks()
    if task_id in tasks:
        del tasks[task_id]
        save_active_tasks(tasks)

# FFmpeg path
try:
    FFMPEG_PATH = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_PATH = None

if not FFMPEG_PATH or not os.path.exists(str(FFMPEG_PATH)):
    FFMPEG_PATH = shutil.which("ffmpeg")

def ensure_mobile_compatible_mp4(file_path: str) -> str:
    """Ensures the MP4 video is 100% playable in native Android Gallery and iOS Photos.
    If the video is encoded in AV1 (av01) or VP9 (vp09/vp9) or uses non-standard pixel formats,
    native Android MediaCodec displays a black screen with audio only.
    This helper detects and ensures standard H.264 (yuv420p) + AAC with +faststart."""
    ffmpeg_exe = FFMPEG_PATH or shutil.which("ffmpeg")
    if not ffmpeg_exe or not os.path.exists(file_path) or not file_path.lower().endswith(".mp4"):
        return file_path

    try:
        probe_cmd = [str(ffmpeg_exe), "-i", str(file_path)]
        res = subprocess.run(probe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="ignore", timeout=15)
        output = res.stderr or ""

        is_h264 = False
        is_yuv420p = False
        is_aac = False
        has_video = False
        has_audio = False

        for line in output.splitlines():
            if "Stream #" in line:
                l_lower = line.lower()
                if "video:" in l_lower:
                    has_video = True
                    if any(c in l_lower for c in ["h264", "avc1"]):
                        is_h264 = True
                    if "yuv420p" in l_lower and "yuv420p10" not in l_lower:
                        is_yuv420p = True
                if "audio:" in l_lower:
                    has_audio = True
                    if any(c in l_lower for c in ["aac", "mp4a"]):
                        is_aac = True

        if not has_video:
            return file_path

        # If already standard 8-bit H.264 video (yuv420p) and AAC audio (or no audio), it's 100% gallery ready
        if is_h264 and is_yuv420p and (is_aac or not has_audio):
            return file_path

        temp_out = file_path + ".compat.mp4"

        if is_h264 and is_yuv420p:
            # Video is already H.264! Just copy video stream and convert audio to AAC with faststart
            conv_cmd = [
                str(ffmpeg_exe), "-y", "-i", str(file_path),
                "-c:v", "copy",
                "-c:a", "aac" if (has_audio and not is_aac) else "copy",
                "-movflags", "+faststart",
                temp_out
            ]
            proc = subprocess.run(conv_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)
        else:
            # Video is VP9, AV1, or non-standard pixel format!
            # Must transcode to H.264 (yuv420p) for Android Gallery hardware decoder.
            # Using -preset ultrafast -crf 23 ensures very fast encoding without blocking.
            conv_cmd = [
                str(ffmpeg_exe), "-y", "-i", str(file_path),
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p",
                "-c:a", "aac" if (has_audio and not is_aac) else "copy",
                "-movflags", "+faststart",
                temp_out
            ]
            proc = subprocess.run(conv_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)

        if proc.returncode == 0 and os.path.exists(temp_out) and os.path.getsize(temp_out) > 0:
            os.replace(temp_out, file_path)
        elif os.path.exists(temp_out):
            try:
                os.remove(temp_out)
            except Exception:
                pass
    except Exception as e:
        print(f"Error ensuring mobile compatibility for {file_path}: {e}")

    return file_path

COOKIES_FILE = APP_DATA_DIR / "cookies.txt"

def auto_extract_firefox_cookies() -> bool:
    """Auto extracts YouTube cookies from Firefox if present."""
    try:
        appdata = os.environ.get('APPDATA', '')
        if not appdata:
            return False
        ff_profiles = list(Path(appdata).glob('Mozilla/Firefox/Profiles/*/cookies.sqlite'))
        for p in ff_profiles:
            temp_db = APP_DATA_DIR / "temp_ff.sqlite"
            shutil.copyfile(p, temp_db)
            conn = sqlite3.connect(temp_db)
            c = conn.cursor()
            c.execute("SELECT host, name, value, path, expiry, isSecure, isHttpOnly FROM moz_cookies WHERE host LIKE '%youtube.com%' OR host LIKE '%google.com%'")
            rows = c.fetchall()
            conn.close()
            if temp_db.exists():
                temp_db.unlink()
                
            if len(rows) > 0:
                lines = ['# Netscape HTTP Cookie File', '# https://curl.haxx.se/rfc/cookie_spec.html', '# Auto-generated from Firefox', '']
                for host, name, val, path, expiry, is_sec, is_http in rows:
                    include_subdomain = 'TRUE' if host.startswith('.') else 'FALSE'
                    secure_str = 'TRUE' if is_sec else 'FALSE'
                    exp_sec = expiry or int(time.time() + 31536000)
                    lines.append(f'{host}\t{include_subdomain}\t{path}\t{secure_str}\t{exp_sec}\t{name}\t{val}')
                
                COOKIES_FILE.write_text('\n'.join(lines), encoding='utf-8')
                return True
    except Exception as e:
        pass
    return False

def get_base_ydl_opts() -> dict:
    """Returns baseline yt-dlp configuration with JS runtime and auto cookies detection."""
    opts = {
        'quiet': True,
        'no_warnings': True,
        # Universal mobile & desktop compatibility:
        # Prioritize standard H.264 (avc1) video and AAC (m4a) audio in MP4 container for 100% Android Gallery & iOS compatibility
        'format_sort': ['vcodec:h264', 'res', 'acodec:m4a', 'vcodec:avc', 'acodec:aac'],
    }
    if FFMPEG_PATH:
        opts['ffmpeg_location'] = FFMPEG_PATH

    # Check for available cookies.txt
    # Check for available cookies.txt or try auto-extract
    possible_cookies = [
        COOKIES_FILE,
        APP_DATA_DIR / "youtube_cookies.txt",
        Path.home() / "Downloads" / "cookies.txt",
        Path.home() / "Desktop" / "cookies.txt"
    ]
    
    found_cookie = None
    for cp in possible_cookies:
        if cp.exists() and cp.stat().st_size > 0:
            opts['cookiefile'] = str(cp)
            found_cookie = str(cp)
            break

    if not found_cookie:
        if auto_extract_firefox_cookies():
            found_cookie = str(COOKIES_FILE)

    if found_cookie:
        opts['cookiefile'] = found_cookie

    return opts



app = FastAPI(
    title="OmniDownloader API",
    description="Universal Social Media Video & Audio Downloader with Thumbnail Tracking",
    version="1.4.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DOWNLOAD_TASKS: Dict[str, Dict[str, Any]] = {}

# Recover active tasks from disk and mark incomplete tasks as paused
try:
    _initial_tasks = load_active_tasks()
    for _tid, _tinfo in _initial_tasks.items():
        if _tinfo.get("status") in ["downloading", "starting", "processing"]:
            _tinfo["status"] = "paused"
            _tinfo["speed_str"] = "Paused / Interrupted"
        DOWNLOAD_TASKS[_tid] = _tinfo.copy()
    save_active_tasks(_initial_tasks)
except Exception as e:
    print("Error recovering active tasks:", e)

import auth_system
import security_guard

@app.get("/api/version")
async def get_app_version():
    """Returns application version and name."""
    return {"version": APP_VERSION, "name": APP_NAME}

@app.get("/api/network-info")
async def get_network_info():
    """Returns local LAN IP for easy Android mobile connection."""
    import socket
    ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass
    return {
        "local_ip": ip,
        "port": 8999,
        "mobile_url": f"http://{ip}:8999"
    }

@app.get("/api/security/verification")
async def get_security_verification():
    """Returns cryptographic creator authorship and legal ownership validation."""
    return {
        "success": True,
        "valid": security_guard.verify_system_integrity(),
        "ownership": security_guard.get_ownership_metadata()
    }

class InfoRequest(BaseModel):
    url: str

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class StartDownloadRequest(BaseModel):
    url: str
    task_id: Optional[str] = None
    format_id: str = "best"
    is_audio: bool = False
    title: Optional[str] = None
    quality_label: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[str] = None
    uploader: Optional[str] = None
    playlist_id: Optional[str] = None
    video_id: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    download_subtitles: Optional[bool] = False

class SettingsUpdateRequest(BaseModel):
    download_dir: Optional[str] = None
    auto_clipboard: Optional[bool] = None
    auto_shutdown: Optional[bool] = None
    download_subtitles: Optional[bool] = None
    auto_check_updates: Optional[bool] = None
    update_url: Optional[str] = None

class CheckUpdateRequest(BaseModel):
    update_url: Optional[str] = None

class OpenLinkRequest(BaseModel):
    url: str

class ShutdownRequest(BaseModel):
    cancel: bool = False

class SavePlaylistStateRequest(BaseModel):
    playlist_id: str
    data: Dict[str, Any]

def detect_platform(url: str) -> Dict[str, str]:
    url_lower = url.lower()
    if "youtube.com" in url_lower or "youtu.be" in url_lower:
        return {"name": "YouTube", "icon": "youtube", "color": "#FF0000"}
    elif "instagram.com" in url_lower:
        return {"name": "Instagram", "icon": "instagram", "color": "#E1306C"}
    elif "facebook.com" in url_lower or "fb.watch" in url_lower:
        return {"name": "Facebook", "icon": "facebook", "color": "#1877F2"}
    elif "tiktok.com" in url_lower:
        return {"name": "TikTok", "icon": "tiktok", "color": "#00F2FE"}
    elif "twitter.com" in url_lower or "x.com" in url_lower:
        return {"name": "X (Twitter)", "icon": "twitter", "color": "#1DA1F2"}
    elif "reddit.com" in url_lower:
        return {"name": "Reddit", "icon": "reddit", "color": "#FF4500"}
    elif "pinterest.com" in url_lower or "pin.it" in url_lower:
        return {"name": "Pinterest", "icon": "pinterest", "color": "#BD081C"}
    elif "threads.net" in url_lower:
        return {"name": "Threads", "icon": "threads", "color": "#000000"}
    elif "twitch.tv" in url_lower:
        return {"name": "Twitch", "icon": "twitch", "color": "#9146FF"}
    elif "soundcloud.com" in url_lower:
        return {"name": "SoundCloud", "icon": "soundcloud", "color": "#FF5500"}
    elif "vimeo.com" in url_lower:
        return {"name": "Vimeo", "icon": "vimeo", "color": "#1AB7EA"}
    elif "linkedin.com" in url_lower:
        return {"name": "LinkedIn", "icon": "linkedin", "color": "#0A66C2"}
    return {"name": "Universal Video", "icon": "video", "color": "#6366F1"}

def format_bytes(size: Optional[float]) -> str:
    if not size or size <= 0:
        return "Unknown size"
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024.0:
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} TB"

def format_duration(seconds: Optional[float]) -> str:
    if not seconds:
        return "--:--"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

def estimate_video_size(height: Optional[int], duration: Optional[float], bitrate: Optional[float] = None) -> str:
    target_height = height or 720
    res_bitrates = {2160: 8000, 1440: 4500, 1080: 2200, 720: 1000, 480: 550, 360: 320, 240: 200, 144: 120}
    closest = min(res_bitrates.keys(), key=lambda k: abs(k - target_height))

    if not duration or duration <= 0:
        default_sizes = {2160: "~ 95 MB", 1440: "~ 55 MB", 1080: "~ 38 MB", 720: "~ 20 MB", 480: "~ 11 MB", 360: "~ 6.5 MB", 240: "~ 4.2 MB", 144: "~ 2.5 MB"}
        return default_sizes.get(closest, "~ 20 MB")

    if bitrate and bitrate > 0:
        bytes_est = (bitrate * 1024 / 8) * duration
        return f"{format_bytes(bytes_est)}"
    
    # Modern efficient video bitrates (H.264/VP9/AV1 + AAC/Opus audio)
    kbps = res_bitrates[closest] + 128
    bytes_est = (kbps * 1024 / 8) * duration
    return f"{format_bytes(bytes_est)}"

def estimate_audio_size(duration: Optional[float], abr: Optional[float] = 320) -> str:
    bitrate = abr or 320
    if not duration or duration <= 0:
        return "~ 7.5 MB" if bitrate >= 300 else ("~ 4.8 MB" if bitrate >= 190 else "~ 3.2 MB")
    bytes_est = (bitrate * 1024 / 8) * duration
    return f"{format_bytes(bytes_est)}"

def save_file_metadata(filename: str, meta: Dict[str, Any]):
    try:
        data = json.loads(METADATA_DB.read_text(encoding="utf-8"))
        data[filename] = meta
        METADATA_DB.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        print("Failed to save metadata", e)

def get_file_metadata(filename: str) -> Dict[str, Any]:
    try:
        data = json.loads(METADATA_DB.read_text(encoding="utf-8"))
        return data.get(filename, {})
    except Exception:
        return {}

@app.post("/api/info")
async def get_media_info(payload: InfoRequest):
    import yt_dlp
    url = payload.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")

    platform = detect_platform(url)
    is_likely_playlist = "list=" in url or "/playlist" in url or "/sets/" in url

    ydl_opts = get_base_ydl_opts()
    ydl_opts.update({
        'extract_flat': 'in_playlist' if is_likely_playlist else False,
        'skip_download': True,
    })

    try:
        loop = asyncio.get_event_loop()
        def extract():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(url, download=False)

        
        info = await loop.run_in_executor(None, extract)
        if not info:
            raise HTTPException(status_code=400, detail="Unable to extract information from this URL.")

        if '_type' in info and info['_type'] in ['playlist', 'multi_video'] or 'entries' in info:
            entries = list(info.get('entries', []))
            playlist_items = []
            
            for idx, entry in enumerate(entries, 1):
                if not entry:
                    continue
                v_id = entry.get('id') or str(idx)
                v_url = entry.get('url') or entry.get('webpage_url')
                if not v_url and 'id' in entry:
                    v_url = f"https://www.youtube.com/watch?v={entry['id']}"
                
                thumb = entry.get('thumbnail')
                if not thumb and entry.get('thumbnails'):
                    thumb = entry['thumbnails'][-1].get('url')

                dur = entry.get('duration')
                
                playlist_items.append({
                    "id": v_id,
                    "index": idx,
                    "title": entry.get('title') or f"Video #{idx}",
                    "url": v_url or url,
                    "thumbnail": thumb or "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
                    "duration": format_duration(dur),
                    "duration_seconds": dur or 0,
                    "uploader": entry.get('uploader') or info.get('uploader') or platform['name'],
                    "status": "pending",
                    "estimated_size": estimate_video_size(720, dur)
                })

            playlist_id = info.get('id') or uuid.uuid4().hex[:8]

            return {
                "success": True,
                "is_playlist": True,
                "playlist_id": playlist_id,
                "url": url,
                "title": info.get('title') or f"{platform['name']} Playlist",
                "uploader": info.get('uploader') or platform['name'],
                "total_items": len(playlist_items),
                "platform": platform,
                "items": playlist_items,
                "thumbnail": playlist_items[0]['thumbnail'] if playlist_items else ""
            }

        # Single video
        title = info.get('title', 'Social Media Video')
        thumbnail = info.get('thumbnail') or (info.get('thumbnails')[-1]['url'] if info.get('thumbnails') else '')
        duration = info.get('duration') or 0
        uploader = info.get('uploader') or info.get('channel') or platform['name']
        description = (info.get('description') or '')[:200]

        formats = info.get('formats', [])
        video_options = []
        audio_options = []

        # Find all available distinct video heights
        available_heights = sorted(
            list({
                f.get('height') for f in formats 
                if f.get('height') and f.get('height') >= 144 and (f.get('vcodec') and f.get('vcodec') != 'none')
            }),
            reverse=True
        )

        with yt_dlp.YoutubeDL(ydl_opts) as ydl_inst:
            for h in available_heights:
                fmt_spec = (
                    f"bestvideo[height={h}][vcodec^=avc1]+bestaudio[acodec^=mp4a]/"
                    f"bestvideo[height={h}][vcodec^=avc1]+bestaudio/"
                    f"bestvideo[height={h}]+bestaudio[acodec^=mp4a]/"
                    f"bestvideo[height={h}]+bestaudio/"
                    f"best[height={h}]/"
                    f"bestvideo[height<={h}][vcodec^=avc1]+bestaudio/"
                    f"bestvideo[height<={h}]+bestaudio/"
                    f"best"
                )
                try:
                    selector = ydl_inst.build_format_selector(fmt_spec)
                    selected_fmts = list(selector({'formats': formats, 'incomplete_formats': False}))
                except Exception:
                    selected_fmts = []

                if not selected_fmts:
                    continue

                v_stream = selected_fmts[0] if selected_fmts else {}
                actual_h = v_stream.get('height') or h
                fps = v_stream.get('fps')

                res_bitrates = {2160: 8000, 1440: 4500, 1080: 2200, 720: 1000, 480: 550, 360: 320, 240: 200, 144: 120}
                total_bytes = 0
                for sf in selected_fmts:
                    s_bytes = sf.get('filesize') or sf.get('filesize_approx')
                    if not s_bytes and (sf.get('tbr') or sf.get('vbr') or sf.get('abr')) and duration and duration > 0:
                        s_bytes = int(((sf.get('tbr') or sf.get('vbr') or sf.get('abr')) * 1024 / 8) * duration)
                    
                    # If this stream is a video stream and size is still unknown/0, estimate using resolution bitrate
                    if not s_bytes and sf.get('vcodec') and sf.get('vcodec') != 'none':
                        closest_h = min(res_bitrates.keys(), key=lambda k: abs(k - actual_h))
                        kbps = res_bitrates[closest_h]
                        if duration and duration > 0:
                            s_bytes = int((kbps * 1024 / 8) * duration)
                        else:
                            s_bytes = int(kbps * 1024 * 1024 / 8 * 90)

                    # If this stream is an audio-only stream and size is still unknown/0, estimate using standard 128kbps
                    if not s_bytes and sf.get('acodec') and sf.get('acodec') != 'none' and (not sf.get('vcodec') or sf.get('vcodec') == 'none'):
                        if duration and duration > 0:
                            s_bytes = int((128 * 1024 / 8) * duration)
                        else:
                            s_bytes = int(4 * 1024 * 1024)

                    if s_bytes:
                        total_bytes += s_bytes

                if total_bytes <= 0 and duration and duration > 0:
                    closest_h = min(res_bitrates.keys(), key=lambda k: abs(k - actual_h))
                    total_bytes = int(((res_bitrates[closest_h] + 128) * 1024 / 8) * duration)

                if actual_h >= 2160:
                    quality_label = f"4K Ultra HD ({actual_h}p)"
                elif actual_h >= 1440:
                    quality_label = f"2K Quad HD ({actual_h}p)"
                elif actual_h >= 1080:
                    quality_label = f"1080p Full HD"
                elif actual_h >= 720:
                    quality_label = f"720p HD"
                elif actual_h >= 480:
                    quality_label = f"480p SD"
                elif actual_h >= 360:
                    quality_label = f"360p Medium"
                elif actual_h >= 240:
                    quality_label = f"240p Low"
                elif actual_h >= 144:
                    quality_label = f"144p Very Low"
                else:
                    quality_label = f"{actual_h}p"

                if fps and fps >= 50:
                    quality_label += f" {fps}fps"

                size_str = format_bytes(total_bytes) if total_bytes > 0 else estimate_video_size(actual_h, duration)

                if not any(opt['height'] == actual_h for opt in video_options):
                    video_options.append({
                        'format_id': fmt_spec,
                        'height': actual_h,
                        'quality': quality_label,
                        'ext': 'mp4',
                        'size': size_str,
                        'raw_bytes': total_bytes,
                        'is_audio': False
                    })

        # Fallback for progressive / single-stream platforms (Twitter, TikTok, Instagram, etc.)
        if not video_options:
            seen_res = set()
            candidate_formats = sorted(
                [f for f in formats if (f.get('vcodec') and f.get('vcodec') != 'none') or f.get('ext') in ['mp4', 'webm'] or f.get('url')],
                key=lambda x: (
                    1 if any(c in str(x.get('vcodec', '')).lower() for c in ['avc1', 'h264']) else 0,
                    x.get('height') or 0
                ),
                reverse=True
            )
            for f in candidate_formats:
                h = f.get('height') or 720
                key = f"{h}p"
                if key not in seen_res:
                    seen_res.add(key)
                    sz = f.get('filesize') or f.get('filesize_approx') or (int(((f.get('tbr') or f.get('vbr') or 1200) * 1024 / 8) * duration) if duration else 0)
                    if not sz and duration and duration > 0:
                        closest_h = min(res_bitrates.keys(), key=lambda k: abs(k - h))
                        sz = int((res_bitrates[closest_h] * 1024 / 8) * duration)
                    sz_str = format_bytes(sz) if sz > 0 else estimate_video_size(h, duration)
                    f_id = f.get('format_id') or 'best'
                    video_options.append({
                        'format_id': f_id,
                        'height': h,
                        'quality': f"{h}p HD" if h >= 720 else f"{h}p SD",
                        'ext': 'mp4',
                        'size': sz_str,
                        'raw_bytes': sz,
                        'is_audio': False
                    })
            video_options.sort(key=lambda x: x['height'], reverse=True)

        if not video_options:
            video_options.append({
                'format_id': 'best',
                'height': 1080,
                'quality': '1080p Full HD (Best)',
                'ext': 'mp4',
                'size': estimate_video_size(1080, duration),
                'raw_bytes': int(((2200 + 128) * 1024 / 8) * duration) if duration else 0,
                'is_audio': False
            })
            video_options.append({
                'format_id': 'best',
                'height': 720,
                'quality': '720p HD',
                'ext': 'mp4',
                'size': estimate_video_size(720, duration),
                'raw_bytes': int(((1000 + 128) * 1024 / 8) * duration) if duration else 0,
                'is_audio': False
            })

        # Monotonic size hierarchy guarantee: Higher resolution MUST NOT have smaller size than lower resolution
        if video_options:
            video_options.sort(key=lambda x: x['height'])  # Lowest to highest (e.g. 144p -> 1080p)
            running_min_bytes = 0
            for opt in video_options:
                b = opt.get('raw_bytes', 0)
                if b < running_min_bytes:
                    # Higher resolution had a smaller size reported than a lower resolution!
                    # Enforce realistic scaling (at least 20% larger than the lower resolution)
                    scaled = int(running_min_bytes * 1.25)
                    opt['raw_bytes'] = scaled
                    opt['size'] = format_bytes(scaled)
                    running_min_bytes = scaled
                else:
                    running_min_bytes = max(running_min_bytes, b)
            # Re-sort descending (highest resolution first: 1080p -> 720p -> 480p...)
            video_options.sort(key=lambda x: x['height'], reverse=True)

        # Audio options
        audio_options.append({
            'format_id': 'bestaudio/best',
            'quality': 'MP3 (Highest Quality 320kbps)',
            'ext': 'mp3',
            'size': estimate_audio_size(duration, 320),
            'is_audio': True
        })
        audio_options.append({
            'format_id': 'bestaudio/best',
            'quality': 'MP3 (Standard 192kbps)',
            'ext': 'mp3',
            'size': estimate_audio_size(duration, 192),
            'is_audio': True
        })
        audio_options.append({
            'format_id': 'bestaudio/best',
            'quality': 'MP3 (Compact 128kbps)',
            'ext': 'mp3',
            'size': estimate_audio_size(duration, 128),
            'is_audio': True
        })

        # Check if already downloaded in local library / disk
        existing_file = None
        target_dir = get_download_dir()
        try:
            meta_all = json.loads(METADATA_DB.read_text(encoding="utf-8"))
            for fname, m in meta_all.items():
                if (m.get("url") and m.get("url") == url) or (m.get("title") and m.get("title") == title):
                    fpath = target_dir / fname
                    if fpath.exists() and fpath.is_file() and fpath.stat().st_size > 0:
                        existing_file = {
                            "filename": fname,
                            "title": m.get("title", fname),
                            "size": format_bytes(fpath.stat().st_size),
                            "is_audio": m.get("is_audio", False),
                            "path": str(fpath)
                        }
                        break
        except Exception:
            pass

        if not existing_file:
            safe_title = re.sub(r'[\\/*?:"<>|]', "", title or "OmniVideo")[:50].strip() or "video"
            for fpath in target_dir.glob(f"{safe_title}*.*"):
                if fpath.is_file() and not fpath.name.endswith(".part") and not fpath.name.endswith(".ytdl") and not fpath.name.endswith(".tmp"):
                    if fpath.stat().st_size > 0:
                        existing_file = {
                            "filename": fpath.name,
                            "title": title or fpath.name,
                            "size": format_bytes(fpath.stat().st_size),
                            "is_audio": fpath.suffix.lower() in [".mp3", ".m4a", ".wav", ".aac"],
                            "path": str(fpath)
                        }
                        break

        return {
            "success": True,
            "is_playlist": False,
            "url": url,
            "title": title,
            "thumbnail": thumbnail,
            "duration": format_duration(duration),
            "duration_seconds": duration,
            "uploader": uploader,
            "description": description,
            "platform": platform,
            "video_options": video_options,
            "audio_options": audio_options[:3],
            "webpage_url": info.get('webpage_url', url),
            "already_downloaded": existing_file is not None,
            "existing_file": existing_file
        }

    except Exception as e:
        error_msg = str(e)
        if "This video is unavailable" in error_msg or "Video unavailable" in error_msg:
            raise HTTPException(status_code=400, detail="This video is unavailable on YouTube (Deleted or Unavailable). Please enter a valid active video link.")
        elif "Private video" in error_msg:
            raise HTTPException(status_code=400, detail="This video is Private. Only public or unlisted videos can be downloaded.")
        elif "Sign in to confirm" in error_msg or "not a bot" in error_msg:
            raise HTTPException(status_code=400, detail="YouTube requires verification or authentication to access this video.")
        if "ERROR:" in error_msg:
            error_msg = error_msg.split("ERROR:")[-1].strip()
        raise HTTPException(status_code=400, detail=f"Failed to fetch media: {error_msg}")


# Live background download worker with metadata tracking & resume support
def run_yt_dlp_download(
    task_id: str,
    url: str,
    format_id: str,
    is_audio: bool,
    title: str,
    quality_label: Optional[str] = None,
    thumbnail: Optional[str] = None,
    duration: Optional[str] = None,
    uploader: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    download_subtitles: Optional[bool] = False
):
    import yt_dlp
    safe_title = re.sub(r'[\\/*?:"<>|]', "", title or "OmniVideo")[:50].strip() or "video"
    url_hash = hashlib.md5(f"{url}_{format_id}_{is_audio}".encode('utf-8')).hexdigest()[:8]
    file_stem = f"{safe_title}_{url_hash}"
    target_dir = get_download_dir()

    task_initial = {
        "task_id": task_id,
        "url": url,
        "format_id": format_id,
        "is_audio": is_audio,
        "title": title or "OmniDownload",
        "quality_label": quality_label or ("MP3 Audio" if is_audio else "HD Video"),
        "thumbnail": thumbnail or "",
        "duration": duration or "",
        "uploader": uploader or "",
        "start_time": start_time,
        "end_time": end_time,
        "download_subtitles": download_subtitles,
        "status": "downloading",
        "percent": 0,
        "percent_str": "0%",
        "downloaded_bytes_str": "0 MB",
        "total_bytes_str": "Calculating...",
        "speed_str": "Starting...",
        "eta_str": "--:--",
        "file_stem": file_stem,
        "filename": "",
        "file_path": "",
        "error": None,
        "updated_at": time.time()
    }
    DOWNLOAD_TASKS[task_id] = task_initial
    record_active_task(task_id, task_initial)

    last_disk_sync = [time.time()]

    def progress_hook(d):
        if DOWNLOAD_TASKS.get(task_id, {}).get("status") == "cancelled":
            raise Exception("Download cancelled by user")
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            downloaded = d.get('downloaded_bytes') or 0
            speed = d.get('speed') or 0
            eta = d.get('eta') or 0
            
            percent = 0
            if total > 0:
                percent = round((downloaded / total) * 100, 1)
            elif '_percent_str' in d:
                clean_p = re.sub(r'\x1b\[[0-9;]*m', '', d['_percent_str']).strip().replace('%', '')
                try:
                    percent = float(clean_p)
                except Exception:
                    percent = 50.0

            update_info = {
                "status": "downloading",
                "percent": min(percent, 99.0),
                "percent_str": f"{percent}%",
                "downloaded_bytes_str": format_bytes(downloaded),
                "total_bytes_str": format_bytes(total) if total else "Streaming...",
                "speed_str": f"{format_bytes(speed)}/s" if speed else "--",
                "eta_str": format_duration(eta) if eta else "--",
                "updated_at": time.time()
            }
            DOWNLOAD_TASKS[task_id].update(update_info)

            # Persist to disk periodically
            now = time.time()
            if now - last_disk_sync[0] > 1.5:
                last_disk_sync[0] = now
                record_active_task(task_id, DOWNLOAD_TASKS[task_id])

        elif d['status'] == 'finished':
            DOWNLOAD_TASKS[task_id]["status"] = "processing"
            DOWNLOAD_TASKS[task_id]["percent"] = 99.0
            DOWNLOAD_TASKS[task_id]["speed_str"] = "Processing & Merging Media..."
            DOWNLOAD_TASKS[task_id]["updated_at"] = time.time()
            record_active_task(task_id, DOWNLOAD_TASKS[task_id])

    ydl_opts = get_base_ydl_opts()
    ydl_opts.update({
        'outtmpl': str(target_dir / f"{file_stem}.%(ext)s"),
        'progress_hooks': [progress_hook],
        'noplaylist': True,
        'continuedl': True,  # Seamless resume for partial .part files
        'noprogress': False,
    })

    # Range Trimming (Start & End Time)
    s_sec = parse_time_str(start_time)
    e_sec = parse_time_str(end_time)
    if s_sec is not None or e_sec is not None:
        def range_func(info_dict, ydl):
            dur = info_dict.get('duration') or float('inf')
            return [{'start_time': s_sec or 0, 'end_time': e_sec or dur}]
        ydl_opts['download_ranges'] = range_func
        ydl_opts['force_keyframes_at_cuts'] = True

    # Subtitles Support
    if download_subtitles:
        ydl_opts.update({
            'writesubtitles': True,
            'writeautomaticsub': True,
            'subtitleslangs': ['hi', 'en', 'en-US', 'hi-IN'],
            'subtitlesformat': 'srt/best',
            'ignoreerrors': True,
        })
        if not is_audio:
            ydl_opts.setdefault('postprocessors', []).append({
                'key': 'FFmpegEmbedSubtitle',
                'already_have_subtitle': False
            })

    # Audio & Video Postprocessors
    if is_audio:
        ydl_opts.update({
            'format': 'bestaudio/best',
            'writethumbnail': True,
            'postprocessors': [
                {
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '320',
                },
                {
                    'key': 'FFmpegMetadata',
                    'add_metadata': True,
                },
                {
                    'key': 'EmbedThumbnail',
                    'already_have_thumbnail': False,
                }
            ],
        })
    else:
        if format_id == 'best':
            ydl_opts['format'] = 'best[ext=mp4][vcodec^=avc1]/bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best'
        elif '+bestaudio' in format_id or 'bestvideo' in format_id:
            if 'vcodec' not in format_id:
                v_part = format_id.split('+')[0]
                ydl_opts['format'] = f"best[ext=mp4][vcodec^=avc1]/{v_part}[vcodec^=avc1]+bestaudio[acodec^=mp4a]/{v_part}[vcodec^=avc1]+bestaudio/{format_id}/best"
            else:
                ydl_opts['format'] = format_id
        else:
            ydl_opts['format'] = f"best[ext=mp4][vcodec^=avc1]/{format_id}+bestaudio[acodec^=mp4a]/{format_id}+bestaudio/{format_id}/best"
        ydl_opts['merge_output_format'] = 'mp4'
        ydl_opts['postprocessor_args'] = {
            'Merger': ['-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart']
        }

    res = None
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            res = ydl.extract_info(url, download=True)
    except Exception as e:
        err_str = str(e)
        if DOWNLOAD_TASKS.get(task_id, {}).get("status") == "cancelled" or "cancelled by user" in err_str.lower():
            remove_active_task(task_id)
            for pf in target_dir.glob(f"{file_stem}*.*"):
                if pf.suffix.lower() in [".part", ".ytdl", ".tmp"]:
                    try:
                        pf.unlink(missing_ok=True)
                    except Exception:
                        pass
            return

        # Auto-recover from HTTP 416 (Requested range not satisfiable) or stale partial download files
        if "416" in err_str or "range not satisfiable" in err_str.lower() or "requested range" in err_str.lower():
            try:
                # Clean up corrupted/stale partial files for this stem
                for pf in target_dir.glob(f"{file_stem}*.*"):
                    if pf.suffix.lower() in [".part", ".ytdl", ".tmp"]:
                        try:
                            pf.unlink(missing_ok=True)
                        except Exception:
                            pass
                retry_opts = ydl_opts.copy()
                retry_opts['continuedl'] = False
                with yt_dlp.YoutubeDL(retry_opts) as ydl_retry:
                    res = ydl_retry.extract_info(url, download=True)
            except Exception as retry_err:
                DOWNLOAD_TASKS[task_id]["status"] = "error"
                DOWNLOAD_TASKS[task_id]["error"] = str(retry_err)
                record_active_task(task_id, DOWNLOAD_TASKS[task_id])
                return
        else:
            DOWNLOAD_TASKS[task_id]["status"] = "error"
            DOWNLOAD_TASKS[task_id]["error"] = err_str
            record_active_task(task_id, DOWNLOAD_TASKS[task_id])
            return

    if not res:
        DOWNLOAD_TASKS[task_id]["status"] = "error"
        DOWNLOAD_TASKS[task_id]["error"] = "Download stream failed."
        record_active_task(task_id, DOWNLOAD_TASKS[task_id])
        return

    downloaded_file = ydl.prepare_filename(res)
    base, _ = os.path.splitext(downloaded_file)
    
    if is_audio:
        actual_file = base + ".mp3"
    else:
        actual_file = base + ".mp4" if os.path.exists(base + ".mp4") else downloaded_file
        # Ensure 100% Android Gallery & iOS compatibility (H.264 + AAC + faststart)
        actual_file = ensure_mobile_compatible_mp4(actual_file)

    final_thumb = thumbnail or res.get('thumbnail') or (res.get('thumbnails')[-1]['url'] if res.get('thumbnails') else '')

    if os.path.exists(actual_file):
        final_name = os.path.basename(actual_file)
        size_final = os.path.getsize(actual_file)
        
        DOWNLOAD_TASKS[task_id].update({
            "status": "completed",
            "percent": 100,
            "percent_str": "100%",
            "filename": final_name,
            "file_path": str(actual_file),
            "thumbnail": final_thumb,
            "total_bytes_str": format_bytes(size_final),
            "downloaded_bytes_str": format_bytes(size_final),
            "download_url": f"/api/file/{final_name}",
            "updated_at": time.time()
        })

        # Clean up any leftover raw stream chunks (.f251.webm, .f399.mp4, etc.)
        for pf in target_dir.glob(f"{file_stem}*.*"):
            if str(pf.resolve()) != str(Path(actual_file).resolve()):
                if pf.suffix.lower() in [".part", ".ytdl", ".tmp"] or re.search(r'\.f[0-9a-zA-Z_-]+\.(mp4|webm|m4a|mkv)$', pf.name):
                    try:
                        pf.unlink(missing_ok=True)
                    except Exception:
                        pass

        # Save metadata for Downloaded Library display
        save_file_metadata(final_name, {
            "filename": final_name,
            "title": title or res.get('title') or final_name,
            "url": url,
            "thumbnail": final_thumb,
            "duration": duration or format_duration(res.get('duration')),
            "uploader": uploader or res.get('uploader') or "Creator",
            "size": format_bytes(size_final),
            "is_audio": is_audio,
            "created": time.strftime("%Y-%m-%d %H:%M")
        })
        # Remove from active tasks disk DB
        remove_active_task(task_id)
    else:
        DOWNLOAD_TASKS[task_id]["status"] = "error"
        DOWNLOAD_TASKS[task_id]["error"] = "File generated could not be located."
        record_active_task(task_id, DOWNLOAD_TASKS[task_id])

@app.get("/api/tasks/active")
async def get_active_tasks_endpoint():
    tasks = load_active_tasks()
    for tid, tinfo in DOWNLOAD_TASKS.items():
        if tinfo.get("status") in ["downloading", "starting", "processing", "paused"]:
            tasks[tid] = tinfo
    return {"tasks": list(tasks.values())}

@app.delete("/api/tasks/{task_id}")
async def delete_active_task_endpoint(task_id: str):
    tasks = load_active_tasks()
    task = tasks.get(task_id) or DOWNLOAD_TASKS.get(task_id)
    if task_id in DOWNLOAD_TASKS:
        DOWNLOAD_TASKS[task_id]["status"] = "cancelled"
    remove_active_task(task_id)
    if task and "file_stem" in task:
        stem = task["file_stem"]
        target_dir = get_download_dir()
        for pf in target_dir.glob(f"{stem}*.*"):
            if pf.suffix.lower() in [".part", ".ytdl", ".tmp"]:
                try:
                    pf.unlink()
                except Exception:
                    pass
    return {"success": True, "message": f"Task {task_id} removed"}

@app.post("/api/tasks/cancel-all")
@app.delete("/api/tasks/all")
async def cancel_all_active_tasks_endpoint():
    tasks = load_active_tasks()
    for tid in list(tasks.keys()):
        remove_active_task(tid)
    for tid, tinfo in list(DOWNLOAD_TASKS.items()):
        tinfo["status"] = "cancelled"
    
    target_dir = get_download_dir()
    for pf in target_dir.glob("*.part"):
        try: pf.unlink(missing_ok=True)
        except Exception: pass
    for pf in target_dir.glob("*.ytdl"):
        try: pf.unlink(missing_ok=True)
        except Exception: pass
    for pf in target_dir.glob("*.tmp"):
        try: pf.unlink(missing_ok=True)
        except Exception: pass
    return {"success": True, "message": "All active download tasks cancelled"}

@app.post("/api/start-download")
async def start_download_task(payload: StartDownloadRequest, background_tasks: BackgroundTasks):
    allowed, reason = auth_system.check_download_allowed()
    if not allowed:
        raise HTTPException(status_code=403, detail=reason)

    task_id = payload.task_id or uuid.uuid4().hex[:10]
    background_tasks.add_task(
        run_yt_dlp_download,
        task_id=task_id,
        url=payload.url,
        format_id=payload.format_id,
        is_audio=payload.is_audio,
        title=payload.title or "OmniDownload",
        quality_label=payload.quality_label,
        thumbnail=payload.thumbnail,
        duration=payload.duration,
        uploader=payload.uploader,
        start_time=payload.start_time,
        end_time=payload.end_time,
        download_subtitles=payload.download_subtitles
    )
    return {"success": True, "task_id": task_id}

@app.get("/api/progress/{task_id}")
async def get_download_progress(task_id: str):
    if task_id not in DOWNLOAD_TASKS:
        # Check if stored in active tasks db
        tasks = load_active_tasks()
        if task_id in tasks:
            return tasks[task_id]
        raise HTTPException(status_code=404, detail="Task not found")
    return DOWNLOAD_TASKS[task_id]

# Authentication & 7-Day Trial System
@app.get("/api/auth/status")
async def get_auth_status_endpoint():
    return auth_system.get_auth_status()

@app.post("/api/auth/register")
async def register_user_endpoint(payload: RegisterRequest):
    success, msg, user = auth_system.register_user(payload.name, payload.email, payload.password)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg, "user": user}

@app.post("/api/auth/login")
async def login_user_endpoint(payload: LoginRequest):
    success, msg, user = auth_system.login_user(payload.email, payload.password)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg, "user": user}

@app.post("/api/auth/logout")
async def logout_user_endpoint():
    auth_system.logout_user()
    return {"success": True, "message": "Logged out successfully"}

# Playlist State Persistence
@app.get("/api/playlists")
async def get_saved_playlists():
    try:
        data = json.loads(PLAYLISTS_DB.read_text(encoding="utf-8"))
        return {"playlists": list(data.values())}
    except Exception:
        return {"playlists": []}

@app.post("/api/playlists/save")
async def save_playlist_state(payload: SavePlaylistStateRequest):
    try:
        data = json.loads(PLAYLISTS_DB.read_text(encoding="utf-8"))
        data[payload.playlist_id] = payload.data
        PLAYLISTS_DB.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/playlists/{playlist_id}")
async def delete_saved_playlist(playlist_id: str):
    try:
        data = json.loads(PLAYLISTS_DB.read_text(encoding="utf-8"))
        if playlist_id in data:
            del data[playlist_id]
            PLAYLISTS_DB.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/file")
@app.get("/api/file/{filename}")
async def download_file_direct(filename: Optional[str] = None, req: Request = None):
    import urllib.parse
    target_name = filename
    if not target_name and req:
        target_name = req.query_params.get("filename")
    if not target_name:
        raise HTTPException(status_code=400, detail="Filename required")

    download_dir = get_download_dir()
    file_path = download_dir / target_name
    
    # Fallback search if exact path resolution fails due to URL decoding variances
    if not file_path.exists() or not file_path.is_file():
        for f in download_dir.iterdir():
            if f.is_file() and (f.name == target_name or f.name.strip() == target_name.strip()):
                file_path = f
                break

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Ensure MP4 file is universally compatible with Android Gallery and iOS
    if file_path.suffix.lower() == ".mp4":
        file_path = Path(ensure_mobile_compatible_mp4(str(file_path)))
    
    is_audio = file_path.suffix.lower() in [".mp3", ".m4a", ".wav", ".aac", ".opus", ".ogg", ".flac"]
    ascii_clean = re.sub(r'[^\x20-\x7E]', '_', file_path.name)
    encoded = urllib.parse.quote(file_path.name)
    force_download = False
    if req and req.query_params.get("download") in ["1", "true", "yes"]:
        force_download = True
    disp_type = "attachment" if force_download else "inline"
    disposition = f'{disp_type}; filename="{ascii_clean}"; filename*=UTF-8\'\'{encoded}'
    
    return FileResponse(
        path=str(file_path),
        media_type="audio/mpeg" if is_audio else "video/mp4",
        headers={"Content-Disposition": disposition}
    )

@app.post("/api/open-file")
async def open_downloaded_file(payload: Dict[str, str]):
    filename = payload.get("filename")
    if not filename:
        raise HTTPException(status_code=400, detail="Filename missing")
    file_path = get_download_dir() / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File does not exist")
    
    try:
        if sys.platform == "win32":
            os.startfile(str(file_path))
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(file_path)])
        else:
            subprocess.Popen(["xdg-open", str(file_path)])
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/show-in-folder")
async def show_in_folder(payload: Dict[str, str]):
    filename = payload.get("filename")
    if not filename:
        raise HTTPException(status_code=400, detail="Filename missing")
    file_path = get_download_dir() / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File does not exist")
    
    try:
        if sys.platform == "win32":
            subprocess.Popen(f'explorer /select,"{file_path}"')
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R", str(file_path)])
        else:
            subprocess.Popen(["xdg-open", str(file_path.parent)])
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/downloads")
@app.delete("/api/downloads/{filename:path}")
@app.post("/api/downloads")
@app.post("/api/downloads/delete")
@app.post("/api/downloads/delete/{filename:path}")
async def delete_downloaded_file(filename: Optional[str] = None, req: Request = None):
    target_name = filename
    if not target_name and req:
        target_name = req.query_params.get("filename")
        if not target_name:
            try:
                body = await req.json()
                target_name = body.get("filename")
            except Exception:
                pass

    if not target_name:
        raise HTTPException(status_code=400, detail="Filename required")

    download_dir = get_download_dir()
    deleted = False

    # 1. Direct path check
    file_path = download_dir / target_name
    if file_path.exists() and file_path.is_file():
        try:
            os.remove(file_path)
            deleted = True
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete file: {e}")

    # 2. Iteration match (handles url-decoding / character differences)
    if not deleted:
        for f in download_dir.iterdir():
            if f.is_file() and (f.name == target_name or f.name.strip() == target_name.strip()):
                try:
                    os.remove(f)
                    deleted = True
                    break
                except Exception as e:
                    raise HTTPException(status_code=500, detail=f"Failed to delete file: {e}")

    # Clean leftover partials
    for part_f in download_dir.glob(f"{target_name}*.part"):
        try:
            os.remove(part_f)
        except Exception:
            pass

    # Remove metadata
    try:
        data = json.loads(METADATA_DB.read_text(encoding="utf-8"))
        if target_name in data:
            del data[target_name]
            METADATA_DB.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass

    return {"success": True, "message": f"Deleted {target_name}"}

@app.get("/api/downloads")
async def list_local_downloads():
    files = []
    meta_data = {}
    target_dir = get_download_dir()
    try:
        meta_data = json.loads(METADATA_DB.read_text(encoding="utf-8"))
    except Exception:
        pass

    allowed_exts = {".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".mp3", ".m4a", ".wav", ".aac", ".opus", ".ogg", ".flac"}

    for f in target_dir.glob("*.*"):
        if not f.is_file():
            continue
        ext = f.suffix.lower()
        if ext not in allowed_exts:
            continue
        # Skip temporary, unmerged or intermediate stream format chunks (e.g. .f251.webm, .f399.mp4, .compat.mp4)
        if re.search(r'\.f[0-9a-zA-Z_-]+\.(mp4|webm|m4a|mkv)$', f.name):
            continue
        if f.name.endswith(".part") or f.name.endswith(".ytdl") or f.name.endswith(".tmp") or f.name.endswith(".compat.mp4"):
            continue

        stat = f.stat()
        file_meta = meta_data.get(f.name, {})
        files.append({
            "name": f.name,
            "title": file_meta.get("title", f.name),
            "thumbnail": file_meta.get("thumbnail", ""),
            "duration": file_meta.get("duration", ""),
            "uploader": file_meta.get("uploader", ""),
            "size": format_bytes(stat.st_size),
            "created": file_meta.get("created", time.strftime("%Y-%m-%d %H:%M", time.localtime(stat.st_mtime))),
            "path": str(f),
            "is_audio": ext in [".mp3", ".m4a", ".wav", ".aac", ".opus", ".ogg", ".flac"]
        })
    files.sort(key=lambda x: x["created"], reverse=True)
    return {"downloads": files, "folder": str(target_dir)}

@app.post("/api/open-folder")
async def open_download_folder():
    target_dir = get_download_dir()
    try:
        if sys.platform == "win32":
            os.startfile(str(target_dir))
        else:
            subprocess.Popen(["xdg-open", str(target_dir)])
        return {"success": True, "message": "Folder opened"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/clipboard")
async def get_clipboard_text():
    try:
        if sys.platform == "win32":
            import ctypes
            from ctypes import wintypes
            CF_UNICODETEXT = 13
            user32 = ctypes.windll.user32
            kernel32 = ctypes.windll.kernel32
            
            user32.OpenClipboard.argtypes = [wintypes.HWND]
            user32.OpenClipboard.restype = wintypes.BOOL
            user32.GetClipboardData.argtypes = [wintypes.UINT]
            user32.GetClipboardData.restype = wintypes.HANDLE
            user32.CloseClipboard.argtypes = []
            user32.CloseClipboard.restype = wintypes.BOOL
            
            kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
            kernel32.GlobalLock.restype = ctypes.c_void_p
            kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
            kernel32.GlobalUnlock.restype = wintypes.BOOL

            if user32.OpenClipboard(None):
                try:
                    h_data = user32.GetClipboardData(CF_UNICODETEXT)
                    if h_data:
                        p_data = kernel32.GlobalLock(h_data)
                        if p_data:
                            text = ctypes.wstring_at(p_data)
                            kernel32.GlobalUnlock(h_data)
                            return {"text": text}
                finally:
                    user32.CloseClipboard()
    except Exception as e:
        print("Clipboard read error:", e)
    return {"text": ""}

@app.get("/api/settings")
async def get_settings_endpoint():
    return load_settings()

@app.post("/api/settings")
async def update_settings_endpoint(payload: SettingsUpdateRequest):
    current = load_settings()
    if payload.download_dir is not None:
        current["download_dir"] = payload.download_dir
    if payload.auto_clipboard is not None:
        current["auto_clipboard"] = payload.auto_clipboard
    if payload.auto_shutdown is not None:
        current["auto_shutdown"] = payload.auto_shutdown
    if payload.download_subtitles is not None:
        current["download_subtitles"] = payload.download_subtitles
    if payload.auto_check_updates is not None:
        current["auto_check_updates"] = payload.auto_check_updates
    if payload.update_url is not None:
        current["update_url"] = payload.update_url
    save_settings(current)
    return {"success": True, "settings": current}

def parse_version_tuple(v: str):
    nums = re.findall(r'\d+', str(v))
    return [int(n) for n in nums] if nums else [0]

def is_newer_version(latest_ver: str, current_ver: str) -> bool:
    try:
        latest = parse_version_tuple(latest_ver)
        current = parse_version_tuple(current_ver)
        length = max(len(latest), len(current))
        latest += [0] * (length - len(latest))
        current += [0] * (length - len(current))
        return latest > current
    except Exception:
        return False

@app.get("/api/version")
async def get_app_version():
    settings = load_settings()
    return {
        "app_name": APP_NAME,
        "current_version": APP_VERSION,
        "update_url": settings.get("update_url", DEFAULT_UPDATE_URL),
        "auto_check_updates": settings.get("auto_check_updates", True)
    }

@app.post("/api/check-update")
async def check_update_endpoint(payload: Optional[CheckUpdateRequest] = None):
    settings = load_settings()
    target_url = (payload and payload.update_url) or settings.get("update_url") or DEFAULT_UPDATE_URL
    
    import urllib.request
    try:
        req = urllib.request.Request(
            target_url,
            headers={"User-Agent": f"UVD-App/{APP_VERSION}"}
        )
        with urllib.request.urlopen(req, timeout=6) as response:
            if response.status == 200:
                manifest = json.loads(response.read().decode('utf-8'))
                latest_version = str(manifest.get("latest_version", APP_VERSION))
                update_available = is_newer_version(latest_version, APP_VERSION)
                
                return {
                    "success": True,
                    "current_version": APP_VERSION,
                    "latest_version": latest_version,
                    "update_available": update_available,
                    "release_name": manifest.get("release_name", f"UVD v{latest_version}"),
                    "release_date": manifest.get("release_date", ""),
                    "changelog": manifest.get("changelog", []),
                    "download_url": manifest.get("download_url", ""),
                    "mandatory": manifest.get("mandatory", False)
                }
    except Exception as e:
        return {
            "success": False,
            "current_version": APP_VERSION,
            "latest_version": APP_VERSION,
            "update_available": False,
            "message": "You are currently running the latest version or update server is offline.",
            "detail": str(e)
        }

@app.post("/api/open-link")
async def open_link_endpoint(payload: OpenLinkRequest):
    try:
        import webbrowser
        webbrowser.open(payload.url)
        return {"success": True}
    except Exception as e:
        return {"success": False, "detail": str(e)}

@app.post("/api/select-folder")
async def select_folder_dialog_endpoint():
    try:
        selected_path = None
        
        # Method 1: Native PyWebView window dialog (Modern Windows 11/10 File Explorer)
        try:
            import webview
            active_win = None
            if hasattr(webview, 'active_window') and callable(webview.active_window):
                active_win = webview.active_window()
            if not active_win and getattr(webview, 'windows', None):
                active_win = webview.windows[0]
            
            if active_win:
                folder_dialog_type = getattr(getattr(webview, 'FileDialog', None), 'FOLDER', getattr(webview, 'FOLDER_DIALOG', 20))
                res = active_win.create_file_dialog(folder_dialog_type)
                if res:
                    if isinstance(res, (list, tuple)) and len(res) > 0:
                        selected_path = res[0]
                    elif isinstance(res, str):
                        selected_path = res
        except Exception as e:
            print("PyWebView file dialog fallback:", e)

        # Method 2: Modern Windows Open Folder Dialog via hidden background PowerShell process
        if not selected_path:
            ps_code = """
            Add-Type -AssemblyName System.Windows.Forms
            $f = New-Object System.Windows.Forms.OpenFileDialog
            $f.ValidateNames = $false
            $f.CheckFileExists = $false
            $f.CheckPathExists = $true
            $f.FileName = 'Select Folder'
            $f.Title = 'Select Download Directory'
            if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                [System.IO.Path]::GetDirectoryName($f.FileName)
            }
            """
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            si.wShowWindow = 0  # SW_HIDE
            
            res = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps_code],
                capture_output=True,
                text=True,
                startupinfo=si,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
                timeout=45
            )
            out = res.stdout.strip()
            if out and os.path.exists(out):
                selected_path = out

        if selected_path and os.path.exists(selected_path):
            current_settings = load_settings()
            current_settings["download_dir"] = selected_path
            save_settings(current_settings)
            return {"success": True, "download_dir": selected_path}

    except Exception as e:
        print("Folder selection error:", e)
        return {"success": False, "detail": str(e)}

    return {"success": False, "detail": "No folder selected"}

@app.post("/api/system/shutdown")
async def system_shutdown_endpoint(payload: ShutdownRequest):
    try:
        if payload.cancel:
            os.system("shutdown /a")
            return {"success": True, "message": "Shutdown cancelled."}
        else:
            os.system('shutdown /s /t 60 /c "UVD: Downloads complete. PC shutting down in 60 seconds."')
            return {"success": True, "message": "PC will shut down in 60 seconds."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class CookieUploadRequest(BaseModel):
    cookies_text: str

@app.get("/api/cookie-status")
async def get_cookie_status():
    has_cookie = COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 0
    return {"has_cookies": has_cookie, "path": str(COOKIES_FILE) if has_cookie else None}

@app.post("/api/upload-cookies")
async def upload_cookies(payload: CookieUploadRequest):
    content = payload.cookies_text.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Cookie content cannot be empty")
    COOKIES_FILE.write_text(content, encoding="utf-8")
    return {"success": True, "message": "Cookies saved successfully!"}

app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    import sys
    import os
    import threading
    import webview
    
    # Prevent stdout/stderr NoneType errors in PyInstaller --windowed mode
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w", encoding="utf-8")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w", encoding="utf-8")
        
    def free_port(port: int):
        try:
            out = subprocess.check_output(f'netstat -ano | findstr :{port}', shell=True, text=True)
            for line in out.strip().splitlines():
                parts = line.strip().split()
                if len(parts) >= 5 and f":{port}" in parts[1]:
                    pid = int(parts[-1])
                    if pid > 0 and pid != os.getpid():
                        subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
        except Exception:
            pass

    free_port(8999)

    def start_server():
        # Bind to 0.0.0.0 so Android devices on the same Wi-Fi can connect seamlessly
        uvicorn.run(app, host="0.0.0.0", port=8999, log_config=None)
        
    # Start FastAPI in a background daemon thread so it dies when the window closes
    server_thread = threading.Thread(target=start_server)
    server_thread.daemon = True
    server_thread.start()
    
    # Wait for Uvicorn to start before opening the webview
    import time
    time.sleep(1.5)
    
    # Create the native desktop window using PyWebView
    webview.create_window("UVD - Universal Video Downloader", "http://127.0.0.1:8999", width=1200, height=800, min_size=(800, 600), background_color="#090d16", text_select=True)
    webview.start(debug=False)
