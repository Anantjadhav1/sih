"""
National Digital Platform for Land Governance - MVP Backend
FastAPI server: /api/simulate, /api/copilot, and the /api/ledger blockchain.
No database needed for the hackathon demo - the simulation is in-memory math
and each office's copy of the ledger persists to a JSON file (see blockchain.py).
"""

import base64
import binascii
import hashlib
import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import landuse_change
from auth import USERS, authenticate, current_user, issue_token, server_secret
from blockchain import DIFFICULTY, MIN_REASON_CHARS, RULE_BOOK, BlockRejected, Network
from signing import KeyRing

app = FastAPI(title="Land Governance Policy Simulation API")

# Allow the Next.js dev server to call this backend. Matched by regex because
# `next dev` falls through to 3001/3002/... whenever 3000 is already taken.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- District reference data ----------
#
# Indicative Census-2011 scale figures plus per-district sensitivity coefficients.
# In the production system these come from PostGIS (district geometry, land
# records) joined against Bhuvan LULC and climate-vulnerability rasters.

DISTRICTS = {
    "pune": {
        "name": "Pune",
        "state": "Maharashtra",
        "population": 9429408,
        "area_sq_km": 15643,
        "agricultural_area_ha": 969_000,
        # Steep Sahyadri run-off + dense peri-urban settlement = high sensitivity
        "flood_sensitivity": 0.52,
        "displacement_density": 61.0,   # persons displaced per 1% converted
        "farmland_factor": 14.2,        # hectares lost per 1% converted
    },
    "nashik": {
        "name": "Nashik",
        "state": "Maharashtra",
        "population": 6107187,
        "area_sq_km": 15530,
        "agricultural_area_ha": 1_102_000,
        # Godavari basin, heavily irrigated horticulture
        "flood_sensitivity": 0.44,
        "displacement_density": 34.0,
        "farmland_factor": 16.8,
    },
    "nagpur": {
        "name": "Nagpur",
        "state": "Maharashtra",
        "population": 4653570,
        "area_sq_km": 9892,
        "agricultural_area_ha": 574_000,
        # Flatter Vidarbha plateau drains better; conversion is industrial-led
        "flood_sensitivity": 0.31,
        "displacement_density": 27.0,
        "farmland_factor": 9.4,
    },
}

DEFAULT_DISTRICT = "pune"


# ---------- Zone reference data ----------
#
# Ward/growth-corridor level units inside Pune district. District-wide figures
# average away the thing policy actually turns on: a floodplain ward and a
# built-out hill suburb respond very differently to the same conversion rule.
#
# Two things make zones structurally different from districts, not just
# rescaled:
#
#   1. `baseline_flood_risk_pct` - the flood exposure a zone already carries at
#      ZERO conversion. Hadapsar sits on the Mula-Mutha floodplain and starts in
#      the Moderate band before any policy is applied; Kothrud starts near zero.
#   2. `convertible_share` - how much of the remaining agricultural land is
#      actually eligible to convert. Wagholi's frontier farmland is almost all
#      convertible; Kothrud's surviving plots are largely protected green belt,
#      so the same slider position frees far less land.
#
# Production reads these from PostGIS ward geometry joined against Bhuvan LULC
# and the CWC floodplain rasters.

ZONES = {
    "hinjewadi": {
        "name": "Hinjewadi",
        "district": "pune",
        "character": "IT corridor - Rajiv Gandhi Infotech Park",
        "population": 285_000,
        "area_sq_km": 32.0,
        "agricultural_area_ha": 1_850,
        "baseline_flood_risk_pct": 11.0,
        "flood_sensitivity": 0.38,
        "displacement_density": 22.0,   # persons displaced per 1% converted
        "convertible_share": 0.72,      # fraction of agri land eligible to convert
    },
    "kothrud": {
        "name": "Kothrud",
        "district": "pune",
        "character": "Dense residential, largely built out",
        "population": 410_000,
        "area_sq_km": 18.0,
        "agricultural_area_ha": 420,
        # Elevated ground, well-drained - very little standing flood exposure
        "baseline_flood_risk_pct": 6.5,
        "flood_sensitivity": 0.21,
        "displacement_density": 34.0,
        "convertible_share": 0.30,
    },
    "hadapsar": {
        "name": "Hadapsar",
        "district": "pune",
        "character": "Eastern industrial belt on the Mula-Mutha floodplain",
        "population": 350_000,
        "area_sq_km": 41.0,
        "agricultural_area_ha": 3_200,
        # Already Moderate at zero conversion - this is the point of zone-level
        "baseline_flood_risk_pct": 24.0,
        "flood_sensitivity": 0.61,
        "displacement_density": 27.5,
        "convertible_share": 0.55,
    },
    "baner": {
        "name": "Baner",
        "district": "pune",
        "character": "Fast-growing hill-slope suburb",
        "population": 190_000,
        "area_sq_km": 24.0,
        "agricultural_area_ha": 1_120,
        "baseline_flood_risk_pct": 9.5,
        "flood_sensitivity": 0.33,
        "displacement_density": 16.5,
        "convertible_share": 0.65,
    },
    "wagholi": {
        "name": "Wagholi",
        "district": "pune",
        "character": "Peri-urban expansion frontier",
        "population": 165_000,
        "area_sq_km": 37.0,
        "agricultural_area_ha": 4_600,
        "baseline_flood_risk_pct": 15.5,
        "flood_sensitivity": 0.47,
        "displacement_density": 12.0,
        "convertible_share": 0.88,
    },
}


def resolve_zone(value: str) -> tuple[str, dict]:
    key = (value or "").strip().lower()
    if key in ZONES:
        return key, ZONES[key]
    raise HTTPException(
        status_code=404,
        detail=f"Unknown zone '{value}'. Available: {', '.join(sorted(ZONES))}",
    )


def resolve_district(value: str) -> tuple[str, dict]:
    """Accept either the slug ('pune') or the display name ('Pune')."""
    key = (value or DEFAULT_DISTRICT).strip().lower()
    if key in DISTRICTS:
        return key, DISTRICTS[key]
    raise HTTPException(
        status_code=404,
        detail=f"Unknown district '{value}'. Available: {', '.join(sorted(DISTRICTS))}",
    )



# ---------- Policy levers ----------
#
# Four genuinely different conversions, not one formula with four labels. Each
# carries its own curve SHAPE as well as its own coefficients:
#
#   flood_exponent  bends the response curve. Applied to the slider position
#                   normalised against that lever's own maximum, so 0 -> 0 and
#                   max -> 100 for every lever while the path between them
#                   differs:
#                     1.00  linear      - conversion and runoff scale together
#                     1.35  convex      - slow start, then compounding. Canopy
#                                         loss is absorbed until the catchment
#                                         stops coping, then degrades sharply
#                     0.55  concave     - steep immediately, then flattening.
#                                         The first hectares of a wetland do
#                                         most of the water storage, so a small
#                                         encroachment is already severe
#   flood_mult      how much runoff the finished surface generates
#   displacement_mult  people resettled per unit of land taken
#   land_mult       how much land one slider percent actually consumes
#   biodiversity_per_pct  ecological levers only; None for the farmland ones
#   bio_exponent    habitat damage runs on its own curve, and it is concave
#                   where flood damage may be convex: fragmentation, edge
#                   effects and lost corridors hurt long before the last
#                   hectare goes, so early clearance is disproportionately
#                   costly to species even while runoff is still absorbed
#
# Sources would be Bhuvan LULC change-detection plus CWC floodplain rasters in
# production; the coefficients here are indicative and tuned for the demo.

POLICY_LEVERS = {
    "agri_commercial": {
        "label": "Agricultural to Commercial Conversion",
        "explanation": "Farmland rezoned for malls, offices and warehousing - the standard peri-urban conversion.",
        "land_label": "Farmland loss",
        "max_pct": 100.0,
        # Baseline lever: every multiplier is 1.0 and the curve is linear, so
        # this reproduces the original model exactly.
        "flood_exponent": 1.00,
        "flood_mult": 1.00,
        "displacement_mult": 1.00,
        "land_mult": 1.00,
        "biodiversity_per_pct": None,
        "bio_exponent": None,
    },
    "agri_residential": {
        "label": "Agricultural to Residential Conversion",
        "explanation": "Farmland rezoned for housing - more people per hectare, but gardens and setbacks absorb more rain than a retail slab.",
        "land_label": "Farmland loss",
        "max_pct": 100.0,
        "flood_exponent": 1.00,
        # Lower plot coverage and open setbacks leave more permeable ground
        "flood_mult": 0.62,
        # Housing resettles far more households per hectare than warehousing
        "displacement_mult": 1.75,
        "land_mult": 1.00,
        "biodiversity_per_pct": None,
        "bio_exponent": None,
    },
    "forest_urban": {
        "label": "Forest / Green Cover to Urban Expansion",
        "explanation": "Built-up expansion into the Sahyadri green belt - removes the catchment's own water absorption, so impact compounds.",
        "land_label": "Green cover lost",
        "max_pct": 100.0,
        # Convex, but only mildly: the catchment absorbs a little before it
        # fails. Paired with the largest flood multiplier of any lever, so
        # clearing green cover is the worst option at almost every setting,
        # which is the point of offering it.
        "flood_exponent": 1.10,
        "flood_mult": 1.25,
        # Forest margins are sparsely settled, so few people are displaced
        "displacement_mult": 0.45,
        "land_mult": 0.85,
        "biodiversity_per_pct": 1.00,
        "bio_exponent": 0.60,
    },
    "wetland_encroachment": {
        "label": "Wetland / Water Body Encroachment",
        "explanation": "Building on floodplain and lake margins - the land that stores monsoon water. Small encroachments remove disproportionate storage.",
        "land_label": "Wetland lost",
        # Encroachment beyond this is not a policy scenario, it is the end of
        # the wetland - so the lever is capped well below the others.
        "max_pct": 40.0,
        # Concave: the first hectares carry most of the storage capacity
        "flood_exponent": 0.55,
        "flood_mult": 1.30,
        "displacement_mult": 0.80,
        "land_mult": 0.35,
        "biodiversity_per_pct": 1.05,
        "bio_exponent": 0.50,
    },
}

DEFAULT_LEVER = "agri_commercial"


def resolve_lever(value: str | None) -> tuple[str, dict]:
    key = (value or DEFAULT_LEVER).strip().lower()
    if key in POLICY_LEVERS:
        return key, POLICY_LEVERS[key]
    raise HTTPException(
        status_code=404,
        detail=f"Unknown policy lever '{value}'. Available: {', '.join(sorted(POLICY_LEVERS))}",
    )


def shaped_pct(lever: dict, pct: float) -> float:
    """
    Slider position re-expressed on the lever's own response curve, normalised
    to 0-100. This is what makes the four levers produce different curve shapes
    rather than four scalings of one line.
    """
    ceiling = lever["max_pct"]
    frac = min(max(pct / ceiling, 0.0), 1.0)
    return (frac ** lever["flood_exponent"]) * 100.0


def biodiversity_for(lever: dict, pct: float) -> float | None:
    """
    0-100 habitat impact; only the two ecological levers report one.

    Runs on bio_exponent rather than the flood curve. For forest that means
    habitat damage is already severe while runoff is still being absorbed -
    the two harms do not move together, and averaging them into one curve
    would hide exactly the trade-off a policymaker needs to see.
    """
    coeff = lever["biodiversity_per_pct"]
    if coeff is None:
        return None
    ceiling = lever["max_pct"]
    frac = min(max(pct / ceiling, 0.0), 1.0)
    curved = (frac ** lever["bio_exponent"]) * 100.0
    return round(min(100.0, curved * coeff), 1)


# ---------- Request/Response Models ----------

class SimulationInput(BaseModel):
    agri_to_commercial_pct: float = Field(ge=0, le=100)  # from the slider
    district: str = DEFAULT_DISTRICT
    # When set, the projection is scoped to this zone rather than the whole
    # district. Optional so existing district-level callers keep working.
    zone: str | None = None
    # Secondary scenario factors. Both default to "normal", so a caller that
    # omits them gets exactly the numbers it got before these existed.
    #   monsoon_intensity      1.0 = long-period average; 2.0 = twice-normal rainfall
    #   population_growth_rate %/yr; 1.2 is the current Maharashtra urban trend
    monsoon_intensity: float = Field(default=1.0, ge=0.5, le=2.0)
    population_growth_rate: float = Field(default=1.2, ge=0.0, le=5.0)
    # Which conversion is being simulated. Defaults to the original
    # agricultural-to-commercial lever, so pre-existing callers are unaffected.
    policy_lever: str | None = None


class CurvePoint(BaseModel):
    pct: float
    risk_score: float
    risk_level: str


class SimulationOutput(BaseModel):
    district: str          # slug, e.g. "pune"
    district_name: str     # display name, e.g. "Pune"
    # Populated only for zone-scoped runs
    zone: str | None = None
    zone_name: str | None = None
    # Flood exposure the zone already carries at 0% conversion; 0 district-wide
    baseline_flood_risk_pct: float = 0.0
    agri_to_commercial_pct: float
    predicted_flood_risk_increase_pct: float
    predicted_displacement_persons: int
    predicted_farmland_loss_hectares: float
    farmland_loss_share_pct: float
    risk_level: str
    risk_score: float
    # Echo the scenario factors back so the UI can label what produced these
    monsoon_intensity: float = 1.0
    population_growth_rate: float = 1.2
    # Lever identity and presentation, echoed so the UI can label outputs
    policy_lever: str = DEFAULT_LEVER
    policy_lever_label: str = ""
    land_label: str = "Farmland loss"
    max_pct: float = 100.0
    # 0-100 habitat impact; null for the two farmland levers
    biodiversity_impact_score: float | None = None
    # Full 0-100% sweep for this district, so the dashboard can plot the whole
    # response curve without a request per point.
    curve: list[CurvePoint]


class SourcePassage(BaseModel):
    """A research-library passage the browser's search retrieved for this question."""
    id: str
    title: str
    org: str = ""
    date: str = ""
    text: str = Field(max_length=600)


class CopilotInput(BaseModel):
    query: str
    district: str = DEFAULT_DISTRICT
    zone: str | None = None
    # Step 1 of retrieval-augmented answering happens in the browser: the same
    # relevance search as the library's search box picks the passages to send.
    # Only the first two are used. (No list-length constraint here on purpose:
    # pydantic v1 and v2 spell it differently, and this must run on both.)
    sources: list[SourcePassage] = Field(default_factory=list)


class Citation(BaseModel):
    n: int
    kind: Literal["library", "isro", "ledger"]
    title: str
    detail: str


class CopilotOutput(BaseModel):
    response: str
    citations: list[Citation] = Field(default_factory=list)


# ---------- Endpoints ----------

@app.get("/")
def health_check():
    return {"status": "ok", "service": "land-governance-simulation-api"}


@app.get("/api/districts")
def list_districts():
    """Reference list so the frontend dropdown can stay in sync with the model."""
    return [
        {
            "id": key,
            "name": d["name"],
            "state": d["state"],
            "population": d["population"],
            "area_sq_km": d["area_sq_km"],
        }
        for key, d in DISTRICTS.items()
    ]


def monsoon_multiplier(intensity: float) -> float:
    """
    Rainfall multiplier applied to flood-driven risk.

    Deliberately super-linear: runoff does not scale 1:1 with rainfall once
    drainage capacity is exceeded, so a doubled monsoon does rather more than
    double the flood term. Normalised so intensity 1.0 leaves the existing
    numbers untouched.
    """
    return intensity ** 1.35


def growth_multiplier(rate: float) -> float:
    """
    Displacement multiplier from population growth, compounded over a 10-year
    policy horizon. Normalised against the 1.2%/yr baseline so the default rate
    leaves the existing numbers untouched.
    """
    horizon_years = 10
    baseline = 1.012 ** horizon_years
    return (1 + rate / 100) ** horizon_years / baseline


def score_for(
    d: dict,
    pct: float,
    monsoon: float = 1.0,
    growth: float = 1.2,
    lever: dict | None = None,
) -> tuple[float, str]:
    """Composite 0-100 risk score and its band, for one district at one pct."""
    lv = lever or POLICY_LEVERS[DEFAULT_LEVER]
    # The lever bends the slider onto its own response curve before any of
    # the physical terms are computed - this is what gives each lever a
    # different curve shape rather than a rescaled copy of the same line.
    sp = shaped_pct(lv, pct)
    flood = sp * d["flood_sensitivity"] * lv["flood_mult"] * monsoon_multiplier(monsoon)
    displacement = int(
        sp * d["displacement_density"] * lv["displacement_mult"] * growth_multiplier(growth)
    )
    farmland_share = sp * d["farmland_factor"] * lv["land_mult"] / d["agricultural_area_ha"] * 100
    bio = biodiversity_for(lv, pct) or 0.0

    # Flood risk carries the most weight, then the share of the district's
    # cultivated land lost, then displacement pressure per 100k residents.
    # Weights are tuned so total conversion lands just under 100 for the most
    # exposed district (Pune ~97, Nashik ~86, Nagpur ~74) - that keeps the whole
    # slider range meaningful instead of pinning at 100 two-thirds of the way up.
    score = min(
        100.0,
        flood * 1.13
        + farmland_share * 130
        + displacement / d["population"] * 100_000 * 0.30
        # Habitat loss is itself a risk, so ecological levers carry a term
        # the two farmland levers do not.
        + bio * 0.12,
    )

    if score < 20:
        level = "Low"
    elif score < 50:
        level = "Moderate"
    else:
        level = "High"
    return round(score, 1), level


def zone_score_for(
    z: dict,
    pct: float,
    monsoon: float = 1.0,
    growth: float = 1.2,
    lever: dict | None = None,
) -> tuple[float, str]:
    """
    Composite 0-100 risk score for one zone at one conversion percentage.

    Structurally different from score_for(): a zone starts from the flood
    exposure it already carries, so the curve has a non-zero intercept. Hadapsar
    opens in the Moderate band at 0% conversion; Kothrud stays Low even at full
    build-out. Weights are tuned so the most exposed zone lands just under 100
    at total conversion, keeping the whole slider meaningful.
    """
    # A heavier monsoon lifts the standing exposure as well as the increment -
    # the floodplain is wetter before any conversion happens.
    lv = lever or POLICY_LEVERS[DEFAULT_LEVER]
    sp = shaped_pct(lv, pct)
    m = monsoon_multiplier(monsoon)
    baseline = z["baseline_flood_risk_pct"] * 0.85 * m
    flood_increase = sp * z["flood_sensitivity"] * lv["flood_mult"] * m
    farmland_share = sp * z["convertible_share"] * lv["land_mult"]
    displaced_share = (
        sp * z["displacement_density"] * lv["displacement_mult"]
        * growth_multiplier(growth) / z["population"] * 100
    )
    bio = biodiversity_for(lv, pct) or 0.0

    score = min(
        100.0,
        baseline
        + flood_increase * 0.88
        + farmland_share * 0.38
        + displaced_share * 5.0
        + bio * 0.10,
    )

    if score < 20:
        level = "Low"
    elif score < 50:
        level = "Moderate"
    else:
        level = "High"
    return round(score, 1), level


def simulate_zone(
    key: str,
    z: dict,
    pct: float,
    monsoon: float = 1.0,
    growth: float = 1.2,
    lever_key: str = DEFAULT_LEVER,
) -> "SimulationOutput":
    """Zone-scoped projection, reported in the same shape as the district one."""
    lv = POLICY_LEVERS[lever_key]
    sp = shaped_pct(lv, pct)
    flood_risk_increase = round(
        sp * z["flood_sensitivity"] * lv["flood_mult"] * monsoon_multiplier(monsoon), 1
    )
    displacement = int(
        sp * z["displacement_density"] * lv["displacement_mult"] * growth_multiplier(growth)
    )
    farmland_loss = round(
        sp * z["agricultural_area_ha"] * z["convertible_share"] * lv["land_mult"] / 100, 1
    )
    farmland_share = round(sp * z["convertible_share"] * lv["land_mult"], 2)

    risk_score, risk_level = zone_score_for(z, pct, monsoon, growth, lv)
    sweep = lv["max_pct"] / 20.0

    return SimulationOutput(
        district=z["district"],
        district_name=DISTRICTS[z["district"]]["name"],
        zone=key,
        zone_name=z["name"],
        baseline_flood_risk_pct=round(z["baseline_flood_risk_pct"] * monsoon_multiplier(monsoon), 1),
        monsoon_intensity=monsoon,
        population_growth_rate=growth,
        policy_lever=lever_key,
        policy_lever_label=lv["label"],
        land_label=lv["land_label"],
        max_pct=lv["max_pct"],
        biodiversity_impact_score=biodiversity_for(lv, pct),
        agri_to_commercial_pct=pct,
        predicted_flood_risk_increase_pct=flood_risk_increase,
        predicted_displacement_persons=displacement,
        predicted_farmland_loss_hectares=farmland_loss,
        farmland_loss_share_pct=farmland_share,
        risk_level=risk_level,
        risk_score=risk_score,
        # Swept across this lever own range, so a capped lever (wetlands)
        # plots its full 0-40% span rather than a truncated 0-100 axis.
        curve=[
            CurvePoint(
                pct=round(i * sweep, 2),
                risk_score=zone_score_for(z, i * sweep, monsoon, growth, lv)[0],
                risk_level=zone_score_for(z, i * sweep, monsoon, growth, lv)[1],
            )
            for i in range(21)
        ],
    )


@app.get("/api/levers")
def list_levers():
    """Lever catalogue, so the UI selector stays in sync with the model."""
    return [
        {
            "id": key,
            "label": lv["label"],
            "explanation": lv["explanation"],
            "land_label": lv["land_label"],
            "max_pct": lv["max_pct"],
            "has_biodiversity": lv["biodiversity_per_pct"] is not None,
        }
        for key, lv in POLICY_LEVERS.items()
    ]


@app.get("/api/zones")
def list_zones(district: str = DEFAULT_DISTRICT):
    """Reference list of zones, so the map's markers stay in sync with the model."""
    key, _ = resolve_district(district)
    return [
        {
            "id": zid,
            "name": z["name"],
            "district": z["district"],
            "character": z["character"],
            "population": z["population"],
            "area_sq_km": z["area_sq_km"],
            "agricultural_area_ha": z["agricultural_area_ha"],
            "baseline_flood_risk_pct": z["baseline_flood_risk_pct"],
        }
        for zid, z in ZONES.items()
        if z["district"] == key
    ]


@app.post("/api/simulate", response_model=SimulationOutput)
def simulate_policy(input: SimulationInput):
    """
    MOCKED simulation logic.
    In the real system this would run an ML model trained on Bhuvan LULC +
    climate vulnerability + socio-economic datasets. For the demo we use simple
    proportional math - but weighted per district, so switching districts in the
    dropdown produces genuinely different projections.

    When a `zone` is supplied the projection is scoped to that zone instead,
    which adds the zone's standing flood exposure as a non-zero intercept.
    """
    monsoon = input.monsoon_intensity
    growth = input.population_growth_rate
    lever_key, lv = resolve_lever(input.policy_lever)
    # Clamp to the lever own ceiling; wetland encroachment stops at 40%
    pct = min(input.agri_to_commercial_pct, lv["max_pct"])

    if input.zone:
        zkey, z = resolve_zone(input.zone)
        return simulate_zone(zkey, z, pct, monsoon, growth, lever_key)

    key, d = resolve_district(input.district)
    sp = shaped_pct(lv, pct)

    flood_risk_increase = round(
        sp * d["flood_sensitivity"] * lv["flood_mult"] * monsoon_multiplier(monsoon), 1
    )
    displacement = int(
        sp * d["displacement_density"] * lv["displacement_mult"] * growth_multiplier(growth)
    )
    farmland_loss = round(sp * d["farmland_factor"] * lv["land_mult"], 1)
    farmland_share = round(farmland_loss / d["agricultural_area_ha"] * 100, 3)

    risk_score, risk_level = score_for(d, pct, monsoon, growth, lv)

    sweep = lv["max_pct"] / 20.0
    curve = []
    for i in range(21):
        at = round(i * sweep, 2)
        sc, lvl = score_for(d, at, monsoon, growth, lv)
        curve.append(CurvePoint(pct=at, risk_score=sc, risk_level=lvl))

    return SimulationOutput(
        district=key,
        district_name=d["name"],
        zone=None,
        zone_name=None,
        baseline_flood_risk_pct=0.0,
        agri_to_commercial_pct=pct,
        predicted_flood_risk_increase_pct=flood_risk_increase,
        predicted_displacement_persons=displacement,
        predicted_farmland_loss_hectares=farmland_loss,
        farmland_loss_share_pct=farmland_share,
        risk_level=risk_level,
        risk_score=risk_score,
        monsoon_intensity=monsoon,
        population_growth_rate=growth,
        policy_lever=lever_key,
        policy_lever_label=lv["label"],
        land_label=lv["land_label"],
        max_pct=lv["max_pct"],
        biodiversity_impact_score=biodiversity_for(lv, pct),
        curve=curve,
    )


def _mid_sentence(text: str) -> str:
    """
    Lower-case a description's first letter so it reads mid-sentence, but
    leave acronyms ("IT corridor") and every proper noun after it alone.
    """
    if len(text) > 1 and text[:2].isupper():
        return text
    return text[:1].lower() + text[1:]


_GENERIC_ANSWER = "__generic__"


def _topic_answer(input: CopilotInput) -> str:
    """
    The model-based part of the answer: rule-based explanations of the
    simulation for the district or zone in scope. No API key needed; an LLM
    could replace this function without changing how evidence is retrieved.

    Returns _GENERIC_ANSWER when the question isn't about a modelled topic, so
    the caller can lead with evidence instead of a generic help message.
    """
    query = input.query.lower()
    _, d = resolve_district(input.district)
    name = d["name"]

    # When a zone is in play, answer about the zone - a floodplain ward and the
    # district average are different conversations.
    if input.zone:
        _, z = resolve_zone(input.zone)
        zname = z["name"]
        if "flood" in query:
            return (
                f"{zname} already carries a standing flood risk of "
                f"{z['baseline_flood_risk_pct']}% before any conversion - "
                f"{_mid_sentence(z['character'])}. Each additional percent converted adds "
                f"{z['flood_sensitivity']} points of runoff-driven risk on top of "
                f"that baseline, which is why {zname} diverges from the "
                f"{name} district average."
            )
        if "displac" in query:
            return (
                f"{zname} holds about {z['population']:,} residents across "
                f"{z['area_sq_km']} km². At the current setting the model "
                f"displaces {z['displacement_density']} people per percent "
                f"converted, concentrated in the zone rather than spread across "
                f"the district."
            )
        if "farmland" in query or "agri" in query:
            return (
                f"{zname} has roughly {z['agricultural_area_ha']:,} hectares "
                f"under cultivation, of which about "
                f"{int(z['convertible_share'] * 100)}% is actually eligible to "
                f"convert - the rest is protected or already committed. That "
                f"eligibility ceiling is what limits farmland loss here."
            )
        return _GENERIC_ANSWER

    if "flood" in query:
        reply = (
            f"Converting agricultural land to commercial use in {name} raises "
            f"impermeable surface area, which increases surface runoff and flood "
            f"risk in low-lying zones. {name} carries a flood sensitivity "
            f"coefficient of {d['flood_sensitivity']} in this model - lower the "
            f"conversion percentage to see the projected risk fall."
        )
    elif "displac" in query:
        reply = (
            f"Displacement estimates weight the converted area against {name}'s "
            f"population of {d['population']:,} across {d['area_sq_km']:,} km². "
            f"Higher conversion percentages directly increase the number of "
            f"households affected in this mocked model."
        )
    elif "farmland" in query or "agri" in query:
        reply = (
            f"{name} has roughly {d['agricultural_area_ha']:,} hectares under "
            f"cultivation. Farmland loss scales proportionally with the slider "
            f"value; the production version would read real Bhuvan LULC layers "
            f"instead of this linear approximation."
        )
    elif "district" in query or "compare" in query:
        reply = (
            "You can switch districts from the dropdown at the top of the "
            "simulator panel. Each district carries its own flood-sensitivity, "
            "displacement-density and farmland coefficients, so the same "
            "conversion percentage yields a different risk profile in Pune, "
            "Nashik and Nagpur."
        )
    else:
        reply = _GENERIC_ANSWER

    return reply


def _generic_help(input: CopilotInput) -> str:
    """What to say when the question matched neither a topic nor any evidence."""
    _, d = resolve_district(input.district)
    if input.zone:
        _, z = resolve_zone(input.zone)
        return (
            f"I'm looking at {z['name']} ({_mid_sentence(z['character'])}) in "
            f"{d['name']} district, which starts at {z['baseline_flood_risk_pct']}% "
            f"flood risk. Ask about flood risk, displacement, farmland, how the area "
            f"has grown, or what has been decided here."
        )
    return (
        f"I'm looking at {d['name']} district. Ask about flood risk, displacement, "
        f"farmland, how the area has grown, or what has been decided here."
    )


# Words that make the platform's own evidence relevant to a question
_ISRO_WORDS = ("built", "urban", "grow", "sprawl", "expan", "change", "history",
               "past", "2005", "2015", "land use", "time machine", "pimpri", "chinchwad")
_LEDGER_WORDS = ("decid", "decision", "approv", "reject", "ledger", "blockchain",
                 "record", "sealed", "official")


@app.post("/api/copilot", response_model=CopilotOutput)
def copilot_chat(input: CopilotInput):
    """
    Retrieval-augmented answering, in three steps:

      1. RETRIEVE  Gather evidence: research-library passages (searched in the
                   browser and sent with the question), plus two sources this
                   server holds - ISRO's measured land-use change, and
                   decisions sealed on the blockchain.
      2. AUGMENT   Keep only the evidence that fits the question and scope.
      3. GENERATE  Write the answer from the simulation model, then add one
                   sentence per piece of evidence, numbered so every claim
                   points to its source.

    Generation is rule-based so no API key is needed; swapping in an LLM means
    passing it the same question and evidence.
    """
    query = input.query.lower()
    _, d = resolve_district(input.district)
    zone = resolve_zone(input.zone)[1] if input.zone else None
    scope = zone["name"] if zone else f"{d['name']} district"

    citations: list[Citation] = []
    sentences: list[str] = []

    def cite(kind: str, title: str, detail: str, sentence: str) -> None:
        n = len(citations) + 1
        citations.append(Citation(n=n, kind=kind, title=title, detail=detail))
        sentences.append(f"{sentence} [{n}]")

    # Research library - already ranked by relevance in the browser
    for s in input.sources[:2]:
        finding = s.text.strip().rstrip(".")
        if not finding:
            continue
        cite(
            "library",
            s.title,
            " · ".join(x for x in (s.org, s.date) if x),
            f"Relevant research: \"{s.title}\" - {finding[0].lower() + finding[1:]}.",
        )

    # ISRO's measured change - real data, from the time-machine surveys
    about_growth = any(w in query for w in _ISRO_WORDS) or (
        zone is not None and zone["name"] == "Hinjewadi" and ("farmland" in query or "agri" in query)
    )
    if about_growth:
        lc = landuse_change.get_change()
        if lc.get("available"):
            first, last = lc["years"][0], lc["years"][-1]
            cite(
                "isro",
                "ISRO Bhuvan land use surveys, 2005 and 2015",
                lc["region_label"],
                f"ISRO's own surveys show built-up land in north-west Pune grew from "
                f"{first['built_up_km2']} km² in {first['year']} to {last['built_up_km2']} km² "
                f"in {last['year']} - {lc['change']['km2']} km² built over in ten years.",
            )

    # Decisions already sealed for this place - real records on the ledger
    if any(w in query for w in _LEDGER_WORDS):
        decisions = [
            b for b in NETWORK.agreed_chain()
            if b["data"].get("type") == "policy_decision" and b["data"].get("scope") == scope
        ]
        for b in decisions[-2:]:
            data = b["data"]
            cite(
                "ledger",
                f"Blockchain Ledger, Block #{b['index']}",
                f"signed by {data.get('recorded_by', 'an official')}",
                f"Block #{b['index']} records that {data['lever_label'].lower()} at "
                f"{data['conversion_pct']:g}% in {scope} was {data['decision']} "
                f"(risk {data['risk_score']}, {data['risk_level']})."
                + (f' Reason given: "{data["reason"]}"' if data.get("reason") else ""),
            )
        if not decisions:
            sentences.append(f"No decision for {scope} has been sealed on the ledger yet.")

    answer = _topic_answer(input)
    if answer == _GENERIC_ANSWER:
        # Not a modelled topic: lead with the evidence if there is any
        if sentences:
            return CopilotOutput(
                response=f"Here is what the platform's evidence says about {scope}:\n\n"
                + "\n".join(sentences),
                citations=citations,
            )
        return CopilotOutput(response=_generic_help(input), citations=[])
    if sentences:
        answer += "\n\n" + "\n".join(sentences)
    return CopilotOutput(response=answer, citations=citations)


# ---------- Blockchain ledger of policy decisions ----------
#
# When an official approves or rejects a simulated policy, the decision AND the
# evidence it was based on are signed with the official's key and sealed into a
# block that every office checks before accepting. See blockchain.py for how
# hashing, chaining, proof of work, signatures and consensus fit together.

_LEDGER_DIR = Path(__file__).parent / "ledger_data"
_GT_INDEX_FILE = Path(__file__).parent / "ground_truth" / "observations.json"


def _archive_single_copy_ledger() -> None:
    """
    Ledgers from before the office network (one ledger.json plus a backup) have
    no signatures, so they can't join it. Move them aside, with the photo index
    that points into them, and start a fresh network.
    """
    old = [_LEDGER_DIR / "ledger.json", _LEDGER_DIR / "ledger_honest_copy.json"]
    if not old[0].exists():
        return
    archive = _LEDGER_DIR / "archive_single_copy"
    archive.mkdir(parents=True, exist_ok=True)
    for f in old:
        if f.exists():
            f.replace(archive / f.name)
    if _GT_INDEX_FILE.exists():
        _GT_INDEX_FILE.replace(archive / "observations.json")


_archive_single_copy_ledger()

# Each account's signing key; the public halves go into the first block
KEYS = KeyRing(server_secret())
MEMBERS = [
    {"username": u, "name": d["name"], "role": d["role"], "public_key": KEYS.public_key(u)}
    for u, d in USERS.items()
]
NETWORK = Network(_LEDGER_DIR / "offices", MEMBERS)


def decision_record(sim: SimulationOutput, decision: str, recorded_by: str, reason: str = "") -> dict:
    """The data sealed into a block: what was decided, why, and the numbers behind it."""
    scope = sim.zone_name or f"{sim.district_name} district"
    verb = "Approved" if decision == "approved" else "Rejected"
    return {
        "type": "policy_decision",
        "title": f"{verb}: {sim.policy_lever_label}, {sim.agri_to_commercial_pct:g}% in {scope}",
        "decision": decision,
        "reason": reason.strip(),
        "lever": sim.policy_lever,
        "lever_label": sim.policy_lever_label,
        "scope": scope,
        "conversion_pct": sim.agri_to_commercial_pct,
        "monsoon_intensity": sim.monsoon_intensity,
        "population_growth_rate": sim.population_growth_rate,
        "risk_score": sim.risk_score,
        "risk_level": sim.risk_level,
        "flood_risk_increase_pct": sim.predicted_flood_risk_increase_pct,
        "displacement_persons": sim.predicted_displacement_persons,
        "land_label": sim.land_label,
        "land_lost_hectares": sim.predicted_farmland_loss_hectares,
        "biodiversity_impact_score": sim.biodiversity_impact_score,
        "recorded_by": recorded_by,
    }


# First run only: seal two example decisions so the ledger has a visible chain
# to walk through in a demo. Their numbers come from the real model above, and
# they are signed with the demo official's key like any other decision.
if len(NETWORK.agreed_chain()) == 1:
    for lever, zone, pct, decision, reason in (
        (
            "agri_residential", "kothrud", 20, "approved",
            "Kothrud is already largely built out, so a modest residential conversion adds little flood risk.",
        ),
        (
            "wetland_encroachment", "hadapsar", 10, "rejected",
            "Hadapsar sits on the Mula-Mutha floodplain; filling its wetlands would push flood risk too high.",
        ),
    ):
        seed_sim = simulate_policy(
            SimulationInput(agri_to_commercial_pct=pct, zone=zone, policy_lever=lever)
        )
        seed = decision_record(seed_sim, decision, "Demo seed", reason)
        seed["recorded_by_user"] = "official@demo"
        NETWORK.propose(KEYS.sign("official@demo", seed))


class RecordDecisionInput(BaseModel):
    # The scenario being decided on. The server re-runs it rather than trusting
    # numbers sent by the browser, so a client cannot seal made-up results.
    simulation: SimulationInput
    decision: Literal["approved", "rejected"]
    # Why - required by the rule book when approving a High-risk policy
    reason: str = Field(default="", max_length=500)
    # No role field: who is asking comes from the signed pass (see auth.py),
    # never from the request body.


class LoginInput(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
def login(input: LoginInput):
    """Check the password and hand back a signed pass for later requests."""
    user = authenticate(input.username, input.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Wrong username or password.")
    token, expires_at = issue_token(input.username)
    return {
        "token": token,
        "expires_at": expires_at,
        "user": {"username": input.username, "role": user["role"], "name": user["name"]},
    }


@app.get("/api/auth/me")
def whoami(user: dict = Depends(current_user)):
    """Who the server thinks you are, read from your signed pass."""
    return {"username": user["sub"], "role": user["role"], "name": user["name"]}


class TamperInput(BaseModel):
    office: str = "district"
    index: int
    attack: Literal["edit", "rewrite", "erase"] = "edit"


class RepairInput(BaseModel):
    office: str | None = None


def ledger_view() -> dict:
    """
    The agreed chain under the same `blocks` / `verification` keys as before,
    so every reader (Dashboard, reports, map) sees the version most offices
    hold - plus each office's own copy for the Ledger tab.
    """
    net = NETWORK.status()
    return {
        "difficulty": DIFFICULTY,
        "blocks": net["agreed_chain"],
        "verification": net["agreed_verification"],
        "network": {
            "offices": net["offices"],
            "has_majority": net["has_majority"],
            "all_agree": net["all_agree"],
            "rule_book": RULE_BOOK,
            "min_reason_chars": MIN_REASON_CHARS,
        },
    }


@app.get("/api/ledger")
def get_ledger():
    """Every office's copy, the agreed chain, and a fresh verification. Anyone may read it."""
    return ledger_view()


@app.get("/api/ledger/verify")
def verify_ledger():
    """Recompute every hash, link and signature in every office's copy."""
    return ledger_view()


@app.post("/api/ledger/record")
def record_decision(input: RecordDecisionInput, user: dict = Depends(current_user)):
    """Only officials may write. Everyone else can still read and verify."""
    if user["role"] != "official":
        raise HTTPException(
            status_code=403,
            detail="Only government officials can record decisions. Anyone can verify the ledger.",
        )
    sim = simulate_policy(input.simulation)
    record = decision_record(sim, input.decision, user["name"], input.reason)
    # Which account sealed it - accountability, taken from the signed pass
    record["recorded_by_user"] = user["sub"]
    try:
        block, votes = NETWORK.propose(KEYS.sign(user["sub"], record))
    except BlockRejected as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"block": block, "votes": votes, **ledger_view()}


@app.post("/api/ledger/tamper")
def tamper_ledger(input: TamperInput):
    """DEMO ONLY - an insider forges one office's copy so the checks can catch it."""
    try:
        change = NETWORK.tamper(input.office, input.index, input.attack)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"change": change, **ledger_view()}


@app.post("/api/ledger/repair")
def repair_ledger(input: RepairInput):
    """An office that disagrees downloads the copy the majority holds."""
    try:
        repaired = NETWORK.repair(input.office)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"repaired": repaired, **ledger_view()}


@app.post("/api/ledger/restore")
def restore_ledger():
    """Repair every office that disagrees with the majority."""
    NETWORK.repair(None)
    return ledger_view()


# ---------- Citizen ground-truth photos ----------
#
# Anyone can photograph what is actually happening on the ground - flooding,
# a new building on a lake edge - and pin it to the map. The photo's SHA-256
# fingerprint is sealed on the ledger, so if the stored file is ever swapped
# for a different picture, the fingerprints stop matching and the map says so.
#
# Photos arrive as base64 inside JSON rather than as a multipart upload:
# FastAPI's multipart support needs the extra python-multipart package, and a
# 5 MB cap keeps the JSON size reasonable.

_GT_DIR = Path(__file__).parent / "ground_truth"
_GT_PHOTOS = _GT_DIR / "photos"
_GT_INDEX = _GT_INDEX_FILE
_GT_LOCK = threading.Lock()

GT_CATEGORIES = [
    "Flooding",
    "New construction",
    "Encroachment on water body",
    "Farmland",
    "Tree cutting",
    "Other",
]
GT_MAX_BYTES = 5 * 1024 * 1024


def _image_extension(raw: bytes) -> str | None:
    """Identify the format from the file's first bytes, not its claimed name."""
    if raw[:3] == b"\xff\xd8\xff":
        return "jpg"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "webp"
    return None


def _load_observations() -> list[dict]:
    if not _GT_INDEX.exists():
        return []
    return json.loads(_GT_INDEX.read_text(encoding="utf-8"))


class GroundTruthInput(BaseModel):
    image_base64: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    category: str
    note: str = Field(default="", max_length=200)


@app.post("/api/ground-truth")
def submit_ground_truth(input: GroundTruthInput, user: dict = Depends(current_user)):
    """Any signed-in user may report. The photo's fingerprint is sealed as a new block."""
    if input.category not in GT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Unknown category.")

    try:
        raw = base64.b64decode(input.image_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="The photo could not be read.")
    if len(raw) > GT_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Photos must be under 5 MB.")
    ext = _image_extension(raw)
    if ext is None:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG or WebP photos are accepted.")

    sha = hashlib.sha256(raw).hexdigest()
    photo_file = f"{sha}.{ext}"

    with _GT_LOCK:
        observations = _load_observations()
        # Stored files are named by their fingerprint, so the name is the check
        existing = next((o for o in observations if o["photo_file"].startswith(f"{sha}.")), None)
        if existing:
            # Same fingerprint means byte-for-byte the same photo
            raise HTTPException(
                status_code=409,
                detail=f"This exact photo is already on the ledger in Block #{existing['block_index']}.",
            )

        _GT_PHOTOS.mkdir(parents=True, exist_ok=True)
        (_GT_PHOTOS / photo_file).write_bytes(raw)

        recorded_by = user["name"]
        record = {
            "type": "ground_truth",
            "title": f"Citizen photo: {input.category} at {input.lat:.4f}, {input.lng:.4f}",
            "category": input.category,
            "note": input.note.strip(),
            "lat": round(input.lat, 6),
            "lng": round(input.lng, 6),
            "photo_file": photo_file,
            "photo_sha256": sha,
            "photo_bytes": len(raw),
            "recorded_by": recorded_by,
            "recorded_by_user": user["sub"],
        }
        try:
            # Signed by the reporter, then checked by every office
            block, votes = NETWORK.propose(KEYS.sign(user["sub"], record))
        except BlockRejected as e:
            (_GT_PHOTOS / photo_file).unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail=str(e))
        observation = {
            "block_index": block["index"],
            "timestamp": block["timestamp"],
            "lat": round(input.lat, 6),
            "lng": round(input.lng, 6),
            "category": input.category,
            "note": input.note.strip(),
            "photo_file": photo_file,
            "recorded_by": recorded_by,
        }
        observations.append(observation)
        _GT_INDEX.write_text(json.dumps(observations, indent=2), encoding="utf-8")

    return {"observation": observation, "block": block, "votes": votes}


@app.get("/api/ground-truth")
def list_ground_truth():
    """
    Every citizen photo, each re-checked against the ledger: the fingerprint
    is recomputed from the stored file and compared with the one sealed in
    its block - not with our own index file, which an insider could edit.
    """
    net = NETWORK.status()
    blocks = {b["index"]: b for b in net["agreed_chain"]}
    checks = {c["index"]: c for c in net["agreed_verification"]["blocks"]}
    out = []
    for o in _load_observations():
        block = blocks.get(o["block_index"])
        sealed_sha = block["data"].get("photo_sha256") if block else None
        path = _GT_PHOTOS / o["photo_file"]
        actual_sha = hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
        out.append(
            {
                **o,
                "sealed_sha256": sealed_sha,
                "photo_intact": actual_sha is not None and actual_sha == sealed_sha,
                "block_intact": block is not None and checks[o["block_index"]]["problem"] is None,
            }
        )
    return {"categories": GT_CATEGORIES, "observations": out}


_PHOTO_NAME = re.compile(r"^[0-9a-f]{64}\.(jpg|png|webp)$")


@app.get("/api/landuse-change")
def landuse_change_summary():
    """
    How much of north-west Pune was built over between ISRO's 2005 and 2015
    land-use surveys, measured from the survey maps themselves (see
    landuse_change.py). Returns immediately; while the one-off measurement is
    still running it says so instead of blocking.
    """
    return landuse_change.get_change()


# Start measuring at server start so the figures are ready when someone opens
# the map (about a minute the first time, instant after that from the cache).
landuse_change.warm_up()


@app.get("/api/ground-truth/photo/{name}")
def ground_truth_photo(name: str):
    # Strict pattern: only files this server named itself, never a path
    if not _PHOTO_NAME.match(name) or not (_GT_PHOTOS / name).exists():
        raise HTTPException(status_code=404, detail="Photo not found.")
    return FileResponse(_GT_PHOTOS / name)
