"""
Measures how much land was built over in north-west Pune between two ISRO
Bhuvan land-use surveys (2005 and 2015), so the time-machine map can quote a
real number instead of only showing two pictures.

Method, in plain terms:
  1. Download the same nine map tiles for each year from Bhuvan's WMS.
  2. Classify every pixel by its nearest colour in Bhuvan's official legend.
  3. Count the pixels in the nine "Built Up" classes, and convert pixels to
     square kilometres using the map's known ground resolution.

The survey (layers hs:LUHS_MH_PUNE_2005 / _2015) only covers a block of
north-west Pune - Hinjewadi, Pimpri-Chinchwad and surroundings - so the
figures describe that block, not the whole district. The extent below was
found by probing which tiles actually contain data.

PNG decoding is done by hand with zlib so no imaging library is needed.
"""

from __future__ import annotations

import json
import math
import struct
import threading
import time
import urllib.request
import zlib
from functools import lru_cache
from pathlib import Path

WMS_URL = "https://bhuvan-vec1.nrsc.gov.in/bhuvan/wms"
LAYERS = {2005: "hs:LUHS_MH_PUNE_2005", 2015: "hs:LUHS_MH_PUNE_2015"}

# The 3x3 block of zoom-12 web-map tiles that contains the survey's data
ZOOM = 12
TILE_XS = (2886, 2887, 2888)
TILE_YS = (1830, 1831, 1832)

# Exact legend colours, read pixel-for-pixel from Bhuvan's own legend image
# (GetLegendGraphic for these layers - every swatch is a flat block of one
# colour). The nine "Built Up" classes, in legend order:
BUILT_UP = [
    (255, 0, 0),      # Compact (continuous)
    (255, 92, 105),   # Sparse (discontinuous)
    (215, 176, 158),  # Vegetated / open area
    (168, 0, 0),      # Rural
    (118, 113, 48),   # Industrial
    (255, 120, 135),  # Industrial area - ash / effluent
    (227, 85, 116),   # Mining - active
    (174, 83, 52),    # Mining - abandoned
    (115, 76, 0),     # Quarry
]
# Every other class: farmland, forest, grassland, wasteland, wetland, water.
# Two legend classes are deliberately left out - Snow (248,248,248) and Rann
# (232,229,248). Neither exists in Pune, and their near-white colours would
# otherwise claim the grey "bhuvan" watermark printed on every tile.
OTHER = [
    (0, 61, 255), (0, 112, 255), (0, 120, 201), (0, 150, 201), (0, 156, 255),
    (0, 230, 169), (0, 252, 204), (0, 255, 181), (0, 255, 199), (38, 115, 0),
    (75, 210, 255), (76, 230, 166), (80, 187, 62), (82, 150, 201), (99, 153, 255),
    (115, 229, 115), (121, 200, 0), (124, 73, 199), (128, 165, 105), (138, 255, 199),
    (150, 143, 255), (150, 150, 255), (150, 231, 138), (153, 238, 145), (163, 255, 115),
    (167, 0, 225), (181, 214, 41), (212, 139, 206), (219, 232, 201), (229, 207, 255),
    (253, 28, 250), (253, 243, 23), (255, 30, 255), (255, 150, 232), (255, 201, 176),
    (255, 201, 255), (255, 255, 181),
]
# A pixel further than this from every legend colour is treated as an
# anti-aliased edge, label text or the watermark, and is not counted.
MAX_COLOUR_DISTANCE = 40

_CACHE = Path(__file__).parent / "cache" / "landuse_change.json"
_lock = threading.Lock()
# "idle" -> "computing" -> "ready" | "failed"
_state: dict = {"status": "idle", "result": None, "reason": None, "failed_at": 0.0}
# After a failure (Bhuvan down), try again at most this often
_RETRY_AFTER_SECONDS = 300


# ---------- minimal PNG decoder ----------

def decode_png(data: bytes) -> tuple[int, int, list[tuple[int, int, int, int]]]:
    """Width, height and RGBA pixels of an 8-bit, non-interlaced PNG."""
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    pos, idat, palette, trns = 8, b"", None, None
    width = height = colour_type = 0
    while pos < len(data):
        length, kind = struct.unpack(">I4s", data[pos : pos + 8])
        chunk = data[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            width, height, depth, colour_type, _, _, interlace = struct.unpack(">IIBBBBB", chunk)
            if depth != 8 or interlace:
                raise ValueError("only 8-bit non-interlaced PNGs are supported")
        elif kind == b"PLTE":
            palette = [tuple(chunk[i : i + 3]) for i in range(0, len(chunk), 3)]
        elif kind == b"tRNS":
            trns = chunk
        elif kind == b"IDAT":
            idat += chunk
        pos += 12 + length

    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[colour_type]
    stride = width * channels
    raw = zlib.decompress(idat)
    rows, prev = [], bytearray(stride)
    for y in range(height):
        f = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1 : (y + 1) * (stride + 1)])
        for i in range(stride):  # undo the per-row filter
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            if f == 1:
                line[i] = (line[i] + a) & 0xFF
            elif f == 2:
                line[i] = (line[i] + b) & 0xFF
            elif f == 3:
                line[i] = (line[i] + (a + b) // 2) & 0xFF
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 0xFF
        rows.append(line)
        prev = line

    pixels = []
    for line in rows:
        for x in range(width):
            px = line[x * channels : (x + 1) * channels]
            if colour_type == 6:
                pixels.append(tuple(px))
            elif colour_type == 2:
                pixels.append((*px, 255))
            elif colour_type == 3:
                idx = px[0]
                alpha = trns[idx] if trns is not None and idx < len(trns) else 255
                pixels.append((*palette[idx], alpha))
            elif colour_type == 4:
                pixels.append((px[0], px[0], px[0], px[1]))
            else:
                pixels.append((px[0], px[0], px[0], 255))
    return width, height, pixels


# ---------- measuring ----------

def _tile_bbox(x: int, y: int, z: int) -> str:
    r = 6378137
    size = 2 * math.pi * r / 2**z
    minx = -math.pi * r + x * size
    maxy = math.pi * r - y * size
    return f"{minx:.2f},{maxy - size:.2f},{minx + size:.2f},{maxy:.2f}"


def _tile_to_latlng(x: float, y: float, z: int) -> tuple[float, float]:
    n = 2**z
    return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n)))), x / n * 360 - 180


def _fetch_tile(layer: str, x: int, y: int) -> bytes:
    url = (
        f"{WMS_URL}?service=WMS&version=1.1.1&request=GetMap&styles=&format=image/png"
        f"&transparent=true&srs=EPSG:3857&width=256&height=256"
        f"&bbox={_tile_bbox(x, y, ZOOM)}&layers={layer}"
    )
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


@lru_cache(maxsize=None)
def _classify(rgb: tuple[int, int, int]) -> str | None:
    # Cached: a map tile reuses a few hundred colours across 65,536 pixels,
    # so each distinct colour is matched against the legend only once.
    best, best_d = None, MAX_COLOUR_DISTANCE**2 + 1
    for kind, palette in (("built", BUILT_UP), ("other", OTHER)):
        for c in palette:
            d = (rgb[0] - c[0]) ** 2 + (rgb[1] - c[1]) ** 2 + (rgb[2] - c[2]) ** 2
            if d < best_d:
                best, best_d = kind, d
    return best


def _measure_year(layer: str) -> dict:
    built = mapped = 0
    built_m2 = 0.0
    for y in TILE_YS:
        # Ground size of one pixel shrinks away from the equator (Mercator)
        lat, _ = _tile_to_latlng(TILE_XS[0], y + 0.5, ZOOM)
        px_m = 156543.03392 * math.cos(math.radians(lat)) / 2**ZOOM
        for x in TILE_XS:
            _, _, pixels = decode_png(_fetch_tile(layer, x, y))
            for r, g, b, a in pixels:
                if a < 200:
                    continue  # transparent: outside the survey
                kind = _classify((r, g, b))
                if kind is None:
                    continue
                mapped += 1
                if kind == "built":
                    built += 1
                    built_m2 += px_m * px_m
    return {
        "built_up_pct": round(built / mapped * 100, 1) if mapped else 0.0,
        "built_up_km2": round(built_m2 / 1e6, 1),
    }


def _region() -> dict:
    north, west = _tile_to_latlng(TILE_XS[0], TILE_YS[0], ZOOM)
    south, east = _tile_to_latlng(TILE_XS[-1] + 1, TILE_YS[-1] + 1, ZOOM)
    return {"south": round(south, 4), "west": round(west, 4), "north": round(north, 4), "east": round(east, 4)}


def compute() -> dict:
    years = [{"year": year, **_measure_year(layer)} for year, layer in LAYERS.items()]
    first, last = years[0], years[-1]
    return {
        "available": True,
        "region": _region(),
        "region_label": "North-west Pune (Hinjewadi, Pimpri-Chinchwad)",
        "layers": {str(y): l for y, l in LAYERS.items()},
        "years": years,
        "change": {
            "pct_points": round(last["built_up_pct"] - first["built_up_pct"], 1),
            "km2": round(last["built_up_km2"] - first["built_up_km2"], 1),
        },
        "source": "ISRO Bhuvan / NRSC land use survey",
    }


def _run() -> None:
    try:
        result = compute()
    except Exception as e:  # Bhuvan unreachable or returned something unexpected
        with _lock:
            _state.update(
                status="failed",
                reason=f"ISRO Bhuvan could not be reached ({type(e).__name__}).",
                failed_at=time.time(),
            )
        return
    _CACHE.parent.mkdir(parents=True, exist_ok=True)
    _CACHE.write_text(json.dumps(result, indent=2), encoding="utf-8")
    with _lock:
        _state.update(status="ready", result=result, reason=None)


def warm_up() -> None:
    """
    Make the figures ready before anyone asks. Measuring takes about a minute
    (eighteen tiles, decoded in pure Python), so it runs once in the
    background at server start and is cached on disk - the surveys never
    change, so later starts read the cache instantly.
    """
    with _lock:
        if _state["status"] in ("computing", "ready"):
            return
        if _CACHE.exists():
            _state.update(status="ready", result=json.loads(_CACHE.read_text(encoding="utf-8")))
            return
        _state["status"] = "computing"
    threading.Thread(target=_run, name="landuse-change", daemon=True).start()


def get_change() -> dict:
    """The measured change, or why it isn't available yet. Never blocks."""
    with _lock:
        status = _state["status"]
        if status == "ready":
            return _state["result"]
        retry = status == "failed" and time.time() - _state["failed_at"] > _RETRY_AFTER_SECONDS
        reason = _state["reason"]
    if retry or status == "idle":
        warm_up()
        status = "computing"
    if status == "computing":
        return {"available": False, "computing": True, "reason": "Measuring the ISRO surveys - ready in about a minute."}
    return {"available": False, "computing": False, "reason": reason}
