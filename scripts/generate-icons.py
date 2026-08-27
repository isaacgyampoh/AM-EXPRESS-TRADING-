#!/usr/bin/env python3
"""
Generates the PWA icon set.

Kept as a script rather than a one-off so the icons can be regenerated when the
brand colour or the mark changes, and so nobody has to guess which sizes and
which padding produced the files in public/icons.

Two variants matter:

  icon-*.png           rounded square, used by browsers and desktops as-is
  icon-maskable-*.png  full bleed, artwork inside the middle 80% — Android
                       crops maskable icons to the launcher's own shape, and
                       artwork drawn to the edge loses its corners

Run:  python3 scripts/generate-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BRAND = (4, 120, 87)          # brand-700
BRAND_LIGHT = (167, 243, 208)  # brand-200
WHITE = (255, 255, 255)

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "public" / "icons"

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def centred(draw: ImageDraw.ImageDraw, text: str, font, y: int, width: int, fill):
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    draw.text(
        ((width - (right - left)) / 2 - left, y - (bottom - top) / 2 - top),
        text,
        font=font,
        fill=fill,
    )


def render(size: int, maskable: bool) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    if maskable:
        # Full bleed: the launcher supplies the shape.
        draw.rectangle([0, 0, size, size], fill=BRAND)
        scale = 0.78  # keep the mark inside the safe zone
    else:
        radius = int(size * 0.22)
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BRAND)
        scale = 1.0

    centred(draw, "AM", load_font(int(size * 0.34 * scale)), int(size * 0.45), size, WHITE)
    centred(
        draw,
        "EXPRESS",
        load_font(int(size * 0.10 * scale)),
        int(size * 0.68),
        size,
        BRAND_LIGHT,
    )
    return image


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)

    for size in (192, 512):
        render(size, maskable=False).save(ICONS / f"icon-{size}.png")
        render(size, maskable=True).save(ICONS / f"icon-maskable-{size}.png")

    render(180, maskable=False).save(ROOT / "public" / "apple-icon.png")
    render(32, maskable=False).save(ROOT / "public" / "icon.png")

    print(f"Icons written to {ICONS}")


if __name__ == "__main__":
    main()
