# Generate a 2048×2048 non-wood board with 4 concentric squares and 32 holes
# Specs (scaled from the 1024px baseline by 2x):
# - Hole diameter: 100 px (radius r = 50)
# - Distance between hole edges along mid-edge connectors: 80 px
#   => Center-to-center step between squares (along axes) = 50 + 80 + 50 = 180 px
#
# Visual goals:
# - Clear contrast between holes and background
# - Add some color that complements blue/green pieces (teal/cyan accents)
# - Keep lines aligned to hole edges (no overlap)
#
from PIL import Image, ImageDraw, ImageFilter
import math

# Canvas
W, H = 2048, 2048
cx, cy = W//2, H//2

# Background: cool dark gradient (non-wood)
bg = Image.new("RGBA", (W, H), (16, 22, 28, 255))
grad = Image.new("L", (W, H), 0)
gdraw = ImageDraw.Draw(grad)
gdraw.ellipse((-400, -400, W+400, H+400), fill=255)
grad = grad.filter(ImageFilter.GaussianBlur(260))
bg_colored = Image.composite(Image.new("RGBA", (W,H), (24, 34, 44, 255)), bg, grad)
img = bg_colored.copy()
draw = ImageDraw.Draw(img, "RGBA")

# Geometry
r = 50  # radius for 100px holes
edge_gap = 80  # hole-edge to hole-edge gap between consecutive squares along axes
step = r + edge_gap + r  # 180px
dists = [720, 540, 360, 180]  # half-sizes for 4 squares (outermost to innermost), spaced by 'step'
assert all(d > 0 for d in dists)

# Colors
glow = (0, 210, 190, 90)        # soft teal glow
line_color = (140, 240, 220, 240)  # bright teal line
line_width = 10
glow_width = 28

# Helper: draw line from circle-edge to circle-edge
def line_between_circle_edges(p1, p2, radius, width, color, glow_color=None, glow_w=0):
    (x1, y1), (x2, y2) = p1, p2
    vx, vy = x2 - x1, y2 - y1
    d = math.hypot(vx, vy)
    if d == 0:
        return
    ux, uy = vx/d, vy/d
    start = (x1 + ux*radius, y1 + uy*radius)
    end   = (x2 - ux*radius, y2 - uy*radius)
    if glow_color and glow_w > 0:
        draw.line([start, end], fill=glow_color, width=glow_w)
    draw.line([start, end], fill=color, width=width)

# Compute points
def points_on_square(d):
    # order: [NW, NE, SE, SW, N, E, S, W]
    pts = [(cx-d, cy-d), (cx+d, cy-d), (cx+d, cy+d), (cx-d, cy+d),
           (cx, cy-d), (cx+d, cy), (cx, cy+d), (cx-d, cy)]
    return pts

square_pts = [points_on_square(d) for d in dists]

# Draw edges for each square (corner <-> midpoint on each side)
def draw_square_edges(pts):
    NW, NE, SE, SW, N, E, S, W = pts
    line_between_circle_edges(NW, N, r, line_width, line_color, glow, glow_width)
    line_between_circle_edges(NE, N, r, line_width, line_color, glow, glow_width)
    line_between_circle_edges(NE, E, r, line_width, line_color, glow, glow_width)
    line_between_circle_edges(SE, E, r, line_width, line_color, glow, glow_width)
    line_between_circle_edges(SE, S, r, line_width, line_color, glow, glow_width)
    line_between_circle_edges(SW, S, r, line_width, line_color, glow, glow_width)
    line_between_circle_edges(SW, W, r, line_width, line_color, glow, glow_width)
    line_between_circle_edges(NW, W, r, line_width, line_color, glow, glow_width)

for pts in square_pts:
    draw_square_edges(pts)

# Draw connectors along axes between consecutive squares
for i in range(len(square_pts)-1):
    outer, inner = square_pts[i], square_pts[i+1]
    # indices 4,5,6,7 are N,E,S,W midpoints
    for idx in [4,5,6,7]:
        line_between_circle_edges(outer[idx], inner[idx], r, line_width, line_color, glow, glow_width)

# Border accents
margin = 120
draw.rounded_rectangle([margin, margin, W-margin, H-margin], radius=36, outline=(60, 180, 160, 200), width=14)
draw.rounded_rectangle([margin+20, margin+20, W-margin-20, H-margin-20], radius=28, outline=(30, 80, 90, 200), width=3)

# Collect all hole centers (32 points = 8 per square * 4 squares)
all_points = []
for pts in square_pts:
    all_points += pts

# Draw holes with visible contrast
def draw_hole(center, radius):
    x, y = center
    # Drop shadow
    sh = Image.new("RGBA", (W, H), (0,0,0,0))
    ds = ImageDraw.Draw(sh)
    ds.ellipse([x-radius-10, y-radius-10, x+radius+10, y+radius+10], fill=(0,0,0,120))
    sh = sh.filter(ImageFilter.GaussianBlur(12))
    img.alpha_composite(sh)
    # Hole body (very dark with inner gradient rim for visibility)
    hole = Image.new("RGBA", (W, H), (0,0,0,0))
    dh = ImageDraw.Draw(hole)
    dh.ellipse([x-radius, y-radius, x+radius, y+radius], fill=(8, 10, 14, 255))
    # Inner ring highlight
    dh.ellipse([x-radius+6, y-radius+6, x+radius-6, y+radius-6], outline=(120, 200, 190, 200), width=3)
    # Center gloss
    dh.ellipse([x-radius+14, y-radius+14, x+radius-24, y+radius-24], fill=(20, 26, 34, 255))
    img.alpha_composite(hole)

for pt in all_points:
    draw_hole(pt, r)

# Save
out_path = "images/board.png"
img.save(out_path)
# Also save dedicated filename for 4-square board
img.save("images/board32.png")

# --- Generate 3-square (24 points) board for Nine Men's Morris ---
# Rebuild background
img2 = bg_colored.copy()
draw2 = ImageDraw.Draw(img2, "RGBA")
draw = draw2  # redirect drawing helpers to img2

# Geometry for 3 squares
dists2 = [720, 540, 360]
square_pts2 = [points_on_square(d) for d in dists2]

def draw_square_edges2(pts):
    NW, NE, SE, SW, N, E, S, W = pts
    line_between_circle_edges(NW, N, r, line_width, line_color, glow, glow_width)
    line_between_circle_edges(NE, N, r, line_width, line_color, glow, glow_width)
    line_between_circle_edges(NE, E, r, line_width, line_color, glow, glow_width)
    line_between_circle_edges(SE, E, r, line_width, line_color, glow, glow_width)
    line_between_circle_edges(SE, S, r, line_width, line_color, glow, glow_width)
    line_between_circle_edges(SW, S, r, line_width, line_color, glow, glow_width)
    line_between_circle_edges(SW, W, r, line_width, line_color, glow, glow_width)
    line_between_circle_edges(NW, W, r, line_width, line_color, glow, glow_width)

for pts in square_pts2:
    draw_square_edges2(pts)

for i in range(len(square_pts2)-1):
    outer, inner = square_pts2[i], square_pts2[i+1]
    for idx in [4,5,6,7]:
        line_between_circle_edges(outer[idx], inner[idx], r, line_width, line_color, glow, glow_width)

# Border accents
margin = 120
draw2.rounded_rectangle([margin, margin, W-margin, H-margin], radius=36, outline=(60, 180, 160, 200), width=14)
draw2.rounded_rectangle([margin+20, margin+20, W-margin-20, H-margin-20], radius=28, outline=(30, 80, 90, 200), width=3)

# Holes
all_points2 = []
for pts in square_pts2:
    all_points2 += pts

for pt in all_points2:
    # draw_hole uses global 'img'; temporarily switch
    tmp = img
    img = img2
    draw_hole(pt, r)
    img = tmp

img2.save("images/board24.png")
out_path
