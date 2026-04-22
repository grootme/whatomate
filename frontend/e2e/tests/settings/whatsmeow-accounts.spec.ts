import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../../helpers'
import { AccountsPage } from '../../pages/AccountsPage'
import { WS_URL } from '../../global-setup'

test.describe('WhatsApp Accounts - Whatsmeow Client', () => {
  let accountsPage: AccountsPage
  const accountName = `Whatsmeow Test Account ${Date.now()}`
  const whatsmeowJid = `2348012345678@s.whatsapp.net` // Example JID

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    accountsPage = new AccountsPage(page)
    await accountsPage.goto()

    // Mock the /api/accounts endpoint to return an empty array initially
    await page.route('**/api/accounts', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        })
      } else {
        await route.continue()
      }
    })
  })

  test('should create a Whatsmeow account and show Start Session button', async ({ page }) => {
    // Mock the create account response
    await page.route('**/api/accounts', async route => {
      if (route.request().method() === 'POST') {
        const postData = route.request().postDataJSON()
        expect(postData.client_type).toBe('whatsmeow')
        expect(postData.name).toBe(accountName)
        expect(postData.phone_id).toBe(whatsmeowJid)

        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'whatsmeow-acc-id',
            name: accountName,
            client_type: 'whatsmeow',
            phone_id: whatsmeowJid,
            status: 'pending', // Pending for QR scan
            qr_code: '',
            is_default_incoming: false,
            is_default_outgoing: false,
            auto_read_receipt: true,
            updated_at: new Date().toISOString()
          })
        })
      } else {
        await route.continue()
      }
    })

    // Mock list accounts to include the newly created one after creation
    await page.route('**/api/accounts', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'whatsmeow-acc-id',
              name: accountName,
              client_type: 'whatsmeow',
              phone_id: whatsmeowJid,
              status: 'pending',
              qr_code: '',
              is_default_incoming: false,
              is_default_outgoing: false,
              auto_read_receipt: true,
              updated_at: new Date().toISOString()
            }
          ])
        })
      } else {
        await route.continue()
      }
    })

    await accountsPage.openCreateDialog()
    await accountsPage.fillAccountForm({
      name: accountName,
      phoneId: whatsmeowJid,
      clientType: 'whatsmeow'
    })
    await accountsPage.submitDialog('Create Account')

    await accountsPage.expectToast(/created successfully/i)
    await accountsPage.dismissToast()

    const accountCard = accountsPage.getAccountCard(accountName)
    await expect(accountCard).toBeVisible()
    await expect(accountCard).toContainText('Whatsmeow')
    await expect(accountCard).toContainText('pending')
    await expect(accountCard.getByRole('button', { name: /Start Session/i })).toBeVisible()
    await expect(accountCard.locator('canvas')).not.toBeVisible() // QR code not visible yet
  })

  test('should start Whatsmeow session and display QR code', async ({ page }) => {
    // Mock initial account GET to have a Whatsmeow account in pending state
    await page.route('**/api/accounts', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'whatsmeow-acc-id',
              name: accountName,
              client_type: 'whatsmeow',
              phone_id: whatsmeowJid,
              status: 'pending',
              qr_code: '', // Initially no QR
              is_default_incoming: false,
              is_default_outgoing: false,
              auto_read_receipt: true,
              updated_at: new Date().toISOString()
            }
          ])
        })
      } else {
        await route.continue()
      }
    })

    // Mock start session API call
    await page.route('**/api/accounts/*/start-session', async route => {
      expect(route.request().method()).toBe('POST')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Session initiated, waiting for QR code.'
        })
      })
    })

    // Go to accounts page after mocks are set
    await accountsPage.goto()

    const accountCard = accountsPage.getAccountCard(accountName)
    await expect(accountCard.getByText('pending')).toBeVisible()

    // Click start session button
    await accountsPage.startWhatsmeowSession(accountName)
    await accountsPage.expectToast(/Session initiated/i)
    await accountsPage.dismissToast()

    // Simulate WebSocket QR code event after starting session
    await page.evaluate(qrCode => {
      // @ts-ignore
      window.testWebSocket.send(JSON.stringify({
        type: 'whatsapp_qr_code',
        payload: {
          account_id: 'whatsmeow-acc-id',
          qr_code: qrCode,
          status: 'scanning'
        }
      }))
    }, 'mock-qr-code-string')

    await accountsPage.expectQrCodeVisible(accountName)
    await expect(accountCard.getByText(/scan this qr code/i)).toBeVisible()
    await expect(accountCard.getByText(/keep this window open/i)).toBeVisible()

    // Simulate WebSocket for successful login
    await page.evaluate(() => {
      // @ts-ignore
      window.testWebSocket.send(JSON.stringify({
        type: 'whatsapp_qr_code',
        payload: {
          account_id: 'whatsmeow-acc-id',
          qr_code: '', // QR code cleared on login
          status: 'connected'
        }
      }))
    })

    // Ensure account status updates to active and QR code disappears
    await expect(accountsPage.getAccountCard(accountName)).toContainText('active')
    await accountsPage.expectQrCodeHidden(accountName)
    await accountsPage.expectToast(/logged in successfully/i)
  })

  test('should show loading state when starting session', async ({ page }) => {
    // Mock initial account GET to have a Whatsmeow account in pending state
    await page.route('**/api/accounts', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'whatsmeow-acc-id',
              name: accountName,
              client_type: 'whatsmeow',
              phone_id: whatsmeowJid,
              status: 'pending',
              qr_code: '', // Initially no QR
              is_default_incoming: false,
              is_default_outgoing: false,
              auto_read_receipt: true,
              updated_at: new Date().toISOString()
            }
          ])
        })
      } else {
        await route.continue()
      }
    })

    // Intercept and delay start-session request to verify loading state
    let fulfillCallback: () => void;
    const responsePromise = new Promise<void>((resolve) => {
      fulfillCallback = resolve;
    });

    await page.route('**/api/accounts/*/start-session', async route => {
      await responsePromise;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Session initiated.' })
      })
    })

    await accountsPage.goto()

    const accountCard = accountsPage.getAccountCard(accountName)
    const startSessionBtn = accountCard.getByRole('button', { name: /Start Session/i })

    // Start the action
    await startSessionBtn.click()

    // Verify loading state
    await expect(startSessionBtn).toBeDisabled()
    await expect(startSessionBtn.locator('.animate-spin')).toBeVisible()

    // Finish the request
    fulfillCallback!()

    // Verify loading state ends
    await expect(startSessionBtn).not.toBeDisabled()
    await expect(startSessionBtn.locator('.animate-spin')).not.toBeVisible()
    await accountsPage.expectToast(/Session initiated/i)
  })
})
