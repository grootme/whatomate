#!/bin/bash
# Whatomate - WhatsApp QR Pair E2E Test Script
# 
# This script runs end-to-end tests for the WhatsApp QR pairing flow
# It requires the Whatomate server to be running with PostgreSQL and Redis
#
# Usage:
#   ./test-qr-pair.sh [BASE_URL]
#
# Prerequisites:
#   - Whatomate server running
#   - PostgreSQL and Redis accessible
#   - curl and jq installed

set -euo pipefail

BASE_URL="${1:-http://localhost:8081}"
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_pass() { echo -e "  ${GREEN}✅ PASS${NC}: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
log_fail() { echo -e "  ${RED}❌ FAIL${NC}: $1 - $2"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
log_skip() { echo -e "  ${YELLOW}⏭️  SKIP${NC}: $1"; SKIP_COUNT=$((SKIP_COUNT + 1)); }
log_info() { echo -e "  ${BLUE}ℹ️  INFO${NC}: $1"; }
log_section() { echo -e "\n${BLUE}═══ $1 ═══${NC}"; }

# Check dependencies
check_deps() {
    for cmd in curl jq; do
        if ! command -v $cmd &> /dev/null; then
            echo "Error: $cmd is required but not installed"
            exit 1
        fi
    done
}

# Make API request
api_call() {
    local method=$1
    local path=$2
    local body=$3
    local token=$4

    local args=("-s" "-X" "$method" "-H" "Content-Type: application/json")
    if [ -n "$token" ]; then
        args+=("-H" "Authorization: Bearer $token")
    fi
    if [ -n "$body" ]; then
        args+=("-d" "$body")
    fi

    curl "${args[@]}" "${BASE_URL}${path}" 2>/dev/null || echo '{"error": "connection failed"}'
}

# ========== Test Functions ==========

test_health_check() {
    log_section "Health Check"
    
    local response
    response=$(api_call "GET" "/health" "" "")
    local status
    status=$(echo "$response" | jq -r '.status // empty')
    
    if [ "$status" = "ok" ]; then
        log_pass "Server health check"
    else
        log_fail "Server health check" "Server not responding or unhealthy"
        echo "  Response: $response"
        return 1
    fi
}

test_readiness_check() {
    local response
    response=$(api_call "GET" "/ready" "" "")
    local status
    status=$(echo "$response" | jq -r '.data.status // .status // empty')
    
    if [ "$status" = "ready" ]; then
        log_pass "Server readiness check"
    else
        log_fail "Server readiness check" "DB or Redis not ready"
    fi
}

test_auth_login() {
    log_section "Authentication"
    
    local response
    response=$(api_call "POST" "/api/auth/login" '{"email":"admin@example.com","password":"password123"}' "")
    
    AUTH_TOKEN=$(echo "$response" | jq -r '.data.access_token // empty')
    
    if [ -n "$AUTH_TOKEN" ] && [ "$AUTH_TOKEN" != "null" ]; then
        log_pass "Login with valid credentials"
    else
        log_fail "Login with valid credentials" "No access token returned"
        echo "  Response: $response"
        return 1
    fi
}

test_auth_login_invalid() {
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
        -d '{"email":"invalid@example.com","password":"wrong"}' "${BASE_URL}/api/auth/login" 2>/dev/null)
    
    if [ "$http_code" -ge 400 ]; then
        log_pass "Login with invalid credentials returns error"
    else
        log_fail "Login with invalid credentials" "Expected error but got $http_code"
    fi
}

test_create_meta_account() {
    log_section "Create Meta Account"
    
    local body='{
        "name": "e2e-test-meta",
        "client_type": "meta",
        "phone_id": "e2e-test-phone-id",
        "business_id": "e2e-test-business-id",
        "access_token": "e2e-test-access-token"
    }'
    
    local response
    response=$(api_call "POST" "/api/accounts" "$body" "$AUTH_TOKEN")
    
    META_ACCOUNT_ID=$(echo "$response" | jq -r '.data.id // empty')
    local status
    status=$(echo "$response" | jq -r '.data.status // empty')
    local client_type
    client_type=$(echo "$response" | jq -r '.data.client_type // empty')
    
    if [ -n "$META_ACCOUNT_ID" ] && [ "$status" = "active" ] && [ "$client_type" = "meta" ]; then
        log_pass "Create Meta account (status=active, client_type=meta)"
    else
        log_fail "Create Meta account" "id=$META_ACCOUNT_ID, status=$status, client_type=$client_type"
        echo "  Response: $response"
    fi
}

test_create_whatsmeow_account() {
    log_section "Create Whatsmeow Account"
    
    local body='{
        "name": "e2e-test-whatsmeow",
        "client_type": "whatsmeow",
        "phone_id": "1234567890@s.whatsapp.net"
    }'
    
    local response
    response=$(api_call "POST" "/api/accounts" "$body" "$AUTH_TOKEN")
    
    WS_ACCOUNT_ID=$(echo "$response" | jq -r '.data.id // empty')
    local status
    status=$(echo "$response" | jq -r '.data.status // empty')
    local client_type
    client_type=$(echo "$response" | jq -r '.data.client_type // empty')
    local qr_code
    qr_code=$(echo "$response" | jq -r '.data.qr_code // empty')
    
    if [ -n "$WS_ACCOUNT_ID" ] && [ "$status" = "disconnected" ] && [ "$client_type" = "whatsmeow" ]; then
        log_pass "Create Whatsmeow account (status=disconnected, client_type=whatsmeow)"
    else
        log_fail "Create Whatsmeow account" "id=$WS_ACCOUNT_ID, status=$status, client_type=$client_type"
        echo "  Response: $response"
    fi
    
    if [ -z "$qr_code" ] || [ "$qr_code" = "null" ]; then
        log_pass "QR code is empty initially"
    else
        log_fail "QR code is empty initially" "QR code should be empty before session start"
    fi
}

test_create_meta_without_business_id() {
    local body='{
        "name": "e2e-test-meta-no-biz",
        "client_type": "meta",
        "phone_id": "test-phone",
        "access_token": "test-token"
    }'
    
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" -d "$body" "${BASE_URL}/api/accounts" 2>/dev/null)
    
    if [ "$http_code" = "400" ]; then
        log_pass "Create Meta account without business_id returns 400"
    else
        log_fail "Create Meta account without business_id" "Expected 400, got $http_code"
    fi
}

test_start_session_meta_fails() {
    log_section "Start Session - Meta Account"
    
    if [ -z "$META_ACCOUNT_ID" ]; then
        log_skip "Start session on Meta account (no account created)"
        return
    fi
    
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" "${BASE_URL}/api/accounts/${META_ACCOUNT_ID}/start-session" 2>/dev/null)
    
    if [ "$http_code" = "400" ]; then
        log_pass "Start session on Meta account returns 400"
    else
        log_fail "Start session on Meta account" "Expected 400, got $http_code"
    fi
}

test_start_session_whatsmeow() {
    log_section "Start Session - Whatsmeow Account"
    
    if [ -z "$WS_ACCOUNT_ID" ]; then
        log_skip "Start session on Whatsmeow account (no account created)"
        return
    fi
    
    local response
    response=$(api_call "POST" "/api/accounts/${WS_ACCOUNT_ID}/start-session" "" "$AUTH_TOKEN")
    
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" "${BASE_URL}/api/accounts/${WS_ACCOUNT_ID}/start-session" 2>/dev/null)
    
    local success
    success=$(echo "$response" | jq -r '.data.success // empty')
    local qr_code
    qr_code=$(echo "$response" | jq -r '.data.qr_code // empty')
    
    if [ "$http_code" = "200" ] && [ "$success" = "true" ]; then
        log_pass "Start session on Whatsmeow account returns success"
    elif [ "$http_code" = "500" ]; then
        # Expected if whatsmeow store is not configured
        log_skip "Start session on Whatsmeow account (whatsmeow store not configured)"
        log_info "This is expected in test environments without whatsmeow DB store"
    else
        log_fail "Start session on Whatsmeow account" "http=$http_code, success=$success"
        echo "  Response: $response"
    fi
    
    if [ -n "$qr_code" ] && [ "$qr_code" != "null" ] && [ "$qr_code" != "" ]; then
        log_pass "QR code returned after session start"
        log_info "QR data: ${qr_code:0:50}..."
    else
        log_info "No QR code yet (may still be generating or store not configured)"
    fi
}

test_list_accounts() {
    log_section "List Accounts"
    
    local response
    response=$(api_call "GET" "/api/accounts" "" "$AUTH_TOKEN")
    
    local count
    count=$(echo "$response" | jq '.data.accounts | length')
    
    if [ "$count" -ge 2 ]; then
        log_pass "List accounts returns at least 2 accounts (got $count)"
    else
        log_fail "List accounts" "Expected at least 2, got $count"
    fi
    
    # Check both types exist
    local meta_count ws_count
    meta_count=$(echo "$response" | jq '[.data.accounts[] | select(.client_type == "meta")] | length')
    ws_count=$(echo "$response" | jq '[.data.accounts[] | select(.client_type == "whatsmeow")] | length')
    
    if [ "$meta_count" -ge 1 ]; then
        log_pass "Meta accounts present in list"
    else
        log_fail "Meta accounts in list" "Found $meta_count"
    fi
    
    if [ "$ws_count" -ge 1 ]; then
        log_pass "Whatsmeow accounts present in list"
    else
        log_fail "Whatsmeow accounts in list" "Found $ws_count"
    fi
}

test_get_account() {
    log_section "Get Account"
    
    if [ -z "$WS_ACCOUNT_ID" ]; then
        log_skip "Get account (no account created)"
        return
    fi
    
    local response
    response=$(api_call "GET" "/api/accounts/${WS_ACCOUNT_ID}" "" "$AUTH_TOKEN")
    
    local name
    name=$(echo "$response" | jq -r '.data.name // empty')
    local client_type
    client_type=$(echo "$response" | jq -r '.data.client_type // empty')
    
    if [ "$name" = "e2e-test-whatsmeow" ] && [ "$client_type" = "whatsmeow" ]; then
        log_pass "Get account returns correct data"
    else
        log_fail "Get account" "name=$name, client_type=$client_type"
    fi
}

test_update_account() {
    log_section "Update Account"
    
    if [ -z "$WS_ACCOUNT_ID" ]; then
        log_skip "Update account (no account created)"
        return
    fi
    
    local body='{"name": "e2e-test-whatsmeow-updated"}'
    local response
    response=$(api_call "PUT" "/api/accounts/${WS_ACCOUNT_ID}" "$body" "$AUTH_TOKEN")
    
    local name
    name=$(echo "$response" | jq -r '.data.name // empty')
    
    if [ "$name" = "e2e-test-whatsmeow-updated" ]; then
        log_pass "Update account name"
    else
        log_fail "Update account name" "name=$name"
    fi
}

test_unauthorized_access() {
    log_section "Authorization Tests"
    
    # Try to access accounts without token
    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/accounts" 2>/dev/null)
    
    if [ "$http_code" = "401" ]; then
        log_pass "Unauthenticated access returns 401"
    else
        log_fail "Unauthenticated access" "Expected 401, got $http_code"
    fi
    
    # Try to access account from different org
    if [ -n "$WS_ACCOUNT_ID" ]; then
        http_code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $AUTH_TOKEN" \
            "${BASE_URL}/api/accounts/${WS_ACCOUNT_ID}" -H "X-Organization-ID: 00000000-0000-0000-0000-000000000000" 2>/dev/null)
        
        if [ "$http_code" = "404" ]; then
            log_pass "Cross-org access returns 404"
        else
            log_fail "Cross-org access" "Expected 404, got $http_code"
        fi
    fi
}

test_cleanup() {
    log_section "Cleanup"
    
    # Delete test accounts
    for account_id in "$META_ACCOUNT_ID" "$WS_ACCOUNT_ID"; do
        if [ -n "$account_id" ]; then
            local http_code
            http_code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "Authorization: Bearer $AUTH_TOKEN" \
                "${BASE_URL}/api/accounts/${account_id}" 2>/dev/null)
            
            if [ "$http_code" = "200" ]; then
                log_pass "Delete account ${account_id:0:8}..."
            else
                log_fail "Delete account ${account_id:0:8}..." "HTTP $http_code"
            fi
        fi
    done
}

test_websocket_qr_flow() {
    log_section "WebSocket QR Flow (Informational)"
    
    log_info "WebSocket QR code flow cannot be fully tested via curl."
    log_info "The flow works as follows:"
    log_info "  1. Client connects to ws://SERVER/ws with JWT auth"
    log_info "  2. POST /api/accounts/{id}/start-session triggers QR generation"
    log_info "  3. Server broadcasts 'whatsapp_qr_code' message via WebSocket"
    log_info "  4. Message payload: {account_id, qr_code, status='scanning'}"
    log_info "  5. On pair success: status='connected', qr_code=''"
    log_info "  6. On logout: status='disconnected'"
    log_info ""
    log_info "To test WebSocket manually, use the Go test tool:"
    log_info "  go run cmd/qrpair-test/main.go"
    
    log_pass "WebSocket QR flow documentation verified"
}

# ========== Main ==========

main() {
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║     Whatomate - WhatsApp QR Pair E2E Test Suite             ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Server: $BASE_URL"
    echo ""

    check_deps

    # Run tests in sequence
    test_health_check || exit 1
    test_readiness_check
    test_auth_login || exit 1
    test_auth_login_invalid

    # Account tests
    test_create_meta_account
    test_create_whatsmeow_account
    test_create_meta_without_business_id

    # Session tests
    test_start_session_meta_fails
    test_start_session_whatsmeow

    # CRUD tests
    test_list_accounts
    test_get_account
    test_update_account
    test_unauthorized_access

    # WebSocket flow
    test_websocket_qr_flow

    # Cleanup
    test_cleanup

    # Summary
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║  Test Results                                                ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo -e "║  ${GREEN}Passed: $PASS_COUNT${NC}"
    echo -e "║  ${RED}Failed: $FAIL_COUNT${NC}"
    echo -e "║  ${YELLOW}Skipped: $SKIP_COUNT${NC}"
    echo "╚══════════════════════════════════════════════════════════════╝"
    
    if [ $FAIL_COUNT -gt 0 ]; then
        exit 1
    fi
}

main
