from pipeline.license_gate import gate_chunk, classify_source
from pipeline.georegister import lla_to_ecef, fit_correction, is_registered
from tiles.quadgrid import latlon_to_tile, tile_to_bounds, tile_size_m
import json
from pathlib import Path


def test_tier_a_publishable():
    r = gate_chunk([{"uri": "own-capture-test-area", "license": "CC-BY"}])
    assert r.publishable and r.tier == "A"


def test_google_never():
    r = gate_chunk([{"uri": "google-earth-screenshot", "license": "proprietary"}])
    assert not r.publishable and r.tier == "D"


def test_unknown_defaults_deny():
    assert classify_source("some-random-dataset-xyz") == "Hold"
    r = gate_chunk([{"uri": "some-random-dataset-xyz"}])
    assert not r.publishable


def test_mapillary_holds_for_counsel():
    r = gate_chunk([{"uri": "mapillary-street-photos"}])
    assert not r.publishable and r.tier == "B"


def test_ecef_roundtrip_origin():
    # Colosseum origin height ~50m ellipsoid approx; just check magnitude
    x, y, z = lla_to_ecef(41.8902, 12.4922, 50.0)
    assert 4_000_000 < (x**2 + y**2 + z**2) ** 0.5 < 7_000_000


def test_drift_fit_recovers_translation():
    t_true = (1.5, -0.5, 0.25)
    pairs = [((x, x + 1, x + 2),
              (x + t_true[0], x + 1 + t_true[1], x + 2 + t_true[2]))
             for x in range(10)]
    t, rmse = fit_correction(pairs)
    assert rmse < 1e-9
    assert all(abs(a - b) < 1e-9 for a, b in zip(t, t_true))
    assert is_registered(rmse)


def test_quadgrid_stable_and_50m():
    t = latlon_to_tile(41.8902, 12.4922, 20)
    assert t.startswith("q") and len(t) == 21
    assert latlon_to_tile(41.8902, 12.4922, 20) == t
    b = tile_to_bounds(t)
    assert b["minLat"] <= 41.8902 <= b["maxLat"]
    assert 20 < tile_size_m(t) < 120  # ~50m mid-lat


def test_places_registry_fields():
    places = json.loads((Path(__file__).resolve().parent.parent / "registry" / "places.json").read_text())
    assert len(places) == 7
    required = {"id", "lat", "lon", "status", "targetLOD", "achievedLOD",
                "sources", "licenseTier", "registrationErrorM", "votes", "lastVerified"}
    for p in places:
        assert required.issubset(p.keys()), p["id"]
