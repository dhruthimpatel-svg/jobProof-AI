# Generates assets/logo.webp — JobProof mark: a check drawn as dots (dot-matrix look).
import math
from PIL import Image, ImageDraw

S = 256
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

INK = (17, 20, 26, 255)  # near-black


def dots_along(x1, y1, x2, y2, r, step):
    dx, dy = x2 - x1, y2 - y1
    dist = math.hypot(dx, dy)
    n = max(2, round(dist / step) + 1)
    for i in range(n):
        t = i / (n - 1)
        x, y = x1 + dx * t, y1 + dy * t
        d.ellipse((x - r, y - r, x + r, y + r), fill=INK)


# Three-segment "authentic" style check mark, centered in the canvas.
P1 = (52, 134)
P2 = (110, 192)
P3 = (206, 66)

# Short stroke: smaller dots. Long stroke: larger dots.
dots_along(P1[0], P1[1], P2[0], P2[1], r=11, step=30)
dots_along(P2[0], P2[1], P3[0], P3[1], r=14, step=32)

img.save("assets/logo.webp", "WEBP", quality=92)
print("assets/logo.webp written:", img.size)
