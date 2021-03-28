"use strict";

module.exports.hello = async (event) => {
  let result = null;
  let browser = null;

  try {
    if (process.env.SLS_STAGE == "local" || process.env.SLS_STAGE == "dev") {
      browser = await chromium.puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: null, //
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
    } else {
      browser = await chromium.puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath,
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
    }

    let page = await browser.newPage();

    await page.goto(event.url || "https://www.google.com/");

    result = await page.title();
  } catch (error) {
    return callback(error);
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        title: result,
      },
      null,
      2
    ),
  };
};
