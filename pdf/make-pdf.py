# python3 make-pdf.py <site dir> <pdf-data.json> <out.pdf>  (se ejecuta solo cada lunes en GitHub)
# Weekly printable catalog: families, 12 products per page, each product links to the web catalog with the item added.
import io, json, os, struct, sys
from datetime import datetime
from zoneinfo import ZoneInfo
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

site, data_path, out = sys.argv[1:4]
here = os.path.dirname(os.path.abspath(__file__))
pdfmetrics.registerFont(TTFont('Sans', os.path.join(here, 'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('SansB', os.path.join(here, 'DejaVuSans-Bold.ttf')))
NAVY, BLUE, GREEN, ORANGE, MUTED = (0.024, 0.169, 0.298), (0.07, 0.42, 0.63), (0.12, 0.62, 0.33), (0.72, 0.47, 0.12), (0.41, 0.47, 0.53)
URL = 'https://catalog.theseamanshop.com'
data = json.load(open(data_path))
products = data['products']
week = datetime.now().strftime('%d/%m/%Y')

# small photos from the offline pack (already 220 px)
pack = open(os.path.join(site, 'offline-pack.bin'), 'rb').read()
hl = struct.unpack('>I', pack[8:12])[0]
hdr = json.loads(pack[12:12 + hl]); off = 12 + hl; thumbs = {}
for path, size in hdr['files']:
    thumbs[path] = pack[off:off + size]; off += size
cache = {}
def photo(path):
    if not path: return None
    if path in cache: return cache[path]
    raw = thumbs.get(path)
    if raw is None and os.path.exists(os.path.join(site, path)): raw = open(os.path.join(site, path), 'rb').read()
    if raw is None: cache[path] = None; return None
    im = Image.open(io.BytesIO(raw)).convert('RGBA'); bg = Image.new('RGB', im.size, 'white'); bg.paste(im, mask=im.split()[3])
    bg.thumbnail((190, 190)); b = io.BytesIO(); bg.save(b, 'JPEG', quality=50, optimize=True); b.seek(0)
    cache[path] = ImageReader(b); return cache[path]

W, H = A4; M = 28; GAP = 9; COLS, ROWS = 3, 4
c = canvas.Canvas(out, pagesize=A4); c.setTitle("The Seaman's Shop · Catalog " + week); c.setAuthor("The Seaman's Shop")
# Every page (posters included), bottom right: date of this build (Madrid) + where the latest catalog lives.
STAMP = 'Updated daily · Prices valid on ' + datetime.now(ZoneInfo('Europe/Madrid')).strftime('%d/%m/%Y') + ' · Latest: catalog.theseamanshop.com'
_show_page = c.showPage
def _stamped_page():
    c.saveState(); tw = c.stringWidth(STAMP, 'Sans', 6.5); x = W - M - tw
    c.setFillColorRGB(1, 1, 1); c.rect(x - 4, 0.5, tw + 8, 9.5, stroke=0, fill=1)
    c.setFillColorRGB(*NAVY); c.setFont('Sans', 6.5); c.drawString(x, 3, STAMP); c.linkURL(URL, (x, 0.5, W - M, 10), relative=0)
    c.restoreState(); _show_page()
c.showPage = _stamped_page
def money(v): return '$' + (('%d' % v) if float(v).is_integer() else ('%.2f' % v)) if isinstance(v, (int, float)) else 'Ask price'
def wrap(text, font, size, width, lines):
    words, out_, cur = str(text).split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if c.stringWidth(t, font, size) <= width: cur = t
        else:
            if cur: out_.append(cur)
            cur = w
            if len(out_) == lines: break
    if cur and len(out_) < lines: out_.append(cur)
    if len(out_) == lines and ' '.join(out_) != ' '.join(words):
        while c.stringWidth(out_[-1] + '…', font, size) > width and out_[-1]: out_[-1] = out_[-1][:-1]
        out_[-1] += '…'
    return out_

# group by family (SIM cards: only the SIM sheet page)
fams = []
products = [p for p in products if p.get('family', p['category']) != 'SIM cards']
for p in products:
    if not fams or fams[-1][0] != p['category']: fams.append([p['category'], []])
    fams[-1][1].append(p)

def footer(page):
    c.setFont('Sans', 7); c.setFillColorRGB(*MUTED)
    c.drawString(M, 10, "The Seaman's Shop · WhatsApp +34 655 322 014 · Prices in USD, Valencia · Week " + week)
    c.drawRightString(W - M, 10, 'Page %d' % page)

PER = 12
OUTLET_INTRO = os.path.exists(os.path.join(here, 'art', 'front-6.jpg')) and datetime.now().strftime('%Y-%m-%d') <= '2026-10-31'
def fam_anchor(name):
    for i, (n, _) in enumerate(fams):
        if n == name: return 'fam%d' % i
    return 'index'
def sub_anchor(fam, sub):
    for i, (n, items) in enumerate(fams):
        if n == fam and any(p.get('subfamily') == sub for p in items): return 'sub%d_%s' % (i, sub.replace(' ', '_'))
    return fam_anchor(fam)
def link(target, rect):
    if target.startswith('http'): c.linkURL(target, rect, relative=0)
    else: c.linkRect('', target, rect, relative=0)

# ---- your usual first pages (original images), full page, with tappable areas
STRIPS = {'insert-60.jpg': os.path.join(here, 'art', 'special.jpg')}   # banner drawn under a poster
def poster(path, areas, buttons):
    full = os.path.join(site, path)
    if not os.path.exists(full): return False
    ir = ImageReader(full) if full.endswith('.jpg') else None
    if ir is None:
        im = Image.open(full).convert('RGB'); b = io.BytesIO(); im.thumbnail((1240, 1240)); im.save(b, 'JPEG', quality=72, optimize=True); b.seek(0); ir = ImageReader(b)
    iw, ih = ir.getSize(); bh = 46 if buttons else 0
    strip = STRIPS.get(os.path.basename(path)); sh = 0
    if strip and os.path.exists(strip):   # a banner under the poster (e.g. «Special orders» under «Buy online»)
        sw_, sh_ = ImageReader(strip).getSize(); sh = (W - 2 * M) * sh_ / sw_; c.drawImage(strip, M, bh + 4, W - 2 * M, sh); sh += 8
    s = min(W / iw, (H - bh - sh) / ih); dw, dh = iw * s, ih * s; x0 = (W - dw) / 2; y0 = bh + sh + (H - bh - sh - dh) / 2
    c.drawImage(ir, x0, y0, dw, dh)
    for (fx0, fy0, fx1, fy1), target in areas:   # fractions of the image, from the top-left
        link(target, (x0 + fx0 * dw, y0 + (1 - fy1) * dh, x0 + fx1 * dw, y0 + (1 - fy0) * dh))
    if buttons:
        bx = M; bw = (W - 2 * M - (len(buttons) - 1) * 8) / len(buttons)
        for label, target in buttons:
            c.setFillColorRGB(*(GREEN if target.startswith('http') else NAVY)); c.roundRect(bx, 14, bw, 24, 6, stroke=0, fill=1)
            c.setFillColorRGB(1, 1, 1); c.setFont('SansB', 9); c.drawCentredString(bx + bw / 2, 22, label); link(target, (bx, 14, bx + bw, 38)); bx += bw + 8
    c.showPage(); return True

WA = 'https://wa.me/34655322014'
G = 1 / 930; GX = 1 / 620
def row(y0, y1, target): return ((12 * GX, y0 * G, 605 * GX, y1 * G), target)
guide_areas = [row(102, 180, fam_anchor('AUDIO SPEAKERS')), row(185, 262, fam_anchor('SAMSONITE')), row(267, 343, fam_anchor('SWISS MILITARY')),
               row(348, 422, fam_anchor('PERFUMES')), row(428, 500, fam_anchor('VITAMINS & SUPPLEMENTS')), row(505, 582, fam_anchor('PERSONAL CARE')),
               row(587, 660, fam_anchor('VAPE AREA')), row(665, 738, fam_anchor('SUPERMARKET')), row(742, 825, WA)]
FA = os.path.join(here, 'art')
def box(x0, y0, x1, y1, target): return ((x0 / 620, y0 / 877, x1 / 620, y1 / 877), target)
cover_areas = [box(255, 390, 367, 540, fam_anchor('SWISS MILITARY')), box(370, 390, 492, 540, fam_anchor('MOBILEPHONES')), box(495, 390, 615, 540, fam_anchor('AUDIO SPEAKERS')),
               box(255, 540, 367, 648, fam_anchor('LAPTOP')), box(370, 540, 492, 648, fam_anchor('PERFUMES')), box(495, 540, 615, 648, fam_anchor('T-SHIRTS NEW ERA')),
               box(255, 648, 367, 775, fam_anchor('SAMSONITE')), box(370, 648, 492, 775, fam_anchor('PERSONAL CARE')), box(495, 648, 615, 775, 'simpage'),
               box(305, 800, 480, 860, WA), box(0, 800, 300, 877, URL)]
FRONT = [(os.path.join(FA, 'front-1.jpg'), cover_areas, [('Open the online catalog ▸', URL), ('Sections ▸', 'index'), ('WhatsApp us ▸', WA)]),
         (os.path.join(FA, 'front-2.jpg'), guide_areas, [('Tap a category to go to it  ·  All sections ▸', 'index')]),
         (os.path.join(FA, 'front-3.jpg'), [((0, 0, 1, 1), URL)], [('How to order ▸', 'index'), ('Open the online catalog ▸', URL)]),
         (os.path.join(FA, 'front-4.jpg'), [((0, 0, 1, 1), WA)], [('Special order? WhatsApp us ▸', WA), ('Online catalog ▸', URL)]),
         (os.path.join(FA, 'front-5.jpg'), [((0, 0, 1, 1), URL)], [('Order SIM cards online ▸', URL), ('Questions? WhatsApp ▸', WA)])]
FRONT.append((os.path.join(FA, 'insert-60.jpg'), [((0, 0, 1, 1), WA)], [('Send us your link on WhatsApp ▸', WA), ('Online catalog ▸', URL)]))   # «Buy online with The Seaman's Shop» (Zalando, JD…), after SIM (Madico 01/11)
FRONT += [(os.path.join(FA, n), [((0, 0, 1, 1), WA)], [('Special order? WhatsApp us ▸', WA), ('Online catalog ▸', URL)]) for n in ('special-orders.jpg', 'special-orders.png') if os.path.exists(os.path.join(FA, n))][:1]   # ChatGPT special-orders page, after SIM
FRONT = [f for f in FRONT if os.path.exists(f[0])]
pn = 1
for i, (path, areas, btns) in enumerate(FRONT):
    if i == 1: c.bookmarkPage('index')
    if i == 4: c.bookmarkPage('simpage')
    if poster(path, areas, btns): pn += 1

pno = pn

# ---- product pages (style of the usual catalog: blue banner, centred products, subfamilies)
pdfmetrics.registerFont(TTFont('SansBI', os.path.join(here, 'DejaVuSans-BoldOblique.ttf')))
pdfmetrics.registerFont(TTFont('Cond', os.path.join(here, 'DejaVuSansCondensed.ttf')))
pdfmetrics.registerFont(TTFont('CondB', os.path.join(here, 'DejaVuSansCondensed-Bold.ttf')))
LOGO = os.path.join(site, 'assets/logo-2x.png'); SHIP = os.path.join(here, 'ship.png')
logo_circle = None
if os.path.exists(LOGO):
    lg = Image.open(LOGO).convert('RGBA'); s_ = lg.size[1]; b = io.BytesIO(); lg.crop((0, 0, s_, s_)).save(b, 'PNG'); b.seek(0); logo_circle = ImageReader(b)
BIG = {}
import numpy as np
def clean(im):
    # Old photos with a badly removed background have solid black RECTANGLES: whiten only those, then trim the white margin
    from scipy import ndimage
    a = np.asarray(im).copy(); blk = a.max(2) < 12
    if blk.any():
        lab, n = ndimage.label(blk)
        for i, sl in enumerate(ndimage.find_objects(lab), 1):
            hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start; area = (lab[sl] == i).sum()
            if area > 400 and area > 0.9 * hh * ww:   # a filled rectangle, not a black product
                y0, y1, x0, x1 = max(0, sl[0].start - 3), sl[0].stop + 3, max(0, sl[1].start - 3), sl[1].stop + 3
                sub = a[y0:y1, x0:x1]; sub[sub.max(2) < 200] = 255
    m = a.min(2) < 240; ys, xs = np.where(m)
    if len(xs):
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max(); pad = int(0.03 * max(x1 - x0, y1 - y0))
        a = a[max(0, y0 - pad):y1 + pad + 1, max(0, x0 - pad):x1 + pad + 1]
    return Image.fromarray(a)
def big(path):
    if not path: return None
    if path in BIG: return BIG[path]
    full = os.path.join(site, path)
    if not os.path.exists(full): BIG[path] = photo(path); return BIG[path]
    im = Image.open(full).convert('RGBA'); bg = Image.new('RGB', im.size, 'white'); bg.paste(im, mask=im.split()[3])
    bg = clean(bg); bg.thumbnail((200, 200)); b = io.BytesIO(); bg.save(b, 'JPEG', quality=45, optimize=True); b.seek(0); BIG[path] = ImageReader(b); return BIG[path]
ART = os.path.join(here, 'art')
OUTLET_MODE = [False]
def banner(title):
    out = OUTLET_MODE[0]; img = os.path.join(ART, 'hdr-outlet.jpg' if out else 'hdr.jpg')
    iw, ih = Image.open(img).size; w = W - 20; h = w * ih / iw
    c.drawImage(img, 10, H - 6 - h, w, h)
    if not out:
        c.setFillColorRGB(1, 1, 1); fs = 24
        while c.stringWidth(title.upper(), 'SansB', fs) > w * 0.40 and fs > 11: fs -= 1
        c.setFont('SansB', fs); c.drawCentredString(10 + w * 0.556, H - 6 - h * 0.43, title.upper())
    else:
        c.setFillColorRGB(1, 1, 1); c.setFont('SansB', 8); c.drawCentredString(10 + w * 0.36, H - 6 - h - 9, '')
def footer2(page):
    out = OUTLET_MODE[0]; img = os.path.join(ART, 'ftr-outlet.jpg' if out else 'ftr.jpg')
    iw, ih = Image.open(img).size; w = W - 20; h = w * ih / iw; y = 10
    c.drawImage(img, 10, y, w, h)
    c.linkURL('https://wa.me/34655322014', (10, y, 10 + w * 0.22, y + h), relative=0)
    c.linkURL(URL, (10 + w * 0.23, y, 10 + w * 0.44, y + h), relative=0)
    c.setFillColorRGB(*MUTED); c.setFont('Sans', 5.5); c.drawString(M, 3, 'Prices in USD (Valencia) · Tap a product to order it online · Page %d' % page)
# TYPE = first words of the name (ARTICULOS naming rule, 01/11); pdf/tipos.csv is the list of types. Longest type wins (CAMERA FILM before CAMERA).
TIPOS = sorted({l.split(';')[0].strip().upper() for l in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tipos.csv'), encoding='utf-8-sig') if l.strip()}, key=len, reverse=True) if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tipos.csv')) else []
def brand_split(name):
    up = ' '.join(str(name).split()).upper()
    for t in TIPOS:
        if up == t: return str(name), ''
        if up.startswith(t + ' '): return ' '.join(str(name).split()[:len(t.split())]), ' '.join(str(name).split()[len(t.split()):])
    w = str(name).split()
    if len(w) <= 2: return str(name), ''
    head = ' '.join(w[:2]) if len(w[0]) <= 4 or w[0].upper() in ('MADE', 'NEW', 'THE') else w[0]
    return head, str(name)[len(head):].strip()
COLS2 = 3; CELL_W = (W - 2 * M) / COLS2; CELL_H = 171; LABEL_H = 24; TOP = H - 88; BOTTOM = 74
import re as _re
SIZES = [(0.6, r'controller|dualsense|mando|gamepad'), (0.85, r'\bkids?\b|child|junior|\bniñ')]
def size_factor(p):
    n = (p.get('name') or '') + ' ' + (p.get('group') or '')
    for f, rx in SIZES:
        if _re.search(rx, n, _re.I): return f
    return 1.0
def cell(p, x, ytop, w=None, h=None):
    w = w or CELL_W; h = h or CELL_H; CW = w
    tag = 'OUTLET' if p.get('outlet') else 'SPECIAL OFFER' if (p.get('offer') or p.get('bundle')) else ('FREE GIFT' if not PAGE_GIFT[0] else '') if p.get('gift') else ''
    img = big(p.get('image')); ih = max(70, min(h - 58, w * 1.0)); top = ytop - 4
    if tag: top -= 13; ih -= 13  # the tag sits above the photo, never on it
    if img:
        iw, ihh = img.getSize(); s = min((CW - 8) / iw, ih / ihh) * size_factor(p)
        c.drawImage(img, x + (CW - iw * s) / 2, top - ih + (ih - ihh * s) / 2, iw * s, ihh * s)
    else:
        c.setFillColorRGB(*MUTED); c.setFont('Sans', 8); c.drawCentredString(x + CW / 2, top - ih / 2, 'Photo on the web')
    if tag:
        col = (0.80, 0.10, 0.12) if tag != 'ON REQUEST' else (0.45, 0.50, 0.58)
        tw = c.stringWidth(tag, 'CondB', 6.5) + 8; c.setFillColorRGB(*col); c.roundRect(x + 4, ytop - 12, tw, 11, 3, stroke=0, fill=1)
        c.setFillColorRGB(1, 1, 1); c.setFont('CondB', 6.5); c.drawString(x + 8, ytop - 9, tag)
    cx = x + CW / 2; yy = top - ih - 15
    red = p.get('compareAt') or p.get('offer')
    c.setFont('SansB', 15); c.setFillColorRGB(*((0.80, 0.10, 0.12) if red else (0.02, 0.06, 0.12))); c.drawCentredString(cx, yy, money(p['price']))
    if p.get('compareAt'):
        pw = c.stringWidth(money(p['price']), 'SansB', 15); c.setFont('Sans', 8.5); c.setFillColorRGB(*MUTED)
        ox = cx + pw / 2 + 4; c.drawString(ox, yy + 1, money(p['compareAt'])); c.line(ox, yy + 4, ox + c.stringWidth(money(p['compareAt']), 'Sans', 8.5), yy + 4)
    head, rest = brand_split(p['name']); yy -= 11
    promo = p.get('bundle') or p.get('offer'); extra = bool(p.get('sizes')) + bool(promo)
    c.setFillColorRGB(0.02, 0.06, 0.12); c.setFont('CondB', 8.6)
    for line in wrap(head.upper(), 'CondB', 8.6, CW - 10, 1): c.drawCentredString(cx, yy, line); yy -= 9.6
    c.setFont('Cond', 8)
    for line in wrap(rest.upper(), 'Cond', 8, CW - 10, 2 if extra < 2 else 1): c.drawCentredString(cx, yy, line); yy -= 9
    if p.get('sizes'): c.setFont('Cond', 7); c.setFillColorRGB(*MUTED); c.drawCentredString(cx, yy, ('Sizes: ' + ' · '.join(p['sizes']))[:60]); yy -= 8.6
    if promo:
        ptxt = promo.upper()[:44]; c.setFont('CondB', 8); pw_ = c.stringWidth(ptxt, 'CondB', 8) + 12
        c.setFillColorRGB(0.80, 0.10, 0.12); c.roundRect(cx - pw_ / 2, yy - 3, pw_, 12, 6, stroke=0, fill=1)
        c.setFillColorRGB(1, 1, 1); c.drawCentredString(cx, yy, ptxt); yy -= 13
    sf_ = '' if p.get('_onegroup') else (p.get('group') or p.get('subfamily') or '').strip().upper()
    c.setFont('Cond', 7.5); lab = 'Art. ' + str(p['art'])
    if sf_ and sf_ != 'GENERAL':
        full = sf_[:28] + '  ·  ' + lab; w1 = c.stringWidth(full, 'Cond', 7.5); sx = cx - w1 / 2
        c.setFillColorRGB(*BLUE); c.drawString(sx, yy, sf_[:28] + '  ·  '); c.setFillColorRGB(0.02, 0.06, 0.12); c.drawString(sx + c.stringWidth(sf_[:28] + '  ·  ', 'Cond', 7.5), yy, lab)
    else:
        c.setFillColorRGB(0.02, 0.06, 0.12); c.drawCentredString(cx, yy, lab)
    c.linkURL(URL + '/#add=' + str(p['art']), (x + 2, ytop - h + 4, x + CW - 2, ytop), relative=0)
pno = pn
# ---- this week's offers page
offers = {}
for fam_name, items in fams:
    for p in items:
        k = p.get('bundle') or p.get('offer') or p.get('gift')
        if p.get('offer') and not p.get('bundle'): k = '%s now %s (was %s)' % (' '.join(p['name'].split()[:2]).title(), money(p['price']), money(p.get('compareAt') or 0))
        if p.get('gift') and not p.get('bundle'): k = 'Free gift with speakers & laptops over $300'
        if k: offers.setdefault(k, []).append(p)
outlet_n = sum(1 for p in prods if p.get('outlet')) if 'prods' in dir() else 0
if False:  # offers page removed (Madico 29/10): promos shown on each product
    banner('Offers this week'); yy = TOP - 4
    c.setFillColorRGB(0.02, 0.06, 0.12); c.setFont('Sans', 9.5); c.drawCentredString(W / 2, yy, 'Mix models inside each offer. Discounts are applied automatically in your list.'); yy -= 12
    keys = list(offers.keys()); n = len(keys); rh = min(58, (yy - BOTTOM - 10) / max(1, (n + 1) // 2)); cw = (W - 2 * M - 10) / 2
    for i, label in enumerate(keys):
        items = offers[label]; x = M + (i % 2) * (cw + 10); y = yy - (i // 2) * rh
        c.setFillColorRGB(0.99, 0.94, 0.94); c.roundRect(x, y - rh + 4, cw, rh - 6, 6, stroke=0, fill=1)
        img = big(items[0].get('image')); th = rh - 12
        if img:
            iw, ih_ = img.getSize(); s = min(th / iw, th / ih_); c.drawImage(img, x + 4 + (th - iw * s) / 2, y - rh + 7 + (th - ih_ * s) / 2, iw * s, ih_ * s)
        tx = x + th + 10
        c.setFillColorRGB(0.80, 0.10, 0.12); c.setFont('CondB', 10.5 if len(label) < 34 else 9)
        for k, line in enumerate(wrap(label.upper(), 'CondB', 10.5 if len(label) < 34 else 9, cw - th - 16, 2)): c.drawString(tx, y - 16 - k * 11, line)
        c.setFillColorRGB(0.02, 0.06, 0.12); c.setFont('Cond', 7.5)
        names = ' · '.join(dict.fromkeys(pp['name'].split(' ')[0].upper() + ' ' + ' '.join(pp['name'].split(' ')[1:3]).upper() for pp in items[:3]))
        c.drawString(tx, y - rh + 20, (('Art. ' + ' / '.join(str(pp['art']) for pp in items[:4]) + (' …' if len(items) > 4 else '')) if len(items) <= 6 else '%d products' % len(items))[:60])
        c.setFillColorRGB(*BLUE); c.setFont('CondB', 7.5); c.drawString(tx, y - rh + 10, 'TAP TO ORDER ▸')
        link(URL + '/#add=' + str(items[0]['art']), (x, y - rh + 4, x + cw, y - 2))
    footer2(pno); c.showPage(); pno += 1

# ---- families: grid of 12 (3 x 4), each family starts on a new page; 3+ empty slots get a shop block
GW = (W - 2 * M) / 3; GH = (TOP - BOTTOM) / 4
def filler(x, ytop, w, h):
    sp = os.path.join(ART, 'special.jpg'); sw = w - 20; sh = sw * 138 / 996
    if sh > h - 20: sh = h - 20; sw = sh * 996 / 138
    sx = x + (w - sw) / 2; sy = ytop - h / 2 - sh / 2
    c.drawImage(sp, sx, sy, sw, sh); link(WA, (sx, sy, sx + sw, sy + sh))
    if h > sh + 60:
        c.setFillColorRGB(*GREEN); c.roundRect(W / 2 - 150, sy - 34, 145, 24, 6, stroke=0, fill=1); c.setFillColorRGB(1, 1, 1); c.setFont('CondB', 9.5); c.drawCentredString(W / 2 - 77, sy - 26, 'ASK US ON WHATSAPP ▸'); link(WA, (W / 2 - 150, sy - 34, W / 2 - 5, sy - 10))
        c.setFillColorRGB(*NAVY); c.roundRect(W / 2 + 5, sy - 34, 145, 24, 6, stroke=0, fill=1); c.setFillColorRGB(1, 1, 1); c.drawCentredString(W / 2 + 77, sy - 26, 'ONLINE CATALOG ▸'); link(URL, (W / 2 + 5, sy - 34, W / 2 + 150, sy - 10))
INSERTS = [(59, 'insert-59.jpg', [('Size charts · Ask us on WhatsApp ▸', WA)]), (60, 'insert-60.jpg', [('Send us your link on WhatsApp ▸', WA)]), (116, 'insert-116.jpg', [('WhatsApp us ▸', WA), ('Online catalog ▸', URL)])]
done_ins = set()
FEATURED = {'SAMSONITE'}
PAGE_GIFT = [False]
BRAND_LOGO = {'SAMSONITE': 'logo-samsonite.png'}
def page_sizes(n):
    pages = -(-n // 12)
    if pages > 1 and n - 12 * (pages - 1) <= 4: pages -= 1
    base, extra = divmod(n, pages); return [base + (1 if i < extra else 0) for i in range(pages)]
def layout(k):
    # as even as possible: up to 2 per row on tiny pages, 3 normally, 4 when a page holds 13-16
    if k <= 4: nr = -(-k // 2)
    elif k <= 12: nr = -(-k // 3)
    else: nr = 4
    base, extra = divmod(k, nr); return [base + (1 if i < extra else 0) for i in range(nr)]
for fi, (name, items) in enumerate(fams):
    sp = items[0].get('secpage', 500)
    if len({(x.get('group') or '').upper() for x in items}) == 1:
        for x in items: x['_onegroup'] = True
    for pg_, img_, btn_ in INSERTS:
        if pg_ < sp and pg_ not in done_ins and os.path.exists(os.path.join(ART, img_)):
            done_ins.add(pg_); poster(os.path.join(ART, img_), [], btn_); pno += 1
    if name == 'OUTLET':
        OUTLET_MODE[0] = True
        if OUTLET_INTRO:
            c.bookmarkPage('fam%d' % fi); c.addOutlineEntry('OUTLET', 'fam%d' % fi, 0)
            poster(os.path.join(here, 'art', 'front-6.jpg'), [((0, 0, 1, 1), URL)], [('See the outlet ▸', 'outlet1'), ('Online catalog ▸', URL)]); pno += 1
    k0 = 0
    feat = name in FEATURED and len(items) >= 8
    sizes = ([8] + page_sizes(len(items) - 8)) if feat and len(items) > 8 else page_sizes(len(items))
    for pi, k in enumerate(sizes):
        banner(name)
        if pi == 0 and name == 'OUTLET': c.bookmarkPage('outlet1')
        if pi == 0 and not (name == 'OUTLET' and OUTLET_INTRO): c.bookmarkPage('fam%d' % fi); c.addOutlineEntry(name.title(), 'fam%d' % fi, 0)
        chunk = items[k0:k0 + k]; k0 += k
        PAGE_GIFT[0] = len(chunk) > 1 and all(x.get('gift') for x in chunk)
        if PAGE_GIFT[0]:
            c.setFont('CondB', 11); gw = c.stringWidth('FREE GIFT', 'CondB', 11) + 24
            c.setFillColorRGB(0.80, 0.10, 0.12); c.roundRect(W / 2 - gw / 2, TOP - 4, gw, 16, 8, stroke=0, fill=1)
            c.setFillColorRGB(1, 1, 1); c.drawCentredString(W / 2, TOP + 0.5, 'FREE GIFT')
        avail = TOP - BOTTOM; y = TOP; j = 0
        if feat and pi == 0:
            bh = avail * 0.45; bw = (W - 2 * M) / 2
            for q in range(2): cell(chunk[q], M + q * bw, y, bw, bh)
            y -= bh; j = 2; avail -= bh
        rows = layout(len(chunk) - j)
        rh = min(avail / len(rows), 250 if len(rows) <= 2 else avail / len(rows))
        for rn in rows:
            cw = (W - 2 * M) / max(rn, 3 if len(chunk) > 4 else 2); x0 = M + (W - 2 * M - rn * cw) / 2
            for q in range(rn):
                cell(chunk[j], x0 + q * cw, y, cw, rh); j += 1
            y -= rh
        if y - BOTTOM > 110:
            lg = BRAND_LOGO.get(name)
            if lg and os.path.exists(os.path.join(ART, lg)):
                li = ImageReader(os.path.join(ART, lg)); iw, ih_ = li.getSize(); hh = min(y - BOTTOM - 30, 90); ww = hh * iw / ih_
                if ww > W - 2 * M - 40: ww = W - 2 * M - 40; hh = ww * ih_ / iw
                c.drawImage(li, (W - ww) / 2, BOTTOM + (y - BOTTOM - hh) / 2, ww, hh, mask='auto')
            else: filler(M, y, W - 2 * M, y - BOTTOM)
        footer2(pno); c.showPage(); pno += 1
c.save()
print('pdf', out, pno - 1, 'pages', round(os.path.getsize(out) / 1e6, 2), 'MB')
