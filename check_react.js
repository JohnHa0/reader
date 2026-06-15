import puppeteer from 'puppeteer';

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    await page.goto('http://localhost:1420');
    await page.waitForTimeout(2000);
    const html = await page.content();
    console.log("HTML length:", html.length);
    if (html.includes('id="root"></div>')) {
        console.log("ROOT IS EMPTY!");
    }
    await browser.close();
  } catch (e) {
    console.log("Puppeteer error:", e.message);
  }
})();
