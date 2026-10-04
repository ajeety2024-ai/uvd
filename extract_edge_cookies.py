import os
import sys
import json
import base64
import sqlite3
import shutil
import time
from pathlib import Path
import ctypes
from ctypes import wintypes
from Cryptodome.Cipher import AES

class DATA_BLOB(ctypes.Structure):
    _fields_ = [('cbData', wintypes.DWORD), ('pbData', ctypes.POINTER(ctypes.c_byte))]

def decrypt_dpapi(cipher_text):
    buf_in = ctypes.create_string_buffer(cipher_text, len(cipher_text))
    blob_in = DATA_BLOB(len(cipher_text), ctypes.cast(buf_in, ctypes.POINTER(ctypes.c_byte)))
    blob_out = DATA_BLOB()
    if ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)):
        cb_data = int(blob_out.cbData)
        pb_data = blob_out.pbData
        buffer = ctypes.string_at(pb_data, cb_data)
        ctypes.windll.kernel32.LocalFree(pb_data)
        return buffer
    return None

def decrypt_value(encrypted_val, key):
    try:
        iv = encrypted_val[3:15]
        payload = encrypted_val[15:]
        cipher = AES.new(key, AES.MODE_GCM, iv)
        return cipher.decrypt(payload)[:-16].decode('utf-8')
    except Exception:
        return ''

def get_edge_cookies():
    local_state_path = Path(os.environ['LOCALAPPDATA']) / 'Microsoft' / 'Edge' / 'User Data' / 'Local State'
    cookie_path = Path(os.environ['LOCALAPPDATA']) / 'Microsoft' / 'Edge' / 'User Data' / 'Default' / 'Network' / 'Cookies'
    if not local_state_path.exists() or not cookie_path.exists():
        print("Edge paths not found")
        return []
    data = json.loads(local_state_path.read_text(encoding='utf-8'))
    master_key = decrypt_dpapi(base64.b64decode(data['os_crypt']['encrypted_key'])[5:])
    temp_db = Path('temp_edge.db')
    shutil.copyfile(cookie_path, temp_db)
    conn = sqlite3.connect(temp_db)
    cursor = conn.cursor()
    cursor.execute("SELECT host_key, name, encrypted_value, path, expires_utc, is_secure, is_httponly FROM cookies WHERE host_key LIKE '%youtube.com%' OR host_key LIKE '%google.com%'")
    cookies = []
    for host, name, enc_val, path, expires, is_sec, is_http in cursor.fetchall():
        val = decrypt_value(enc_val, master_key)
        if val:
            cookies.append((host, name, val, path, expires, is_sec, is_http))
    conn.close()
    if temp_db.exists(): temp_db.unlink()
    return cookies

if __name__ == "__main__":
    c = get_edge_cookies()
    print("Extracted Edge cookies count:", len(c))
