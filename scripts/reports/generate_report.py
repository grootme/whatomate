#!/usr/bin/env python3
"""Reporte de Inteligencia Holistica - WhatsApp y Telegram"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, 
    Image, PageBreak, KeepTogether, CondPageBreak
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ── Font Registration ──
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSansBold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSerif', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSerifBold', '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Carlito', '/usr/share/fonts/truetype/english/Carlito-Regular.ttf'))
pdfmetrics.registerFont(TTFont('CarlitoBold', '/usr/share/fonts/truetype/english/Carlito-Bold.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC', '/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
registerFontFamily('DejaVuSerif', normal='DejaVuSerif', bold='DejaVuSerifBold')
registerFontFamily('Carlito', normal='Carlito', bold='CarlitoBold')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSansBold')

# ── Palette ──
ACCENT       = colors.HexColor('#2d96b9')
TEXT_PRIMARY  = colors.HexColor('#1f2122')
TEXT_MUTED    = colors.HexColor('#7a8287')
BG_SURFACE   = colors.HexColor('#d4dbe0')
BG_PAGE      = colors.HexColor('#eff1f2')

TABLE_HEADER_COLOR = ACCENT
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = BG_SURFACE

# ── Page Setup ──
PAGE_W, PAGE_H = A4
LEFT_M = 1.0 * inch
RIGHT_M = 1.0 * inch
TOP_M = 0.8 * inch
BOTTOM_M = 0.8 * inch
AVAILABLE_W = PAGE_W - LEFT_M - RIGHT_M

# ── Styles ──
styles = getSampleStyleSheet()

h1_style = ParagraphStyle(
    name='H1', fontName='DejaVuSerif', fontSize=20, leading=28,
    textColor=ACCENT, spaceBefore=18, spaceAfter=12, alignment=TA_LEFT
)
h2_style = ParagraphStyle(
    name='H2', fontName='DejaVuSerif', fontSize=15, leading=22,
    textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=8, alignment=TA_LEFT
)
h3_style = ParagraphStyle(
    name='H3', fontName='DejaVuSerif', fontSize=12, leading=18,
    textColor=ACCENT, spaceBefore=10, spaceAfter=6, alignment=TA_LEFT
)
body_style = ParagraphStyle(
    name='Body', fontName='DejaVuSerif', fontSize=10.5, leading=17,
    textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=8, alignment=TA_JUSTIFY,
    wordWrap='CJK'
)
caption_style = ParagraphStyle(
    name='Caption', fontName='DejaVuSerif', fontSize=9, leading=14,
    textColor=TEXT_MUTED, spaceBefore=3, spaceAfter=6, alignment=TA_CENTER
)
bullet_style = ParagraphStyle(
    name='Bullet', fontName='DejaVuSerif', fontSize=10.5, leading=17,
    textColor=TEXT_PRIMARY, spaceBefore=2, spaceAfter=4, leftIndent=20,
    bulletIndent=8, alignment=TA_LEFT
)

header_cell = ParagraphStyle(name='HC', fontName='DejaVuSerif', fontSize=10,
    textColor=colors.white, alignment=TA_CENTER, leading=14)
cell = ParagraphStyle(name='Cell', fontName='DejaVuSerif', fontSize=9.5,
    textColor=TEXT_PRIMARY, alignment=TA_CENTER, leading=14)
cell_left = ParagraphStyle(name='CellL', fontName='DejaVuSerif', fontSize=9.5,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, leading=14)

# ── Helper ──
DL = '/home/z/my-project/download/'

def add_img(story, filename, width=AVAILABLE_W*0.85, caption_text=None):
    path = os.path.join(DL, filename)
    if os.path.exists(path):
        img = Image(path, width=width, height=width*0.6)
        img.hAlign = 'CENTER'
        story.append(Spacer(1, 12))
        story.append(img)
        if caption_text:
            story.append(Paragraph(caption_text, caption_style))
        story.append(Spacer(1, 12))

def make_table(data, col_widths=None):
    if col_widths is None:
        col_widths = [AVAILABLE_W / len(data[0])] * len(data[0])
    t = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('GRID', (0, 0), (-1, -1), 0.5, TEXT_MUTED),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(data)):
        bg = TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

# ── Build Document ──
output_path = os.path.join(DL, 'reporte_inteligencia_whatsapp_telegram.pdf')
doc = SimpleDocTemplate(
    output_path, pagesize=A4,
    leftMargin=LEFT_M, rightMargin=RIGHT_M,
    topMargin=TOP_M, bottomMargin=BOTTOM_M,
    title='Reporte de Inteligencia Holistica - WhatsApp y Telegram',
    author='Whatomate OSINT', creator='Z.ai'
)

story = []

# ═══════════════════════════════════════════════════════════════
# COVER PAGE
# ═══════════════════════════════════════════════════════════════
story.append(Spacer(1, 120))
story.append(Paragraph('<b>REPORTE DE INTELIGENCIA</b>', ParagraphStyle(
    name='CoverTitle', fontName='DejaVuSerif', fontSize=32, leading=40,
    textColor=ACCENT, alignment=TA_CENTER
)))
story.append(Spacer(1, 12))
story.append(Paragraph('<b>Holistico: WhatsApp y Telegram</b>', ParagraphStyle(
    name='CoverSub', fontName='DejaVuSerif', fontSize=22, leading=30,
    textColor=TEXT_PRIMARY, alignment=TA_CENTER
)))
story.append(Spacer(1, 40))

# Summary block
summary_data = [
    [Paragraph('<b>Plataformas Analizadas</b>', header_cell),
     Paragraph('<b>Grupos Totales</b>', header_cell),
     Paragraph('<b>Alcance Estimado</b>', header_cell),
     Paragraph('<b>Fecha</b>', header_cell)],
    [Paragraph('WhatsApp + Telegram', cell),
     Paragraph('276', cell),
     Paragraph('+8M usuarios', cell),
     Paragraph('27 Mayo 2026', cell)]
]
story.append(make_table(summary_data, [AVAILABLE_W*0.30, AVAILABLE_W*0.20, AVAILABLE_W*0.25, AVAILABLE_W*0.25]))

story.append(Spacer(1, 60))
story.append(Paragraph('Generado por Whatomate OSINT Ecosystem v0.17.0', ParagraphStyle(
    name='CoverFoot', fontName='DejaVuSerif', fontSize=10, leading=14,
    textColor=TEXT_MUTED, alignment=TA_CENTER
)))
story.append(Paragraph('Hermes Agent | Shadowbroker OSINT | Cognitive API', ParagraphStyle(
    name='CoverFoot2', fontName='DejaVuSerif', fontSize=9, leading=14,
    textColor=TEXT_MUTED, alignment=TA_CENTER
)))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# SECTION 1: RESUMEN EJECUTIVO
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>1. Resumen Ejecutivo</b>', h1_style))
story.append(Spacer(1, 8))

story.append(Paragraph(
    'El presente reporte constituye un analisis holistico de la actividad digital detectada '
    'a traves de las plataformas WhatsApp y Telegram, vinculadas al numero +5350819559. '
    'La investigacion abarca 195 grupos de WhatsApp y 81 grupos/canales de Telegram, '
    'representando un ecosistema digital de mas de 8 millones de usuarios potenciales. '
    'Los datos fueron recopilados en tiempo real mediante el ecosistema Whatomate OSINT, '
    'que integra el Hermes Agent v0.17.0 con 19 herramientas de inteligencia artificial, '
    'el Shadowbroker OSINT con scrapers de datos abiertos, y la Cognitive API para analisis semantico.',
    body_style
))
story.append(Spacer(1, 8))

story.append(Paragraph(
    'Los hallazgos principales revelan un ecosistema digital cubano altamente activo centrado en '
    'tres ejes fundamentales: (1) economia informal y mercado paralelo de divisas, con predominio '
    'de la venta de saldo telefonico, electrodomesticos y productos de primera necesidad; '
    '(2) migracion y negocios internacionales, especificamente la comunidad cubana en Dubai/EAU '
    'con operaciones inmobiliarias, rentas y envios; y (3) criptomonedas y finanzas digitales, '
    'con una presencia significativa de grupos dedicados al intercambio de USDT, TON y otras '
    'criptomonedas como alternativa al sistema financiero tradicional. Se detectaron tambien '
    'patrones de actividad sospechosa relacionados con ventas de saldo a gran escala, '
    'intercambio informal de divisas, y ofertas de servicios financieros no regulados.',
    body_style
))
story.append(Spacer(1, 8))

# Key metrics table
story.append(Paragraph('<b>1.1 Metricas Clave</b>', h2_style))
metrics_data = [
    [Paragraph('<b>Metrica</b>', header_cell), Paragraph('<b>WhatsApp</b>', header_cell),
     Paragraph('<b>Telegram</b>', header_cell), Paragraph('<b>Total</b>', header_cell)],
    [Paragraph('Grupos/Canales', cell_left), Paragraph('195', cell), Paragraph('81', cell), Paragraph('276', cell)],
    [Paragraph('Grupo mas grande', cell_left), Paragraph('Comunidad Emiratos (1,026)', cell), Paragraph('Toncoin (7.9M)', cell), Paragraph('-', cell)],
    [Paragraph('Grupos +500 participantes', cell_left), Paragraph('42', cell), Paragraph('28', cell), Paragraph('70', cell)],
    [Paragraph('Grupos comercio/ventas', cell_left), Paragraph('58', cell), Paragraph('10', cell), Paragraph('68', cell)],
    [Paragraph('Grupos cripto/divisas', cell_left), Paragraph('15', cell), Paragraph('12', cell), Paragraph('27', cell)],
    [Paragraph('Grupos Dubai/migracion', cell_left), Paragraph('22', cell), Paragraph('0', cell), Paragraph('22', cell)],
    [Paragraph('Mensajes recientes analizados', cell_left), Paragraph('50', cell), Paragraph('45', cell), Paragraph('95', cell)],
]
story.append(make_table(metrics_data, [AVAILABLE_W*0.30, AVAILABLE_W*0.23, AVAILABLE_W*0.23, AVAILABLE_W*0.24]))
story.append(Paragraph('Tabla 1: Metricas comparativas entre plataformas', caption_style))
story.append(Spacer(1, 12))

add_img(story, 'chart_platform_comparison.png', AVAILABLE_W*0.75, 'Figura 1: Comparativa de plataformas por total de grupos')

# ═══════════════════════════════════════════════════════════════
# SECTION 2: ANALISIS WHATSAPP
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>2. Analisis de WhatsApp</b>', h1_style))
story.append(Spacer(1, 8))

story.append(Paragraph('<b>2.1 Panorama General</b>', h2_style))
story.append(Paragraph(
    'WhatsApp representa la plataforma predominante en el ecosistema digital cubano, '
    'con 195 grupos activos conectados a la cuenta analizada. La conectividad fue verificada '
    'a traves del WhatsApp Bridge basado en Baileys, reportando el numero +5350819559 como '
    'activo y vinculado. La distribucion de participantes por grupo muestra una concentracion '
    'significativa en el rango de 100-500 participantes, con 42 grupos superando los 500 miembros '
    'y varios alcanzando mas de 1,000 participantes. Esta estructura indica un ecosistema '
    'maduro y consolidado donde los grupos funcionan como mercados digitales informales, '
    'canales de distribucion y redes de contacto profesional.',
    body_style
))
story.append(Spacer(1, 8))

add_img(story, 'chart_wa_categories.png', AVAILABLE_W*0.85, 'Figura 2: Distribucion de grupos WhatsApp por categoria tematica')

story.append(Paragraph('<b>2.2 Economia Informal y Mercado Paralelo</b>', h2_style))
story.append(Paragraph(
    'El analisis de los mensajes recientes revela un mercado informal altamente activo. '
    'La venta de saldo telefonico constituye la actividad comercial mas frecuente, con '
    'multiples publicadores ofreciendo recargas a tasas que oscilan entre 120 CUP por $500 '
    'y 360 CUP por $1,250. Un vendedor identificado como "Christopher" publica recurrentemente '
    'ofertas de saldo con precios escalonados (120x500, 240x900, 360x1,250), aceptando '
    'transferencia bancaria como metodo de pago. Otro vendedor, "michael", opera a mayor '
    'escala con la agencia Ding.com, ofreciendo saldo al por mayor con tasas de 1x1 para '
    'cantidades superiores a 25,000, lo que sugiere un operador con acceso a recargas '
    'internacionales al por mayor.',
    body_style
))
story.append(Spacer(1, 8))

story.append(Paragraph(
    'Los productos de primera necesidad tambien dominan las conversaciones. En el grupo '
    '"Barato UCI" se detectaron ofertas de productos de higiene y alimentacion con precios '
    'en CUP y USD: aceite a 1,300 CUP, champu a 900 CUP, arroz a 660 CUP, y detergentes '
    'entre 600-980 CUP. El grupo "Ventas UCI" muestra ofertas de pollo, salchichas, pasta '
    'y otros alimentos basicos con una diferencia de precio significativa entre efectivo y '
    'transferencia (generalmente un 10% adicional por transferencia). Esta diferencia refleja '
    'la preferencia del mercado por el efectivo en la economia cubana, donde la liquidez '
    'en moneda nacional sigue siendo un factor critico.',
    body_style
))
story.append(Spacer(1, 8))

# Top WA groups table
story.append(Paragraph('<b>2.3 Top 10 Grupos WhatsApp</b>', h2_style))
add_img(story, 'chart_wa_top10.png', AVAILABLE_W*0.85, 'Figura 3: Top 10 grupos WhatsApp por numero de participantes')

top_wa_data = [
    [Paragraph('<b>Grupo</b>', header_cell), Paragraph('<b>Participantes</b>', header_cell), Paragraph('<b>Categoria</b>', header_cell)],
    [Paragraph('Comunidad Emiratos Arabes', cell_left), Paragraph('1,026', cell), Paragraph('Comunidad/Migracion', cell)],
    [Paragraph('Compras y Ventas Cascajal', cell_left), Paragraph('1,024', cell), Paragraph('Comercio', cell)],
    [Paragraph('2 Gestion Triciclos/Motos', cell_left), Paragraph('1,022', cell), Paragraph('Vehiculos', cell)],
    [Paragraph("D'NICO MERCADO 2", cell_left), Paragraph('1,013', cell), Paragraph('Comercio', cell)],
    [Paragraph('Gestion Triciclos/Motos', cell_left), Paragraph('1,007', cell), Paragraph('Vehiculos', cell)],
    [Paragraph('Gestores G&Y', cell_left), Paragraph('995', cell), Paragraph('Gestores/Ventas', cell)],
    [Paragraph('Mi Mascota Viaja', cell_left), Paragraph('958', cell), Paragraph('Servicios/Mascotas', cell)],
    [Paragraph('Latin Rents Dubai', cell_left), Paragraph('940', cell), Paragraph('Inmobiliario/Dubai', cell)],
    [Paragraph('ONLY SHOPS', cell_left), Paragraph('932', cell), Paragraph('Comercio', cell)],
    [Paragraph('LOOK PERFECTO', cell_left), Paragraph('922', cell), Paragraph('Ropa/Moda', cell)],
]
story.append(make_table(top_wa_data, [AVAILABLE_W*0.45, AVAILABLE_W*0.20, AVAILABLE_W*0.35]))
story.append(Paragraph('Tabla 2: Top 10 grupos WhatsApp por participantes', caption_style))
story.append(Spacer(1, 12))

# ═══════════════════════════════════════════════════════════════
# SECTION 3: ANALISIS TELEGRAM
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>3. Analisis de Telegram</b>', h1_style))
story.append(Spacer(1, 8))

story.append(Paragraph('<b>3.1 Panorama General</b>', h2_style))
story.append(Paragraph(
    'Telegram presenta un ecosistema diferente al de WhatsApp, con 81 grupos y canales que '
    'se dividen entre supergrupos interactivos y canales de difusion unidireccional. La '
    'connectividad fue verificada a traves del servicio Telethon, que reporta la cuenta como '
    'activa y conectada al ecosistema. A diferencia de WhatsApp, donde predominan los grupos '
    'de comercio local, Telegram muestra una fuerte inclinacion hacia las criptomonedas, '
    'el ecosistema TON (The Open Network), y las senales de trading. El canal mas grande '
    'es "Toncoin" con casi 8 millones de suscriptores, seguido por "TrueCaller" con 5.7 millones. '
    'Los grupos cubanos en Telegram estan mas orientados hacia el intercambio de divisas '
    '(USD, MLC, EUR), el empleo en tecnologia, y las comunidades de desarrollo.',
    body_style
))
story.append(Spacer(1, 8))

add_img(story, 'chart_tg_categories.png', AVAILABLE_W*0.85, 'Figura 4: Distribucion de grupos Telegram por categoria tematica')

story.append(Paragraph('<b>3.2 Ecosistema Cripto y Divisas</b>', h2_style))
story.append(Paragraph(
    'El ecosistema cripto en Telegram es significativamente mas sofisticado que en WhatsApp. '
    'Se identificaron 12 grupos/canales dedicados a criptomonedas y divisas, incluyendo '
    'actores como "Cripto Intercambio" (9,135 participantes), "USD&MLC Colon-Mtz" (18,658), '
    '"Compra y venta de USD MLC en toda Cuba" (17,088), y "QvaPay" (24,063 en el canal, '
    '6,193 en el grupo). La busqueda tematica revelo que el grupo QvaPay funciona como una '
    'pasarela de pagos P2P con criptomonedas, donde se detectaron ofertas de tiendas que '
    'aceptan pagos en QUSD y criptos, incluyendo una tienda de alimentos en Vibora Park, '
    'La Habana, que implementa pagos mediante BTCPay Server.',
    body_style
))
story.append(Spacer(1, 8))

story.append(Paragraph(
    'Se detecto tambien una oferta sospechosa de un usuario llamado "Miguel" ofreciendo '
    'tarjetas Visa de aplicaciones financieras (Zinli, Pana, Kontigo, Kast, Meru), cuentas '
    'PayPal, cuentas Binance, numeros virtuales internacionales, y "documentos digitales para '
    'superar verificaciones KYC", reclutando colaboradores en Cuba con promesas de salario '
    'fijo y 30% de comision. Esta oferta constituye un claro indicador de actividad de '
    'fraude financiero y evasion de controles KYC/AML que requiere atencion prioritaria.',
    body_style
))
story.append(Spacer(1, 8))

# Top TG groups
story.append(Paragraph('<b>3.3 Top 10 Grupos/Canales Telegram</b>', h2_style))
add_img(story, 'chart_tg_top10.png', AVAILABLE_W*0.85, 'Figura 5: Top 10 grupos/canales Telegram por participantes')

top_tg_data = [
    [Paragraph('<b>Grupo/Canal</b>', header_cell), Paragraph('<b>Participantes</b>', header_cell), Paragraph('<b>Tipo</b>', header_cell), Paragraph('<b>Categoria</b>', header_cell)],
    [Paragraph('Toncoin', cell_left), Paragraph('7,948,677', cell), Paragraph('Canal', cell), Paragraph('Cripto/TON', cell)],
    [Paragraph('TrueCaller', cell_left), Paragraph('5,772,742', cell), Paragraph('Canal', cell), Paragraph('Servicios', cell)],
    [Paragraph('Empresa Elect. Habana', cell_left), Paragraph('282,474', cell), Paragraph('Canal', cell), Paragraph('Institucional', cell)],
    [Paragraph('Whale Alert', cell_left), Paragraph('314,284', cell), Paragraph('Canal', cell), Paragraph('Cripto/Monitor', cell)],
    [Paragraph('Beaverson Trade', cell_left), Paragraph('193,686', cell), Paragraph('Canal', cell), Paragraph('Trading', cell)],
    [Paragraph('Toncoin ES', cell_left), Paragraph('220,367', cell), Paragraph('Canal', cell), Paragraph('Cripto/TON', cell)],
    [Paragraph('CryptoQuant Alert', cell_left), Paragraph('73,861', cell), Paragraph('Canal', cell), Paragraph('Cripto/Analisis', cell)],
    [Paragraph('Despertador Matrix', cell_left), Paragraph('80,565', cell), Paragraph('Canal', cell), Paragraph('Conspiracion/Info', cell)],
    [Paragraph('Exponiendo La Elite', cell_left), Paragraph('40,569', cell), Paragraph('Canal', cell), Paragraph('Conspiracion/Info', cell)],
    [Paragraph('Whale Sniper', cell_left), Paragraph('62,630', cell), Paragraph('Canal', cell), Paragraph('Cripto/Trading', cell)],
]
story.append(make_table(top_tg_data, [AVAILABLE_W*0.30, AVAILABLE_W*0.20, AVAILABLE_W*0.15, AVAILABLE_W*0.35]))
story.append(Paragraph('Tabla 3: Top 10 grupos/canales Telegram por participantes', caption_style))
story.append(Spacer(1, 12))

# ═══════════════════════════════════════════════════════════════
# SECTION 4: COMUNIDAD DUBAI/EAU
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>4. La Comunidad Cubana en Dubai/EAU</b>', h1_style))
story.append(Spacer(1, 8))

story.append(Paragraph(
    'Uno de los hallazgos mas significativos es la extensa red de grupos dedicados a la '
    'comunidad cubana en los Emiratos Arabes Unidos. Se identificaron 22 grupos de WhatsApp '
    'vinculados a Dubai/EAU, abarcando desde alquileres ("Charming Shelter in Dubai" con 885, '
    '"Solo Rentas Dubai" con 346, "Tu renta en Dubai" con 773), hasta proyectos inmobiliarios '
    '("Proyectos Inmobiliarios Abu Dhabi/Dubai" con 244), y eventos ("Eventos y Fiestas 24h Dubai" '
    'con 324). La comunidad opera a traves de agencias como "Cuban Travel Agency" (484 participantes), '
    '"DANIA TRAVEL AGENCY" (187), y "ONE TRAVEL" (294), que ofrecen servicios de vuelos, '
    'hoteles y alquileres de vehiculos tanto en Cuba como en Dubai.',
    body_style
))
story.append(Spacer(1, 8))

story.append(Paragraph(
    'El grupo "Cubanos en Dubai (Comunidad)" con 491 participantes y "Latinos en UAE #2" con 723 '
    'funcionan como hubs centrales de informacion. Se detectaron tambien grupos especificos de '
    'empleo como "Empleos en Dubai" (538) y "(JOB OFFERS)" (812), asi como grupos de envios '
    'como "ENVIOS ARTIS LOGISTICS Dubai" (447). La magnitud de esta red sugiere un flujo '
    'migratorio significativo de Cuba hacia los EAU, con una infraestructura digital completa '
    'para soportar la transicion: desde la busqueda de empleo y alojamiento hasta los envios '
    'de dinero y la integracion social. Los grupos de compra-venta de vehiculos ("CARS BUSINESS '
    'Dubai" con 147, "Anuncios de Venta Carros Dubai" con 67) indican un nivel de establecimiento '
    'permanente considerable dentro de esta comunidad.',
    body_style
))
story.append(Spacer(1, 8))

# Dubai groups table
dubai_data = [
    [Paragraph('<b>Grupo</b>', header_cell), Paragraph('<b>Participantes</b>', header_cell), Paragraph('<b>Funcion</b>', header_cell)],
    [Paragraph('ALL BUSINESSES LATINOS', cell_left), Paragraph('487', cell), Paragraph('Hub general negocios', cell)],
    [Paragraph('Cubanos en Dubai', cell_left), Paragraph('491', cell), Paragraph('Comunidad principal', cell)],
    [Paragraph('Charming Shelter Dubai', cell_left), Paragraph('885', cell), Paragraph('Alquileres', cell)],
    [Paragraph('Tu renta en Dubai', cell_left), Paragraph('773', cell), Paragraph('Alquileres', cell)],
    [Paragraph('Eventos y Fiestas 24h Dubai', cell_left), Paragraph('324', cell), Paragraph('Social/Eventos', cell)],
    [Paragraph('Empleos en Dubai', cell_left), Paragraph('538', cell), Paragraph('Empleo', cell)],
    [Paragraph('JOB OFFERS', cell_left), Paragraph('812', cell), Paragraph('Empleo', cell)],
    [Paragraph('CARS BUSINESS Dubai', cell_left), Paragraph('147', cell), Paragraph('Vehiculos', cell)],
    [Paragraph('Revolico Dubai', cell_left), Paragraph('547', cell), Paragraph('Compra-venta general', cell)],
    [Paragraph('ENVIOS ARTIS LOGISTICS', cell_left), Paragraph('447', cell), Paragraph('Envios/Logistica', cell)],
]
story.append(make_table(dubai_data, [AVAILABLE_W*0.40, AVAILABLE_W*0.20, AVAILABLE_W*0.40]))
story.append(Paragraph('Tabla 4: Grupos principales de la comunidad cubana en Dubai/EAU', caption_style))
story.append(Spacer(1, 12))

# ═══════════════════════════════════════════════════════════════
# SECTION 5: TECNOLOGIA E IA
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>5. Ecosistema de Tecnologia e Inteligencia Artificial</b>', h1_style))
story.append(Spacer(1, 8))

story.append(Paragraph(
    'Se identifico un ecosistema tecnologico emergente tanto en WhatsApp como en Telegram. '
    'En WhatsApp, el grupo "Blurcore AI | Comunidad Inteligencia Artificial" cuenta con 101 '
    'participantes y una variante con 95 miembros, mientras que "Comunidad - Desarrolladores '
    'en soluciones de IA" tiene 375 participantes. En Telegram, "Tecnolitas IA" (2,713) '
    'funciona como un foro activo donde se discuten temas como ComfyUI, Flux.dev, SDXL, '
    'y la integracion de MCP (Model Context Protocol) con herramientas de IA. Los mensajes '
    'recientes muestran usuarios intentando conectar Claude Code con instancias de ComfyUI '
    'para automatizar la generacion de imagenes, y discutiendo problemas de limitaciones '
    'de SDXL para simetria facial en imagenes hiperrealistas.',
    body_style
))
story.append(Spacer(1, 8))

story.append(Paragraph(
    'El grupo VIP de WhatsApp (913 participantes) contiene discusiones tecnicas avanzadas, '
    'evidenciado por el mensaje de "Carlos Dominguez" sobre "binding al id" y el usuario '
    '"cerveretadev" preguntando sobre "hackear Hermes para apoderarse del .env", lo que '
    'sugiere una comunidad de desarrolladores con conocimientos de seguridad informatica. '
    'En Telegram, la presencia del ecosistema TON es notable con multiples grupos de desarrollo '
    '(TON Dev Chat EN con 10,821, TON Dev Chat ZH con 5,728), canales de noticias (TON Dev News '
    'con 43,684), y concursos (TON Contests con 141,719). CubanTech Jobs (14,726) y Cuban Dev Jobs '
    '(7,849) representan opportunities laborales especificas para desarrolladores cubanos. '
    'Flutter Cuba Chat (409) indica tambien actividad en desarrollo movil.',
    body_style
))
story.append(Spacer(1, 8))

# ═══════════════════════════════════════════════════════════════
# SECTION 6: ANALISIS OSINT
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>6. Contexto OSINT Global</b>', h1_style))
story.append(Spacer(1, 8))

story.append(Paragraph(
    'El Shadowbroker OSINT recopilo datos de multiples fuentes abiertas que proporcionan '
    'contexto geopolitico relevante para la interpretacion de las actividades detectadas. '
    'El nivel de amenaza global fue calificado como ALTO, con multiples focos de tension: '
    'la actividad sismica en el Cinturon de Fuego del Pacifico (M4.5-M5.4 en Tonga, Fiji, '
    'Japon, Indonesia), la escalada militar en Medio Oriente (condena de Iran a ataques '
    'estadounidenses, intensificacion de ataques israelies en Libano con 11 muertos), y las '
    'amenazas rusas de nuevos ataques sobre Kiev con orden de evacuacion a extranjeros. '
    'Tambien se detecto un brote de Ebola en RD Congo que requiere respuesta rapida.',
    body_style
))
story.append(Spacer(1, 8))

story.append(Paragraph(
    'En el ambito de la aviacion militar estadounidense, se detectaron multiples vuelos HAWK '
    '(posibles misiones ISR), aviones cisterna RCH a altitudes de 7,000-10,000 metros '
    '(operaciones de reabastecimiento), y vuelos NCR a 12,497 metros (posible transporte VIP '
    'o operaciones de contingencia). En el contexto cubano, la Empresa Electrica de La Habana '
    'mantiene un canal de Telegram con 282,474 suscriptores para informar sobre apagones, '
    'lo que refleja la crisis energetica persistente que impacta directamente la economia '
    'informal detectada en los grupos de WhatsApp. Los eventos climaticos extremos en Estados '
    'Unidos (tornados en Florida, inundaciones en Virginia, tormentas severas en Texas) '
    'podrian afectar las operaciones de envios de remesas y la logistica detectada en los '
    'grupos de Dubai.',
    body_style
))
story.append(Spacer(1, 8))

# ═══════════════════════════════════════════════════════════════
# SECTION 7: HALLAZGOS DE SEGURIDAD
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>7. Hallazgos de Seguridad y Actividad Sospechosa</b>', h1_style))
story.append(Spacer(1, 8))

story.append(Paragraph('<b>7.1 Indicadores de Actividad Sospechosa</b>', h2_style))
story.append(Paragraph(
    'El analisis de los mensajes recopilados revelo multiples indicadores de actividad '
    'potencialmente sospechosa que requieren seguimiento. A continuacion se detallan los '
    'hallazgos mas relevantes organizados por nivel de riesgo:',
    body_style
))
story.append(Spacer(1, 8))

risk_data = [
    [Paragraph('<b>Riesgo</b>', header_cell), Paragraph('<b>Indicador</b>', header_cell), Paragraph('<b>Plataforma</b>', header_cell), Paragraph('<b>Detalle</b>', header_cell)],
    [Paragraph('ALTO', ParagraphStyle(name='r1', fontName='DejaVuSerif', fontSize=9, textColor=colors.HexColor('#ff4444'), alignment=TA_CENTER)),
     Paragraph('Fraude financiero', cell_left), Paragraph('Telegram', cell),
     Paragraph('Venta de cuentas PayPal/Binance, documentos KYC falsos', cell_left)],
    [Paragraph('ALTO', ParagraphStyle(name='r2', fontName='DejaVuSerif', fontSize=9, textColor=colors.HexColor('#ff4444'), alignment=TA_CENTER)),
     Paragraph('Evasion KYC/AML', cell_left), Paragraph('Telegram', cell),
     Paragraph('Oferta de documentos digitales para evadir verificaciones', cell_left)],
    [Paragraph('MEDIO', ParagraphStyle(name='r3', fontName='DejaVuSerif', fontSize=9, textColor=colors.HexColor('#ff9933'), alignment=TA_CENTER)),
     Paragraph('Mercado gris divisas', cell_left), Paragraph('Ambas', cell),
     Paragraph('Intercambio informal USD/MLC/EUR sin regulacion', cell_left)],
    [Paragraph('MEDIO', ParagraphStyle(name='r4', fontName='DejaVuSerif', fontSize=9, textColor=colors.HexColor('#ff9933'), alignment=TA_CENTER)),
     Paragraph('Venta saldo escala', cell_left), Paragraph('WhatsApp', cell),
     Paragraph('Operadores con acceso a recargas internacionales mayoristas', cell_left)],
    [Paragraph('BAJO', ParagraphStyle(name='r5', fontName='DejaVuSerif', fontSize=9, textColor=colors.HexColor('#44aa44'), alignment=TA_CENTER)),
     Paragraph('Seguridad .env', cell_left), Paragraph('WhatsApp', cell),
     Paragraph('Discusion sobre acceso no autorizado a configuracion Hermes', cell_left)],
]
story.append(make_table(risk_data, [AVAILABLE_W*0.12, AVAILABLE_W*0.22, AVAILABLE_W*0.15, AVAILABLE_W*0.51]))
story.append(Paragraph('Tabla 5: Indicadores de actividad sospechosa por nivel de riesgo', caption_style))
story.append(Spacer(1, 12))

story.append(Paragraph('<b>7.2 Analisis del Caso de Fraude Financiero</b>', h2_style))
story.append(Paragraph(
    'El caso mas critico detectado involucra al usuario "Miguel" (username: @Miguel_Digital) '
    'en el grupo QvaPay de Telegram. Este individuo ofrece un paquete completo de servicios '
    'financieros no regulados que incluye: (a) tarjetas Visa de aplicaciones financieras como '
    'Zinli, Pana, Kontigo, Kast y Meru; (b) cuentas PayPal para envios internacionales; '
    '(c) cuentas Binance para acceso a criptomonedas; (d) numeros virtuales internacionales; '
    'y (e) "documentos digitales para superar verificaciones KYC". Adicionalmente, recluta '
    'colaboradores en Cuba ofreciendo salario fijo mensual mas 30% de comision, con contacto '
    'a traves de @Soporte_PayPal. Este patron es consistente con operaciones de fraude '
    'financiero organizado que aprovecha las restricciones del sistema bancario cubano para '
    'ofrecer acceso a servicios financieros internacionales de forma ilegal, incluyendo '
    'la falsificacion de identidad para evadir controles KYC/AML.',
    body_style
))
story.append(Spacer(1, 8))

# ═══════════════════════════════════════════════════════════════
# SECTION 8: CONCLUSIONES
# ═══════════════════════════════════════════════════════════════
story.append(Paragraph('<b>8. Conclusiones y Recomendaciones</b>', h1_style))
story.append(Spacer(1, 8))

story.append(Paragraph('<b>8.1 Conclusiones Principales</b>', h2_style))
story.append(Paragraph(
    'El ecosistema digital cubano analizado a traves de WhatsApp y Telegram revela una economia '
    'informal robusta y diversificada que opera en paralelo al sistema formal. WhatsApp funciona '
    'como el mercado primario para el comercio local, la venta de productos basicos, y los '
    'servicios de gestoria, mientras que Telegram sirve como plataforma para actividades '
    'financieras mas sofisticadas (criptomonedas, trading, evasiones KYC) y como canal de '
    'informacion masiva. La comunidad cubana en Dubai/EAU representa un fenomeno migratorio '
    'significativo con una infraestructura digital completa de soporte. Las criptomonedas, '
    'especialmente USDT y TON, emergen como alternativas viables al sistema financiero '
    'tradicional cubano, con QvaPay como puente entre ambos mundos.',
    body_style
))
story.append(Spacer(1, 8))

story.append(Paragraph('<b>8.2 Recomendaciones</b>', h2_style))
recs = [
    'Monitoreo continuo del usuario @Miguel_Digital y la red de fraude financiero detectada en QvaPay, con especial atencion a los documentos KYC falsos y las cuentas bancarias no declaradas.',
    'Seguimiento del ecosistema cripto cubano, particularmente los grupos de intercambio USDT/MLC y las tiendas que aceptan pagos en criptomonedas, para evaluar el impacto en la economia formal.',
    'Analisis profundo de la red de comunidades Dubai/EAU para comprender el flujo migratorio, los canales de remesas, y las posibles violaciones de regulaciones de comercio internacional.',
    'Implementacion de alertas automatizadas en el Hermes Agent para detectar patrones de actividad sospechosa en tiempo real, incluyendo ventas de saldo a gran escala, ofertas de documentos falsos, y patrones de reclutamiento para actividades financieras no reguladas.',
    'Investigacion de la cadena de suministro del mercado de saldo telefonico, desde las agencias internacionales (Ding.com) hasta los vendedores minoristas, para comprender las vias de entrada de divisas al mercado informal cubano.',
]
for i, rec in enumerate(recs, 1):
    story.append(Paragraph(f'{i}. {rec}', bullet_style))
story.append(Spacer(1, 12))

# ── Build ──
doc.build(story)
print(f"Report generated: {output_path}")
