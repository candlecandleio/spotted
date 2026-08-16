#!/usr/bin/env python3
"""Generate the app icons. Re-run after changing the mark.

    python3 tools/make-icons.py
"""

from PIL import Image, ImageDraw
from pathlib import Path

BG     = (10, 15, 15)
TEAL   = (15, 95, 90)
ACCENT = (127, 227, 216)
WHITE  = (242, 247, 246)

OUT = Path(__file__).resolve().parent.parent / "icons"


def draw_mark(size, inset=0.0, bg=BG):
    """A pair of eyes — the spotting, watching idea — on a dark ground."""
    s = size
    img = Image.new("RGBA", (s, s), bg + (255,))
    d = ImageDraw.Draw(img)

    # Breathing room for maskable icons, whose corners get cropped.
    pad = s * inset
    inner = s - pad * 2

    # teal rounded panel
    d.rounded_rectangle(
        [pad, pad, s - pad, s - pad],
        radius=inner * 0.24,
        fill=TEAL,
    )

    # two eyes
    eye_w = inner * 0.30
    eye_h = inner * 0.30
    gap   = inner * 0.06
    cy    = pad + inner * 0.50
    for cx in (
        pad + inner * 0.5 - eye_w / 2 - gap / 2,
        pad + inner * 0.5 + eye_w / 2 + gap / 2,
    ):
        d.ellipse(
            [cx - eye_w / 2, cy - eye_h / 2, cx + eye_w / 2, cy + eye_h / 2],
            fill=WHITE,
        )
        # pupil, looking slightly right as if catching someone in the corner of frame
        pr = eye_w * 0.30
        px = cx + eye_w * 0.13
        d.ellipse([px - pr, cy - pr, px + pr, cy + pr], fill=BG)
        # catchlight
        gr = pr * 0.34
        d.ellipse(
            [px - pr * 0.45 - gr, cy - pr * 0.45 - gr,
             px - pr * 0.45 + gr, cy - pr * 0.45 + gr],
            fill=ACCENT,
        )

    return img


def main():
    OUT.mkdir(exist_ok=True)
    jobs = [
        ("icon-192.png",          192, 0.0),
        ("icon-512.png",          512, 0.0),
        ("icon-maskable-512.png", 512, 0.14),   # safe zone for Android masks
        ("apple-touch-icon.png",  180, 0.0),
    ]
    for name, size, inset in jobs:
        # Render at 4x and downsample — cheap way to get clean curves.
        img = draw_mark(size * 4, inset).resize((size, size), Image.LANCZOS)
        img.convert("RGB").save(OUT / name, "PNG", optimize=True)
        print(f"  {name:<24} {size}x{size}")

    # Favicon, small enough that the eyes still read at 32px.
    ico = draw_mark(256).resize((64, 64), Image.LANCZOS)
    ico.convert("RGB").save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("  favicon.ico")


if __name__ == "__main__":
    main()
