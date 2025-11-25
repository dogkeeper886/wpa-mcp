/**
 * Example Playwright script for handling a captive portal login
 *
 * Variables that can be passed:
 * - username: Login username
 * - password: Login password
 * - portal_url: URL of the captive portal (default: http://192.168.1.1)
 *
 * Usage via MCP:
 * browser_run_script("example-portal", { username: "guest", password: "wifi123" })
 */

export default async function(page, variables) {
  const {
    username = '',
    password = '',
    portal_url = 'http://192.168.1.1'
  } = variables;

  console.log(`Navigating to portal: ${portal_url}`);
  await page.goto(portal_url, { waitUntil: 'networkidle' });

  // Wait for page to load
  await page.waitForLoadState('domcontentloaded');

  // Try to find and fill common login form elements
  // Adjust selectors based on your specific captive portal

  // Look for username field
  const usernameSelectors = [
    'input[name="username"]',
    'input[name="user"]',
    'input[name="login"]',
    'input[id="username"]',
    'input[type="text"]:first-of-type'
  ];

  for (const selector of usernameSelectors) {
    const element = await page.$(selector);
    if (element && username) {
      await element.fill(username);
      console.log(`Filled username using selector: ${selector}`);
      break;
    }
  }

  // Look for password field
  const passwordSelectors = [
    'input[name="password"]',
    'input[name="pass"]',
    'input[type="password"]',
    'input[id="password"]'
  ];

  for (const selector of passwordSelectors) {
    const element = await page.$(selector);
    if (element && password) {
      await element.fill(password);
      console.log(`Filled password using selector: ${selector}`);
      break;
    }
  }

  // Look for submit button
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Login")',
    'button:has-text("Connect")',
    'button:has-text("Submit")',
    '#login-button',
    '.login-btn'
  ];

  for (const selector of submitSelectors) {
    const element = await page.$(selector);
    if (element) {
      console.log(`Clicking submit button: ${selector}`);
      await element.click();
      break;
    }
  }

  // Wait for navigation or success indicator
  try {
    await page.waitForNavigation({ timeout: 10000 });
    console.log('Navigation completed after form submission');
  } catch {
    console.log('No navigation occurred - checking for success indicators');
  }

  // Check for common success messages
  const pageContent = await page.content();
  const successIndicators = ['success', 'connected', 'welcome', 'thank you'];

  for (const indicator of successIndicators) {
    if (pageContent.toLowerCase().includes(indicator)) {
      return `Login appears successful - found "${indicator}" on page`;
    }
  }

  return 'Script completed - check browser for results';
}
