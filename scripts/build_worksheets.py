"""Print the shared student HTML to A4 and render the downloadable PDF previews."""
import base64
import json
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image
from playwright.sync_api import sync_playwright
from pypdfium2 import PdfDocument

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def main():
    output = ASSETS / "worksheets"
    with TemporaryDirectory(dir=ASSETS) as folder, sync_playwright() as runtime:
        staging = Path(folder)
        browser = runtime.chromium.launch(channel="chrome")
        page = browser.new_page()
        page.goto((ROOT / "worksheet.html").as_uri())
        film_ids = page.evaluate("films.map(film => film.id)")
        bundle = {}
        for film_id in film_ids:
            # Embed the printed still at 2x resolution and keep all type selectable.
            with Image.open(ASSETS / f"{film_id}.webp") as image, BytesIO() as buffer:
                image.thumbnail((360, 240), Image.Resampling.LANCZOS)
                image.convert("RGB").save(buffer, "JPEG", quality=86)
                still = "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
            page.evaluate("""async ([id, still]) => {
                const film = films.find(item => item.id === id);
                document.title = film.title + ' 감상 활동지';
                document.querySelector('#sheet').innerHTML = studentSheet(film);
                const image = document.querySelector('.ws-still img');
                image.src = still;
                await image.decode();
                await document.fonts.ready;
            }""", [film_id, still])
            pdf = page.pdf(prefer_css_page_size=True, print_background=True, display_header_footer=False)
            with PdfDocument(pdf) as document:
                if len(document) != 1:
                    raise ValueError(f"{film_id} produced {len(document)} pages")
                document[0].render(scale=1.5).to_pil().save(staging / f"{film_id}-worksheet-preview.webp", quality=90)
            (staging / f"{film_id}.pdf").write_bytes(pdf)
            bundle[film_id] = base64.b64encode(pdf).decode("ascii")
        browser.close()
        (staging / "pdfs.js").write_text(
            "globalThis.classroomWorksheetPdfs = " + json.dumps(bundle, indent=2) + ";\n", encoding="utf-8"
        )
        for path in staging.iterdir():
            path.replace((ASSETS if path.suffix == ".webp" else output) / path.name)
    print(f"Printed {len(bundle)} individual HTML worksheets to A4 PDFs and previews.")


if __name__ == "__main__":
    main()
