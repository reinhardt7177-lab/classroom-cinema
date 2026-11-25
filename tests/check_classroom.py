"""Run from any directory with Chrome and the packages in requirements.txt."""
from base64 import b64decode
from pathlib import Path
from json import loads

from PIL import Image
from playwright.sync_api import expect, sync_playwright
from pypdfium2 import PdfDocument

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def check_materials(films, activities):
    source = (ASSETS / "worksheets/pdfs.js").read_text(encoding="utf-8")
    bundle = loads(source.removeprefix("globalThis.classroomWorksheetPdfs = ").strip().removesuffix(";"))
    ids = {film["id"] for film in films}
    assert len(films) == len(ids) == 143
    assert ids == set(activities) == set(bundle)
    for film in films:
        key = film["id"]
        assert set(film["grades"]).intersection("123456"), key
        for name in (f"{key}.webp", f"{key}-worksheet-preview.webp"):
            with Image.open(ASSETS / name) as image:
                assert image.format == "WEBP", name
                image.load()
        pdf = (ASSETS / "worksheets" / f"{key}.pdf").read_bytes()
        assert pdf == b64decode(bundle[key], validate=True), key
        with PdfDocument(pdf) as document:
            assert len(document) == 1, key
            page = document[0]
            assert tuple(round(value) for value in page.get_size()) == (595, 842), key
            text = "".join(page.get_textpage().get_text_range().split())
            activity = activities[key]
            for label in (film["title"], activity["output"], *activity["labels"], activity["check"], *film["codes"]):
                assert "".join(label.split()) in text, (key, label)


def check_classroom():
    with sync_playwright() as runtime:
        browser = runtime.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto((ROOT / "index.html").as_uri())
        cards = page.locator("#catalog .cover-button")
        expect(cards).to_have_count(143)
        films, activities = page.evaluate("[films, worksheetActivities]")
        check_materials(films, activities)
        sheet = browser.new_page()
        examples = {activity["format"]: key for key, activity in activities.items()}
        for key in examples.values():
            sheet.goto((ROOT / "worksheet.html").as_uri() + "?film=" + key)
            expect(sheet.locator(".ws-slot b")).to_have_count(len(activities[key]["labels"]))
            expect(sheet.locator(".ws-project h2")).to_have_text(activities[key]["output"])
        sheet.set_viewport_size({"width": 390, "height": 844})
        sheet.evaluate("document.documentElement.style.zoom = '2'")
        assert sheet.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        sheet.goto((ROOT / "index.html").as_uri() + "#worksheet/our-world")
        sheet.locator('textarea[name="after"]').fill("두 친구에게 건네고 싶은 말을 적어요.")
        expect(sheet.locator("#paper .ws-project > p")).to_have_text("두 친구에게 건네고 싶은 말을 적어요.")
        sheet.close()
        for grade, count in enumerate([12, 29, 54, 62, 41, 26], start=1):
            page.locator(f'[data-grade="{grade}"]').click()
            expected = {film["id"] for film in films if str(grade) in film["grades"]}
            assert set(cards.evaluate_all("nodes => nodes.map(n => n.dataset.detail)")) == expected
            assert sum(key.startswith("cinema-") for key in expected) == count
        page.locator('[data-grade=""]').click()
        for group in sorted({film["group"] for film in films}):
            page.select_option("#group-filter", str(group))
            expected = {film["id"] for film in films if film["group"] == group}
            assert set(cards.evaluate_all("nodes => nodes.map(n => n.dataset.detail)")) == expected
        page.select_option("#group-filter", "")
        page.locator('[data-grade="5"]').click()
        page.locator('#catalog .cover-button[data-detail="cinema-001"]').click()
        detail = page.locator("#film-detail")
        expect(detail.locator("#detail-title")).to_have_text("소나기")
        expect(detail.locator("#detail-worksheet-heading")).to_have_text(activities["cinema-001"]["output"])
        assert detail.locator(".worksheet-page img").evaluate("im => im.decode().then(() => im.naturalWidth > 0)")
        with page.expect_download() as download:
            detail.locator(".pdf-link").click()
        assert download.value.path().read_bytes() == (ASSETS / "worksheets/cinema-001.pdf").read_bytes()
        page.keyboard.press("Escape")
        page.locator('[data-grade="4"]').click()
        page.locator('#catalog .cover-button[data-detail="our-world"]').click()
        detail = page.locator("#film-detail")
        expect(detail.locator("#detail-title")).to_have_text("우리들")
        page.evaluate("document.documentElement.style.zoom = '2'")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        assert detail.evaluate("d => d.scrollWidth <= d.clientWidth + 1")
        assert detail.locator(".worksheet-page img").evaluate("im => im.decode().then(() => im.naturalWidth > 0)")
        with page.expect_download() as download:
            detail.locator(".pdf-link").click()
        assert download.value.path().read_bytes() == (ASSETS / "worksheets/our-world.pdf").read_bytes()
        assert not errors, errors
        browser.close()


if __name__ == "__main__":
    check_classroom()
    print("Verified 143 worksheets, six grade filters, topic filters, detail view, 200% layout and PDF download.")
