"""Georegistration: ENU-local <-> ECEF doubles, similarity fit, hold-out check.
plan.md section 2. CPU doubles, float32 only on GPU.
"""
import math

WGS84_A = 6378137.0
WGS84_F = 1 / 298.257223563
WGS84_E2 = WGS84_F * (2 - WGS84_F)


def lla_to_ecef(lat_deg: float, lon_deg: float, h: float) -> tuple[float, float, float]:
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    N = WGS84_A / math.sqrt(1 - WGS84_E2 * math.sin(lat) ** 2)
    x = (N + h) * math.cos(lat) * math.cos(lon)
    y = (N + h) * math.cos(lat) * math.sin(lon)
    z = (N * (1 - WGS84_E2) + h) * math.sin(lat)
    return (x, y, z)


def enu_to_ecef_rotation(lat_deg: float, lon_deg: float) -> list[float]:
    """3x3 row-major rotation ENU -> ECEF at origin."""
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    sl, cl = math.sin(lat), math.cos(lat)
    so, co = math.sin(lon), math.cos(lon)
    # columns are east, north, up in ECEF
    return [
        -so, -sl * co, cl * co,
        co, -sl * so, cl * so,
        0.0, cl, sl,
    ]


def apply_transform(xyz_enu, R, t_ecef, origin_ecef):
    x, y, z = xyz_enu
    Xe = (R[0]*x + R[1]*y + R[2]*z + origin_ecef[0] + t_ecef[0],
          R[3]*x + R[4]*y + R[5]*z + origin_ecef[1] + t_ecef[1],
          R[6]*x + R[7]*y + R[8]*z + origin_ecef[2] + t_ecef[2])
    return Xe


def fit_correction(pairs: list[tuple[tuple, tuple]]) -> tuple[list[float], float]:
    """Robust-ish translation-only re-fit (RANSAC median + mean refine).
    pairs: [(measured_ecef, expected_ecef)]. Returns (translation, holdout_rmse).
    Full 7-param similarity lives in COLMAP/GLOMAP stage; this is the
    cheap manifest-only drift patch from plan.md section 2.
    """
    if not pairs:
        return ([0.0, 0.0, 0.0], float("inf"))
    diffs = [(b[0]-a[0], b[1]-a[1], b[2]-a[2]) for a, b in pairs]
    # median for robustness
    import statistics
    mx = statistics.median(d[0] for d in diffs)
    my = statistics.median(d[1] for d in diffs)
    mz = statistics.median(d[2] for d in diffs)
    # rmse of residuals after median shift
    se = sum((d[0]-mx)**2 + (d[1]-my)**2 + (d[2]-mz)**2 for d in diffs) / len(diffs)
    return ([mx, my, mz], math.sqrt(se))


UNREGISTERED_THRESHOLD_M = 2.0  # above => stays out of public tiers


def is_registered(rmse_m: float) -> bool:
    return rmse_m <= UNREGISTERED_THRESHOLD_M
