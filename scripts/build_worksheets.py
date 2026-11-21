"""Build the A4 worksheets, previews and offline download bundle from catalog.js."""

import argparse
import base64
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from xml.sax.saxutils import escape

from pypdfium2 import PdfDocument
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
INK = colors.HexColor("#242936")
MUTED = colors.HexColor("#4b5563")
RULE = colors.HexColor("#a0a8b3")
ACTIVITY_STYLES = {
    "compare": ("비교하기", "#DCD4FA"),
    "storyboard": ("장면 만들기", "#FFCFAC"),
    "map": ("연결지도", "#F5CCD9"),
    "choice": ("선택 토론", "#C0ECD6"),
    "design": ("설계하기", "#C5E6F6"),
    "evidence": ("근거로 판단하기", "#F6D992"),
}


def read_catalog(name):
    text = (ROOT / "catalog.js").read_text(encoding="utf-8")
    value = text.split(f"const {name} = ", 1)[1]
    return json.JSONDecoder().raw_decode(value)[0]


def print_paragraph(page, text, x, top, width, size=12, font="Classroom", ink=INK):
    style = ParagraphStyle("worksheet", fontName=font, fontSize=size,
                           leading=size * 1.4, textColor=ink)
    paragraph = Paragraph(escape(text), style)
    _, height = paragraph.wrap(width, A4[1])
    paragraph.drawOn(page, x, top - height)
    return top - height


def response_space(page, left, top, width, height, draw):
    page.setStrokeColor(RULE)
    page.setLineWidth(.6)
    if draw:
        page.roundRect(left, top - height, width, height, 5, stroke=1, fill=0)
    else:
        for offset in range(20, height + 1, 20):
            page.line(left, top - offset, left + width, top - offset)


def paper_card(page, x, y, width, height, fill):
    page.setFillColor(INK)
    page.roundRect(x + 2, y - 2, width, height, 5, stroke=0, fill=1)
    page.setStrokeColor(INK)
    page.setFillColor(fill)
    page.setLineWidth(1.3)
    page.roundRect(x, y, width, height, 5, stroke=1, fill=1)


def activity_boxes(page, activity, left, top, width, height, pale):
    gap = 12
    half = (width - gap) / 2
    third = (width - 2 * gap) / 3
    mid = (height - gap) / 2
    row = (height - 2 * gap) / 3
    fmt = activity["format"]
    if fmt == "compare":
        positions = [(0, 0, half, mid), (half + gap, 0, half, mid), (0, mid + gap, width, mid)]
    elif fmt == "storyboard":
        positions = [(index * (third + gap), 0, third, height) for index in range(3)]
    elif fmt == "map":
        middle = width / 2
        positions = [(middle - half / 2, 0, half, mid), (0, mid + gap, half, mid),
                     (half + gap, mid + gap, half, mid)]
        page.setStrokeColor(INK)
        page.line(left + middle, top - mid, left + middle, top - mid - gap / 2)
        page.line(left + half / 2, top - mid - gap / 2, left + width - half / 2, top - mid - gap / 2)
        for center in (half / 2, width - half / 2):
            page.line(left + center, top - mid - gap / 2, left + center, top - mid - gap)
    elif fmt == "evidence":
        positions = [(0, 0, half, height), (half + gap, 0, half, mid), (half + gap, mid + gap, half, mid)]
    else:
        positions = [(0, index * (row + gap), width, row) for index in range(3)]

    for index, ((x, offset, box_width, box_height), label) in enumerate(zip(positions, activity["labels"]), 1):
        x += left
        y = top - offset
        paper_card(page, x, y - box_height, box_width, box_height, colors.white)
        page.setFillColor(pale)
        page.roundRect(x + 3, y - 23, box_width - 6, 20, 4, fill=1, stroke=0)
        inset = 10
        if fmt in ("storyboard", "design"):
            label = f"{index}. {label}"
        elif fmt == "choice" and index < 3:
            page.setStrokeColor(INK)
            page.circle(x + 12, y - 13, 3.3, stroke=1, fill=0)
            inset = 21
        label_width = box_width - inset - 7
        label_size = min(10.6, 10.6 * label_width / pdfmetrics.stringWidth(label, "ClassroomBold", 10.6))
        print_paragraph(page, label, x + inset, y - 6, label_width, label_size, "ClassroomBold")


def write_worksheet(film, curriculum, activity, output):
    path = output / f"{film['id']}.pdf"
    page = canvas.Canvas(str(path), pagesize=A4, pageCompression=1, invariant=True)
    page.setTitle(f"{film['title']} 감상 활동지")
    page.setAuthor("교실극장")
    page_width, page_height = A4
    left = 16 * mm
    width = page_width - 2 * left
    top = page_height - 14 * mm
    subjects = " · ".join(dict.fromkeys(curriculum[code]["subject"] for code in film["codes"]))
    kind, pale_hex = ACTIVITY_STYLES[activity["format"]]
    pale = colors.HexColor(pale_hex)
    younger = any(grade in ("1", "2") for grade in film["grades"])

    paper_card(page, left, top - 65, width, 65, pale)
    inset = 12
    top = print_paragraph(page, f"교실극장  |  학생용 감상 활동지  |  {film['gradeLabel']} · {subjects}",
                          left + inset, top - 9, width - 2 * inset, 10.2, "ClassroomBold") - 5
    title = film["title"]
    title_width = pdfmetrics.stringWidth(title, "ClassroomBold", 23)
    title_size = min(23, 23 * (width - 2 * inset) / title_width)
    top = print_paragraph(page, title, left + inset, top, width - 2 * inset, title_size, "ClassroomBold") - 13
    top = print_paragraph(page, "날짜 __________________    반 _________    이름 __________________",
                          left, top, width, 10.5, ink=MUTED) - 12
    paper_card(page, left, top - 46, width, 46, colors.HexColor("#FFF4CC"))
    print_paragraph(page, f"핵심 가치  {activity['value']}  ·  {kind}",
                    left + 12, top - 6, width - 24, 10.4, "ClassroomBold")
    print_paragraph(page, activity["output"], left + 12, top - 21, width - 24, 14.2, "ClassroomBold")
    top = print_paragraph(page, f"배움 목표  {film['goal']}", left, top - 55, width, 10.7, ink=MUTED) - 16

    for label, key, area_height in (
        ("1. 감상 전  ·  먼저 생각하기", "opening", 44 if younger else 40),
        ("2. 감상 중  ·  장면에서 단서 찾기", "observe", 66 if younger else 60),
    ):
        top = print_paragraph(page, label, left, top, width, 12.4, "ClassroomBold") - 3
        top = print_paragraph(page, activity[key], left, top, width, 11.8 if younger else 11.4) - 6
        response_space(page, left, top, width, area_height, younger)
        top -= area_height + 13

    top = print_paragraph(page, f"3. 감상 후  ·  {activity['output']}", left, top, width,
                          12.4, "ClassroomBold") - 3
    top = print_paragraph(page, activity["create"], left, top, width, 11.8 if younger else 11.4) - 8
    check_top = 36 * mm
    box_height = top - check_top - 12
    assert box_height >= 150, f"Activity area is too small for {film['title']}: {box_height:.1f} pt"
    activity_boxes(page, activity, left, top, width, box_height, pale)

    page.setStrokeColor(INK)
    page.roundRect(left, check_top - 12, 8, 8, 1, fill=0, stroke=1)
    check_bottom = print_paragraph(page, f"스스로 확인  {activity['check']}",
                                   left + 15, check_top, width - 15, 10.4, "ClassroomBold")
    assert check_bottom > 19 * mm, f"Self-check overlaps footer for {film['title']}"
    page.setStrokeColor(RULE)
    page.line(left, 18 * mm, left + width, 18 * mm)
    footer = "성취기준 " + " · ".join(film["codes"]) + "    |    2022 개정 교육과정"
    print_paragraph(page, footer, left, 15.7 * mm, width, 8.8, ink=MUTED)
    page.showPage()
    page.save()
    return path


def write_preview(pdf_path, preview_path):
    with PdfDocument(pdf_path) as document:
        bitmap = document[0].render(scale=1.5)
        bitmap.to_pil().save(preview_path, lossless=True)


def main():
    fonts = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--font", type=Path, default=fonts / "malgun.ttf")
    parser.add_argument("--bold-font", type=Path, default=fonts / "malgunbd.ttf")
    args = parser.parse_args()
    pdfmetrics.registerFont(TTFont("Classroom", str(args.font)))
    pdfmetrics.registerFont(TTFont("ClassroomBold", str(args.bold_font)))
    films = read_catalog("films")
    curriculum = read_catalog("standards")
    activities = read_catalog("worksheetActivities")
    if {film["id"] for film in films} != activities.keys():
        raise ValueError("Each film must have exactly one worksheet activity.")
    output = ROOT / "assets" / "worksheets"
    output.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output.parent) as folder:
        staging = Path(folder)
        local_downloads = {}
        for film in films:
            film_id = film["id"]
            path = write_worksheet(film, curriculum, activities[film_id], staging)
            write_preview(path, staging / f"{film_id}-worksheet-preview.webp")
            local_downloads[film_id] = base64.b64encode(path.read_bytes()).decode("ascii")
        # Browsers may open file:// PDFs inline even with a download attribute.
        bundle = "globalThis.classroomWorksheetPdfs = " + json.dumps(local_downloads, indent=2) + ";\n"
        (staging / "pdfs.js").write_text(bundle, encoding="utf-8")
        for path in staging.iterdir():
            destination = output.parent if path.suffix == ".webp" else output
            path.replace(destination / path.name)
    print(f"Generated {len(films)} A4 worksheets and matching previews.")


if __name__ == "__main__":
    main()
