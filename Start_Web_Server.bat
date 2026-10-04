@echo off
title UVD Web Server
echo ========================================================
echo   Starting UVD Server (http://localhost:8000)
echo ========================================================
start "" http://localhost:8000
python app.py
pause
