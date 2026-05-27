#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Estrategia Multi-Agente para Inteligencia Digital
Reporte Consolidado - Whatomate OSINT Ecosystem
"""

import os
import sys
import hashlib
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
# COLOR PALETTE (cascade palette from design_engine)
# ============================================================
PAGE_BG       = colors.HexColor('#f4f5f5')
SECTION_BG    = colors.HexColor('#f1f2f2')
CARD_BG       = colors.HexColor('#edeff0')
TABLE_STRIPE  = colors.HexColor('#edeff0')
HEADER_FILL   = colors.HexColor('#3b5360')
COVER_BLOCK   = colors.HexColor('#3c535e')
BORDER        = colors.HexColor('#abbdc6')
ICON          = colors.HexColor('#486a7b')
ACCENT        = colors.HexColor('#b8263e')
ACCENT_2      = colors.HexColor('#9342cc')
TEXT_PRIMARY   = colors.HexColor('#191b1c')
TEXT_MUTED     = colors.HexColor('#80878a')
SEM_SUCCESS   = colors.HexColor('#4a8c60')
SEM_WARNING   = colors.HexColor('#9a7b3d')
SEM_ERROR     = colors.HexColor('#9a4e48')
SEM_INFO      = colors.HexColor('#4c7196')

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

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
FONT_MONO = 'DejaVuSansMono'

styles = getSampleStyleSheet()

style_title = ParagraphStyle(
    name='DocTitle', fontName=FONT_HEADING, fontSize=24, leading=30,
    textColor=ACCENT, alignment=TA_LEFT, spaceBefore=12, spaceAfter=6,
)

style_h1 = ParagraphStyle(
    name='H1', fontName=FONT_HEADING, fontSize=20, leading=26,
    textColor=HEADER_FILL, alignment=TA_LEFT, spaceBefore=18, spaceAfter=10,
)

style_h2 = ParagraphStyle(
    name='H2', fontName=FONT_HEADING, fontSize=15, leading=20,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, spaceBefore=14, spaceAfter=8,
)

style_h3 = ParagraphStyle(
    name='H3', fontName=FONT_HEADING, fontSize=12, leading=16,
    textColor=ACCENT, alignment=TA_LEFT, spaceBefore=10, spaceAfter=6,
)

style_body = ParagraphStyle(
    name='Body', fontName=FONT_BODY, fontSize=10.5, leading=17,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, spaceBefore=0, spaceAfter=6,
    wordWrap='CJK',
)

style_muted = ParagraphStyle(
    name='Muted', fontName=FONT_BODY, fontSize=9, leading=14,
    textColor=TEXT_MUTED, alignment=TA_LEFT, spaceBefore=0, spaceAfter=4,
)

style_bullet = ParagraphStyle(
    name='Bullet', fontName=FONT_BODY, fontSize=10.5, leading=17,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, leftIndent=24, spaceBefore=2,
    spaceAfter=2, wordWrap='CJK', bulletIndent=12,
)

style_tbl_header = ParagraphStyle(
    name='TblHeader', fontName=FONT_HEADING, fontSize=9.5, leading=13,
    textColor=TABLE_HEADER_TEXT, alignment=TA_CENTER,
)

style_tbl_cell = ParagraphStyle(
    name='TblCell', fontName=FONT_BODY, fontSize=9, leading=13,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, wordWrap='CJK',
)

style_tbl_cell_center = ParagraphStyle(
    name='TblCellCenter', fontName=FONT_BODY, fontSize=9, leading=13,
    textColor=TEXT_PRIMARY, alignment=TA_CENTER, wordWrap='CJK',
)

style_tbl_cell_right = ParagraphStyle(
    name='TblCellRight', fontName=FONT_BODY, fontSize=9, leading=13,
    textColor=TEXT_PRIMARY, alignment=TA_RIGHT,
)

style_caption = ParagraphStyle(
    name='Caption', fontName=FONT_BODY, fontSize=8.5, leading=12,
    textColor=TEXT_MUTED, alignment=TA_CENTER, spaceBefore=3, spaceAfter=6,
)

style_toc_title = ParagraphStyle(
    name='TOCTitle', fontName=FONT_HEADING, fontSize=22, leading=28,
    textColor=HEADER_FILL, alignment=TA_LEFT, spaceBefore=12, spaceAfter=18,
)

style_callout = ParagraphStyle(
    name='Callout', fontName=FONT_BODY, fontSize=10, leading=16,
    textColor=HEADER_FILL, alignment=TA_LEFT, leftIndent=20,
    borderPadding=8, spaceBefore=8, spaceAfter=8,
)

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def P(text, style=style_body):
    return Paragraph(text, style)

def add_heading(text, style, level=0):
    key = 'h_%s' % hashlib.md5(text.encode('utf-8')).hexdigest()[:8]
    p = Paragraph('<a name="%s"/>%s' % (key, text), style)
    p.bookmark_name = text
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def add_major_section(text, style=style_h1):
    H1_ORPHAN_THRESHOLD = AVAILABLE_HEIGHT * 0.15
    return [
        CondPageBreak(H1_ORPHAN_THRESHOLD),
        add_heading(text, style, level=0),
    ]

def make_table(data, col_widths, caption=None):
    table = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_commands = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
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

def make_callout(text, border_color=ACCENT):
    """Create a callout box with left border accent."""
    t = Table(
        [[Paragraph(text, style_callout)]],
        colWidths=[AVAILABLE_WIDTH - 20],
        hAlign='CENTER'
    )
    t.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 16),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LINEBEFOREVOLOR', (0, 0), (0, -1), border_color),
        ('LINEBEFOREWIDTH', (0, 0), (0, -1), 3),
        ('LINEBEFORE', (0, 0), (0, -1), 3, border_color),
        ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
    ]))
    return [Spacer(1, 10), t, Spacer(1, 10)]

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
# PAGE DECORATIONS
# ============================================================

def page_header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(HEADER_FILL)
    canvas.setLineWidth(0.5)
    canvas.line(LEFT_MARGIN, BOTTOM_MARGIN - 10, PAGE_W - RIGHT_MARGIN, BOTTOM_MARGIN - 10)
    canvas.setFont(FONT_BODY, 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(LEFT_MARGIN, BOTTOM_MARGIN - 22, "Estrategia Multi-Agente - Whatomate OSINT")
    canvas.drawRightString(PAGE_W - RIGHT_MARGIN, BOTTOM_MARGIN - 22, f"Pagina {doc.page}")
    canvas.setStrokeColor(BORDER)
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
        ParagraphStyle(name='TOCLevel0', fontName=FONT_HEADING, fontSize=12, leading=20, leftIndent=20, textColor=HEADER_FILL, spaceBefore=6),
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
        "El presente documento constituye la estrategia integral para la operacion del ecosistema "
        "Whatomate OSINT, definiendo la arquitectura multi-agente que soporta la ingesta de datos "
        "desde multiples fuentes (WhatsApp, Telegram, OSINT), el analisis semantico y cuantitativo "
        "en tiempo real, el monitoreo continuo de indicadores de amenaza, y la generacion automatizada "
        "de reportes de inteligencia. El objetivo principal es establecer un marco operativo que "
        "permita la toma de decisiones informada y oportuna en un entorno digital cada vez mas "
        "complejo y dinamico.",
        style_body
    ))
    story.append(P(
        "El ecosistema Whatomate ha demostrado su capacidad para procesar volumenes significativos "
        "de datos: 195 grupos de WhatsApp, 81 canales de Telegram con mas de 16 millones de miembros "
        "agregados, y datos OSINT de 6 fuentes abiertas (sismica, aviacion militar, clima, incendios, "
        "noticias, eventos globales). Sin embargo, la operacion actual depende en gran medida de "
        "intervencion manual para la activacion de agentes, la interpretacion de datos y la generacion "
        "de reportes. Este documento propone una evolucion hacia un sistema autonomo donde multiples "
        "agentes especializados operan de forma coordinada y continua.",
        style_body
    ))
    story.append(P(
        "Las estrategias de toma de decisiones aqui presentadas abarcan desde enfoques reactivos "
        "basados en umbrales y alertas, hasta estrategias predictivas que utilizan modelos de "
        "aprendizaje automatico para anticipar amenazas y oportunidades. Cada estrategia se presenta "
        "con sus mecanismos de implementacion, indicadores clave de rendimiento (KPIs), y protocolos "
        "de escalacion para situaciones criticas.",
        style_body
    ))

    # Key metrics callout
    story.extend(make_callout(
        "<b>Alcance actual del ecosistema:</b> 276 grupos/canales monitoreados | "
        "16.3M+ miembros en Telegram | 195 grupos WhatsApp | 6 fuentes OSINT activas | "
        "19 herramientas de inteligencia | Nivel de amenaza global: ALTO"
    ))

    metrics_data = [
        [P('<b>Indicador</b>', style_tbl_header), P('<b>Valor Actual</b>', style_tbl_header), P('<b>Objetivo</b>', style_tbl_header)],
        [P('Fuentes de datos activas', style_tbl_cell), P('3 (WhatsApp, Telegram, OSINT)', style_tbl_cell_center), P('7+ (agregar Redes Sociales, Dark Web, RSS)', style_tbl_cell_center)],
        [P('Frecuencia de analisis', style_tbl_cell), P('Bajo demanda', style_tbl_cell_center), P('Continuo (cada 15 min)', style_tbl_cell_center)],
        [P('Tiempo de generacion de reporte', style_tbl_cell), P('30-60 min (manual)', style_tbl_cell_center), P('5 min (automatizado)', style_tbl_cell_center)],
        [P('Cobertura de alertas', style_tbl_cell), P('0% (sin alertas automaticas)', style_tbl_cell_center), P('95%+ (alertas en tiempo real)', style_tbl_cell_center)],
        [P('Agentes activos simultaneos', style_tbl_cell), P('1 (manual)', style_tbl_cell_center), P('6+ (autonomos)', style_tbl_cell_center)],
        [P('Decisiones automatizadas', style_tbl_cell), P('0%', style_tbl_cell_center), P('80%+ de decisiones rutinarias', style_tbl_cell_center)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.35, AVAILABLE_WIDTH * 0.30, AVAILABLE_WIDTH * 0.35]
    story.extend(make_table(metrics_data, col_w, "Tabla 1: Estado actual vs. objetivo del ecosistema multi-agente"))

    # ================================================================
    # SECTION 2: ARQUITECTURA MULTI-AGENTE
    # ================================================================
    story.extend(add_major_section("2. Arquitectura Multi-Agente"))

    story.append(P(
        "La arquitectura multi-agente propuesta se fundamenta en el paradigma de sistemas "
        "distribuidos donde cada agente posee capacidades especializadas, autonomia operativa "
        "y la habilidad de comunicarse con otros agentes a traves de un bus de eventos central. "
        "Este diseno permite que el sistema escale horizontalmente, tolere fallos parciales sin "
        "perder funcionalidad critica, y mantenga la coherencia de las decisiones a traves de "
        "protocolos de consenso y priorizacion. La arquitectura se inspira en modelos de "
        "inteligencia artificial distribuida como el framework BDI (Belief-Desire-Intention) "
        "y los sistemas multi-agente cooperativos de la literatura cientifica.",
        style_body
    ))

    # 2.1 Agent layers
    story.append(add_heading("2.1 Capas de Agentes", style_h2, level=1))

    story.append(P(
        "El sistema se organiza en cuatro capas funcionales que operan de forma jerarquica "
        "pero con comunicacion bidireccional. Cada capa tiene responsabilidades bien definidas "
        "y puede operar de forma semi-independiente, escalando informacion a las capas superiores "
        "cuando se detectan patrones que superan los umbrales establecidos o que requieren "
        "intervencion de agentes con mayor capacidad de decision.",
        style_body
    ))

    layers_data = [
        [P('<b>Capa</b>', style_tbl_header), P('<b>Funcion Principal</b>', style_tbl_header), P('<b>Agentes</b>', style_tbl_header), P('<b>Frecuencia</b>', style_tbl_header)],
        [P('Ingesta', style_tbl_cell), P('Recoleccion de datos de fuentes primarias', style_tbl_cell), P('WhatsApp Bridge, Telethon, OSINT Scrapers', style_tbl_cell), P('Continuo (tiempo real)', style_tbl_cell_center)],
        [P('Analisis', style_tbl_cell), P('Procesamiento semantico y cuantitativo', style_tbl_cell), P('Cognitive API, NLP, Pattern Detector', style_tbl_cell), P('Cada 15 min / bajo demanda', style_tbl_cell_center)],
        [P('Monitoreo', style_tbl_cell), P('Vigilancia de umbrales y alertas', style_tbl_cell), P('Threshold Monitor, Anomaly Detector, Alert Engine', style_tbl_cell), P('Continuo (cada 1 min)', style_tbl_cell_center)],
        [P('Reportes', style_tbl_cell), P('Generacion de informes y dashboards', style_tbl_cell), P('Report Generator, Dashboard Builder, Scheduler', style_tbl_cell), P('Programado + bajo demanda', style_tbl_cell_center)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.15, AVAILABLE_WIDTH * 0.30, AVAILABLE_WIDTH * 0.35, AVAILABLE_WIDTH * 0.20]
    story.extend(make_table(layers_data, col_w, "Tabla 2: Capas funcionales del sistema multi-agente"))

    # 2.2 Ingesta agents
    story.append(add_heading("2.2 Agentes de Ingesta de Datos", style_h2, level=1))

    story.append(P(
        "Los agentes de ingesta constituyen la primera linea de operacion del ecosistema. "
        "Su funcion es recolectar datos de las fuentes primarias de forma continua y confiable, "
        "normalizando la informacion en un formato unificado que pueda ser procesado por los "
        "agentes de analisis. Cada agente de ingesta mantiene una conexion persistente con su "
        "fuente respectiva y implementa mecanismos de reconexion automatica, buffer de datos "
        "pendientes y deduplicacion de mensajes para garantizar la integridad y completitud "
        "de los datos recopilados.",
        style_body
    ))

    story.append(add_heading("2.2.1 Agente WhatsApp Bridge", style_h3, level=1))

    story.append(P(
        "El agente WhatsApp Bridge opera sobre la biblioteca Baileys para mantener una conexion "
        "persistente con la plataforma WhatsApp a traves del numero +5350819559. Este agente "
        "gestiona la autenticacion mediante codigo QR, el monitoreo de 195 grupos activos, y "
        "la captura de mensajes en tiempo real con metadata completa (remitente, timestamp, tipo "
        "de medio, estado de entrega). La arquitectura actual implementa un modelo de sondeo "
        "pasivo donde los mensajes se capturan a medida que llegan, pero no se realiza un "
        "analisis proactivo del contenido hasta que el Hermes Agent recibe un comando explicito.",
        style_body
    ))
    story.append(P(
        "La estrategia propuesta evoluciona este agente hacia un modo de captura activa donde "
        "cada mensaje entrante se clasifica automaticamente por categoria tematica (comercio, "
        "finanzas, seguridad, migracion) utilizando el Cognitive API, y se almacena en una base "
        "de datos temporal con indices de busqueda de texto completo. Adicionalmente, se implementa "
        "un mecanismo de deteccion de menciones criticas (nombres de personas, numeros de telefono, "
        "direcciones de criptomonedas) que activan alertas inmediatas al agente de monitoreo.",
        style_body
    ))

    story.append(add_heading("2.2.2 Agente Telethon (Telegram)", style_h3, level=1))

    story.append(P(
        "El agente Telethon gestiona la conexion con Telegram a traves de la API oficial, "
        "monitoreando 81 grupos y canales que acumulan mas de 16 millones de miembros. A diferencia "
        "de WhatsApp, Telegram ofrece una API robusta que permite la suscripcion a eventos en "
        "tiempo real, la descarga historica de mensajes, y la identificacion precisa de canales "
        "versus supergrupos. El agente actual mantiene una conexion daemon persistente que "
        "verifica el estado de la cuenta y puede listar grupos, pero no realiza captura continua "
        "de mensajes de forma autonoma.",
        style_body
    ))
    story.append(P(
        "La evolucion propuesta transforma este agente en un capturador proactivo que monitorea "
        "selectivamente los canales de alto impacto (criptomonedas, noticias, alertas de ballenas) "
        "con prioridad basada en la cantidad de miembros y la relevancia tematica. Se implementara "
        "un sistema de colas donde los canales se priorizan dinamicamente segun la frecuencia de "
        "actividad y los indicadores de riesgo detectados por el agente de analisis. Los canales "
        "con mas de 100,000 miembros se muestrean cada 5 minutos, mientras que los canales menores "
        "se verifican cada 30 minutos para optimizar el uso de recursos.",
        style_body
    ))

    story.append(add_heading("2.2.3 Agentes OSINT Shadowbroker", style_h3, level=1))

    story.append(P(
        "El sistema Shadowbroker opera 6 scrapers independientes que recopilan datos de fuentes "
        "abiertas: actividad sismica global (USGS), vuelos militares (ADS-B Exchange), alertas "
        "climaticas (NOAA), detecciones de incendios (NASA FIRMS), noticias globales (GDELT) y "
        "movimiento de embarcaciones (MarineTraffic). Cada scraper opera con su propia frecuencia "
        "de actualizacion y formato de datos, lo que requiere un proceso de normalizacion antes "
        "de que la informacion pueda ser utilizada por los agentes de analisis.",
        style_body
    ))
    story.append(P(
        "La estrategia de ingesta OSINT propuesta implementa un sistema de webhooks donde cada "
        "scraper publica sus hallazgos en un stream de Redis tan pronto como se detecta un evento "
        "nuevo, eliminando la latencia del sondeo periodico. Los eventos criticos (terremotos de "
        "magnitud superior a 5.0, vuelos militares en zonas de conflicto, alertas climaticas "
        "extremas) se publican en un canal de alta prioridad que dispara alertas inmediatas. Los "
        "eventos informativos se acumulan para el analisis periodico. Adicionalmente, se integraran "
        "nuevos scrapers para fuentes de inteligencia de ciberamenazas (VirusTotal, Shodan, "
        "Have I Been Pwned) y monitoreo de redes sociales (Twitter/X, Facebook).",
        style_body
    ))

    # 2.3 Analysis agents
    story.append(add_heading("2.3 Agentes de Analisis", style_h2, level=1))

    story.append(P(
        "Los agentes de analisis transforman los datos crudos recopilados por los agentes de "
        "ingesta en inteligencia procesable. Este proceso implica multiples dimensiones: analisis "
        "semantico para comprender el significado y la intencion de los mensajes, analisis "
        "cuantitativo para identificar tendencias numericas y anomalias estadisticas, y analisis "
        "relacional para mapear las conexiones entre actores, grupos y eventos a traves de las "
        "diferentes plataformas.",
        style_body
    ))

    analysis_data = [
        [P('<b>Agente</b>', style_tbl_header), P('<b>Capacidad</b>', style_tbl_header), P('<b>Tecnologia</b>', style_tbl_header), P('<b>Output</b>', style_tbl_header)],
        [P('Semantic Analyzer', style_tbl_cell), P('Clasificacion de temas, deteccion de sentimiento, extraccion de entidades', style_tbl_cell), P('Cognitive API + LLM', style_tbl_cell), P('Tags, entidades, score de riesgo', style_tbl_cell)],
        [P('Pattern Detector', style_tbl_cell), P('Identificacion de patrones repetitivos, anomalias estadisticas', style_tbl_cell), P('NLP + Statistical Models', style_tbl_cell), P('Patrones detectados, desviaciones', style_tbl_cell)],
        [P('Cross-Platform Correlator', style_tbl_cell), P('Conexion de datos entre WhatsApp, Telegram y OSINT', style_tbl_cell), P('Graph Database + Entity Resolution', style_tbl_cell), P('Redes de actores, eventos correlacionados', style_tbl_cell)],
        [P('Risk Scorer', style_tbl_cell), P('Evaluacion del nivel de riesgo de actividades detectadas', style_tbl_cell), P('Reglas + ML Classifier', style_tbl_cell), P('Score de riesgo (0-100), categoria de alerta', style_tbl_cell)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.18, AVAILABLE_WIDTH * 0.32, AVAILABLE_WIDTH * 0.22, AVAILABLE_WIDTH * 0.28]
    story.extend(make_table(analysis_data, col_w, "Tabla 3: Agentes de analisis y sus capacidades"))

    # 2.4 Monitoring agents
    story.append(add_heading("2.4 Agentes de Monitoreo", style_h2, level=1))

    story.append(P(
        "Los agentes de monitoreo constituyen el sistema nervioso del ecosistema, operando de forma "
        "continua para detectar condiciones que requieren atencion inmediata o escalamiento. A "
        "diferencia de los agentes de analisis que procesan datos de forma periodica o bajo demanda, "
        "los agentes de monitoreo evaluan flujos de datos en tiempo real contra conjuntos de reglas "
        "y umbrales predefinidos, disparando alertas cuando se exceden los limites establecidos.",
        style_body
    ))
    story.append(P(
        "El diseño propuesto implementa tres tipos de agentes de monitoreo complementarios. El "
        "Threshold Monitor evalua indicadores cuantitativos contra umbrales fijos y adaptativos, "
        "como por ejemplo el numero de mensajes por hora en un grupo, el volumen de transacciones "
        "cripto mencionadas, o el numero de terremotos de magnitud elevada en un periodo de 24 horas. "
        "El Anomaly Detector utiliza modelos estadisticos para identificar desviaciones significativas "
        "del comportamiento historico, como picos de actividad en grupos normalmente inactivos, "
        "aparicion de nuevas entidades mencionadas frecuentemente, o cambios repentinos en los "
        "patrones de comunicacion. El Alert Engine consolida las senales de ambos monitores y "
        "determina el nivel de alerta apropiado, las acciones automaticas a ejecutar y los "
        "destinatarios de las notificaciones.",
        style_body
    ))

    # 2.5 Report agents
    story.append(add_heading("2.5 Agentes de Generacion de Reportes", style_h2, level=1))

    story.append(P(
        "Los agentes de generacion de reportes automatizan la produccion de informes de inteligencia "
        "en multiples formatos y niveles de detalle. El sistema propuesto implementa tres modalidades "
        "de generacion: reportes programados que se producen a intervalos regulares (diario, semanal, "
        "mensual), reportes bajo demanda que se activan por comandos del operador o por eventos "
        "especificos detectados por los agentes de monitoreo, y reportes de alerta que se generan "
        "automaticamente cuando se detecta una amenaza critica.",
        style_body
    ))
    story.append(P(
        "Cada tipo de reporte sigue un template predefinido que asegura la consistencia y la "
        "completitud de la informacion. Los reportes diarios incluyen un resumen ejecutivo con "
        "las metricas clave, un listado de alertas activas y un estado de las fuentes de datos. "
        "Los reportes semanales incorporan analisis de tendencias, comparativas entre periodos "
        "y recomendaciones de accion. Los reportes mensuales ofrecen una vision estrategica con "
        "evaluacion del panorama de amenazas, efectividad del sistema y propuestas de mejora. "
        "Todos los reportes se generan en formato PDF profesional con graficos y tablas "
        "automatizadas, utilizando las capacidades del skill de generacion de documentos "
        "del ecosistema Whatomate.",
        style_body
    ))

    # ================================================================
    # SECTION 3: ESTRATEGIAS DE TOMA DE DECISIONES
    # ================================================================
    story.extend(add_major_section("3. Estrategias de Toma de Decisiones"))

    story.append(P(
        "La toma de decisiones en un entorno de inteligencia digital requiere un marco robusto "
        "que integre multiples fuentes de informacion, considere diferentes horizontes temporales "
        "y equilibre la velocidad de respuesta con la profundidad del analisis. A continuacion "
        "se presentan seis estrategias complementarias que cubren desde la respuesta inmediata "
        "ante amenazas criticas hasta la planificacion estrategica a largo plazo.",
        style_body
    ))

    # 3.1 Threshold-based
    story.append(add_heading("3.1 Estrategia Basada en Umbrales (Reactiva)", style_h2, level=1))

    story.append(P(
        "La estrategia basada en umbrales es el mecanismo mas fundamental y de mayor velocidad "
        "de respuesta en el sistema. Funciona estableciendo limites numericos predefinidos para "
        "indicadores clave, de modo que cuando un indicador supera su umbral, se dispara una "
        "accion automatica sin necesidad de intervencion humana. Esta estrategia es ideal para "
        "situaciones donde la velocidad de respuesta es critica y los patrones de activacion "
        "son bien conocidos y estables en el tiempo.",
        style_body
    ))

    threshold_data = [
        [P('<b>Indicador</b>', style_tbl_header), P('<b>Umbral</b>', style_tbl_header), P('<b>Accion</b>', style_tbl_header), P('<b>Prioridad</b>', style_tbl_header)],
        [P('Menciones de fraude financiero', style_tbl_cell), P('3+ menciones en 1 hora', style_tbl_cell_center), P('Alerta roja + reporte inmediato', style_tbl_cell), P('CRITICA', style_tbl_cell_center)],
        [P('Terremotos M5.0+', style_tbl_cell), P('Magnitud >= 5.0', style_tbl_cell_center), P('Alerta sismica + verificacion tsunami', style_tbl_cell), P('ALTA', style_tbl_cell_center)],
        [P('Vuelos militares zona conflicto', style_tbl_cell), P('3+ vuelos en 2 horas', style_tbl_cell_center), P('Escalacion + monitoreo intensivo', style_tbl_cell), P('ALTA', style_tbl_cell_center)],
        [P('Mensajes sospechosos WhatsApp', style_tbl_cell), P('10+ mensajes/hora con palabras clave', style_tbl_cell_center), P('Reporte al analista + captura', style_tbl_cell), P('MEDIA', style_tbl_cell_center)],
        [P('Actividad grupos inactivos', style_tbl_cell), P('5x la media historica', style_tbl_cell_center), P('Investigacion + alerta informativa', style_tbl_cell), P('MEDIA', style_tbl_cell_center)],
        [P('Alertas climaticas extremas', style_tbl_cell), P('200+ alertas simultaneas', style_tbl_cell_center), P('Notificacion + impacto en logistica', style_tbl_cell), P('BAJA', style_tbl_cell_center)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.28, AVAILABLE_WIDTH * 0.22, AVAILABLE_WIDTH * 0.32, AVAILABLE_WIDTH * 0.18]
    story.extend(make_table(threshold_data, col_w, "Tabla 4: Umbrales de activacion y acciones automaticas"))

    # 3.2 Pattern-based
    story.append(add_heading("3.2 Estrategia Basada en Patrones (Deductiva)", style_h2, level=1))

    story.append(P(
        "La estrategia basada en patrones utiliza el reconocimiento de secuencias y combinaciones "
        "de eventos que, individualmente, podrian no superar los umbrales de alerta, pero que en "
        "conjunto indican una situacion de riesgo significativa. Este enfoque es especialmente "
        "valioso para detectar amenazas sofisticadas que evaden los detectores de umbral simple "
        "al distribuir sus actividades en el tiempo o entre multiples canales.",
        style_body
    ))
    story.append(P(
        "Por ejemplo, un actor malicioso podria distribuir la venta de documentos KYC falsos "
        "entre tres grupos diferentes de Telegram, publicando solo un mensaje en cada uno. "
        "Individualmente, estos mensajes no activarian ningun umbral de alerta, pero el patron "
        "de actividad cruzada entre grupos (mismo vendedor, mismo tipo de oferta, mismo canal "
        "de contacto) es un indicador claro de actividad fraudulenta coordinada. El agente "
        "Pattern Detector utiliza el Cognitive API para identificar estos patrones mediante "
        "analisis de similitud semantica y resolucion de entidades, correlacionando menciones "
        "del mismo usuario (@Miguel_Digital) o del mismo servicio (@Soporte_PayPal) a traves "
        "de multiples grupos y plataformas.",
        style_body
    ))

    patterns_data = [
        [P('<b>Patron</b>', style_tbl_header), P('<b>Secuencia</b>', style_tbl_header), P('<b>Riesgo</b>', style_tbl_header)],
        [P('Fraude multi-canal', style_tbl_cell), P('Oferta en Telegram + reclutamiento en WhatsApp + pago en Binance', style_tbl_cell), P('CRITICO', style_tbl_cell_center)],
        [P('Lavado de divisas', style_tbl_cell), P('Venta de USD en CADECA + compra de saldo + transferencia a cripto', style_tbl_cell), P('ALTO', style_tbl_cell_center)],
        [P('Migracion irregular', style_tbl_cell), P('Oferta empleo Dubai + alquiler + envios + agencia viajes', style_tbl_cell), P('MEDIO', style_tbl_cell_center)],
        [P('Desinformacion coordinada', style_tbl_cell), P('Canal conspirativo + refuerzo en grupos + llamado a accion', style_tbl_cell), P('ALTO', style_tbl_cell_center)],
        [P('Manipulacion cripto', style_tbl_cell), P('Whale alert + senal de trading + pump en grupo + venta en exchange', style_tbl_cell), P('ALTO', style_tbl_cell_center)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.22, AVAILABLE_WIDTH * 0.55, AVAILABLE_WIDTH * 0.23]
    story.extend(make_table(patterns_data, col_w, "Tabla 5: Patrones de actividad detectables y su nivel de riesgo"))

    # 3.3 Score-based
    story.append(add_heading("3.3 Estrategia Basada en Puntuacion de Riesgo (Cuantitativa)", style_h2, level=1))

    story.append(P(
        "La estrategia de puntuacion de riesgo asigna un valor numerico a cada entidad, grupo, "
        "evento o actor detectado en el ecosistema, permitiendo la priorizacion objetiva de las "
        "acciones de inteligencia. El score de riesgo se calcula mediante un modelo ponderado que "
        "integra multiples dimensiones: la naturaleza de la actividad (comercio legitimo vs. "
        "actividad sospechosa), el volumen y la frecuencia, las conexiones con otros actores de "
        "alto riesgo, y el contexto geopolitico y economico proporcionado por los datos OSINT.",
        style_body
    ))

    score_data = [
        [P('<b>Dimension</b>', style_tbl_header), P('<b>Peso</b>', style_tbl_header), P('<b>Descripcion</b>', style_tbl_header)],
        [P('Naturaleza de la actividad', style_tbl_cell), P('35%', style_tbl_cell_center), P('Tipo de actividad: fraude (90-100), mercado gris (50-70), comercio legitimo (10-30)', style_tbl_cell)],
        [P('Volumen y frecuencia', style_tbl_cell), P('25%', style_tbl_cell_center), P('Cantidad de menciones, transacciones, mensajes en un periodo dado', style_tbl_cell)],
        [P('Conexiones de riesgo', style_tbl_cell), P('20%', style_tbl_cell_center), P('Vinculos con actores o grupos previamente identificados como sospechosos', style_tbl_cell)],
        [P('Contexto OSINT', style_tbl_cell), P('15%', style_tbl_cell_center), P('Correlacion con eventos globales (sismos, conflictos, sanciones)', style_tbl_cell)],
        [P('Recencia', style_tbl_cell), P('5%', style_tbl_cell_center), P('Que tan reciente es la actividad (decaimiento temporal)', style_tbl_cell)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.25, AVAILABLE_WIDTH * 0.10, AVAILABLE_WIDTH * 0.65]
    story.extend(make_table(score_data, col_w, "Tabla 6: Dimensiones del modelo de puntuacion de riesgo"))

    # 3.4 Consensus
    story.append(add_heading("3.4 Estrategia de Consenso Multi-Agente (Cooperativa)", style_h2, level=1))

    story.append(P(
        "La estrategia de consenso multi-agente resuelve la ambiguedad y los falsos positivos "
        "al requerir que multiples agentes independientes evaluen la misma situacion antes de "
        "tomar una decision. Este enfoque se inspira en los sistemas de consenso distribuido "
        "utilizados en blockchain y en los comites de inteligencia humanos donde multiples "
        "analistas evaluan la misma informacion desde perspectivas diferentes. La ventaja "
        "principal es la reduccion drastica de falsos positivos sin sacrificar la capacidad "
        "de deteccion de amenazas reales.",
        style_body
    ))
    story.append(P(
        "El mecanismo funciona de la siguiente manera: cuando un agente detecta un evento "
        "potencialmente significativo, publica una evaluacion preliminar en el bus de eventos. "
        "Los otros agentes reciben esta evaluacion y realizan su propio analisis independiente. "
        "Si al menos 3 de 4 agentes confirman la evaluacion, la decision se ejecuta "
        "automaticamente. Si solo 2 agentes confirman, se escala al analista humano para "
        "resolucion. Si solo 1 agente confirma, el evento se registra como falso positivo "
        "potencial y se archiva para revision posterior. Este mecanismo de votacion ponderada "
        "permite que el sistema tome decisiones autonomas con alta confianza mientras mantiene "
        "la supervision humana para casos ambiguos.",
        style_body
    ))

    consensus_data = [
        [P('<b>Consenso</b>', style_tbl_header), P('<b>Agentes a favor</b>', style_tbl_header), P('<b>Accion</b>', style_tbl_header), P('<b>Confianza</b>', style_tbl_header)],
        [P('Total', style_tbl_cell), P('4/4', style_tbl_cell_center), P('Ejecucion automatica inmediata', style_tbl_cell), P('99%+', style_tbl_cell_center)],
        [P('Mayoritario', style_tbl_cell), P('3/4', style_tbl_cell_center), P('Ejecucion automatica con notificacion', style_tbl_cell), P('90-99%', style_tbl_cell_center)],
        [P('Parcial', style_tbl_cell), P('2/4', style_tbl_cell_center), P('Escalacion al analista humano', style_tbl_cell), P('60-90%', style_tbl_cell_center)],
        [P('Minoritario', style_tbl_cell), P('1/4', style_tbl_cell_center), P('Archivo como posible falso positivo', style_tbl_cell), P('<60%', style_tbl_cell_center)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.17, AVAILABLE_WIDTH * 0.18, AVAILABLE_WIDTH * 0.40, AVAILABLE_WIDTH * 0.25]
    story.extend(make_table(consensus_data, col_w, "Tabla 7: Niveles de consenso y acciones correspondientes"))

    # 3.5 Predictive
    story.append(add_heading("3.5 Estrategia Predictiva (Proactiva)", style_h2, level=1))

    story.append(P(
        "La estrategia predictiva utiliza modelos de aprendizaje automatico y analisis de series "
        "temporales para anticipar eventos futuros basandose en patrones historicos. A diferencia "
        "de las estrategias reactivas que responden a eventos que ya ocurrieron, la estrategia "
        "predictiva permite la preparacion anticipada y la asignacion proactiva de recursos de "
        "monitoreo. Esta capacidad es especialmente valiosa en el contexto de inteligencia digital "
        "donde la anticipacion puede significar la diferencia entre prevenir un fraude y "
        "documentarlo despues de que los danos ya se han producido.",
        style_body
    ))
    story.append(P(
        "Los modelos predictivos propuestos se entrenan con los datos historicos recopilados "
        "por el ecosistema Whatomate, incluyendo la actividad de grupos de WhatsApp y Telegram, "
        "los indicadores OSINT y las alertas generadas en periodos anteriores. Los modelos "
        "principales incluyen un predictor de actividad sospechosa que estima la probabilidad "
        "de que un grupo o actor genere actividad de alto riesgo en las proximas 24 horas, "
        "un predictor de eventos OSINT que anticipa la probabilidad de eventos criticos "
        "(terremotos, conflictos, desastres naturales) basandose en patrones historicos y "
        "datos de sensores, y un predictor de tendencias de mercado que identifica posibles "
        "movimientos en el ecosistema cripto basandose en las senales de los canales de "
        "trading y las alertas de ballenas.",
        style_body
    ))

    # 3.6 Adaptive
    story.append(add_heading("3.6 Estrategia Adaptativa (Evolucion Continua)", style_h2, level=1))

    story.append(P(
        "La estrategia adaptativa reconoce que el entorno de inteligencia digital es intrinsecamente "
        "dinamico: los actores cambian sus tacticas, los grupos migran entre plataformas, las "
        "regulaciones evolucionan y las amenazas se transforman. Por lo tanto, un sistema de "
        "inteligencia efectivo debe ser capaz de adaptar sus propios parametros, umbrales y "
        "modelos de forma continua sin requerir reconfiguracion manual constante.",
        style_body
    ))
    story.append(P(
        "El mecanismo adaptativo propuesto implementa un ciclo de retroalimentacion donde cada "
        "decision tomada por el sistema se evalua a posteriori para determinar su efectividad. "
        "Si una alerta resulta ser un falso positivo, el sistema ajusta automaticamente los "
        "umbrales correspondientes para reducir la sensibilidad. Si una amenaza real no es "
        "detectada a tiempo, el sistema baja los umbrales e incrementa la cobertura de monitoreo. "
        "Este proceso de ajuste continuo se realiza de forma gradual para evitar oscilaciones, "
        "utilizando un factor de aprendizaje que pondera las nuevas observaciones contra el "
        "conocimiento historico acumulado. Adicionalmente, el sistema realiza evaluaciones "
        "periodicas de la distribucion de sus recursos de monitoreo, reasignando capacidad "
        "de analisis hacia las fuentes y categorias que muestran mayor dinamismo y potencial "
        "de riesgo.",
        style_body
    ))

    # ================================================================
    # SECTION 4: RESUMEN DE REPORTES EXISTENTES
    # ================================================================
    story.extend(add_major_section("4. Resumen de Reportes Existentes"))

    story.append(P(
        "El ecosistema Whatomate ha generado dos reportes de inteligencia que constituyen la "
        "base de referencia para el sistema multi-agente propuesto. Ambos reportes analizan "
        "la actividad digital detectada a traves de WhatsApp y Telegram, con enfoques "
        "complementarios que demuestran la capacidad del sistema para producir inteligencia "
        "de diferente nivel de profundidad y granularity.",
        style_body
    ))

    reports_data = [
        [P('<b>Reporte</b>', style_tbl_header), P('<b>Fecha</b>', style_tbl_header), P('<b>Paginas</b>', style_tbl_header), P('<b>Enfoque</b>', style_tbl_header), P('<b>Archivo</b>', style_tbl_header)],
        [P('Informe de Inteligencia v1', style_tbl_cell), P('Marzo 2026', style_tbl_cell_center), P('16', style_tbl_cell_center), P('Analisis detallado por categorias, datos OSINT, recomendaciones', style_tbl_cell), P('informe-inteligencia-whatsapp-telegram.pdf', style_tbl_cell)],
        [P('Reporte de Inteligencia Holistica v2', style_tbl_cell), P('Mayo 2026', style_tbl_cell_center), P('12+', style_tbl_cell_center), P('Analisis con graficos, comunidad Dubai, seguridad, economia informal', style_tbl_cell), P('reporte_inteligencia_whatsapp_telegram.pdf', style_tbl_cell)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.18, AVAILABLE_WIDTH * 0.12, AVAILABLE_WIDTH * 0.10, AVAILABLE_WIDTH * 0.35, AVAILABLE_WIDTH * 0.25]
    story.extend(make_table(reports_data, col_w, "Tabla 8: Reportes de inteligencia generados por el ecosistema"))

    story.append(add_heading("4.1 Hallazgos Clave del Reporte v1", style_h2, level=1))

    story.append(P(
        "El primer informe de inteligencia establecio la metodologia base del ecosistema y "
        "produjo hallazgos fundamentales que siguen vigentes. Se identificaron 81 grupos de "
        "Telegram con 16,323,379 miembros totales, dominados por la categoria crypto_trading "
        "con 53% del total de miembros. El canal Toncoin con 7,948,677 miembros representaba "
        "el 48.7% de toda la audiencia de Telegram. En WhatsApp, se monitorearon 195 grupos "
        "con actividad predominante en compras/ventas (31 grupos) y tecnologia/IA (27 grupos). "
        "Los datos OSINT indicaron un nivel de amenaza ALTO con 13 terremotos de magnitud 4.5+, "
        "11 vuelos militares y 500 alertas climaticas activas. Las recomendaciones se centraron "
        "en fortalecer el monitoreo de grupos financieros y la integracion de datos OSINT con "
        "el analisis de plataformas de mensajeria.",
        style_body
    ))

    story.append(add_heading("4.2 Hallazgos Clave del Reporte v2", style_h2, level=1))

    story.append(P(
        "El segundo reporte evoluciono el analisis incorporando graficos de datos, un enfoque "
        "holistico y hallazgos mas profundos sobre la comunidad cubana en Dubai/EAU y la economia "
        "informal. Se identificaron 22 grupos de WhatsApp dedicados a la comunidad Dubai/EAU, "
        "con una infraestructura digital completa que abarca alquileres, empleo, envios y eventos. "
        "Se detecto un caso critico de fraude financiero organizado por el usuario @Miguel_Digital "
        "en el grupo QvaPay de Telegram, ofreciendo tarjetas Visa, cuentas PayPal/Binance, "
        "documentos KYC falsos y reclutamiento de colaboradores con 30% de comision. El reporte "
        "tambien revelo un ecosistema de tecnologia e IA emergente con grupos como Blurcore AI, "
        "Tecnolitas IA y comunidades de desarrolladores vinculadas al ecosistema TON. Las "
        "recomendaciones enfatizaron el monitoreo continuo del caso de fraude, el seguimiento "
        "del ecosistema cripto cubano y la implementacion de alertas automatizadas.",
        style_body
    ))

    # ================================================================
    # SECTION 5: ORGANIZACION DEL DIRECTORIO
    # ================================================================
    story.extend(add_major_section("5. Organizacion del Directorio del Proyecto"))

    story.append(P(
        "Como parte de las mejoras operativas, se ha realizado una reorganizacion completa del "
        "directorio del proyecto para facilitar la mantenibilidad, la navegacion y la escalabilidad "
        "del ecosistema. La reorganizacion elimino duplicaciones, consolido archivos dispersos y "
        "establecio una estructura clara basada en proyectos y funciones.",
        style_body
    ))

    org_data = [
        [P('<b>Accion</b>', style_tbl_header), P('<b>Detalle</b>', style_tbl_header), P('<b>Impacto</b>', style_tbl_header)],
        [P('Creacion de scripts/', style_tbl_cell), P('Shell scripts y scripts de generacion consolidados', style_tbl_cell), P('Organizacion, facil mantenimiento', style_tbl_cell)],
        [P('Creacion de infrastructure/', style_tbl_cell), P('Docker, Caddyfile, PM2 config centralizados', style_tbl_cell), P('Configuracion de despliegue unificada', style_tbl_cell)],
        [P('Eliminacion de backend/ duplicado', style_tbl_cell), P('105 archivos duplicados eliminados, 2 unicos preservados', style_tbl_cell), P('Reduccion de confusion, fuente unica de verdad', style_tbl_cell)],
        [P('Eliminacion de CSVs duplicados', style_tbl_cell), P('25 archivos CSV duplicados en ui-ux-pro-max/data/', style_tbl_cell), P('Reduccion de tamaño, consistencia', style_tbl_cell)],
        [P('Eliminacion de mini-services/', style_tbl_cell), P('Directorio incompleto con solo package.json', style_tbl_cell), P('Limpieza de codigo muerto', style_tbl_cell)],
        [P('Creacion de PROJECT_STRUCTURE.md', style_tbl_cell), P('Documentacion completa de la estructura del proyecto', style_tbl_cell), P('Navegabilidad y onboarding', style_tbl_cell)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.28, AVAILABLE_WIDTH * 0.42, AVAILABLE_WIDTH * 0.30]
    story.extend(make_table(org_data, col_w, "Tabla 9: Acciones de reorganizacion del directorio"))

    story.append(P(
        "La nueva estructura del proyecto organiza los componentes en directorios funcionales "
        "claros: los scripts de operacion en scripts/services/ y scripts/bridge/, los scripts "
        "de generacion de reportes en scripts/reports/, y la infraestructura de despliegue en "
        "infrastructure/. Los componentes principales del ecosistema (hermes-agent, shadowbroker-osint, "
        "telethon-service, frontend, docs) mantienen sus ubicaciones originales para no afectar "
        "las rutas de importacion y las configuraciones de los servicios activos. El archivo "
        "PROJECT_STRUCTURE.md en la raiz del proyecto documenta la estructura completa y sirve "
        "como referencia para cualquier desarrollador o agente que necesite navegar el codigo.",
        style_body
    ))

    # ================================================================
    # SECTION 6: PLAN DE IMPLEMENTACION
    # ================================================================
    story.extend(add_major_section("6. Plan de Implementacion"))

    story.append(P(
        "La implementacion del sistema multi-agente se propone en cuatro fases incrementales "
        "que permiten validar cada componente antes de avanzar a la siguiente etapa. Este enfoque "
        "reduce el riesgo de fallos en cascada y permite ajustar la arquitectura basandose en "
        "las lecciones aprendidas durante cada fase.",
        style_body
    ))

    phase_data = [
        [P('<b>Fase</b>', style_tbl_header), P('<b>Periodo</b>', style_tbl_header), P('<b>Objetivos</b>', style_tbl_header), P('<b>Entregables</b>', style_tbl_header)],
        [P('Fase 1: Fundamentos', style_tbl_cell), P('Semanas 1-2', style_tbl_cell_center), P('Bus de eventos, agentes de ingesta activos, sistema de alertas basico', style_tbl_cell), P('Redis Streams funcional, 3 agentes de ingesta, 5 umbrales de alerta', style_tbl_cell)],
        [P('Fase 2: Analisis', style_tbl_cell), P('Semanas 3-4', style_tbl_cell_center), P('Agentes de analisis semantico y cuantitativo, scoring de riesgo', style_tbl_cell), P('4 agentes de analisis, modelo de scoring, dashboard basico', style_tbl_cell)],
        [P('Fase 3: Autonomia', style_tbl_cell), P('Semanas 5-6', style_tbl_cell_center), P('Consenso multi-agente, generacion automatizada de reportes', style_tbl_cell), P('Motor de consenso, 3 tipos de reportes automatizados, alertas proactivas', style_tbl_cell)],
        [P('Fase 4: Prediccion', style_tbl_cell), P('Semanas 7-8', style_tbl_cell_center), P('Modelos predictivos, adaptacion continua, nuevas fuentes', style_tbl_cell), P('2 modelos predictivos, mecanismo adaptativo, scraper de redes sociales', style_tbl_cell)],
    ]
    col_w = [AVAILABLE_WIDTH * 0.15, AVAILABLE_WIDTH * 0.15, AVAILABLE_WIDTH * 0.35, AVAILABLE_WIDTH * 0.35]
    story.extend(make_table(phase_data, col_w, "Tabla 10: Fases de implementacion del sistema multi-agente"))

    story.append(P(
        "Cada fase incluye criterios de aceptacion especificos que deben cumplirse antes de "
        "avanzar a la siguiente. La Fase 1 requiere que los tres agentes de ingesta mantengan "
        "conexiones estables durante 48 horas continuas sin intervencion manual. La Fase 2 "
        "exige que el sistema de scoring de riesgo clasifique correctamente al menos el 85% "
        "de los eventos de un conjunto de prueba preetiquetado. La Fase 3 valida que el motor "
        "de consenso reduzca los falsos positivos en al menos un 50% respecto al sistema de "
        "umbrales simple. La Fase 4 confirma que los modelos predictivos alcancen una precision "
        "superior al 70% en la anticipacion de eventos criticos con 24 horas de anticipacion.",
        style_body
    ))

    # ================================================================
    # SECTION 7: RECOMENDACIONES
    # ================================================================
    story.extend(add_major_section("7. Recomendaciones"))

    story.append(P(
        "Basandose en el analisis del ecosistema actual, los hallazgos de los reportes existentes "
        "y la arquitectura multi-agente propuesta, se formulan las siguientes recomendaciones "
        "estrategicas para maximizar la efectividad del sistema de inteligencia digital.",
        style_body
    ))

    recs = [
        "<b>Priorizar la implementacion del bus de eventos Redis:</b> El bus de eventos es el "
        "componente critico que habilita la comunicacion entre agentes. Sin el, cada agente opera "
        "de forma aislada y las estrategias de consenso y correlacion cruzada son imposibles. "
        "La implementacion debe utilizar Redis Streams con consumer groups para garantizar la "
        "entrega de mensajes y el procesamiento distribuido.",

        "<b>Implementar alertas automaticas como primera funcionalidad:</b> Antes de construir "
        "agentes de analisis complejos, establecer un sistema de alertas basado en umbrales que "
        "notifique al operador cuando se detecten patrones de alto riesgo como menciones de "
        "fraude financiero, actividad sismica significativa o patrones de desinformacion. Esto "
        "proporciona valor inmediato mientras los componentes mas avanzados se desarrollan.",

        "<b>Monitoreo continuo del caso de fraude detectado:</b> El caso de @Miguel_Digital y "
        "la red de fraude financiero en QvaPay requiere seguimiento activo. Implementar un "
        "agente dedicado que monitoree las menciones de este actor, sus aliases conocidos y "
        "los patrones de reclutamiento asociados, generando alertas inmediatas ante cualquier "
        "reactivacion de la actividad.",

        "<b>Expandir las fuentes de datos mas alla de mensajeria:</b> El ecosistema actual se "
        "limita a WhatsApp, Telegram y 6 scrapers OSINT. La integracion de monitoreo de redes "
        "sociales (Twitter/X, Facebook), foros de la dark web, y fuentes de inteligencia de "
        "ciberamenazas ampliaria significativamente la cobertura del sistema y mejoraria la "
        "capacidad de deteccion de amenazas emergentes.",

        "<b>Establecer un protocolo de escalacion claro:</b> Definir explicitamente los niveles "
        "de alerta (informativo, bajo, medio, alto, critico), las acciones automaticas "
        "correspondientes a cada nivel, y los criterios de escalamiento al analista humano. "
        "Este protocolo debe estar documentado y ser accesible tanto para los operadores "
        "humanos como para los agentes autonomos.",

        "<b>Invertir en la base de datos de conocimiento:</b> Crear una base de datos centralizada "
        "que almacene las entidades detectadas (actores, grupos, organizaciones, ubicaciones), "
        "las relaciones entre ellas, y el historial de evaluaciones de riesgo. Esta base de "
        "conocimiento es fundamental para la estrategia de consenso y para la adaptacion "
        "continua del sistema.",

        "<b>Automatizar la generacion periodica de reportes:</b> Implementar reportes diarios "
        "automaticos que resuman la actividad del dia, reportes semanales con analisis de "
        "tendencias, y reportes mensuales con evaluacion estrategica. Esto elimina la "
        "dependencia de la generacion manual y asegura que la inteligencia se produzca de "
        "forma consistente y oportuna.",
    ]

    for i, rec in enumerate(recs, 1):
        story.append(P(f'{i}. {rec}', style_bullet))
        story.append(Spacer(1, 4))

    return story

# ============================================================
# BUILD DOCUMENT
# ============================================================

output_path = '/home/z/my-project/download/estrategia-multi-agente-inteligencia-digital.pdf'
body_path = '/home/z/my-project/download/estrategia-multi-agente-body.pdf'

doc = TocDocTemplate(
    body_path,
    pagesize=A4,
    leftMargin=LEFT_MARGIN,
    rightMargin=RIGHT_MARGIN,
    topMargin=TOP_MARGIN,
    bottomMargin=BOTTOM_MARGIN,
    title='Estrategia Multi-Agente para Inteligencia Digital',
    author='Whatomate OSINT - Z.ai',
    creator='Z.ai',
    subject='Arquitectura multi-agente para ingesta, analisis, monitoreo y generacion de reportes de inteligencia digital'
)

story = build_story()
doc.multiBuild(story, onLaterPages=page_header_footer, onFirstPage=page_header_footer)
print(f"Body PDF generated: {body_path}")

# ============================================================
# MERGE COVER + BODY
# ============================================================

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

cover_pdf_path = '/home/z/my-project/download/cover_estrategia.pdf'

writer = PdfWriter()

# Cover as page 1
cover_page = PdfReader(cover_pdf_path).pages[0]
writer.add_page(normalize_page_to_a4(cover_page))

# Body pages follow
for page in PdfReader(body_path).pages:
    writer.add_page(normalize_page_to_a4(page))

writer.add_metadata({
    '/Title': 'Estrategia Multi-Agente para Inteligencia Digital',
    '/Author': 'Whatomate OSINT - Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'Arquitectura multi-agente para ingesta, analisis, monitoreo y generacion de reportes'
})

with open(output_path, 'wb') as f:
    writer.write(f)

print(f"Final PDF generated: {output_path}")

# Cleanup temp files
import os
os.remove(body_path)

# Report size
size_kb = os.path.getsize(output_path) / 1024
print(f"File size: {size_kb:.1f} KB")
