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

# Set explicit Windows App User Model ID so Taskbar shows dedicated UVD icon
if sys.platform == "win32":
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

def main():
    # Start server in background thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # Start icon injector thread
    icon_thread = threading.Thread(target=set_native_window_icon, daemon=True)
    icon_thread.start()

    time.sleep(1.2)

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
