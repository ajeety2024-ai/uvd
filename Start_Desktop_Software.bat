@echo off
title UVD - Universal Video Downloader
echo ========================================================
echo   Launching UVD (Universal Video Downloader)...
echo ========================================================
if exist "dist\UVD\UVD.exe" (
    start "" "dist\UVD\UVD.exe"
) else (
    python desktop_app.py
)

