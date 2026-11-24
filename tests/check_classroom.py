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
    assert len(films) == len(ids) == 60
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
            for label in (film["title"], activities[key]["output"], *film["codes"]):
                assert "".join(label.split()) in text, (key, label)


def check_classroom():
    with sync_playwright() as runtime:
        browser = runtime.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto((ROOT / "index.html").as_uri())
        cards = page.locator("#catalog .cover-button")
        expect(cards).to_have_count(60)
        films, activities = page.evaluate("[films, worksheetActivities]")
        check_materials(films, activities)
        page.locator('[data-grade="4"]').click()
        expected = {film["id"] for film in films if "4" in film["grades"]}
        assert set(cards.evaluate_all("nodes => nodes.map(n => n.dataset.detail)")) == expected
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
    print("Verified 60 worksheets, the grade filter, detail view, 200% layout and PDF download.")
