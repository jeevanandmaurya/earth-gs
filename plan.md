# earth-gs: full plan

## 1. Vision and rules

A real-scale Earth in the browser. Everything is procedural or open basemap by default, and Gaussian splats fill in real places on demand. You or agents work from a ranked list of places, each at a stated level of detail.

Rules that never bend:

1. **Chunk is the unit** of work, cache, license, retraining and removal.
2. **Real coordinates or it doesn't ship.** A chunk without a verified georegistration is not published.
3. **No Google imagery** in training, display or pose derivation. "Google Earth" means our own globe UI, with an open basemap.
4. **Provenance on every chunk from the first build.** Unknown license means default-deny.
5. **Open source.** Code is Apache-2.0 (or MIT). Data licenses are chosen per source (see §9).

## 2. Coordinates and drift correction

**Frames**

* **Global grid:** S2 cells or a WGS84 quadtree with stable tile IDs. Depth maps to LOD, from region scale down to chunks of about 50 m.
* **Splats live in a local ENU frame** with the chunk origin. Each chunk has a double-precision transform to **ECEF**. Store ellipsoid height, and check against the Copernicus DEM.
* **Rendering:** camera-relative, floating-origin rendering. Float32 on the GPU breaks at Earth scale, so ECEF math stays in doubles on the CPU.

**Georegistration at ingest**

1. SfM (GLOMAP, COLMAP fallback) gives relative poses.
2. A similarity transform fits them to anchors: image GPS/RTK, ground control points, known landmark coordinates, DEM and OSM footprints.
3. The residual error is written to the manifest. Above the threshold, the chunk is "unregistered" and stays out of public tiers.

**Drift correction (proposed, untested)**

* **Why it is cheap:** splats are stored in the local frame, so a correction only updates the chunk's transform in the manifest. No retraining and no re-upload of splat data.
* **Check points:** hold out some anchors that the fit never sees, and measure error against them.
* **Detection:** a periodic job compares each chunk against DEM height, OSM footprints, and the overlap with neighbouring chunks. Drift shows up as a consistent offset, a rotation, or a seam mismatch.
* **Correction:** robust re-fit (RANSAC, then ICP against DEM and footprints), applied in two passes:
  * *Local:* per-chunk transform.
  * *Neighbourhood:* a joint adjustment across adjacent chunks so seams agree.
* **Gating:** each correction is a new versioned transform. Accept only if hold-out error improves, and keep the previous version for rollback. Errors above a hard limit trigger re-registration from raw data, not a patch.
* **Surfaced in UI:** each place shows its registration error in meters and when it was last verified.

## 3. Sky, sun and space (non-Gaussian)

Everything outside captured ground content is procedural.

**Layers, back to front:** star catalogue (Hipparcos/Gaia bright subset), Milky Way, sun, moon, planets (optional), atmosphere shader, Earth globe and basemap, splat chunks.

**Real astronomy**

* One **UTC clock** (play, pause, scrub, speed up). Everything derives from it.
* Use a standard ephemeris library such as astronomy-engine (MIT) for sun, moon and planets. Do not hand-roll it.
* **Earth rotation:** Earth rotation angle (IAU 2006 model), with precession and nutation from the library. The globe orientation, star sky and sun direction all come from the same clock, so they cannot disagree.
* **Atmosphere:** analytic scattering shader (Bruneton, or cheaper Hosek-Wilkie/Preetham on phones). Sunrise, sunset and twilight colours fall out of it.
* **Clouds:** optional, from open weather data, labelled "approximate".

**Honest limit:** splats have **baked lighting** from the moment of capture. Moving the sun changes the sky and globe lighting but not the shadows inside a splat chunk. So there are two modes:

* **Capture time (default for splats):** sky matches when the photos were taken, using EXIF time where present.
* **Real now / scrub:** sky follows the clock, with a warning badge where splat lighting no longer matches. Cheap tinting is possible, but it is not true relighting.

## 4. Data and licensing

Tiers from the research, applied to every source record:


| Tier | Examples                                                                         | Rule                     |
| ---- | -------------------------------------------------------------------------------- | ------------------------ |
| A    | Own captures, CC0/CC BY contributions, Sentinel-2, Landsat, NAIP, Copernicus DEM | Publish with attribution |
| B    | Mapillary (CC BY-SA), OSM-derived (ODbL), OAM per-item                           | Hold for counsel review  |
| C    | Tanks and Temples, MatrixCity, Inria 3DGS trainer                                | Internal research only   |
| D    | Google Earth/Maps/Earth Studio, BungeeNeRF scenes                                | Never                    |
| Hold | Mill-19, UrbanScene3D, GauU-Scene, Mip-NeRF 360                                  | Default-deny             |

Open-source implication: share-alike sources (CC BY-SA, ODbL) can force the same terms on derived data. Since you're open-sourcing the data anyway, this is easier for you than for a commercial project, but it still needs counsel review. This is not legal advice.

## 5. First work list: seven wonders

I assumed the New 7 Wonders (Great Wall, Petra, Christ the Redeemer, Machu Picchu, Chichen Itza, Colosseum, Taj Mahal). Each gets a **capture audit** first:

* Search Wikimedia Commons (per-file license, some with GPS), open drone sets, OAM, and open institutional scans.
* Record: photo count, overlap estimate, license tier, expected LOD ceiling.
* Sites with weak open coverage are flagged **"needs capture"** and stay on the list at coarse LOD until someone captures them.
* Expect uneven results. Commons tourist photos can work for single monuments, but rooftops and interiors are likely weak, and the Great Wall is a linear 20,000 km feature, so pick one section.

**Registry fields per place:** tile IDs, name, status, target LOD, achieved LOD, sources, license tier, registration error, `votes` (empty for now), last verified.

## 6. Pipeline


| Stage       | Choice                                                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intake      | Licence gate, EXIF, face/plate blur before any publish                                                                                              |
| Poses       | GLOMAP, COLMAP fallback, RPC models for native satellite                                                                                            |
| Georegister | §2                                                                                                                                                 |
| Chunk plan  | CityGaussian-style: coarse global prior, grid split, views assigned by contribution or camera inside block, crop to core bounds                     |
| Train       | gsplat (Apache-2.0), MCMC with hard cap, absgrad, low-res start.**Start at 1-3M Gaussians per chunk**until a T4 timing replaces the planning figure |
| Checkpoint  | Atomic every 1-2K iterations: params, Adam state, counters, scheduler, RNG                                                                          |
| QA          | PSNR + LPIPS on held-out views, border-view seam check, registration error                                                                          |
| Encode      | SOG v2 per chunk (about 14-16 bytes per splat fine, 8-10 coarse as proposals), SH as separate band chunks                                           |
| LOD tree    | splat-transform to Streamed SOG, after licence check                                                                                                |
| Publish     | Content-hashed immutable files on a CDN, manifest points to current versions                                                                        |

**Manifest per chunk:** ID, bounds, ECEF transform (versioned), LOD, bytes, hash, sources and licenses, metrics, config hash, capture time.

## 7. The app

**Globe**

* Open basemap (Sentinel/NAIP/OSM) with a coverage overlay: empty, queued, training, low LOD, high LOD.
* Zoom in and splats stream in coarse-first within a per-device budget (about 0.5M phone, up to 2.5M+ desktop).
* PlayCanvas engine, WebGPU with WebGL2 fallback, version pinned.

**Camera and POV tools**

* Fly to any lat/lon/height/heading/pitch and render from that exact pose.
* **SfM camera view:** every registered source photo has a pose. Click a pose to jump to that photo's viewpoint, or overlay the original photo on the render to compare. This is the "our own camera POV instead of Google images" feature.
* Street-level mode: drop a pegman wherever splats exist.
* Import a pose (EXIF or SfM file) and render the matching view.

**Creative tools:** camera-path editor with video export, measure (distance, height, area in real units), slice/section views, pins and annotations, swipe compare (two captures, or splat vs basemap), shareable URL carrying coordinates, pose and time.

**Place page:** status, LOD, sources and attribution, license tier, registration error, time of capture, "contribute data" and "contribute compute".

**Settings:** quality vs data budget, max splats per device, WebGPU/WebGL toggle, units, basemap, time mode (capture/real now), privacy, compute donation limits (hours, temperature, schedule).

## 8. Demand, voting, contribution

* **Phase 1:** private work list ranked by you, with agents pulling from the same queue. No accounts.
* **Later:** accounts, a request button on any tile, a weekly vote budget per account, and ranking = votes × data feasibility × license-clear factor. A place with no legal data can collect votes but is flagged "needs capture". Public leaderboard (top requested, in progress, completed). Your admin pin list always overrides.
* **Data contributions:** upload with GPS, choose a license at upload, auto-blur, pose gate before it counts.
* **Compute contributions:** a worker client pulls a chunk job, trains, checkpoints and uploads. Verify by re-evaluating on held-out views, with random spot re-runs. Contributors earn vote budget and attribution. Check Colab's acceptable-use terms before relying on it for unattended loops.

## 9. Open-source setup

* **Code:** Apache-2.0 (matches gsplat and gives a patent grant). Confirm no dependency carries the Inria research-only licence.
* **Data:** per-chunk license inherited from its sources, recorded in the manifest. CC BY is the simplest target for contributed data.
* **Repo layout:**`registry/`, `pipeline/`, `worker/`, `tiles/`, `web/`, `docs/licensing/`.

## 10. Agents

* Agents pick from the work queue, run the pipeline, and propose per-chunk config changes.
* Acceptance: beat the baseline on held-out views beyond seed noise, cost within budget, everything logged in the manifest.
* **Gate:** measure seed variance (3 seeds on 3 scenes) before agents may accept changes. Until then they only run and report.

## 11. Phases


| Phase | Weeks | Deliverable                                                                                                                                                                           |
| ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | 1-2   | Licence register, toolchain licence check, Colab terms read, capture audit for the seven wonders                                                                                      |
| 1     | 2-5   | **Vertical slice:**one site with clean rights. Poses, georegistration, 4 chunks, train, SOG, LOD, phone test. Measures T4 time, VRAM, bytes per splat, seam error, registration error |
| 2     | 5-9   | Manifest, S2 grid, globe with basemap, procedural sky and real sun/Earth rotation, POV tools                                                                                          |
| 3     | 9-13  | Drift-correction job, QA dashboard, remaining wonders by feasibility, creative tools                                                                                                  |
| 4     | 13-18 | Worker client, data upload, blur, verification                                                                                                                                        |
| 5     | 18+   | Accounts, voting, leaderboard, agent loop (after seed variance), scale-out region by region                                                                                           |

## 12. Biggest risks

1. **Data coverage:** open photos may not give enough overlap. Mitigation: capture audit first, and "needs capture" status.
2. **Provenance:** unremovable once published. Mitigation: per-chunk source record, quarantine, counsel review.
3. **Compute:** no T4 timing exists. Mitigation: Phase 1 measurement, plus one alternative to Colab.
4. **Privacy:** blur before publish, always.
5. **Georegistration quality:** wrong coordinates undermine the whole premise. Mitigation: hold-out checks, versioned transforms, visible error.
6. **Format churn:** pin PlayCanvas, SOG and any KHR/SPZ versions.
7. **Metrics:** PSNR/LPIPS are weak on synthetic fill. Label generated areas as such.

## 13. Open items for you

* Confirm New 7 Wonders (vs. ancient list).
* Which wonder has the best rights situation for the slice? Wikimedia Commons coverage is the first thing to check.
* Do you have a capture device (phone, drone) for a clean-rights test area?
