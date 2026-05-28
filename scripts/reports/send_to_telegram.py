#!/usr/bin/env python3
"""Send intelligence report PDF to Telegram via Telethon."""

import asyncio
import sys
import os

# Add the telethon-service directory to path for imports
sys.path.insert(0, '/home/z/my-project/telethon-service')

from client import telethon_client

REPORT_PATH = '/home/z/my-project/download/informe_inteligencia_eau.pdf'
# Send to self (saved messages) - the user will receive it
CHAT_ID = 'me'  # Saved messages


async def main():
    print("Connecting to Telegram...")
    result = await telethon_client.connect()
    print(f"Connection result: {result}")

    if not telethon_client.connected:
        print("ERROR: Could not connect to Telegram")
        return False

    # Verify file exists
    if not os.path.exists(REPORT_PATH):
        print(f"ERROR: Report file not found at {REPORT_PATH}")
        return False

    file_size = os.path.getsize(REPORT_PATH)
    print(f"Sending report ({file_size/1024:.1f} KB) to Telegram...")

    try:
        # Send the PDF document
        await telethon_client.client.send_file(
            CHAT_ID,
            REPORT_PATH,
            caption=(
                "📊 **INFORME DE INTELIGENCIA EAU**\n\n"
                "Análisis de amenazas globales y monitoreo de grupos.\n"
                "Fuentes: OSINT (11 scrapers) + Telegram (81 grupos)\n\n"
                "🟢 DNA 1: Ingesta - OPERATIVO\n"
                "🟢 DNA 2: Análisis - OPERATIVO\n"
                "🟢 DNA 3: Monitoreo - OPERATIVO\n"
                "🟢 DNA 4: Reportes - OPERATIVO\n\n"
                "6 estrategias de decisión activas\n"
                "Nivel de amenaza: CRÍTICO"
            ),
            force_document=True,
        )
        print("Report sent successfully to Telegram!")
        return True
    except Exception as e:
        print(f"Error sending report: {e}")
        # Try sending as text message with the report summary instead
        try:
            await telethon_client.send_message(
                CHAT_ID,
                "📊 INFORME DE INTELIGENCIA EAU - RESUMEN\n\n"
                "El informe PDF completo fue generado pero no se pudo enviar como archivo.\n"
                "Ruta del archivo: " + REPORT_PATH + "\n\n"
                "NIVEL DE AMENAZA: CRÍTICO\n\n"
                "OSINT:\n"
                "• 9 sismos detectados (max M5.3)\n"
                "• 15 vuelos militares rastreados\n"
                "• 261 incendios NASA FIRMS\n"
                "• 91 UAVs/drones detectados\n"
                "• 9 regiones con GPS jamming\n"
                "• 50 señales SIGINT\n"
                "• 8 conflictos activos LiveUAMap\n\n"
                "TELEGRAM:\n"
                "• 81 grupos monitoreados\n"
                "• Categorías: Cripto, Divisas, Whale Alerts, Tech, News\n\n"
                "4 CAPAS DNA: OPERATIVAS\n"
                "6 ESTRATEGIAS: ACTIVAS"
            )
            print("Summary sent as text message!")
            return True
        except Exception as e2:
            print(f"Error sending text message: {e2}")
            return False


if __name__ == '__main__':
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
