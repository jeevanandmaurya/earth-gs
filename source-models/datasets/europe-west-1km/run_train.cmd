@echo off
echo Training the Europe-west chunk: 160 views, cap 2,000,000 splats, 7,000 steps
"D:\Downloads\spirula-2026.9.30-windows-vulkan-x86_64\spirula.exe" train centered-object --data "D:\Programming\Artificial Intelligence\earth-gs\source-models\datasets\europe-west-1km" --data-format colmap --colmap-recon-dir sfm/sparse/0 --num-iterations 7000 --cap-max 2000000 --steps-per-save 500 --disable-viewer 1 --output-dir-prefix "D:\Programming\Artificial Intelligence\earth-gs\source-models\datasets\europe-west-1km\outputs" --output-dir-name run1 --device auto
echo.
echo Training finished with exit code %ERRORLEVEL%
pause