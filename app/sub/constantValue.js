exports.TYPE_JS = "js";
exports.TYPE_CSS = "css";

exports.CSS_CODE_REG = /code\/css\/(.+)\/.+\.css/;
exports.JS_CODE_REG = /code\/js\/(.+)\/.+\.js/;

exports.TARGET_REF_REG = new RegExp(
  "refs/(.+)/" + process.env.GITHUB_TARGET_BRUNCH
);
