"use strict";

const chromium = require("chrome-aws-lambda");
const { cookie } = require("request");

const fs = require("fs");

// 指定したフォルダ配下のファイルパス一覧を取得
const listFiles = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((dirent) =>
      dirent.isFile()
        ? [`${dir}/${dirent.name}`]
        : listFiles(`${dir}/${dirent.name}`)
    );

// 行頭にタブを入れる（文頭と\nの次に\tを入れ、文末に\tがあれば除去）
const addTabHeadOfLine = (fileData) =>
  fileData.replace(/^/g, /\t/g).replace(/\n/g, /\n\t/g).replace(/\t$/g, /\t$/g);

function getSidCookieJson() {
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
  if (!isSlsLocal) {
    console.info(`event: ${event}`);
  }

  if (!isSlsLocal) {
    if (!isSignatureValid(event.body, event.headers)) {
      console.info("unauthorized signature");
      return unauthorizedResponse();
    }
  }

  let result = null;
  let browser = null;

  console.info(`chromium.headless: ${chromium.headless}`);

  try {
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: isSlsLocal() ? null : await chromium.executablePath, // local puppeteer in node_modules(dev)
      headless: chromium.headless,
      slowMo: 300,
      ignoreHTTPSErrors: true,
    });

    let page = await browser.newPage();

    // scrapbox.ioのクッキーにconnect.sidを設定
    const sidCookie = getSidCookieJson();
    await page.setCookie(...sidCookie);

    // 1. 変更があったcssまたはjsをイベントから取得

    // 1. codeフォルダ配下のstyleとscriptのパスを取得
    const cssFilesList = listFiles("code/css");

    // UserCSSページタイトルをフォルダ名から取得
    const userCssPageDicList = await Promise.all(
      cssFilesList.map(async (path) => {
        let fileData = await fs.readFileSync(path, "utf-8");
        return {
          title: path.match(new RegExp("code/css/(.+)/.+.css"))[1],
          code: addTabHeadOfLine(fileData),
        };
      })
    );

    console.log(userCssPageDicList);

    // UserScriptページタイトルをフォルダ名から取得
    const jsFilesList = listFiles("code/js");
    const userScriptPageDicList = await Promise.all(
      jsFilesList.map(async (path) => {
        const jsReg = new RegExp("code/js/(.+)/.+.js");
        let fileData = await fs.readFileSync(path, "utf-8");
        // 行頭にタブを入れる（最初と\nの次、ただし最後の\nの次は不要）
        fileData = fileData
          .replace(/^/g, "\t")
          .replace(/\n/g, "\n\t")
          .replace(/\t$/g, "");
        console.log(fileData);
        return { title: path.match(jsReg)[1], code: fileData };
      })
    );
    console.log(userScriptPageDicList);

    // 以下、複数件のループ処理
    const cssTagName = "#UserCSS";
    for (let userCssPageDic of userCssPageDicList) {
      let cssPage = `${cssTagName} + \n\n + "code:style.css" + \n + ${userCssPageDic.code} + \n\n`;
    }

    const scriptTagName = "#UserScript";

    // 2. 対象ページの存在を確認する

    // 3. 対象ページが存在しない場合は新規作成

    // 4. 存在する場合は一度消してから新規作成

    await page.goto(
      `https://scrapbox.io/${process.env.PROJECT_NAME}/aiueo?body=aiueo`
    );

    const pageEditMenuSelector = "#page-edit-menu";
    await page.waitForSelector(pageEditMenuSelector);
    await page.click(pageEditMenuSelector);
    console.info(`Page edit menu is Clicked.`);

    const deleteMenuBtnSelector =
      '#app-container div.dropdown.open ul > li > a[title="Delete"]';

    page.on("dialog", async (dialog) => {
      await dialog.accept();
      console.info(`Delete dialog: OK is Clicked.`);
    });

    await page.waitForSelector(deleteMenuBtnSelector);
    await page.click(deleteMenuBtnSelector);

    await page.waitForTimeout(3000);
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
