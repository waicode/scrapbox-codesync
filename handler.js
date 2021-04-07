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
  fileData.replace(/^/g, "\t").replace(/\n/g, "\n\t").replace(/\t$/g, "");

// 認証用Cookie
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

const isSlsLocal = () => {
  if (process.env.IS_LOCAL) {
    console.info("Running locally");
  }
  if (process.env.SLS_STAGE == "local") {
    console.info("Stage is local");
  }
  return process.env.IS_LOCAL || process.env.SLS_STAGE == "local";
};

const isSignatureValid = (body, headers) => {
  const sigHashAlg = "sha256";
  const sigHeaderName = "X-Hub-Signature-256";
  const sigHeader = headers[sigHeaderName];
  const crypto = require("crypto");
  const hmac = crypto.createHmac(sigHashAlg, process.env.SECRET_TOKEN);
  hmac.update(body, "utf8");
  const digest = `${sigHashAlg}=` + hmac.digest("hex");
  return digest.length == sigHeader.length && digest == sigHeader;
};

const launchBrowser = async () => {
  return await chromium.puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: isSlsLocal() ? null : await chromium.executablePath, // local puppeteer in node_modules(dev)
    headless: chromium.headless,
    slowMo: 300,
    ignoreHTTPSErrors: true,
  });
};

const okResponse = (result) => {
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
};

const unauthorizedResponse = () => {
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
};

const fatalResponse = () => {
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
};

async function deletePage(
  page,
  targetUrl,
  editMenuSelector,
  deleteBtnSelector
) {
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
}

async function addPage(page, targetUrl, editMenuSelector) {
  return await Promise.all([
    page.waitForSelector(editMenuSelector),
    page.goto(targetUrl),
  ]);
}

module.exports.receive = async (event) => {
  let result = null;
  if (!isSlsLocal) {
    console.info(event);
    console.info(event.action);
    console.info(event.commits);
  }
  if (!isSlsLocal) {
    if (!isSignatureValid(event.body, event.headers)) {
      console.info("unauthorized signature");
      return unauthorizedResponse();
    }
  }
  return okResponse(result);
};

module.exports.sync = async () => {
  let result = null;
  let browser = null;

  try {
    browser = await launchBrowser();

    let page = await browser.newPage();

    // ダイアログのアラートは常に受け入れる
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    // scrapbox.ioのクッキーにconnect.sidを設定
    await page.setCookie(...getSidCookieJson());

    // UserCSSページタイトルをフォルダ名から取得
    const cssFilesList = listFiles("code/css");
    const userCssPageDicList = await Promise.all(
      cssFilesList.map(async (path) => {
        let cssFileData = await fs.readFileSync(path, "utf-8");
        return {
          title: path.match(new RegExp("code/css/(.+)/.+.css"))[1],
          code: addTabHeadOfLine(cssFileData),
        };
      })
    );

    // UserScriptページタイトルをフォルダ名から取得
    const jsFilesList = listFiles("code/js");
    const userScriptPageDicList = await Promise.all(
      jsFilesList.map(async (path) => {
        let jsFileData = await fs.readFileSync(path, "utf-8");
        return {
          title: path.match(new RegExp("code/js/(.+)/.+.js"))[1],
          code: addTabHeadOfLine(jsFileData),
        };
      })
    );
    console.log(userScriptPageDicList);

    const editMenuSelector = "#page-edit-menu";
    const deleteBtnSelector =
      '#app-container div.dropdown.open ul > li > a[title="Delete"]';

    // ----------------------------
    // 以下、ページ件数分のループ処理
    // ----------------------------

    // UserCSS
    const cssTagName = "#UserCSS";
    for (let userCssPageDic of userCssPageDicList) {
      // ページ削除
      let cssPageUrl =
        `https://scrapbox.io/${process.env.PROJECT_NAME}/` +
        encodeURIComponent(userCssPageDic.title);
      await deletePage(page, cssPageUrl, editMenuSelector, deleteBtnSelector);
      // ページ作成
      const cssPageEyeCatch = `[${process.env.USER_CSS_EYECATCH_URL}]`;
      const cssPageData = `\n${cssTagName}\n\n${cssPageEyeCatch}\n\ncode:style.css\n${userCssPageDic.code}\n\n`;
      cssPageUrl = `${cssPageUrl}?body=` + encodeURIComponent(cssPageData);
      await addPage(page, cssPageUrl, editMenuSelector);
    }
    // UserScript
    const scriptTagName = "#UserScript";
    for (let userScriptPageDic of userScriptPageDicList) {
      // ページ削除
      let scriptPageUrl =
        `https://scrapbox.io/${process.env.PROJECT_NAME}/` +
        encodeURIComponent(userScriptPageDic.title);
      await deletePage(
        page,
        scriptPageUrl,
        editMenuSelector,
        deleteBtnSelector
      );
      // ページ作成
      const scriptPageEyeCatch = `[${process.env.USER_SCRIPT_EYECATCH_URL}]`;
      const scriptPageData = `\n${scriptTagName}\n\n${scriptPageEyeCatch}\n\ncode:script.js\n${userScriptPageDic.code}\n\n`;
      scriptPageUrl =
        `${scriptPageUrl}?body=` + encodeURIComponent(scriptPageData);
      await addPage(page, scriptPageUrl, editMenuSelector);
    }
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
