#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Informe de Inteligencia: Analisis de WhatsApp y Telegram
Generado por Whatomate - ReportLab PDF Generation Script
"""

import os
import sys
import hashlib
import subprocess
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm, mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, CondPageBreak, HRFlowable
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ============================================================
# FONT REGISTRATION
# ============================================================
pdfmetrics.registerFont(TTFont('SarasaMonoSC', '/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('SarasaMonoSC-Bold', '/usr/share/fonts/truetype/chinese/SarasaMonoSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Carlito', '/usr/share/fonts/truetype/english/Carlito-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Carlito-Bold', '/usr/share/fonts/truetype/english/Carlito-Bold.ttf'))
pdfmetrics.registerFont(TTFont('LiberationSerif', '/usr/share/fonts/truetype/chinese/LiberationSerif-Regular.ttf'))
pdfmetrics.registerFont(TTFont('LiberationSans', '/usr/share/fonts/truetype/chinese/LiberationSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSansMono', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))

registerFontFamily('Carlito', normal='Carlito', bold='Carlito-Bold')
registerFontFamily('LiberationSerif', normal='LiberationSerif', bold='LiberationSerif')
registerFontFamily('LiberationSans', normal='LiberationSans', bold='LiberationSans')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans-Bold')
registerFontFamily('SarasaMonoSC', normal='SarasaMonoSC', bold='SarasaMonoSC-Bold')

# Font fallback
PDF_SKILL_DIR = "/home/z/my-project/skills/pdf"
_scripts = os.path.join(PDF_SKILL_DIR, "scripts")
if _scripts not in sys.path:
    sys.path.insert(0, _scripts)

try:
    from pdf import install_font_fallback
    install_font_fallback()
    print("Font fallback installed successfully")
except Exception as e:
    print(f"Font fallback install warning: {e}")

# ============================================================
# COLOR PALETTE (user-specified)
# ============================================================
ACCENT       = colors.HexColor('#5532bf')
TEXT_PRIMARY  = colors.HexColor('#1d1d1b')
TEXT_MUTED    = colors.HexColor('#868179')
BG_SURFACE   = colors.HexColor('#e5e3dd')
BG_PAGE      = colors.HexColor('#f4f3f1')

TABLE_HEADER_COLOR = ACCENT
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = BG_SURFACE

# ============================================================
# PAGE DIMENSIONS
# ============================================================
PAGE_W, PAGE_H = A4
LEFT_MARGIN = 1.0 * inch
RIGHT_MARGIN = 1.0 * inch
TOP_MARGIN = 0.8 * inch
BOTTOM_MARGIN = 0.8 * inch
AVAILABLE_WIDTH = PAGE_W - LEFT_MARGIN - RIGHT_MARGIN
AVAILABLE_HEIGHT = PAGE_H - TOP_MARGIN - BOTTOM_MARGIN

# ============================================================
# STYLES
# ============================================================
FONT_BODY = 'LiberationSerif'
FONT_HEADING = 'Carlito-Bold'
FONT_CJK = 'SarasaMonoSC'
FONT_MONO = 'DejaVuSansMono'

styles = getSampleStyleSheet()

# Title style (for document title, not cover)
style_title = ParagraphStyle(
    name='DocTitle',
    fontName=FONT_HEADING,
    fontSize=24,
    leading=30,
    textColor=ACCENT,
    alignment=TA_LEFT,
    spaceBefore=12,
    spaceAfter=6,
)

# H1 style
style_h1 = ParagraphStyle(
    name='H1',
    fontName=FONT_HEADING,
    fontSize=20,
    leading=26,
    textColor=ACCENT,
    alignment=TA_LEFT,
    spaceBefore=18,
    spaceAfter=10,
)

# H2 style
style_h2 = ParagraphStyle(
    name='H2',
    fontName=FONT_HEADING,
    fontSize=15,
    leading=20,
    textColor=TEXT_PRIMARY,
    alignment=TA_LEFT,
    spaceBefore=14,
    spaceAfter=8,
)

# H3 style
style_h3 = ParagraphStyle(
    name='H3',
    fontName=FONT_HEADING,
    fontSize=12,
    leading=16,
    textColor=TEXT_PRIMARY,
    alignment=TA_LEFT,
    spaceBefore=10,
    spaceAfter=6,
)

# Body style
style_body = ParagraphStyle(
    name='Body',
    fontName=FONT_BODY,
    fontSize=10.5,
    leading=17,
    textColor=TEXT_PRIMARY,
    alignment=TA_LEFT,
    spaceBefore=0,
    spaceAfter=6,
    wordWrap='CJK',
)

# Muted style
style_muted = ParagraphStyle(
    name='Muted',
    fontName=FONT_BODY,
    fontSize=9,
    leading=14,
    textColor=TEXT_MUTED,
    alignment=TA_LEFT,
    spaceBefore=0,
    spaceAfter=4,
)

# Bullet style
style_bullet = ParagraphStyle(
    name='Bullet',
    fontName=FONT_BODY,
    fontSize=10.5,
    leading=17,
    textColor=TEXT_PRIMARY,
    alignment=TA_LEFT,
    leftIndent=24,
    spaceBefore=2,
    spaceAfter=2,
    wordWrap='CJK',
)

# Table header style
style_tbl_header = ParagraphStyle(
    name='TblHeader',
    fontName=FONT_HEADING,
    fontSize=9.5,
    leading=13,
    textColor=TABLE_HEADER_TEXT,
    alignment=TA_CENTER,
)

# Table cell style
style_tbl_cell = ParagraphStyle(
    name='TblCell',
    fontName=FONT_BODY,
    fontSize=9,
    leading=13,
    textColor=TEXT_PRIMARY,
    alignment=TA_LEFT,
    wordWrap='CJK',
)

# Table cell center style
style_tbl_cell_center = ParagraphStyle(
    name='TblCellCenter',
    fontName=FONT_BODY,
    fontSize=9,
    leading=13,
    textColor=TEXT_PRIMARY,
    alignment=TA_CENTER,
    wordWrap='CJK',
)

# Table cell right style (for numbers)
style_tbl_cell_right = ParagraphStyle(
    name='TblCellRight',
    fontName=FONT_BODY,
    fontSize=9,
    leading=13,
    textColor=TEXT_PRIMARY,
    alignment=TA_RIGHT,
)

# Caption style
style_caption = ParagraphStyle(
    name='Caption',
    fontName=FONT_BODY,
    fontSize=8.5,
    leading=12,
    textColor=TEXT_MUTED,
    alignment=TA_CENTER,
    spaceBefore=3,
    spaceAfter=6,
)

# TOC styles
style_toc_title = ParagraphStyle(
    name='TOCTitle',
    fontName=FONT_HEADING,
    fontSize=22,
    leading=28,
    textColor=ACCENT,
    alignment=TA_LEFT,
    spaceBefore=12,
    spaceAfter=18,
)

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def P(text, style=style_body):
    """Create a Paragraph with given text and style."""
    return Paragraph(text, style)

def add_heading(text, style, level=0):
    """Create a heading with bookmark for TOC."""
    key = 'h_%s' % hashlib.md5(text.encode('utf-8')).hexdigest()[:8]
    p = Paragraph('<a name="%s"/>%s' % (key, text), style)
    p.bookmark_name = text
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def add_major_section(text, style=style_h1):
    """Add H1 heading with orphan prevention."""
    H1_ORPHAN_THRESHOLD = AVAILABLE_HEIGHT * 0.15
    return [
        CondPageBreak(H1_ORPHAN_THRESHOLD),
        add_heading(text, style, level=0),
    ]

def make_table(data, col_widths, caption=None):
    """Create a styled table with standard formatting."""
    table = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_commands = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('GRID', (0, 0), (-1, -1), 0.5, TEXT_MUTED),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    # Alternating row colors
    for i in range(1, len(data)):
        bg = TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD
        style_commands.append(('BACKGROUND', (0, i), (-1, i), bg))
    table.setStyle(TableStyle(style_commands))
    
    elements = [Spacer(1, 18), table]
    if caption:
        elements.append(Spacer(1, 6))
        elements.append(P(caption, style_caption))
    elements.append(Spacer(1, 18))
    return elements

def fmt_num(n):
    """Format number with thousands separator."""
    if isinstance(n, int):
        return f"{n:,}"
    elif isinstance(n, float):
        return f"{n:,.0f}"
    return str(n)

# ============================================================
# TOC DOCUMENT TEMPLATE
# ============================================================

class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

# ============================================================
# PAGE DECORATIONS (header/footer)
# ============================================================

def page_header_footer(canvas, doc):
    """Add header and footer to each page."""
    canvas.saveState()
    # Footer line
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(0.5)
    canvas.line(LEFT_MARGIN, BOTTOM_MARGIN - 10, PAGE_W - RIGHT_MARGIN, BOTTOM_MARGIN - 10)
    # Footer text
    canvas.setFont(FONT_BODY, 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(LEFT_MARGIN, BOTTOM_MARGIN - 22, "Informe de Inteligencia - Whatomate")
    canvas.drawRightString(PAGE_W - RIGHT_MARGIN, BOTTOM_MARGIN - 22, f"Pagina {doc.page}")
    # Header line (subtle)
    canvas.setStrokeColor(BG_SURFACE)
    canvas.setLineWidth(0.3)
    canvas.line(LEFT_MARGIN, PAGE_H - TOP_MARGIN + 10, PAGE_W - RIGHT_MARGIN, PAGE_H - TOP_MARGIN + 10)
    canvas.restoreState()

# ============================================================
# BUILD DOCUMENT CONTENT
# ============================================================

def build_story():
    story = []

    # --- TABLE OF CONTENTS ---
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(name='TOCLevel0', fontName=FONT_HEADING, fontSize=12, leading=20, leftIndent=20, textColor=ACCENT, spaceBefore=6),
        ParagraphStyle(name='TOCLevel1', fontName=FONT_BODY, fontSize=10.5, leading=18, leftIndent=40, textColor=TEXT_PRIMARY, spaceBefore=2),
    ]
    story.append(P("<b>Tabla de Contenidos</b>", style_toc_title))
    story.append(toc)
    story.append(PageBreak())

    # ================================================================
    # SECTION 1: RESUMEN EJECUTIVO
    # ================================================================
    story.extend(add_major_section("1. Resumen Ejecutivo"))
    
    story.append(P(
        "El presente informe de inteligencia constituye un analisis exhaustivo de las actividades digitales "
        "detectadas a traves de las plataformas de mensajeria WhatsApp y Telegram, complementado con datos "
        "de inteligencia de fuentes abiertas (OSINT) proporcionados por el sistema Shadowbroker. El objetivo "
        "principal de este documento es proporcionar una vision integral del ecosistema digital observado, "
        "identificando patrones de comportamiento, correlaciones entre plataformas y posibles amenazas a la "
        "seguridad que requieren atencion inmediata.",
        style_body
    ))
    story.append(P(
        "El analisis revela un ecosistema digital de gran escala, con 81 grupos y canales en Telegram que "
        "concentran un total de 16,323,379 miembros, y 195 grupos en WhatsApp con actividad significativa "
        "en categorias como compras, ventas, tecnologia y comunidad. La concentracion masiva de usuarios en "
        "grupos de criptomonedas y divisas sugiere un entorno de alto riesgo financiero que merece supervision "
        "continua. El grupo mas grande identificado es Toncoin en Telegram con 7,948,677 miembros, lo cual "
        "indica una influencia masiva en el ecosistema cripto.",
        style_body
    ))
    story.append(P(
        "Los datos OSINT del sistema Shadowbroker indican un nivel de amenaza ALTO, con actividad sismica "
        "significativa (13 terremotos de magnitud 4.5+), 11 vuelos militares rastreados, 500 alertas "
        "climaticas activas y 8 detecciones de incendios. La combinacion de estos indicadores con la "
        "actividad digital observada sugiere un entorno global complejo que requiere monitoreo "
        "multidimensional y coordinacion entre equipos de analisis.",
        style_body
    ))
    story.append(P(
        "Las recomendaciones principales incluyen el fortalecimiento del monitoreo continuo de grupos "
        "financieros, la implementacion de alertas automatizadas para actividades sospechosas, y la "
        "integracion de datos OSINT con el analisis de plataformas de mensajeria para obtener una vision "
        "mas completa del panorama de amenazas. Este informe proporciona las bases para la toma de "
        "decisiones informadas en materia de seguridad digital y prevencion de riesgos.",
        style_body
    ))

    # Key metrics callout table
    metrics_data = [
        [P('<b>Indicador</b>', style_tbl_header), P('<b>Valor</b>', style_tbl_header), P('<b>Plataforma</b>', style_tbl_header)],
        [P('Total grupos/canales', style_tbl_cell), P('81', style_tbl_cell_center), P('Telegram', style_tbl_cell_center)],
        [P('Total miembros', style_tbl_cell), P('16,323,379', style_tbl_cell_center), P('Telegram', style_tbl_cell_center)],
        [P('Total grupos', style_tbl_cell), P('195', style_tbl_cell_center), P('WhatsApp', style_tbl_cell_center)],
        [P('Nivel de amenaza', style_tbl_cell), P('ALTO', style_tbl_cell_center), P('OSINT', style_tbl_cell_center)],
        [P('Alertas climaticas', style_tbl_cell), P('500', style_tbl_cell_center), P('OSINT', style_tbl_cell_center)],
        [P('Vuelos militares', style_tbl_cell), P('11', style_tbl_cell_center), P('OSINT', style_tbl_cell_center)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.45, AVAILABLE_WIDTH * 0.25, AVAILABLE_WIDTH * 0.30]
    story.extend(make_table(metrics_data, col_w, "Tabla 1: Resumen de indicadores clave del informe"))

    # ================================================================
    # SECTION 2: ANALISIS DE TELEGRAM
    # ================================================================
    story.extend(add_major_section("2. Analisis de Telegram"))

    story.append(P(
        "Telegram se ha consolidado como una de las plataformas de mensajeria mas utilizadas para la "
        "comunicacion masiva, la difusion de contenido y la organizacion de comunidades en linea. En el "
        "contexto de este analisis, se han identificado 81 grupos y canales activos que acumulan un total "
        "de 16,323,379 miembros. Esta cifra refleja la capacidad de Telegram para albergar comunidades "
        "de dimensiones significativas, superando ampliamente las limitaciones de tamaño de grupo que "
        "imponen otras plataformas de mensajeria.",
        style_body
    ))
    story.append(P(
        "La distribucion de miembros entre los grupos muestra una alta concentracion: el grupo mas grande, "
        "Toncoin, concentra 7,948,677 miembros, lo que representa aproximadamente el 48.7% del total de "
        "miembros detectados. Esta concentracion extrema indica que un numero reducido de canales domina "
        "el ecosistema, mientras que la mayoria de grupos tienen audiencias significativamente menores. "
        "Este patron es consistente con las dinamicas de las redes sociales donde los super-nodos concentran "
        "la mayor parte de la atencion y la influencia.",
        style_body
    ))

    # 2.1 Categories
    story.append(add_heading("2.1 Distribucion por Categorias", style_h2, level=1))
    
    story.append(P(
        "El analisis categorico de los 81 grupos de Telegram revela siete categorias principales de "
        "actividad. La categoria mas grande en numero de grupos es 'other' con 34 grupos, seguida por "
        "'crypto_trading' con 16 grupos. Sin embargo, en terminos de miembros totales, 'crypto_trading' "
        "domina con 8,652,106 miembros, lo que representa mas del 53% del total. Esta disparidad entre "
        "el numero de grupos y la cantidad de miembros sugiere que los canales de criptomonedas tienden "
        "a tener audiencias masivas, mientras que las categorias como 'ventas_cuba' y 'tech_dev' tienen "
        "comunidades mas nicho y especializadas.",
        style_body
    ))

    cat_data = [
        [P('<b>Categoria</b>', style_tbl_header), P('<b>Grupos</b>', style_tbl_header), 
         P('<b>Miembros Totales</b>', style_tbl_header), P('<b>% del Total</b>', style_tbl_header)],
        [P('crypto_trading', style_tbl_cell), P('16', style_tbl_cell_center), P('8,652,106', style_tbl_cell_right), P('53.0%', style_tbl_cell_center)],
        [P('other', style_tbl_cell), P('34', style_tbl_cell_center), P('6,497,772', style_tbl_cell_right), P('39.8%', style_tbl_cell_center)],
        [P('whale_alerts', style_tbl_cell), P('7', style_tbl_cell_center), P('605,428', style_tbl_cell_right), P('3.7%', style_tbl_cell_center)],
        [P('news_media', style_tbl_cell), P('5', style_tbl_cell_center), P('458,348', style_tbl_cell_right), P('2.8%', style_tbl_cell_center)],
        [P('tech_dev', style_tbl_cell), P('4', style_tbl_cell_center), P('29,541', style_tbl_cell_right), P('0.2%', style_tbl_cell_center)],
        [P('divisas_cuba', style_tbl_cell), P('10', style_tbl_cell_center), P('63,779', style_tbl_cell_right), P('0.4%', style_tbl_cell_center)],
        [P('ventas_cuba', style_tbl_cell), P('5', style_tbl_cell_center), P('16,405', style_tbl_cell_right), P('0.1%', style_tbl_cell_center)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.30, AVAILABLE_WIDTH * 0.15, AVAILABLE_WIDTH * 0.30, AVAILABLE_WIDTH * 0.25]
    story.extend(make_table(cat_data, col_w, "Tabla 2: Distribucion de grupos de Telegram por categoria"))

    # Category details
    story.append(add_heading("2.2 Detalle de Categorias Principales", style_h2, level=1))

    # Crypto Trading detail
    story.append(P(
        "<b>Crypto Trading:</b> Esta categoria agrupa 16 canales con un total de 8,652,106 miembros. "
        "El canal dominante es Toncoin con 7,948,677 miembros, seguido por Toncoin ES (220,367 miembros), "
        "CoinEx (49,000 miembros), Ai Golden Crypto (8,000 miembros) y Cripto Intercambio (9,000 miembros). "
        "La predominancia de canales relacionados con TON (The Open Network) sugiere una fuerte promocion "
        "de este ecosistema cripto, posiblemente vinculada a la integracion nativa de TON con Telegram. "
        "Los canales de intercambio y trading representan puntos de alto riesgo para estafas financieras "
        "y esquemas Ponzi, dada la naturaleza no regulada de estas actividades.",
        style_body
    ))
    
    story.append(P(
        "<b>Divisas Cuba:</b> Con 10 grupos y 63,779 miembros, esta categoria refleja una actividad "
        "economica significativa relacionada con el mercado de divisas en Cuba. Los grupos principales "
        "incluyen USD&MLC Colon (18,600 miembros), Compra y venta USD MLC (17,000 miembros), Cadeca "
        "Online Holguin (9,200 miembros) y CADECA VIRTUAL CUBA (1,700 miembros). Esta actividad esta "
        "vinculada al mercado paralelo de divisas en Cuba, donde se negocian dolares y MLC (Moneda "
        "Libremente Convertible) fuera de los canales oficiales, lo cual representa un riesgo regulatorio "
        "y financiero considerable.",
        style_body
    ))

    story.append(P(
        "<b>News Media:</b> Los 5 canales de noticias acumulan 458,348 miembros, con destacados como "
        "Empresa Electrica de La Habana (282,474 miembros), DESPERTADOR DE LA MATRIX (80,000 miembros), "
        "Exponiendo La Elite (40,000 miembros) y EL CONOCIMIENTO ES PODER (28,000 miembros). Los nombres "
        "de estos canales sugieren una orientacion hacia teorias conspirativas y desinformacion, lo cual "
        "es un patron comun en los ecosistemas de Telegram donde la desinformacion se propaga rapidamente "
        "a traves de canales de gran alcance.",
        style_body
    ))

    story.append(P(
        "<b>Whale Alerts:</b> Los 7 canales de alertas de ballenas (transacciones grandes de criptomonedas) "
        "totalizan 605,428 miembros. Los principales son Whale Alert (314,284 miembros), WhaleBot Alerts "
        "(151,015 miembros), WhaleBot Rektd (23,000 miembros) y Mobydick (11,000 miembros). Estos canales "
        "monitorean movimientos grandes de criptoactivos y son utilizados tanto por traders profesionales "
        "como por inversores minoristas que buscan anticipar movimientos del mercado.",
        style_body
    ))

    story.append(P(
        "<b>Ventas Cuba:</b> Con 5 grupos y 16,405 miembros, esta categoria incluye grupos como La Chopi "
        "Habana (11,000 miembros) y Revolico UCI (2,900 miembros). Estos grupos funcionan como mercados "
        "informales digitales donde los usuarios ofrecen y demandan bienes y servicios, complementando "
        "o sustituyendo los canales de comercio formales en un contexto de escasez economica.",
        style_body
    ))

    story.append(P(
        "<b>Tech Dev:</b> Los 4 grupos de tecnologia y desarrollo acumulan 29,541 miembros, incluyendo "
        "Telegram Developers (14,900 miembros) y Cuban Dev Jobs (7,800 miembros). Esta categoria "
        "representa la comunidad tecnica activa en la plataforma, con un enfoque particular en el "
        "desarrollo de bots y aplicaciones para Telegram, asi como en oportunidades laborales para "
        "desarrolladores cubanos.",
        style_body
    ))

    story.append(P(
        "<b>Otros:</b> La categoria 'other' incluye 34 grupos con 6,497,772 miembros. Los mas "
        "destacados son TrueCaller (5,772,742 miembros), Beaverson Trade (193,686 miembros), Cocoon "
        "(183,307 miembros), TON Contests (141,719 miembros) y Temp Number (113,660 miembros). "
        "La presencia de TrueCaller con casi 6 millones de miembros es notable y sugiere un interes "
        "masivo en herramientas de identificacion de llamadas y proteccion contra spam telefonico.",
        style_body
    ))

    # 2.3 Top 10 Telegram groups
    story.append(add_heading("2.3 Top 10 Grupos de Telegram", style_h2, level=1))
    
    story.append(P(
        "El siguiente ranking presenta los 10 grupos y canales mas grandes identificados en Telegram. "
        "La lista esta encabezada por Toncoin con casi 8 millones de miembros, seguido por TrueCaller "
        "con mas de 5.7 millones. Es significativo que los dos grupos mas grandes concentran mas del "
        "84% del total de miembros de los 10 principales, lo cual demuestra una distribucion extremadamente "
        "desigual que es tipica de los ecosistemas de redes sociales con economia de atencion.",
        style_body
    ))

    top10_tg = [
        [P('<b>#</b>', style_tbl_header), P('<b>Grupo/Canal</b>', style_tbl_header), P('<b>Miembros</b>', style_tbl_header)],
        [P('1', style_tbl_cell_center), P('Toncoin', style_tbl_cell), P('7,948,677', style_tbl_cell_right)],
        [P('2', style_tbl_cell_center), P('TrueCaller', style_tbl_cell), P('5,772,742', style_tbl_cell_right)],
        [P('3', style_tbl_cell_center), P('Whale Alert', style_tbl_cell), P('314,284', style_tbl_cell_right)],
        [P('4', style_tbl_cell_center), P('Empresa Electrica de La Habana', style_tbl_cell), P('282,474', style_tbl_cell_right)],
        [P('5', style_tbl_cell_center), P('Toncoin ES', style_tbl_cell), P('220,367', style_tbl_cell_right)],
        [P('6', style_tbl_cell_center), P('Beaverson Trade', style_tbl_cell), P('193,686', style_tbl_cell_right)],
        [P('7', style_tbl_cell_center), P('Cocoon', style_tbl_cell), P('183,307', style_tbl_cell_right)],
        [P('8', style_tbl_cell_center), P('WhaleBot Alerts', style_tbl_cell), P('151,015', style_tbl_cell_right)],
        [P('9', style_tbl_cell_center), P('TON Contests', style_tbl_cell), P('141,719', style_tbl_cell_right)],
        [P('10', style_tbl_cell_center), P('Temp Number', style_tbl_cell), P('113,660', style_tbl_cell_right)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.08, AVAILABLE_WIDTH * 0.57, AVAILABLE_WIDTH * 0.35]
    story.extend(make_table(top10_tg, col_w, "Tabla 3: Top 10 grupos y canales de Telegram por numero de miembros"))

    # 2.4 Patterns
    story.append(add_heading("2.4 Patrones Identificados en Telegram", style_h2, level=1))

    story.append(P(
        "El analisis de los datos de Telegram revela varios patrones significativos que merecen atencion "
        "detallada. En primer lugar, se observa una fuerte correlacion entre la plataforma Telegram y el "
        "ecosistema cripto, particularmente con TON (The Open Network), que se beneficia de la integracion "
        "nativa con Telegram. Esta relacion crea un ecosistema cerrado donde la promocion de criptomonedas "
        "y las actividades de trading se alimentan mutuamente, generando un ciclo de crecimiento que puede "
        "enmascarar riesgos significativos para los usuarios minoristas.",
        style_body
    ))
    story.append(P(
        "En segundo lugar, la presencia significativa de grupos relacionados con el mercado de divisas "
        "y ventas en Cuba indica una economia digital paralela que opera a traves de Telegram. Esta "
        "actividad refleja las restricciones economicas del pais y la adaptacion de los ciudadanos para "
        "realizar transacciones fuera de los canales oficiales. Los grupos de CADECA virtual y compra-venta "
        "de USD/MLC son indicadores directos de este fenomeno, que tiene implicaciones tanto economicas "
        "como de seguridad para las autoridades reguladoras.",
        style_body
    ))
    story.append(P(
        "En tercer lugar, la categoria de news_media muestra una tendencia preocupante hacia la "
        "desinformacion y las teorias conspirativas. Canales con nombres como 'DESPERTADOR DE LA MATRIX' "
        "y 'Exponiendo La Elite' atraen decenas de miles de seguidores y sirven como vectores de "
        "propagacion de contenido no verificado. Este patron se refuerza con la presencia de canales "
        "de alertas de ballenas que, aunque legitimos en su funcion, pueden ser utilizados para "
        "manipular el sentimiento del mercado cripto.",
        style_body
    ))

    # ================================================================
    # SECTION 3: ANALISIS DE WHATSAPP
    # ================================================================
    story.extend(add_major_section("3. Analisis de WhatsApp"))

    story.append(P(
        "WhatsApp, como la plataforma de mensajeria mas utilizada a nivel mundial, presenta un ecosistema "
        "de grupos con caracteristicas significativamente diferentes a las de Telegram. El analisis ha "
        "identificado 195 grupos activos vinculados al numero de telefono 5350819559, con actividad "
        "conectada confirmada. A diferencia de Telegram, donde los canales pueden tener millones de "
        "miembros, los grupos de WhatsApp tienen un limite de 1024 miembros, lo que resulta en una "
        "distribucion de audiencia mas equilibrada pero con un alcance individual mas limitado.",
        style_body
    ))
    story.append(P(
        "La conectividad de la cuenta WhatsApp analizada esta activa, lo que permite el monitoreo "
        "continuo de las actividades en los grupos. Las categorias principales identificadas reflejan "
        "un perfil de usuario con intereses en tecnologia e inteligencia artificial (27 grupos), "
        "compras y ventas (31 grupos), negocios en Cuba (8 grupos) y comunidad (7 grupos). La categoria "
        "dominante es 'other' con 122 grupos, lo que indica una amplia diversidad de intereses y "
        "actividades que no se ajustan a las categorias principales definidas.",
        style_body
    ))

    # 3.1 Categories
    story.append(add_heading("3.1 Distribucion por Categorias", style_h2, level=1))
    
    story.append(P(
        "La distribucion categorica de los grupos de WhatsApp muestra una predominancia de la categoria "
        "'other' con 122 grupos, lo cual representa el 62.6% del total. Las categorias de compras y "
        "ventas (31 grupos) y tecnologia/IA (27 grupos) son las mas representadas despues de 'other', "
        "lo que sugiere un perfil de usuario orientado al comercio digital y a la adopcion de nuevas "
        "tecnologias. La presencia de grupos de negocios cubanos (8 grupos) refuerza la conexion con "
        "el contexto economico cubano observado tambien en Telegram.",
        style_body
    ))

    wa_cat_data = [
        [P('<b>Categoria</b>', style_tbl_header), P('<b>Grupos</b>', style_tbl_header), P('<b>Porcentaje</b>', style_tbl_header)],
        [P('other', style_tbl_cell), P('122', style_tbl_cell_center), P('62.6%', style_tbl_cell_center)],
        [P('compras_ventas', style_tbl_cell), P('31', style_tbl_cell_center), P('15.9%', style_tbl_cell_center)],
        [P('tech_ai', style_tbl_cell), P('27', style_tbl_cell_center), P('13.8%', style_tbl_cell_center)],
        [P('negocios_cuba', style_tbl_cell), P('8', style_tbl_cell_center), P('4.1%', style_tbl_cell_center)],
        [P('comunidad', style_tbl_cell), P('7', style_tbl_cell_center), P('3.6%', style_tbl_cell_center)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.40, AVAILABLE_WIDTH * 0.30, AVAILABLE_WIDTH * 0.30]
    story.extend(make_table(wa_cat_data, col_w, "Tabla 4: Distribucion de grupos de WhatsApp por categoria"))

    # 3.2 Top 10 WhatsApp groups
    story.append(add_heading("3.2 Top 10 Grupos de WhatsApp", style_h2, level=1))
    
    story.append(P(
        "Los 10 grupos mas grandes de WhatsApp muestran una distribucion mas uniforme que la observada "
        "en Telegram, con miembros que oscilan entre 923 y 1026. El grupo mas grande es 'COMUNIDAD "
        "EMIRATES ARABES + NBOX TIME' con 1026 miembros, seguido de 'Compras y ventas Cascajal' con "
        "1024 miembros y 'Gestion venta triciclos electricos motos' con 1022 miembros. Esta concentracion "
        "cercana al limite de 1024 miembros sugiere que estos grupos operan a maxima capacidad, lo cual "
        "puede indicar una alta demanda y actividad constante dentro de los mismos.",
        style_body
    ))

    top10_wa = [
        [P('<b>#</b>', style_tbl_header), P('<b>Grupo</b>', style_tbl_header), P('<b>Miembros</b>', style_tbl_header)],
        [P('1', style_tbl_cell_center), P('COMUNIDAD EMIRATES ARABES + NBOX TIME', style_tbl_cell), P('1,026', style_tbl_cell_right)],
        [P('2', style_tbl_cell_center), P('Compras y ventas Cascajal', style_tbl_cell), P('1,024', style_tbl_cell_right)],
        [P('3', style_tbl_cell_center), P('Gestion venta triciclos electricos motos', style_tbl_cell), P('1,022', style_tbl_cell_right)],
        [P('4', style_tbl_cell_center), P("D'NICO MERCADO 2", style_tbl_cell), P('1,013', style_tbl_cell_right)],
        [P('5', style_tbl_cell_center), P('Gestion venta triciclos electricos', style_tbl_cell), P('1,007', style_tbl_cell_right)],
        [P('6', style_tbl_cell_center), P('Gestores G&Y', style_tbl_cell), P('995', style_tbl_cell_right)],
        [P('7', style_tbl_cell_center), P('Mi Mascota Viaja Conmigo', style_tbl_cell), P('959', style_tbl_cell_right)],
        [P('8', style_tbl_cell_center), P('Latin Rents Dubai', style_tbl_cell), P('940', style_tbl_cell_right)],
        [P('9', style_tbl_cell_center), P('ONLY SHOPS', style_tbl_cell), P('932', style_tbl_cell_right)],
        [P('10', style_tbl_cell_center), P('LOOK PERFECTO', style_tbl_cell), P('923', style_tbl_cell_right)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.08, AVAILABLE_WIDTH * 0.57, AVAILABLE_WIDTH * 0.35]
    story.extend(make_table(top10_wa, col_w, "Tabla 5: Top 10 grupos de WhatsApp por numero de miembros"))

    # 3.3 Comparison with Telegram
    story.append(add_heading("3.3 Comparacion con Telegram", style_h2, level=1))

    story.append(P(
        "La comparacion entre WhatsApp y Telegram revela diferencias fundamentales en la naturaleza de "
        "las comunidades y las actividades que albergan. Mientras que Telegram se destaca por canales "
        "masivos con millones de miembros orientados a la difusion de contenido (criptomonedas, noticias, "
        "alertas), WhatsApp se caracteriza por grupos mas intimos y orientados a la transaccion directa "
        "(compras, ventas, gestion de negocios). Esta diferencia refleja las arquitecturas de cada "
        "plataforma: Telegram favorece la comunicacion uno-a-muchos, mientras que WhatsApp promueve "
        "la interaccion muchos-a-muchos dentro de limites mas reducidos.",
        style_body
    ))

    comp_data = [
        [P('<b>Caracteristica</b>', style_tbl_header), P('<b>Telegram</b>', style_tbl_header), P('<b>WhatsApp</b>', style_tbl_header)],
        [P('Total grupos', style_tbl_cell), P('81', style_tbl_cell_center), P('195', style_tbl_cell_center)],
        [P('Total miembros', style_tbl_cell), P('16,323,379', style_tbl_cell_center), P('N/A (limite 1024/grupo)', style_tbl_cell_center)],
        [P('Grupo mas grande', style_tbl_cell), P('7,948,677', style_tbl_cell_center), P('1,026', style_tbl_cell_center)],
        [P('Tipo de contenido', style_tbl_cell), P('Difusion masiva', style_tbl_cell_center), P('Transaccion directa', style_tbl_cell_center)],
        [P('Principal actividad', style_tbl_cell), P('Cripto/finanzas', style_tbl_cell_center), P('Compras/ventas', style_tbl_cell_center)],
        [P('Conexion Cuba', style_tbl_cell), P('Divisas/CADECA', style_tbl_cell_center), P('Negocios/mercados', style_tbl_cell_center)],
        [P('Modo comunicacion', style_tbl_cell), P('Uno-a-muchos', style_tbl_cell_center), P('Muchos-a-muchos', style_tbl_cell_center)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.30, AVAILABLE_WIDTH * 0.35, AVAILABLE_WIDTH * 0.35]
    story.extend(make_table(comp_data, col_w, "Tabla 6: Comparativa entre Telegram y WhatsApp"))

    story.append(P(
        "Es notable que ambas plataformas muestran una conexion con el contexto economico cubano, "
        "aunque con enfoques diferentes: en Telegram, la actividad cubana se centra en el mercado de "
        "divisas y CADECAs virtuales, mientras que en WhatsApp se manifiesta a traves de mercados "
        "informales y gestion de negocios. Esta dualidad sugiere que los mismos actores pueden estar "
        "utilizando ambas plataformas de manera complementaria, aprovechando las fortalezas de cada una "
        "para diferentes tipos de actividades economicas.",
        style_body
    ))

    # ================================================================
    # SECTION 4: ANALISIS OSINT SHADOWBROKER
    # ================================================================
    story.extend(add_major_section("4. Analisis OSINT Shadowbroker"))

    story.append(P(
        "El sistema Shadowbroker proporciona datos de inteligencia de fuentes abiertas (OSINT) que "
        "complementan el analisis de plataformas de mensajeria con informacion sobre amenazas globales, "
        "eventos naturales y actividad militar. El nivel de amenaza actual esta clasificado como ALTO, "
        "lo que indica un entorno global con multiples factores de riesgo activos que requieren atencion "
        "prioritaria por parte de los equipos de inteligencia y seguridad.",
        style_body
    ))
    story.append(P(
        "Los datos recopilados por Shadowbroker abarcan cuatro dimensiones principales: actividad sismica, "
        "aviacion militar, condiciones climaticas y detecciones de incendios. Cada una de estas dimensiones "
        "proporciona contexto adicional para evaluar el entorno operativo y los posibles riesgos que pueden "
        "afectar tanto la infraestructura fisica como la ciberseguridad. La convergencia de multiples "
        "indicadores de riesgo simultaneamente refuerza la clasificacion de amenaza ALTO.",
        style_body
    ))

    # 4.1 Threat summary
    story.append(add_heading("4.1 Resumen de Amenazas Globales", style_h2, level=1))

    threat_data = [
        [P('<b>Dimension</b>', style_tbl_header), P('<b>Indicador</b>', style_tbl_header), P('<b>Cantidad</b>', style_tbl_header), P('<b>Nivel</b>', style_tbl_header)],
        [P('Actividad sismica', style_tbl_cell), P('Terremotos M4.5+', style_tbl_cell_center), P('13', style_tbl_cell_center), P('ALTO', style_tbl_cell_center)],
        [P('Aviacion militar', style_tbl_cell), P('Vuelos rastreados', style_tbl_cell_center), P('11', style_tbl_cell_center), P('MODERADO', style_tbl_cell_center)],
        [P('Condiciones climaticas', style_tbl_cell), P('Alertas activas', style_tbl_cell_center), P('500', style_tbl_cell_center), P('EXTREMO', style_tbl_cell_center)],
        [P('Incendios', style_tbl_cell), P('Detecciones activas', style_tbl_cell_center), P('8', style_tbl_cell_center), P('MODERADO', style_tbl_cell_center)],
        [P('Noticias', style_tbl_cell), P('Articulos monitoreados', style_tbl_cell_center), P('30', style_tbl_cell_center), P('INFORMATIVO', style_tbl_cell_center)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.25, AVAILABLE_WIDTH * 0.30, AVAILABLE_WIDTH * 0.20, AVAILABLE_WIDTH * 0.25]
    story.extend(make_table(threat_data, col_w, "Tabla 7: Resumen de indicadores de amenazas globales OSINT"))

    # 4.2 Seismic activity
    story.append(add_heading("4.2 Actividad Sismica", style_h2, level=1))

    story.append(P(
        "Se han detectado 13 terremotos de magnitud 4.5 o superior en el periodo de monitoreo. Esta "
        "actividad sismica es significativa y abarca multiples regiones del mundo, lo que sugiere un "
        "periodo de inestabilidad geologica activa. Los epicentros registrados incluyen zonas de alta "
        "actividad sismica historica como Tonga, la Zona de Fractura de Owen, Chile, Myanmar e Indonesia, "
        "asi como regiones menos frecuentes como Kazajistan y Rusia. La magnitud maxima registrada es "
        "de 5.4 en Tonga, lo cual puede tener implicaciones para la infraestructura local y las "
        "comunicaciones en la region del Pacifico.",
        style_body
    ))

    seismic_data = [
        [P('<b>Region</b>', style_tbl_header), P('<b>Magnitud</b>', style_tbl_header), P('<b>Riesgo Potencial</b>', style_tbl_header)],
        [P('Tonga', style_tbl_cell), P('M5.0', style_tbl_cell_center), P('Tsunami, infraestructura', style_tbl_cell)],
        [P('Tonga', style_tbl_cell), P('M5.4', style_tbl_cell_center), P('Tsunami, infraestructura', style_tbl_cell)],
        [P('Zona de Fractura de Owen', style_tbl_cell), P('M5.1', style_tbl_cell_center), P('Submarino, navegacion', style_tbl_cell)],
        [P('Chile', style_tbl_cell), P('M4.6', style_tbl_cell_center), P('Infraestructura, mineria', style_tbl_cell)],
        [P('Myanmar', style_tbl_cell), P('M4.5', style_tbl_cell_center), P('Edificaciones, comunicaciones', style_tbl_cell)],
        [P('Pakistan', style_tbl_cell), P('M4.6', style_tbl_cell_center), P('Infraestructura fronteriza', style_tbl_cell)],
        [P('Indonesia', style_tbl_cell), P('M4.9', style_tbl_cell_center), P('Volcanico, tsunami', style_tbl_cell)],
        [P('Kazajistan', style_tbl_cell), P('M4.5', style_tbl_cell_center), P('Infraestructura remota', style_tbl_cell)],
        [P('Islas Kermadec', style_tbl_cell), P('M5.3', style_tbl_cell_center), P('Submarino, tsunami', style_tbl_cell)],
        [P('Rusia', style_tbl_cell), P('M4.6', style_tbl_cell_center), P('Infraestructura siberiana', style_tbl_cell)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.35, AVAILABLE_WIDTH * 0.20, AVAILABLE_WIDTH * 0.45]
    story.extend(make_table(seismic_data, col_w, "Tabla 8: Detalle de actividad sismica significativa"))

    # 4.3 Military aviation
    story.append(add_heading("4.3 Aviacion Militar", style_h2, level=1))

    story.append(P(
        "Se han rastreado 11 vuelos militares durante el periodo de monitoreo. Los indicativos de "
        "llamada (callsigns) identificados incluyen multiples vuelos con designacion HAWK de origen "
        "estadounidense, el vuelo FORUS13 de Estonia, y los vuelos NCR325 y RCH460 tambien de "
        "origen estadounidense. La presencia de vuelos HAWK sugiere operaciones de reconnaissance "
        "o patrol en regiones especificas, mientras que los vuelos de transporte (NCR, RCH) indican "
        "movimientos logisticos que podrian estar relacionados con despliegues o reabastecimiento.",
        style_body
    ))
    story.append(P(
        "El vuelo estonio FORUS13 merece atencion especial dado el contexto geopolitico de la region "
        "del Baltico, donde las tensiones entre la OTAN y Rusia han generado un incremento en la "
        "actividad militar de vigilancia. La combinacion de vuelos de reconnaissance y transporte "
        "estadounidenses con la actividad baltica sugiere un periodo de elevada actividad militar "
        "que podria tener implicaciones para la ciberseguridad, ya que los periodos de tension militar "
        "suelen coincidir con incrementos en actividades de ciberespionaje y ataques a infraestructuras "
        "digitales.",
        style_body
    ))

    military_data = [
        [P('<b>Indicativo</b>', style_tbl_header), P('<b>Origen</b>', style_tbl_header), P('<b>Tipo Estimado</b>', style_tbl_header)],
        [P('HAWK (multiples)', style_tbl_cell), P('Estados Unidos', style_tbl_cell_center), P('Reconnaissance/Patrol', style_tbl_cell)],
        [P('FORUS13', style_tbl_cell), P('Estonia', style_tbl_cell_center), P('Vigilancia baltica', style_tbl_cell)],
        [P('NCR325', style_tbl_cell), P('Estados Unidos', style_tbl_cell_center), P('Transporte/Logistica', style_tbl_cell)],
        [P('RCH460', style_tbl_cell), P('Estados Unidos', style_tbl_cell_center), P('Transporte/Logistica', style_tbl_cell)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.30, AVAILABLE_WIDTH * 0.30, AVAILABLE_WIDTH * 0.40]
    story.extend(make_table(military_data, col_w, "Tabla 9: Vuelos militares rastreados"))

    # 4.4 Weather alerts
    story.append(add_heading("4.4 Alertas Climaticas y Detecciones de Incendio", style_h2, level=1))

    story.append(P(
        "El sistema Shadowbroker ha registrado 500 alertas climaticas activas clasificadas como severas "
        "o extremas, lo que representa un volumen excepcionalmente alto de eventos meteorologicos "
        "peligrosos. Estas alertas abarcan multiples regiones y tipos de eventos, incluyendo tormentas "
        "electricas severas, inundaciones, vendavales, olas de calor y nevadas extremas. La magnitud "
        "de estas alertas sugiere que los patrones climaticos globales estan experimentando anomalias "
        "significativas que pueden impactar las operaciones de infraestructura critica, las "
        "comunicaciones y la logistica en multiples regiones del mundo.",
        style_body
    ))
    story.append(P(
        "Adicionalmente, se han detectado 8 incendios activos mediante monitoreo satelital. Los "
        "incendios, aunque moderados en numero, representan un riesgo significativo para la calidad "
        "del aire, la infraestructura y los ecosistemas locales. La combinacion de condiciones "
        "climaticas severas con incendios activos crea un escenario de riesgo compuesto donde los "
        "equipos de emergencia deben gestionar multiples crisis simultaneamente, lo cual puede "
        "saturar los recursos de respuesta y aumentar la vulnerabilidad de las comunidades afectadas.",
        style_body
    ))
    story.append(P(
        "En el contexto de la inteligencia digital, las condiciones climaticas extremas pueden afectar "
        "la disponibilidad de servicios de comunicacion, la operatividad de centros de datos y la "
        "capacidad de respuesta ante incidentes de ciberseguridad. Es recomendable que los equipos de "
        "seguridad digital consideren estos factores en sus planes de continuidad operativa y gestion "
        "de crisis, asegurando la resiliencia de los sistemas criticos ante eventos naturales de gran "
        "escala.",
        style_body
    ))

    # ================================================================
    # SECTION 5: ANALISIS CRUZADO
    # ================================================================
    story.extend(add_major_section("5. Analisis Cruzado"))

    story.append(P(
        "El analisis cruzado integra los datos de Telegram, WhatsApp y las fuentes OSINT de Shadowbroker "
        "para identificar correlaciones, patrones transversales y sinergias entre las diferentes fuentes "
        "de informacion. Este enfoque multidimensional permite construir una vision mas completa del "
        "entorno operativo y detectar amenazas que podrian pasar desapercibidas al analizar cada fuente "
        "de manera aislada. La correlacion de datos de multiples plataformas es fundamental para la "
        "inteligencia moderna, donde las amenazas suelen manifestarse a traves de diferentes vectores "
        "simultaneamente.",
        style_body
    ))

    # 5.1 Cross-platform correlations
    story.append(add_heading("5.1 Correlaciones entre Plataformas", style_h2, level=1))

    story.append(P(
        "La correlacion mas significativa identificada es la presencia simultanea de actividad economica "
        "cubana en ambas plataformas. En Telegram, esta actividad se manifiesta a traves de grupos de "
        "divisas (USD/MLC) y CADECAs virtuales, mientras que en WhatsApp aparece como mercados informales "
        "y grupos de gestion de negocios. Esta dualidad sugiere que los mismos actores economicos utilizan "
        "ambas plataformas de manera complementaria: Telegram para la difusion de tasas de cambio y "
        "informacion financiera a gran audiencia, y WhatsApp para la ejecucion de transacciones "
        "individuales y la coordinacion logistica de compras y ventas.",
        style_body
    ))
    story.append(P(
        "Otra correlacion relevante es la presencia de contenido financiero de alto riesgo en ambas "
        "plataformas. En Telegram, los canales de crypto_trading y whale_alerts constituyen el 28.5% "
        "de los grupos y concentran el 56.7% de los miembros, mientras que en WhatsApp la categoria "
        "compras_ventas representa el 15.9% de los grupos. Aunque las escalas son diferentes, ambas "
        "plataformas muestran un ecosistema donde las actividades financieras no reguladas son "
        "predominantes, lo cual incrementa el riesgo de estafas, fraudes y perdidas economicas para "
        "los usuarios.",
        style_body
    ))

    cross_corr_data = [
        [P('<b>Correlacion</b>', style_tbl_header), P('<b>Telegram</b>', style_tbl_header), P('<b>WhatsApp</b>', style_tbl_header), P('<b>Riesgo</b>', style_tbl_header)],
        [P('Economia cubana', style_tbl_cell), P('Divisas/CADECA', style_tbl_cell), P('Negocios/mercados', style_tbl_cell), P('ALTO', style_tbl_cell_center)],
        [P('Actividad financiera', style_tbl_cell), P('Cripto/whale alerts', style_tbl_cell), P('Compras/ventas', style_tbl_cell), P('ALTO', style_tbl_cell_center)],
        [P('Comunidad cubana', style_tbl_cell), P('Ventas Cuba', style_tbl_cell), P('Comunidad', style_tbl_cell), P('MODERADO', style_tbl_cell_center)],
        [P('Tecnologia', style_tbl_cell), P('Tech dev', style_tbl_cell), P('Tech AI', style_tbl_cell), P('BAJO', style_tbl_cell_center)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.25, AVAILABLE_WIDTH * 0.25, AVAILABLE_WIDTH * 0.25, AVAILABLE_WIDTH * 0.25]
    story.extend(make_table(cross_corr_data, col_w, "Tabla 10: Correlaciones identificadas entre plataformas"))

    # 5.2 User activity profile
    story.append(add_heading("5.2 Perfil de Actividad del Usuario", style_h2, level=1))

    story.append(P(
        "El analisis integrado de las actividades en ambas plataformas permite construir un perfil "
        "detallado del usuario monitoreado (telefono 5350819559). El perfil sugiere un individuo con "
        "fuertes vinculos con la comunidad cubana, activo en el comercio digital y las criptomonedas, "
        "con intereses en tecnologia e inteligencia artificial. La participacion en 195 grupos de WhatsApp "
        "y la conexion a 81 canales de Telegram indica un nivel de actividad digital significativamente "
        "superior al promedio, lo que sugiere un rol activo como intermediario, gestor o promotor en "
        "las comunidades donde participa.",
        style_body
    ))
    story.append(P(
        "La presencia en grupos de Emiratos Arabes Unidos (tanto en WhatsApp como en la categoria "
        "'other' de Telegram) sugiere posibles vinculos con la diaspora cubana en Medio Oriente, un "
        "fenomeno creciente en los ultimos anos. Los grupos como 'COMUNIDAD EMIRATES ARABES + NBOX "
        "TIME' y 'Latin Rents Dubai' indican una red de apoyo y negocios para latinos en la region "
        "del Golfo, lo cual puede estar vinculado a actividades de remesas y comercio internacional "
        "que merecen monitoreo adicional.",
        style_body
    ))
    story.append(P(
        "La convergencia de intereses financieros, conexiones internacionales y actividad tecnologia "
        "configura un perfil de alto valor para la inteligencia digital. El usuario opera en el "
        "limite entre la economia formal e informal, utilizando multiples plataformas para gestionar "
        "diferentes aspectos de sus actividades. Este tipo de perfil es tipico de actores que funcionan "
        "como nodos de conexion en redes economicas transnacionales, facilitando transacciones y "
        "conectando oferta con demanda a traves de fronteras geograficas y regulatorias.",
        style_body
    ))

    # ================================================================
    # SECTION 6: RECOMENDACIONES
    # ================================================================
    story.extend(add_major_section("6. Recomendaciones"))

    story.append(P(
        "Basandose en el analisis integral de los datos recopilados de Telegram, WhatsApp y las fuentes "
        "OSINT de Shadowbroker, se presentan las siguientes recomendaciones organizadas por prioridad "
        "y area de accion. Estas recomendaciones estan disenadas para mitigar los riesgos identificados "
        "y fortalecer la postura de seguridad del equipo de inteligencia.",
        style_body
    ))

    # 6.1 High priority
    story.append(add_heading("6.1 Prioridad Alta", style_h2, level=1))

    story.append(P(
        "<b>Monitoreo continuo de grupos financieros:</b> Implementar un sistema de monitoreo automatizado "
        "para los 16 grupos de crypto_trading en Telegram y los 31 grupos de compras_ventas en WhatsApp. "
        "Este sistema debe incluir alertas para patrones de comportamiento sospechoso, como promesas de "
        "rendimientos garantizados, esquemas de referidos multiples y solicitudes de inversiones con "
        "presion temporal. La prioridad debe centrarse en los canales con mayor numero de miembros, "
        "ya que el impacto potencial de una estafa es proporcional a la audiencia alcanzada.",
        style_body
    ))
    story.append(P(
        "<b>Integracion de datos OSINT con analisis de plataformas:</b> Desarrollar un sistema que "
        "correlacione automaticamente los datos de Shadowbroker con las actividades detectadas en "
        "WhatsApp y Telegram. Por ejemplo, eventos climaticos severos pueden desencadenar estafas "
        "de caridad en grupos de mensajeria, y la actividad militar puede coincidir con campanas de "
        "phishing o desinformacion. La correlacion en tiempo real permite una respuesta mas rapida "
        "y mas efectiva ante amenazas emergentes.",
        style_body
    ))
    story.append(P(
        "<b>Alertas para economia informal cubana:</b> Establecer un protocolo de seguimiento especifico "
        "para los grupos de divisas y ventas en Cuba detectados en ambas plataformas. El monitoreo debe "
        "incluir la deteccion de fluctuaciones anormales en las tasas de cambio publicadas, la "
        "identificacion de patrones de lavado de dinero y la deteccion de posibles violaciones a las "
        "regulaciones financieras internacionales.",
        style_body
    ))

    # 6.2 Medium priority
    story.append(add_heading("6.2 Prioridad Media", style_h2, level=1))

    story.append(P(
        "<b>Analisis de desinformacion:</b> Implementar herramientas de analisis de contenido para los "
        "canales de noticias y medios en Telegram, con enfasis en la deteccion de narrativas de "
        "desinformacion y teorias conspirativas. Los canales como 'DESPERTADOR DE LA MATRIX' y "
        "'Exponiendo La Elite' deben ser monitoreados como posibles vectores de manipulacion de la "
        "opinion publica, especialmente en periodos de crisis o eventos criticos.",
        style_body
    ))
    story.append(P(
        "<b>Seguimiento de actividad militar:</b> Ampliar el monitoreo de vuelos militares a traves de "
        "fuentes OSINT adicionales, incluyendo ADS-B Exchange y datos de radar de codigo abierto. La "
        "correlacion de la actividad militar con patrones de ciberataques puede proporcionar alertas "
        "tempranas de escaladas geopoliticas que afecten la ciberseguridad de infraestructuras criticas.",
        style_body
    ))
    story.append(P(
        "<b>Capacitacion del equipo:</b> Desarrollar un programa de capacitacion especializada en "
        "analisis de criptomonedas y mercados de divisas informales para el equipo de inteligencia. "
        "La comprension de los mecanismos de trading, los patrones de estafa comunes y las herramientas "
        "de analisis blockchain es esencial para un monitoreo efectivo de estos ecosistemas.",
        style_body
    ))

    # 6.3 Low priority
    story.append(add_heading("6.3 Prioridad Baja", style_h2, level=1))

    story.append(P(
        "<b>Expansion del monitoreo a otras plataformas:</b> Considerar la extension del analisis a "
        "plataformas adicionales como Signal, Discord y redes sociales convencionales (X/Twitter, "
        "Facebook) para obtener una vision mas completa del ecosistema digital del usuario monitoreado. "
        "La actividad en estas plataformas puede revelar conexiones y patrones que no son visibles en "
        "WhatsApp y Telegram unicamente.",
        style_body
    ))
    story.append(P(
        "<b>Desarrollo de indicadores de riesgo compuesto:</b> Crear un sistema de puntuacion que "
        "integre multiples fuentes de datos (actividad de plataformas, datos OSINT, indicadores "
        "geopoliticos) en un indice de riesgo compuesto que permita priorizar las acciones de "
        "inteligencia y asignar recursos de manera eficiente. Este sistema debe ser adaptable y "
        "capaz de incorporar nuevas fuentes de datos a medida que se disponga de ellas.",
        style_body
    ))

    rec_summary_data = [
        [P('<b>Recomendacion</b>', style_tbl_header), P('<b>Prioridad</b>', style_tbl_header), P('<b>Plataforma</b>', style_tbl_header), P('<b>Impacto</b>', style_tbl_header)],
        [P('Monitoreo grupos financieros', style_tbl_cell), P('ALTA', style_tbl_cell_center), P('Telegram + WhatsApp', style_tbl_cell_center), P('Critico', style_tbl_cell_center)],
        [P('Integracion datos OSINT', style_tbl_cell), P('ALTA', style_tbl_cell_center), P('Multi-plataforma', style_tbl_cell_center), P('Critico', style_tbl_cell_center)],
        [P('Alertas economia informal', style_tbl_cell), P('ALTA', style_tbl_cell_center), P('Telegram + WhatsApp', style_tbl_cell_center), P('Alto', style_tbl_cell_center)],
        [P('Analisis desinformacion', style_tbl_cell), P('MEDIA', style_tbl_cell_center), P('Telegram', style_tbl_cell_center), P('Moderado', style_tbl_cell_center)],
        [P('Seguimiento actividad militar', style_tbl_cell), P('MEDIA', style_tbl_cell_center), P('OSINT', style_tbl_cell_center), P('Moderado', style_tbl_cell_center)],
        [P('Capacitacion del equipo', style_tbl_cell), P('MEDIA', style_tbl_cell_center), P('Interno', style_tbl_cell_center), P('Moderado', style_tbl_cell_center)],
        [P('Expansion a otras plataformas', style_tbl_cell), P('BAJA', style_tbl_cell_center), P('Multi-plataforma', style_tbl_cell_center), P('Bajo', style_tbl_cell_center)],
        [P('Indicadores riesgo compuesto', style_tbl_cell), P('BAJA', style_tbl_cell_center), P('Multi-plataforma', style_tbl_cell_center), P('Bajo', style_tbl_cell_center)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.35, AVAILABLE_WIDTH * 0.15, AVAILABLE_WIDTH * 0.28, AVAILABLE_WIDTH * 0.22]
    story.extend(make_table(rec_summary_data, col_w, "Tabla 11: Resumen de recomendaciones por prioridad e impacto"))

    # ================================================================
    # SECTION 7: CONCLUSIONES
    # ================================================================
    story.extend(add_major_section("7. Conclusiones"))

    story.append(P(
        "El analisis integral de las plataformas de mensajeria WhatsApp y Telegram, complementado con "
        "los datos OSINT del sistema Shadowbroker, revela un ecosistema digital complejo con multiples "
        "vectores de riesgo que requieren atencion coordinada y sostenida. La escala del ecosistema "
        "observado, con mas de 16 millones de miembros distribuidos en 81 canales de Telegram y 195 "
        "grupos de WhatsApp, indica que las plataformas de mensajeria siguen siendo vectores primarios "
        "para la difusion de contenido financiero de alto riesgo, la economia informal y la desinformacion.",
        style_body
    ))
    story.append(P(
        "La concentracion masiva de usuarios en canales de criptomonedas en Telegram (53% del total de "
        "miembros en la categoria crypto_trading) y la fuerte presencia de grupos de compras y ventas en "
        "WhatsApp (15.9% de los grupos) configuran un entorno donde las actividades financieras no "
        "reguladas son predominantes. Esta situacion, combinada con la conexion transnacional a traves "
        "de grupos de la diaspora cubana en Emiratos Arabes y otros paises, sugiere una red economica "
        "informal sofisticada que opera a traves de multiples plataformas y jurisdicciones.",
        style_body
    ))
    story.append(P(
        "Los datos OSINT de Shadowbroker refuerzan la evaluacion de riesgo con un nivel de amenaza ALTO, "
        "sustentado por la actividad sismica global, la intensa actividad militar en regiones criticas, "
        "y las 500 alertas climaticas severas. Estos factores exogenos pueden exacerbar las vulnerabilidades "
        "del ecosistema digital, creando oportunidades para actores maliciosos que buscan explotar crisis "
        "naturales y geopolitical tension para fines de desinformacion, fraude y ciberespionaje.",
        style_body
    ))
    story.append(P(
        "Las recomendaciones presentadas en este informe proporcionan un marco de accion priorizado que "
        "aborda tanto las amenazas inmediatas (monitoreo de grupos financieros, integracion de datos "
        "OSINT) como las necesidades a mediano plazo (analisis de desinformacion, capacitacion del equipo) "
        "y largo plazo (expansion a otras plataformas, indicadores de riesgo compuesto). La implementacion "
        "progresiva de estas medidas permitira fortalecer la postura de inteligencia y mejorar la capacidad "
        "de deteccion temprana ante amenazas emergentes en el ecosistema digital.",
        style_body
    ))
    story.append(P(
        "Finalmente, es importante destacar que el panorama de amenazas digitales es dinamico y evoluciona "
        "constantemente. Este informe debe ser considerado como una instantanea del estado actual del "
        "ecosistema, y los hallazgos y recomendaciones deben ser actualizados periodicamente a medida que "
        "nuevos datos esten disponibles y las condiciones del entorno cambien. La vigilancia continua, "
        "la adaptacion de las estrategias de monitoreo y la inversion en capacidades de analisis son "
        "elementos esenciales para mantener la eficacia de las operaciones de inteligencia digital.",
        style_body
    ))

    return story


# ============================================================
# COVER PAGE GENERATION
# ============================================================

def generate_cover_html():
    """Generate cover page HTML using Template 01 (clean, minimal)."""
    cover_html = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Informe de Inteligencia</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
@page { size: 794px 1123px; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 794px; height: 1123px; margin: 0; padding: 0; background: #ffffff; font-family: 'Inter', sans-serif; }
@media screen { html { height: auto; display: flex; justify-content: center; } body { transform-origin: top center; scale: min(1, calc(100vh / 1123)); margin: 0 auto; } }

.cover {
    width: 794px;
    height: 1123px;
    position: relative;
    background: #ffffff;
    overflow: hidden;
}

/* Layer 0: Background fill - clean white */

/* Layer 1: Decorative geometric accents - CLIPPED */
.decorative-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    z-index: 1;
    clip-path: inset(0 0 0 0);
}

.accent-bar-top {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 6px;
    background: #5532bf;
}

.accent-line-left {
    position: absolute;
    top: 120px;
    left: 60px;
    width: 3px;
    height: 180px;
    background: #5532bf;
    opacity: 0.6;
}

.accent-circle {
    position: absolute;
    bottom: 180px;
    right: 80px;
    width: 120px;
    height: 120px;
    border: 2px solid #5532bf;
    border-radius: 50%;
    opacity: 0.15;
}

.accent-square {
    position: absolute;
    top: 300px;
    right: 100px;
    width: 40px;
    height: 40px;
    border: 1.5px solid #5532bf;
    opacity: 0.2;
    transform: rotate(15deg);
}

.accent-dot {
    position: absolute;
    top: 520px;
    left: 90px;
    width: 8px;
    height: 8px;
    background: #5532bf;
    border-radius: 50%;
    opacity: 0.3;
}

/* Layer 2: Structure lines */
.structure-layer {
    position: absolute;
    inset: 0;
    z-index: 2;
}

.divider-line {
    position: absolute;
    top: 580px;
    left: 60px;
    width: 674px;
    height: 1px;
    background: #e5e3dd;
}

/* Layer 3: Text content */
.content-layer {
    position: absolute;
    inset: 0;
    z-index: 3;
    padding: 60px;
}

.kicker {
    position: absolute;
    top: 100px;
    left: 80px;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: #5532bf;
    opacity: 0.8;
}

.hero-title {
    position: absolute;
    top: 180px;
    left: 80px;
    width: 630px;
    font-family: 'Playfair Display', serif;
    font-size: 48px;
    font-weight: 700;
    line-height: 1.2;
    color: #1d1d1b;
}

.hero-title .highlight {
    color: #5532bf;
}

.meta-line {
    position: absolute;
    top: 420px;
    left: 80px;
    font-family: 'Inter', sans-serif;
    font-size: 18px;
    font-weight: 400;
    color: #868179;
}

.summary-block {
    position: absolute;
    top: 610px;
    left: 80px;
    width: 580px;
    font-family: 'Inter', sans-serif;
    font-size: 15px;
    font-weight: 400;
    line-height: 1.7;
    color: #1d1d1b;
}

.footer-info {
    position: absolute;
    bottom: 80px;
    left: 80px;
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 400;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #868179;
    opacity: 0.7;
}

.footer-date {
    position: absolute;
    bottom: 80px;
    right: 80px;
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 400;
    color: #868179;
}
</style>
</head>
<body>
<div class="cover">
    <!-- Layer 1: Decorative accents -->
    <div class="decorative-layer">
        <div class="accent-bar-top"></div>
        <div class="accent-line-left"></div>
        <div class="accent-circle"></div>
        <div class="accent-square"></div>
        <div class="accent-dot"></div>
    </div>

    <!-- Layer 2: Structure lines -->
    <div class="structure-layer">
        <div class="divider-line"></div>
    </div>

    <!-- Layer 3: Text content -->
    <div class="content-layer">
        <div class="kicker">Informe de Inteligencia</div>
        <div class="hero-title">
            Analisis de<br><span class="highlight">WhatsApp</span> y<br><span class="highlight">Telegram</span>
        </div>
        <div class="meta-line">Informe integral de inteligencia digital</div>
        <div class="summary-block">
            Analisis exhaustivo de 81 grupos y canales de Telegram con 16,323,379 miembros,
            195 grupos de WhatsApp, y datos OSINT del sistema Shadowbroker con nivel de
            amenaza ALTO. Incluye distribucion categorica, patrones de actividad, correlaciones
            entre plataformas y recomendaciones priorizadas.
        </div>
        <div class="footer-info">Generado por Whatomate</div>
        <div class="footer-date">Marzo 2026</div>
    </div>
</div>
</body>
</html>"""
    
    cover_path = "/home/z/my-project/download/cover.html"
    with open(cover_path, 'w', encoding='utf-8') as f:
        f.write(cover_html)
    return cover_path


# ============================================================
# MAIN EXECUTION
# ============================================================

def main():
    import os as _os
    
    print("=" * 60)
    print("Generando Informe de Inteligencia WhatsApp/Telegram")
    print("=" * 60)

    # Paths
    body_pdf = "/home/z/my-project/download/body.pdf"
    cover_pdf = "/home/z/my-project/download/cover.pdf"
    final_pdf = "/home/z/my-project/download/informe-inteligencia-whatsapp-telegram.pdf"

    # ---- Step 1: Generate Body PDF ----
    print("\n[1/4] Generando PDF del cuerpo del documento...")
    
    doc = TocDocTemplate(
        body_pdf,
        pagesize=A4,
        leftMargin=LEFT_MARGIN,
        rightMargin=RIGHT_MARGIN,
        topMargin=TOP_MARGIN,
        bottomMargin=BOTTOM_MARGIN,
        title="Informe de Inteligencia - Analisis de WhatsApp y Telegram",
        author="Whatomate",
        creator="Whatomate",
        subject="Analisis de inteligencia de plataformas de mensajeria",
    )

    story = build_story()
    doc.multiBuild(story, onLaterPages=page_header_footer, onFirstPage=page_header_footer)
    print(f"  Cuerpo PDF generado: {body_pdf}")

    # ---- Step 2: Generate Cover PDF ----
    print("\n[2/4] Generando pagina de portada...")
    
    cover_html_path = generate_cover_html()
    
    # Validate cover HTML
    try:
        result = subprocess.run(
            ['python3', _os.path.join(PDF_SKILL_DIR, 'scripts', 'poster_validate.py'), 'check-html', cover_html_path],
            capture_output=True, text=True, timeout=30
        )
        print(f"  Validacion HTML: {result.stdout.strip()}")
        if result.returncode != 0:
            print(f"  Advertencia validacion: {result.stderr.strip()}")
    except Exception as e:
        print(f"  Validacion omitida: {e}")

    # Render cover with html2poster.js
    try:
        subprocess.run(
            ['node', _os.path.join(PDF_SKILL_DIR, 'scripts', 'html2poster.js'),
             cover_html_path, '--output', cover_pdf, '--width', '794px'],
            check=True, capture_output=True, text=True, timeout=60
        )
        print(f"  Portada PDF generada: {cover_pdf}")
    except subprocess.CalledProcessError as e:
        print(f"  Error generando portada: {e.stderr}")
        print("  Generando portada alternativa con ReportLab...")
        generate_fallback_cover(cover_pdf)

    # ---- Step 3: Merge Cover + Body ----
    print("\n[3/4] Combinando portada y cuerpo...")
    
    from pypdf import PdfReader, PdfWriter, Transformation

    A4_W, A4_H = 595.28, 841.89

    def normalize_page_to_a4(page):
        box = page.mediabox
        w, h = float(box.width), float(box.height)
        if abs(w - A4_W) > 2 or abs(h - A4_H) > 2:
            sx, sy = A4_W / w, A4_H / h
            page.add_transformation(Transformation().scale(sx=sx, sy=sy))
            page.mediabox.lower_left = (0, 0)
            page.mediabox.upper_right = (A4_W, A4_H)
        return page

    writer = PdfWriter()
    
    # Cover as page 1
    try:
        cover_page = PdfReader(cover_pdf).pages[0]
        writer.add_page(normalize_page_to_a4(cover_page))
    except Exception as e:
        print(f"  Error leyendo portada: {e}")
        # Create a simple blank cover page
        from pypdf import PdfReader as PR
        # We'll just skip the cover and continue
    
    # Body pages follow
    body_reader = PdfReader(body_pdf)
    for page in body_reader.pages:
        writer.add_page(normalize_page_to_a4(page))
    
    writer.add_metadata({
        '/Title': 'Informe de Inteligencia - Analisis de WhatsApp y Telegram',
        '/Author': 'Whatomate',
        '/Creator': 'Whatomate',
        '/Subject': 'Analisis de inteligencia de plataformas de mensajeria',
    })
    
    with open(final_pdf, 'wb') as f:
        writer.write(f)
    
    print(f"  PDF final generado: {final_pdf}")

    # ---- Step 4: QA Checks ----
    print("\n[4/4] Ejecutando controles de calidad...")
    
    try:
        result = subprocess.run(
            ['python3', _os.path.join(PDF_SKILL_DIR, 'scripts', 'pdf_qa.py'), final_pdf],
            capture_output=True, text=True, timeout=30
        )
        print(result.stdout)
        if result.stderr:
            print(f"  QA stderr: {result.stderr[:500]}")
    except Exception as e:
        print(f"  QA omitido: {e}")

    # File info
    file_size = _os.path.getsize(final_pdf)
    page_count = len(PdfReader(final_pdf).pages)
    
    print("\n" + "=" * 60)
    print("INFORME GENERADO EXITOSAMENTE")
    print("=" * 60)
    print(f"  Archivo: {final_pdf}")
    print(f"  Tamano: {file_size / 1024:.1f} KB")
    print(f"  Paginas: {page_count}")
    print("=" * 60)

    # Cleanup temp files
    try:
        _os.remove(body_pdf)
        _os.remove(cover_pdf)
    except:
        pass


def generate_fallback_cover(cover_pdf):
    """Generate a simple cover page using ReportLab as fallback."""
    from reportlab.pdfgen import canvas
    
    c = canvas.Canvas(cover_pdf, pagesize=A4)
    w, h = A4
    
    # Top accent bar
    c.setFillColor(ACCENT)
    c.rect(0, h - 8, w, 8, fill=1, stroke=0)
    
    # Left accent line
    c.setFillColor(ACCENT)
    c.setFillAlpha(0.6)
    c.rect(60, h - 350, 3, 180, fill=1, stroke=0)
    c.setFillAlpha(1.0)
    
    # Kicker
    c.setFont('Carlito', 14)
    c.setFillColor(ACCENT)
    c.drawString(80, h - 120, "INFORME DE INTELIGENCIA")
    
    # Title
    c.setFont('Carlito-Bold', 42)
    c.setFillColor(TEXT_PRIMARY)
    c.drawString(80, h - 210, "Analisis de")
    c.setFillColor(ACCENT)
    c.drawString(80, h - 260, "WhatsApp y")
    c.drawString(80, h - 310, "Telegram")
    
    # Divider
    c.setStrokeColor(BG_SURFACE)
    c.setLineWidth(1)
    c.line(60, h - 370, w - 60, h - 370)
    
    # Subtitle
    c.setFont('Carlito', 16)
    c.setFillColor(TEXT_MUTED)
    c.drawString(80, h - 410, "Informe integral de inteligencia digital")
    
    # Summary
    c.setFont('Carlito', 12)
    c.setFillColor(TEXT_PRIMARY)
    summary_lines = [
        "Analisis exhaustivo de 81 grupos y canales de Telegram con",
        "16,323,379 miembros, 195 grupos de WhatsApp, y datos OSINT",
        "del sistema Shadowbroker con nivel de amenaza ALTO.",
    ]
    y_pos = h - 470
    for line in summary_lines:
        c.drawString(80, y_pos, line)
        y_pos -= 20
    
    # Footer
    c.setFont('Carlito', 11)
    c.setFillColor(TEXT_MUTED)
    c.drawString(80, 80, "GENERADO POR WHATOMATE")
    c.drawRightString(w - 80, 80, "Marzo 2026")
    
    c.save()


if __name__ == '__main__':
    main()
