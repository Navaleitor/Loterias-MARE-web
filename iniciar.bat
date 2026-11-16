@echo off
rem Loterias Mare - doble clic para abrir el generador.
rem La primera vez instala las dependencias (necesita internet); despues abre directo.
cd /d "%~dp0"
python -c "import flask, PIL" 2>nul
if errorlevel 1 (
  echo Instalando dependencias por unica vez...
  python -m pip install -r requirements.txt
  if errorlevel 1 (
    echo.
    echo No se pudieron instalar las dependencias. Revisa que Python y el internet funcionen.
    pause
    exit /b 1
  )
)
python app.py
pause
