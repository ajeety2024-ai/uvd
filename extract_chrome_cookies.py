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
        decrypted = cipher.decrypt(payload)[:-16].decode('utf-8')
        return decrypted
    except Exception:
        return ''

def read_locked_file_win32(path_str):
    GENERIC_READ = 0x80000000
    FILE_SHARE_READ = 0x00000001
    FILE_SHARE_WRITE = 0x00000002
    FILE_SHARE_DELETE = 0x00000004
    OPEN_EXISTING = 3
    FILE_ATTRIBUTE_NORMAL = 0x80
    INVALID_HANDLE_VALUE = -1

    handle = ctypes.windll.kernel32.CreateFileW(
        path_str,
        GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        None,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        None
    )
    if handle == INVALID_HANDLE_VALUE:
        return None
    
    try:
        size_high = wintypes.DWORD()
        size_low = ctypes.windll.kernel32.GetFileSize(handle, ctypes.byref(size_high))
        total_size = (size_high.value << 32) + size_low
        
        buf = ctypes.create_string_buffer(total_size)
        bytes_read = wintypes.DWORD()
        res = ctypes.windll.kernel32.ReadFile(handle, buf, total_size, ctypes.byref(bytes_read), None)
        if not res:
            return None
        return buf.raw[:bytes_read.value]
    finally:
        ctypes.windll.kernel32.CloseHandle(handle)

def get_chrome_cookies():
    local_state_path = Path(os.environ['LOCALAPPDATA']) / 'Google' / 'Chrome' / 'User Data' / 'Local State'
    cookie_path = Path(os.environ['LOCALAPPDATA']) / 'Google' / 'Chrome' / 'User Data' / 'Default' / 'Network' / 'Cookies'
    
    if not local_state_path.exists() or not cookie_path.exists():
        print("Chrome paths not found")
        return []
        
    data = json.loads(local_state_path.read_text(encoding='utf-8'))
    encrypted_key = base64.b64decode(data['os_crypt']['encrypted_key'])[5:]
    master_key = decrypt_dpapi(encrypted_key)
    
    temp_db = Path('temp_chrome_cookies.db')
    content = read_locked_file_win32(str(cookie_path))
    if not content:
        print("Win32 read failed")
        return []
    temp_db.write_bytes(content)

    
    conn = sqlite3.connect(temp_db)
    cursor = conn.cursor()
    cursor.execute("SELECT host_key, name, encrypted_value, path, expires_utc, is_secure, is_httponly FROM cookies WHERE host_key LIKE '%youtube.com%' OR host_key LIKE '%google.com%'")
    
    cookies = []
    for host, name, enc_val, path, expires, is_sec, is_http in cursor.fetchall():
        val = decrypt_value(enc_val, master_key)
        if val:
            cookies.append((host, name, val, path, expires, is_sec, is_http))
            
    conn.close()
    if temp_db.exists(): 
        temp_db.unlink()
    return cookies

if __name__ == "__main__":
    cookies = get_chrome_cookies()
    print(f"Extracted {len(cookies)} authenticated Chrome cookies!")
    
    lines = ['# Netscape HTTP Cookie File', '# https://curl.haxx.se/rfc/cookie_spec.html', '# This is a generated file!  Do not edit.', '']
    for host, name, val, path, expires, is_sec, is_http in cookies:
        include_subdomain = 'TRUE' if host.startswith('.') else 'FALSE'
        secure_str = 'TRUE' if is_sec else 'FALSE'
        exp_sec = int(expires / 1000000 - 11644473600) if expires else int(time.time() + 31536000)
        lines.append(f'{host}\t{include_subdomain}\t{path}\t{secure_str}\t{exp_sec}\t{name}\t{val}')
        
    Path('cookies.txt').write_text('\n'.join(lines), encoding='utf-8')
    print("Saved to cookies.txt successfully!")
