@echo off
if not defined EARTH_GS_DATA set "EARTH_GS_DATA=D:\Programming\Artificial Intelligence\earth-gs-data"
set "DS=%EARTH_GS_DATA%\datasets\earth-2to1-hr"
echo Converting the earth-2to1-hr step-12000 checkpoint to the app's .splat format
python "%~dp0..\..\live\convert_region.py" "%DS%" "%DS%\outputs\run1\step-000012000.ckpt\splat.ply" "%DS%\outputs\run1\earth-2to1-hr.splat"
echo.
echo Convert finished with exit code %ERRORLEVEL%
pause
