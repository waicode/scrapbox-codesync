"use strict";

const chromium = require("chrome-aws-lambda");
const { cookie } = require("request");

function getSidCookieJson() {
  return [
    {
      domain: ".scrapbox.io",
      expirationDate: 1648646416,
      hostOnly: false,
      httpOnly: false,
      name: "__stripe_mid",
      path: "/",
      sameSite: "lax",
      secure: false,
      session: false,
      storeId: "0",
      value: "f9c0dcd1-1fd9-4ff0-8d31-e40e454202e1690466",
      id: 1,
    },
    {
      domain: ".scrapbox.io",
      expirationDate: 1617112216,
      hostOnly: false,
      httpOnly: false,
      name: "__stripe_sid",
      path: "/",
      sameSite: "lax",
      secure: false,
      session: false,
      storeId: "0",
      value: "7db5f6f8-7752-4f6b-bfa4-71d438179cf84f2407",
      id: 2,
    },
    {
      domain: ".scrapbox.io",
      expirationDate: 1636284654,
      hostOnly: false,
      httpOnly: false,
      name: "__zlcmid",
      path: "/",
      sameSite: "lax",
      secure: false,
      session: false,
      storeId: "0",
      value: "113jZFUz5TVt8kY",
      id: 3,
    },
    {
      domain: ".scrapbox.io",
      expirationDate: 1679987328,
      hostOnly: false,
      httpOnly: false,
      name: "_ga",
      path: "/",
      sameSite: "unspecified",
      secure: false,
      session: false,
      storeId: "0",
      value: "GA1.2.17086681.1565273906",
      id: 4,
    },
    {
      domain: "scrapbox.io",
      expirationDate: 1622294419.047579,
      hostOnly: true,
      httpOnly: true,
      name: "connect.sid",
      path: "/",
      sameSite: "unspecified",
      secure: true,
      session: false,
      storeId: "0",
      value: process.env.SCRAPBOX_CONNECT_SID,
      id: 5,
    },
  ];
}

function isSlsLocal() {
  if (process.env.IS_LOCAL) {
    console.info("Running locally");
  }
  if (process.env.SLS_STAGE == "local") {
    console.info("Stage is local");
  }
  return process.env.IS_LOCAL || process.env.SLS_STAGE == "local";
}

function isSignatureValid(body, headers) {
  const sigHashAlg = "sha256";
  const sigHeaderName = "X-Hub-Signature-256";
  const sigHeader = headers[sigHeaderName];
  const crypto = require("crypto");
  const hmac = crypto.createHmac(sigHashAlg, process.env.SECRET_TOKEN);
  hmac.update(body, "utf8");
  const digest = `${sigHashAlg}=` + hmac.digest("hex");
  return digest.length == sigHeader.length && digest == sigHeader;
}

function okResponse(result) {
  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: "ok",
        title: result,
      },
      null,
      2
    ),
  };
}

function unauthorizedResponse() {
  return {
    statusCode: 401,
    body: JSON.stringify(
      {
        message: "unauthorized",
      },
      null,
      2
    ),
  };
}

function fatalResponse() {
  return {
    statusCode: 500,
    body: JSON.stringify(
      {
        message: "fatal error",
      },
      null,
      2
    ),
  };
}

module.exports.sync = async (event) => {
  console.info(`event: ${event}`);

  if (!isSlsLocal) {
    if (!isSignatureValid(event.body, event.headers)) {
      console.info("unauthorized signature");
      return unauthorizedResponse();
    }
  }

  let result = null;
  let browser = null;

  try {
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: isSlsLocal() ? null : await chromium.executablePath, // local puppeteer in node_modules(dev)
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    let page = await browser.newPage();

    // scrapbox.ioのクッキーにconnect.sidを設定
    const sidCookie = getSidCookieJson();
    await page.setCookie(...sidCookie);

    // 1. 変更があったcssまたはjsをイベントから取得

    // 以下、複数件のループ処理

    // 2. 対象ページの存在を確認する

    // 3. 対象ページが存在しない場合は新規作成

    // 4. 存在する場合は一度消してから新規作成

    await page.goto(
      `https://scrapbox.io/${process.env.PROJECT_NAME}/aiueo?body=aiueo`
    );

    const pageEditMenuSelector = "#page-edit-menu";
    await page.waitForSelector(pageEditMenuSelector);
    await page.click(pageEditMenuSelector);

    const deleteMenuBtnSelector =
      '#app-container div.dropdown.open ul > li > a[title="Delete"]';
    await page.waitForSelector(deleteMenuBtnSelector);
    await page.click(deleteMenuBtnSelector);

    await page.waitForTimeout(3000);

    page.on("dialog", async (dialog) => {
      console.log(dialog.message());
      await dialog.accept();
    });

    await page.goto(
      `https://scrapbox.io/${process.env.PROJECT_NAME}/aiueo?body=aiueo`
    );
    await page.waitForSelector(pageEditMenuSelector);
    await page.click(pageEditMenuSelector);
  } catch (error) {
    console.error(error);
    return fatalResponse();
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
  return okResponse(result);
};
