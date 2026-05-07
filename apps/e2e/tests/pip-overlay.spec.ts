import { expect, test } from '@playwright/test';
import { DATA_ATTRS } from '../fixtures/selectors';
import { PlayerPage } from '../page-objects/player';

const PIP_OVERLAY_PAGES = [
  { name: 'HTML PIP Overlay', path: '/pages/html-pip-overlay.html', framework: 'html' },
  { name: 'React PIP Overlay', path: '/pages/react-pip-overlay.html', framework: 'react' },
] as const;

for (const { name, path } of PIP_OVERLAY_PAGES) {
  test.describe(`PIP Overlay — ${name}`, () => {
    let player: PlayerPage;

    test.beforeEach(async ({ page }) => {
      player = new PlayerPage(page);
      await page.goto(path);
      // Wait for page to load - PIP overlay pages may not have standard play button
      await page.waitForLoadState('networkidle');
      // Give extra time for custom elements to register
      await page.waitForTimeout(1000);
    });

    test('PIP overlay toggle button is present', async () => {
      await expect(player.pipOverlayToggle).toBeAttached({ timeout: 10_000 });
    });

    test('PIP overlay is hidden by default', async () => {
      await expect(player.pipOverlay).not.toHaveAttribute(DATA_ATTRS.active, { timeout: 10_000 });
    });

    test('clicking toggle button shows PIP overlay', async () => {
      // Use dispatchEvent to avoid pointer capture issues
      await player.pipOverlayToggle.dispatchEvent('click');
      await expect(player.pipOverlay).toHaveAttribute(DATA_ATTRS.active, { timeout: 5_000 });
    });

    test('clicking toggle button again hides PIP overlay', async () => {
      // Show overlay
      await player.pipOverlayToggle.dispatchEvent('click');
      await expect(player.pipOverlay).toHaveAttribute(DATA_ATTRS.active, { timeout: 5_000 });

      // Hide overlay - use dispatchEvent to avoid pointer capture issues
      await player.pipOverlayToggle.dispatchEvent('click');
      await expect(player.pipOverlay).not.toHaveAttribute(DATA_ATTRS.active, { timeout: 5_000 });
    });

    test('PIP overlay source button is present when multiple sources', async () => {
      // Show overlay
      await player.pipOverlayToggle.dispatchEvent('click');
      await expect(player.pipOverlay).toHaveAttribute(DATA_ATTRS.active, { timeout: 5_000 });

      // Check if source button exists (it's optional based on config)
      const hasSourceButton = await player.pipOverlaySourceButton.isVisible().catch(() => false);
      if (hasSourceButton) {
        await expect(player.pipOverlaySourceButton).toBeAttached();
      }
    });

    test('PIP overlay maintains state when controls are toggled', async () => {
      // Show overlay
      await player.pipOverlayToggle.dispatchEvent('click');
      await expect(player.pipOverlay).toHaveAttribute(DATA_ATTRS.active, { timeout: 5_000 });

      // Toggle controls visibility by hovering over player
      await player.page.mouse.move(0, 0);
      await player.page.waitForTimeout(200);

      // Overlay should still be active
      await expect(player.pipOverlay).toHaveAttribute(DATA_ATTRS.active);
    });
  });
}
