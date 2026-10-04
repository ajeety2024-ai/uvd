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
import sys
import json
import time
import math
import hashlib
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

# Hidden Digital Watermark & Cryptographic Author Verification Signature
UVD_AUTHOR_SIGNATURE = {
    "product": "UVD - Universal Video Downloader",
    "creator": "Ajeet Yadav",
    "copyright": "(c) 2026 Ajeet Yadav",
    "signature_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855_uvd_auth_root_ajeet_yadav",
    "registered_date": "2026-10-02"
}

# Storage paths
PRIMARY_DIR = Path.home() / ".omnidownloader"
PRIMARY_DIR.mkdir(parents=True, exist_ok=True)
PRIMARY_AUTH_FILE = PRIMARY_DIR / "auth_license.json"

BACKUP_DIR = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "UVD_System"
try:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_AUTH_FILE = BACKUP_DIR / "lic_meta.dat"
except Exception:
    BACKUP_AUTH_FILE = None

TRIAL_DAYS = 7
TRIAL_SECONDS = TRIAL_DAYS * 86400

def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()

def _read_backup_timestamp() -> Optional[float]:
    if not BACKUP_AUTH_FILE or not BACKUP_AUTH_FILE.exists():
        return None
    try:
        content = BACKUP_AUTH_FILE.read_text(encoding="utf-8").strip()
        data = json.loads(content)
        return float(data.get("installed_at", 0)) or None
    except Exception:
        return None

def _write_backup_timestamp(installed_at: float, device_id: str):
    if not BACKUP_AUTH_FILE:
        return
    try:
        data = {
            "device_id": device_id,
            "installed_at": installed_at
        }
        BACKUP_AUTH_FILE.write_text(json.dumps(data), encoding="utf-8")
    except Exception:
        pass

def load_auth_db() -> dict:
    default_db = {
        "device_id": uuid.uuid4().hex,
        "installed_at": time.time(),
        "current_user": None,
        "users": {}  # email -> { name, email, password_hash, salt, created_at }
    }

    backup_time = _read_backup_timestamp()

    if PRIMARY_AUTH_FILE.exists():
        try:
            data = json.loads(PRIMARY_AUTH_FILE.read_text(encoding="utf-8"))
            if not isinstance(data.get("users"), dict):
                data["users"] = {}
            if "installed_at" not in data:
                data["installed_at"] = time.time()
            if not data.get("device_id"):
                data["device_id"] = uuid.uuid4().hex

            # If backup has an earlier timestamp, keep the earlier one
            if backup_time and backup_time < data["installed_at"]:
                data["installed_at"] = backup_time
            else:
                _write_backup_timestamp(data["installed_at"], data["device_id"])

            return data
        except Exception:
            pass

    # First time initialization
    if backup_time:
        default_db["installed_at"] = backup_time

    save_auth_db(default_db)
    _write_backup_timestamp(default_db["installed_at"], default_db["device_id"])
    return default_db

def save_auth_db(db: dict):
    try:
        PRIMARY_AUTH_FILE.write_text(json.dumps(db, indent=2, ensure_ascii=False), encoding="utf-8")
        if db.get("installed_at") and db.get("device_id"):
            _write_backup_timestamp(db["installed_at"], db["device_id"])
    except Exception as e:
        print("Error saving auth db:", e)

def get_auth_status() -> dict:
    db = load_auth_db()
    now = time.time()
    installed_at = float(db.get("installed_at", now))
    trial_end = installed_at + TRIAL_SECONDS

    is_trial_active = now < trial_end
    seconds_left = max(0.0, trial_end - now)
    days_left = int(math.ceil(seconds_left / 86400.0)) if seconds_left > 0 else 0

    current_user = db.get("current_user")
    is_logged_in = bool(current_user and current_user.get("email"))

    can_download = is_logged_in or is_trial_active

    return {
        "is_logged_in": is_logged_in,
        "user": current_user,
        "is_trial_active": is_trial_active,
        "days_left": days_left,
        "seconds_left": int(seconds_left),
        "can_download": can_download,
        "trial_start_str": time.strftime("%d %b %Y", time.localtime(installed_at)),
        "trial_end_str": time.strftime("%d %b %Y, %I:%M %p", time.localtime(trial_end)),
        "device_id": db.get("device_id")
    }

def check_download_allowed() -> Tuple[bool, str]:
    status = get_auth_status()
    if status["can_download"]:
        return True, ""
    return False, "Your 7-day free trial has expired. Please create a free account or sign in to continue downloading."

def register_user(name: str, email: str, password: str) -> Tuple[bool, str, Optional[dict]]:
    name = (name or "").strip()
    email = (email or "").strip().lower()
    password = (password or "").strip()

    if not name:
        return False, "Please enter your full name.", None
    if not email or "@" not in email or "." not in email:
        return False, "Please enter a valid email address.", None
    if len(password) < 4:
        return False, "Password must be at least 4 characters long.", None

    db = load_auth_db()
    users = db.get("users", {})

    if email in users:
        return False, "An account with this email already exists. Please sign in.", None

    salt = uuid.uuid4().hex[:16]
    pw_hash = _hash_password(password, salt)

    user_info = {
        "name": name,
        "email": email,
        "password_hash": pw_hash,
        "salt": salt,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    users[email] = user_info
    db["users"] = users

    # Auto login on registration
    clean_user = {
        "name": name,
        "email": email,
        "created_at": user_info["created_at"]
    }
    db["current_user"] = clean_user
    save_auth_db(db)

    return True, "Account created successfully! Unlimited downloads are now unlocked.", clean_user

def login_user(email: str, password: str) -> Tuple[bool, str, Optional[dict]]:
    email = (email or "").strip().lower()
    password = (password or "").strip()

    if not email or not password:
        return False, "Please enter both email and password.", None

    db = load_auth_db()
    users = db.get("users", {})

    if email not in users:
        return False, "No account found with this email. Please create a new account.", None

    user = users[email]
    salt = user.get("salt", "")
    expected_hash = user.get("password_hash", "")

    if _hash_password(password, salt) != expected_hash:
        return False, "Incorrect password. Please verify and try again.", None

    clean_user = {
        "name": user.get("name", "User"),
        "email": email,
        "created_at": user.get("created_at")
    }
    db["current_user"] = clean_user
    save_auth_db(db)

    return True, "Signed in successfully! Downloads unlocked.", clean_user

def logout_user() -> bool:
    db = load_auth_db()
    db["current_user"] = None
    save_auth_db(db)
    return True

# Helper for testing / resetting trial if requested
def set_trial_installed_at(timestamp: float):
    db = load_auth_db()
    db["installed_at"] = timestamp
    save_auth_db(db)

