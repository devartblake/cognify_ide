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
          resources/cognify/brand/cognify-icon-small.png       (simplified flat icon: used for <= 32 px and,
                                                                 with potrace installed, traced into the SVGs)
Outputs:  the icon files listed in DevDocs/Governance/PRODUCT_IDENTITY_AND_BRANDING.md, written at
          their existing paths and sizes so no build changes are needed, plus the light wordmark
          variant for dark backgrounds, the Agents-window icon resources/win32/sessions.ico (navy plate),
          and (from the simplified icon) cognify-icon.svg, the workbench product icon
          src/vs/workbench/browser/media/code-icon.svg and the letterpress-*.svg watermarks.
          Icon sizes of 32 px and below put the simplified icon on a pale plate, so it stays
          readable on dark taskbars and title bars as well as light ones.
"""

import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

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

# Flat palette of the simplified icon (cognify-icon-small.png), traced into SVG layers.
VECTOR_PALETTE = {'#021959': (2, 25, 89), '#00C4FA': (0, 196, 250), '#7101FC': (113, 1, 252)}
NAVY = VECTOR_PALETTE['#021959']
# Pale plate behind small icons: the navy C alone has too little contrast on dark taskbars and
# title bars, and an .ico can't switch with the theme, so the plate keeps it readable on both.
PLATE_LIGHT = (232, 238, 255)
PLATE_RADIUS = 0.25  # corner radius as a fraction of the side
SMALL_PLATE_FILL = 0.84  # the app icon's artwork on its plate, as a fraction of the side
SESSIONS_PLATE_FILL = 0.80  # the Agents-window icon's artwork on its navy plate
SESSIONS_ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]  # the frames upstream's sessions.ico has
WATERMARK_DIR = ROOT / 'src' / 'vs' / 'workbench' / 'browser' / 'parts' / 'editor' / 'media'
# Upstream letterpress styling per theme: (root attributes, path fill).
WATERMARK_THEMES = {
	'light': ('opacity="0.1"', None),
	'dark': ('opacity="0.3"', None),
	'hcLight': ('fill="none"', '#D9D9D9'),
	'hcDark': ('fill="none"', '#3C3C3C'),
}


def load_square_icon(path: Path) -> Image.Image:
	"""Trim transparent margins and center the artwork on a square transparent canvas."""
	image = Image.open(path).convert('RGBA')
	bbox = image.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
	image = image.crop(bbox)
	side = max(image.size)
	canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
	canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2), image)
	return canvas


def shrink(image: Image.Image, size: int) -> Image.Image:
	result = image.resize((size, size), Image.Resampling.LANCZOS)
	if size <= SMALL_ICON_MAX:
		# Recover edge contrast lost when downscaling soft gradients.
		result = result.filter(ImageFilter.UnsharpMask(radius=0.6, percent=120, threshold=1))
	return result


def on_plate(art: Image.Image, plate: tuple[int, int, int], fill: float, size: int) -> Image.Image:
	"""The artwork centered on a rounded-square plate, drawn large and then reduced to `size`."""
	side = 1024
	canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
	ImageDraw.Draw(canvas).rounded_rectangle((0, 0, side - 1, side - 1), radius=int(side * PLATE_RADIUS), fill=(*plate, 255))
	inner = int(side * fill)
	canvas.alpha_composite(art.resize((inner, inner), Image.Resampling.LANCZOS), ((side - inner) // 2, (side - inner) // 2))
	return shrink(canvas, size)


def render(icon: Image.Image, small_icon: Image.Image | None, size: int) -> Image.Image:
	if small_icon is not None and size <= SMALL_ICON_MAX:
		return on_plate(small_icon, PLATE_LIGHT, SMALL_PLATE_FILL, size)
	return shrink(icon, size)


def write_ico_frames(frames: list[Image.Image], path: Path) -> None:
	frames = sorted(frames, key=lambda f: f.width, reverse=True)
	frames[0].save(path, format='ICO', sizes=[(f.width, f.height) for f in frames], append_images=frames[1:])


def write_ico(icon: Image.Image, small_icon: Image.Image | None, path: Path, sizes: list[int]) -> None:
	write_ico_frames([render(icon, small_icon, s) for s in sizes], path)


def recolor_navy(image: Image.Image, color: tuple[int, int, int]) -> Image.Image:
	"""Recolor the simplified icon's navy C and slash, leaving the cyan and violet brackets."""
	image = image.copy()
	pixels = image.load()
	for y in range(image.height):
		for x in range(image.width):
			r, g, b, a = pixels[x, y]
			if a and max(r, g) < 110 and b < 140:  # navy: low red and green, moderate blue
				pixels[x, y] = (*color, a)
	return image


def write_sessions_ico(small_icon: Image.Image, path: Path) -> None:
	"""The Agents-window icon: a pale C with the cyan and violet brackets on a navy plate."""
	art = recolor_navy(small_icon, PLATE_LIGHT)
	write_ico_frames([on_plate(art, NAVY, SESSIONS_PLATE_FILL, s) for s in SESSIONS_ICO_SIZES], path)


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


def trace_layers(path: Path) -> tuple[int, list[tuple[str, str]]]:
	"""Trace each palette color of the flat icon with potrace. Returns (canvas size, [(color, svg group)])."""
	image = load_square_icon(path)
	size = image.width
	pixels = image.load()
	layers = []
	with tempfile.TemporaryDirectory() as work:
		for color, rgb in VECTOR_PALETTE.items():
			mask = Image.new('1', image.size, 1)  # 1 = white (background) for potrace
			mask_pixels = mask.load()
			for y in range(size):
				for x in range(size):
					r, g, b, a = pixels[x, y]
					if a >= 128:
						nearest = min(VECTOR_PALETTE.items(), key=lambda item: sum((c - v) ** 2 for c, v in zip((r, g, b), item[1])))
						if nearest[0] == color:
							mask_pixels[x, y] = 0
			bitmap = Path(work) / 'layer.pbm'
			traced = Path(work) / 'layer.svg'
			mask.save(bitmap)
			subprocess.run(['potrace', '--svg', '--flat', '--turdsize', '8', '--alphamax', '1.0', '--opttolerance', '0.4', str(bitmap), '-o', str(traced)], check=True)
			svg = traced.read_text()
			group = re.search(r'<g transform="([^"]+)"[^>]*>\s*<path d="([^"]+)"', svg, re.S)
			if group:
				layers.append((color, f'<g transform="{group.group(1)}"><path d="{group.group(2).strip()}"/></g>'))
	return size, layers


def write_vectors(size: int, layers: list[tuple[str, str]]) -> None:
	"""Write the color SVG master, the workbench product icon, and the four letterpress watermarks."""
	header = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}"'
	color_svg = header + '>' + ''.join(g.replace('<path ', f'<path fill="{c}" ') for c, g in layers) + '</svg>\n'
	(BRAND / 'cognify-icon.svg').write_text(color_svg)
	(ROOT / 'src' / 'vs' / 'workbench' / 'browser' / 'media' / 'code-icon.svg').write_text(color_svg)
	for theme, (root_attributes, fill) in WATERMARK_THEMES.items():
		paths = ''.join(g if fill is None else g.replace('<path ', f'<path fill="{fill}" ') for _, g in layers)
		(WATERMARK_DIR / f'letterpress-{theme}.svg').write_text(f'<svg width="260" height="260" viewBox="0 0 {size} {size}" {root_attributes} xmlns="http://www.w3.org/2000/svg">{paths}</svg>\n')


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

	if small_icon is not None:
		write_sessions_ico(small_icon, win32 / 'sessions.ico')

	if small_path.exists():
		if shutil.which('potrace') is None:
			print('potrace not found: skipping SVG generation (install potrace to regenerate code-icon.svg and letterpress-*.svg)')
		else:
			write_vectors(*trace_layers(small_path))


if __name__ == '__main__':
	main()
