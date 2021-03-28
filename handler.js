"use strict";

const chromium = require("chrome-aws-lambda");

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

function okResponse() {
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

  if (!isSignatureValid(event.body, event.headers)) {
    console.info("unauthorized signature");
    return unauthorizedResponse();
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

    // 1. 変更があったcssまたはjsをイベントから取得

    // 以下、複数件のループ処理

    // 2. 対象ページの存在を確認する

    // 3. 対象ページが存在しない場合は新規作成

    // 4. 存在する場合は一度消してから新規作成

    let page = await browser.newPage();
    await page.goto(`https://scrapbox.io/${process.env.PROJECT_NAME}/`);

    result = await page.title();
  } catch (error) {
    console.error(error);
    return fatalResponse();
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
  return okResponse();
};
