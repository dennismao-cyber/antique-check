#!/usr/bin/env python3
"""Build the Europe porcelain digest H5 data from the 欧洲筛选日报 PDF."""

from __future__ import annotations

import argparse
import json
import re
import shutil
from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pymupdf

SHANGHAI = ZoneInfo("Asia/Shanghai")
YEAR = 2026
GENERATED = datetime(2026, 11, 25, 12, 10, tzinfo=SHANGHAI)
DATE = "2026-11-25"

COUNTRIES = "法国|丹麦|比利时|英国|瑞典|德国|荷兰|意大利|西班牙|瑞士|奥地利|挪威|爱尔兰|波兰"
COUNTRY_RE = re.compile(COUNTRIES)
META_START_RE = re.compile(
    rf"^.+? · (?:{COUNTRIES})\b"
)
PAGE_NUM_RE = re.compile(r"^\s*\d+\s*/\s*105\s*$")
SCORE_RE = re.compile(r"^关注\s*(\d+)\s*分$")
ID_RE = re.compile(r"^编号\s*(\d+)$")
TIME_RE = re.compile(
    r"当地\s*(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})\s*（北京\s*(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})）"
)
LOT_NO_RE = re.compile(r"第\s*(.+?)\s*号")

# House slug and official site derived from observed catalogue hosts.
HOUSE_INFO = {
    "Audap & Associés": {
        "id": "audap",
        "url": "https://www.audap-associes.com",
    },
    "Bruun Rasmussen": {
        "id": "bruun-rasmussen",
        "url": "https://bruun-rasmussen.dk",
    },
    "Conan Belleville Hôtel d'Ainay": {
        "id": "conan",
        "url": "https://www.conanauction.fr",
    },
    "Galerie Moderne": {
        "id": "galerie-moderne",
        "url": "https://www.galeriemoderne.be",
    },
    "Crafoord Auktioner Lund": {
        "id": "crafoord-lund",
        "url": "https://auctionet.com",
    },
    "Brettells": {
        "id": "brettells",
        "url": "https://www.brettells.com",
    },
    "Morphets of Harrogate": {
        "id": "morphets",
        "url": "https://www.morphets.co.uk",
    },
    "Giquello et Associés": {
        "id": "giquello",
        "url": "https://www.giquelloetassocies.fr",
    },
    "Stockholms Auktionsverk Magasin 5": {
        "id": "stockholms-magasin-5",
        "url": "https://auctionet.com",
    },
    "Stockholms Auktionsverk Hamburg": {
        "id": "stockholms-hamburg",
        "url": "https://auctionet.com",
    },
    "Karljohan Auktioner": {
        "id": "karljohan",
        "url": "https://auctionet.com",
    },
    "Bidstrup Auktioner": {
        "id": "bidstrup",
        "url": "https://auctionet.com",
    },
    "Bamfords Auctioneers": {
        "id": "bamfords",
        "url": "https://auctions.bamfords-auctions.co.uk",
    },
    "De Baecque et Associés": {
        "id": "debaecque",
        "url": "https://www.debaecque.fr",
    },
    "Binoche et Giquello": {
        "id": "binoche-giquello",
        "url": "https://www.binocheetgiquello.com",
    },
    "Daguerre": {
        "id": "daguerre",
        "url": "https://www.daguerre.fr",
    },
    "Osenat": {
        "id": "osenat",
        "url": "https://www.osenat.com",
    },
}


def is_cjk(ch: str) -> bool:
    o = ord(ch)
    return (
        0x4E00 <= o <= 0x9FFF
        or 0x3400 <= o <= 0x4DBF
        or 0xF900 <= o <= 0xFAFF
        or 0x3000 <= o <= 0x303F
        or 0xFF00 <= o <= 0xFFEF
    )


def join_wrapped(lines: list[str], url: bool = False) -> str:
    cleaned = [re.sub(r"[ \t]+", " ", ln).strip() for ln in lines if ln.strip()]
    if not cleaned:
        return ""
    if url:
        return "".join(cleaned)
    out = cleaned[0]
    for line in cleaned[1:]:
        prev = out[-1]
        if is_cjk(prev) or prev in "、，。；：）)」』》!！?？" or is_cjk(line[0]):
            out += line
        elif prev == "-":
            out += line
        else:
            out += " " + line
    return out


def to_iso(month: int, day: int, hour: int, minute: int) -> str:
    year = YEAR
    # Dates in this report are Nov–Dec 2026 only.
    dt = datetime(year, month, day, hour, minute, tzinfo=SHANGHAI)
    return dt.isoformat()


def hours_as_of_generation(iso: str) -> int:
    dt = datetime.fromisoformat(iso)
    delta = (dt - GENERATED).total_seconds() / 3600.0
    return int(round(delta))


def parse_price(text: str) -> dict:
    raw = re.sub(r"\s+", " ", text).strip()
    raw = raw.replace("（", "(").replace("）", ")")
    result = {
        "kind": "estimate",
        "text": re.sub(r"\s+", " ", text).strip(),
    }
    cny = re.search(r"[¥￥]\s*([0-9,]+)", raw)
    if cny:
        result["cny"] = int(cny.group(1).replace(",", ""))
    currency = None
    if "€" in raw or "EUR" in raw:
        currency = "EUR"
        body = raw.split("≈")[0].split("(")[0]
        nums = re.findall(r"€\s*([0-9,]+)|(?<=\D)([0-9,]+)(?!\s*¥)", body)
        # simpler:
        nums = re.findall(r"([0-9][0-9,]*)", body.replace("€", " "))
    elif "£" in raw or "GBP" in raw:
        currency = "GBP"
        body = raw.split("≈")[0].split("(")[0]
        nums = re.findall(r"([0-9][0-9,]*)", body.replace("£", " "))
    elif "DKK" in raw:
        currency = "DKK"
        body = raw.split("≈")[0].split("(")[0]
        nums = re.findall(r"([0-9][0-9,]*)", body.replace("DKK", " "))
    elif "SEK" in raw:
        currency = "SEK"
        body = raw.split("≈")[0].split("(")[0]
        nums = re.findall(r"([0-9][0-9,]*)", body.replace("SEK", " "))
    else:
        body = raw.split("≈")[0].split("(")[0]
        nums = re.findall(r"([0-9][0-9,]*)", body)
    if currency:
        result["currency"] = currency
    values = [int(n.replace(",", "")) for n in nums if n]
    if len(values) >= 2:
        result["low"] = values[0]
        result["high"] = values[1]
    elif len(values) == 1:
        result["low"] = values[0]
        result["high"] = values[0]
    return result


def parse_meta(meta: str) -> dict:
    text = re.sub(r"\s+", " ", meta).strip()
    m = re.match(
        rf"^(?P<house>.+?) · (?P<country>{COUNTRIES})(?: (?P<city>[^·]+?))?(?: · (?P<rest>.*))?$",
        text,
    )
    if not m:
        raise ValueError(f"cannot parse meta: {text}")
    house = m.group("house").strip()
    country = m.group("country")
    city = (m.group("city") or "").strip() or None
    rest = (m.group("rest") or "").strip()
    lot_no = None
    sale = None
    if rest:
        lot_m = re.search(r" · 第\s*(.+?)\s*号\s*$", " · " + rest if not rest.startswith("第") else rest)
        # rest may be "SALE · 第 115 号" or just empty
        lot_m = re.search(r"第\s*(.+?)\s*号\s*$", rest)
        if lot_m:
            lot_no = lot_m.group(1).strip()
            sale = rest[: lot_m.start()].strip(" ·")
        else:
            sale = rest
    if sale == "":
        sale = None
    info = HOUSE_INFO.get(house)
    if not info:
        raise ValueError(f"unknown house: {house!r} in {text}")
    return {
        "house": house,
        "houseId": info["id"],
        "houseUrl": info["url"],
        "country": country,
        "city": city,
        "sale": sale,
        "lotNo": lot_no,
    }


def clean_page_lines(text: str) -> list[str]:
    lines = []
    for ln in text.splitlines():
        s = ln.strip()
        if not s or PAGE_NUM_RE.match(s):
            continue
        # drop isolated form-feed leftovers
        s = s.replace("\x0c", "").strip()
        if s:
            lines.append(s)
    return lines


def parse_new_lot(page_no: int, text: str) -> dict:
    if "提醒：" in text:
        text = text.split("提醒：")[0]
    # strip intro on page 3
    if "新入选 101 件" in text:
        text = text.split("关注 ", 1)
        if len(text) != 2:
            raise ValueError("page 3 missing first lot")
        text = "关注 " + text[1]
    lines = clean_page_lines(text)
    if not lines:
        raise ValueError(f"empty lot page {page_no}")

    sm = SCORE_RE.match(lines[0])
    if not sm:
        raise ValueError(f"page {page_no} no score: {lines[:3]}")
    score = int(sm.group(1))
    i = 1
    badge = None
    flags = []
    while i < len(lines):
        if lines[i] in ("今日新", "昨日新"):
            badge = lines[i]
            i += 1
            continue
        if lines[i] in ("描述有损伤", "材质未写明"):
            flags.append(lines[i])
            i += 1
            continue
        break
    im = ID_RE.match(lines[i])
    if not im:
        raise ValueError(f"page {page_no} no id at {lines[i]!r}")
    lot_id = im.group(1)
    i += 1

    title_lines = []
    while i < len(lines) and not META_START_RE.match(lines[i]):
        title_lines.append(lines[i])
        i += 1
    if not title_lines:
        raise ValueError(f"page {page_no} missing title")
    title = join_wrapped(title_lines)

    meta_lines = []
    while i < len(lines) and lines[i] not in ("开拍", "截拍"):
        meta_lines.append(lines[i])
        i += 1
    if i >= len(lines) or lines[i] not in ("开拍", "截拍"):
        raise ValueError(f"page {page_no} missing 开拍/截拍")
    timing = lines[i]
    i += 1
    meta = parse_meta(join_wrapped(meta_lines))

    time_lines = []
    while i < len(lines) and lines[i] != "估价":
        time_lines.append(lines[i])
        i += 1
    time_text = join_wrapped(time_lines)
    tm = TIME_RE.search(time_text)
    if not tm:
        raise ValueError(f"page {page_no} bad time: {time_text!r}")
    local_time = f"{int(tm.group(1))}月{int(tm.group(2)):02d}日 {int(tm.group(3)):02d}:{tm.group(4)}"
    # keep original formatting closer to source:
    local_label = f"{int(tm.group(1))}月{int(tm.group(2))}日 {tm.group(3).zfill(2)}:{tm.group(4)}"
    beijing_label = f"{int(tm.group(5))}月{int(tm.group(6))}日 {tm.group(7).zfill(2)}:{tm.group(8)}"
    # preserve source-like labels without forcing zero-padded day
    local_label = f"{int(tm.group(1))}月{int(tm.group(2))}日 {int(tm.group(3)):02d}:{tm.group(4)}"
    beijing_label = f"{int(tm.group(5))}月{int(tm.group(6))}日 {int(tm.group(7)):02d}:{tm.group(8)}"
    beijing_iso = to_iso(int(tm.group(5)), int(tm.group(6)), int(tm.group(7)), int(tm.group(8)))
    local_iso_date = to_iso(int(tm.group(1)), int(tm.group(2)), int(tm.group(3)), int(tm.group(4)))
    if i >= len(lines) or lines[i] != "估价":
        raise ValueError(f"page {page_no} missing 估价")
    i += 1
    price_lines = []
    while i < len(lines) and not lines[i].startswith("入选理由"):
        price_lines.append(lines[i])
        i += 1
    price = parse_price(join_wrapped(price_lines))

    if i >= len(lines) or not lines[i].startswith("入选理由"):
        raise ValueError(f"page {page_no} missing 入选理由")
    reason_lines = [lines[i].split("入选理由：", 1)[-1] if "入选理由：" in lines[i] else lines[i]]
    i += 1
    while i < len(lines) and not lines[i].startswith("拍行标题"):
        reason_lines.append(lines[i])
        i += 1
    reason = join_wrapped(reason_lines)

    if i >= len(lines) or not lines[i].startswith("拍行标题"):
        raise ValueError(f"page {page_no} missing 拍行标题")
    cat_lines = [lines[i].split("拍行标题：", 1)[-1] if "拍行标题：" in lines[i] else lines[i]]
    i += 1
    while i < len(lines) and not lines[i].startswith("原拍品页面"):
        cat_lines.append(lines[i])
        i += 1
    catalogue = join_wrapped(cat_lines)

    if i >= len(lines) or not lines[i].startswith("原拍品页面"):
        raise ValueError(f"page {page_no} missing 原拍品页面")
    url_lines = [lines[i].split("原拍品页面：", 1)[-1] if "原拍品页面：" in lines[i] else lines[i]]
    i += 1
    while i < len(lines):
        url_lines.append(lines[i])
        i += 1
    url = join_wrapped(url_lines, url=True)
    if not url.startswith("https://"):
        raise ValueError(f"page {page_no} bad url: {url!r}")

    lot = {
        "id": lot_id,
        "source": "new",
        "page": page_no,
        "score": score,
        "badge": badge,
        "flags": flags,
        "title": title,
        **meta,
        "timing": timing,
        "localTime": local_label,
        "beijingTime": beijing_label,
        "beijingIso": beijing_iso,
        "localIso": local_iso_date,
        "hoursAtGeneration": hours_as_of_generation(beijing_iso),
        "price": price,
        "reason": reason,
        "catalogueTitle": catalogue,
        "url": url,
        "image": None,
    }
    return lot


def parse_reminders(texts: list[str]) -> list[dict]:
    """Parse compact reminder entries from pages 103-105."""
    blob_lines = []
    started = False
    for text in texts:
        raw = text
        if "提醒：" in raw:
            raw = raw.split("提醒：", 1)[1]
            started = True
            # drop the two intro lines after header; handled below
        elif not started:
            continue
        if "汇率：" in raw:
            raw = raw.split("汇率：", 1)[0]
        for ln in raw.splitlines():
            s = ln.strip()
            if not s or PAGE_NUM_RE.match(s):
                continue
            if s.startswith("此前推送过") or s.startswith("只列快到时间"):
                continue
            blob_lines.append(s)
    # Now split by 关注 N 分
    blob = "\n".join(blob_lines)
    parts = re.split(r"(?=关注\s*\d+\s*分)", blob)
    reminders = []
    for idx, part in enumerate(parts, start=1):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"关注\s*(\d+)\s*分\s*(.*)$", part, re.S)
        if not m:
            raise ValueError(f"bad reminder block: {part!r}")
        score = int(m.group(1))
        rest = m.group(2).strip()
        # title until house/country line
        rlines = [ln.strip() for ln in rest.splitlines() if ln.strip()]
        title_lines = []
        i = 0
        while i < len(rlines) and not META_START_RE.match(rlines[i]):
            title_lines.append(rlines[i])
            i += 1
        if i >= len(rlines):
            raise ValueError(f"reminder missing meta: {part!r}")
        title = join_wrapped(title_lines)
        # remaining lines: meta + time + optional price + url
        remain = rlines[i:]
        # find url start
        url_i = next((j for j, ln in enumerate(remain) if ln.startswith("https://")), None)
        if url_i is None:
            raise ValueError(f"reminder missing url: {part!r}")
        url = join_wrapped(remain[url_i:], url=True)
        meta_blob = join_wrapped(remain[:url_i])
        # meta_blob like:
        # Bidstrup Auktioner · 丹麦 · 截拍 11月25日 10:11（北京 11月25日 17:11） · DKK 5,000（≈ ¥4,884）
        # Bamfords Auctioneers · 英国 · 第 494 号 · 开拍 11月25日 10:30（北京 11月25日 18:30） · £60 – 100（≈ ¥524）
        # Bamfords ... · 第 522 号 · 开拍 11月25日 10:30（北京 11月25日 18:30）   [no price]
        tm = re.search(
            r"(开拍|截拍)\s*(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})\s*（北京\s*(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})）",
            meta_blob,
        )
        if not tm:
            raise ValueError(f"reminder bad time: {meta_blob!r}")
        timing = tm.group(1)
        local_label = f"{int(tm.group(2))}月{int(tm.group(3))}日 {int(tm.group(4)):02d}:{tm.group(5)}"
        beijing_label = f"{int(tm.group(6))}月{int(tm.group(7))}日 {int(tm.group(8)):02d}:{tm.group(9)}"
        beijing_iso = to_iso(int(tm.group(6)), int(tm.group(7)), int(tm.group(8)), int(tm.group(9)))
        local_iso = to_iso(int(tm.group(2)), int(tm.group(3)), int(tm.group(4)), int(tm.group(5)))
        before = meta_blob[: tm.start()].strip(" ·")
        after = meta_blob[tm.end() :].strip(" ·")
        # before: House · country · 第 N 号?
        meta_before = parse_meta(before if COUNTRY_RE.search(before) else before)
        # parse_meta expects house · country...
        price = parse_price(after) if after else None
        if price and not (price.get("cny") or price.get("low") or after):
            price = None
        if after == "":
            price = None

        rem_id = reminder_id(url, meta_before.get("lotNo"), idx, meta_before.get("houseId"))
        reminders.append(
            {
                "id": rem_id,
                "source": "reminder",
                "score": score,
                "badge": "此前推过",
                "flags": [],
                "title": title,
                **meta_before,
                "timing": timing,
                "localTime": local_label,
                "beijingTime": beijing_label,
                "beijingIso": beijing_iso,
                "localIso": local_iso,
                "hoursAtGeneration": hours_as_of_generation(beijing_iso),
                "price": price,
                "reason": None,
                "catalogueTitle": None,
                "url": url,
                "image": None,
            }
        )
    return reminders


def reminder_id(url: str, lot_no: str | None, idx: int, house_id: str | None = None) -> str:
    m = re.search(r"auctionet\.com/en/(\d+)", url)
    if m:
        return f"r-{m.group(1)}"
    m = re.search(r"/lot/(\d+)/(\d+)", url)
    if m:
        return f"r-{m.group(2)}"
    if house_id and lot_no:
        slug = re.sub(r"[^a-z0-9]+", "-", str(lot_no).lower()).strip("-")
        return f"r-{house_id}-{slug}"
    if lot_no:
        slug = re.sub(r"[^a-z0-9]+", "-", str(lot_no).lower()).strip("-")
        return f"r-lot-{slug}"
    return f"r-{idx:02d}"


def parse_cover_countdown(page1: str, page2: str) -> list[dict]:
    text = page1 + "\n" + page2
    # cut after the omitted note / howto
    if "另有 23 件" in text:
        text = text.split("另有 23 件")[0]
    if "72 小时内开拍或截拍" in text:
        text = text.split("72 小时内开拍或截拍", 1)[1]
    # drop intro paragraph
    lines = clean_page_lines(text)
    # skip intro lines until first 开拍/截拍 N 小时
    start = 0
    while start < len(lines) and not re.match(r"^(开拍|截拍)\s+\d+\s*小时$", lines[start]):
        start += 1
    lines = lines[start:]
    items = []
    i = 0
    entry_re = re.compile(r"^(开拍|截拍)\s+(\d+)\s*小时$")
    beijing_re = re.compile(r"^北京\s*(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})$")
    while i < len(lines):
        em = entry_re.match(lines[i])
        if not em:
            i += 1
            continue
        timing = em.group(1)
        hours = int(em.group(2))
        i += 1
        bm = beijing_re.match(lines[i]) if i < len(lines) else None
        if not bm:
            raise ValueError(f"cover countdown missing beijing time after {lines[i-1]}")
        beijing_label = f"{int(bm.group(1))}月{int(bm.group(2))}日 {int(bm.group(3)):02d}:{bm.group(4)}"
        beijing_iso = to_iso(int(bm.group(1)), int(bm.group(2)), int(bm.group(3)), int(bm.group(4)))
        i += 1
        title_lines = []
        while i < len(lines) and not entry_re.match(lines[i]):
            title_lines.append(lines[i])
            i += 1
        blob = join_wrapped(title_lines)
        # Title · House · badge
        # House may wrap: "Bamfords Auctioneers"
        badge = None
        if blob.endswith("此前推过"):
            badge = "此前推过"
            blob = blob[: -len("此前推过")].rstrip(" ·")
        elif blob.endswith("昨日新"):
            badge = "昨日新"
            blob = blob[: -len("昨日新")].rstrip(" ·")
        # split last · as house? House names can contain no middot.
        # Pattern: TITLE · HOUSE
        # Title may itself contain no ·, house may be "Bidstrup Auktioner", "Bamfords Auctioneers",
        # "De Baecque et Associés", "Morphets of Harrogate", "Binoche et Giquello", "Giquello et Associés", "Daguerre", "Osenat"
        house = None
        title = blob
        for known in sorted(HOUSE_INFO.keys(), key=len, reverse=True):
            token = " · " + known
            if blob.endswith(known) or blob.endswith(token.strip()):
                # find last occurrence
                idx = blob.rfind(known)
                # allow optional " · " before house
                prefix = blob[:idx].rstrip(" ·")
                house = known
                title = prefix
                break
        if not house:
            raise ValueError(f"cover item unknown house: {blob!r}")
        items.append(
            {
                "timing": timing,
                "hoursAtGeneration": hours,
                "beijingTime": beijing_label,
                "beijingIso": beijing_iso,
                "title": title,
                "house": house,
                "houseId": HOUSE_INFO[house]["id"],
                "badge": badge,
                "lotId": None,
                "image": None,
            }
        )
    return items


def howto_paragraphs() -> list[str]:
    # Faithful reconstruction of the method text from the PDF, with wrapped lines joined.
    return [
        "每天读取各拍行公开的图录，先按规则去掉明显不相关的拍品，再由 AI 按标题和描述打关注分：假设拍品与拍行描述相符，按描述对应的大致价位归档，打 0–10 分（2–3 分约 €200–1,000，4–5 分约 €1,000–5,000，6–7 分约 €5,000–30,000，8 分以上更高）。关注分只用来排先后，不是估值。入选门槛是 2 分；外销瓷（广彩、纹章瓷、克拉克、外销伊万里等）不列入。",
        "每件拍品在第一次入选的当天和第二天各列一次，标“今日新”“昨日新”，隔天看日报也不会漏掉新品；之后不再列。更早推送过、现在还在拍的有 160 件，其中 72 小时内开拍或截拍的，在“提醒”一栏各列一行。",
        "关注分只按拍行的文字描述归档，不是鉴定，也不代表真伪：描述与实物不符时，分数也不成立。",
        "本日报不含真伪判断，关注分只是按文字描述归的价位档。请点每件下方的链接，到拍行网站看照片、完整描述和品相报告，再自行决定是否出价。",
        "欧洲拍行多为现场拍卖加线上同步，“开拍时间”是这一场的开始时间，具体拍品轮到的时间以拍行公告为准。",
        "灰字人民币金额是拍行估价按汇率换算的，不含买家佣金、平台费、运费、保险和进口税费，实际总成本会明显更高。",
        "买家佣金（常见 20%–30%，部分另加增值税）、运费和出口手续以拍行公告为准。",
    ]


def extract_images(doc: pymupdf.Document, out_dir: Path) -> dict:
    """Extract embedded JPEGs. Return mappings for lot pages, cover thumbs, reminder thumbs."""
    out_dir.mkdir(parents=True, exist_ok=True)

    def save_xref(xref: int, name: str) -> str:
        info = doc.extract_image(xref)
        data = info["image"]
        ext = (info.get("ext") or "jpeg").lower()
        if ext in ("jpeg", "jpg"):
            path = out_dir / f"{name}.jpg"
            path.write_bytes(data)
        else:
            # fallback convert
            pix = pymupdf.Pixmap(doc, xref)
            if pix.n >= 5:
                pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
            path = out_dir / f"{name}.jpg"
            pix.save(path)
        return f"images/2026-11-25/{path.name}"

    lot_images = {}  # page_no -> relpath
    for page_index in range(2, 103):  # pages 3-103
        page = doc[page_index]
        infos = page.get_image_info(xrefs=True)
        # pick the largest placement
        if not infos:
            raise ValueError(f"no image on page {page_index+1}")
        infos = sorted(infos, key=lambda im: (im["bbox"][2] - im["bbox"][0]) * (im["bbox"][3] - im["bbox"][1]), reverse=True)
        big = infos[0]
        # on page 103 the lot photo is large; ignore thumbs
        lot_images[page_index + 1] = (big["xref"], big["bbox"])

    cover_thumbs = []
    for page_index in (0, 1):
        page = doc[page_index]
        infos = page.get_image_info(xrefs=True)
        infos = sorted(infos, key=lambda im: (im["bbox"][1], im["bbox"][0]))
        for im in infos:
            cover_thumbs.append((im["xref"], im["bbox"], page_index + 1))

    reminder_thumbs = []
    for page_index in (102, 103, 104):
        page = doc[page_index]
        infos = page.get_image_info(xrefs=True)
        infos = sorted(infos, key=lambda im: (im["bbox"][1], im["bbox"][0]))
        for im in infos:
            w = im["bbox"][2] - im["bbox"][0]
            if w > 120:
                continue  # skip the last lot's large photo on page 103
            reminder_thumbs.append((im["xref"], im["bbox"], page_index + 1))

    return {
        "lot_images": lot_images,
        "cover_thumbs": cover_thumbs,
        "reminder_thumbs": reminder_thumbs,
        "save_xref": save_xref,
    }


def normalize_title(s: str) -> str:
    return re.sub(r"\s+", "", s).replace("（", "(").replace("）", ")")


def match_cover_to_lots(cover_items, new_lots, reminders):
    pool = list(new_lots) + list(reminders)
    used = set()
    for item in cover_items:
        nt = normalize_title(item["title"])
        hid = item["houseId"]
        candidates = [
            lot
            for lot in pool
            if lot["houseId"] == hid and lot["id"] not in used
            and (
                normalize_title(lot["title"]) == nt
                or normalize_title(lot["title"]) in nt
                or nt in normalize_title(lot["title"])
            )
        ]
        if len(candidates) != 1:
            # slightly looser: same house and title chars ratio
            if not candidates:
                raise ValueError(f"no match for cover item {item['title']} / {item['house']}")
            if len(candidates) > 1:
                raise ValueError(
                    f"ambiguous cover match for {item['title']}: {[c['id']+' '+c['title'] for c in candidates]}"
                )
        lot = candidates[0]
        used.add(lot["id"])
        item["lotId"] = lot["id"]
        # verify hours roughly
        if item["beijingIso"] != lot["beijingIso"]:
            raise ValueError(
                f"time mismatch cover {item['title']} {item['beijingIso']} vs lot {lot['beijingIso']}"
            )
        if item["timing"] != lot["timing"]:
            raise ValueError(f"timing kind mismatch for {item['title']}")


def build(pdf_path: Path, out_dir: Path) -> dict:
    doc = pymupdf.open(pdf_path)
    assert doc.page_count == 105, doc.page_count
    pages = [doc[i].get_text("text") for i in range(doc.page_count)]

    lots = []
    for page_no in range(3, 104):
        lots.append(parse_new_lot(page_no, pages[page_no - 1]))

    reminders = parse_reminders(pages[102:105])
    cover_items = parse_cover_countdown(pages[0], pages[1])

    img = extract_images(doc, out_dir / "images" / DATE)
    save_xref = img["save_xref"]

    for lot in lots:
        xref, _bbox = img["lot_images"][lot["page"]]
        lot["image"] = save_xref(xref, f"lot-{lot['id']}")

    if len(img["reminder_thumbs"]) != len(reminders):
        raise ValueError(
            f"reminder thumbs {len(img['reminder_thumbs'])} != reminders {len(reminders)}"
        )
    for rem, (xref, _bbox, _p) in zip(reminders, img["reminder_thumbs"]):
        rem["image"] = save_xref(xref, f"thumb-{rem['id']}")

    if len(img["cover_thumbs"]) != len(cover_items):
        raise ValueError(
            f"cover thumbs {len(img['cover_thumbs'])} != cover items {len(cover_items)}"
        )

    match_cover_to_lots(cover_items, lots, reminders)

    # Prefer the larger lot photo when the cover item is also a new lot.
    lot_by_id = {lot["id"]: lot for lot in lots}
    rem_by_id = {rem["id"]: rem for rem in reminders}
    for item, (xref, _bbox, _p) in zip(cover_items, img["cover_thumbs"]):
        linked = lot_by_id.get(item["lotId"]) or rem_by_id.get(item["lotId"])
        if linked and linked.get("image") and linked["source"] == "new":
            item["image"] = linked["image"]
        elif linked and linked.get("image"):
            item["image"] = linked["image"]
        else:
            item["image"] = save_xref(xref, f"cover-{item['lotId']}")

    # Houses in new lots (the "11 涉及拍行"), then any reminder-only houses.
    house_order = []
    houses = []
    seen = set()
    for src in lots + reminders:
        if src["houseId"] in seen:
            continue
        seen.add(src["houseId"])
        n_new = sum(1 for lot in lots if lot["houseId"] == src["houseId"])
        n_rem = sum(1 for rem in reminders if rem["houseId"] == src["houseId"])
        houses.append(
            {
                "id": src["houseId"],
                "name": src["house"],
                "url": src.get("houseUrl"),
                "country": src.get("country"),
                "city": src.get("city"),
                "newCount": n_new,
                "reminderCount": n_rem,
            }
        )

    urls = [lot["url"] for lot in lots] + [rem["url"] for rem in reminders]
    unique_urls = list(OrderedDict.fromkeys(urls))

    today_new = sum(1 for lot in lots if lot["badge"] == "今日新")
    digest = {
        "date": DATE,
        "timezone": "Asia/Shanghai",
        "title": "欧洲筛选日报",
        "kicker": "AI 智能体 · 欧洲拍行筛选",
        "subtitle": "欧洲 · 瓷器",
        "generatedAt": GENERATED.isoformat(),
        "generatedLabel": "2026-11-25 12:10",
        "fx": {
            "label": "中国外汇交易中心人民币汇率中间价（2026-11-24 9:15）",
            "note": "人民币金额是拍行估价按此汇率换算，不含佣金、运费和税费，仅供参考。",
        },
        "stats": {
            "newLots": 101,
            "todayNew": today_new,
            "yesterdayNew": sum(1 for lot in lots if lot["badge"] == "昨日新"),
            "housesInvolved": 11,
            "lotsOnSale": 35028,
            "housesMonitored": 109,
            "stillOpenEarlier": 160,
        },
        "intro": "手机上看欧洲拍行筛选出的中国瓷器。点进拍品看图片、关注分和估价，再打开拍行原页核对。",
        "countdownNote": "含此前推送过、还在拍的。小时数按日报生成时间（2026-11-25 12:10）算，以北京时间为准；现场拍卖倒数的是整场开始时间，具体拍品轮到会更晚。",
        "countdownOmitted": "另有 23 件 72 小时内开拍或截拍，关注分较低，没有列出。",
        "reminderTitle": "提醒：此前推送过、72 小时内开拍或截拍",
        "reminderNote": "只列快到时间的，每件一行，按时间先后；另有 15 件关注分较低，没有列出。",
        "newLotsNote": "“今日新”是今天第一次入选，排在前面；“昨日新”昨天已列过一次，排在后面；两组各自按关注分从高到低排列，同分的先开拍的在前。",
        "howto": howto_paragraphs(),
        "caveats": [
            "声明：本日报只根据拍行公开的图录文字做筛选提示，不鉴定真伪，不评估价值，不构成购买或投资建议；拍品信息、估价和拍卖时间以拍行网站为准。",
            "防骗提示：本日报不鉴定、不估价、不代拍、不送拍、不买卖藏品。除订阅费外，不以任何名义收取鉴定费、保证金、手续费或税费；凡以本日报名义另行收费的，请勿相信。",
        ],
        "houses": houses,
        "lots": lots,
        "reminders": reminders,
        "countdown": cover_items,
        "urlCount": len(unique_urls),
    }

    # Validations
    assert len(lots) == 101, len(lots)
    assert digest["stats"]["todayNew"] == 18, digest["stats"]["todayNew"]
    assert digest["stats"]["yesterdayNew"] == 83
    assert len({lot["id"] for lot in lots}) == 101
    assert len(reminders) == 10, len(reminders)
    assert len(cover_items) == 12, len(cover_items)
    assert len(unique_urls) == 111, len(unique_urls)
    new_house_ids = {lot["houseId"] for lot in lots}
    assert len(new_house_ids) == 11, new_house_ids
    for lot in lots + reminders:
        assert lot["url"].startswith("https://")
        assert " " not in lot["url"]
        assert lot["image"]
        assert (out_dir / lot["image"]).exists()
    # score range
    assert all(2 <= lot["score"] <= 10 for lot in lots)
    return digest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--pdf",
        default="/home/box/agent-data/agents/a89a615b-b037-4fcd-b79e-245d3c5a196e/attachments/7e5cfe75aa83bf26d8ad5d0da07e765cfb53b0b55f5b9e4231436b403808cd1c.pdf",
    )
    parser.add_argument("--out", default="/workspace/antique-check/porcelain/europe")
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    digest = build(Path(args.pdf), out)
    data_dir = out / "data"
    data_dir.mkdir(exist_ok=True)
    day_path = data_dir / f"{DATE}.json"
    day_path.write_text(json.dumps(digest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    index = {
        "latest": DATE,
        "days": [{"date": DATE, "file": f"{DATE}.json", "label": "2026年11月25日"}],
    }
    (data_dir / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Wrote", day_path)
    print("lots", len(digest["lots"]), "reminders", len(digest["reminders"]), "countdown", len(digest["countdown"]))
    print("todayNew", digest["stats"]["todayNew"], "urls", digest["urlCount"])
    print("houses:")
    for h in digest["houses"]:
        print(f"  {h['name']}: new={h['newCount']} reminder={h['reminderCount']}")
    # list any lots missing sale or lotNo
    missing = [lot for lot in digest["lots"] if not lot.get("lotNo")]
    print("lots without 拍品号:", len(missing), [f"{l['id']} {l['house']}" for l in missing])
    no_price = [r for r in digest["reminders"] if not r.get("price")]
    print("reminders without price:", [r["title"] for r in no_price])


if __name__ == "__main__":
    main()
