"use strict";

const pageAction = require("./pageAction");
const responseFormat = require("./responseFormat");

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
    // invoke-local: IS_LOCAL=true
    // https://www.serverless.com/framework/docs/providers/aws/cli-reference/invoke-local/
    console.info("Running on local");
  }
  return process.env.IS_LOCAL;
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

const putCode = async (page, type, title, code) => {
  const editMenuSelector = "#page-edit-menu";
  const deleteBtnSelector =
    '#app-container div.dropdown.open ul > li > a[title="Delete"]';

  // Delete Page
  let pageUrl =
    `https://scrapbox.io/${process.env.PROJECT_NAME}/` +
    encodeURIComponent(title);
  await pageAction.deletePage(
    page,
    pageUrl,
    editMenuSelector,
    deleteBtnSelector
  );

  // Add Page
  if (type === "css") {
    const cssTagName = "#UserCSS";
    const cssPageEyeCatch = `[${process.env.USER_CSS_EYECATCH_URL}]`;
    const cssPageData = `\n${cssTagName}\n\n${cssPageEyeCatch}\n\ncode:style.css\n${code}\n\n`;
    pageUrl = `${pageUrl}?body=` + encodeURIComponent(cssPageData);
    return await pageAction.addPage(page, pageUrl, editMenuSelector);
  } else if (type === "js") {
    const scriptTagName = "#UserScript";
    const scriptPageEyeCatch = `[${process.env.USER_SCRIPT_EYECATCH_URL}]`;
    const scriptPageData = `\n${scriptTagName}\n\n${scriptPageEyeCatch}\n\ncode:script.js\n${userScriptPageDic.code}\n\n`;
    pageUrl = `${pageUrl}?body=` + encodeURIComponent(scriptPageData);
    return await pageAction.addPage(page, pageUrl, editMenuSelector);
  } else {
    // TODO: Error
  }
};

module.exports.receive = async (event) => {
  if (isSlsLocal()) {
    console.error("no event on local");
    return responseFormat.fatalResponse("no event on local");
  }

  let result = null;
  if (!isSignatureValid(event.body, event.headers)) {
    console.info("unauthorized signature");
    return responseFormat.unauthorizedResponse("unauthorized signature");
  }

  const gitHubEventList = event.headers["X-GitHub-Event"];
  if (!gitHubEventList.includes("push")) {
    return responseFormat.badRequestResponse("only push event");
  }

  console.info(event);

  const body = JSON.parse(event.body);
  console.log("event.body", body);

  console.info(body.commits);

  let pathList = [];
  for (let commitInfo of body.commits) {
    pathList = pathList.concat(commitInfo.added.concat(commitInfo.modified));
  }

  const cssCodeReg = /code\/css\/(.+)\/.+\.css/;
  const jsCodeReg = /code\/js\/(.+)\/.+\.js/;
  let syncList = await Promise.all(
    Array.from(
      new Set(
        pathList.filter((path) => cssCodeReg.test(path) || jsCodeReg.test(path))
      )
    ).map(async (path) => {
      let fileData = await fs.readFileSync(path, "utf-8");
      if (cssCodeReg.test(path)) {
        return {
          type: "css",
          title: path.match(cssCodeReg)[1],
          code: addTabHeadOfLine(fileData),
        };
      } else if (jsCodeReg.test(path)) {
        return {
          type: "js",
          title: path.match(jsCodeReg)[1],
          code: addTabHeadOfLine(fileData),
        };
      }
    })
  );

  if (syncList.length > 0) {
    let browser = await launchBrowser();
    let page = await browser.newPage();
    Promise.all(
      syncList.map(async (sync) => {
        console.log("sync", sync);
        await putCode(page, sync.type, sync.title, sync.code);
      })
    );
  }

  return responseFormat.okResponse(`sync: ${syncList.join(", ")}`);
};

module.exports.sync = async () => {
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
          title: path.match(/code\/css\/(.+)\/.+\.css/)[1],
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
          title: path.match(/code\/js\/(.+)\/.+\.js/)[1],
          code: addTabHeadOfLine(jsFileData),
        };
      })
    );

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
      await pageAction.deletePage(
        page,
        cssPageUrl,
        editMenuSelector,
        deleteBtnSelector
      );
      // ページ作成
      const cssPageEyeCatch = `[${process.env.USER_CSS_EYECATCH_URL}]`;
      const cssPageData = `\n${cssTagName}\n\n${cssPageEyeCatch}\n\ncode:style.css\n${userCssPageDic.code}\n\n`;
      cssPageUrl = `${cssPageUrl}?body=` + encodeURIComponent(cssPageData);
      await pageAction.addPage(page, cssPageUrl, editMenuSelector);
    }
    // UserScript
    const scriptTagName = "#UserScript";
    for (let userScriptPageDic of userScriptPageDicList) {
      // ページ削除
      let scriptPageUrl =
        `https://scrapbox.io/${process.env.PROJECT_NAME}/` +
        encodeURIComponent(userScriptPageDic.title);
      await pageAction.deletePage(
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
      await pageAction.addPage(page, scriptPageUrl, editMenuSelector);
    }
  } catch (error) {
    console.error(error);
    return responseFormat.fatalResponse();
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
  return responseFormat.okResponse();
};
