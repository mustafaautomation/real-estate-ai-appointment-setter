import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PAGES = ['/', '/chat', '/dashboard', '/simulator', '/metrics', '/voice'] as const;

async function sendChat(page: Page, text: string) {
  const input = page.getByTestId('chat-input');
  await input.click();
  await input.press('ControlOrMeta+A');
  await input.press('Backspace');
  await input.pressSequentially(text);
  await expect(page.getByTestId('chat-send')).toBeEnabled();
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('assistant-message').last()).toBeVisible();
}

test('landing shows the offline engine and a static path when motion is reduced', async ({
  page,
  browser,
}, info) => {
  await page.goto('/');
  await expect(page.getByTestId('llm-mode')).toHaveAttribute('data-mode', 'offline');
  await expect(page.getByText('Synthetic listings. Harborline Realty is fictional.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Every lead');
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-landing.png`,
    fullPage: true,
  });
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    viewport:
      info.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  });
  const reduced = await context.newPage();
  await reduced.goto('/');
  const animation = await reduced
    .getByTestId('flow-packet')
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(animation).toBe('none');
  await context.close();
});

test('chat qualifies across more than three turns and books', async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.goto('/chat');
  const lines = [
    'Hi, I want to buy a place',
    'a condo',
    '3 bedrooms',
    'Lantern Hill',
    'budget 700k',
    'within 30 days',
    'Book the earliest slot',
  ];
  for (const line of lines) await sendChat(page, line);
  await expect(page.getByTestId('assistant-message')).toHaveCount(7);
  await expect(page.getByTestId('booking-confirmation')).toBeVisible();
  await expect(page.getByTestId('reply-mode').last()).toHaveText('Offline');
  await expect(page.getByTestId('slot-area')).toContainText('Lantern Hill');
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-chat.png`,
    fullPage: true,
  });
  await page.goto('/dashboard');
  const lead = page.getByTestId('lead-row').filter({ hasText: 'Lantern Hill' }).first();
  await expect(lead).toBeVisible();
  await lead.locator('summary').click();
  await expect(lead.getByText('Lead. Book the earliest slot')).toBeVisible();
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-dashboard.png`,
    fullPage: true,
  });
  await page.goto('/metrics');
  await expect(page.getByTestId('metric-p50-web')).not.toHaveText('—');
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-metrics.png`,
    fullPage: true,
  });
});

test('simulator completes sms, email, and instagram', async ({ page }, info) => {
  await page.goto('/simulator');
  for (const channel of ['sms', 'email', 'instagram'] as const) {
    await page.getByTestId(`simulator-tab-${channel}`).click();
    await expect(page.getByTestId('simulator-text')).toHaveValue(/Lantern Hill/);
    await page.getByTestId('simulator-send').click();
    await expect(page.getByTestId('simulator-reply')).toContainText(/Lantern|matches|found/i);
    await page.getByTestId('simulator-book').click();
    await expect(page.getByTestId('simulator-booked')).toBeVisible();
    await expect(page.getByTestId('simulator-mode')).toHaveText('Offline');
  }
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-simulator.png`,
    fullPage: true,
  });
});

test('voice page is marked not live', async ({ page }, info) => {
  await page.goto('/voice');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('not live');
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-voice.png`,
    fullPage: true,
  });
});

test('main pages have no axe violations', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${path} ${JSON.stringify(results.violations, null, 2)}`).toEqual(
      [],
    );
  }
});

test('chat input is reachable from the keyboard', async ({ page }) => {
  await page.goto('/chat');
  await page.getByTestId('chat-input').focus();
  await expect(page.getByTestId('chat-input')).toBeFocused();
  await page.keyboard.type('condo');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('assistant-message')).toBeVisible();
});
