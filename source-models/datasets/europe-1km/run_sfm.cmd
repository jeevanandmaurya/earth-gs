@echo off
if not defined EARTH_GS_DATA set "EARTH_GS_DATA=D:\Programming\Artificial Intelligence\earth-gs-data"
if not defined SPIRULA_EXE set "SPIRULA_EXE=D:\Downloads\spirula-2026.9.30-windows-vulkan-x86_64\spirula.exe"
echo Structure from motion on the Europe frames (480 images)
"%SPIRULA_EXE%" sfm auto "%EARTH_GS_DATA%\datasets\europe-1km\images" -o "%EARTH_GS_DATA%\datasets\europe-1km\sfm" --data-type individual
echo.
echo SfM finished with exit code %ERRORLEVEL%
pause