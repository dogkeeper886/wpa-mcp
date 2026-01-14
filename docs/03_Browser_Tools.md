# Browser Tools

**Status:** Complete  
**Updated:** 2026-01-14

---

## Goal

This document provides a complete reference for browser automation tools, primarily used to handle captive portal login pages at hotels, airports, and other public WiFi locations.

---

## Tools Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser Tools                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  browser_open           Open URL in system browser              │
│  browser_run_script     Execute Playwright automation script    │
│  browser_list_scripts   List available automation scripts       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│            Captive Portal Detected                              │
│  network_check_captive returns redirect_url                     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │    How to handle login?       │
              └───────────────┬───────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│    Manual     │     │  Scripted     │     │   Simple      │
│    Login      │     │  Automation   │     │   Open        │
│               │     │               │     │               │
│browser_open   │     │browser_run_   │     │browser_open   │
│(opens browser)│     │    script     │     │(click-through)│
└───────────────┘     └───────────────┘     └───────────────┘
                              │
                              ▼
                      ┌───────────────┐
                      │ Script fills  │
                      │ credentials,  │
                      │ clicks accept │
                      │ returns result│
                      └───────────────┘
```

---

## Tools

### browser_open

Open a URL in the system's default web browser.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| url | string | Yes | URL to open |

**Example:**
```json
{
  "url": "http://login.hotelwifi.com/portal"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Opened URL in default browser",
  "url": "http://login.hotelwifi.com/portal"
}
```

**Use Cases:**
- Open captive portal for manual login
- Launch documentation pages
- Open admin interfaces

---

### browser_run_script

Execute a Playwright automation script to automate browser interactions.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| script_name | string | Yes | Name of script file (without path) |
| variables | object | No | Variables to pass to script |
| headless | boolean | No | Run without visible browser (default: true) |
| timeout | number | No | Max execution time in ms (default: 60000) |

**Example:**
```json
{
  "script_name": "hotel-wifi-login.js",
  "variables": {
    "room_number": "101",
    "last_name": "Smith"
  },
  "headless": true,
  "timeout": 30000
}
```

**Response (Success):**
```json
{
  "success": true,
  "script_name": "hotel-wifi-login.js",
  "result": "Login successful - accepted terms and conditions",
  "duration_ms": 5200
}
```

**Response (Failure):**
```json
{
  "success": false,
  "script_name": "hotel-wifi-login.js",
  "error": "Timeout waiting for login button",
  "duration_ms": 30000
}
```

---

### browser_list_scripts

List all available automation scripts.

**Parameters:** None

**Example:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "scripts": [
    "hotel-wifi-login.js",
    "airport-accept-terms.js",
    "coffee-shop-facebook.js"
  ],
  "directory": "/home/user/.config/wpa-mcp/scripts",
  "count": 3
}
```

---

## Script Development

### Script Location

Scripts are stored in:
```
~/.config/wpa-mcp/scripts/
```

Or set via environment variable:
```bash
WPA_MCP_SCRIPTS_DIR=/path/to/scripts
```

### Script Format

Scripts must export a default async function:

```javascript
// ~/.config/wpa-mcp/scripts/hotel-wifi-login.js

export default async function(page, variables) {
  const { room_number, last_name } = variables;
  
  // Navigate to portal (usually already there from redirect)
  // await page.goto('http://login.hotelwifi.com/portal');
  
  // Fill in credentials
  await page.fill('#room-number', room_number);
  await page.fill('#last-name', last_name);
  
  // Accept terms
  await page.check('#accept-terms');
  
  // Click login
  await page.click('#login-button');
  
  // Wait for success indicator
  await page.waitForSelector('.success-message', { timeout: 10000 });
  
  // Return result message
  return 'Login successful';
}
```

### Script Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| page | Page | Playwright Page object |
| variables | object | Variables passed from tool call |

### Available Playwright Methods

Common methods available on `page`:

```javascript
// Navigation
await page.goto('https://example.com');
await page.goBack();
await page.reload();

// Selectors
await page.click('button#submit');
await page.fill('input[name="email"]', 'user@example.com');
await page.check('input[type="checkbox"]');
await page.selectOption('select#country', 'US');

// Waiting
await page.waitForSelector('.success');
await page.waitForURL('**/success**');
await page.waitForTimeout(1000); // avoid if possible

// Content
const text = await page.textContent('.message');
const html = await page.innerHTML('body');

// Screenshots (for debugging)
await page.screenshot({ path: '/tmp/debug.png' });
```

---

## Example Scripts

### Simple Terms Acceptance

```javascript
// accept-terms.js
export default async function(page, variables) {
  // Click the accept button
  await page.click('button:has-text("Accept")');
  
  // Wait for redirect or success
  await page.waitForTimeout(2000);
  
  return 'Terms accepted';
}
```

### Hotel WiFi Login

```javascript
// hotel-wifi.js
export default async function(page, variables) {
  const { room, name } = variables;
  
  // Fill room number
  await page.fill('input[name="room"]', room);
  
  // Fill guest name
  await page.fill('input[name="name"]', name);
  
  // Accept terms checkbox
  const checkbox = page.locator('input[type="checkbox"]');
  if (await checkbox.isVisible()) {
    await checkbox.check();
  }
  
  // Submit
  await page.click('button[type="submit"]');
  
  // Wait for success
  try {
    await page.waitForSelector('.success, .connected', { timeout: 10000 });
    return 'Login successful';
  } catch {
    return 'Login submitted but success not confirmed';
  }
}
```

### Airport WiFi (Free Tier)

```javascript
// airport-free.js
export default async function(page, variables) {
  // Look for free WiFi option
  const freeOption = page.locator('text=Free WiFi, text=Complimentary, text=Basic');
  await freeOption.first().click();
  
  // Accept terms if present
  const acceptBtn = page.locator('button:has-text("Accept"), button:has-text("Continue")');
  if (await acceptBtn.isVisible()) {
    await acceptBtn.click();
  }
  
  // Watch video ad if required
  const videoAd = page.locator('.video-ad, #ad-container');
  if (await videoAd.isVisible()) {
    // Wait for ad to complete (usually 30s)
    await page.waitForSelector('.skip-ad, .ad-complete', { timeout: 45000 });
    const skipBtn = page.locator('.skip-ad');
    if (await skipBtn.isVisible()) {
      await skipBtn.click();
    }
  }
  
  return 'Connected to free WiFi';
}
```

### Social Login (Facebook)

```javascript
// facebook-wifi.js
export default async function(page, variables) {
  const { email, password } = variables;
  
  // Click Facebook login button
  await page.click('button:has-text("Facebook"), .fb-login');
  
  // Wait for Facebook popup/redirect
  await page.waitForURL('**/facebook.com/**', { timeout: 5000 });
  
  // Fill credentials
  await page.fill('#email', email);
  await page.fill('#pass', password);
  
  // Submit
  await page.click('button[name="login"]');
  
  // Wait for redirect back
  await page.waitForURL('**!/facebook.com/**', { timeout: 30000 });
  
  return 'Facebook login completed';
}
```

---

## Debugging Scripts

### Run with Visible Browser

```json
{
  "script_name": "my-script.js",
  "headless": false
}
```

### Add Screenshots

```javascript
export default async function(page, variables) {
  await page.screenshot({ path: '/tmp/step1.png' });
  
  await page.click('#button');
  await page.screenshot({ path: '/tmp/step2.png' });
  
  return 'Debug screenshots saved';
}
```

### Check Console Logs

```javascript
export default async function(page, variables) {
  page.on('console', msg => console.log('PAGE:', msg.text()));
  
  // ... rest of script
}
```

---

## Error Handling

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| Script not found | File doesn't exist | Check script name and directory |
| Timeout | Element not found in time | Increase timeout or check selector |
| Navigation failed | Page didn't load | Check URL and network |
| Element not visible | Element exists but hidden | Wait for visibility |

### Script Best Practices

1. **Use specific selectors** - Prefer IDs and data attributes
2. **Add waits** - Wait for elements before interacting
3. **Handle variations** - Different portal versions may differ
4. **Return meaningful messages** - Help diagnose issues
5. **Avoid hardcoded waits** - Use `waitForSelector` instead of `waitForTimeout`

---

## Security Considerations

### Credential Handling

- Pass credentials via `variables` parameter
- Never hardcode credentials in scripts
- Consider using credential_store for sensitive data

### Script Security

- Scripts run with full browser permissions
- Only use trusted scripts
- Review scripts before deployment

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Script Execution Flow                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  browser_run_script Tool                                        │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PlaywrightRunner                            │   │
│  │                                                          │   │
│  │  1. Validate script exists                               │   │
│  │  2. Launch Chromium (headless/headed)                    │   │
│  │  3. Create new page                                      │   │
│  │  4. Import and execute script                            │   │
│  │  5. Return result or error                               │   │
│  │  6. Close browser                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Chromium Browser                            │   │
│  │                                                          │   │
│  │  - Sandbox disabled (for WiFi client context)            │   │
│  │  - Headless by default                                   │   │
│  │  - Configurable timeout                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Related Documents

- [00_Architecture.md](./00_Architecture.md) - System architecture
- [02_Connectivity_Tools.md](./02_Connectivity_Tools.md) - Captive portal detection
