import re

# ─────────────────────────────────────────────
# Standard Thai plate patterns
#   1) ก-ฮ (1-2 chars)  + 1-4 digits       e.g.  กข 1234
#   2) 1 digit + ก-ฮ (1-2) + 1-4 digits   e.g.  1กข 1234
#   3) 1-2 digits + dash + 1-4 digits      e.g.  12-3456  (gov/transit)
# ─────────────────────────────────────────────
# Special plate patterns
#   TC / QC   – Test-car / Quality-check English prefix  e.g.  TC 3337, QC 12
#   Pure digits (4-5)  – Police / Military central       e.g.  76816, 1234
#   Diplomat           – Thai-char prefix + digits       e.g.  ทส 1234, พ 01 5678
# ─────────────────────────────────────────────

PATTERNS = [
    # ── Standard ──────────────────────────────────────────────────
    re.compile(r"^[ก-ฮ]{1,2}\d{1,4}$"),
    re.compile(r"^\d[ก-ฮ]{1,2}\d{1,4}$"),
    re.compile(r"^\d{1,2}-\d{1,4}$"),

    # ── Test Cars (TC / QC) ────────────────────────────────────────
    # Accepts:  TC3337  TC 3337  tc3337  QC12  qc 9999
    re.compile(r"^(TC|QC)\s?\d{1,4}$", re.IGNORECASE),

    # ── Police / Military – pure 4-5 digit plates ─────────────────
    # e.g. 7681 or 76816
    re.compile(r"^\d{4,5}$"),

    # ── Diplomat plates ───────────────────────────────────────────
    # Format: one of ท / พ / อ  + 2 digits + optional space + 1-4 digits
    # e.g.  ทส1234  พ011234  อ 1234
    re.compile(r"^[ทพอ]\d{2}\s?\d{1,4}$"),
]


def is_valid_plate(norm: str) -> bool:
    """Return True if *norm* matches any known Thai plate format."""
    if not norm:
        return False
    for p in PATTERNS:
        if p.match(norm):
            return True
    return False


def classify_plate_type(norm: str) -> str:
    """
    Return a coarse plate-type string for a normalised plate text.

    Returns one of: 'STANDARD' | 'TEST_CAR' | 'POLICE' | 'DIPLOMAT' | 'UNKNOWN'
    """
    if not norm:
        return "UNKNOWN"
    if re.match(r"^(TC|QC)\s?\d{1,4}$", norm, re.IGNORECASE):
        return "TEST_CAR"
    if re.match(r"^\d{4,5}$", norm):
        return "POLICE"
    if re.match(r"^[ทพอ]\d{2}\s?\d{1,4}$", norm):
        return "DIPLOMAT"
    if re.match(r"^[ก-ฮ]{1,2}\d{1,4}$", norm):
        return "STANDARD"
    if re.match(r"^\d[ก-ฮ]{1,2}\d{1,4}$", norm):
        return "STANDARD"
    if re.match(r"^\d{1,2}-\d{1,4}$", norm):
        return "STANDARD"
    return "UNKNOWN"
