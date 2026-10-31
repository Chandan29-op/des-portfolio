@echo off
REM Double-click to rename new images from images\_drop and refresh js\manifest.js
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0arrange-images.ps1" %*
pause
