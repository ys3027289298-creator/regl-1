#!/usr/bin/env python3
"""Renders one translucent title-bar PNG per recording segment."""

import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "titles")
os.makedirs(OUT, exist_ok=True)

WIDTH, HEIGHT = 480, 360
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

TITLES = [
    ("linear", "1. Linear interpolation (baseline)"),
    ("catmull-clamp", "2. Catmull-Rom - clamp endpoints"),
    ("catmull-mirror", "3. Catmull-Rom - mirror endpoints"),
    ("b-spline-mirror", "4. Uniform cubic B-spline - mirror"),
    ("b-spline-repeat", "5. Uniform cubic B-spline - repeat"),
]

font = ImageFont.truetype(FONT_PATH, 20)

for name, text in TITLES:
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    pad = 10
    box = (16, 16, 16 + text_w + pad * 2, 16 + text_h + pad * 2)
    draw.rectangle(box, fill=(0, 0, 0, 165))
    draw.text((box[0] + pad, box[1] + pad - 2), text,
              fill=(255, 255, 255, 255), font=font)
    img.save(os.path.join(OUT, name + ".png"))
    print("wrote", name + ".png")
