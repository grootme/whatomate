#!/usr/bin/env python3
"""Complete Telethon login with a verification code."""
import asyncio
import sys
from telethon import TelegramClient
from telethon.sessions import StringSession
from pathlib import Path

API_ID = 15306948
API_HASH = '612eadaa5e825d09c269a1415904a157'
PHONE = '+5350819559'
SESSION_DIR = Path.home() / '.telethon-service'
SESSION_DIR.mkdir(parents=True, exist_ok=True)
SESSION_FILE = str(SESSION_DIR / 'whatomate_session')

async def login(code: str, password: str = None):
    client = TelegramClient(SESSION_FILE, API_ID, API_HASH)
    await client.connect()
    
    try:
        await client.sign_in(PHONE, code)
    except Exception as e:
        error = str(e)
        if 'password' in error.lower() or '2fa' in error.lower() or 'SRP' in error.lower():
            if password:
                await client.sign_in(password=password)
            else:
                print('2FA_REQUIRED')
                await client.disconnect()
                return
        else:
            raise
    
    me = await client.get_me()
    session_string = client.session.save()
    
    print(f'LOGIN_SUCCESS')
    print(f'User: {me.first_name} @{me.username} (ID: {me.id})')
    print(f'Phone: {me.phone}')
    print(f'SESSION_STRING={session_string}')
    
    # Also save to file
    with open(SESSION_DIR / 'session_string.txt', 'w') as f:
        f.write(session_string)
    
    # Test: list some groups
    print(f'\nGROUPS_PREVIEW:')
    count = 0
    async for dialog in client.iter_dialogs(limit=20):
        if dialog.is_group or dialog.is_channel:
            count += 1
            entity = dialog.entity
            pcount = getattr(entity, 'participants_count', '?')
            print(f'  {count}. {dialog.name} (ID:{dialog.id}, Participants:{pcount})')
    print(f'Total groups/channels found: {count}')
    
    await client.disconnect()

if __name__ == '__main__':
    code = sys.argv[1] if len(sys.argv) > 1 else None
    password = sys.argv[2] if len(sys.argv) > 2 else None
    if not code:
        print('Usage: python3 complete-login.py <code> [password]')
        sys.exit(1)
    asyncio.run(login(code, password))
