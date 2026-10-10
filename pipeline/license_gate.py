"""Licence gate per plan.md section 4. Default-deny on unknown."""
from dataclasses import dataclass

TIER_RULES = {
    "A": "publish",
    "B": "hold-counsel",
    "C": "internal-only",
    "D": "never",
    "Hold": "deny",
}

# source substring -> tier (first match wins, ordered most-specific first)
SOURCE_TIERS = [
    ("googlearth", "D"), ("google-earth", "D"), ("earth-studio", "D"),
    ("earthstudio", "D"), ("bungeenerf", "D"), ("maps.google", "D"),
    ("tanksandtemples", "C"), ("matrixcity", "C"), ("inria-3dgs", "C"),
    ("mapillary", "B"), ("openstreetmap", "B"), ("osm-", "B"),
    ("openaerialmap", "B"), ("mill-19", "Hold"), ("urbanscene3d", "Hold"),
    ("gauu-scene", "Hold"), ("mip-nerf", "Hold"),
    ("sentinel-2", "A"), ("sentinel", "A"), ("landsat", "A"), ("naip", "A"),
    ("copernicus-dem", "A"), ("copernicus", "A"), ("wikimedia-commons", "A"),
    ("cc0", "A"), ("cc-by", "A"), ("own-capture", "A"),
]


def classify_source(uri: str, license: str = "") -> str:
    s = f"{uri} {license}".lower()
    for key, tier in SOURCE_TIERS:
        if key in s:
            return tier
    return "Hold"  # unknown => default-deny


@dataclass
class GateResult:
    publishable: bool
    tier: str
    action: str
    reason: str


def gate_chunk(sources: list[dict]) -> GateResult:
    """sources: [{uri, license}]. Worst tier wins. D/Hold/C/B block publish."""
    if not sources:
        return GateResult(False, "Hold", "deny", "no sources recorded")
    tiers = [s.get("tier") or classify_source(s.get("uri", ""), s.get("license", "")) for s in sources]
    # worst first: D > Hold > C > B > A
    order = {"D": 0, "Hold": 1, "C": 2, "B": 3, "A": 4}
    worst = min(tiers, key=lambda t: order.get(t, 1))
    if worst == "A":
        return GateResult(True, "A", "publish", "all sources tier A")
    return GateResult(False, worst, TIER_RULES.get(worst, "deny"),
                      f"blocked by tier {worst} source")
