#!/usr/bin/env node
/**
 * Whatomate MCP Server
 *
 * Model Context Protocol server that provides AI assistants with access to the
 * Whatomate WhatsApp Business Platform API. This enables AI models to:
 * - Authenticate and manage sessions
 * - Send and receive WhatsApp messages
 * - Manage contacts, templates, campaigns
 * - Configure chatbots and AI contexts
 * - Monitor analytics and dashboards
 * - Manage WhatsApp accounts and business profiles
 *
 * Configuration:
 *   Set WHATOMATE_BASE_URL environment variable to your Whatomate API URL
 *   Set WHATOMATE_API_KEY environment variable to your API key (or use email/password)
 *   Set WHATOMATE_EMAIL and WHATOMATE_PASSWORD for session-based auth
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { z } from "zod";
// ============================================================================
// Configuration
// ============================================================================
const WHATOMATE_BASE_URL = process.env.WHATOMATE_BASE_URL || "http://localhost:8080";
const WHATOMATE_API_KEY = process.env.WHATOMATE_API_KEY || "";
const WHATOMATE_EMAIL = process.env.WHATOMATE_EMAIL || "";
const WHATOMATE_PASSWORD = process.env.WHATOMATE_PASSWORD || "";
// ============================================================================
// API Client
// ============================================================================
class WhatomateClient {
    client;
    accessToken = "";
    refreshToken = "";
    constructor(baseUrl) {
        this.client = axios.create({
            baseURL: baseUrl,
            timeout: 30000,
            headers: {
                "Content-Type": "application/json",
            },
        });
        // If API key is provided, use it
        if (WHATOMATE_API_KEY) {
            this.client.defaults.headers.common["X-API-Key"] = WHATOMATE_API_KEY;
        }
    }
    async authenticate() {
        if (WHATOMATE_API_KEY)
            return; // API key auth, no login needed
        if (!WHATOMATE_EMAIL || !WHATOMATE_PASSWORD) {
            throw new Error("Either WHATOMATE_API_KEY or WHATOMATE_EMAIL/WHATOMATE_PASSWORD must be provided");
        }
        const response = await this.client.post("/api/auth/login", {
            email: WHATOMATE_EMAIL,
            password: WHATOMATE_PASSWORD,
        });
        this.accessToken = response.data.data.access_token;
        this.refreshToken = response.data.data.refresh_token;
        this.client.defaults.headers.common["Authorization"] = `Bearer ${this.accessToken}`;
    }
    async request(method, path, data, params) {
        try {
            const response = await this.client.request({
                method,
                url: path,
                data,
                params,
            });
            return response.data;
        }
        catch (error) {
            if (error.response?.status === 401 && this.refreshToken) {
                // Try to refresh token
                try {
                    const refreshResponse = await this.client.post("/api/auth/refresh", {
                        refresh_token: this.refreshToken,
                    });
                    this.accessToken = refreshResponse.data.data.access_token;
                    this.refreshToken = refreshResponse.data.data.refresh_token;
                    this.client.defaults.headers.common["Authorization"] = `Bearer ${this.accessToken}`;
                    // Retry the request
                    const retryResponse = await this.client.request({
                        method,
                        url: path,
                        data,
                        params,
                    });
                    return retryResponse.data;
                }
                catch {
                    // Re-authenticate from scratch
                    await this.authenticate();
                    const retryResponse = await this.client.request({
                        method,
                        url: path,
                        data,
                        params,
                    });
                    return retryResponse.data;
                }
            }
            throw error;
        }
    }
    get(path, params) { return this.request("GET", path, undefined, params); }
    post(path, data) { return this.request("POST", path, data); }
    put(path, data) { return this.request("PUT", path, data); }
    delete(path) { return this.request("DELETE", path); }
}
const api = new WhatomateClient(WHATOMATE_BASE_URL);
// ============================================================================
// MCP Server
// ============================================================================
const server = new McpServer({
    name: "whatomate",
    version: "1.0.0",
    description: "Whatomate WhatsApp Business Platform MCP Server - Manage WhatsApp messaging, contacts, templates, campaigns, chatbots and analytics",
});
// ============================================================================
// Auth Tools
// ============================================================================
server.tool("auth_login", "Authenticate with Whatomate and get access tokens", {
    email: z.string().email().describe("User email address"),
    password: z.string().describe("User password"),
}, async ({ email, password }) => {
    const result = await api.post("/api/auth/login", { email, password });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("auth_me", "Get current authenticated user information", {}, async () => {
    const result = await api.get("/api/me");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// ============================================================================
// Messaging Tools
// ============================================================================
server.tool("send_text_message", "Send a text message to a WhatsApp contact", {
    contact_id: z.string().uuid().describe("Contact UUID to send message to"),
    content: z.string().describe("Text message content"),
    account_name: z.string().optional().describe("WhatsApp account name to use (optional)"),
}, async ({ contact_id, content, account_name }) => {
    const payload = { content, message_type: "text" };
    if (account_name)
        payload.account_name = account_name;
    const result = await api.post(`/api/contacts/${contact_id}/messages`, payload);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("send_template_message", "Send a template message to a WhatsApp contact or phone number", {
    contact_id: z.string().optional().describe("Contact UUID (alternative to phone_number)"),
    phone_number: z.string().optional().describe("Phone number (alternative to contact_id)"),
    template_name: z.string().describe("Template name to use"),
    template_params: z.record(z.string()).optional().describe("Template parameters as key-value pairs"),
    account_name: z.string().optional().describe("WhatsApp account name to use"),
}, async (params) => {
    const result = await api.post("/api/messages/template", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("send_media_message", "Send a media message (image, video, audio, document) to a contact", {
    contact_id: z.string().uuid().describe("Contact UUID"),
    media_url: z.string().describe("URL or local path of the media file"),
    media_type: z.enum(["image", "video", "audio", "document"]).describe("Type of media"),
    caption: z.string().optional().describe("Caption for the media"),
    filename: z.string().optional().describe("Filename for documents"),
    account_name: z.string().optional().describe("WhatsApp account name"),
}, async (params) => {
    const result = await api.post(`/api/contacts/${params.contact_id}/messages`, {
        ...params,
        message_type: params.media_type,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("get_messages", "Get messages for a contact with pagination", {
    contact_id: z.string().uuid().describe("Contact UUID"),
    page: z.number().optional().describe("Page number (default: 1)"),
    per_page: z.number().optional().describe("Items per page (default: 50)"),
}, async ({ contact_id, page, per_page }) => {
    const result = await api.get(`/api/contacts/${contact_id}/messages`, { page, per_page });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("mark_message_read", "Mark a message as read", {
    message_id: z.string().uuid().describe("Message UUID to mark as read"),
}, async ({ message_id }) => {
    const result = await api.put(`/api/messages/${message_id}/read`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("send_reaction", "Send a reaction to a message", {
    contact_id: z.string().uuid().describe("Contact UUID"),
    message_id: z.string().uuid().describe("Message UUID to react to"),
    emoji: z.string().describe("Emoji reaction"),
}, async ({ contact_id, message_id, emoji }) => {
    const result = await api.post(`/api/contacts/${contact_id}/messages/${message_id}/reaction`, { emoji });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// ============================================================================
// Contact Tools
// ============================================================================
server.tool("list_contacts", "List contacts with optional filtering and pagination", {
    page: z.number().optional().describe("Page number"),
    per_page: z.number().optional().describe("Items per page"),
    search: z.string().optional().describe("Search term for name or phone"),
    tag: z.string().optional().describe("Filter by tag"),
    assigned_user_id: z.string().optional().describe("Filter by assigned user"),
}, async (params) => {
    const result = await api.get("/api/contacts", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("get_contact", "Get a specific contact by ID", {
    contact_id: z.string().uuid().describe("Contact UUID"),
}, async ({ contact_id }) => {
    const result = await api.get(`/api/contacts/${contact_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("create_contact", "Create a new contact", {
    phone_number: z.string().describe("WhatsApp phone number with country code"),
    profile_name: z.string().optional().describe("Contact display name"),
    whatsapp_account: z.string().optional().describe("WhatsApp account name to associate"),
    tags: z.array(z.string()).optional().describe("Tags to assign"),
    metadata: z.record(z.any()).optional().describe("Custom metadata key-value pairs"),
}, async (params) => {
    const result = await api.post("/api/contacts", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("update_contact", "Update an existing contact", {
    contact_id: z.string().uuid().describe("Contact UUID"),
    profile_name: z.string().optional().describe("Updated display name"),
    tags: z.array(z.string()).optional().describe("Updated tags"),
    metadata: z.record(z.any()).optional().describe("Updated metadata"),
    assigned_user_id: z.string().optional().describe("User UUID to assign contact to"),
}, async ({ contact_id, ...params }) => {
    const result = await api.put(`/api/contacts/${contact_id}`, params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("delete_contact", "Delete a contact", {
    contact_id: z.string().uuid().describe("Contact UUID to delete"),
}, async ({ contact_id }) => {
    const result = await api.delete(`/api/contacts/${contact_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("assign_contact", "Assign a contact to a user", {
    contact_id: z.string().uuid().describe("Contact UUID"),
    user_id: z.string().uuid().describe("User UUID to assign to"),
}, async ({ contact_id, user_id }) => {
    const result = await api.put(`/api/contacts/${contact_id}/assign`, { user_id });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("export_data", "Export data from a table", {
    table: z.string().describe("Table to export (contacts, messages, etc.)"),
    format: z.enum(["csv", "json"]).optional().describe("Export format"),
}, async ({ table, format }) => {
    const result = await api.post("/api/export", { table, format });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// ============================================================================
// Template Tools
// ============================================================================
server.tool("list_templates", "List WhatsApp message templates", {
    page: z.number().optional().describe("Page number"),
    per_page: z.number().optional().describe("Items per page"),
    account_name: z.string().optional().describe("Filter by WhatsApp account"),
}, async (params) => {
    const result = await api.get("/api/templates", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("get_template", "Get a specific template by ID", {
    template_id: z.string().uuid().describe("Template UUID"),
}, async ({ template_id }) => {
    const result = await api.get(`/api/templates/${template_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("create_template", "Create a new WhatsApp message template", {
    name: z.string().describe("Template name (alphanumeric and underscores only)"),
    language: z.string().describe("Language code (e.g., en, es)"),
    category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]).describe("Template category"),
    body_content: z.string().describe("Template body with {{1}} placeholders"),
    header_type: z.enum(["TEXT", "IMAGE", "DOCUMENT", "VIDEO"]).optional().describe("Header type"),
    header_content: z.string().optional().describe("Header content text"),
    footer_content: z.string().optional().describe("Footer content"),
    account_name: z.string().optional().describe("WhatsApp account name"),
}, async (params) => {
    const result = await api.post("/api/templates", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("sync_templates", "Sync templates from Meta WhatsApp Business API", {}, async () => {
    const result = await api.post("/api/templates/sync");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// ============================================================================
// Campaign Tools
// ============================================================================
server.tool("list_campaigns", "List bulk campaigns", {
    page: z.number().optional().describe("Page number"),
    per_page: z.number().optional().describe("Items per page"),
}, async (params) => {
    const result = await api.get("/api/campaigns", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("get_campaign", "Get campaign details by ID", {
    campaign_id: z.string().uuid().describe("Campaign UUID"),
}, async ({ campaign_id }) => {
    const result = await api.get(`/api/campaigns/${campaign_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("create_campaign", "Create a new bulk messaging campaign", {
    name: z.string().describe("Campaign name"),
    template_name: z.string().describe("Template name to use"),
    template_params: z.record(z.string()).optional().describe("Template parameters"),
    account_name: z.string().optional().describe("WhatsApp account name"),
}, async (params) => {
    const result = await api.post("/api/campaigns", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("start_campaign", "Start a campaign (begin sending messages)", {
    campaign_id: z.string().uuid().describe("Campaign UUID"),
}, async ({ campaign_id }) => {
    const result = await api.post(`/api/campaigns/${campaign_id}/start`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("pause_campaign", "Pause an active campaign", {
    campaign_id: z.string().uuid().describe("Campaign UUID"),
}, async ({ campaign_id }) => {
    const result = await api.post(`/api/campaigns/${campaign_id}/pause`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("cancel_campaign", "Cancel a campaign", {
    campaign_id: z.string().uuid().describe("Campaign UUID"),
}, async ({ campaign_id }) => {
    const result = await api.post(`/api/campaigns/${campaign_id}/cancel`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("retry_failed_campaign", "Retry failed messages in a campaign", {
    campaign_id: z.string().uuid().describe("Campaign UUID"),
}, async ({ campaign_id }) => {
    const result = await api.post(`/api/campaigns/${campaign_id}/retry-failed`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("import_campaign_recipients", "Import recipients to a campaign", {
    campaign_id: z.string().uuid().describe("Campaign UUID"),
    recipients: z.array(z.object({
        phone_number: z.string(),
        name: z.string().optional(),
        params: z.record(z.string()).optional(),
    })).describe("Array of recipients"),
}, async ({ campaign_id, recipients }) => {
    const result = await api.post(`/api/campaigns/${campaign_id}/recipients/import`, { recipients });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// ============================================================================
// Chatbot Tools
// ============================================================================
server.tool("get_chatbot_settings", "Get chatbot configuration settings", {}, async () => {
    const result = await api.get("/api/chatbot/settings");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("update_chatbot_settings", "Update chatbot configuration", {
    enabled: z.boolean().optional().describe("Enable/disable chatbot"),
    default_response: z.string().optional().describe("Default response when no rule matches"),
    transfer_to_agent_on_failure: z.boolean().optional().describe("Transfer to human agent on failure"),
    sla_timeout_minutes: z.number().optional().describe("SLA timeout in minutes for agent response"),
    sla_reminder_message: z.string().optional().describe("Message sent on SLA timeout"),
}, async (params) => {
    const result = await api.put("/api/chatbot/settings", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("list_keyword_rules", "List chatbot keyword rules", {}, async () => {
    const result = await api.get("/api/chatbot/keywords");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("create_keyword_rule", "Create a keyword-based auto-reply rule", {
    keyword: z.string().describe("Keyword or phrase to match"),
    response: z.string().describe("Auto-reply message"),
    is_regex: z.boolean().optional().describe("Treat keyword as regex pattern"),
    is_case_sensitive: z.boolean().optional().describe("Case-sensitive matching"),
    match_type: z.enum(["contains", "exact", "starts_with", "ends_with"]).optional().describe("Match type"),
}, async (params) => {
    const result = await api.post("/api/chatbot/keywords", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("list_ai_contexts", "List AI context configurations for chatbot", {}, async () => {
    const result = await api.get("/api/chatbot/ai-contexts");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("create_ai_context", "Create an AI context for the chatbot", {
    name: z.string().describe("Context name"),
    provider: z.enum(["openai", "anthropic", "google"]).describe("AI provider"),
    model: z.string().optional().describe("Model name (e.g., gpt-4, claude-3)"),
    system_prompt: z.string().describe("System prompt for the AI"),
    temperature: z.number().min(0).max(2).optional().describe("Temperature for responses"),
    max_tokens: z.number().optional().describe("Maximum tokens in response"),
}, async (params) => {
    const result = await api.post("/api/chatbot/ai-contexts", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("list_chatbot_flows", "List chatbot conversation flows", {}, async () => {
    const result = await api.get("/api/chatbot/flows");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("create_chatbot_flow", "Create a conversation flow for the chatbot", {
    name: z.string().describe("Flow name"),
    description: z.string().optional().describe("Flow description"),
    trigger_type: z.enum(["keyword", "intent", "all"]).describe("How the flow is triggered"),
    trigger_value: z.string().optional().describe("Keyword or intent value"),
    nodes: z.array(z.any()).describe("Flow nodes (steps)"),
    edges: z.array(z.any()).optional().describe("Flow edges (connections between nodes)"),
}, async (params) => {
    const result = await api.post("/api/chatbot/flows", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("list_agent_transfers", "List pending agent transfer requests", {}, async () => {
    const result = await api.get("/api/chatbot/transfers");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("pick_next_transfer", "Pick the next pending transfer for the current agent", {}, async () => {
    const result = await api.post("/api/chatbot/transfers/pick");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// ============================================================================
// Account Tools
// ============================================================================
server.tool("list_accounts", "List WhatsApp accounts", {}, async () => {
    const result = await api.get("/api/accounts");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("get_account", "Get WhatsApp account details", {
    account_id: z.string().uuid().describe("Account UUID"),
}, async ({ account_id }) => {
    const result = await api.get(`/api/accounts/${account_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("create_account", "Create a new WhatsApp Business account", {
    name: z.string().describe("Account name (unique identifier)"),
    client_type: z.enum(["meta", "whatsmeow"]).describe("Client type: Meta Cloud API or whatsmeow"),
    phone_id: z.string().describe("Phone Number ID (Meta) or JID (whatsmeow)"),
    access_token: z.string().optional().describe("Access token (Meta)"),
    app_id: z.string().optional().describe("App ID (Meta)"),
    app_secret: z.string().optional().describe("App Secret (Meta)"),
    business_id: z.string().optional().describe("Business ID (Meta)"),
}, async (params) => {
    const result = await api.post("/api/accounts", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("start_whatsapp_session", "Start a WhatsApp session (for whatsmeow, returns QR code)", {
    account_id: z.string().uuid().describe("Account UUID"),
}, async ({ account_id }) => {
    const result = await api.post(`/api/accounts/${account_id}/start-session`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("get_business_profile", "Get business profile for a WhatsApp account", {
    account_id: z.string().uuid().describe("Account UUID"),
}, async ({ account_id }) => {
    const result = await api.get(`/api/accounts/${account_id}/business_profile`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// ============================================================================
// Analytics Tools
// ============================================================================
server.tool("get_dashboard_stats", "Get dashboard analytics statistics", {
    period: z.enum(["today", "7d", "30d", "90d"]).optional().describe("Time period"),
}, async ({ period }) => {
    const result = await api.get("/api/analytics/dashboard", { period });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("get_message_analytics", "Get message analytics data", {
    start_date: z.string().optional().describe("Start date (ISO 8601)"),
    end_date: z.string().optional().describe("End date (ISO 8601)"),
    direction: z.enum(["incoming", "outgoing"]).optional().describe("Filter by direction"),
}, async (params) => {
    const result = await api.get("/api/analytics/messages", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("get_chatbot_analytics", "Get chatbot performance analytics", {
    start_date: z.string().optional().describe("Start date (ISO 8601)"),
    end_date: z.string().optional().describe("End date (ISO 8601)"),
}, async (params) => {
    const result = await api.get("/api/analytics/chatbot", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("get_agent_analytics", "Get agent performance analytics", {
    start_date: z.string().optional().describe("Start date (ISO 8601)"),
    end_date: z.string().optional().describe("End date (ISO 8601)"),
}, async (params) => {
    const result = await api.get("/api/analytics/agents", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// ============================================================================
// Organization & User Tools
// ============================================================================
server.tool("list_organizations", "List organizations the user belongs to", {}, async () => {
    const result = await api.get("/api/organizations");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("list_users", "List users in the current organization", {
    page: z.number().optional().describe("Page number"),
    per_page: z.number().optional().describe("Items per page"),
}, async (params) => {
    const result = await api.get("/api/users", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("list_teams", "List teams in the organization", {}, async () => {
    const result = await api.get("/api/teams");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("list_roles", "List roles and their permissions", {}, async () => {
    const result = await api.get("/api/roles");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// ============================================================================
// Webhook Tools
// ============================================================================
server.tool("list_webhooks", "List configured webhooks", {}, async () => {
    const result = await api.get("/api/webhooks");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("create_webhook", "Create a new webhook endpoint", {
    name: z.string().describe("Webhook name"),
    url: z.string().url().describe("Webhook URL endpoint"),
    events: z.array(z.enum([
        "message.incoming", "message.sent", "message.delivered", "message.read",
        "transfer.created", "transfer.assigned", "transfer.resumed",
        "contact.created", "contact.updated",
    ])).describe("Events to subscribe to"),
    headers: z.record(z.string()).optional().describe("Custom HTTP headers"),
}, async (params) => {
    const result = await api.post("/api/webhooks", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("test_webhook", "Test a webhook by sending a sample payload", {
    webhook_id: z.string().uuid().describe("Webhook UUID"),
}, async ({ webhook_id }) => {
    const result = await api.post(`/api/webhooks/${webhook_id}/test`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// ============================================================================
// Canned Responses & Tags
// ============================================================================
server.tool("list_canned_responses", "List canned (quick reply) responses", {}, async () => {
    const result = await api.get("/api/canned-responses");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("create_canned_response", "Create a canned (quick reply) response", {
    shortcut: z.string().describe("Slash command shortcut (e.g., /hello)"),
    title: z.string().describe("Display title"),
    content: z.string().describe("Response content (supports {{placeholders}})"),
}, async (params) => {
    const result = await api.post("/api/canned-responses", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("list_tags", "List all tags", {}, async () => {
    const result = await api.get("/api/tags");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("create_tag", "Create a new tag", {
    name: z.string().describe("Tag name"),
    color: z.string().optional().describe("Tag color (hex)"),
}, async (params) => {
    const result = await api.post("/api/tags", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// ============================================================================
// Custom Actions
// ============================================================================
server.tool("list_custom_actions", "List custom action buttons", {}, async () => {
    const result = await api.get("/api/custom-actions");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("execute_custom_action", "Execute a custom action", {
    action_id: z.string().uuid().describe("Custom action UUID"),
    contact_id: z.string().uuid().optional().describe("Contact UUID for context"),
}, async ({ action_id, contact_id }) => {
    const result = await api.post(`/api/custom-actions/${action_id}/execute`, { contact_id });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// ============================================================================
// Flows (WhatsApp Interactive Flows)
// ============================================================================
server.tool("list_flows", "List WhatsApp interactive flows", {}, async () => {
    const result = await api.get("/api/flows");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("create_flow", "Create a WhatsApp interactive flow", {
    name: z.string().describe("Flow name"),
    category: z.string().optional().describe("Flow category"),
    screens: z.array(z.any()).describe("Flow screen definitions"),
    account_name: z.string().optional().describe("WhatsApp account name"),
}, async (params) => {
    const result = await api.post("/api/flows", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// ============================================================================
// Conversation Notes
// ============================================================================
server.tool("list_conversation_notes", "List notes for a contact conversation", {
    contact_id: z.string().uuid().describe("Contact UUID"),
}, async ({ contact_id }) => {
    const result = await api.get(`/api/contacts/${contact_id}/notes`);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
server.tool("create_conversation_note", "Add a note to a contact conversation", {
    contact_id: z.string().uuid().describe("Contact UUID"),
    content: z.string().describe("Note content"),
}, async ({ contact_id, content }) => {
    const result = await api.post(`/api/contacts/${contact_id}/notes`, { content });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});
// ============================================================================
// Health Check
// ============================================================================
server.tool("health_check", "Check Whatomate API server health status", {}, async () => {
    try {
        const result = await api.get("/health");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    catch (error) {
        return { content: [{ type: "text", text: `Health check failed: ${error.message}` }] };
    }
});
server.tool("ready_check", "Check if Whatomate API is ready (database + Redis)", {}, async () => {
    try {
        const result = await api.get("/ready");
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    catch (error) {
        return { content: [{ type: "text", text: `Ready check failed: ${error.message}` }] };
    }
});
// ============================================================================
// Start Server
// ============================================================================
async function main() {
    // Try to authenticate on startup if credentials are provided
    if (WHATOMATE_EMAIL && WHATOMATE_PASSWORD && !WHATOMATE_API_KEY) {
        try {
            await api.authenticate();
            console.error("Authenticated successfully with Whatomate API");
        }
        catch (error) {
            console.error("Warning: Authentication failed:", error.message);
            console.error("MCP server will still start, but API calls may fail until authenticated.");
        }
    }
    else if (WHATOMATE_API_KEY) {
        console.error("Using API key authentication");
    }
    else {
        console.error("No authentication configured. Set WHATOMATE_API_KEY or WHATOMATE_EMAIL/WHATOMATE_PASSWORD.");
        console.error("You can use the auth_login tool to authenticate interactively.");
    }
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Whatomate MCP server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map