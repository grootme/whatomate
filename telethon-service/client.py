"""
Telethon Client Wrapper
Handles Telegram User API connection.
Supports both StringSession (pre-authenticated) and file-based session.
Provides methods for group/channel listing, message reading, and analysis.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.types import (
    Channel, Chat, User,
    PeerChannel, PeerChat, PeerUser,
)

from config import API_ID, API_HASH, SESSION_STRING, PHONE_NUMBER

logger = logging.getLogger('telethon-service')

# Session storage directory
SESSION_DIR = Path.home() / '.telethon-service'
SESSION_DIR.mkdir(parents=True, exist_ok=True)
SESSION_FILE = SESSION_DIR / 'whatomate_session'


class TelethonClient:
    """Singleton Telethon client with session management."""

    _instance: Optional['TelethonClient'] = None
    _client: Optional[TelegramClient] = None
    _connected: bool = False
    _me: Optional[User] = None
    _pending_code_hash: Optional[str] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @property
    def client(self) -> Optional[TelegramClient]:
        return self._client

    @property
    def connected(self) -> bool:
        return self._connected and self._client is not None and self._client.is_connected()

    @property
    def me(self) -> Optional[User]:
        return self._me

    async def connect(self) -> dict:
        """Connect to Telegram. Try file session first, then StringSession."""
        if self.connected:
            return {'status': 'already_connected', 'user': self._get_user_info()}

        # Try file-based session first
        try:
            self._client = TelegramClient(str(SESSION_FILE), API_ID, API_HASH)
            await self._client.connect()

            if await self._client.is_user_authorized():
                self._me = await self._client.get_me()
                self._connected = True
                logger.info(f'Connected via file session as {self._me.first_name} (@{self._me.username})')
                return {
                    'status': 'connected',
                    'method': 'file_session',
                    'user': self._get_user_info(),
                }
            else:
                # File session exists but not authorized
                await self._client.disconnect()
        except Exception as e:
            logger.warning(f'File session failed: {e}')

        # Try StringSession
        try:
            session = StringSession(SESSION_STRING)
            self._client = TelegramClient(session, API_ID, API_HASH)
            await self._client.connect()

            if await self._client.is_user_authorized():
                self._me = await self._client.get_me()
                self._connected = True
                logger.info(f'Connected via StringSession as {self._me.first_name} (@{self._me.username})')
                return {
                    'status': 'connected',
                    'method': 'string_session',
                    'user': self._get_user_info(),
                }
            else:
                await self._client.disconnect()
        except Exception as e:
            logger.warning(f'StringSession failed: {e}')

        # Neither worked - need fresh login
        self._connected = False
        self._client = None
        return {
            'status': 'not_authorized',
            'message': 'No valid session found. Use /auth/send_code to start login.',
            'phone': PHONE_NUMBER,
        }

    async def send_code(self, phone: str = None) -> dict:
        """Send a verification code to the phone number."""
        phone = phone or PHONE_NUMBER

        if not self._client:
            self._client = TelegramClient(str(SESSION_FILE), API_ID, API_HASH)
            await self._client.connect()

        try:
            result = await self._client.send_code_request(phone)
            self._pending_code_hash = result.phone_code_hash
            return {
                'status': 'code_sent',
                'phone': phone,
                'phone_code_hash': result.phone_code_hash,
            }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    async def submit_code(self, phone: str, code: str, password: str = None) -> dict:
        """Submit the verification code to complete login."""
        if not self._client:
            return {'status': 'error', 'message': 'Client not initialized. Call send_code first.'}

        try:
            await self._client.sign_in(phone, code)

            self._me = await self._client.get_me()
            self._connected = True

            # Save session string for future use
            session_string = self._client.session.save()

            return {
                'status': 'connected',
                'method': 'code_login',
                'user': self._get_user_info(),
                'session_string': session_string,
                'message': 'Login successful! Save the session_string in config.py.',
            }
        except Exception as e:
            error_str = str(e)
            if 'password' in error_str.lower() or '2fa' in error_str.lower() or 'SRP' in error_str:
                if password:
                    try:
                        await self._client.sign_in(password=password)
                        self._me = await self._client.get_me()
                        self._connected = True
                        session_string = self._client.session.save()
                        return {
                            'status': 'connected',
                            'method': 'code_2fa_login',
                            'user': self._get_user_info(),
                            'session_string': session_string,
                        }
                    except Exception as e2:
                        return {'status': 'error', 'message': f'2FA failed: {e2}'}
                else:
                    return {
                        'status': '2fa_required',
                        'message': 'Two-factor authentication is enabled. Provide the password.',
                    }
            return {'status': 'error', 'message': error_str}

    async def disconnect(self) -> dict:
        """Disconnect from Telegram."""
        if self._client:
            await self._client.disconnect()
        self._connected = False
        self._me = None
        return {'status': 'disconnected'}

    async def get_dialogs(self, limit: int = 100) -> list:
        """List all dialogs (groups, channels, users)."""
        if not self.connected:
            raise RuntimeError('Not connected. Call connect() first.')

        dialogs = []
        async for dialog in self._client.iter_dialogs(limit=limit):
            entity = dialog.entity
            dialog_info = {
                'id': dialog.id,
                'name': dialog.name or 'Unknown',
                'is_user': dialog.is_user,
                'is_group': dialog.is_group,
                'is_channel': dialog.is_channel,
                'unread_count': dialog.unread_count,
                'date': dialog.date.isoformat() if dialog.date else None,
            }

            # Add group-specific info
            if isinstance(entity, Chat):
                dialog_info['participants_count'] = entity.participants_count
                dialog_info['chat_type'] = 'group'
            elif isinstance(entity, Channel):
                dialog_info['participants_count'] = getattr(entity, 'participants_count', None)
                dialog_info['chat_type'] = 'supergroup' if entity.megagroup else 'channel'
                dialog_info['username'] = entity.username
            elif isinstance(entity, User):
                dialog_info['username'] = entity.username
                dialog_info['chat_type'] = 'private'

            dialogs.append(dialog_info)

        return dialogs

    async def get_groups(self, include_channels: bool = True) -> list:
        """Get only groups and optionally channels."""
        dialogs = await self.get_dialogs(limit=200)
        groups = [d for d in dialogs if d['is_group'] or (include_channels and d['is_channel'])]
        return groups

    async def get_messages(self, chat_id: int, limit: int = 50, search: str = None) -> list:
        """Get messages from a specific chat/group."""
        if not self.connected:
            raise RuntimeError('Not connected')

        messages = []
        kwargs = {'limit': limit}
        if search:
            kwargs['search'] = search

        async for msg in self._client.iter_messages(chat_id, **kwargs):
            msg_info = {
                'id': msg.id,
                'date': msg.date.isoformat() if msg.date else None,
                'text': msg.text or '',
                'sender_id': msg.sender_id,
                'reply_to': msg.reply_to_msg_id if msg.reply_to else None,
                'forwarded': msg.forward is not None,
                'has_media': msg.media is not None,
                'views': getattr(msg, 'views', None),
            }

            # Get sender name if available
            if msg.sender:
                sender = msg.sender
                if isinstance(sender, User):
                    msg_info['sender_name'] = f"{sender.first_name or ''} {sender.last_name or ''}".strip()
                    msg_info['sender_username'] = sender.username

            messages.append(msg_info)

        return messages

    async def analyze_groups(self) -> dict:
        """
        Analyze all groups: collect metadata, recent activity, and key statistics.
        Returns structured data ready for AI analysis via DeerFlow/Shadowbroker.
        """
        if not self.connected:
            raise RuntimeError('Not connected')

        groups = await self.get_groups(include_channels=True)

        analysis = {
            'total_groups': len(groups),
            'total_channels': sum(1 for g in groups if g.get('chat_type') == 'channel'),
            'total_supergroups': sum(1 for g in groups if g.get('chat_type') == 'supergroup'),
            'total_small_groups': sum(1 for g in groups if g.get('chat_type') == 'group'),
            'groups_with_unread': sum(1 for g in groups if g.get('unread_count', 0) > 0),
            'total_unread_messages': sum(g.get('unread_count', 0) for g in groups),
            'groups': [],
        }

        # Gather recent messages from top groups (by participant count)
        sorted_groups = sorted(
            groups,
            key=lambda g: g.get('participants_count') or 0,
            reverse=True
        )

        for group in sorted_groups[:20]:  # Top 20 groups
            group_analysis = {
                'id': group['id'],
                'name': group['name'],
                'type': group.get('chat_type', 'unknown'),
                'participants': group.get('participants_count', 0),
                'unread': group.get('unread_count', 0),
                'username': group.get('username'),
            }

            try:
                # Get recent messages (last 10)
                messages = await self.get_messages(group['id'], limit=10)
                group_analysis['recent_messages'] = messages
                group_analysis['recent_message_count'] = len(messages)

                # Compute simple stats
                if messages:
                    active_senders = set(m.get('sender_id') for m in messages if m.get('sender_id'))
                    group_analysis['active_senders'] = len(active_senders)
                    group_analysis['has_media_count'] = sum(1 for m in messages if m.get('has_media'))
                    group_analysis['forwarded_count'] = sum(1 for m in messages if m.get('forwarded'))

            except Exception as e:
                logger.warning(f'Could not get messages from {group["name"]}: {e}')
                group_analysis['error'] = str(e)

            analysis['groups'].append(group_analysis)

        return analysis

    async def search_all_groups(self, query: str, limit_per_group: int = 5) -> dict:
        """Search for messages across all groups matching a query."""
        if not self.connected:
            raise RuntimeError('Not connected')

        groups = await self.get_groups(include_channels=True)
        results = {
            'query': query,
            'groups_searched': 0,
            'total_matches': 0,
            'matches_by_group': [],
        }

        for group in groups[:30]:  # Limit to 30 groups for performance
            try:
                messages = await self.get_messages(
                    group['id'],
                    limit=limit_per_group,
                    search=query
                )
                if messages:
                    results['matches_by_group'].append({
                        'group_id': group['id'],
                        'group_name': group['name'],
                        'match_count': len(messages),
                        'messages': messages,
                    })
                    results['total_matches'] += len(messages)
                results['groups_searched'] += 1
            except Exception as e:
                logger.warning(f'Search failed in {group["name"]}: {e}')

        return results

    async def send_message(self, chat_id: int, message: str) -> dict:
        """Send a message as the user to a specific chat."""
        if not self.connected:
            raise RuntimeError('Not connected')

        try:
            result = await self._client.send_message(chat_id, message)
            return {
                'success': True,
                'message_id': result.id,
                'date': result.date.isoformat() if result.date else None,
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    async def send_file(self, chat_id: int, file_path: str, caption: str = None) -> dict:
        """Send a file as the user to a specific chat."""
        if not self.connected:
            raise RuntimeError('Not connected')

        try:
            result = await self._client.send_file(
                chat_id,
                file_path,
                caption=caption or '',
                parse_mode='html'
            )
            return {
                'success': True,
                'message_id': result.id,
                'date': result.date.isoformat() if result.date else None,
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _get_user_info(self) -> dict:
        """Get info about the authenticated user."""
        if not self._me:
            return {}
        return {
            'id': self._me.id,
            'first_name': self._me.first_name,
            'last_name': self._me.last_name,
            'username': self._me.username,
            'phone': self._me.phone,
        }


# Global instance
telethon_client = TelethonClient()
