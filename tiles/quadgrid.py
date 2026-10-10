"""WGS84 quadtree with stable tile IDs. Depth ~20 ~= 40m at equator."""
import math

def latlon_to_tile(lat: float, lon: float, depth: int) -> str:
    # clamp
    lat = max(-90.0, min(90.0, lat))
    lon = ((lon + 180.0) % 360.0) - 180.0
    # normalized 0..1
    x = (lon + 180.0) / 360.0
    y = (90.0 - lat) / 180.0
    q = "q"
    for d in range(depth):
        # at each level split into 4: bits from x,y
        scale = 1 << (d + 1)
        xi = int(x * scale) % 2
        yi = int(y * scale * 1) % 2  # y split same way (2 rows per level)
        # quadrant: 0=NW,1=NE,2=SW,3=SE
        quad = yi * 2 + xi
        q += str(quad)
    return q


def tile_to_bounds(tile: str) -> dict:
    assert tile.startswith("q") and len(tile) > 1
    depth = len(tile) - 1
    # walk down
    minx, maxx = 0.0, 1.0
    miny, maxy = 0.0, 1.0
    for ch in tile[1:]:
        quad = int(ch)
        mx = (minx + maxx) / 2
        my = (miny + maxy) / 2
        xi = quad % 2
        yi = quad // 2
        if xi == 0:
            maxx = mx
        else:
            minx = mx
        if yi == 0:
            maxy = my
        else:
            miny = my
    return {
        "minLon": minx * 360.0 - 180.0,
        "maxLon": maxx * 360.0 - 180.0,
        "maxLat": 90.0 - miny * 180.0,
        "minLat": 90.0 - maxy * 180.0,
    }


def tile_size_m(tile: str) -> float:
    b = tile_to_bounds(tile)
    mid_lat = (b["minLat"] + b["maxLat"]) / 2
    # approx meters per degree
    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * math.cos(math.radians(mid_lat))
    return max((b["maxLat"] - b["minLat"]) * m_per_deg_lat,
               (b["maxLon"] - b["minLon"]) * m_per_deg_lon)


CHUNK_DEPTH = 20  # ~38m equator, ~50m mid-lat — matches plan "about 50m"


def plan_chunks(min_lat, min_lon, max_lat, max_lon, depth: int = CHUNK_DEPTH) -> list[str]:
    """Grid-split bbox into chunk tiles (coarse global prior -> grid split)."""
    # sample center of each tile by walking a lat/lon grid at tile resolution
    # resolution in degrees at depth:
    dlat = 180.0 / (1 << depth)
    dlon = 360.0 / (1 << depth)
    tiles = set()
    lat = min_lat + dlat / 2
    while lat < max_lat:
        lon = min_lon + dlon / 2
        while lon < max_lon:
            tiles.add(latlon_to_tile(lat, lon, depth))
            lon += dlon
        lat += dlat
    return sorted(tiles)
