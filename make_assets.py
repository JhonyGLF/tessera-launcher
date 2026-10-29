"""Gera os assets do projeto:
- ícone (um "T" de ladrilhos arredondados, arte lisa)
- textura de pedra escura do fundo da janela
- logo "TESSERA" em pedra 3D (no estilo do logo do Minecraft)
- ícones de instância (assets/icones/), ícones de loader (assets/loaders/),
  banner da página inicial (assets/banner.png) e ilustração de estado vazio (assets/vazio.png)
Uso opcional: python make_assets.py  (precisa do Pillow e do numpy)"""
import os
import random
import numpy as np
from PIL import Image

os.chdir(os.path.dirname(os.path.abspath(__file__)))   # caminhos relativos ao projeto

# ---------- Paletas ----------
GRAMA = ["#5fa83a", "#4f9330", "#6fbf45", "#58a033"]
TERRA = ["#8b5a2b", "#7a4c24", "#9a6a38", "#6b4220", "#835326"]
CONTORNO = "#14100c"
BRANCO = "#f4f4f4"
SOMBRA = "#3a2a1a"

def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)

def ruido(tile, paleta, rng, caixa):
    x1, y1, x2, y2 = caixa
    for y in range(y1, y2):
        for x in range(x1, x2):
            tile.putpixel((x, y), hex2rgb(rng.choice(paleta)))

# ---------- Textura de ardósia com sculk (fundo da janela) ----------
ARDOSIA = ["#2b2b33", "#26262d", "#31313a", "#222228", "#2e2e36", "#1d1d22"]
SCULK = ["#0f6e74", "#1aa3a3", "#0b4f57"]
rng = random.Random(7)
fundo = Image.new("RGBA", (32, 32))
ruido(fundo, ARDOSIA, rng, (0, 0, 32, 32))
for y in range(0, 32, 8):                 # veios horizontais, como na ardósia
    for x in range(32):
        if rng.random() < 0.55:
            fundo.putpixel((x, (y + rng.choice((0, 1))) % 32), hex2rgb("#18181d"))
for _ in range(9):                        # pontinhos de sculk brilhando
    fundo.putpixel((rng.randrange(32), rng.randrange(32)), hex2rgb(rng.choice(SCULK)))
fundo.save("assets/tile-deepslate.png")

# ---------- Ícone: "T" de ladrilhos arredondados (tessera = ladrilho de mosaico), arte lisa ----------
# Desenhado em 1024 px com antisserrilhado e reduzido para os tamanhos do Windows.
from PIL import ImageDraw, ImageFilter, ImageChops
LI = 1024

def _rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def _degrade(cores, angulo, tam):
    w, h = tam
    y, x = np.mgrid[0:h, 0:w].astype(float)
    a = np.deg2rad(angulo)
    t = x * np.cos(a) + y * np.sin(a)
    t = (t - t.min()) / max(1e-9, t.max() - t.min())
    rgb = np.zeros((h, w, 3))
    for c in range(3):
        rgb[..., c] = np.interp(t, np.linspace(0, 1, len(cores)), [_rgb(k)[c] for k in cores])
    return Image.fromarray(rgb.astype(np.uint8), "RGB").convert("RGBA")

def _arredondado(caixa, raio, esc=4):
    m = Image.new("L", (LI * esc, LI * esc), 0)
    x0, y0, x1, y1 = caixa
    ImageDraw.Draw(m).rounded_rectangle([x0 * esc, y0 * esc, x1 * esc - 1, y1 * esc - 1], radius=raio * esc, fill=255)
    return m.resize((LI, LI), Image.LANCZOS)

def _pintar(base, camada, mascara):
    camada = camada.copy()
    camada.putalpha(ImageChops.multiply(camada.getchannel("A"), mascara))
    return Image.alpha_composite(base, camada)

def _cor(h):
    return Image.new("RGBA", (LI, LI), _rgb(h) + (255,))

# fundo: quadrado arredondado azul-ardósia, aro claro sutil e luz no topo
fundo_m = _arredondado((40, 40, LI - 40, LI - 40), 220)
icone = _pintar(Image.new("RGBA", (LI, LI), (0, 0, 0, 0)), _degrade(["#20263a", "#121521", "#0b0d15"], 90, (LI, LI)), fundo_m)
aro = ImageChops.subtract(fundo_m, _arredondado((54, 54, LI - 54, LI - 54), 206))
icone = _pintar(icone, _cor("#8fd9ff"), aro.point(lambda v: v * 90 // 255))
luz_topo = _degrade(["#2a2a2a", "#000000"], 90, (LI, LI)).convert("L")
icone = _pintar(icone, _cor("#ffffff"), ImageChops.multiply(fundo_m, luz_topo).point(lambda v: v * 40 // 255))

# o "T": 3 ladrilhos na barra e 2 na haste, ciano (sculk), cada um com degradê e reflexo
LADRILHOS = [
    (232, 250, 412, 430, ["#9af7f4", "#2fd3d0", "#147d7b"]),
    (422, 250, 602, 430, ["#b5fffc", "#3fe0dc", "#178f8c"]),
    (612, 250, 792, 430, ["#9af7f4", "#2fd3d0", "#147d7b"]),
    (422, 440, 602, 620, ["#86eeea", "#26c2bf", "#106f6d"]),
    (422, 630, 602, 810, ["#74e3df", "#1fb0ad", "#0c6260"]),
]
todos = Image.new("L", (LI, LI), 0)
for x0, y0, x1, y1, _ in LADRILHOS:
    todos = ImageChops.lighter(todos, _arredondado((x0, y0, x1, y1), 34))
aura = todos.filter(ImageFilter.GaussianBlur(60)).point(lambda v: min(255, int(v * 1.3)))
camada = Image.new("RGBA", (LI, LI), _rgb("#2fd3d0") + (0,)); camada.putalpha(aura)
icone = Image.alpha_composite(icone, camada)
sombra_t = Image.new("L", (LI, LI), 0); sombra_t.paste(todos, (0, 18))
sombra_t = sombra_t.filter(ImageFilter.GaussianBlur(20)).point(lambda v: v * 170 // 255)
camada = Image.new("RGBA", (LI, LI), (0, 0, 0, 0)); camada.putalpha(sombra_t)
icone = Image.alpha_composite(icone, camada)
for x0, y0, x1, y1, cores in LADRILHOS:
    pedaco = Image.new("RGBA", (LI, LI), (0, 0, 0, 0))
    pedaco.paste(_degrade(cores, 115, (x1 - x0, y1 - y0)), (x0, y0))
    icone = _pintar(icone, pedaco, _arredondado((x0, y0, x1, y1), 34))
    reflexo = _arredondado((x0 + 10, y0 + 10, x1 - 10, y0 + (y1 - y0) // 2), 28)
    icone = _pintar(icone, _cor("#ffffff"), reflexo.point(lambda v: v * 45 // 255))

icone.resize((512, 512), Image.LANCZOS).save("assets/icon.png")
tamanhos = [256, 128, 64, 48, 32, 16]
imgs = [icone.resize((t, t), Image.LANCZOS) for t in tamanhos]
imgs[0].save("assets/icon.ico", format="ICO", sizes=[(t, t) for t in tamanhos], append_images=imgs[1:])

# ---------- Logo "TESSERA" em pedra 3D ----------
# Mesma proporção do logo original do jogo (1937x333).
LOGO_L, LOGO_A = 1937, 333
SS = 2                                    # desenha em 2x e reduz (bordas suaves)
GLIFOS = {
    "J": ["...##", "...##", "...##", "##.##", "#####"],
    "G": ["#####", "##...", "##.##", "##..#", "#####"],
    "C": ["#####", "##...", "##...", "##...", "#####"],
    "L": ["##...", "##...", "##...", "##...", "#####"],
    "I": ["##", "##", "##", "##", "##"],
    "E": ["#####", "##...", "####.", "##...", "#####"],
    "N": ["##...##", "###..##", "####.##", "##.####", "##..###"],
    "T": ["######", "..##..", "..##..", "..##..", "..##.."],
    "S": ["#####", "##...", "#####", "...##", "#####"],
    "R": ["####.", "##.##", "####.", "##.##", "##.##"],
    "A": ["#####", "##.##", "#####", "##.##", "##.##"],
}
TEXTO = "TESSERA"
GAP, ESPACO, FUNDO_3D, CONTORNO_L = 0.7, 1.6, 1.45, 0.38   # em células

def dilata(m, r):
    """Dilatação quadrada (contorno em bloco), separável e rápida."""
    for eixo in (0, 1):
        c = np.cumsum(np.pad(m, [(r + 1, r) if e == eixo else (0, 0) for e in (0, 1)]),
                      axis=eixo, dtype=np.int32)
        n = m.shape[eixo]
        sl = lambda a, b: tuple(slice(a, b) if e == eixo else slice(None) for e in (0, 1))
        m = (c[sl(2 * r + 1, 2 * r + 1 + n)] - c[sl(0, n)]) > 0
    return m

def desloca(m, dx, dy):
    out = np.zeros_like(m)
    h, w = m.shape
    out[max(dy, 0):h + min(dy, 0), max(dx, 0):w + min(dx, 0)] = \
        m[max(-dy, 0):h - max(dy, 0), max(-dx, 0):w - max(dx, 0)]
    return out

def gradiente(a, b, h):
    a, b = np.array(hex2rgb(a)[:3], float), np.array(hex2rgb(b)[:3], float)
    t = np.linspace(0, 1, h)[:, None]
    return a + (b - a) * t

larg_cel = sum(len(GLIFOS[c][0]) if c != " " else ESPACO for c in TEXTO) \
    + GAP * sum(1 for a, b in zip(TEXTO, TEXTO[1:]) if " " not in (a, b))
W, H = LOGO_L * SS, LOGO_A * SS
cel = int(min(W / (larg_cel + 2 * CONTORNO_L + 1.4), H / (5 + FUNDO_3D + 2 * CONTORNO_L)))
prof, borda = int(cel * FUNDO_3D), int(cel * CONTORNO_L)
x0 = (W - int(larg_cel * cel)) // 2
y0 = (H - (5 * cel + prof)) // 2

rng = random.Random(1937)
rgb = np.zeros((H, W, 3), float)
preto = np.zeros((H, W), bool)
lados = np.zeros((H, W), bool)
dist_lado = np.full((H, W), np.inf)      # quão abaixo da face está cada pixel da lateral
faces = np.zeros((H, W), bool)
sulcos_esc = np.zeros((H, W), bool)
sulcos_luz = np.zeros((H, W), bool)

x = x0
for i, ch in enumerate(TEXTO):
    if ch == " ":
        x += int(ESPACO * cel)
        continue
    g = GLIFOS[ch]
    face = np.zeros((H, W), bool)
    for gy, linha in enumerate(g):
        for gx, c in enumerate(linha):
            if c == "#":
                face[y0 + gy * cel:y0 + (gy + 1) * cel, x + gx * cel:x + (gx + 1) * cel] = True
    larg = len(g[0]) * cel
    # perspectiva: a lateral de baixo "foge" para o centro do logo
    fuga = ((W / 2) - (x + larg / 2)) / (W / 2) * 0.22
    corpo = face.copy()
    for t in range(1, prof + 1):
        passo = desloca(face, int(round(t * fuga)), t)
        novo = passo & ~corpo
        dist_lado[novo] = np.minimum(dist_lado[novo], t)
        corpo |= passo
    preto |= dilata(corpo, borda)
    lados |= corpo & ~face
    faces |= face

    # sulcos gravados na pedra (linha escura + brilho logo abaixo/à direita)
    miolo = ~dilata(~face, int(cel * 0.22))
    ys, xs = np.nonzero(miolo)
    esp = max(3, int(cel * 0.07))
    for _ in range(max(2, len(g[0]) // 2 + 1)):
        k = rng.randrange(len(ys))
        sy, sx = ys[k], xs[k]
        comp_h = int(cel * rng.uniform(0.8, 1.8)) * rng.choice((-1, 1))
        comp_v = int(cel * rng.uniform(0.4, 1.1)) * rng.choice((-1, 1))
        ex = sx + comp_h
        for (a, b, c_, d) in ((sy, min(sx, ex), sy + esp, max(sx, ex)),
                              (min(sy, sy + comp_v), ex, max(sy, sy + comp_v), ex + esp)):
            m = np.zeros((H, W), bool)
            m[max(a, 0):max(c_, 0), max(b, 0):max(d, 0)] = True
            sulcos_esc |= m & miolo
            sulcos_luz |= desloca(m, esp, esp) & miolo & ~m
    x += larg + int(GAP * cel)

topo, base = y0, y0 + 5 * cel
rgb[:] = 0
t_lado = np.clip(dist_lado[lados] / prof, 0, 1)[:, None]
claro, escuro = np.array(hex2rgb("#7a726e")[:3], float), np.array(hex2rgb("#3a3634")[:3], float)
rgb[lados] = claro + (escuro - claro) * t_lado
face_cor = np.zeros((H, 3))
face_cor[topo:base] = gradiente("#ddd3ce", "#a59c97", base - topo)
bloco = cel // 5
ruido_px = np.array([[rng.uniform(-4, 4) for _ in range(W // bloco + 1)]
                     for _ in range(H // bloco + 1)])
ruido_px = np.kron(ruido_px, np.ones((bloco, bloco)))[:H, :W]
pedra = np.broadcast_to(face_cor[:, None, :], (H, W, 3)) + ruido_px[..., None]
rgb[faces] = pedra[faces]
rgb[sulcos_luz] = np.clip(rgb[sulcos_luz] + 28, 0, 255)
rgb[sulcos_esc] = rgb[sulcos_esc] * 0.62
# chanfro: brilho no topo da face, sombra no pé
chanfro = max(3, int(cel * 0.06))
luz_topo = faces & ~desloca(faces, 0, chanfro)
rgb[luz_topo] = np.clip(rgb[luz_topo] + 22, 0, 255)
pe = faces & ~desloca(faces, 0, -chanfro)
rgb[pe] = rgb[pe] * 0.55

alfa = (preto | lados | faces).astype(np.uint8) * 255
logo = Image.fromarray(np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), alfa]), "RGBA")
logo = logo.resize((LOGO_L, LOGO_A), Image.LANCZOS)
logo.save("assets/logo.png")


# =====================================================================
# Pixel art da interface: ícones de instância, loaders, banner e vazio
# =====================================================================
TRANSP = (0, 0, 0, 0)

def cor(h, a=255):
    return hex2rgb(h)[:3] + (a,)

def mistura(c1, c2, t):
    """Mistura duas cores RGBA (t=0 → c1, t=1 → c2)."""
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c1, c2))

def clareia(c, f):
    """f > 0 clareia, f < 0 escurece (fração)."""
    alvo = (255, 255, 255) if f > 0 else (0, 0, 0)
    return tuple(int(round(v + (a - v) * abs(f))) for v, a in zip(c[:3], alvo)) + (c[3],)

def desenho(linhas, paleta, tam=16):
    """Monta um sprite a partir de linhas ASCII ('.' = transparente)."""
    img = Image.new("RGBA", (tam, tam), TRANSP)
    assert len(linhas) <= tam, "desenho alto demais"
    for y, linha in enumerate(linhas):
        assert len(linha) == tam, f"linha {y} com {len(linha)} colunas: {linha!r}"
        for x, c in enumerate(linha):
            if c != ".":
                img.putpixel((x, y), cor(paleta[c]))
    return img

def contorna(img, cor_c=CONTORNO, diagonais=False):
    """Contorno de 1 pixel em volta das partes opacas."""
    w, h = img.size
    px = img.load()
    viz = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    if diagonais:
        viz += [(1, 1), (1, -1), (-1, 1), (-1, -1)]
    alvo = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] == 0 and any(
        0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] > 0 for dx, dy in viz)]
    for p in alvo:
        px[p] = cor(cor_c)
    return img

def com_sombra(img, dx=1, dy=1, alfa=70):
    """Sombra pixel deslocada atrás do sprite (só onde for transparente)."""
    w, h = img.size
    out = Image.new("RGBA", (w, h), TRANSP)
    src = img.load()
    o = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y][3] and 0 <= x + dx < w and 0 <= y + dy < h:
                o[x + dx, y + dy] = (0, 0, 0, alfa)
    out.alpha_composite(img)
    return out

def amplia(img, fator):
    return img.resize((img.width * fator, img.height * fator), Image.NEAREST)

def textura(paleta, rng, tam=16):
    img = Image.new("RGBA", (tam, tam))
    ruido(img, paleta, rng, (0, 0, tam, tam))
    return img

def bloco(img):
    """Acabamento de bloco: chanfro claro em cima/esquerda, escuro embaixo/direita e contorno."""
    px = img.load()
    for i in range(1, 15):
        px[i, 1] = clareia(px[i, 1], 0.14)
        px[1, i] = clareia(px[1, i], 0.10)
        px[i, 14] = clareia(px[i, 14], -0.18)
        px[14, i] = clareia(px[14, i], -0.14)
    for i in range(16):
        for p in ((i, 0), (i, 15), (0, i), (15, i)):
            px[p] = cor(CONTORNO)
    return img

def manchas(img, rng, cores, n, tam=(1, 2)):
    """Pequenos aglomerados de pixels (pedrinhas, buracos, brilhos)."""
    px = img.load()
    for _ in range(n):
        x, y = rng.randrange(16), rng.randrange(16)
        c = cor(rng.choice(cores))
        for dx in range(rng.randint(*tam)):
            for dy in range(rng.randint(*tam)):
                if x + dx < 16 and y + dy < 16:
                    px[x + dx, y + dy] = c

# ---------- Blocos ----------
PEDRA = ["#8a8a8f", "#7d7d82", "#959599", "#727277", "#848489"]

def ic_grama(rng):
    img = textura(TERRA, rng)
    ruido(img, GRAMA, rng, (0, 0, 16, 5))
    for x in range(16):                  # franja de grama
        if rng.random() < 0.6:
            img.putpixel((x, 5), cor(rng.choice(GRAMA)))
        if rng.random() < 0.25:
            img.putpixel((x, 6), cor(rng.choice(GRAMA)))
    manchas(img, rng, ["#a67b4a", "#5e3a1b"], 4, (1, 1))
    for x in range(2, 14, 3):            # brilho na borda de cima da grama
        img.putpixel((x, 2), cor("#7fd24f"))
    return img

def ic_pedra(rng):
    img = textura(PEDRA, rng)
    manchas(img, rng, ["#626267", "#5a5a5f"], 7, (1, 2))
    manchas(img, rng, ["#a3a3a7"], 5, (1, 1))
    return img

def ic_terra(rng):
    img = textura(TERRA, rng)
    manchas(img, rng, ["#a67b4a", "#b08452"], 6, (1, 1))
    manchas(img, rng, ["#5e3a1b", "#563418"], 6, (1, 2))
    return img

def ic_madeira(rng):
    tons = ["#b8894f", "#ad8048", "#c29457"]
    img = Image.new("RGBA", (16, 16))
    px = img.load()
    for y in range(16):
        for x in range(16):
            px[x, y] = cor(rng.choice(tons))
    for fileira in range(4):             # tábuas de 4 px com emenda escura
        y0 = fileira * 4
        for x in range(16):
            px[x, y0 + 3] = cor("#6b4626")
            px[x, y0] = clareia(px[x, y0], 0.12)
        junta = 10 if fileira % 2 == 0 else 4
        for y in range(y0, y0 + 3):
            px[junta, y] = cor("#6b4626")
        for _ in range(2):               # veios da madeira
            vx, vy = rng.randrange(14), y0 + rng.randrange(1, 3)
            for dx in range(rng.randint(2, 4)):
                if vx + dx != junta and vx + dx < 16:
                    px[vx + dx, vy] = cor("#94673a")
        px[(junta + 3) % 16, y0 + 1] = cor("#5a3a1e")   # pregos
    return img

def ic_folhas(rng):
    img = textura(["#3f8a2a", "#4f9a33", "#367a24", "#5aa83a"], rng)
    manchas(img, rng, ["#1f4a14", "#24561a"], 11, (1, 2))
    manchas(img, rng, ["#7cc24f", "#8fd65a"], 7, (1, 1))
    px = img.load()
    for p in ((4, 5), (11, 9), (6, 12)):  # frutinhas
        px[p] = cor("#e04848")
    return img

def ic_areia(rng):
    img = textura(["#e3d39a", "#dccb8d", "#ebdca9", "#d4c283"], rng)
    manchas(img, rng, ["#bfa86a", "#c7b274"], 8, (1, 1))
    manchas(img, rng, ["#f6ebc0"], 6, (1, 1))
    return img

def ic_neve(rng):
    img = textura(TERRA, rng)
    neve = ["#f4f8ff", "#e6eef8", "#ffffff", "#dbe6f3"]
    ruido(img, neve, rng, (0, 0, 16, 6))
    alturas = [rng.choice((0, 1, 1, 2, 3)) for _ in range(16)]
    for x, a in enumerate(alturas):      # neve escorrendo
        for dy in range(a):
            img.putpixel((x, 6 + dy), cor(rng.choice(neve)))
    for x in range(16):
        img.putpixel((x, 6 + alturas[x]), cor("#c3d3e6"))   # sombra azulada sob a neve
    manchas(img, rng, ["#5e3a1b"], 4, (1, 1))
    return img

def ic_obsidiana(rng):
    img = textura(["#16111f", "#1c1530", "#100c18", "#211a38"], rng)
    px = img.load()
    for _ in range(6):                   # lascas roxas em diagonal
        x, y = rng.randrange(1, 13), rng.randrange(1, 13)
        for k in range(rng.randint(2, 3)):
            px[x + k, y + k] = cor("#3d2a66" if k else "#6a4aa8")
    manchas(img, rng, ["#8c6ad0"], 3, (1, 1))
    return img

def ic_lava(rng):
    img = Image.new("RGBA", (16, 16))
    px = img.load()
    fase = rng.uniform(0, 6.28)
    for y in range(16):
        for x in range(16):
            v = np.sin(x * 0.7 + fase) + np.sin(y * 0.9 + x * 0.3) + np.sin((x + y) * 0.45)
            v += rng.uniform(-0.35, 0.35)
            if v > 1.4:
                c = "#ffe27a"
            elif v > 0.6:
                c = "#ffae2e"
            elif v > -0.4:
                c = "#f2780f"
            elif v > -1.3:
                c = "#d9500a"
            else:
                c = "#9e2a05"
            px[x, y] = cor(c)
    return img

def ic_agua(rng):
    img = textura(["#2f5fd0", "#3567d8", "#2a58c4"], rng)
    px = img.load()
    for y0 in (3, 8, 13):                # ondas claras
        for x in range(16):
            dy = int(round(np.sin(x * 0.8 + y0) * 1.0))
            y = y0 + dy
            if 0 <= y < 16 and (x + y0) % 5 != 0:
                px[x, y] = cor("#6f9ff5")
                if y - 1 >= 0 and x % 4 == 1:
                    px[x, y - 1] = cor("#a8c8ff")
    for y in range(8, 16):               # fundo mais escuro
        for x in range(16):
            px[x, y] = clareia(px[x, y], -0.04 * (y - 7) / 2)
    return img

MINERIOS = {   # claro, médio, escuro
    "diamante": ("#d4fff9", "#4fe0d3", "#1a958c"),
    "esmeralda": ("#b6ffc8", "#2fcf6a", "#0f6e33"),
    "ouro": ("#fff8b0", "#f5cf2a", "#a87a08"),
    "ferro": ("#f7e3d2", "#d8a888", "#94654a"),
    "redstone": ("#ff9a8a", "#e0201a", "#7f0a0a"),
}
VEIOS = [  # formatos de aglomerado de minério
    ["XX.", "XXX", ".XX"],
    [".X.", "XXX", "XX."],
    ["XX", "XX"],
    ["XXX", ".XX"],
]

def ic_minerio(nome, rng):
    img = ic_pedra(rng)
    px = img.load()
    claro, medio, escuro = (cor(c) for c in MINERIOS[nome])
    for (ox, oy), forma in zip(((2, 2), (9, 3), (4, 9), (10, 10)), rng.sample(VEIOS, 4)):
        ox += rng.choice((0, 1)); oy += rng.choice((0, 1))
        cel = {(ox + x, oy + y) for y, l in enumerate(forma) for x, c in enumerate(l) if c == "X"}
        for (x, y) in cel:               # halo de pedra escura em volta
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1)):
                q = (x + dx, y + dy)
                if q not in cel and 0 <= q[0] < 16 and 0 <= q[1] < 16:
                    px[q] = cor("#56565b")
        for (x, y) in cel:
            if (x - 1, y) not in cel and (x, y - 1) not in cel:
                px[x, y] = claro
            elif (x + 1, y) not in cel and (x, y + 1) not in cel:
                px[x, y] = escuro
            else:
                px[x, y] = medio
    return img

# ---------- Itens (fundo transparente) ----------
def ic_ametista(rng):
    p = {"a": "#f1d6ff", "A": "#c690f0", "B": "#9a5fd6", "c": "#6b3aa8",
         "d": "#4a3266", "D": "#352447", "e": "#5c4380"}
    img = desenho([
        "................",
        ".......aA.......",
        "......aAAB......",
        "......aABc......",
        ".a....aABc......",
        ".aA...aABc......",
        ".aAB..aABc...aA.",
        "..aBc.aABc..aAB.",
        "..aABcaABc.aABc.",
        "...aBc.aBc.aBc..",
        "...aAB.aBc.aBc..",
        "....aBcaABcABc..",
        "...eeddddddddd..",
        "..eddDDDDDDDDDd.",
        "................",
        "................",
    ], p)
    return com_sombra(contorna(img))

def ic_livro(rng):
    p = {"s": "#4e1d14", "C": "#8f3424", "c": "#b04a32", "h": "#c9603f",
         "L": "#efe2bf", "l": "#b8a77d", "P": "#f4ecd6", "p": "#cfc2a0",
         "Y": "#f2c94c", "y": "#b8901f"}
    img = desenho([
        "................",
        "................",
        "...shhhhhhhhh...",
        "..sscccccccccP..",
        "..sscLLLLLLccP..",
        "..sscLllllLccp..",
        "..sscLLLLLLccP..",
        "..sscLlllLLccp..",
        "..sscLLLLLLccP..",
        "..sscccccccccp..",
        "..ssCCCCCCCCCP..",
        "..ssCCCCCCCCCp..",
        "..ssCCCCYCCCCP..",
        "...sppppYpppp...",
        "........y.......",
        "................",
    ], p)
    return com_sombra(contorna(img))

def ic_espada(rng):
    img = Image.new("RGBA", (16, 16), TRANSP)
    px = img.load()
    lamina = {13: "#ffffff", 14: "#cfd6e0", 15: "#8c96a6"}
    for y in range(16):
        for x in range(16):
            s, t = y - x, x + y            # s: ao longo da lâmina; t: atravessado
            if t in lamina and -12 <= s <= 2 and y >= 1 and x <= 14:
                px[x, y] = cor(lamina[t])
            elif s in (3, 4) and 10 <= t <= 18:
                px[x, y] = cor("#e0b030" if t <= 13 else "#a87a12")      # guarda
            elif 5 <= s <= 8 and 13 <= t <= 15:
                px[x, y] = cor("#7a4a26" if t <= 13 else "#54321a")      # cabo
            elif 9 <= s <= 10 and 12 <= t <= 16:
                px[x, y] = cor("#e0b030" if t <= 13 else "#a87a12")      # pomo
    px[12, 1] = cor("#ffffff")
    return com_sombra(contorna(img))

def ic_picareta(rng):
    img = Image.new("RGBA", (16, 16), TRANSP)
    px = img.load()
    cx, cy = 2.5, 13.5
    eixo = np.array([1, -1]) / np.sqrt(2)
    for y in range(16):
        for x in range(16):
            v = np.array([x - cx, y - cy])
            d = np.hypot(*v)
            ang = np.degrees(np.arccos(np.clip(v @ eixo / max(d, 1e-6), -1, 1)))
            if 8.6 <= d <= 11.2 and ang <= 47 and 1 <= x <= 14 and 1 <= y <= 14:
                if ang > 40:
                    c = "#7c8290"                     # pontas
                elif d > 10.3:
                    c = "#eef1f6"
                elif d > 9.4:
                    c = "#b9c0cc"
                else:
                    c = "#7c8290"
                px[x, y] = cor(c)
            elif x + y in (15, 16) and 2 <= x <= 10 and y <= 14 and px[x, y][3] == 0:
                px[x, y] = cor("#9a6a3a" if x + y == 15 else "#5e3d1f")   # cabo
    return com_sombra(contorna(img))

def ic_maca(rng):
    p = {"R": "#d93030", "r": "#b51f1f", "d": "#7c1212", "W": "#ff9d8c",
         "w": "#f0605a", "b": "#5a3a1a", "G": "#6fbf45", "g": "#3f7a22"}
    img = desenho([
        "................",
        "........b.gG....",
        "........bgGG....",
        "....rRRbRRgr....",
        "...rRwRRRRRRr...",
        "..rRWWRRRRRRRd..",
        "..RWWRRRRRRRRd..",
        "..RWRRRRRRRRRd..",
        "..RRRRRRRRRRRd..",
        "..RRRRRRRRRRdd..",
        "..rRRRRRRRRRd...",
        "...rRRRRRRRdd...",
        "....rdRRRddd....",
        ".....ddd.dd.....",
        "................",
        "................",
    ], p)
    return com_sombra(contorna(img))

def gera_icones():
    os.makedirs("assets/icones", exist_ok=True)
    fabrica = {
        "grama": ic_grama, "pedra": ic_pedra, "terra": ic_terra, "madeira": ic_madeira,
        "folhas": ic_folhas, "areia": ic_areia, "neve": ic_neve, "obsidiana": ic_obsidiana,
        "lava": ic_lava, "agua": ic_agua,
    }
    itens = {"ametista": ic_ametista, "livro": ic_livro, "espada": ic_espada,
             "picareta": ic_picareta, "maca": ic_maca}
    ordem = ["grama", "pedra", "terra", "madeira", "folhas", "areia", "neve", "obsidiana",
             "diamante", "esmeralda", "ouro", "ferro", "redstone", "ametista", "lava", "agua",
             "livro", "espada", "picareta", "maca"]
    for i, nome in enumerate(ordem):
        rng = random.Random(1000 + i)
        if nome in fabrica:
            img = bloco(fabrica[nome](rng))
        elif nome in MINERIOS:
            img = bloco(ic_minerio(nome, rng))
        else:
            img = itens[nome](rng)
        amplia(img, 4).save(f"assets/icones/{nome}.png")
    return ordem

# ---------- Ícones de loader (16x16 → 32x32) ----------
def ld_vanilla():
    img = Image.new("RGBA", (16, 16), TRANSP)
    px = img.load()
    rng = random.Random(5)
    cx, alt = 7.5, 6
    for y in range(16):
        for x in range(1, 15):
            dx = abs(x - cx)
            y_topo = 4.5 - (7 - dx) / 2           # losango do topo (proporção 2:1)
            y_meio = 4.5 + (7 - dx) / 2
            if y_topo <= y <= y_meio:
                px[x, y] = cor(rng.choice(GRAMA))
            elif y_meio < y <= y_meio + alt:
                lado = -0.05 if x < cx else -0.3
                c = rng.choice(GRAMA) if y - y_meio <= 1.5 else rng.choice(TERRA)
                px[x, y] = clareia(cor(c), lado)
    for y in range(16):                          # aresta frontal
        if px[7, y][3] and y > 8:
            px[7, y] = clareia(px[7, y], -0.12)
    return com_sombra(contorna(img))

def ld_fabric():
    """Rolo de tecido listrado com a ponta desenrolando."""
    img = Image.new("RGBA", (16, 16), TRANSP)
    px = img.load()
    listras = ("#ecdcb4", "#b8955f")
    for y in range(3, 11):                       # corpo do rolo
        for x in range(4, 15):
            c = cor(listras[((x - 4) // 2) % 2])
            if y == 3:
                c = clareia(c, 0.25)
            elif y >= 9:
                c = clareia(c, -0.18 * (y - 8))
            px[x, y] = c
    for y in range(10, 14):                      # ponta solta caindo para a direita
        for x in range(4 + (y - 10) * 2 + 4, 15 - (y - 10)):
            px[x, y] = clareia(cor(listras[((x - y) // 2) % 2]), -0.08)
    for y in range(2, 12):                       # face do rolo (espiral)
        for x in range(1, 7):
            r = ((x - 3.5) / 2.6) ** 2 + ((y - 6.5) / 4.4) ** 2
            if r <= 1:
                rr = r ** 0.5
                if rr > 0.78:
                    c = "#9a7a4c"
                elif rr > 0.5:
                    c = "#f3e6c8"
                elif rr > 0.26:
                    c = "#b8955f"
                else:
                    c = "#5a4428"
                px[x, y] = cor(c)
    return com_sombra(contorna(img))

def ld_quilt():
    retalhos = [("#9b5fd6", "#c79bf0"), ("#3f8fd8", "#8cc4f2"),
                ("#e0609f", "#f5a6cb"), ("#f0a030", "#f7d080")]
    img = Image.new("RGBA", (16, 16), TRANSP)
    px = img.load()
    for i, (base, luz) in enumerate(retalhos):
        ox, oy = 2 + (i % 2) * 6, 2 + (i // 2) * 6
        for y in range(6):
            for x in range(6):
                c = cor(base)
                if i == 0 and (x + y) % 3 == 0: c = cor(luz)          # listras
                if i == 1 and x % 2 == 0 and y % 2 == 0: c = cor(luz)  # bolinhas
                if i == 2 and (x // 2 + y // 2) % 2 == 0: c = cor(luz) # xadrez
                if i == 3 and y in (2, 3): c = cor(luz)                # faixa
                if (x in (0, 5) or y in (0, 5)) and (x + y) % 2 == 0:  # costura
                    c = cor("#fff4e0")
                px[ox + x, oy + y] = c
    return com_sombra(contorna(img))

BIGORNA = [
    "................",
    "................",
    "................",
    ".lLLLLLLLLLLLLL.",
    "..mmMMMMMMMMMMM.",
    "....dMMMMMMMMMd.",
    ".......MMMMM....",
    ".......dMMMd....",
    "......dMMMMMd...",
    ".....MMMMMMMMM..",
    "....LLLLLLLLLLL.",
    "....MMMMMMMMMMM.",
    "....DDDDDDDDDDD.",
    "................",
    "................",
    "................",
]

def ld_forge():
    p = {"l": "#9ea4b0", "L": "#8a909c", "m": "#626877", "M": "#565c6a", "d": "#3c414c",
         "D": "#2e323b"}
    return com_sombra(contorna(desenho(BIGORNA, p)))

def ld_neoforge():
    p = {"l": "#ffcf7a", "L": "#ff9a3c", "m": "#7a6e78", "M": "#505868", "d": "#353b48",
         "D": "#272b34"}
    img = contorna(desenho(BIGORNA, p))
    for x, y, c in ((12, 0, "#ff9a2e"), (12, 1, "#fff2b0"), (11, 1, "#ff9a2e"),
                    (13, 1, "#ff9a2e"), (12, 2, "#ff9a2e"), (9, 1, "#e0601a")):
        img.putpixel((x, y), cor(c))        # faísca (sem contorno escuro)
    return com_sombra(img)

def gera_loaders():
    os.makedirs("assets/loaders", exist_ok=True)
    loaders = {"vanilla": ld_vanilla, "fabric": ld_fabric, "quilt": ld_quilt,
               "forge": ld_forge, "neoforge": ld_neoforge}
    for nome, f in loaders.items():
        amplia(f(), 2).save(f"assets/loaders/{nome}.png")
    return list(loaders)

# ---------- Estado vazio: baú aberto sem nada ----------
def gera_vazio():
    T = 48
    img = Image.new("RGBA", (T, T), TRANSP)
    px = img.load()
    rng = random.Random(48)
    madeira = ["#a8743e", "#9c6a37", "#b37d44"]
    METAL, METAL_LUZ, METAL_ESC = "#7a7a86", "#b0b0bc", "#4e4e58"

    def ret(x1, y1, x2, y2, c):
        for y in range(y1, y2 + 1):
            for x in range(x1, x2 + 1):
                px[x, y] = cor(c) if isinstance(c, str) else c

    # tampa aberta inclinada para trás (trapézio: mais estreita em cima)
    for y in range(7, 19):
        meia = 16 + (y - 7) * 4 // 11
        x1, x2 = 24 - meia, 23 + meia
        for x in range(x1, x2 + 1):
            if y <= 8 or x <= x1 + 1 or x >= x2 - 1:
                c = rng.choice(madeira)                     # moldura da tampa
            else:
                c = rng.choice(["#5a3519", "#62391c", "#53311a"])   # lado de dentro
            px[x, y] = cor(c)
        if y == 13:
            ret(x1 + 2, y, x2 - 2, y, "#3e2412")            # emenda das tábuas
        if y == 9:
            ret(x1 + 2, y, x2 - 2, y, "#2e1a0c")            # sombra da moldura
        for x in (x1, x1 + 1, x1 + 2):                      # cantoneiras da tampa
            if y <= 10:
                px[x, y] = cor(METAL_LUZ if x == x1 else METAL)
        for x in (x2 - 2, x2 - 1, x2):
            if y <= 10:
                px[x, y] = cor(METAL_ESC if x == x2 else METAL)
    ret(9, 7, 38, 7, "#d39b5a")                             # quina de cima iluminada
    ret(21, 3, 26, 7, METAL)                                # fecho na ponta da tampa
    ret(21, 3, 26, 3, METAL_LUZ)
    ret(26, 4, 26, 7, METAL_ESC)
    ret(23, 4, 24, 5, "#2a2a30")

    # borda de cima do baú em volta da abertura
    ret(4, 19, 43, 27, "#b37d44")
    ret(4, 19, 43, 19, "#8a5a2e")                           # sombra da tampa na borda
    # interior vazio: paredes de dentro e fundo escuro
    ret(7, 21, 40, 25, "#1c1009")
    ret(7, 21, 40, 22, "#4a2e18")                           # parede do fundo (iluminada)
    ret(7, 23, 40, 23, "#33200f")
    ret(7, 21, 8, 25, "#3a2414")                            # parede da esquerda
    ret(39, 21, 40, 25, "#140b05")                          # parede da direita
    for x in range(12, 38, 8):                              # frestas na parede do fundo
        ret(x, 22, x, 23, "#2a1a0e")
    for k in range(4):                                      # teia de aranha no canto
        px[9 + k, 21] = cor("#c8c8d0", 150)
        px[9, 21 + k] = cor("#c8c8d0", 150)
        if k < 3:
            px[9 + k, 21 + k] = cor("#c8c8d0", 170)
    px[11, 22] = cor("#c8c8d0", 110)
    # frente do baú (tábuas)
    for y in range(27, 42):
        for x in range(4, 44):
            px[x, y] = cor(rng.choice(madeira))
    ret(4, 27, 43, 27, "#d8a362")                           # quina iluminada
    ret(4, 34, 43, 34, "#6e4522")                           # emenda
    ret(4, 35, 43, 35, "#bd8547")
    for _ in range(10):                                     # veios
        vx, vy = rng.randrange(9, 36), rng.choice((29, 31, 32, 37, 39))
        ret(vx, vy, vx + rng.randint(2, 4), vy, "#8a5c2e")
    for x1 in (4, 41):                                      # cantoneiras
        ret(x1, 19, x1 + 2, 41, METAL)
        ret(x1, 19, x1, 41, METAL_LUZ)
        ret(x1 + 2, 19, x1 + 2, 41, METAL_ESC)
    for x in range(4, 44):                                  # base mais escura
        px[x, 41] = clareia(px[x, 41], -0.35)
        px[x, 40] = clareia(px[x, 40], -0.15)
    img = contorna(img)
    # sombra no chão (depois do contorno, sem borda)
    for y in range(43, 46):
        meia = 23 - (y - 43) * 4
        for x in range(24 - meia, 24 + meia):
            if px[x, y][3] == 0:
                px[x, y] = (0, 0, 0, 70 if y == 43 else 40)
    # poeirinha flutuando no ar
    for x, y in ((15, 3), (31, 1), (36, 4), (11, 0)):
        px[x, y] = cor("#f5e6a8", 210)
    img.save("assets/vazio.png")

# ---------- Banner: paisagem noturna de blocos com caverna de sculk ----------
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

def gera_banner():
    L, A = 320, 110
    img = Image.new("RGBA", (L, A))
    px = img.load()
    rng = random.Random(320)

    def dentro(x, y):
        return 0 <= x < L and 0 <= y < A

    # céu em degradê com pontilhado (dither) entre faixas
    ceu = [cor(c) for c in ("#070a1c", "#0b1030", "#121741", "#1c1c50", "#29215a",
                             "#3c2864", "#553068", "#723a68", "#8f4766", "#a85a63")]
    for y in range(A):
        t = min(y / 66, 1) * (len(ceu) - 1)
        i = int(t)
        frac = t - i
        j = min(i + 1, len(ceu) - 1)
        for x in range(L):
            px[x, y] = ceu[j] if frac * 16 > BAYER[y % 4][x % 4] + 0.5 else ceu[i]

    def brilho(x, y, raio, forca, tom=(255, 255, 255)):
        """Halo quadrado em degraus (pixel), clareando na direção de `tom`."""
        for yy in range(y - raio, y + raio + 1):
            for xx in range(x - raio, x + raio + 1):
                if dentro(xx, yy):
                    d = max(abs(xx - x), abs(yy - y))
                    f = forca * (1 - d / (raio + 1))
                    px[xx, yy] = mistura(px[xx, yy], tom + (255,), f)

    # lua quadrada com halo
    lx, ly, lt = 250, 10, 14
    brilho(lx + lt // 2, ly + lt // 2, lt + 2, 0.18, (230, 220, 255))
    for y in range(ly, ly + lt):
        for x in range(lx, lx + lt):
            px[x, y] = cor("#f4f0d6")
    for i in range(lt):
        px[lx + i, ly + lt - 1] = cor("#d9d3b0")
        px[lx + lt - 1, ly + i] = cor("#d9d3b0")
        px[lx + i, ly] = cor("#fffbea")
    for cx, cy, r in ((lx + 3, ly + 3, 3), (lx + 9, ly + 6, 2), (lx + 4, ly + 9, 2), (lx + 10, ly + 10, 1)):
        for y in range(cy, cy + r):
            for x in range(cx, cx + r):
                px[x, y] = cor("#d6cfab")
        px[cx + r - 1, cy + r - 1] = cor("#e6e0c0")

    # estrelas (mais densas e brilhantes no alto)
    def longe_da_lua(x, y, m):
        return not (lx - m <= x <= lx + lt + m and ly - m <= y <= ly + lt + m)
    for _ in range(150):
        x, y = rng.randrange(L), int(rng.random() ** 1.5 * 56)
        if longe_da_lua(x, y, 6):
            forca = 0.9 - y / 80 + rng.uniform(-0.25, 0.05)
            px[x, y] = mistura(px[x, y], cor(rng.choice(("#ffffff", "#fff4d0", "#d0e0ff"))),
                               max(forca, 0.25))
    for _ in range(10):                          # estrelas maiores em cruz
        x, y = rng.randrange(4, L - 4), rng.randrange(3, 34)
        if longe_da_lua(x, y, 8):
            px[x, y] = cor("#ffffff")
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                px[x + dx, y + dy] = mistura(px[x + dx, y + dy], cor("#ffffff"), 0.45)

    # nuvens finas em faixas (lado de baixo iluminado pelo crepúsculo)
    for nx, ny, nl in ((24, 20, 44), (52, 24, 28), (150, 14, 22), (190, 31, 54),
                       (226, 27, 22), (284, 37, 36)):
        for k in range(nl):
            x = nx + k
            if x < L:
                px[x, ny] = mistura(px[x, ny], cor("#9a5f8c"), 0.5)
                if 3 < k < nl - 5:
                    px[x, ny - 1] = mistura(px[x, ny - 1], cor("#6e4a86"), 0.4)
                if 8 < k < nl - 10:
                    px[x, ny - 2] = mistura(px[x, ny - 2], cor("#5a3f7e"), 0.3)

    def perfil(base, passo, semente, lim, saltos=(-2, -1, -1, 0, 0, 1, 1, 2)):
        """Relevo em degraus de bloco: o y do topo para cada x."""
        r = random.Random(semente)
        h, out = 0, []
        for _ in range(L // passo + 1):
            h = max(-lim, min(lim, h + r.choice(saltos)))
            out += [base + h] * passo
        return out[:L]

    # montanhas distantes com neve nos picos
    longe = perfil(50, 4, 11, 12, (-3, -2, -1, 0, 1, 2, 3))
    for x in range(L):
        for y in range(longe[x], A):
            p = y - longe[x]
            c = "#3d3670" if p == 0 else ("#332d62" if p < 3 else "#2a2552")
            if longe[x] <= 42 and p < 2:
                c = "#c9c4e8" if p == 0 else "#8e88c0"   # neve no pico
            px[x, y] = cor(c)
    # morros do meio (verde-escuro) com árvores em silhueta
    meio = perfil(62, 6, 23, 6)
    for x in range(L):
        for y in range(meio[x], A):
            px[x, y] = cor("#2c5444" if y == meio[x] else "#1f3d36" if y < meio[x] + 4 else "#1a332f")

    def arvore(x0, chao, folhas, tronco, alt=5, larg=9, luz=None):
        for y in range(chao - alt, chao):
            for x in (x0, x0 + 1):
                if dentro(x, y):
                    px[x, y] = cor(tronco)
        topo = chao - alt - 4
        for y in range(topo, topo + 5):          # copa em dois andares
            meia = larg // 2 if y > topo + 1 else larg // 2 - 2
            for x in range(x0 + 1 - meia, x0 + 1 + meia + 1):
                if dentro(x, y) and not (y == topo + 4 and x in (x0 + 1 - meia, x0 + 1 + meia)):
                    px[x, y] = cor(rng.choice(folhas))
                    if luz and y <= topo + 2 and x >= x0 + 1 and rng.random() < 0.45:
                        px[x, y] = cor(luz)      # lado virado para a lua

    for x0 in (18, 70, 104, 162, 205, 236, 296):
        arvore(x0, meio[x0], ["#173226", "#1b3a2c", "#142c25"], "#14231d", alt=3, larg=7)

    # chão da frente: grama, terra e pedra em camadas
    perto = perfil(74, 8, 37, 4, (-1, 0, 0, 1))
    terra = ["#5e3d22", "#664226", "#56381f", "#6b4729"]
    pedra = ["#55555d", "#4c4c54", "#5d5d65"]
    for x in range(L):
        fim_terra = 84 + (x // 8 * 5) % 3
        for y in range(perto[x], A):
            p = y - perto[x]
            if p < 2:
                c = rng.choice(["#3f8a2e", "#4a9634", "#367a28"])
            elif p < 3:
                c = rng.choice(["#3f8a2e", "#5e3d22", "#5e3d22"])
            elif y < fim_terra:
                c = rng.choice(terra)
            else:
                c = rng.choice(pedra)
            px[x, y] = cor(c)
        px[x, perto[x]] = cor(rng.choice(["#62b440", "#58a83a"]))   # luz da lua na grama
    for _ in range(30):                          # pedrinhas na terra
        x, y = rng.randrange(L), rng.randrange(78, 84)
        if y > perto[x] + 3:
            px[x, y] = cor(rng.choice(["#7a5634", "#4a2f19"]))

    for x0, alt in ((46, 8), (128, 7), (178, 9), (272, 8)):
        arvore(x0, perto[x0], ["#2f6e24", "#2a6420", "#245a1c", "#336f26"], "#4a3220",
               alt=alt, larg=11, luz="#4a8f34")
    for _ in range(34):                          # flores e grama alta
        x = rng.randrange(L)
        px[x, perto[x] - 1] = cor(rng.choice(["#4a9634", "#4a9634", "#e0d060", "#d05050", "#a0c0f0"]))
    for _ in range(12):                          # vaga-lumes
        x, y = rng.randrange(L), rng.randrange(58, 72)
        if y < perto[x] - 2:
            px[x, y] = cor("#e4f78a")
            px[x - 1, y] = mistura(px[x - 1, y], cor("#d8f070"), 0.35)

    # subsolo: ardósia (mesma paleta do fundo da janela)
    for y in range(86, A):
        for x in range(L):
            if y >= 90 or rng.random() < (y - 85) / 5:
                px[x, y] = cor(rng.choice(ARDOSIA))
    for y0 in (95, 104):                         # veios horizontais da ardósia
        for x in range(L):
            if rng.random() < 0.5:
                px[x, y0 + rng.choice((0, 1))] = cor("#18181d")

    # caverna: cavidade irregular em degraus no meio da ardósia
    cav = {}
    tetos = perfil(91, 4, 51, 2, (-1, 0, 0, 1))
    for x in range(66, 262):
        t = (x - 66) / 196
        alt = int(np.sin(t * np.pi) ** 0.5 * 15)
        if alt < 2:
            continue
        topo = tetos[x] + max(0, 6 - alt // 2)
        chao = min(topo + alt, A - 4)
        cav[x] = (topo, chao)
        for y in range(topo, chao):
            px[x, y] = cor("#0b0b10" if y > topo + 1 else "#141419")
    for x, (topo, chao) in cav.items():          # degraus do chão em blocos
        cav[x] = (topo, chao - ((x // 6) % 2))
    # tapete de sculk no chão e nas bordas da caverna
    for x, (topo, chao) in cav.items():
        for y in range(chao, min(chao + 2, A)):
            px[x, y] = cor(rng.choice(["#0b3a40", "#0d4a50", "#082e33", "#0f5258"]))
        if rng.random() < 0.18:
            px[x, chao] = cor(rng.choice(["#1aa3a3", "#2fd6cf"]))
            if rng.random() < 0.5:
                px[x, chao - 1] = cor("#7ff7ee")
                brilho(x, chao - 1, 3, 0.12, (60, 230, 220))
    for x, (topo, chao) in cav.items():          # líquen pendurado no teto
        if rng.random() < 0.08:
            for k in range(rng.randint(1, 3)):
                px[x, topo + k] = cor("#0f6e74" if k else "#0b4f57")
    # sensores de sculk (bloquinhos com antenas brilhando)
    for sx in (104, 158, 214):
        chao = cav[sx][1]
        brilho(sx + 2, chao - 5, 6, 0.16, (60, 230, 220))
        for y in range(chao - 3, chao):
            for x in range(sx, sx + 5):
                px[x, y] = cor("#13636a" if y == chao - 3 else "#0d4a50")
        px[sx + 2, chao - 2] = cor("#2fd6cf")
        px[sx + 1, chao - 2] = cor("#1aa3a3"); px[sx + 3, chao - 2] = cor("#1aa3a3")
        for ax in (sx, sx + 4):
            px[ax, chao - 4] = cor("#5ff0e6")
            px[ax, chao - 5] = cor("#5ff0e6")
            px[ax, chao - 6] = cor("#c8fffa")
    # partículas de sculk flutuando dentro da caverna
    for _ in range(26):
        x = rng.choice(list(cav))
        topo, chao = cav[x]
        if chao - topo > 5:
            y = rng.randrange(topo + 2, chao - 2)
            px[x, y] = cor(rng.choice(["#2fd6cf", "#1aa3a3", "#7ff7ee"]))
    # veios de sculk e minério de diamante na ardósia
    for _ in range(50):
        x, y = rng.randrange(L), rng.randrange(88, A)
        if x in cav and cav[x][0] - 1 <= y <= cav[x][1] + 2:
            continue
        px[x, y] = cor(rng.choice(["#0f6e74", "#1aa3a3", "#0b4f57"]))
    for ox, oy in ((30, 98), (292, 101)):
        for dx, dy in ((0, 0), (1, 0), (1, 1), (2, 1), (0, 2)):
            px[ox + dx, oy + dy] = cor("#4fe0d3" if (dx + dy) % 2 else "#bff6f0")
    img.save("assets/banner.png")

gera_icones()
gera_loaders()
gera_vazio()
gera_banner()
print("assets gerados")
