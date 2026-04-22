# Whatomate MCP Server

Model Context Protocol (MCP) server for [Whatomate](https://github.com/grootme/whatomate) — the open-source WhatsApp Business Platform.

## Overview

This MCP server enables AI assistants (like Claude, GPT, etc.) to interact with the Whatomate API, providing tools for:

- **Messaging**: Send text, media, template, and interactive messages
- **Contacts**: Create, update, search, and manage WhatsApp contacts
- **Templates**: Manage WhatsApp message templates
- **Campaigns**: Create and manage bulk messaging campaigns
- **Chatbot**: Configure keyword rules, AI contexts, and conversation flows
- **Analytics**: View dashboard stats, message analytics, and agent performance
- **Accounts**: Manage WhatsApp Business accounts (Meta Cloud API & whatsmeow)
- **Webhooks**: Create and manage webhook integrations
- **Organizations**: Multi-tenant organization and user management

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the following environment variables:

| Variable | Description | Required |
|---|---|---|
| `WHATOMATE_BASE_URL` | Whatomate API URL | Yes (default: `http://localhost:8080`) |
| `WHATOMATE_API_KEY` | API key for authentication | Either this or email/password |
| `WHATOMATE_EMAIL` | Email for session auth | If not using API key |
| `WHATOMATE_PASSWORD` | Password for session auth | If not using API key |

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "whatomate": {
      "command": "node",
      "args": ["/path/to/whatomate-mcp/dist/index.js"],
      "env": {
        "WHATOMATE_BASE_URL": "http://localhost:8080",
        "WHATOMATE_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Available Tools

### Authentication
- `auth_login` — Authenticate with email/password
- `auth_me` — Get current user info

### Messaging
- `send_text_message` — Send a text message
- `send_template_message` — Send a template message
- `send_media_message` — Send media (image/video/audio/document)
- `get_messages` — Get messages for a contact
- `mark_message_read` — Mark a message as read
- `send_reaction` — React to a message

### Contacts
- `list_contacts` — List/search contacts
- `get_contact` — Get contact details
- `create_contact` — Create a new contact
- `update_contact` — Update a contact
- `delete_contact` — Delete a contact
- `assign_contact` — Assign contact to agent

### Templates
- `list_templates` — List templates
- `get_template` — Get template details
- `create_template` — Create a template
- `sync_templates` — Sync from Meta API

### Campaigns
- `list_campaigns` — List campaigns
- `get_campaign` — Get campaign details
- `create_campaign` — Create a campaign
- `start_campaign` — Start sending
- `pause_campaign` — Pause a campaign
- `cancel_campaign` — Cancel a campaign
- `retry_failed_campaign` — Retry failed messages
- `import_campaign_recipients` — Import recipients

### Chatbot
- `get_chatbot_settings` — Get chatbot config
- `update_chatbot_settings` — Update chatbot config
- `list_keyword_rules` — List keyword rules
- `create_keyword_rule` — Create keyword rule
- `list_ai_contexts` — List AI contexts
- `create_ai_context` — Create AI context
- `list_chatbot_flows` — List conversation flows
- `create_chatbot_flow` — Create conversation flow
- `list_agent_transfers` — List pending transfers
- `pick_next_transfer` — Pick next transfer

### Accounts
- `list_accounts` — List WhatsApp accounts
- `get_account` — Get account details
- `create_account` — Create account
- `start_whatsapp_session` — Start session (QR code)
- `get_business_profile` — Get business profile

### Analytics
- `get_dashboard_stats` — Dashboard statistics
- `get_message_analytics` — Message analytics
- `get_chatbot_analytics` — Chatbot analytics
- `get_agent_analytics` — Agent performance

### Webhooks
- `list_webhooks` — List webhooks
- `create_webhook` — Create webhook
- `test_webhook` — Test webhook delivery

### Other
- `list_canned_responses` — List quick replies
- `create_canned_response` — Create quick reply
- `list_tags` — List tags
- `create_tag` — Create tag
- `list_custom_actions` — List custom actions
- `execute_custom_action` — Execute custom action
- `list_flows` — List WhatsApp flows
- `create_flow` — Create flow
- `list_conversation_notes` — List notes
- `create_conversation_note` — Create note
- `health_check` — API health check
- `ready_check` — API readiness check

## License

MIT
