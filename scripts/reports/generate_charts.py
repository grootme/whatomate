import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import numpy as np

# Font setup for Spanish - use DejaVu which handles Latin chars
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Liberation Sans']
plt.rcParams['axes.unicode_minus'] = False

COLORS = ['#2d96b9', '#4ecdc4', '#ff6b6b', '#feca57', '#a29bfe', '#fd79a8', '#6c5ce7', '#00b894', '#e17055', '#0984e3']
ACCENT = '#2d96b9'
MUTED = '#7a8287'

# === Chart 1: WhatsApp Categories Distribution ===
fig, ax = plt.subplots(figsize=(8, 5))
categories = ['Comercio/Ventas', 'Inmobiliario/Dubai', 'Comida/Bebidas', 'Electrodomesticos', 'Ropa/Moda', 'Tecnologia/IA', 'Servicios', 'Otros']
counts = [58, 22, 18, 12, 15, 5, 8, 57]
sorted_idx = np.argsort(counts)[::-1]
categories = [categories[i] for i in sorted_idx]
counts = [counts[i] for i in sorted_idx]
bars = ax.barh(categories, counts, color=ACCENT, alpha=0.85, edgecolor='white', height=0.6)
for bar, val in zip(bars, counts):
    ax.text(bar.get_width() + 1, bar.get_y() + bar.get_height()/2, str(val), va='center', fontsize=10, color=MUTED)
ax.set_xlabel('Cantidad de Grupos', fontsize=11)
ax.set_title('Distribucion de Grupos WhatsApp por Categoria', fontsize=13, fontweight='bold', pad=15)
ax.invert_yaxis()
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['bottom'].set_alpha(0.3)
ax.spines['left'].set_alpha(0.3)
plt.tight_layout()
plt.savefig('/home/z/my-project/download/chart_wa_categories.png', dpi=200, bbox_inches='tight')
plt.close()

# === Chart 2: Telegram Categories Distribution ===
fig, ax = plt.subplots(figsize=(8, 5))
tg_categories = ['Cripto/Divisas', 'Empleo/Tech', 'Ventas/Cuba', 'IA/Tecnologia', 'Noticias/Info', 'TON Ecosystem', 'Otros']
tg_counts = [12, 6, 10, 4, 5, 8, 36]
sorted_idx = np.argsort(tg_counts)[::-1]
tg_categories = [tg_categories[i] for i in sorted_idx]
tg_counts = [tg_counts[i] for i in sorted_idx]
bars = ax.barh(tg_categories, tg_counts, color='#4ecdc4', alpha=0.85, edgecolor='white', height=0.6)
for bar, val in zip(bars, tg_counts):
    ax.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height()/2, str(val), va='center', fontsize=10, color=MUTED)
ax.set_xlabel('Cantidad de Grupos/Canales', fontsize=11)
ax.set_title('Distribucion de Grupos Telegram por Categoria', fontsize=13, fontweight='bold', pad=15)
ax.invert_yaxis()
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['bottom'].set_alpha(0.3)
ax.spines['left'].set_alpha(0.3)
plt.tight_layout()
plt.savefig('/home/z/my-project/download/chart_tg_categories.png', dpi=200, bbox_inches='tight')
plt.close()

# === Chart 3: Top 10 WhatsApp Groups by Participants ===
fig, ax = plt.subplots(figsize=(8, 5))
top_wa = [
    ('Comunidad Emiratos', 1026), ('Compras/Ventas Cascajal', 1024),
    ('Gestion triciclos 2', 1022), ("D'NICO MERCADO 2", 1013),
    ('Gestion triciclos/motos', 1007), ('Gestores G&Y', 995),
    ('Mi Mascota Viaja', 958), ('Latin Rents Dubai', 940),
    ('ONLY SHOPS', 932), ('LOOK PERFECTO', 922)
]
names = [x[0] for x in top_wa][::-1]
vals = [x[1] for x in top_wa][::-1]
bars = ax.barh(names, vals, color=ACCENT, alpha=0.85, edgecolor='white', height=0.6)
for bar, val in zip(bars, vals):
    ax.text(bar.get_width() + 10, bar.get_y() + bar.get_height()/2, str(val), va='center', fontsize=9, color=MUTED)
ax.set_xlabel('Participantes', fontsize=11)
ax.set_title('Top 10 Grupos WhatsApp por Participantes', fontsize=13, fontweight='bold', pad=15)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['bottom'].set_alpha(0.3)
ax.spines['left'].set_alpha(0.3)
plt.tight_layout()
plt.savefig('/home/z/my-project/download/chart_wa_top10.png', dpi=200, bbox_inches='tight')
plt.close()

# === Chart 4: Top 10 Telegram Groups by Participants ===
fig, ax = plt.subplots(figsize=(8, 5))
top_tg = [
    ('Toncoin', 7948677), ('TrueCaller', 5772742), ('Beaverson Trade', 193686),
    ('Toncoin ES', 220367), ('Whale Alert', 314284), ('CryptoQuant Alert', 73861),
    ('Empresa Elect. Habana', 282474), ('Whale Sniper', 62630),
    ('Exponiendo La Elite', 40569), ('Despertador Matrix', 80565)
]
names = [x[0] for x in top_tg][::-1]
vals = [x[1] for x in top_tg][::-1]
bars = ax.barh(names, vals, color='#4ecdc4', alpha=0.85, edgecolor='white', height=0.6)
for bar, val in zip(bars, vals):
    if val >= 1000000:
        txt = f'{val/1000000:.1f}M'
    elif val >= 1000:
        txt = f'{val/1000:.0f}K'
    else:
        txt = str(val)
    ax.text(bar.get_width() + max(vals)*0.01, bar.get_y() + bar.get_height()/2, txt, va='center', fontsize=9, color=MUTED)
ax.set_xlabel('Participantes', fontsize=11)
ax.set_title('Top 10 Grupos/Canales Telegram por Participantes', fontsize=13, fontweight='bold', pad=15)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['bottom'].set_alpha(0.3)
ax.spines['left'].set_alpha(0.3)
plt.tight_layout()
plt.savefig('/home/z/my-project/download/chart_tg_top10.png', dpi=200, bbox_inches='tight')
plt.close()

# === Chart 5: Platform Comparison ===
fig, ax = plt.subplots(figsize=(7, 4))
platforms = ['WhatsApp', 'Telegram']
total_groups = [195, 81]
bars = ax.bar(platforms, total_groups, color=[ACCENT, '#4ecdc4'], alpha=0.85, width=0.5, edgecolor='white')
for i, v in enumerate(total_groups):
    ax.text(i, v + 3, str(v), ha='center', fontsize=12, fontweight='bold', color=MUTED)
ax.set_ylabel('Total Grupos/Canales', fontsize=11)
ax.set_title('Comparativa de Plataformas: Total de Grupos', fontsize=13, fontweight='bold', pad=15)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['bottom'].set_alpha(0.3)
ax.spines['left'].set_alpha(0.3)
plt.tight_layout()
plt.savefig('/home/z/my-project/download/chart_platform_comparison.png', dpi=200, bbox_inches='tight')
plt.close()

print("All charts generated successfully!")
