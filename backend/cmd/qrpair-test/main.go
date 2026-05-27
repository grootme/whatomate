package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

// Whatomate QR Pair Manual Test Tool
// This tool helps you manually test the WhatsApp QR pairing flow

const (
	defaultBaseURL = "http://localhost:8081"
)

type APIResponse struct {
	Status  string                 `json:"status"`
	Data    map[string]interface{} `json:"data"`
	Message string                 `json:"message,omitempty"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type CreateAccountRequest struct {
	Name        string `json:"name"`
	ClientType  string `json:"client_type"`
	PhoneID     string `json:"phone_id"`
	BusinessID  string `json:"business_id"`
	AccessToken string `json:"access_token"`
}

var (
	baseURL   string
	authToken string
	client    = &http.Client{Timeout: 30 * time.Second}
)

func main() {
	baseURL = getEnv("WHATOMATE_URL", defaultBaseURL)
	reader := bufio.NewReader(os.Stdin)

	fmt.Println("╔══════════════════════════════════════════════════════════════╗")
	fmt.Println("║       Whatomate - WhatsApp QR Pair Manual Test Tool         ║")
	fmt.Println("╚══════════════════════════════════════════════════════════════╝")
	fmt.Println()
	fmt.Printf("Server: %s\n", baseURL)
	fmt.Println()

	// Step 1: Health Check
	fmt.Println("═══ Step 1: Health Check ═══")
	if !healthCheck() {
		fmt.Println("❌ Server is not responding. Make sure Whatomate is running.")
		os.Exit(1)
	}
	fmt.Println("✅ Server is healthy!")
	fmt.Println()

	// Step 2: Login
	fmt.Println("═══ Step 2: Login ═══")
	if !login(reader) {
		fmt.Println("❌ Login failed. Cannot continue.")
		os.Exit(1)
	}
	fmt.Println("✅ Logged in successfully!")
	fmt.Println()

	// Step 3: Choose test flow
	fmt.Println("═══ Step 3: Choose Test Flow ═══")
	fmt.Println("1. Full QR Pair Test (Create whatsmeow account → Start session → Get QR → Scan)")
	fmt.Println("2. Test with existing whatsmeow account")
	fmt.Println("3. List all accounts")
	fmt.Println("4. Test Meta account creation")
	fmt.Println("5. Test account CRUD operations")
	fmt.Println("6. Run all automated tests")
	fmt.Print("Select option (1-6): ")

	option := readLine(reader)
	fmt.Println()

	switch option {
	case "1":
		fullQRPairTest(reader)
	case "2":
		testWithExistingAccount(reader)
	case "3":
		listAccounts()
	case "4":
		testMetaAccount(reader)
	case "5":
		testAccountCRUD(reader)
	case "6":
		runAllAutomatedTests()
	default:
		fmt.Println("Invalid option")
	}
}

func healthCheck() bool {
	resp, err := http.Get(baseURL + "/health")
	if err != nil {
		fmt.Printf("  Error: %v\n", err)
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		body, _ := io.ReadAll(resp.Body)
		var result map[string]interface{}
		json.Unmarshal(body, &result)
		fmt.Printf("  Status: %v\n", result["status"])
		return true
	}
	return false
}

func login(reader *bufio.Reader) bool {
	fmt.Print("  Email (default: admin@example.com): ")
	email := readLine(reader)
	if email == "" {
		email = "admin@example.com"
	}

	fmt.Print("  Password (default: password123): ")
	password := readLine(reader)
	if password == "" {
		password = "password123"
	}

	reqBody, _ := json.Marshal(LoginRequest{Email: email, Password: password})
	resp, err := http.Post(baseURL+"/api/auth/login", "application/json", bytes.NewReader(reqBody))
	if err != nil {
		fmt.Printf("  Error: %v\n", err)
		return false
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result APIResponse
	json.Unmarshal(body, &result)

	if data, ok := result.Data["access_token"].(string); ok {
		authToken = data
		return true
	}

	fmt.Printf("  Login failed: %s\n", string(body))
	return false
}

func fullQRPairTest(reader *bufio.Reader) {
	fmt.Println("═══ Full QR Pair Test ═══")
	fmt.Println()
	fmt.Println("This test will:")
	fmt.Println("  1. Create a whatsmeow WhatsApp account")
	fmt.Println("  2. Start a session to generate a QR code")
	fmt.Println("  3. Display the QR code for you to scan")
	fmt.Println("  4. Monitor the connection status")
	fmt.Println()

	fmt.Print("  Account name (default: test-whatsmeow): ")
	name := readLine(reader)
	if name == "" {
		name = "test-whatsmeow"
	}

	fmt.Print("  Phone ID / JID (e.g., 1234567890@s.whatsapp.net): ")
	phoneID := readLine(reader)
	if phoneID == "" {
		fmt.Println()
		fmt.Println("  ⚠️  For whatsmeow, the PhoneID is the WhatsApp JID.")
		fmt.Println("  If you don't have one, leave it as a placeholder.")
		fmt.Println("  The adapter will generate a new device if the JID doesn't exist in the store.")
		fmt.Print("  Enter JID or press Enter for 'new': ")
		phoneID = readLine(reader)
		if phoneID == "" {
			phoneID = "new"
		}
	}

	// Step 1: Create whatsmeow account
	fmt.Println()
	fmt.Println("  ─── Creating whatsmeow account ───")

	accountData, err := createAccount(CreateAccountRequest{
		Name:       name,
		ClientType: "whatsmeow",
		PhoneID:    phoneID,
	})
	if err != nil {
		fmt.Printf("  ❌ Failed to create account: %v\n", err)
		return
	}

	accountID, _ := accountData["id"].(string)
	fmt.Printf("  ✅ Account created! ID: %s\n", accountID)
	fmt.Printf("     Status: %v\n", accountData["status"])
	fmt.Printf("     Client Type: %v\n", accountData["client_type"])
	fmt.Println()

	// Step 2: Start session (generate QR)
	fmt.Println("  ─── Starting WhatsApp session (generating QR) ───")

	sessionData, err := startSession(accountID)
	if err != nil {
		fmt.Printf("  ❌ Failed to start session: %v\n", err)
		fmt.Println()
		fmt.Println("  Possible causes:")
		fmt.Println("  - whatsmeow database store not configured")
		fmt.Println("  - Invalid PhoneID/JID format")
		fmt.Println("  - whatsmeow adapter not properly initialized")
		return
	}

	qrCode, _ := sessionData["qr_code"].(string)
	status, _ := sessionData["status"].(string)
	fmt.Printf("  ✅ Session started!\n")
	fmt.Printf("     Status: %s\n", status)
	fmt.Println()

	if qrCode == "" {
		fmt.Println("  ⚠️  QR code is empty. The QR may still be generating.")
		fmt.Println("  Polling for QR code...")

		// Poll for QR code
		for i := 0; i < 10; i++ {
			time.Sleep(2 * time.Second)
			account, err := getAccount(accountID)
			if err != nil {
				continue
			}
			if qr, ok := account["qr_code"].(string); ok && qr != "" {
				qrCode = qr
				break
			}
			fmt.Printf("  ... waiting for QR code (attempt %d/10)\n", i+1)
		}
	}

	if qrCode != "" {
		fmt.Println("  ─── QR Code Generated! ───")
		fmt.Println()
		fmt.Println("  📱 Open WhatsApp on your phone:")
		fmt.Println("     1. Go to Settings → Linked Devices")
		fmt.Println("     2. Tap 'Link a Device'")
		fmt.Println("     3. Scan the QR code below:")
		fmt.Println()
		fmt.Printf("  QR Data: %s\n", qrCode)
		fmt.Println()
		fmt.Println("  (In the web UI, this QR data would be rendered as a scannable image)")
		fmt.Println()
	}

	// Step 3: Monitor connection status
	fmt.Println("  ─── Monitoring Connection Status ───")
	fmt.Println("  (Press Ctrl+C to stop monitoring)")
	fmt.Println()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	lastStatus := status
	for {
		select {
		case <-sigChan:
			fmt.Println("\n  Stopping monitoring...")
			goto done
		case <-ticker.C:
			account, err := getAccount(accountID)
			if err != nil {
				fmt.Printf("  Error checking status: %v\n", err)
				continue
			}

			currentStatus, _ := account["status"].(string)
			currentQR, _ := account["qr_code"].(string)

			if currentStatus != lastStatus {
				fmt.Printf("  📡 Status changed: %s → %s\n", lastStatus, currentStatus)
				lastStatus = currentStatus

				switch currentStatus {
				case "active":
					fmt.Println()
					fmt.Println("  ╔══════════════════════════════════════╗")
					fmt.Println("  ║  ✅ WHATSAPP CONNECTED SUCCESSFULLY! ║")
					fmt.Println("  ╚══════════════════════════════════════╝")
					fmt.Println()
					fmt.Printf("  Phone ID: %v\n", account["phone_id"])
					goto done
				case "disconnected":
					fmt.Println("  ❌ Disconnected. QR code may have expired.")
					if currentQR != "" {
						fmt.Printf("  New QR available: %s\n", currentQR)
					}
				}
			} else {
				fmt.Printf("  ... Status: %s (QR: %s)\n", currentStatus, truncate(currentQR, 30))
			}
		}
	}

done:
	fmt.Println()
	fmt.Println("  ─── Test Complete ───")
	fmt.Printf("  Account ID: %s\n", accountID)
	fmt.Printf("  Final Status: %s\n", lastStatus)

	// Cleanup option
	fmt.Println()
	fmt.Print("  Delete test account? (y/n): ")
	if readLine(reader) == "y" {
		deleteAccount(accountID)
		fmt.Println("  ✅ Account deleted")
	}
}

func testWithExistingAccount(reader *bufio.Reader) {
	fmt.Println("═══ Test with Existing Account ═══")
	fmt.Println()

	// List accounts first
	accounts, err := listAccountsRaw()
	if err != nil {
		fmt.Printf("  ❌ Failed to list accounts: %v\n", err)
		return
	}

	whatsmeowAccounts := []map[string]interface{}{}
	for _, acc := range accounts {
		if ct, _ := acc["client_type"].(string); ct == "whatsmeow" {
			whatsmeowAccounts = append(whatsmeowAccounts, acc)
		}
	}

	if len(whatsmeowAccounts) == 0 {
		fmt.Println("  No whatsmeow accounts found. Create one first (option 1).")
		return
	}

	fmt.Println("  Whatsmeow accounts:")
	for i, acc := range whatsmeowAccounts {
		fmt.Printf("  %d. %s (ID: %s, Status: %s)\n", i+1,
			acc["name"], acc["id"], acc["status"])
	}

	fmt.Print("  Select account number: ")
	var choice int
	fmt.Sscanf(readLine(reader), "%d", &choice)

	if choice < 1 || choice > len(whatsmeowAccounts) {
		fmt.Println("  Invalid choice")
		return
	}

	accountID, _ := whatsmeowAccounts[choice-1]["id"].(string)

	fmt.Println()
	fmt.Println("  Starting session...")
	sessionData, err := startSession(accountID)
	if err != nil {
		fmt.Printf("  ❌ Failed: %v\n", err)
		return
	}

	qrCode, _ := sessionData["qr_code"].(string)
	status, _ := sessionData["status"].(string)
	fmt.Printf("  Status: %s\n", status)
	if qrCode != "" {
		fmt.Printf("  QR Code: %s\n", qrCode)
	}
}

func testMetaAccount(reader *bufio.Reader) {
	fmt.Println("═══ Meta Account Test ═══")
	fmt.Println()

	fmt.Print("  Account name: ")
	name := readLine(reader)
	if name == "" {
		name = "test-meta"
	}

	fmt.Print("  Phone ID: ")
	phoneID := readLine(reader)

	fmt.Print("  Business ID: ")
	businessID := readLine(reader)

	fmt.Print("  Access Token: ")
	accessToken := readLine(reader)

	accountData, err := createAccount(CreateAccountRequest{
		Name:        name,
		ClientType:  "meta",
		PhoneID:     phoneID,
		BusinessID:  businessID,
		AccessToken: accessToken,
	})
	if err != nil {
		fmt.Printf("  ❌ Failed: %v\n", err)
		return
	}

	fmt.Printf("  ✅ Meta account created! ID: %v\n", accountData["id"])
	fmt.Printf("     Status: %v (Meta accounts start as 'active')\n", accountData["status"])

	// Test connection
	if id, ok := accountData["id"].(string); ok {
		fmt.Print("  Test connection? (y/n): ")
		if readLine(reader) == "y" {
			testConnection(id)
		}
	}
}

func testAccountCRUD(reader *bufio.Reader) {
	fmt.Println("═══ Account CRUD Test ═══")
	fmt.Println()

	// Create
	fmt.Println("  [CREATE] Creating test account...")
	accountData, err := createAccount(CreateAccountRequest{
		Name:       "crud-test-account",
		ClientType: "whatsmeow",
		PhoneID:    "crud-test@s.whatsapp.net",
	})
	if err != nil {
		fmt.Printf("  ❌ Create failed: %v\n", err)
		return
	}
	accountID, _ := accountData["id"].(string)
	fmt.Printf("  ✅ Created: %s\n", accountID)

	// Read
	fmt.Println("  [READ] Getting account...")
	acc, err := getAccount(accountID)
	if err != nil {
		fmt.Printf("  ❌ Read failed: %v\n", err)
		return
	}
	fmt.Printf("  ✅ Read: name=%v, status=%v\n", acc["name"], acc["status"])

	// Update
	fmt.Println("  [UPDATE] Updating account name...")
	updated, err := updateAccount(accountID, map[string]interface{}{
		"name": "crud-test-updated",
	})
	if err != nil {
		fmt.Printf("  ❌ Update failed: %v\n", err)
	} else {
		fmt.Printf("  ✅ Updated: name=%v\n", updated["name"])
	}

	// Delete
	fmt.Print("  [DELETE] Delete the test account? (y/n): ")
	if readLine(reader) == "y" {
		err = deleteAccount(accountID)
		if err != nil {
			fmt.Printf("  ❌ Delete failed: %v\n", err)
		} else {
			fmt.Println("  ✅ Deleted")
		}
	}
}

func runAllAutomatedTests() {
	fmt.Println("═══ Running All Automated Tests ═══")
	fmt.Println()

	tests := []struct {
		name string
		fn   func() bool
	}{
		{"Health Check", testHealth},
		{"Auth - Login", testLogin},
		{"Create Meta Account", testCreateMetaAccount},
		{"Create Whatsmeow Account", testCreateWhatsmeowAccount},
		{"Start Session (Meta should fail)", testStartSessionMeta},
		{"List Accounts", testListAccounts},
		{"Get Account", testGetAccount},
		{"Update Account", testUpdateAccount},
		{"Delete Account", testDeleteAccount},
	}

	passed := 0
	failed := 0

	for _, tt := range tests {
		fmt.Printf("  %-40s", tt.name+"...")
		if tt.fn() {
			fmt.Println("✅ PASS")
			passed++
		} else {
			fmt.Println("❌ FAIL")
			failed++
		}
	}

	fmt.Println()
	fmt.Printf("  Results: %d passed, %d failed\n", passed, failed)
}

// ========== Individual test functions ==========

func testHealth() bool {
	resp, err := http.Get(baseURL + "/health")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

func testLogin() bool {
	if authToken != "" {
		return true // Already logged in
	}
	return false
}

func testCreateMetaAccount() bool {
	_, err := createAccount(CreateAccountRequest{
		Name:        "auto-test-meta",
		ClientType:  "meta",
		PhoneID:     "auto-test-phone",
		BusinessID:  "auto-test-business",
		AccessToken: "auto-test-token",
	})
	return err == nil
}

func testCreateWhatsmeowAccount() bool {
	_, err := createAccount(CreateAccountRequest{
		Name:       "auto-test-whatsmeow",
		ClientType: "whatsmeow",
		PhoneID:    "auto-test@s.whatsapp.net",
	})
	return err == nil
}

func testStartSessionMeta() bool {
	// Create meta account
	accountData, err := createAccount(CreateAccountRequest{
		Name:        "auto-test-session-meta",
		ClientType:  "meta",
		PhoneID:     "session-test-phone",
		BusinessID:  "session-test-business",
		AccessToken: "session-test-token",
	})
	if err != nil {
		return false
	}

	accountID, _ := accountData["id"].(string)
	// StartSession on meta account should return 400
	_, err = startSession(accountID)
	return err != nil // Error expected for meta accounts
}

func testListAccounts() bool {
	_, err := listAccountsRaw()
	return err == nil
}

func testGetAccount() bool {
	accountData, err := createAccount(CreateAccountRequest{
		Name:        "auto-test-get",
		ClientType:  "meta",
		PhoneID:     "get-test-phone",
		BusinessID:  "get-test-business",
		AccessToken: "get-test-token",
	})
	if err != nil {
		return false
	}
	accountID, _ := accountData["id"].(string)
	_, err = getAccount(accountID)
	return err == nil
}

func testUpdateAccount() bool {
	accountData, err := createAccount(CreateAccountRequest{
		Name:        "auto-test-update",
		ClientType:  "meta",
		PhoneID:     "update-test-phone",
		BusinessID:  "update-test-business",
		AccessToken: "update-test-token",
	})
	if err != nil {
		return false
	}
	accountID, _ := accountData["id"].(string)
	_, err = updateAccount(accountID, map[string]interface{}{
		"name": "auto-test-updated",
	})
	return err == nil
}

func testDeleteAccount() bool {
	accountData, err := createAccount(CreateAccountRequest{
		Name:        "auto-test-delete",
		ClientType:  "meta",
		PhoneID:     "delete-test-phone",
		BusinessID:  "delete-test-business",
		AccessToken: "delete-test-token",
	})
	if err != nil {
		return false
	}
	accountID, _ := accountData["id"].(string)
	return deleteAccount(accountID) == nil
}

// ========== API Helper Functions ==========

func apiRequest(method, path string, body interface{}) (map[string]interface{}, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBody, _ := json.Marshal(body)
		reqBody = bytes.NewReader(jsonBody)
	}

	req, err := http.NewRequest(method, baseURL+path, reqBody)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	if authToken != "" {
		req.Header.Set("Authorization", "Bearer "+authToken)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	var result map[string]interface{}
	json.Unmarshal(respBody, &result)

	if resp.StatusCode >= 400 {
		errMsg := "request failed"
		if msg, ok := result["message"].(string); ok {
			errMsg = msg
		}
		return result, fmt.Errorf("HTTP %d: %s", resp.StatusCode, errMsg)
	}

	return result, nil
}

func createAccount(req CreateAccountRequest) (map[string]interface{}, error) {
	result, err := apiRequest("POST", "/api/accounts", req)
	if err != nil {
		return nil, err
	}
	data, _ := result["data"].(map[string]interface{})
	return data, nil
}

func getAccount(id string) (map[string]interface{}, error) {
	result, err := apiRequest("GET", "/api/accounts/"+id, nil)
	if err != nil {
		return nil, err
	}
	data, _ := result["data"].(map[string]interface{})
	return data, nil
}

func updateAccount(id string, updates map[string]interface{}) (map[string]interface{}, error) {
	result, err := apiRequest("PUT", "/api/accounts/"+id, updates)
	if err != nil {
		return nil, err
	}
	data, _ := result["data"].(map[string]interface{})
	return data, nil
}

func deleteAccount(id string) error {
	_, err := apiRequest("DELETE", "/api/accounts/"+id, nil)
	return err
}

func startSession(id string) (map[string]interface{}, error) {
	result, err := apiRequest("POST", "/api/accounts/"+id+"/start-session", nil)
	if err != nil {
		return nil, err
	}
	data, _ := result["data"].(map[string]interface{})
	return data, nil
}

func testConnection(id string) (map[string]interface{}, error) {
	result, err := apiRequest("POST", "/api/accounts/"+id+"/test", nil)
	if err != nil {
		return nil, err
	}
	data, _ := result["data"].(map[string]interface{})
	return data, nil
}

func listAccounts() {
	accounts, err := listAccountsRaw()
	if err != nil {
		fmt.Printf("  ❌ Failed: %v\n", err)
		return
	}

	fmt.Println("  Accounts:")
	for _, acc := range accounts {
		name, _ := acc["name"].(string)
		ct, _ := acc["client_type"].(string)
		status, _ := acc["status"].(string)
		id, _ := acc["id"].(string)
		qr, _ := acc["qr_code"].(string)

		qrInfo := ""
		if qr != "" {
			qrInfo = fmt.Sprintf(" (QR: %s...)", truncate(qr, 20))
		}

		fmt.Printf("    - %s [%s] status=%s id=%s%s\n", name, ct, status, id[:8], qrInfo)
	}
}

func listAccountsRaw() ([]map[string]interface{}, error) {
	result, err := apiRequest("GET", "/api/accounts", nil)
	if err != nil {
		return nil, err
	}
	data, _ := result["data"].(map[string]interface{})
	accounts, _ := data["accounts"].([]interface{})

	var accList []map[string]interface{}
	for _, acc := range accounts {
		if m, ok := acc.(map[string]interface{}); ok {
			accList = append(accList, m)
		}
	}
	return accList, nil
}

// ========== Utility Functions ==========

func readLine(reader *bufio.Reader) string {
	line, _ := reader.ReadString('\n')
	return strings.TrimSpace(line)
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
