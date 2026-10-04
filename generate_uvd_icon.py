from PIL import Image, ImageDraw, ImageFont
import math
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

def create_uvd_logo(size=512):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded squircle background with gradient
    padding = int(size * 0.04)
    radius = int(size * 0.24)
    
    # Create smooth gradient mask
    for y in range(padding, size - padding):
        t = (y - padding) / (size - 2 * padding)
        # Linear interpolation from indigo (#4f46e5) to pink (#db2777)
        r = int(79 * (1 - t) + 219 * t)
        g = int(70 * (1 - t) + 39 * t)
        b = int(229 * (1 - t) + 119 * t)
        draw.rounded_rectangle(
            [padding, padding, size - padding, size - padding],
            radius=radius,
            fill=(r, g, b, 255)
        )

    # Subtle inner border for 3D glass look
    draw.rounded_rectangle(
        [padding, padding, size - padding, size - padding],
        radius=radius,
        outline=(255, 255, 255, 60),
        width=int(size * 0.015)
    )

    # Draw bold, sleek "UVD" text
    try:
        # Try finding clean standard Windows fonts
        font_paths = [
            "C:/Windows/Fonts/segoeuib.ttf", # Segoe UI Bold
            "C:/Windows/Fonts/arialbd.ttf",  # Arial Bold
            "C:/Windows/Fonts/calibrib.ttf"  # Calibri Bold
        ]
        font = None
        for p in font_paths:
            if os.path.exists(p):
                font = ImageFont.truetype(p, int(size * 0.36))
                break
        if not font:
            font = ImageFont.load_default()
    except Exception:
        font = ImageFont.load_default()

    # Center UVD Text
    text = "UVD"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    
    text_x = (size - text_w) / 2
    text_y = (size - text_h) / 2 - int(size * 0.07)

    # Draw Text Shadow
    draw.text((text_x + 3, text_y + 4), text, font=font, fill=(0, 0, 0, 100))
    # Draw Text
    draw.text((text_x, text_y), text, font=font, fill=(255, 255, 255, 255))

    # Draw modern downward arrow badge below UVD
    arrow_center_x = size / 2
    arrow_top_y = text_y + text_h + int(size * 0.08)
    arrow_h = int(size * 0.12)
    arrow_w = int(size * 0.18)
    stem_w = int(size * 0.05)

    # Arrow stem
    draw.rectangle(
        [arrow_center_x - stem_w / 2, arrow_top_y, arrow_center_x + stem_w / 2, arrow_top_y + arrow_h * 0.6],
        fill=(255, 255, 255, 240)
    )
    # Arrow head (triangle)
    draw.polygon([
        (arrow_center_x - arrow_w / 2, arrow_top_y + arrow_h * 0.5),
        (arrow_center_x + arrow_w / 2, arrow_top_y + arrow_h * 0.5),
        (arrow_center_x, arrow_top_y + arrow_h + int(size * 0.03))
    ], fill=(255, 255, 255, 255))

    # Base tray line
    tray_y = arrow_top_y + arrow_h + int(size * 0.08)
    tray_w = int(size * 0.28)
    draw.rounded_rectangle(
        [arrow_center_x - tray_w / 2, tray_y, arrow_center_x + tray_w / 2, tray_y + int(size * 0.035)],
        radius=int(size * 0.015),
        fill=(255, 255, 255, 230)
    )

    return img

def main():
    logo_512 = create_uvd_logo(512)
    
    # Save High-Res PNG
    png_path = STATIC_DIR / "icon.png"
    logo_512.save(png_path, "PNG")
    print("Created:", png_path)

    # Save Windows Multi-Resolution ICO
    ico_path = BASE_DIR / "icon.ico"
    fav_path = STATIC_DIR / "favicon.ico"
    
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    icon_images = [create_uvd_logo(s[0]) for s in sizes]
    
    icon_images[0].save(
        ico_path,
        format="ICO",
        sizes=sizes,
        append_images=icon_images[1:]
    )
    icon_images[0].save(
        fav_path,
        format="ICO",
        sizes=sizes,
        append_images=icon_images[1:]
    )
    print("Created:", ico_path)
    print("Created:", fav_path)

if __name__ == "__main__":
    main()
