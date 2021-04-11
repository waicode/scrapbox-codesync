const chromium = require("chrome-aws-lambda");

const getSidCookieJson = () => {
  return [
    {
      domain: "scrapbox.io",
      hostOnly: true,
      httpOnly: true,
      name: "connect.sid",
      path: "/",
      sameSite: "unspecified",
      secure: true,
      session: false,
      storeId: "0",
      value: process.env.SCRAPBOX_CONNECT_SID,
      id: 1,
    },
  ];
};

exports.launchBrowser = async (isLocal = false) => {
  return await chromium.puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: isLocal ? null : await chromium.executablePath, // local puppeteer in node_modules(dev)
    headless: chromium.headless,
    slowMo: 300,
    ignoreHTTPSErrors: true,
  });
};

exports.preparePage = async (browser) => {
  let page = await browser.newPage();

  // Always accept dialog alerts
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  // set connect.sid cookie for scrapbox.io
  await page.setCookie(...getSidCookieJson());
  return page;
};

exports.deletePage = async (
  page,
  targetUrl,
  editMenuSelector,
  deleteBtnSelector
) => {
  await Promise.all([
    page.waitForSelector(editMenuSelector),
    page.goto(targetUrl),
  ]);

  await Promise.all([
    page.waitForSelector(deleteBtnSelector),
    page.click(editMenuSelector),
  ]);

  const deleteBtn = await page.$(deleteBtnSelector);
  if (deleteBtn) {
    return await Promise.all([
      page.waitForNavigation(),
      page.click(deleteBtnSelector),
    ]);
  } else {
    return Promise.resolve();
  }
};

exports.addPage = async (page, targetUrl, editMenuSelector) => {
  return await Promise.all([
    page.waitForSelector(editMenuSelector),
    page.goto(targetUrl),
  ]);
};
