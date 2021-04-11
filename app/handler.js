"use strict";

const constantValue = require("./sub/constantValue");
const pageAction = require("./sub/pageAction");
const responseFormat = require("./sub/responseFormat");

const fs = require("fs");

// Get the list of file paths under the folder
const listFiles = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((dirent) =>
      dirent.isFile()
        ? [`${dir}/${dirent.name}`]
        : listFiles(`${dir}/${dirent.name}`)
    );

// Put a tab at the beginning of a line（^ => \t, \n => \n\t, delete last \t）
const addTabHeadOfLine = (fileData) =>
  fileData.replace(/^/g, "\t").replace(/\n/g, "\n\t").replace(/\t$/g, "");

// Check invoke-local
const isSlsLocal = () => {
  if (process.env.IS_LOCAL) {
    // invoke-local -> IS_LOCAL=true
    // https://www.serverless.com/framework/docs/providers/aws/cli-reference/invoke-local/
    console.info("Running on local");
  }
  return process.env.IS_LOCAL;
};

// Valid Github Signature
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

// Put CSS/JS code page (delete => add)
const putCode = async (page, type, title, code) => {
  const editMenuSelector = "#page-edit-menu";
  const copyLinkSelector =
    "#app-container div.dropdown.open ul > li:nth-child(1) > a";
  const deleteBtnSelector =
    '#app-container div.dropdown.open ul > li > a[title="Delete"]';

  // Delete page
  let pageUrl =
    `https://scrapbox.io/${process.env.PROJECT_NAME}/` +
    encodeURIComponent(title);

  await pageAction.deletePage(
    page,
    pageUrl,
    editMenuSelector,
    copyLinkSelector,
    deleteBtnSelector
  );

  // Add page
  if (type === constantValue.TYPE_CSS) {
    const cssTagName = "#UserCSS";
    const cssPageEyeCatch = `[${process.env.USER_CSS_EYECATCH_URL}]`;
    const cssPageData = `\n${cssTagName}\n\n${cssPageEyeCatch}\n\ncode:style.css\n${code}\n\n`;
    pageUrl = `${pageUrl}?body=` + encodeURIComponent(cssPageData);
    await pageAction.addPage(page, pageUrl, editMenuSelector);
  } else if (type === constantValue.TYPE_JS) {
    const scriptTagName = "#UserScript";
    const scriptPageEyeCatch = `[${process.env.USER_SCRIPT_EYECATCH_URL}]`;
    const scriptPageData = `\n${scriptTagName}\n\n${scriptPageEyeCatch}\n\ncode:script.js\n${code}\n\n`;
    pageUrl = `${pageUrl}?body=` + encodeURIComponent(scriptPageData);
    await pageAction.addPage(page, pageUrl, editMenuSelector);
  } else {
    console.error("unknown type");
  }
};

/**
 * Receiving GitHub event, sync added/modified pages  => Scrapbox
 */
module.exports.receive = async (event) => {
  // Check invoke-local
  if (isSlsLocal()) {
    const msg = "no event on local";
    console.error(msg);
    return responseFormat.fatalResponse(msg);
  }

  // Check signature
  if (!isSignatureValid(event.body, event.headers)) {
    const msg = "unauthorized signature";
    console.info(msg);
    return responseFormat.unauthorizedResponse(msg);
  }

  // Check gitHub event type
  const gitHubEventList = event.headers["X-GitHub-Event"];
  if (!gitHubEventList.includes("push")) {
    const msg = "only push event";
    console.info(msg);
    return responseFormat.badRequestResponse(msg);
  }

  const body = JSON.parse(event.body);

  let pathList = [];
  for (let commitInfo of body.commits) {
    pathList = pathList.concat(commitInfo.added.concat(commitInfo.modified));
  }

  let codePageDicList = await Promise.all(
    Array.from(
      new Set(
        pathList.filter(
          (path) =>
            constantValue.CSS_CODE_REG.test(path) ||
            constantValue.JS_CODE_REG.test(path)
        )
      )
    ).map(async (path) => {
      let fileData = await fs.readFileSync(path, "utf-8");
      if (constantValue.CSS_CODE_REG.test(path)) {
        return {
          type: constantValue.TYPE_CSS,
          title: path.match(constantValue.CSS_CODE_REG)[1],
          code: addTabHeadOfLine(fileData),
        };
      } else if (constantValue.JS_CODE_REG.test(path)) {
        return {
          type: constantValue.TYPE_JS,
          title: path.match(constantValue.JS_CODE_REG)[1],
          code: addTabHeadOfLine(fileData),
        };
      }
    })
  );

  let msg = "";
  if (codePageDicList.length > 0) {
    let browser = null;
    try {
      browser = await pageAction.launchBrowser(isSlsLocal());

      await Promise.all(
        codePageDicList.map(async (dic) => {
          let codePage = await pageAction.preparePage(browser);
          console.info("putCode start - ", dic.type, dic.title);
          await putCode(codePage, dic.type, dic.title, dic.code);
          console.info("putCode complete - ", dic.type, dic.title);
        })
      );
      msg = `sync complete - ${codePageDicList
        .map((dic) => dic.type + ":" + dic.title)
        .join(", ")}`;
    } catch (error) {
      console.error(error);
      return responseFormat.fatalResponse(error.message);
    } finally {
      if (browser !== null) {
        await browser.close();
      }
    }
  } else {
    msg = "not applicable";
  }
  console.info(msg);
  return responseFormat.okResponse(msg);
};

// Get all css pages list
const getUserCssPageDicList = async () => {
  const cssFilesList = listFiles("code/css");
  const userCssPageDicList = await Promise.all(
    cssFilesList.map(async (path) => {
      let cssFileData = await fs.readFileSync(path, "utf-8");
      return {
        type: constantValue.TYPE_CSS,
        title: path.match(constantValue.CSS_CODE_REG)[1],
        code: addTabHeadOfLine(cssFileData),
      };
    })
  );
  return userCssPageDicList;
};

// Get all script pages list
const getUserScriptPageDicList = async () => {
  const jsFilesList = listFiles("code/js");
  const userScriptPageDicList = await Promise.all(
    jsFilesList.map(async (path) => {
      let jsFileData = await fs.readFileSync(path, "utf-8");
      return {
        type: constantValue.TYPE_JS,
        title: path.match(constantValue.JS_CODE_REG)[1],
        code: addTabHeadOfLine(jsFileData),
      };
    })
  );
  return userScriptPageDicList;
};

/**
 * Sync all CSS/JS pages  => Scrapbox
 */
module.exports.allSync = async () => {
  let browser = null;
  let msg = "";

  try {
    const userCssPageDicList = await getUserCssPageDicList();
    const userScriptPageDicList = await getUserScriptPageDicList();

    browser = await pageAction.launchBrowser(isSlsLocal());

    await Promise.all(
      userCssPageDicList.concat(userScriptPageDicList).map(async (dic) => {
        let codePage = await pageAction.preparePage(browser);
        console.info("putCode start - ", dic.type, dic.title);
        await putCode(codePage, dic.type, dic.title, dic.code);
        console.info("putCode complete - ", dic.type, dic.title);
      })
    );

    msg = `sync complete - ${userCssPageDicList
      .concat(userScriptPageDicList)
      .map((sync) => sync.type + ":" + sync.title)
      .join(", ")}`;
    return responseFormat.okResponse(msg);
  } catch (error) {
    console.error(error);
    return responseFormat.fatalResponse(error.message);
  } finally {
    if (browser !== null) {
      await browser.close();
    }
  }
};
