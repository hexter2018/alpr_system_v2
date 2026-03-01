import re

THAI_ALNUM = re.compile(r"[^0-9ก-ฮA-Za-z-]")

# ─────────────────────────────────────────────────────────────────────────────
# OCR Confusion Map (Latin/Symbol → Digit)
# OCR engine บางครั้งอ่านตัวเลขเป็น Latin ที่หน้าตาคล้ายกัน
# ตัวอย่าง: เลข 0 ถูกอ่านเป็น 'O', เลข 8 ถูกอ่านเป็น 'B'
# ต้องแปลงกลับก่อนที่จะ strip ออกจาก string
# ─────────────────────────────────────────────────────────────────────────────
_LATIN_TO_DIGIT: dict[str, str] = {
    "O": "0",   # อักษร O → เลข 0
    "o": "0",
    "I": "1",   # อักษร I → เลข 1 (พบบ่อยในป้ายที่มีแสงน้อย)
    "l": "1",   # อักษร l (lowercase L) → เลข 1
    "B": "8",   # อักษร B → เลข 8
    "S": "5",   # อักษร S → เลข 5
    "Z": "2",   # อักษร Z → เลข 2
    "G": "6",   # อักษร G → เลข 6
    "q": "9",   # อักษร q → เลข 9
    "D": "0",   # อักษร D → เลข 0 (พบในบางกรณี)
}

# Thai digit characters → ASCII digits (same as in ocr.py)
_THAI_DIGIT_MAP = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")


def apply_ocr_latin_fix(text: str) -> str:
    """
    แปลงตัวอักษร Latin ที่ OCR มักจะอ่านผิดเป็นตัวเลขที่ถูกต้อง
    เรียกใช้หลังจากได้ผลลัพธ์จาก OCR engine ก่อนที่จะ strip ตัวอักษรที่ไม่ใช่ Thai/digit
    """
    if not text:
        return text
    result = []
    for ch in text:
        result.append(_LATIN_TO_DIGIT.get(ch, ch))
    return "".join(result)


def normalize_plate_text(text: str) -> str:
    t = (text or "").strip()
    # 1) แปลง Thai digits → ASCII digits
    t = t.translate(_THAI_DIGIT_MAP)
    # 2) แปลง Latin confusables → digits ก่อน strip
    t = apply_ocr_latin_fix(t)
    # 3) Strip ตัวอักษรที่ไม่ใช่ Thai/digit/Latin/dash
    t = THAI_ALNUM.sub("", t)
    t = t.replace(" ", "")
    return t.upper()
