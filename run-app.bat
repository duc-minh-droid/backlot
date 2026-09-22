@echo off
REM Start ComfyUI first with run-comfyui.bat, then run this.
REM The app talks to ComfyUI through Vite's proxy, so ComfyUI needs no extra flags.
cd /d %~dp0app
if not exist node_modules\vite (
  echo Installing dependencies...
  call npm install
)
start "" http://127.0.0.1:5173
call npm run dev
