# Colab training setup

Run this on each new Colab GPU session (T4). Everything here is repeatable, so nothing is installed by hand.

## Each session

In a Colab cell:

```
from google.colab import drive
drive.mount('/content/drive')
```

Then, in the next cells:

```
!bash /content/earth-gs/tools/colab/setup_training.sh   # first time: clone the repo, then run setup
```

On later sessions, the repo is already on the Drive backup, so clone it first:

```
!git clone --filter=blob:none --sparse https://github.com/jeevanandmaurya/earth-gs.git /content/earth-gs
!bash /content/earth-gs/tools/colab/setup_training.sh
```

Then restore the saved data and start the Drive backup in the background:

```
!bash /content/earth-gs/tools/colab/sync_to_drive.sh restore
!nohup bash /content/earth-gs/tools/colab/sync_to_drive.sh sync 600 > /content/sync.log 2>&1 &
```

## What is saved

- Every dataset folder under `earth-gs-data/datasets/` goes to `MyDrive/earth-gs/datasets/`: the rendered frames, the SfM output, poses, alignment, and training checkpoints.
- The backup runs every 10 minutes (or the interval you pass). `cp -u` copies only files that changed.

## Not yet tested

This setup was written but not run end to end on Colab. Check each step's output on the first run. In particular:

- Playwright's Chromium on Colab (`--with-deps`) and whether the browser finds the GPU through Vulkan.
- Whether Spirula can resume from a checkpoint. If not, a restarted run starts from zero, and the Drive copy still keeps the data.