import os
import sys
from pathlib import Path

desktop_paths = [
    Path.home() / 'Desktop',
    Path.home() / 'OneDrive' / 'Desktop',
    Path(os.environ.get('PUBLIC', 'C:\\Users\\Public')) / 'Desktop'
]
base_dir = Path(r'c:\Users\Asus\Documents\antigravity\mysterious-nobel')
target_exe = base_dir / 'dist' / 'UVD' / 'UVD.exe'
icon_ico = base_dir / 'icon.ico'

if not target_exe.exists():
    target_exe = base_dir / 'Start_Desktop_Software.bat'

vbs_code_template = f'''
Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "__SHORTCUT_PATH__"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "{str(target_exe)}"
oLink.WorkingDirectory = "{str(base_dir)}"
oLink.Description = "UVD - Universal Video Downloader"
oLink.IconLocation = "{str(icon_ico)},0"
oLink.Save
'''

for d in desktop_paths:
    if d.exists():
        sc = d / 'UVD - Universal Video Downloader.lnk'
        vbs_temp = base_dir / 'temp_sc.vbs'
        vbs_temp.write_text(vbs_code_template.replace('__SHORTCUT_PATH__', str(sc)), encoding='utf-8')
        os.system(f'cscript //nologo "{vbs_temp}"')
        if vbs_temp.exists():
            vbs_temp.unlink()
        print('Created Desktop shortcut at:', sc)

