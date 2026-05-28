#!/usr/bin/env python3
"""Generate Intelligence Situation Report PDF from OSINT data."""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm, inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle, PageBreak, Image, KeepTogether
)

# ━━ Color Palette (auto-generated) ━━
ACCENT       = colors.HexColor('#1d7795')
TEXT_PRIMARY  = colors.HexColor('#212324')
TEXT_MUTED    = colors.HexColor('#848a90')
BG_SURFACE   = colors.HexColor('#d7dde3')
BG_PAGE      = colors.HexColor('#ebedef')
TABLE_HEADER_COLOR = ACCENT
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = BG_SURFACE

# ━━ Font Registration ━━
pdfmetrics.registerFont(TTFont('Carlito', '/usr/share/fonts/truetype/english/Carlito-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Carlito-Bold', '/usr/share/fonts/truetype/english/Carlito-Bold.ttf'))
pdfmetrics.registerFont(TTFont('SarasaMonoSC', '/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
registerFontFamily('Carlito', normal='Carlito', bold='Carlito-Bold')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

# ━━ Page Setup ━━
PAGE_W, PAGE_H = A4
MARGIN = 1.8 * cm
CONTENT_W = PAGE_W - 2 * MARGIN

# ━━ Styles ━━
title_style = ParagraphStyle(
    'Title', fontName='Carlito', fontSize=28, leading=34,
    alignment=TA_LEFT, textColor=ACCENT, spaceAfter=6
)
h1_style = ParagraphStyle(
    'H1', fontName='Carlito', fontSize=18, leading=24,
    alignment=TA_LEFT, textColor=ACCENT, spaceBefore=18, spaceAfter=8
)
h2_style = ParagraphStyle(
    'H2', fontName='Carlito', fontSize=14, leading=20,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY, spaceBefore=12, spaceAfter=6
)
body_style = ParagraphStyle(
    'Body', fontName='Carlito', fontSize=10.5, leading=17,
    alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY, spaceAfter=6
)
header_cell = ParagraphStyle(
    'HeaderCell', fontName='Carlito', fontSize=10, leading=14,
    alignment=TA_CENTER, textColor=TABLE_HEADER_TEXT
)
cell_style = ParagraphStyle(
    'Cell', fontName='Carlito', fontSize=9.5, leading=13,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY
)
cell_center = ParagraphStyle(
    'CellCenter', fontName='Carlito', fontSize=9.5, leading=13,
    alignment=TA_CENTER, textColor=TEXT_PRIMARY
)
muted_style = ParagraphStyle(
    'Muted', fontName='Carlito', fontSize=9, leading=13,
    alignment=TA_LEFT, textColor=TEXT_MUTED
)
caption_style = ParagraphStyle(
    'Caption', fontName='Carlito', fontSize=9, leading=12,
    alignment=TA_CENTER, textColor=TEXT_MUTED, spaceBefore=3, spaceAfter=6
)
callout_style = ParagraphStyle(
    'Callout', fontName='Carlito', fontSize=22, leading=28,
    alignment=TA_CENTER, textColor=ACCENT, spaceBefore=6, spaceAfter=2
)

# ━━ Load OSINT Data ━━
data_path = '/tmp/osint_full_data.json'
if os.path.exists(data_path):
    with open(data_path) as f:
        osint = json.load(f)
else:
    osint = {}

from datetime import UTC; now = datetime.now(UTC)
report_date = now.strftime('%Y-%m-%d %H:%M UTC')

threat_level = osint.get('threat_level', 'UNKNOWN').upper()
earthquakes = osint.get('earthquakes', [])
fires = osint.get('firms_fires', [])
military_flights = osint.get('military_flights', [])
commercial_flights = osint.get('commercial_flights', [])
tracked_flights = osint.get('tracked_flights', [])
news = osint.get('news', [])
gdelt = osint.get('gdelt', [])
weather_alerts = osint.get('weather_alerts', [])
gps_jamming = osint.get('gps_jamming', [])
uavs = osint.get('uavs', [])
liveuamap = osint.get('liveuamap', [])
sigint = osint.get('sigint', [])
ships = osint.get('ships', [])

# ━━ Helper Functions ━━
def make_table(data_rows, col_widths, has_header=True):
    t = Table(data_rows, colWidths=col_widths, hAlign='CENTER')
    style_cmds = [
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.5, TEXT_MUTED),
    ]
    if has_header:
        style_cmds.extend([
            ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
            ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ])
        for i in range(1, len(data_rows)):
            bg = TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

def safe_text(text, max_len=80):
    if not text:
        return 'N/A'
    s = str(text).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    return s[:max_len] + '...' if len(s) > max_len else s

# ━━ Build Story ━━
story = []

# ── Title Block ──
story.append(Paragraph('<b>INTELLIGENCE SITUATION REPORT</b>', title_style))
story.append(Paragraph(f'Generated: {report_date}', muted_style))
story.append(Paragraph(f'Classification: UNCLASSIFIED // FOR OFFICIAL USE ONLY', muted_style))
story.append(Spacer(1, 12))

# ── Executive Summary ──
story.append(Paragraph('<b>1. Executive Summary</b>', h1_style))
threat_color = '#CC0000' if threat_level == 'CRITICAL' else '#FF6600' if threat_level == 'HIGH' else '#CCAA00'
story.append(Paragraph(
    f'The current global threat level is assessed as <b><font color="{threat_color}">{threat_level}</font></b>. '
    f'This assessment is based on real-time data aggregation from {len(earthquakes)} seismic events, '
    f'{len(fires)} thermal anomalies (NASA FIRMS), {len(tracked_flights)} tracked aircraft, '
    f'{len(gps_jamming)} GPS interference zones, {len(uavs)} UAV/drone activities, '
    f'{len(liveuamap)} conflict events, {len(sigint)} SIGINT observations, '
    f'{len(ships)} maritime zone vessels, {len(weather_alerts)} weather alerts, '
    f'and {len(news)} news articles from global sources. '
    f'The intelligence platform integrates 11 OSINT data sources across the 4 DNA layers '
    f'(Ingestion, Analysis, Monitoring, Reports) with 6 decision strategies providing '
    f'continuous threat assessment and alert generation.',
    body_style
))
story.append(Spacer(1, 6))

# Key Metrics Callout
metrics_data = [
    [Paragraph('<b>Threat Level</b>', header_cell),
     Paragraph('<b>Seismic</b>', header_cell),
     Paragraph('<b>Fires</b>', header_cell),
     Paragraph('<b>Aircraft</b>', header_cell),
     Paragraph('<b>UAVs</b>', header_cell),
     Paragraph('<b>GPS Jam</b>', header_cell),
     Paragraph('<b>Ships</b>', header_cell)],
    [Paragraph(f'<b><font color="{threat_color}">{threat_level}</font></b>', cell_center),
     Paragraph(str(len(earthquakes)), cell_center),
     Paragraph(str(len(fires)), cell_center),
     Paragraph(str(len(tracked_flights)), cell_center),
     Paragraph(str(len(uavs)), cell_center),
     Paragraph(str(len(gps_jamming)), cell_center),
     Paragraph(str(len(ships)), cell_center)],
]
story.append(Spacer(1, 12))
story.append(make_table(metrics_data, [CONTENT_W * r for r in [0.14, 0.14, 0.14, 0.14, 0.14, 0.14, 0.16]]))
story.append(Paragraph('Table 1: Key Intelligence Metrics Summary', caption_style))
story.append(Spacer(1, 18))

# ── Seismic Activity ──
story.append(Paragraph('<b>2. Seismic Activity</b>', h1_style))
story.append(Paragraph(
    f'Seismic monitoring via USGS identified {len(earthquakes)} significant earthquakes (M4.5+) in the past 24 hours. '
    f'These events are monitored for potential correlation with other intelligence indicators, '
    f'including infrastructure damage reports, population displacement patterns, and cascading effects '
    f'on transportation and communication networks. Earthquake data is cross-referenced with LiveUAMap '
    f'conflict events and GDELT global event data to identify regions where natural disasters may '
    f'exacerbate existing security situations.',
    body_style
))
if earthquakes:
    eq_data = [[
        Paragraph('<b>Location</b>', header_cell),
        Paragraph('<b>Magnitude</b>', header_cell),
        Paragraph('<b>Depth (km)</b>', header_cell),
        Paragraph('<b>Time</b>', header_cell),
    ]]
    for eq in earthquakes[:10]:
        props = eq.get('properties', eq) if isinstance(eq, dict) else {}
        eq_data.append([
            Paragraph(safe_text(props.get('place', 'Unknown'), 50), cell_style),
            Paragraph(str(props.get('mag', 'N/A')), cell_center),
            Paragraph(str(props.get('depth', 'N/A')), cell_center),
            Paragraph(safe_text(props.get('time', 'N/A'), 25), cell_center),
        ])
    story.append(Spacer(1, 6))
    story.append(make_table(eq_data, [CONTENT_W * r for r in [0.40, 0.18, 0.18, 0.24]]))
    story.append(Paragraph('Table 2: Recent Seismic Events (M4.5+)', caption_style))
story.append(Spacer(1, 18))

# ── Fire/Thermal Anomalies ──
story.append(Paragraph('<b>3. Fire and Thermal Anomalies</b>', h1_style))
story.append(Paragraph(
    f'NASA FIRMS satellite monitoring detected {len(fires)} active thermal anomalies worldwide. '
    f'These fire detections are analyzed for patterns indicating deliberate infrastructure attacks, '
    f'military operations, or environmental emergencies. Clusters of thermal anomalies in conflict '
    f'zones receive enhanced correlation with LiveUAMap and GDELT event data. The integration of '
    f'MODIS and VIIRS sensors provides continuous global coverage with sub-kilometer spatial resolution, '
    f'enabling near-real-time fire detection for intelligence purposes.',
    body_style
))
if fires:
    regions = {}
    for f in fires[:50]:
        lat = f.get('latitude', f.get('lat', 0))
        lon = f.get('longitude', f.get('lon', 0))
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            region_key = f"{int(lat//10)*10}N-{int(lon//10)*10}E"
            regions[region_key] = regions.get(region_key, 0) + 1
    if regions:
        fire_data = [[Paragraph('<b>Region Grid</b>', header_cell), Paragraph('<b>Active Fires</b>', header_cell)]]
        for region, count in sorted(regions.items(), key=lambda x: -x[1])[:10]:
            fire_data.append([Paragraph(region, cell_center), Paragraph(str(count), cell_center)])
        story.append(Spacer(1, 6))
        story.append(make_table(fire_data, [CONTENT_W * 0.5, CONTENT_W * 0.5]))
        story.append(Paragraph('Table 3: Fire Distribution by Region Grid (10-degree)', caption_style))
story.append(Spacer(1, 18))

# ── GPS Interference ──
story.append(Paragraph('<b>4. GPS Interference and Jamming</b>', h1_style))
story.append(Paragraph(
    f'GPS interference monitoring identified {len(gps_jamming)} active jamming or spoofing zones. '
    f'GPS jamming is a critical indicator of electronic warfare operations and can significantly '
    f'impact both civilian aviation and military navigation systems. The correlation between GPS '
    f'jamming zones and military aircraft activity provides high-confidence indicators of active '
    f'conflict zones. Areas with persistent GPS interference are flagged for enhanced SIGINT monitoring '
    f'and cross-referenced with UAV activity patterns and maritime vessel GPS anomaly reports.',
    body_style
))
if gps_jamming:
    gps_data = [[
        Paragraph('<b>Zone</b>', header_cell),
        Paragraph('<b>Severity</b>', header_cell),
        Paragraph('<b>Details</b>', header_cell),
    ]]
    for gz in gps_jamming[:10]:
        gps_data.append([
            Paragraph(safe_text(gz.get('zone', gz.get('name', 'Unknown')), 30), cell_style),
            Paragraph(safe_text(str(gz.get('severity', gz.get('risk_level', 'N/A'))), 15), cell_center),
            Paragraph(safe_text(gz.get('description', gz.get('details', '')), 50), cell_style),
        ])
    story.append(Spacer(1, 6))
    story.append(make_table(gps_data, [CONTENT_W * r for r in [0.25, 0.20, 0.55]]))
    story.append(Paragraph('Table 4: GPS Interference Zones', caption_style))
story.append(Spacer(1, 18))

# ── Military and UAV Activity ──
story.append(Paragraph('<b>5. Military Aviation and UAV Activity</b>', h1_style))
story.append(Paragraph(
    f'OpenSky Network tracking identified {len(military_flights)} military aircraft and {len(uavs)} UAV/drone '
    f'operations. Military flight monitoring provides insight into force posture, deployment patterns, '
    f'and potential escalation indicators. UAV activity is tracked with callsign classification to identify '
    f'specific platform types (MQ-9 Reaper, RQ-4 Global Hawk, etc.). Combined with GPS jamming data, '
    f'these indicators form a multi-source assessment of military operational tempo in monitored regions.',
    body_style
))
if uavs:
    uav_data = [[
        Paragraph('<b>Callsign</b>', header_cell),
        Paragraph('<b>Type</b>', header_cell),
        Paragraph('<b>Origin</b>', header_cell),
    ]]
    for u in uavs[:10]:
        uav_data.append([
            Paragraph(safe_text(u.get('callsign', 'N/A'), 20), cell_style),
            Paragraph(safe_text(u.get('type', u.get('classification', 'N/A')), 25), cell_center),
            Paragraph(safe_text(u.get('origin_country', 'N/A'), 20), cell_center),
        ])
    story.append(Spacer(1, 6))
    story.append(make_table(uav_data, [CONTENT_W * r for r in [0.30, 0.40, 0.30]]))
    story.append(Paragraph('Table 5: UAV/Drone Activity', caption_style))
story.append(Spacer(1, 18))

# ── SIGINT ──
story.append(Paragraph('<b>6. Signals Intelligence (SIGINT)</b>', h1_style))
story.append(Paragraph(
    f'Signals intelligence collection identified {len(sigint)} observations from Meshtastic mesh networks, '
    f'APRS amateur radio positions, and OpenSky military transponder data. SIGINT analysis focuses on '
    f'communication patterns, frequency utilization, and anomalous signal activity that may indicate '
    f'coordinated operations or electronic warfare. Military transponder data from OpenSky provides '
    f'identification of government and military aircraft, including callsign patterns consistent with '
    f'intelligence, surveillance, and reconnaissance (ISR) missions.',
    body_style
))
story.append(Spacer(1, 18))

# ── Maritime Intelligence ──
story.append(Paragraph('<b>7. Maritime Intelligence</b>', h1_style))
story.append(Paragraph(
    f'Maritime domain awareness monitors {len(ships)} vessels across 8 strategic chokepoints and conflict zones. '
    f'Monitored areas include the Red Sea/Bab el-Mandeb Strait, Strait of Hormuz, Gulf of Aden, '
    f'South China Sea, Black Sea, Eastern Mediterranean, Persian Gulf, and Gulf of Oman. Military vessel '
    f'presence in these zones is correlated with GPS jamming and conflict events to assess maritime security '
    f'threats. Commercial vessel tracking provides insight into trade route disruptions and potential '
    f'chokepoint vulnerabilities.',
    body_style
))
if ships:
    mil_count = sum(1 for s in ships if s.get('vessel_type') == 'military' or 'naval' in str(s.get('description', '')).lower())
    mil_vessels = [s for s in ships if s.get('vessel_type') == 'military' or 'naval' in str(s.get('description', '')).lower()]
    if mil_vessels:
        ship_data = [[
            Paragraph('<b>Zone</b>', header_cell),
            Paragraph('<b>Type</b>', header_cell),
            Paragraph('<b>Status</b>', header_cell),
            Paragraph('<b>Threat Advisory</b>', header_cell),
        ]]
        for sv in mil_vessels[:8]:
            ship_data.append([
                Paragraph(safe_text(sv.get('zone', 'N/A'), 25), cell_style),
                Paragraph(safe_text(sv.get('vessel_type', 'N/A'), 12), cell_center),
                Paragraph(safe_text(sv.get('status', 'N/A'), 12), cell_center),
                Paragraph(safe_text(sv.get('threat_advisory', ''), 35), cell_style),
            ])
        story.append(Spacer(1, 6))
        story.append(make_table(ship_data, [CONTENT_W * r for r in [0.25, 0.12, 0.12, 0.51]]))
        story.append(Paragraph('Table 6: Military Vessel Activity in Monitored Zones', caption_style))
story.append(Spacer(1, 18))

# ── Conflict Events ──
story.append(Paragraph('<b>8. Conflict and Geopolitical Events</b>', h1_style))
story.append(Paragraph(
    f'LiveUAMap and GDELT monitoring identified {len(liveuamap)} conflict events and {len(gdelt)} global '
    f'events requiring intelligence attention. Conflict events are classified by category (military, '
    f'humanitarian, infrastructure, political) and correlated with seismic, fire, and GPS data to build '
    f'comprehensive situational awareness in active conflict zones. The GDELT Project provides broader '
    f'geopolitical context with real-time monitoring of global news media across 65+ languages, '
    f'identifying emerging crises before they appear in traditional intelligence channels.',
    body_style
))
if liveuamap:
    luam_data = [[
        Paragraph('<b>Event</b>', header_cell),
        Paragraph('<b>Category</b>', header_cell),
        Paragraph('<b>Location</b>', header_cell),
    ]]
    for le in liveuamap[:10]:
        luam_data.append([
            Paragraph(safe_text(le.get('title', le.get('event', 'N/A')), 40), cell_style),
            Paragraph(safe_text(le.get('category', le.get('event_type', 'N/A')), 15), cell_center),
            Paragraph(safe_text(le.get('location', 'N/A'), 25), cell_style),
        ])
    story.append(Spacer(1, 6))
    story.append(make_table(luam_data, [CONTENT_W * r for r in [0.45, 0.20, 0.35]]))
    story.append(Paragraph('Table 7: Active Conflict Events', caption_style))
story.append(Spacer(1, 18))

# ── Decision Strategies Assessment ──
story.append(Paragraph('<b>9. Decision Strategies Assessment</b>', h1_style))
story.append(Paragraph(
    'The intelligence platform employs 6 decision strategies operating in parallel to provide '
    'comprehensive threat assessment. The Threshold Strategy monitors numeric limits across 6 metrics '
    '(message volume, high-risk entities, critical alerts, fraud keyword density, cross-platform mentions, '
    'pattern occurrences). The Pattern Strategy detects cross-channel patterns with severity classification. '
    'The Risk Scoring Strategy computes weighted scores using Nature (35%), Volume (25%), Connections (20%), '
    'OSINT Context (15%), and Recency (5%) factors. The Consensus Strategy uses 4 specialized agents '
    '(OSINT, SIGINT, HUMINT, Predictive) with voting rules: 4/4 = auto-execute, 3/4 = auto-execute + notify, '
    '2/4 = require human approval, 1/4 = dismiss as false positive. The Predictive Strategy uses '
    'Holt-Winters triple exponential smoothing for trend forecasting. The Adaptive Strategy adjusts '
    'thresholds based on feedback to minimize false positive rates.',
    body_style
))
strat_data = [[
    Paragraph('<b>Strategy</b>', header_cell),
    Paragraph('<b>Type</b>', header_cell),
    Paragraph('<b>Status</b>', header_cell),
    Paragraph('<b>Description</b>', header_cell),
]]
for name, stype, status, desc in [
    ('Threshold', 'Numeric Limits', 'Active', 'Triggers alerts when configurable thresholds are breached'),
    ('Pattern', 'Cross-Channel', 'Active', 'Detects cross-channel patterns with severity classification'),
    ('Risk Scoring', 'Weighted Model', 'Active', '0-100 score: Nature 35%, Volume 25%, Connections 20%, OSINT 15%, Recency 5%'),
    ('Consensus', 'Multi-Agent Vote', 'Active', '4 agents vote: OSINT, SIGINT, HUMINT, Predictive'),
    ('Predictive', 'Time-Series', 'Active', 'Holt-Winters forecasting for 7-period ahead predictions'),
    ('Adaptive', 'Self-Tuning', 'Active', 'Auto-adjusts thresholds based on false positive feedback'),
]:
    strat_data.append([
        Paragraph(name, cell_style),
        Paragraph(stype, cell_center),
        Paragraph(status, cell_center),
        Paragraph(desc, cell_style),
    ])
story.append(Spacer(1, 6))
story.append(make_table(strat_data, [CONTENT_W * r for r in [0.14, 0.14, 0.10, 0.62]]))
story.append(Paragraph('Table 8: Active Decision Strategies', caption_style))
story.append(Spacer(1, 18))

# ── 4 DNA Layers Status ──
story.append(Paragraph('<b>10. DNA Layer Architecture Status</b>', h1_style))
story.append(Paragraph(
    'The intelligence platform operates across 4 DNA layers, each with dedicated agents and workflows. '
    'Layer 1 (Ingestion) handles message collection from WhatsApp, Telegram, and OSINT sources via '
    'Redis Streams with PostgreSQL dual-write event sourcing. Layer 2 (Analysis) performs keyword detection, '
    'sentiment analysis, entity extraction, pattern detection, and multi-method correlation (Jaccard, '
    'co-mention, temporal, geospatial). Layer 3 (Monitoring) runs all 6 decision strategies with '
    'a ring buffer alert system (max 1000 alerts) and 15-minute fingerprint-based deduplication, '
    'plus per-severity rate limiting. Layer 4 (Reports) generates threat summaries, risk analyses, '
    'pattern reports, full intelligence assessments, and maritime threat reports on demand or schedule.',
    body_style
))
dna_data = [[
    Paragraph('<b>Layer</b>', header_cell),
    Paragraph('<b>Name</b>', header_cell),
    Paragraph('<b>Agents</b>', header_cell),
    Paragraph('<b>Key Components</b>', header_cell),
]]
for layer, name, agents, components in [
    ('1', 'Ingestion', '3', 'WhatsApp, Telegram, OSINT ingesters with Redis Streams + PostgreSQL event sourcing'),
    ('2', 'Analysis', '3', 'Keyword detection, sentiment analysis, entity extraction, pattern detection, V1+V2 correlation'),
    ('3', 'Monitoring', '5', '6 strategies, ring buffer alerts, 15-min dedup, per-severity rate limiting'),
    ('4', 'Reports', '1', 'Threat summary, risk analysis, pattern report, full intelligence, maritime threat'),
]:
    dna_data.append([
        Paragraph(layer, cell_center),
        Paragraph(name, cell_center),
        Paragraph(agents, cell_center),
        Paragraph(components, cell_style),
    ])
story.append(Spacer(1, 6))
story.append(make_table(dna_data, [CONTENT_W * r for r in [0.08, 0.12, 0.08, 0.72]]))
story.append(Paragraph('Table 9: DNA Layer Architecture', caption_style))
story.append(Spacer(1, 18))

# ── Weather Alerts ──
if weather_alerts:
    story.append(Paragraph('<b>11. Weather Hazards</b>', h1_style))
    story.append(Paragraph(
        f'The National Weather Service reports {len(weather_alerts)} active weather alerts. Severe weather '
        f'events are monitored for impact on military operations, infrastructure resilience, and humanitarian '
        f'disaster potential. Weather data is cross-referenced with maritime intelligence to assess navigational '
        f'hazards for commercial and military vessel operations in affected zones.',
        body_style
    ))
    story.append(Spacer(1, 18))

# ── Conclusion ──
story.append(Paragraph('<b>12. Assessment and Recommendations</b>', h1_style))
story.append(Paragraph(
    f'Based on the comprehensive analysis of {len(earthquakes) + len(fires) + len(tracked_flights) + len(gps_jamming) + len(uavs) + len(liveuamap) + len(sigint) + len(ships) + len(weather_alerts)} '
    f'intelligence indicators across 11 data sources, the current threat environment requires sustained '
    f'monitoring and enhanced correlation between multiple intelligence disciplines. The integration of '
    f'maritime zone intelligence with existing OSINT, SIGINT, and conflict monitoring capabilities '
    f'significantly enhances the platform\'s ability to detect and assess emerging threats in strategic '
    f'chokepoints. The 6 decision strategies provide complementary assessment perspectives, with the '
    f'Consensus Strategy serving as the primary escalation mechanism and the Adaptive Strategy ensuring '
    f'continuous calibration of alert thresholds against observed false positive rates.',
    body_style
))
story.append(Paragraph(
    'Key recommendations: (1) Maintain enhanced monitoring of GPS jamming zones correlated with '
    'military aviation activity; (2) Continue tracking maritime vessel movements in the Red Sea and '
    'Strait of Hormuz corridors; (3) Monitor seismic activity in tectonically active conflict zones '
    'for potential cascading effects; (4) Validate Predictive Strategy forecasts against observed '
    'trend changes; (5) Review Adaptive Strategy threshold adjustments weekly to ensure appropriate '
    'sensitivity levels.',
    body_style
))

# ━━ Build PDF ━━
output_path = '/home/z/my-project/download/intelligence_situation_report.pdf'
os.makedirs(os.path.dirname(output_path), exist_ok=True)

from reportlab.platypus import SimpleDocTemplate

doc = SimpleDocTemplate(
    output_path,
    pagesize=A4,
    leftMargin=MARGIN,
    rightMargin=MARGIN,
    topMargin=MARGIN,
    bottomMargin=MARGIN,
    title='Intelligence Situation Report',
    author='Z.ai',
    creator='Z.ai',
    subject='Multi-Source Intelligence Situation Report'
)

# Add page numbers
def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont('Carlito', 8)
    canvas.setFillColor(TEXT_MUTED)
    page_text = f'Page {doc.page}'
    canvas.drawCentredString(PAGE_W / 2, 1 * cm, page_text)
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 0.8 * cm,
                           'UNCLASSIFIED // FOR OFFICIAL USE ONLY')
    canvas.restoreState()

doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
print(f'PDF generated: {output_path}')
print(f'File size: {os.path.getsize(output_path)} bytes')
