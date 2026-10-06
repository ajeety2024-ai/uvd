import os
import sys
import time
import ctypes
import threading
import uvicorn
import webview
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ICON_PATH = str(BASE_DIR / "icon.ico")
WINDOW_TITLE = "UVD - Universal Video Downloader"

# Prevent WebView2 screen flickering / blinking on Windows laptops (AMD Radeon / Intel GPUs)
if sys.platform == "win32":
    existing_args = os.environ.get("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "")
    flags = "--disable-gpu-compositing --disable-direct-composition --disable-features=CalculateNativeWinOcclusion"
    if flags not in existing_args:
        os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = f"{existing_args} {flags}".strip()

    try:
        app_id = "uvd.universal.video.downloader.app"
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(app_id)
    except Exception:
        pass

def set_native_window_icon():
    """Injects UVD icon directly into the Windows HWND taskbar and titlebar."""
    if sys.platform != "win32" or not os.path.exists(ICON_PATH):
        return

    IMAGE_ICON = 1
    LR_LOADFROMFILE = 0x00000010
    hicon_big = ctypes.windll.user32.LoadImageW(None, ICON_PATH, IMAGE_ICON, 256, 256, LR_LOADFROMFILE)
    hicon_small = ctypes.windll.user32.LoadImageW(None, ICON_PATH, IMAGE_ICON, 32, 32, LR_LOADFROMFILE)
    
    if not hicon_big:
        hicon_big = ctypes.windll.user32.LoadImageW(None, ICON_PATH, IMAGE_ICON, 0, 0, LR_LOADFROMFILE)
        hicon_small = hicon_big

    WM_SETICON = 0x0080
    ICON_SMALL = 0
    ICON_BIG = 1

    # Poll for window handle up to 10 seconds
    for _ in range(40):
        hwnd = ctypes.windll.user32.FindWindowW(None, WINDOW_TITLE)
        if hwnd:
            if hicon_small:
                ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon_small)
            if hicon_big:
                ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon_big)
            break
        time.sleep(0.2)

def start_server():
    from app import app
    uvicorn.run(app, host="127.0.0.1", port=8877, log_level="warning")

def wait_for_server(port=8877, max_seconds=2.5):
    import socket
    start_time = time.time()
    while time.time() - start_time < max_seconds:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.03):
                return True
        except (OSError, ConnectionRefusedError):
            time.sleep(0.015)
    return False

def main():
    # Start server in background thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # Start icon injector thread
    icon_thread = threading.Thread(target=set_native_window_icon, daemon=True)
    icon_thread.start()

    # Fast dynamic socket check: launches as soon as server binds (~40ms) instead of waiting 1.2s
    wait_for_server(8877)

    # Launch Desktop Software Window with UVD Icon
    window = webview.create_window(
        title=WINDOW_TITLE,
        url="http://127.0.0.1:8877",
        width=1120,
        height=800,
        min_size=(420, 600),
        background_color="#090d16",
        text_select=True
    )
    webview.start(debug=False)

if __name__ == "__main__":
    main()
