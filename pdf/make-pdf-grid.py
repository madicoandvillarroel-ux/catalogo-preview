# Boceto PDF en cuadrícula de 12 (3 × 4). Uso: python boceto-pdf.py <site> <pdf-data.json> <live.pdf> <out.pdf>
import io, json, os, sys, math
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import pymupdf
import numpy as np

site, data_path, live_path, out = sys.argv[1:5]
fonts = os.path.join(site, 'pdf')
pdfmetrics.registerFont(TTFont('Sans', os.path.join(fonts, 'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('SansB', os.path.join(fonts, 'DejaVuSans-Bold.ttf')))
pdfmetrics.registerFont(TTFont('SansC', os.path.join(fonts, 'DejaVuSansCondensed.ttf')))
pdfmetrics.registerFont(TTFont('SansCB', os.path.join(fonts, 'DejaVuSansCondensed-Bold.ttf')))
NAVY, GREEN, ORANGE, MUTED, RED, LINE = (0.024, 0.169, 0.298), (0.12, 0.62, 0.33), (0.80, 0.45, 0.05), (0.41, 0.47, 0.53), (0.75, 0.15, 0.12), (0.84, 0.89, 0.93)
DATE = sys.argv[6] if len(sys.argv) > 6 else '30/10/2026'
data = json.load(open(data_path, encoding='utf-8'))
products = [p for p in data['products'] if p.get('status') != 'out_of_stock']
# market crossed-out price for OUTLET items whose price does not go down (01-11b/tachados-extra.csv, copied next to the data)
if os.path.exists('tachados-extra.csv'):
    TX = {l.split(';')[0].strip(): float(l.split(';')[4].replace(',', '.')) for l in open('tachados-extra.csv', encoding='utf-8-sig').read().splitlines()[1:] if l.strip()}
    for p in products:
        if str(p['art']) in TX and not p.get('compareAt'): p['compareAt'] = TX[str(p['art'])]
def two_prices(p): return bool(p.get('compareAt')) and isinstance(p.get('price'), (int, float)) and p['compareAt'] > p['price']
import re
fams = {}
ordered = sorted(products, key=lambda p: (p.get('secpage') or 999, p.get('ord') or [999, 999, 999]))
for p in ordered:
    if p.get('outlet') or str(p.get('category')).upper() == 'OUTLET': continue
    if str(p.get('category')).upper() == 'SIM CARDS': continue   # Madico 31/10: the SIM poster (page 5) is enough
    fam =str(p.get('category') or 'OTHER').strip().upper(); sub = str(p.get('subfamily') or '').strip().upper() or fam
    if re.search(r'SEAMAN', str(p.get('name', '')).upper()): fam = "THE SEAMAN'S SHOP"   # our own brand: always together, first
    if fam == "THE SEAMAN'S SHOP": sub = "THE SEAMAN'S SHOP"   # our own brand: one group, whatever the type
    fams.setdefault(fam, {}).setdefault(sub, []).append(p)
# OUTLET: same families and order as the main catalog (watches with watches, perfumes with perfumes…), so nothing looks loose.
WATCHES = ('CASIO', 'SWISS MILITARY', 'SEIKO, CITIZEN, FOSSIL')
aj_home = {}
for fam, subs in fams.items():
    for sub, items in subs.items(): aj_home.setdefault(sub, {}); aj_home[sub][fam] = aj_home[sub].get(fam, 0) + len(items)
aj_home = {k: max(v, key=v.get) for k, v in aj_home.items()}
RULES = [(r'SMARTWATCH|SMART ?RING|SMART ?BAND|GALAXY WATCH|STRAP', 'SMARTWATCH'), (r'\bWATCH\b|EDIFICE|G-SHOCK|SEIKO|CITIZEN|FOSSIL|BENYAR', 'WATCHES'),
         (r'VAPE|VAPORESSO|\bSMOK\b|COIL|PUFF|RESISTOR|E-LIQUID|OXVA|VOOPOO|CARTRIDGE|POD\b', 'VAPE AREA'), (r'\bEDP\b|\bEDT\b|PERFUME|PARFUM|VAPO\b|VICTORIA SECRET', 'PERFUMES'),
         (r'SUNGLASS|GLASSES', 'SUNGLASSES'), (r'\bHDD\b|\bSSD\b|HARD DRIVE', 'HARDDRIVE'), (r'\bUSB\b(?!-C)|MEMORY CARD|MICRO ?SD|KINGSTON|SANDISK', 'MEMORY'),
         (r'CABLE|CHARGER|USB-C|ETHERNET|MOUSE|LAPTOP SLEEVE|TABLET|MEDIAPAD|\bTAB\b|CASE FOR|TEMPERED GLASS|ANTIVIRUS|PANDA DOME', 'GADGET'),
         (r'FISH|LURE|HOOK', 'FISHING'), (r'BASKETBALL|\bBALL\b|FITNESS|ELBOW|JUMPING|DRI-FIT|NBA', 'SPORTS EQUIPMENT'), (r'ZIPPO|LIGHTER|RIZLA', 'SOUVENIRS'),
         (r'WALKIE|WIFI PLUG', 'GADGET')]
SOUV_ORDER = ["MAGNETS", "KEYCHAINS", "CAPS", "T-SHIRTS", "MUGS", "FANS", "METAL CASES", "PHOTO FRAMES", "ROSARIES", "SOCKS"]
# Madico 01/11: inside SOUVENIRS, one block per type taken from the name (all T-shirts together, all metal cases together…),
# whatever SUBFAMILIA says. Names without a known type («SOUVENIR …») keep their group.
SOUV_TYPE = [('T-SHIRT', 'T-SHIRTS'), ('METAL CASE', 'METAL CASES'), ('PHOTO FRAME', 'PHOTO FRAMES'), ('MAGNET', 'MAGNETS'), ('KEYCHAIN', 'KEYCHAINS'),
             ('CAP', 'CAPS'), ('MUG', 'MUGS'), ('FAN', 'FANS'), ('ROSARY', 'ROSARIES'), ('SOCKS', 'SOCKS')]
if "SOUVENIRS" in fams:
    regroup = {}
    for sub, items in fams["SOUVENIRS"].items():
        for p in items:
            n = str(p.get('name', '')).upper()
            key = next((g for t, g in SOUV_TYPE if n == t or n.startswith(t + ' ')), sub)
            regroup.setdefault(key, []).append(p)
    fams["SOUVENIRS"] = regroup
if "SOUVENIRS" in fams: fams["SOUVENIRS"] = dict(sorted(fams["SOUVENIRS"].items(), key=lambda kv: SOUV_ORDER.index(kv[0]) if kv[0] in SOUV_ORDER else 99))
TSS = "THE SEAMAN'S SHOP"
if TSS in fams: fams = {TSS: fams[TSS], **{k: v for k, v in fams.items() if k != TSS}}
FAMORDER = list(fams.keys())
def outlet_home(p):
    n = str(p.get('name', '')).upper()
    for rx, fam in RULES:
        if re.search(rx, n): return fam
    return aj_home.get(str(p.get('subfamily') or '').upper(), 'OTHERS')
def fam_rank(home):
    if home == 'WATCHES': home = 'CASIO'
    return FAMORDER.index(home) if home in FAMORDER else 999
outlet = [p for p in ordered if p.get('outlet') or str(p.get('category')).upper() == 'OUTLET']
OUTLET_HOME = {}
LABEL_HOME = {'OTHER CAPS & HATS': 'NEW ERA CAPS', 'JACKETS': 'T-SHIRTS', 'JEANS & TROUSERS': 'JOGGERS AND SHORTS', 'BABY': 'NEW ERA - NIKE KIDS', 'TOOLS': 'MORPILOT/ GRIATUS', 'HOUSEHOLD & CLEANING': 'PERSONAL CARE', 'NETWORK & WIFI': 'HARDDRIVE', 'BATTERIES': 'POWERBANK', 'TV & PROJECTORS': 'CAMERAS', 'ALARM CLOCKS & RADIOS': 'AUDIO SPEAKERS', 'TABLETS': 'MOBILEPHONES', 'LIGHTERS & SMOKING': 'SOUVENIRS', 'WATCHES': 'CASIO'}
def outlet_rank(p):
    g = p.get('outletGroup')
    if g:
        h = LABEL_HOME.get(g, g.split(' · ')[0])
        if h in FAMORDER: return FAMORDER.index(h)
    return fam_rank(outlet_home(p))
NOT_OUTLET = []
for p in sorted(outlet, key=outlet_rank):
    home = outlet_home(p); OUTLET_HOME[str(p['art'])] = home
    # Madico 31/10: every OUTLET item shows two prices. Without a crossed-out price it goes back to its own section.
    h = 'CASIO' if home == 'WATCHES' else home
    if not two_prices(p) and h in fams:
        subs = fams[h]; tgt = subs.get(str(p.get('subfamily') or '').upper()) or list(subs.values())[-1]
        p['outlet'] = False; tgt.append(p); NOT_OUTLET.append(str(p['art'])); continue
    label = 'WATCHES' if home in WATCHES or home == 'WATCHES' else home
    if p.get('souvenirType'): label = 'SOUVENIRS · ' + str(p.get('subfamily')).upper()
    if p.get('outletGroup'): label = p['outletGroup']
    fams.setdefault('OUTLET', {}).setdefault(label, []).append(p)
json.dump(OUTLET_HOME, open('outlet-home.json', 'w'))
def label_key(lb):
    h = LABEL_HOME.get(lb, lb.split(' · ')[0])
    if h == 'WATCHES': h = 'CASIO'
    t = lb.split(' · ')[1] if ' · ' in lb else ''
    return (FAMORDER.index(h) if h in FAMORDER else 998, SOUV_ORDER.index(t) if t in SOUV_ORDER else 99)
if 'OUTLET' in fams: fams['OUTLET'] = dict(sorted(fams['OUTLET'].items(), key=lambda kv: label_key(kv[0])))
# Madico 30/10: inside each group, dearest first (guitars before strings). Small groups (<= 4) join their neighbour
# so they do not leave half-empty rows in the middle of a page.
SMALL = 4
def join_names(names):
    out, last = [], None
    for n in names:
        pre, rest = n.split(' · ', 1) if ' · ' in n else (None, n)
        out.append(rest if pre and pre == last else n); last = pre
    return ' · '.join(out)
# Madico 01/11: inside each group, by TYPE (first words of the name: balls with balls, chargers with chargers),
# then brand and model (the rest of the name, A-Z).
_tp0 = os.path.join(site, 'pdf', 'tipos.csv')
TYPES0 = sorted({l.split(';')[0].strip().upper() for l in open(_tp0, encoding='utf-8-sig') if l.strip()} if os.path.exists(_tp0) else set(), key=len, reverse=True)
def type_key(p):
    n = ' '.join(str(p.get('name', '')).upper().split())
    t = next((t for t in TYPES0 if n == t or n.startswith(t + ' ')), n.split(' ')[0] if n else '')
    return (t, n)
def merge_small(subs):
    out = []
    for sub, items in subs.items():
        if out and len(out[-1][0]) < 3 and (len(items) <= SMALL or len(out[-1][1]) <= SMALL): out[-1][0].append(sub); out[-1][1].extend(items)
        else: out.append([[sub], list(items)])
    return {join_names(n): sorted(it, key=type_key) for n, it in out}
fams = {f: merge_small(s) for f, s in fams.items()}

W, H = A4; M = 22; COLS, ROWS = 3, 4
ART = os.path.join(site, 'pdf', 'art'); HDR, FTR = os.path.join(ART, 'hdr.jpg'), os.path.join(ART, 'ftr.jpg')
HDR_O, FTR_O = os.path.join(ART, 'hdr-outlet.jpg'), os.path.join(ART, 'ftr-outlet.jpg')   # OUTLET pages: red header and footer
BW = W - 20
def hgt(f): s = Image.open(f).size; return BW * s[1] / s[0]
HH, FH = max(hgt(HDR), hgt(HDR_O)), max(hgt(FTR), hgt(FTR_O))   # same grid on blue and red pages
GX0, GY1, GY0 = M, H - 6 - HH - 16, 10 + FH + 12
SUBH = 17
CW, CH = (W - 2 * M) / COLS, (GY1 - GY0 - 2 * SUBH) / ROWS
PHOTO_PX = int(sys.argv[5]) if len(sys.argv) > 5 else 300
cache = {}
def photo(path):
    if not path: return None
    if path in cache: return cache[path]
    f = os.path.join(site, path)
    if not os.path.exists(f): cache[path] = None; return None
    im = Image.open(f).convert('RGBA'); bg = Image.new('RGB', im.size, 'white'); bg.paste(im, mask=im.split()[3])
    bg = trim(bg)
    bg.thumbnail((PHOTO_PX, PHOTO_PX)); b = io.BytesIO(); bg.save(b, 'JPEG', quality=62, optimize=True); b.seek(0)
    cache[path] = ImageReader(b); return cache[path]
def trim(im):
    from scipy import ndimage
    a = np.asarray(im).copy(); blk = a.max(2) < 12
    if blk.any():
        lab, n = ndimage.label(blk)
        for i, sl in enumerate(ndimage.find_objects(lab), 1):
            hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start; area = (lab[sl] == i).sum()
            if area > 400 and area > 0.9 * hh * ww:
                y0, y1, x0, x1 = max(0, sl[0].start - 3), sl[0].stop + 3, max(0, sl[1].start - 3), sl[1].stop + 3
                sub = a[y0:y1, x0:x1]; sub[sub.max(2) < 200] = 255
    m = a.min(2) < 240; ys, xs = np.where(m)
    if len(xs):
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max(); pad = int(0.02 * max(x1 - x0, y1 - y0))
        a = a[max(0, y0 - pad):y1 + pad + 1, max(0, x0 - pad):x1 + pad + 1]
    return Image.fromarray(a)
def money(v): return '$' + (('%d' % v) if float(v).is_integer() else ('%.2f' % v))
def fit(c, text, font, size, width):
    while size > 5 and c.stringWidth(text, font, size) > width: size -= 0.3
    if c.stringWidth(text, font, size) > width:
        while text and c.stringWidth(text + '…', font, size) > width: text = text[:-1]
        text += '…'
    return text, size
def wrap2(c, text, font, size, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if c.stringWidth(t, font, size) <= width: cur = t
        else:
            lines.append(cur); cur = w
            if len(lines) == 2: break
    if len(lines) < 2 and cur: lines.append(cur)
    if len(lines) == 2 and ' '.join(lines) != ' '.join(words[:len(' '.join(lines).split())]) or len(' '.join(lines).split()) < len(words):
        lines[-1] = fit(c, lines[-1] + ' …', font, size, width)[0]
    return lines[:2]
# Product TYPE at the start of the name (Compras list, e.g. «WATCH CASIO …», «POWER BANK …»): the cell shows the name without it; the group strip already says the type.
_tp = os.path.join(site, 'pdf', 'tipos.csv')
TYPES = sorted({l.split(';')[0].strip().upper() for l in open(_tp, encoding='utf-8-sig') if l.strip()} if os.path.exists(_tp) else set(), key=len, reverse=True)
def strip_type(n, strip=''):
    # only when the group title already says the type (WATCH under ... WATCHES, CAP under ... CAPS), so nothing is lost
    u, st = n.upper(), str(strip).upper()
    for t in TYPES:
        if u.startswith(t + ' ') and len(n) > len(t) + 3 and re.search(r'\b' + re.escape(t.split()[-1].rstrip('S')) + r'(E?S)?\b', st): return n[len(t) + 1:].strip()
    return n
# Madico 31/10: the brand under the name, in strong black. ARTICULOS has no brand column yet: it comes from the name
# (TYPE + BRAND + MODEL), and only words that are the brand of 2+ products count, so «VALENCIA» or «BLACK» never show.
MULTI = ["THE SEAMAN'S SHOP", 'AMERICAN TOURISTER', 'SWISS MILITARY', 'NEW ERA', 'OPTIMUM NUTRITION', 'AMERICAN NUTRITION', 'FRIT RAVICH',
         'ANTONIO BANDERAS', 'CALVIN KLEIN', 'HUGO BOSS', 'PACO RABANNE', 'CAROLINA HERRERA', 'JIMMY CHOO', 'RED BULL', "DE'LONGHI",
         'OLD SPICE', 'UNDER ARMOUR', 'THE NORTH FACE', 'LEE COOPER', 'IRON MOUNTAIN', 'JUST JUICE', 'INSTA PUFF', 'TP LINK', 'TP-LINK', 'SHOE CLINIC',
         'MADE IN SPAIN', 'AMERICAN EAGLE', 'ARMAND BASI', 'BEVERLY HILLS', 'POLO RALPH LAUREN', 'RALPH LAUREN', 'VICTORIA SECRET', 'DOLCE & GABBANA',
         'GIORGIO ARMANI', 'JEAN PAUL GAULTIER', 'YVES SAINT LAURENT', 'MAX FACTOR', 'GARNIER', 'G-SHOCK', 'ELIZABETH ARDEN', 'GUY LAROCHE',
         'HEALTHY FUSION', 'INSTITUTO ESPAÑOL', 'HENO DE PRAVIA', 'IRON MAXX', '3 SWORDS GERMANY', 'NEW BEE', 'WD-40', 'RIZLA+', "'47", 'VALENCIA CF',
         'EA SPORTS', 'LA ROCHE-POSAY', 'MARTIN SMITH']
NOBRAND = {'VALENCIA', 'SPAIN', 'BARCELONA', 'MADRID', 'SEVILLA', 'CORDOBA', 'SOUVENIR', 'WHITE', 'BLACK', 'BLUE', 'RED', 'GREY', 'GREEN', 'PINK', 'MINI', 'SET', 'PACK',
           'KIDS', 'MEN', 'WOMEN', 'MAN', 'WOMAN', 'CLASSIC', 'ORIGINAL', 'SPECIAL', 'ORDER', 'OUTLET', 'NEW', 'BIG', 'SMALL', 'PREMIUM', 'WIRELESS', 'USB', 'LED', 'THE',
           'CORK', 'BULL', 'BAMBOO', 'ENERGY', 'FILM', 'ACCESSORY', 'LA', 'FLOR', 'CLEAN', 'NIC', 'ESS', 'ORIENTAL', 'MINI', 'PORTABLE', 'WORK', 'PHONE', 'PLATE'}
def brand_guess(n):
    u = ' '.join(str(n).upper().replace('’', "'").split())
    for t in TYPES:
        if u.startswith(t + ' '): u = u[len(t) + 1:]; break
    for b in sorted(MULTI, key=len, reverse=True):
        if u.startswith(b + ' ') or u == b: return b
    w = u.split(' ')[0] if u else ''
    if w in ('PS5', 'PS4'): return 'PLAYSTATION'   # games: the console is the brand
    return w if re.fullmatch(r"[A-Z0-9][A-Z0-9&'\-\.\+]{1,}", w or '') and not w.isdigit() and w not in NOBRAND else ''
_bc = {}
for _p in products: _b = brand_guess(_p.get('name', '')); _bc[_b] = _bc.get(_b, 0) + 1 if _b else 0
def brand(p):
    if p.get('souvenirType'): return ''
    b = brand_guess(p.get('name', ''))
    return b   # Madico 31/10: almost every product has a brand, also the ones we sell only once
def short(name, strip=''):
    n = ' '.join(str(name).split())   # Madico 01/11: the full name of ARTICULOS col B on every card (the type is not removed)
    return n if len(n) <= 60 else n[:58] + '…'

def header(c, fam, pageno, sub='', red=False):
    if red: c.drawImage(HDR_O, 10, H - 6 - hgt(HDR_O), BW, hgt(HDR_O))   # the red header already says OUTLET
    else:
        hh = hgt(HDR); c.drawImage(HDR, 10, H - 6 - hh, BW, hh)
        c.setFillColorRGB(1, 1, 1); fs = 22; t = fam.upper()
        while c.stringWidth(t, 'SansB', fs) > BW * 0.40 and fs > 11: fs -= 1
        c.setFont('SansB', fs); c.drawCentredString(10 + BW * 0.556, H - 6 - hh * (0.40 if sub else 0.43), t)
        if sub:
            st, ss = fit(c, sub.upper(), 'Sans', 8.5, BW * 0.40); ss = max(ss, 6.5); st = fit(c, st, 'Sans', ss, BW * 0.40)[0] if c.stringWidth(st, 'Sans', ss) > BW * 0.40 else st
            c.setFont('Sans', ss); c.drawCentredString(10 + BW * 0.556, H - 6 - hh * 0.40 - 13, st)
    c.setFillColorRGB(*(RED if red else NAVY)); c.setFont('Sans', 7)
    c.drawCentredString(W / 2, H - 6 - HH - 10, 'WhatsApp / phone +34 655 322 014 · catalog.theseamanshop.com · contact@theseamanshop.com · Updated daily · ' + DATE)
def footer(c, pageno, red=False):
    f = FTR_O if red else FTR; fh = hgt(f)
    c.drawImage(f, 10, 10, BW, fh)
    c.linkURL('https://wa.me/34655322014', (10, 10, 10 + BW * 0.22, 10 + fh), relative=0)
    c.linkURL('https://catalog.theseamanshop.com', (10 + BW * 0.23, 10, 10 + BW * 0.44, 10 + fh), relative=0)
    c.setFillColorRGB(*MUTED); c.setFont('Sans', 5.8)
    c.drawString(M, 3, 'Updated daily · Prices valid on ' + DATE + ' · USD (Valencia) · Tap a product to order it online · contact@theseamanshop.com')
    c.drawRightString(W - M, 3, 'Page %d' % pageno)

def badge(c, x, y, text, color):
    c.setFont('SansCB', 6.6); text, size = fit(c, text, 'SansCB', 6.6, CW - 22)
    w = c.stringWidth(text, 'SansCB', size) + 10
    c.setFillColorRGB(*color); c.roundRect(x, y, w, 12, 6, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1); c.setFont('SansCB', size); c.drawString(x + 5, y + 3.3, text)

def card(c, title, x, ytop):
    c.setFillColorRGB(0.92, 0.95, 0.98); c.roundRect(x + 3, ytop - CH + 3, CW - 6, CH - 6, 8, fill=1, stroke=0)
    parts = title.split(' · '); fam, rest = parts[0], parts[1:]
    c.setFillColorRGB(*MUTED); c.setFont('SansB', 9); c.drawCentredString(x + CW / 2, ytop - CH / 2 + 30, fit(c, fam, 'SansB', 9, CW - 24)[0])
    lines, cur = [], ''
    for w_ in ' · '.join(rest).split():
        t = (cur + ' ' + w_).strip()
        if c.stringWidth(t, 'SansB', 13) <= CW - 24: cur = t
        else: lines.append(cur); cur = w_
    if cur: lines.append(cur)
    c.setFillColorRGB(*NAVY); c.setFont('SansB', 13); y = ytop - CH / 2 + 8
    for ln in lines[:4]: c.drawCentredString(x + CW / 2, y, ln); y -= 16
    c.setFillColorRGB(*GREEN); c.setFont('SansB', 16); c.drawCentredString(x + CW / 2, y - 8, '→')
def cell(c, p, x, ytop):
    if p.get('_card'): return card(c, p['_card'], x, ytop)
    pad = 6; w = CW - 2 * pad
    c.linkURL('https://catalog.theseamanshop.com/#add=' + str(p['art']), (x + 3, ytop - CH + 3, x + CW - 3, ytop - 3), relative=0)
    c.setStrokeColorRGB(*LINE); c.setLineWidth(0.6); c.roundRect(x + 3, ytop - CH + 3, CW - 6, CH - 6, 8, fill=0, stroke=1)
    ph = CH - 66; img = photo(p.get('image'))
    if img:
        iw, ih = img.getSize(); s = min((w - 4) / iw, (ph - 6) / ih)
        c.drawImage(img, x + pad + (w - iw * s) / 2, ytop - pad - ph + (ph - ih * s) / 2, iw * s, ih * s, mask='auto')
    if p.get('outlet'): badge(c, x + pad + 2, ytop - pad - 13, 'OUTLET', RED)
    elif p.get('bundle'): badge(c, x + pad + 2, ytop - pad - 13, p['bundle'], GREEN)
    elif p.get('gift'): badge(c, x + pad + 2, ytop - pad - 13, 'FREE GIFT', ORANGE)
    y = ytop - pad - ph - 10
    c.setFillColorRGB(*NAVY)
    for line in wrap2(c, short(p['name'], p.get('_strip', '')), 'SansCB', 7.6, w):
        c.setFont('SansCB', 7.6); c.drawString(x + pad + 2, y, line); y -= 9
    b = brand(p)
    if b: c.setFillColorRGB(0, 0, 0); c.setFont('SansB', 7.4); c.drawString(x + pad + 2, ytop - CH + 33, fit(c, b, 'SansB', 7.4, w * 0.62)[0])
    c.setFillColorRGB(*MUTED); c.setFont('Sans', 6.5); c.drawString(x + pad + 2, ytop - CH + 24, 'ART. ' + str(p['art']))
    c.setFillColorRGB(*NAVY); c.setFont('SansB', 13); pr = money(p['price']) if isinstance(p.get('price'), (int, float)) else 'Ask price'
    c.drawRightString(x + CW - pad - 2, ytop - CH + 12, pr)
    if p.get('compareAt') and isinstance(p.get('price'), (int, float)) and p['compareAt'] > p['price']:
        pw = c.stringWidth(pr, 'SansB', 13); was = money(p['compareAt']); c.setFont('Sans', 8.5); c.setFillColorRGB(*MUTED)
        ww = c.stringWidth(was, 'Sans', 8.5); xw = x + CW - pad - 2 - pw - 6 - ww; c.drawString(xw, ytop - CH + 12, was)
        c.setStrokeColorRGB(*RED); c.setLineWidth(0.8); c.line(xw - 1, ytop - CH + 15, xw + ww + 1, ytop - CH + 15)

# grid pages
LEAD = 5  # cover + 4 posters of the current PDF (cover, index image, how to order, special orders, SIM)
grid = io.BytesIO(); c = canvas.Canvas(grid, pagesize=A4); c.setTitle("The Seaman's Shop · catalog (boceto)")
CAP = GY1 - GY0
def subtitle(c, name, y, red=False):
    c.setFillColorRGB(*((0.99, 0.90, 0.89) if red else (0.92, 0.95, 0.98))); c.roundRect(M, y - SUBH + 3, W - 2 * M, SUBH - 4, 5, fill=1, stroke=0)
    c.setFillColorRGB(*(RED if red else NAVY)); c.setFont('SansB', 8.5); c.drawString(M + 8, y - SUBH + 8, name)
# Madico 31/10: a red cover separates the OUTLET (the old one said «extra 25 % in October», which ends on 01/11)
F6 = os.path.join(ART, 'front-6.jpg')
def outlet_cover(c, pageno):
    c.setFillColorRGB(0.72, 0.04, 0.06); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.drawImage(HDR_O, 10, H - 6 - hgt(HDR_O), BW, hgt(HDR_O))
    y = H - 6 - hgt(HDR_O) - 120
    c.setFillColorRGB(1, 1, 1); c.setFont('SansB', 84); c.drawCentredString(W / 2, y, 'OUTLET')
    c.setFont('SansB', 20); c.drawCentredString(W / 2, y - 40, 'SAME QUALITY · LOWER PRICES')
    bx, by, bw, bh = M + 20, y - 250, W - 2 * M - 40, 170
    c.setFillColorRGB(1, 1, 1); c.roundRect(bx, by, bw, bh, 14, fill=1, stroke=0)
    c.setFillColorRGB(*NAVY); c.setFont('SansB', 15); c.drawCentredString(W / 2, by + bh - 32, 'Every OUTLET item shows two prices')
    cx1, cx2, py = W / 2 - 115, W / 2 + 115, by + 58
    c.setFillColorRGB(*MUTED); c.setFont('SansB', 34); c.drawCentredString(cx1, py, '$100'); tw = c.stringWidth('$100', 'SansB', 34)
    c.setStrokeColorRGB(*RED); c.setLineWidth(3); c.line(cx1 - tw / 2 - 4, py + 12, cx1 + tw / 2 + 4, py + 12)
    c.setFont('Sans', 11); c.drawCentredString(cx1, py - 26, 'Normal price')
    c.setFillColorRGB(*RED); c.setFont('SansB', 30); c.drawCentredString(W / 2, py + 2, '→')
    c.roundRect(cx2 - 62, py - 12, 124, 46, 10, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1); c.setFont('SansB', 34); c.drawCentredString(cx2, py, '$60')
    c.setFillColorRGB(*RED); c.setFont('SansB', 11); c.drawCentredString(cx2, py - 26, 'OUTLET price')
    c.setFillColorRGB(1, 1, 1); c.setFont('SansB', 13)
    for i, t in enumerate(['Limited stock · when it is gone, it is gone', "Original products · manufacturer's warranty", 'Order online or on WhatsApp · we deliver on board']):
        c.drawCentredString(W / 2, by - 40 - i * 24, t)
    im = Image.open(F6); s = im.size; strip = im.crop((0, int(s[1] * 0.705), s[0], int(s[1] * 0.762)))   # brand logos of the old cover
    b = io.BytesIO(); strip.convert('RGB').save(b, 'JPEG', quality=85); b.seek(0)
    c.drawImage(ImageReader(b), 0, 10 + hgt(FTR_O) + 30, W, W * strip.size[1] / strip.size[0])
    c.linkURL('https://catalog.theseamanshop.com', (0, 10 + hgt(FTR_O) + 30, W, H - 6 - hgt(HDR_O)), relative=0)
    footer(c, pageno, True)
def fam_blocks(fam, subs, prefix=False):
    out = []
    for sub, items in subs.items():
        out.append(('sub', (fam + ' · ' + sub) if prefix and sub != fam else sub, SUBH, fam))
        for k in range(0, len(items), COLS): out.append(('row', items[k:k + COLS], CH, fam))
    return out
def split_balanced(blocks):
    total = sum(bl[2] for bl in blocks); npages = max(1, math.ceil(total / CAP)); target = total / npages
    pages, cur, used = [], [], 0
    for i, bl in enumerate(blocks):
        h = bl[2]; last_page = len(pages) == npages - 1
        nxt = blocks[i + 1][2] if i + 1 < len(blocks) else 0
        fits = used + h + (nxt if bl[0] == 'sub' else 0) <= CAP
        if cur and (not fits or (not last_page and used + h / 2 > target)):
            pages.append(cur); cur, used = [], 0
        if not cur and bl[0] == 'row':   # a page that starts mid-subfamily repeats its title
            prev = next((x for x in reversed(blocks[:i]) if x[0] == 'sub'), None)
            if prev: cur.append(('sub', prev[1] + ' (cont.)', SUBH, prev[3])); used += SUBH
        cur.append(bl); used += h
    if cur: pages.append(cur)
    return pages
# Families flow one after another (no half-empty pages). Each subfamily has its own title strip; a family
# only starts at the top of a page when it is OUTLET. A title is never left alone at the bottom of a page.
# Groups flow cell by cell: when a group ends mid-row, the next one starts in the same row with a title card
# (Madico 30/10: no empty cells in the middle of a page). A group that starts a row gets the usual strip.
def pack():
    out, row = [], []
    def flush():
        if row: out.append(('row', list(row), CH, row[0].get('_fam'))); row.clear()
    for fam, subs in fams.items():
        for sub, items in subs.items():
            title = (fam + ' · ' + sub) if sub != fam else sub
            if not row or (fam == 'OUTLET' and row[-1].get('_fam') != 'OUTLET'):
                flush(); out.append(('sub', title, SUBH, fam))
            else:
                row.append({'_card': title, '_fam': fam, '_strip': title, 'art': '', 'name': ''})
                if len(row) == COLS: flush()
            for p in items:
                p['_strip'], p['_fam'] = title, fam; row.append(p)
                if len(row) == COLS: flush()
    flush(); return out
blocks = pack()
pages, cur, used, first = [], [], 0, {}
for i, bl in enumerate(blocks):
    h = bl[2]; nxt = blocks[i + 1][2] if i + 1 < len(blocks) else 0
    force = bl[0] == 'sub' and bl[3] == 'OUTLET' and cur and cur[-1][3] != 'OUTLET'
    if cur and (force or used + h + (nxt if bl[0] == 'sub' else 0) > CAP):
        pages.append(cur); cur, used = [], 0
    if not cur and bl[0] == 'row':
        if not bl[1][0].get('_card'): cur.append(('sub', bl[1][0]['_strip'] + ' (cont.)', SUBH, bl[3])); used += SUBH
    for f in ([bl[3]] if bl[0] == 'sub' else [x.get('_fam') for x in bl[1]]):
        if f not in first: first[f] = len(pages) + 1
    cur.append(bl); used += h
if cur: pages.append(cur)
OI = next((i for i, pg in enumerate(pages) if any(b[3] == 'OUTLET' for b in pg)), None)   # first OUTLET page: the red cover goes before it
def pno(n): return LEAD + 1 + n + (1 if OI is not None and n >= OI else 0)
first = {k: (v + 1 if OI is not None and v > OI + 1 else v) + LEAD for k, v in first.items()}   # OUTLET links go to the cover
_dump, _strip = [], ''
for _n, _pg in enumerate(pages):
    for _b in _pg:
        if _b[0] == 'sub': _strip = _b[1].replace(' (cont.)', '')
        else:
            for _p in _b[1]:
                if not _p.get('_card'): _dump.append([pno(_n), _p['_strip'], str(_p['art']), _p['name'], _p.get('image')])
json.dump(_dump, open('layout-dump.json', 'w', encoding='utf-8'), ensure_ascii=False)
# Same order for the web (Madico 01/11): family → group → TYPE → brand, exactly as printed. [art, family, group, page]
_order = []
for _n, _pg in enumerate(pages):
    for _b in _pg:
        if _b[0] != 'sub':
            for _p in _b[1]:
                if not _p.get('_card'):
                    _g = _p['_strip']; _f = _p.get('_fam') or _g
                    _order.append([str(_p['art']), _f, _g[len(_f) + 3:] if _g.startswith(_f + ' · ') else ('' if _g == _f else _g), pno(_n)])
json.dump({'version': DATE, 'order': _order}, open('catalog-order.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
for n, pg in enumerate(pages):
    if n == OI: outlet_cover(c, pno(n) - 1); c.showPage()
    pageno = pno(n); red = any(b[3] == 'OUTLET' for b in pg)
    fams_here = []
    for bl in pg:
        for f in ([bl[3]] if bl[0] == 'sub' else [x.get('_fam') for x in bl[1]]):
            if f not in fams_here: fams_here.append(f)
    if len(fams_here) > 1: title, sub = fams_here[0].title(), ' · '.join(x.title() for x in fams_here[1:4])
    else:
        names = []
        for bl in pg:
            for x in ([bl[1]] if bl[0] == 'sub' else [q['_card'] for q in bl[1] if q.get('_card')]):
                x = x.replace(' (cont.)', ''); x = (x.split(' · ', 1)[1] if ' · ' in x else x).title()
                if x not in names: names.append(x)
        title, sub = fams_here[0].title(), (' · '.join(names[:3]) + (' …' if len(names) > 3 else '')) if names != [fams_here[0].title()] else ''
    header(c, title, pageno, sub, red); footer(c, pageno, red)
    y = GY1; cur_strip = ''
    for kind, val, h, fam in pg:
        if kind == 'sub': subtitle(c, val, y, fam == 'OUTLET'); cur_strip = val
        else:
            for j, p in enumerate(val): cell(c, p, GX0 + j * CW, y)
        y -= h
    c.showPage()
pageno = pno(len(pages))
c.save()
live = pymupdf.open(live_path); outdoc = pymupdf.open()
outdoc.insert_pdf(live, from_page=0, to_page=LEAD - 1)
outdoc.insert_pdf(pymupdf.open(stream=grid.getvalue(), filetype='pdf'))
def goto(page, rect, target_page):
    page.insert_link({'kind': pymupdf.LINK_GOTO, 'page': target_page - 1, 'from': rect})
def poster_box(img, bh=46):
    iw, ih = Image.open(img).size; sc = min(W / iw, (H - bh) / ih); dw, dh = iw * sc, ih * sc
    return (W - dw) / 2, bh + (H - bh - dh) / 2, dw, dh
def frac_rect(img, fx0, fy0, fx1, fy1):
    x0, y0, dw, dh = poster_box(img)   # reportlab coords (from bottom) -> pymupdf (from top)
    return pymupdf.Rect(x0 + fx0 * dw, H - (y0 + (1 - fy0) * dh), x0 + fx1 * dw, H - (y0 + (1 - fy1) * dh))
ALIAS = {'SAMSONITE': 'SAMSONITE & AMERICAN TOURISTER'}
def fam_page(name): return first.get(name.upper()) or first.get(ALIAS.get(name.upper(), ''))
for i in range(LEAD):
    pg = outdoc[i]
    for l in pg.get_links():
        if l['kind'] in (pymupdf.LINK_GOTO, pymupdf.LINK_NAMED): pg.delete_link(l)
G, GX = 1 / 930, 1 / 620
INDEX_ROWS = [(102, 180, 'AUDIO SPEAKERS'), (185, 262, 'SAMSONITE'), (267, 343, 'SWISS MILITARY'), (348, 422, 'PERFUMES'), (428, 500, 'VITAMINS & SUPPLEMENTS'), (505, 582, 'PERSONAL CARE'), (587, 660, 'VAPE AREA'), (665, 738, 'SUPERMARKET')]
img2 = os.path.join(ART, 'front-2.jpg'); links_done = []
for y0, y1, fam in INDEX_ROWS:
    tp = fam_page(fam)
    if tp: goto(outdoc[1], frac_rect(img2, 12 * GX, y0 * G, 605 * GX, y1 * G), tp); links_done.append((fam, tp))
img1 = os.path.join(ART, 'front-1.jpg')
for x0, y0, x1, y1, fam in [(255, 390, 367, 540, 'SWISS MILITARY'), (370, 390, 492, 540, 'MOBILEPHONES'), (495, 390, 615, 540, 'AUDIO SPEAKERS'), (255, 540, 367, 648, 'LAPTOP'), (370, 540, 492, 648, 'PERFUMES'), (495, 540, 615, 648, 'T-SHIRTS NEW ERA'), (255, 648, 367, 775, 'SAMSONITE'), (370, 648, 492, 775, 'PERSONAL CARE'), (495, 648, 615, 775, 'SIM CARDS')]:
    tp = fam_page(fam) or (5 if fam == 'SIM CARDS' else None)   # SIM: the poster page
    if tp: goto(outdoc[0], frac_rect(img1, x0 / 620, y0 / 877, x1 / 620, y1 / 877), tp)
# the «Sections / All sections / How to order» buttons go to the index image (page 2)
for i, n, idx in [(0, 3, 1), (1, 1, 0), (2, 2, 0)]:
    bw = (W - 2 * M - (n - 1) * 8) / n; bx = M + idx * (bw + 8)
    goto(outdoc[i], pymupdf.Rect(bx, H - 38, bx + bw, H - 14), 2)
index = [(f, p, sum(len(v) for v in fams[f].values())) for f, p in first.items()]
outdoc.save(out, garbage=4, deflate=True)
print(json.dumps({'pages': len(outdoc), 'mb': round(os.path.getsize(out) / 1e6, 1), 'grid_pages': pageno - LEAD - 1, 'index_links': links_done, 'not_outlet': NOT_OUTLET, 'outlet_cover': pno(OI) - 1 if OI is not None else None,'families': [(f, p) for f, p, n in index]}, ensure_ascii=False))
