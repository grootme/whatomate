"""
Telethon Service — FastAPI REST API
Bridges the Telegram User API (via Telethon) with the Whatomate ecosystem.

Flow:  User -> Bot -> Hermes Agent -> Telethon Service -> Groups/Messages -> Shadowbroker/DeerFlow Analysis -> Response

Endpoints:
  GET  /health                     - Health check
  POST /connect                    - Connect to Telegram
  POST /disconnect                 - Disconnect
  GET  /status                     - Auth status + user info
  POST /auth/send_code             - Start login: send verification code
  POST /auth/submit_code           - Complete login: submit code
  GET  /dialogs                    - List all dialogs
  GET  /groups                     - List groups only
  GET  /groups/{chat_id}/messages  - Get messages from a group
  POST /analyze                    - Full group analysis
  POST /search                     - Search across all groups
  POST /send                       - Send message as user
  POST /command                    - Bot command processor (entry point for ecosystem)
"""

import asyncio
import json
import logging
import time
import urllib.request
import urllib.error
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from client import telethon_client
from config import (
    HERMES_URL, SHADOWBROKER_URL, COGNITIVE_URL,
    TELEGRAM_CHAT_ID, SERVICE_PORT, SERVICE_HOST,
    PHONE_NUMBER,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
)
logger = logging.getLogger('telethon-service')

# Create FastAPI app
app = FastAPI(
    title='Telethon Service',
    description='Telegram User API integration for the Whatomate ecosystem',
    version='1.0.0',
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


# --- Pydantic Models ---


class ConnectRequest(BaseModel):
    phone: Optional[str] = None
    code: Optional[str] = None
    password: Optional[str] = None


class SendCodeRequest(BaseModel):
    phone: Optional[str] = None


class SubmitCodeRequest(BaseModel):
    phone: Optional[str] = None
    code: str
    password: Optional[str] = None


class SendRequest(BaseModel):
    chat_id: int
    message: str


class SearchRequest(BaseModel):
    query: str
    limit_per_group: int = 5


class CommandRequest(BaseModel):
    command: str
    chat_id: Optional[int] = None
    args: Optional[str] = None


class AnalyzeRequest(BaseModel):
    deep: bool = False
    max_groups: int = 20


# --- Helper: HTTP Client ---


async def fetch_json(url: str, method: str = 'GET', body: dict = None, timeout: int = 30) -> dict:
    """Simple async HTTP client."""
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Content-Type', 'application/json')

    loop = asyncio.get_event_loop()
    try:
        response = await loop.run_in_executor(
            None,
            lambda: urllib.request.urlopen(req, timeout=timeout)
        )
        return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode() if e.fp else ''
        raise Exception(f'HTTP {e.code}: {body_text}')
    except urllib.error.URLError as e:
        raise Exception(f'Connection failed: {e.reason}')


# --- Helper: Send response via Hermes/Telegram Bot ---


async def send_bot_message(chat_id: str, message: str) -> dict:
    """Send a message back to the user via Hermes Agent -> Telegram Bot."""
    try:
        result = await fetch_json(
            f'{HERMES_URL}/api/channels/telegram/send',
            method='POST',
            body={
                'recipientId': chat_id,
                'message': message,
            }
        )
        return result
    except Exception as e:
        logger.error(f'Failed to send bot message: {e}')
        return {'success': False, 'error': str(e)}


# --- Helper: Shadowbroker Analysis ---


async def analyze_via_shadowbroker(data: dict, question: str) -> dict:
    """Send group data to Shadowbroker for AI analysis."""
    try:
        context = json.dumps(data, ensure_ascii=False)[:8000]
        result = await fetch_json(
            f'{SHADOWBROKER_URL}/api/query',
            method='POST',
            body={
                'question': f'{question}\n\nContext data:\n{context}',
            },
            timeout=60,
        )
        return result
    except Exception as e:
        logger.warning(f'Shadowbroker query failed: {e}')

    # Fallback: use Hermes Agent directly
    try:
        result = await fetch_json(
            f'{HERMES_URL}/v1/chat/completions',
            method='POST',
            body={
                'messages': [
                    {
                        'role': 'system',
                        'content': (
                            'Eres un analista de inteligencia de Telegram. '
                            'Analiza los datos de grupos proporcionados y responde en espanol '
                            'con insights accionables, tendencias y alertas.'
                        ),
                    },
                    {
                        'role': 'user',
                        'content': f'{question}\n\nDatos:\n{json.dumps(data, ensure_ascii=False)[:6000]}',
                    },
                ],
            },
            timeout=60,
        )
        return {
            'answer': result.get('choices', [{}])[0].get('message', {}).get('content', ''),
            'source': 'hermes-agent',
        }
    except Exception as e2:
        logger.error(f'Hermes Agent fallback failed: {e2}')
        return {'error': str(e2), 'answer': 'No se pudo completar el analisis.'}


# --- Routes ---


@app.get('/health')
async def health():
    """Health check with ecosystem connectivity."""
    ecosystem = {}
    for name, url in [('hermes', HERMES_URL), ('shadowbroker', SHADOWBROKER_URL), ('cognitive', COGNITIVE_URL)]:
        try:
            data = await fetch_json(f'{url}/health', timeout=10)
            ecosystem[name] = {'reachable': True, 'status': data.get('status', 'ok')}
        except Exception as e:
            ecosystem[name] = {'reachable': False, 'error': str(e)[:100]}

    return {
        'status': 'ok',
        'service': 'telethon-service',
        'version': '1.0.0',
        'telethon_connected': telethon_client.connected,
        'ecosystem': ecosystem,
        'uptime': time.time(),
    }


@app.post('/connect')
async def connect(req: ConnectRequest = None):
    """Connect to Telegram using stored session or code."""
    result = await telethon_client.connect()

    # If not authorized and code provided, complete login
    if result.get('status') == 'not_authorized' and req and req.phone and req.code:
        code_result = await telethon_client.send_code(req.phone)
        if code_result.get('status') == 'code_sent':
            submit_result = await telethon_client.submit_code(req.phone, req.code, req.password)
            return submit_result

    return result


@app.post('/disconnect')
async def disconnect():
    """Disconnect from Telegram."""
    return await telethon_client.disconnect()


@app.get('/status')
async def status():
    """Get current connection and user status."""
    if telethon_client.connected:
        return {
            'connected': True,
            'user': telethon_client._get_user_info(),
        }
    return {'connected': False, 'user': None}


# --- Authentication Endpoints ---


@app.post('/auth/send_code')
async def auth_send_code(req: SendCodeRequest = None):
    """Send a verification code to the phone number."""
    phone = req.phone if req and req.phone else PHONE_NUMBER
    result = await telethon_client.send_code(phone)
    return result


@app.post('/auth/submit_code')
async def auth_submit_code(req: SubmitCodeRequest):
    """Submit the verification code to complete login."""
    phone = req.phone or PHONE_NUMBER
    result = await telethon_client.submit_code(phone, req.code, req.password)
    return result


# --- Data Endpoints ---


@app.get('/dialogs')
async def list_dialogs(limit: int = 100):
    """List all dialogs (groups, channels, users)."""
    if not telethon_client.connected:
        result = await telethon_client.connect()
        if result.get('status') not in ('connected', 'already_connected'):
            raise HTTPException(503, f'Telegram not connected: {result.get("message", "")}')

    try:
        dialogs = await telethon_client.get_dialogs(limit=limit)
        return {'dialogs': dialogs, 'total': len(dialogs)}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get('/groups')
async def list_groups(include_channels: bool = True):
    """List groups and optionally channels."""
    if not telethon_client.connected:
        result = await telethon_client.connect()
        if result.get('status') not in ('connected', 'already_connected'):
            raise HTTPException(503, f'Telegram not connected: {result.get("message", "")}')

    try:
        groups = await telethon_client.get_groups(include_channels=include_channels)
        return {'groups': groups, 'total': len(groups)}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get('/groups/{chat_id}/messages')
async def get_group_messages(chat_id: int, limit: int = 50, search: str = None):
    """Get messages from a specific group."""
    if not telethon_client.connected:
        result = await telethon_client.connect()
        if result.get('status') not in ('connected', 'already_connected'):
            raise HTTPException(503, 'Telegram not connected')

    try:
        messages = await telethon_client.get_messages(chat_id, limit=limit, search=search)
        return {'messages': messages, 'total': len(messages), 'chat_id': chat_id}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post('/analyze')
async def analyze_groups(req: AnalyzeRequest = None):
    """Full analysis of all Telegram groups with AI insights."""
    if not telethon_client.connected:
        result = await telethon_client.connect()
        if result.get('status') not in ('connected', 'already_connected'):
            raise HTTPException(503, 'Telegram not connected')

    try:
        # Step 1: Gather group data
        analysis_data = await telethon_client.analyze_groups()

        if req and req.deep:
            # Step 2: AI analysis via Shadowbroker/Hermes
            ai_result = await analyze_via_shadowbroker(
                analysis_data,
                'Analiza los siguientes datos de grupos de Telegram. '
                'Proporciona: 1) Resumen general 2) Grupos mas activos 3) Tendencias 4) Alertas o temas relevantes'
            )
            analysis_data['ai_analysis'] = ai_result

        return analysis_data
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post('/search')
async def search_groups(req: SearchRequest):
    """Search across all groups for a specific query."""
    if not telethon_client.connected:
        result = await telethon_client.connect()
        if result.get('status') not in ('connected', 'already_connected'):
            raise HTTPException(503, 'Telegram not connected')

    try:
        results = await telethon_client.search_all_groups(req.query, req.limit_per_group)
        return results
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post('/send')
async def send_message(req: SendRequest):
    """Send a message as the Telegram user."""
    if not telethon_client.connected:
        result = await telethon_client.connect()
        if result.get('status') not in ('connected', 'already_connected'):
            raise HTTPException(503, 'Telegram not connected')

    try:
        result = await telethon_client.send_message(req.chat_id, req.message)
        return result
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post('/command')
async def process_command(req: CommandRequest):
    """
    Process a bot command that triggers the full ecosystem.

    This is the main entry point where the bot sends a user prompt
    and it gets processed through the full pipeline:
    Telethon -> Data Gathering -> AI Analysis -> Response

    Commands:
      - "analiza grupos" / "analizar grupos" -> Full group analysis
      - "lista grupos" / "listar grupos" -> List all groups
      - "busca [query]" -> Search across groups
      - "mensajes [group_id]" -> Get recent messages
      - Any other text -> AI chat via Hermes Agent
    """
    command = req.command.lower().strip()
    chat_id = req.chat_id

    try:
        # Check if we need to connect first
        if not telethon_client.connected:
            connect_result = await telethon_client.connect()
            if connect_result.get('status') not in ('connected', 'already_connected'):
                return {
                    'success': False,
                    'error': 'Telegram user account not connected',
                    'message': (
                        'No se pudo conectar la cuenta de Telegram. '
                        'Necesitas autenticar primero. '
                        'Usa el endpoint /auth/send_code para iniciar sesion.'
                    ),
                    'connect_status': connect_result,
                }

        # --- Command: Analyze Groups ---
        if any(kw in command for kw in ['analiza grupo', 'analizar grupo', 'analiza los grupo', 'analizar los grupo', 'analiza todos los grupo']):
            logger.info('Command: Analyze groups')

            # Gather data
            analysis_data = await telethon_client.analyze_groups()

            # AI analysis
            ai_result = await analyze_via_shadowbroker(
                analysis_data,
                'Analiza en detalle los siguientes datos de todos mis grupos de Telegram. '
                'Proporciona un resumen ejecutivo con: '
                '1) Cantidad total de grupos y canales '
                '2) Grupos mas activos y con mas participantes '
                '3) Temas recurrentes en los mensajes recientes '
                '4) Alertas o informacion relevante '
                '5) Recomendaciones de accion'
            )

            # Build response
            summary = (
                f"**Analisis de Grupos de Telegram**\n\n"
                f"Total de grupos: {analysis_data['total_groups']}\n"
                f"Canales: {analysis_data['total_channels']}\n"
                f"Supergrupos: {analysis_data['total_supergroups']}\n"
                f"Grupos pequenos: {analysis_data['total_small_groups']}\n"
                f"Mensajes sin leer: {analysis_data['total_unread_messages']} en {analysis_data['groups_with_unread']} grupos\n\n"
            )

            if ai_result.get('answer'):
                summary += f"**Analisis IA:**\n{ai_result['answer']}"
            elif ai_result.get('error'):
                summary += f"Analisis IA no disponible: {ai_result['error']}"

            # Send response via bot if chat_id available
            if chat_id:
                await send_bot_message(str(chat_id), summary)

            return {
                'success': True,
                'command': 'analyze_groups',
                'data': analysis_data,
                'ai_analysis': ai_result,
                'response': summary,
            }

        # --- Command: List Groups ---
        elif any(kw in command for kw in ['lista grupo', 'listar grupo', 'lista los grupo', 'mis grupo', 'show grupo']):
            logger.info('Command: List groups')

            groups = await telethon_client.get_groups()

            response_parts = [f"**Tus Grupos de Telegram** ({len(groups)} total)\n"]
            for i, g in enumerate(groups[:30], 1):
                icon = '📢' if g.get('chat_type') == 'channel' else '👥'
                unread = f" 🔴{g['unread_count']}" if g.get('unread_count', 0) > 0 else ''
                participants = f" ({g.get('participants_count', '?')} participantes)" if g.get('participants_count') else ''
                response_parts.append(f"{i}. {icon} {g['name']}{participants}{unread}")

            response_text = '\n'.join(response_parts)

            if chat_id:
                await send_bot_message(str(chat_id), response_text)

            return {
                'success': True,
                'command': 'list_groups',
                'groups': groups,
                'response': response_text,
            }

        # --- Command: Search ---
        elif any(kw in command for kw in ['busca', 'buscar', 'search']):
            query = req.args or command.replace('busca', '').replace('buscar', '').replace('search', '').strip()
            if not query:
                return {'success': False, 'error': 'Debes especificar que buscar. Ejemplo: busca tecnologia'}

            logger.info(f'Command: Search - {query}')

            search_results = await telethon_client.search_all_groups(query)

            response_parts = [f'**Busqueda: "{query}"**\n']
            response_parts.append(f"Grupos buscados: {search_results['groups_searched']}")
            response_parts.append(f"Resultados: {search_results['total_matches']}\n")

            for group_match in search_results.get('matches_by_group', [])[:10]:
                response_parts.append(f"**{group_match['group_name']}** ({group_match['match_count']} resultados)")
                for msg in group_match.get('messages', [])[:3]:
                    text = msg.get('text', '')[:80]
                    if text:
                        response_parts.append(f"  -> {text}...")

            response_text = '\n'.join(response_parts)

            if chat_id:
                await send_bot_message(str(chat_id), response_text)

            return {
                'success': True,
                'command': 'search',
                'query': query,
                'results': search_results,
                'response': response_text,
            }

        # --- Command: General AI Chat ---
        else:
            logger.info(f'Command: General - {command}')

            # Use Hermes Agent for general chat
            try:
                result = await fetch_json(
                    f'{HERMES_URL}/v1/chat/completions',
                    method='POST',
                    body={
                        'messages': [
                            {
                                'role': 'system',
                                'content': (
                                    'Eres Hermes, un asistente de inteligencia integrado con Telegram. '
                                    'Puedes analizar grupos, buscar mensajes, y proporcionar insights. '
                                    'Responde en espanol de forma concisa y util.'
                                ),
                            },
                            {
                                'role': 'user',
                                'content': req.command,
                            },
                        ],
                    },
                    timeout=30,
                )
                answer = result.get('choices', [{}])[0].get('message', {}).get('content', '')

                if chat_id:
                    await send_bot_message(str(chat_id), answer)

                return {
                    'success': True,
                    'command': 'chat',
                    'response': answer,
                }
            except Exception as e:
                return {
                    'success': False,
                    'command': 'chat',
                    'error': str(e),
                }

    except Exception as e:
        logger.error(f'Command processing error: {e}')
        return {
            'success': False,
            'error': str(e),
            'message': f'Error procesando el comando: {str(e)}',
        }


# --- Startup/Shutdown ---


@app.on_event('startup')
async def startup():
    """Auto-connect on startup using stored session."""
    logger.info('Telethon Service starting...')
    result = await telethon_client.connect()
    logger.info(f'Telegram connection: {result.get("status", "unknown")}')


@app.on_event('shutdown')
async def shutdown():
    """Disconnect on shutdown."""
    logger.info('Telethon Service shutting down...')
    await telethon_client.disconnect()


# --- Main ---

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(
        'server:app',
        host=SERVICE_HOST,
        port=SERVICE_PORT,
        reload=False,
        log_level='info',
    )
