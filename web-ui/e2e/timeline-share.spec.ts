import { expect, type Page, test } from "@playwright/test";

/**
 * The Timeline's share panel stays open while the period and window change
 * under it, so whatever it shows must always describe the window on screen.
 * It once built its text the moment the period changed, before that window's
 * figures had arrived, and kept "All time · Nothing heard" for a busy week.
 *
 * Needs a seeded station (`npm run db:reset`).
 */

const PERIODS = ["Weekly", "Monthly", "Yearly", "Daily", "Weekly"] as const;

/**
 * The species figure in the body card's kicker, once the window has loaded.
 * An empty window drops the figures for a "No detections recorded" card.
 */
async function speciesOnScreen(page: Page): Promise<number> {
	const figure = page
		.locator("span.whitespace-nowrap", { hasText: /species$/ })
		.locator(".count-figure");
	const empty = page.getByText("No detections recorded").first();
	await expect(figure.or(empty)).toBeVisible();
	if (await empty.isVisible()) return 0;
	return Number((await figure.innerText()).replace(/,/g, ""));
}

async function expectShareMatchesPage(page: Page, period: string) {
	const species = await speciesOnScreen(page);
	const text = page.locator("pre");

	if (species === 0) {
		await expect(text).toContainText("Nothing heard");
	} else {
		await expect(text).toContainText(`${species.toLocaleString()} species`);
		await expect(text).not.toContainText("Nothing heard");
	}
	// Only the All Time view may describe itself as all time.
	await expect(text, `${period} names its window`).not.toContainText(
		"All time",
	);
	await expect(page.getByRole("button", { name: "Copy", exact: true })).toBeEnabled();
}

test("the open share panel follows every period and window change", async ({
	page,
}) => {
	await page.goto("/timeline?period=day");
	await page.waitForLoadState("networkidle");
	const share = page.getByRole("button", { name: "Share" });
	test.skip((await share.count()) === 0, "station has no detections yet");

	await share.click();
	await expectShareMatchesPage(page, "Daily");

	for (const period of PERIODS) {
		await page.getByRole("radio", { name: period, exact: true }).click();
		await expectShareMatchesPage(page, period);
	}

	// Paging within a period, not just switching between them.
	for (const direction of ["Previous", "Next"]) {
		const arrow = page.getByRole("button", {
			name: new RegExp(`^${direction}`),
		});
		if (!(await arrow.isEnabled())) continue;
		await arrow.click();
		await expectShareMatchesPage(page, `Weekly (${direction})`);
	}
});
