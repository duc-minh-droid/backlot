@echo off
REM Launch ComfyUI for Qwen-Image-2.1 on an 8GB GPU.
cd /d C:\AI\ComfyUI
call venv\Scripts\activate.bat
python main.py --lowvram --use-pytorch-cross-attention
