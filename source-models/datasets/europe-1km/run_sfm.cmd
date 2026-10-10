@echo off
echo Structure from motion on the Europe frames (480 images)
"D:\Downloads\spirula-2026.9.30-windows-vulkan-x86_64\spirula.exe" sfm auto "D:\Programming\Artificial Intelligence\earth-gs-data\datasets\europe-1km\images" -o "D:\Programming\Artificial Intelligence\earth-gs-data\datasets\europe-1km\sfm" --data-type individual
echo.
echo SfM finished with exit code %ERRORLEVEL%
pause