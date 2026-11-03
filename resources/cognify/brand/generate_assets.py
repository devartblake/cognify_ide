#!/usr/bin/env python3
# ---------------------------------------------------------------------------------------------
#  Copyright (c) Cognify IDE contributors. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------
"""Regenerate Cognify product icons from the brand masters in this folder.

Usage (from the repository root, requires Pillow >= 10):

    python3 resources/cognify/brand/generate_assets.py

Inputs:   resources/cognify/brand/cognify-icon-master.png      (square-ish RGBA, transparent background)
          resources/cognify/brand/cognify-wordmark-master.png  (RGBA, dark "Cognify" text)
          resources/cognify/brand/cognify-icon-small.png       (optional: simplified icon for <= 32 px)
Outputs:  the icon files listed in DevDocs/Governance/PRODUCT_IDENTITY_AND_BRANDING.md, written at
          their existing paths and sizes so no build changes are needed, plus the light wordmark
          variant for dark backgrounds.
"""

from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
BRAND = ROOT / 'resources' / 'cognify' / 'brand'

# Inno Setup wizard bitmaps: scale -> (big width, big height), (small width, small height).
INNO_SIZES = {
	100: ((164, 314), (55, 55)),
	125: ((192, 386), (64, 68)),
	150: ((246, 459), (83, 80)),
	175: ((273, 556), (92, 97)),
	200: ((328, 604), (110, 106)),
	225: ((355, 700), (119, 123)),
	250: ((410, 797), (138, 140)),
}
SMALL_ICON_MAX = 32  # sizes at or below this use the simplified icon when provided


def load_square_icon(path: Path) -> Image.Image:
	"""Trim transparent margins and center the artwork on a square transparent canvas."""
	image = Image.open(path).convert('RGBA')
	bbox = image.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
	image = image.crop(bbox)
	side = max(image.size)
	canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
	canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2), image)
	return canvas


def render(icon: Image.Image, small_icon: Image.Image | None, size: int) -> Image.Image:
	source = small_icon if (small_icon is not None and size <= SMALL_ICON_MAX) else icon
	result = source.resize((size, size), Image.Resampling.LANCZOS)
	if size <= SMALL_ICON_MAX:
		# Recover edge contrast lost when downscaling soft gradients.
		result = result.filter(ImageFilter.UnsharpMask(radius=0.6, percent=120, threshold=1))
	return result


def write_ico(icon: Image.Image, small_icon: Image.Image | None, path: Path, sizes: list[int]) -> None:
	frames = [render(icon, small_icon, s) for s in sorted(sizes, reverse=True)]
	frames[0].save(path, format='ICO', sizes=[(f.width, f.height) for f in frames], append_images=frames[1:])


def write_bitmap(icon: Image.Image, path: Path, size: tuple[int, int], fill: float, with_alpha: bool) -> None:
	"""Center the icon on a white canvas (Inno Setup wizard style)."""
	width, height = size
	side = int(min(width, height) * fill)
	canvas = Image.new('RGBA', size, (255, 255, 255, 255))
	logo = icon.resize((side, side), Image.Resampling.LANCZOS)
	canvas.alpha_composite(logo, ((width - side) // 2, (height - side) // 2))
	(canvas if with_alpha else canvas.convert('RGB')).save(path, format='BMP')


def light_wordmark(path: Path) -> Image.Image:
	"""Recolor the dark navy wordmark text to white, leaving the icon and the gradient "IDE" untouched."""
	image = Image.open(path).convert('RGBA')
	pixels = image.load()
	text_start = int(image.width * 0.26)  # the text begins right of the icon
	for y in range(image.height):
		for x in range(text_start, image.width):
			r, g, b, a = pixels[x, y]
			if a and max(r, g, b) < 90 and b - r < 70:  # dark, low-chroma navy text pixels
				pixels[x, y] = (255, 255, 255, a)
	return image


def main() -> None:
	icon = load_square_icon(BRAND / 'cognify-icon-master.png')
	small_path = BRAND / 'cognify-icon-small.png'
	small_icon = load_square_icon(small_path) if small_path.exists() else None

	win32 = ROOT / 'resources' / 'win32'
	write_ico(icon, small_icon, win32 / 'code.ico', [16, 24, 32, 48, 64, 128, 256])
	render(icon, small_icon, 150).save(win32 / 'code_150x150.png')
	render(icon, small_icon, 70).save(win32 / 'code_70x70.png')
	for scale, (big, small) in INNO_SIZES.items():
		write_bitmap(icon, win32 / f'inno-big-{scale}.bmp', big, fill=0.75, with_alpha=(scale == 250))
		write_bitmap(icon, win32 / f'inno-small-{scale}.bmp', small, fill=0.80, with_alpha=False)

	render(icon, small_icon, 1024).save(ROOT / 'resources' / 'darwin' / 'code.icns', format='ICNS')
	render(icon, small_icon, 1024).save(ROOT / 'resources' / 'linux' / 'code.png')

	server = ROOT / 'resources' / 'server'
	render(icon, small_icon, 192).save(server / 'code-192.png')
	render(icon, small_icon, 512).save(server / 'code-512.png')
	write_ico(icon, small_icon, server / 'favicon.ico', [16, 24, 32, 48, 64])

	light_wordmark(BRAND / 'cognify-wordmark-master.png').save(BRAND / 'cognify-wordmark-light.png')


if __name__ == '__main__':
	main()
