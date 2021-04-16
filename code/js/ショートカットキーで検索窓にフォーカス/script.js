/* ショートカットキーで各アクション */
(() => {
  const aliases = {};
  const onKeyDown = function (e) {
    /* alt(option)＋ctrl+fで検索窓にカーソル移動 */
    if (e.ctrlKey && e.altKey) {
      const name = e.code;
      if (name == "KeyF") {
        document.getElementsByTagName("input")[1].focus();
      }
    }
  };
  document.addEventListener("keydown", onKeyDown);
})();
