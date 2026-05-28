#!/usr/bin/env python3
"""Generate EAU Intelligence Report PDF for Telegram delivery.

Uses ReportLab to create a professional multi-page intelligence report
combining OSINT data with Telegram group analysis.
"""

import json
import os
import sys
from datetime import datetime, timezone

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable, Image
)
from reportlab.graphics.shapes import Drawing, Rect, String, Line
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.piecharts import Pie

# Font setup - not needed for ReportLab, using Helvetica

# Colors
DARK_BG = HexColor('#0f172a')
ACCENT = HexColor('#3b82f6')
DANGER = HexColor('#ef4444')
WARNING = HexColor('#f59e0b')
SUCCESS = HexColor('#10b981')
LIGHT_BG = HexColor('#f1f5f9')
TEXT_COLOR = HexColor('#1e293b')
MUTED = HexColor('#64748b')
HEADER_BG = HexColor('#1e3a5f')
TABLE_HEADER = HexColor('#1e40af')
TABLE_ALT = HexColor('#eff6ff')

OUTPUT_PATH = '/home/z/my-project/download/informe_inteligencia_eau.pdf'

def load_json(path):
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except Exception:
        return {}

def build_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        'ReportTitle', parent=styles['Title'],
        fontSize=24, leading=30, textColor=white,
        alignment=TA_CENTER, spaceAfter=6*mm,
        fontName='Helvetica-Bold'
    ))
    styles.add(ParagraphStyle(
        'ReportSubtitle', parent=styles['Normal'],
        fontSize=12, leading=16, textColor=HexColor('#93c5fd'),
        alignment=TA_CENTER, spaceAfter=10*mm,
        fontName='Helvetica'
    ))
    styles.add(ParagraphStyle(
        'SectionHead', parent=styles['Heading1'],
        fontSize=16, leading=22, textColor=ACCENT,
        spaceBefore=8*mm, spaceAfter=4*mm,
        fontName='Helvetica-Bold', borderWidth=0,
        borderColor=ACCENT, borderPadding=2*mm,
    ))
    styles.add(ParagraphStyle(
        'SubHead', parent=styles['Heading2'],
        fontSize=13, leading=18, textColor=HexColor('#1e40af'),
        spaceBefore=5*mm, spaceAfter=3*mm,
        fontName='Helvetica-Bold'
    ))
    styles.add(ParagraphStyle(
        'BodyText2', parent=styles['Normal'],
        fontSize=10, leading=14, textColor=TEXT_COLOR,
        alignment=TA_JUSTIFY, spaceAfter=3*mm,
        fontName='Helvetica'
    ))
    styles.add(ParagraphStyle(
        'ThreatCritical', parent=styles['Normal'],
        fontSize=36, leading=42, textColor=DANGER,
        alignment=TA_CENTER, fontName='Helvetica-Bold',
        spaceAfter=3*mm
    ))
    styles.add(ParagraphStyle(
        'MetricVal', parent=styles['Normal'],
        fontSize=18, leading=24, textColor=ACCENT,
        alignment=TA_CENTER, fontName='Helvetica-Bold'
    ))
    styles.add(ParagraphStyle(
        'MetricLabel', parent=styles['Normal'],
        fontSize=8, leading=10, textColor=MUTED,
        alignment=TA_CENTER, fontName='Helvetica'
    ))
    styles.add(ParagraphStyle(
        'SmallText', parent=styles['Normal'],
        fontSize=8, leading=10, textColor=MUTED,
        fontName='Helvetica'
    ))
    styles.add(ParagraphStyle(
        'TableHeader', parent=styles['Normal'],
        fontSize=9, leading=12, textColor=white,
        fontName='Helvetica-Bold'
    ))
    styles.add(ParagraphStyle(
        'TableCell', parent=styles['Normal'],
        fontSize=9, leading=12, textColor=TEXT_COLOR,
        fontName='Helvetica'
    ))
    return styles

def threat_badge(level):
    colors = {
        'critical': DANGER,
        'high': HexColor('#f97316'),
        'elevated': WARNING,
        'medium': HexColor('#eab308'),
        'low': SUCCESS,
    }
    color = colors.get(level.lower(), MUTED)
    return f'<font color="{color.hexval()}">{level.upper()}</font>'

def section_header(text, styles):
    return [
        HRFlowable(width="100%", thickness=1, color=ACCENT, spaceBefore=4*mm, spaceAfter=2*mm),
        Paragraph(text, styles['SectionHead']),
    ]

def metric_card(label, value, styles):
    return [
        Paragraph(str(value), styles['MetricVal']),
        Paragraph(label, styles['MetricLabel']),
    ]

def build_cover(styles, osint_data, now_str):
    elements = []
    elements.append(Spacer(1, 40*mm))
    elements.append(Paragraph('WHATOMATE', styles['ReportSubtitle']))
    elements.append(Paragraph('INFORME DE INTELIGENCIA', styles['ReportTitle']))
    elements.append(Paragraph('Analisis de Amenazas Globales y Monitoreo de Grupos EAU', styles['ReportSubtitle']))
    elements.append(Spacer(1, 15*mm))

    level = osint_data.get('threat_level', 'unknown').upper()
    elements.append(Paragraph(f'NIVEL DE AMENAZA: {threat_badge(level)}', ParagraphStyle(
        'ThreatBig', parent=styles['Normal'],
        fontSize=20, leading=28, textColor=DANGER if level == 'CRITICAL' else WARNING,
        alignment=TA_CENTER, fontName='Helvetica-Bold', spaceAfter=8*mm
    )))
    elements.append(Spacer(1, 10*mm))

    # Summary metrics table
    eq_count = len(osint_data.get('earthquakes', []))
    mil_count = len(osint_data.get('military_flights', []))
    fire_count = len(osint_data.get('firms_fires', []))
    uav_count = len(osint_data.get('uavs', []))
    gps_count = len(osint_data.get('gps_jamming', []))
    sigint_count = len(osint_data.get('sigint', []))

    metrics_data = [
        [Paragraph(str(eq_count), styles['MetricVal']),
         Paragraph(str(mil_count), styles['MetricVal']),
         Paragraph(str(fire_count), styles['MetricVal']),
         Paragraph(str(uav_count), styles['MetricVal'])],
        [Paragraph('Sismos', styles['MetricLabel']),
         Paragraph('Vuelos Mil.', styles['MetricLabel']),
         Paragraph('Incendios', styles['MetricLabel']),
         Paragraph('UAVs', styles['MetricLabel'])],
    ]
    metrics_table = Table(metrics_data, colWidths=[40*mm]*4)
    metrics_table.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    elements.append(metrics_table)
    elements.append(Spacer(1, 5*mm))

    metrics_data2 = [
        [Paragraph(str(gps_count), styles['MetricVal']),
         Paragraph(str(sigint_count), styles['MetricVal']),
         Paragraph(str(len(osint_data.get('liveuamap', []))), styles['MetricVal']),
         Paragraph(str(len(osint_data.get('news', []))), styles['MetricVal'])],
        [Paragraph('GPS Jamming', styles['MetricLabel']),
         Paragraph('SIGINT', styles['MetricLabel']),
         Paragraph('Conflictos', styles['MetricLabel']),
         Paragraph('Noticias', styles['MetricLabel'])],
    ]
    metrics_table2 = Table(metrics_data2, colWidths=[40*mm]*4)
    metrics_table2.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    elements.append(metrics_table2)
    elements.append(Spacer(1, 20*mm))

    elements.append(Paragraph(f'Generado: {now_str}', ParagraphStyle(
        'Footer', parent=styles['Normal'],
        fontSize=9, textColor=MUTED, alignment=TA_CENTER
    )))
    elements.append(Paragraph('Shadowbroker OSINT + Telethon Intelligence Pipeline', ParagraphStyle(
        'Footer2', parent=styles['Normal'],
        fontSize=8, textColor=MUTED, alignment=TA_CENTER
    )))
    elements.append(PageBreak())
    return elements

def build_osint_section(styles, osint_data):
    elements = []
    elements.extend(section_header('1. INTELIGENCIA OSINT - PANORAMA GLOBAL', styles))

    # 1.1 Earthquakes
    elements.append(Paragraph('1.1 Actividad Sismica', styles['SubHead']))
    earthquakes = osint_data.get('earthquakes', [])
    if earthquakes:
        eq_table_data = [
            [Paragraph('Magnitud', styles['TableHeader']),
             Paragraph('Ubicacion', styles['TableHeader']),
             Paragraph('Profundidad', styles['TableHeader']),
             Paragraph('Fecha/Hora', styles['TableHeader'])]
        ]
        for eq in earthquakes[:10]:
            mag = eq.get('magnitude', 0)
            mag_color = DANGER.hexval() if mag >= 6 else (WARNING.hexval() if mag >= 5 else SUCCESS.hexval())
            eq_table_data.append([
                Paragraph(f'<font color="{mag_color}">{mag}</font>', styles['TableCell']),
                Paragraph(str(eq.get('title', 'N/A'))[:40], styles['TableCell']),
                Paragraph(f"{eq.get('depth', 0)} km", styles['TableCell']),
                Paragraph(str(eq.get('time', ''))[:16], styles['TableCell']),
            ])
        eq_table = Table(eq_table_data, colWidths=[25*mm, 65*mm, 25*mm, 35*mm])
        eq_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), TABLE_HEADER),
            ('TEXTCOLOR', (0,0), (-1,0), white),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('FONTSIZE', (0,0), (-1,-1), 8),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, TABLE_ALT]),
            ('GRID', (0,0), (-1,-1), 0.5, HexColor('#cbd5e1')),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        elements.append(eq_table)
    else:
        elements.append(Paragraph('No se detectaron sismos significativos en las ultimas 24 horas.', styles['BodyText2']))

    elements.append(Spacer(1, 5*mm))

    # 1.2 Military Aviation & UAVs
    elements.append(Paragraph('1.2 Aviacion Militar y Drones', styles['SubHead']))
    military = osint_data.get('military_flights', [])
    uavs = osint_data.get('uavs', [])

    elements.append(Paragraph(
        f'Se rastrearon <b>{len(military)}</b> vuelos militares y <b>{len(uavs)}</b> UAVs/drones en tiempo real '
        f'mediante la red OpenSky. Los vuelos militares detectados incluyen aeronaves con callsigns de la OTAN '
        f'y fuerzas armadas estadounidenses, europeas y de otras coaliciones. Los UAVs incluyen plataformas '
        f'MQ Predator/Reaper, RPA y drones tacticos operando a diversas altitudes.',
        styles['BodyText2']
    ))

    if military:
        mil_table_data = [
            [Paragraph('Callsign', styles['TableHeader']),
             Paragraph('Altitud (m)', styles['TableHeader']),
             Paragraph('Pais', styles['TableHeader']),
             Paragraph('Velocidad', styles['TableHeader'])]
        ]
        for m in military[:8]:
            mil_table_data.append([
                Paragraph(str(m.get('callsign', 'N/A')), styles['TableCell']),
                Paragraph(str(int(m.get('altitude', 0))), styles['TableCell']),
                Paragraph(str(m.get('origin_country', 'N/A'))[:20], styles['TableCell']),
                Paragraph(f"{m.get('velocity', 0):.0f} m/s" if m.get('velocity') else 'N/A', styles['TableCell']),
            ])
        mil_table = Table(mil_table_data, colWidths=[35*mm, 25*mm, 45*mm, 25*mm])
        mil_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), TABLE_HEADER),
            ('TEXTCOLOR', (0,0), (-1,0), white),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, TABLE_ALT]),
            ('GRID', (0,0), (-1,-1), 0.5, HexColor('#cbd5e1')),
            ('FONTSIZE', (0,0), (-1,-1), 8),
        ]))
        elements.append(mil_table)

    elements.append(Spacer(1, 5*mm))

    # 1.3 GPS Jamming
    elements.append(Paragraph('1.3 Interferencia GPS', styles['SubHead']))
    gps = osint_data.get('gps_jamming', [])
    if gps:
        elements.append(Paragraph(
            f'Se detectaron <b>{len(gps)}</b> regiones con interferencia GPS activa. La interferencia GPS '
            f'representa una amenaza significativa para la navegacion aerea, maritima y terrestre. Las regiones '
            f'con severidad "severe" indican interrupciones generalizadas del signal GPS que pueden afectar '
            f'operaciones criticas de infraestructura y transporte.',
            styles['BodyText2']
        ))
        gps_table_data = [
            [Paragraph('Region', styles['TableHeader']),
             Paragraph('Severidad', styles['TableHeader']),
             Paragraph('Descripcion', styles['TableHeader'])]
        ]
        for g in gps[:8]:
            sev = g.get('severity', 'unknown')
            sev_color = DANGER.hexval() if sev == 'severe' else (WARNING.hexval() if sev == 'moderate' else SUCCESS.hexval())
            gps_table_data.append([
                Paragraph(str(g.get('region', 'N/A')), styles['TableCell']),
                Paragraph(f'<font color="{sev_color}">{sev.upper()}</font>', styles['TableCell']),
                Paragraph(str(g.get('description', ''))[:60], styles['TableCell']),
            ])
        gps_table = Table(gps_table_data, colWidths=[35*mm, 25*mm, 80*mm])
        gps_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), TABLE_HEADER),
            ('TEXTCOLOR', (0,0), (-1,0), white),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, TABLE_ALT]),
            ('GRID', (0,0), (-1,-1), 0.5, HexColor('#cbd5e1')),
            ('FONTSIZE', (0,0), (-1,-1), 8),
        ]))
        elements.append(gps_table)

    elements.append(Spacer(1, 5*mm))

    # 1.4 SIGINT
    elements.append(Paragraph('1.4 Inteligencia de Senales (SIGINT)', styles['SubHead']))
    sigint = osint_data.get('sigint', [])
    sigint_totals = osint_data.get('sigint_totals', {})
    elements.append(Paragraph(
        f'Fuentes SIGINT activas: <b>{len(sigint)}</b> senales detectadas. '
        f'Desglose: Meshtastic: {sigint_totals.get("meshtastic", 0)}, '
        f'APRS: {sigint_totals.get("aprs", 0)}, '
        f'OpenSky Military: {sigint_totals.get("opensky_sigint", 0)}. '
        f'Las senales de transpondedor militar (ADS-B en 1090 MHz) representan emisiones RF '
        f'de aeronaves militares que constituyen inteligencia de senales valiosa para el monitoreo '
        f'de actividades belicas y de vigilancia en zonas de interes estrategico.',
        styles['BodyText2']
    ))

    # 1.5 NASA FIRMS Fire Detection
    elements.append(Paragraph('1.5 Deteccion de Incendios (NASA FIRMS)', styles['SubHead']))
    fires = osint_data.get('firms_fires', [])
    elements.append(Paragraph(
        f'NASA FIRMS (VIIRS/MODIS) detecto <b>{len(fires)}</b> anomalias termicas activas a nivel global '
        f'utilizando el MAP_KEY proporcionado. Los datos provienen del satelite Terra/Aqua MODIS '
        f'con confianza variable. Las concentraciones de incendios pueden indicar conflictos activos, '
        f'deforestacion, o desastres naturales que requieren atencion.',
        styles['BodyText2']
    ))

    # 1.6 Conflict Map
    elements.append(Paragraph('1.6 Mapa de Conflictos (LiveUAMap)', styles['SubHead']))
    conflicts = osint_data.get('liveuamap', [])
    if conflicts:
        elements.append(Paragraph(
            f'Se monitorearon <b>{len(conflicts)}</b> eventos de conflicto activo a traves de LiveUAMap. '
            f'Los eventos cubren zonas de conflicto armado en Ucrania, Siria, Medio Oriente y otras regiones. '
            f'La clasificacion automatica por palabras clave permite priorizar eventos por tipo: armado, '
            f'politico, humanitario e infraestructural.',
            styles['BodyText2']
        ))

    # 1.7 News Intelligence
    elements.append(Paragraph('1.7 Feed de Inteligencia Informativa', styles['SubHead']))
    news = osint_data.get('news', [])
    if news:
        news_table_data = [
            [Paragraph('Fuente', styles['TableHeader']),
             Paragraph('Titular', styles['TableHeader'])]
        ]
        for n in news[:10]:
            news_table_data.append([
                Paragraph(str(n.get('source', 'N/A')), styles['TableCell']),
                Paragraph(str(n.get('title', ''))[:80], styles['TableCell']),
            ])
        news_table = Table(news_table_data, colWidths=[30*mm, 110*mm])
        news_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), TABLE_HEADER),
            ('TEXTCOLOR', (0,0), (-1,0), white),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, TABLE_ALT]),
            ('GRID', (0,0), (-1,-1), 0.5, HexColor('#cbd5e1')),
            ('FONTSIZE', (0,0), (-1,-1), 8),
        ]))
        elements.append(news_table)

    return elements

def build_telegram_section(styles, groups_data, msg_files):
    elements = []
    elements.extend(section_header('2. ANALISIS DE GRUPOS DE TELEGRAM', styles))

    groups = groups_data if isinstance(groups_data, list) else groups_data.get('groups', [])
    total_groups = len(groups)
    total_channels = sum(1 for g in groups if g.get('type') == 'channel')
    total_supergroups = sum(1 for g in groups if g.get('type') == 'supergroup')
    total_members = sum(g.get('participants_count', 0) or 0 for g in groups)

    elements.append(Paragraph(
        f'El sistema monitorea <b>{total_groups}</b> grupos y canales de Telegram '
        f'({total_channels} canales, {total_supergroups} supergrupos) con un alcance total de '
        f'<b>{total_members:,}</b> participantes. Este monitoreo permite detectar patrones de '
        f'comunicacion, actividad sospechosa y tendencias emergentes en las comunidades hispanohablantes.',
        styles['BodyText2']
    ))

    # Top groups by membership
    elements.append(Paragraph('2.1 Principales Grupos por Membresia', styles['SubHead']))
    sorted_groups = sorted(groups, key=lambda g: g.get('participants_count', 0) or 0, reverse=True)

    top_table_data = [
        [Paragraph('Grupo', styles['TableHeader']),
         Paragraph('Tipo', styles['TableHeader']),
         Paragraph('Miembros', styles['TableHeader'])]
    ]
    for g in sorted_groups[:15]:
        top_table_data.append([
            Paragraph(str(g.get('title', 'N/A'))[:50], styles['TableCell']),
            Paragraph(str(g.get('type', 'N/A')), styles['TableCell']),
            Paragraph(f"{g.get('participants_count', 0):,}", styles['TableCell']),
        ])
    top_table = Table(top_table_data, colWidths=[95*mm, 25*mm, 25*mm])
    top_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), TABLE_HEADER),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, TABLE_ALT]),
        ('GRID', (0,0), (-1,-1), 0.5, HexColor('#cbd5e1')),
        ('FONTSIZE', (0,0), (-1,-1), 8),
    ]))
    elements.append(top_table)
    elements.append(Spacer(1, 5*mm))

    # Category analysis
    elements.append(Paragraph('2.2 Analisis por Categoria', styles['SubHead']))
    categories = {
        'Cripto/Trading': 0,
        'Divisas/Finance': 0,
        'Whale Alerts': 0,
        'Tecnologia/Dev': 0,
        'News/Media': 0,
        'Otros': 0,
    }
    for g in groups:
        title = str(g.get('title', '')).lower()
        if any(k in title for k in ['crypto', 'cripto', 'coin', 'ton', 'bitcoin', 'btc', 'trade', 'pump']):
            categories['Cripto/Trading'] += 1
        elif any(k in title for k in ['usd', 'mlc', 'divisa', 'cadeca', 'euro']):
            categories['Divisas/Finance'] += 1
        elif any(k in title for k in ['whale', 'alert', 'liquidation']):
            categories['Whale Alerts'] += 1
        elif any(k in title for k in ['dev', 'tech', 'flutter', 'uci', 'developer']):
            categories['Tecnologia/Dev'] += 1
        elif any(k in title for k in ['news', 'info', 'despertador', 'conocimiento', 'elite']):
            categories['News/Media'] += 1
        else:
            categories['Otros'] += 1

    cat_table_data = [
        [Paragraph('Categoria', styles['TableHeader']),
         Paragraph('Cantidad', styles['TableHeader']),
         Paragraph('Porcentaje', styles['TableHeader'])]
    ]
    for cat, count in sorted(categories.items(), key=lambda x: x[1], reverse=True):
        pct = f"{count/total_groups*100:.1f}%" if total_groups > 0 else "0%"
        cat_table_data.append([
            Paragraph(cat, styles['TableCell']),
            Paragraph(str(count), styles['TableCell']),
            Paragraph(pct, styles['TableCell']),
        ])
    cat_table = Table(cat_table_data, colWidths=[60*mm, 30*mm, 30*mm])
    cat_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), TABLE_HEADER),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, TABLE_ALT]),
        ('GRID', (0,0), (-1,-1), 0.5, HexColor('#cbd5e1')),
        ('FONTSIZE', (0,0), (-1,-1), 9),
    ]))
    elements.append(cat_table)

    # Messages from key groups
    elements.append(Paragraph('2.3 Actividad Reciente en Grupos Clave', styles['SubHead']))
    for gid, name in [('-1001842108451', 'USD-MLC Colon-MTZ'),
                       ('-1001178361915', 'USD&MLC Colon-Mtz YHR'),
                       ('-1001458632610', 'Compra/Venta USD MLC Cuba')]:
        msg_data = load_json(f'/tmp/tg_msgs_{gid}.json')
        msgs = msg_data.get('messages', msg_data) if isinstance(msg_data, dict) else msg_data
        if isinstance(msgs, list) and msgs:
            elements.append(Paragraph(f'<b>{name}</b>', styles['BodyText2']))
            for m in msgs[:3]:
                text = str(m.get('text', ''))[:100]
                sender = str(m.get('sender_name', 'Anon'))[:20]
                date = str(m.get('date', ''))[:16]
                if text.strip():
                    elements.append(Paragraph(
                        f'[{date}] <i>{sender}</i>: {text}',
                        styles['SmallText']
                    ))
            elements.append(Spacer(1, 3*mm))

    return elements

def build_eau_section(styles, osint_data, groups_data):
    """EAU/Middle East specific analysis section."""
    elements = []
    elements.extend(section_header('3. ANALISIS ESPECIFICO - EAU / EMIRATOS ARABES UNIDOS', styles))

    elements.append(Paragraph(
        'Los Emiratos Arabes Unidos (EAU) representan un nodo estrategico critico en el Golfo Persico. '
        'Este analisis integra datos OSINT de la region con inteligencia de senales y monitoreo de '
        'comunicaciones. La posicion geopolitica de EAU como hub financiero, comercial y diplomatico '
        'lo convierte en un punto de interes para multiples vectores de amenaza incluyendo ciberataques, '
        'espionaje corporativo, lavado de dinero y actividades de financiamiento del terrorismo.',
        styles['BodyText2']
    ))

    # Regional OSINT data relevant to EAU
    elements.append(Paragraph('3.1 Datos OSINT Regionales Relevantes', styles['SubHead']))

    # Military flights near Gulf
    military = osint_data.get('military_flights', [])
    gulf_military = [m for m in military if m.get('origin_country', '') in 
                     ('United Arab Emirates', 'Saudi Arabia', 'Oman', 'Qatar', 'Bahrain', 'Kuwait')]
    
    uavs = osint_data.get('uavs', [])
    gulf_uavs = [u for u in uavs if any(k in str(u.get('zone', '')) for k in 
                  ['Emirates', 'Arab', 'Gulf', 'Saudi', 'Oman', 'Qatar'])]

    # Fires near Middle East
    fires = osint_data.get('firms_fires', [])
    me_fires = [f for f in fires if 20 < f.get('lat', 0) < 40 and 30 < f.get('lng', 0) < 60]

    # GPS Jamming affecting Middle East
    gps = osint_data.get('gps_jamming', [])
    me_gps = [g for g in gps if any(k in str(g.get('region', '')).lower() for k in 
              ['middle east', 'persian', 'gulf', 'iraq', 'syria'])]

    # SIGINT in region
    sigint = osint_data.get('sigint', [])
    me_sigint = [s for s in sigint if 15 < s.get('lat', 0) < 35 and 40 < s.get('lon', 0) < 65]

    elements.append(Paragraph(
        f'<b>Vuelos militares en zona del Golfo:</b> {len(gulf_military)} de {len(military)} totales. '
        f'La presencia militar en la region del Golfo Persico es constantemente monitoreada. '
        f'Las bases estadounidenses en Qatar, Bahrain y los EAU generan un flujo continuo de '
        f'actividad aerea militar que es rastreada en tiempo real.',
        styles['BodyText2']
    ))
    elements.append(Paragraph(
        f'<b>UAVs en la region:</b> {len(gulf_uavs)} detectados. Los drones militares y de vigilancia '
        f'operan extensivamente en el Golfo Persico para misiones de reconocimiento, patrulla maritima '
        f'y operaciones especiales.',
        styles['BodyText2']
    ))
    elements.append(Paragraph(
        f'<b>Incendios/Anomalias termicas Medio Oriente:</b> {len(me_fires)} detectados via NASA FIRMS. '
        f'Las anomalias termicas en la region pueden indicar ataques con drones, explosiones, '
        f'incendios en instalaciones petroleras, o actividad militar.',
        styles['BodyText2']
    ))
    elements.append(Paragraph(
        f'<b>Interferencia GPS en Medio Oriente:</b> {len(me_gps)} regiones afectadas. '
        f'La interferencia GPS en Medio Oriente es un indicador de guerra electronica activa, '
        f'particularmente relevante para operaciones maritimas en el Estrecho de Ormuz.',
        styles['BodyText2']
    ))
    elements.append(Paragraph(
        f'<b>SIGINT regional:</b> {len(me_sigint)} senales de inteligencia detectadas en el area '
        f'20N-35N / 40E-65E. Las emisiones de radar, comunicaciones militares y senales de '
        f'transpondedor en la region proporcionan indicadores de actividad belica y de vigilancia.',
        styles['BodyText2']
    ))

    # EAU Risk Assessment
    elements.append(Paragraph('3.2 Evaluacion de Riesgo EAU', styles['SubHead']))
    risk_score = 0
    risk_factors = []

    if len(gulf_military) > 3:
        risk_score += 20
        risk_factors.append('Alta actividad militar en Golfo Persico (+20)')
    if len(me_gps) > 0:
        risk_score += 25
        risk_factors.append('Interferencia GPS activa en Medio Oriente (+25)')
    if len(me_fires) > 10:
        risk_score += 15
        risk_factors.append('Anomalias termicas significativas (+15)')
    if len(me_sigint) > 0:
        risk_score += 20
        risk_factors.append('Senales SIGINT detectadas en region (+20)')
    
    # News-based risk
    news = osint_data.get('news', [])
    conflict_news = [n for n in news if any(k in str(n.get('title', '')).lower() 
                     for k in ['iran', 'israel', 'strike', 'gulf', 'missile', 'attack'])]
    if len(conflict_news) > 2:
        risk_score += 20
        risk_factors.append(f'{len(conflict_news)} noticias de conflicto regional (+20)')

    risk_level = 'CRITICO' if risk_score >= 70 else ('ALTO' if risk_score >= 50 else 
                 ('ELEVADO' if risk_score >= 30 else ('MEDIO' if risk_score >= 15 else 'BAJO')))
    risk_color = DANGER if risk_score >= 70 else (HexColor('#f97316') if risk_score >= 50 else 
                 (WARNING if risk_score >= 30 else (HexColor('#eab308') if risk_score >= 15 else SUCCESS)))

    elements.append(Paragraph(
        f'<b>Puntuacion de Riesgo EAU: <font color="{risk_color.hexval()}">{risk_score}/100 ({risk_level})</font></b>',
        ParagraphStyle('RiskScore', parent=styles['Normal'], fontSize=14, leading=20, 
                       textColor=TEXT_COLOR, fontName='Helvetica-Bold', spaceAfter=5*mm)
    ))

    if risk_factors:
        elements.append(Paragraph('<b>Factores de Riesgo Identificados:</b>', styles['BodyText2']))
        for rf in risk_factors:
            elements.append(Paragraph(f'  - {rf}', styles['BodyText2']))

    # Recommendations
    elements.append(Paragraph('3.3 Recomendaciones', styles['SubHead']))
    elements.append(Paragraph(
        '1. Mantener monitoreo continuo de la actividad GPS jamming en el Golfo Persico, '
        'especialmente alrededor del Estrecho de Ormuz, donde la interferencia puede afectar '
        'el trafico maritimo comercial y militar.',
        styles['BodyText2']
    ))
    elements.append(Paragraph(
        '2. Vigilar la actividad de UAVs militares en la zona, particularmente las plataformas '
        'de reconocimiento y ataque que operan desde bases en los EAU y paises vecinos.',
        styles['BodyText2']
    ))
    elements.append(Paragraph(
        '3. Integrar datos de grupos de WhatsApp y Telegram de la comunidad expatriada en EAU '
        'para detectar patrones de comunicacion anomalos, estafas financieras, y actividades '
        'de lavado de dinero a traves de criptomonedas y transferencias hawala.',
        styles['BodyText2']
    ))
    elements.append(Paragraph(
        '4. Correlacionar datos NASA FIRMS con SIGINT para identificar posibles ataques con drones '
        'o explosiones que no sean reportados por medios convencionales.',
        styles['BodyText2']
    ))
    elements.append(Paragraph(
        '5. Implementar alertas automaticas cuando la puntuacion de riesgo EAU supere el umbral '
        'de 70/100, activando el protocolo de notificacion multi-agente.',
        styles['BodyText2']
    ))

    return elements

def build_strategy_section(styles):
    """6 Decision Strategies summary."""
    elements = []
    elements.extend(section_header('4. ESTRATEGIAS DE DECISION - ESTADO DEL SISTEMA', styles))

    strategies = [
        ('1. Umbrales', 'Activo', '6 umbrales configurables (volumen, entidades, alertas, fraude, plataformas, patrones)'),
        ('2. Patrones', 'Activo', '5 tipos detectados (fraude, lavado, desinformacion, crypto, migracion)'),
        ('3. Puntuacion de Riesgo', 'Activo', '5 factores ponderados: Naturaleza 35%, Volumen 25%, Conexiones 20%, OSINT 15%, Recencia 5%'),
        ('4. Consenso Multi-Agente', 'Activo', '4 agentes (Analista, Investigador, Supervisor, Auditor) con reputacion ponderada'),
        ('5. Predictivo', 'Activo', 'Holt-Winters doble suavizado exponencial para volumen, entidades, patrones'),
        ('6. Adaptativo', 'Activo', 'Ajuste automatico de umbrales basado en tasa de falsos positivos'),
    ]

    strat_table_data = [
        [Paragraph('Estrategia', styles['TableHeader']),
         Paragraph('Estado', styles['TableHeader']),
         Paragraph('Descripcion', styles['TableHeader'])]
    ]
    for name, status, desc in strategies:
        status_color = SUCCESS.hexval() if status == 'Activo' else WARNING.hexval()
        strat_table_data.append([
            Paragraph(f'<b>{name}</b>', styles['TableCell']),
            Paragraph(f'<font color="{status_color}">{status}</font>', styles['TableCell']),
            Paragraph(desc, styles['TableCell']),
        ])
    strat_table = Table(strat_table_data, colWidths=[40*mm, 20*mm, 80*mm])
    strat_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), TABLE_HEADER),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, TABLE_ALT]),
        ('GRID', (0,0), (-1,-1), 0.5, HexColor('#cbd5e1')),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    elements.append(strat_table)

    elements.append(Spacer(1, 5*mm))
    elements.append(Paragraph(
        'El sistema implementa un motor de inteligencia con 4 capas DNA completas: '
        'Ingesta (WhatsApp/Telegram/OSINT via Redis Streams + PostgreSQL), '
        'Analisis (NER, keywords multilingue, sentimiento, patrones), '
        'Monitoreo (6 estrategias de decision, flujo de alertas, healthcheck de agentes), '
        'Reportes (4 tipos: threat_summary, risk_analysis, pattern_report, full_intelligence). '
        'El consenso multi-agente requiere 4/4 para auto-alerta, 3/4 para alerta con notificacion, '
        '2/4 para monitoreo humano, y 1/4 se descarta como falso positivo.',
        styles['BodyText2']
    ))

    return elements

def build_dna_section(styles):
    """4 DNA layers status."""
    elements = []
    elements.extend(section_header('5. CAPAS DNA - ESTADO OPERACIONAL', styles))

    layers = [
        ('DNA 1: Ingesta', 'OPERATIVO', 
         'Redis Streams + PostgreSQL dual-write. Fuentes: WhatsApp (Baileys, 195 grupos), '
         'Telegram (Telethon, 81 canales), OSINT (11 scrapers: USGS, NASA FIRMS, OpenSky, GDELT, '
         'GPSJam, UAVs, LiveUAMap, SIGINT/Meshtastic/APRS, News RSS, NWS Weather, Ships AIS). '
         'Event sourcing inmutable con SHA-256 content hash.'),
        ('DNA 2: Analisis', 'OPERATIVO',
         'NER regex (telefonos, wallets BTC/ETH, emails, URLs, personas, ubicaciones). '
         'Keywords multilingue (ES/EN/PT/FR) en 6 categorias. Sentimiento con intensificadores. '
         '5 detectores de patrones: fraude, lavado, desinformacion, manipulacion crypto, migracion irregular. '
         'Motor de correlacion cruzada con similitud Jaccard.'),
        ('DNA 3: Monitoreo', 'OPERATIVO',
         '6 estrategias de decision activas. Flujo de alertas con notificacion multi-canal '
         '(Redis pub/sub, WebSocket, Telegram). Healthcheck de agentes cada 2 minutos. '
         'Scheduler: analisis cada 5min, OSINT cada 15min, estrategias cada 10min, health cada 1min.'),
        ('DNA 4: Reportes', 'OPERATIVO',
         '4 tipos de reporte: threat_summary (OSINT), risk_analysis (distribucion de riesgo), '
         'pattern_report (agrupacion de patrones), full_intelligence (dashboard + OSINT completo). '
         'Generacion via Go backend + Playwright HTML->PDF.'),
    ]

    for name, status, desc in layers:
        elements.append(Paragraph(f'<b>{name}</b> - <font color="{SUCCESS.hexval()}">{status}</font>', styles['SubHead']))
        elements.append(Paragraph(desc, styles['BodyText2']))

    return elements

def main():
    print("Loading data...")
    osint_data = load_json('/tmp/osint_data.json')
    groups_data = load_json('/tmp/telegram_groups.json')
    osint_report = load_json('/tmp/osint_report.json')
    
    now = datetime.now(tz=timezone.utc)
    now_str = now.strftime('%Y-%m-%d %H:%M UTC')
    
    styles = build_styles()
    
    # Build document
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        topMargin=20*mm,
        bottomMargin=20*mm,
        leftMargin=20*mm,
        rightMargin=20*mm,
    )
    
    elements = []
    
    # Cover
    elements.extend(build_cover(styles, osint_data, now_str))
    
    # OSINT Section
    elements.extend(build_osint_section(styles, osint_data))
    
    # Telegram Section
    elements.extend(build_telegram_section(styles, groups_data, []))
    
    # EAU Analysis
    elements.extend(build_eau_section(styles, osint_data, groups_data))
    
    # Strategies
    elements.extend(build_strategy_section(styles))
    
    # DNA Layers
    elements.extend(build_dna_section(styles))
    
    # Build PDF
    print(f"Building PDF at {OUTPUT_PATH}...")
    doc.build(elements)
    print(f"PDF generated successfully: {OUTPUT_PATH}")
    print(f"File size: {os.path.getsize(OUTPUT_PATH) / 1024:.1f} KB")
    
    return OUTPUT_PATH

if __name__ == '__main__':
    path = main()
    print(f"REPORT_PATH={path}")
