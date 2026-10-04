"""
================================================================================
UVD Cloud Tunnel Launcher
Creator / Author: Ajeet Yadav
Copyright (c) 2026 Ajeet Yadav. All Rights Reserved.
================================================================================
"""

import sys
import os
import re
import time
import subprocess
import threading
import urllib.request
from pathlib import Path

# Safe stdout encoding for Windows cp1252 / cmd
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent
CLOUDFLARED_EXE = BASE_DIR / "cloudflared.exe"
LINK_FILE = BASE_DIR / "cloud_link.txt"
QR_HTML_FILE = BASE_DIR / "cloud_link_qr.html"

def is_server_running(port=8999):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/version", timeout=1.5) as res:
            return res.status == 200
    except Exception:
        return False

def start_uvicorn_server():
    import uvicorn
    import app as uvd_app
    uvicorn.run(uvd_app.app, host="0.0.0.0", port=8999, log_level="warning")

def generate_qr_html(url: str):
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UVD Mobile Connect - Ajeet Yadav</title>
  <style>
    body {{
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
      text-align: center;
    }}
    .card {{
      background: #111827;
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 20px;
      padding: 32px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }}
    .badge {{
      display: inline-block;
      background: rgba(99, 102, 241, 0.2);
      color: #818cf8;
      border: 1px solid rgba(99, 102, 241, 0.3);
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 16px;
    }}
    h1 {{
      font-size: 22px;
      margin: 0 0 8px 0;
      font-weight: 800;
      color: #ffffff;
    }}
    p {{
      color: #94a3b8;
      font-size: 14px;
      margin: 0 0 24px 0;
      line-height: 1.5;
    }}
    .qr-box {{
      background: #ffffff;
      padding: 16px;
      border-radius: 16px;
      display: inline-block;
      margin-bottom: 24px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
    }}
    .qr-box img {{
      display: block;
      width: 220px;
      height: 220px;
    }}
    .link-box {{
      background: #1e293b;
      border: 1px solid #334155;
      padding: 12px;
      border-radius: 10px;
      font-family: monospace;
      font-size: 13px;
      color: #38bdf8;
      word-break: break-all;
      margin-bottom: 16px;
      user-select: all;
    }}
    .btn {{
      background: #4f46e5;
      color: #ffffff;
      padding: 12px 24px;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      display: inline-block;
      transition: background 0.2s;
    }}
    .btn:hover {{
      background: #4338ca;
    }}
    .footer {{
      margin-top: 24px;
      font-size: 12px;
      color: #64748b;
    }}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">UVD Cloud Mobile Link</div>
    <h1>Scan to Open UVD on Mobile</h1>
    <p>Scan this QR code with your Android phone's Camera or Google Lens to use UVD!</p>
    
    <div class="qr-box">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data={url}" alt="UVD QR Code">
    </div>

    <div class="link-box">{url}</div>
    
    <a href="{url}" target="_blank" class="btn">Open in Browser</a>
    
    <div class="footer">
      Creator & Author: Ajeet Yadav &bull; Universal Video Downloader
    </div>
  </div>
</body>
</html>"""
    QR_HTML_FILE.write_text(html, encoding="utf-8")

def main():
    print("=" * 60)
    print("  UVD - Universal Video Downloader | Cloud Tunnel")
    print("  Author & Creator: Ajeet Yadav")
    print("=" * 60)

    # 1. Ensure server is up
    if not is_server_running(8999):
        print("[*] Starting UVD Server on port 8999...")
        t = threading.Thread(target=start_uvicorn_server, daemon=True)
        t.start()
        # Wait up to 10 seconds for server to respond
        for _ in range(20):
            time.sleep(0.5)
            if is_server_running(8999):
                break
        print("[+] UVD Server is online on port 8999!")
    else:
        print("[+] UVD Server is already running on port 8999.")

    # 2. Check cloudflared binary
    if not CLOUDFLARED_EXE.exists():
        print("[-] cloudflared.exe not found!")
        sys.exit(1)

    # 3. Launch cloudflared tunnel with auto-reconnect
    while True:
        print("[*] Connecting to Cloudflare Secure Tunnel...")
        cmd = [str(CLOUDFLARED_EXE), "tunnel", "--url", "http://127.0.0.1:8999", "--no-autoupdate"]
        
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace"
        )

        tunnel_url = None
        url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")

        for line in iter(proc.stdout.readline, ""):
            match = url_pattern.search(line)
            if match and not tunnel_url:
                tunnel_url = match.group(0)
                LINK_FILE.write_text(tunnel_url, encoding="utf-8")
                generate_qr_html(tunnel_url)
                print("\n" + "=" * 60)
                print("  [SUCCESS] UVD LIVE CLOUD LINK IS READY!")
                print(f"  URL: {tunnel_url}")
                print("=" * 60)
                print("  1. Open this link on ANY mobile phone (Android / iPhone)!")
                print("  2. Works on Mobile Data (5G/4G) and Wi-Fi anywhere.")
                print(f"  3. QR Code page created: {QR_HTML_FILE}")
                print("  Press Ctrl+C to stop the tunnel.\n")
                sys.stdout.flush()

        proc.wait()
        print("[!] Tunnel disconnected. Reconnecting in 3 seconds...")
        time.sleep(3)

if __name__ == "__main__":
    main()
