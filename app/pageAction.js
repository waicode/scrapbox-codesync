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
