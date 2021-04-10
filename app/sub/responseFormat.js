const jsonStringify = (dic = {}) => {
  return JSON.stringify(dic, null, 2);
};

exports.okResponse = (msg = "ok") => {
  return {
    statusCode: 200,
    body: jsonStringify({ message: msg }),
  };
};

exports.unauthorizedResponse = (msg = "unauthorized") => {
  return {
    statusCode: 401,
    body: jsonStringify({ message: msg }),
  };
};

exports.badRequestResponse = (msg = "bad request") => {
  return {
    statusCode: 400,
    body: jsonStringify({ message: msg }),
  };
};

exports.fatalResponse = (msg = "fatal error") => {
  return {
    statusCode: 500,
    body: jsonStringify({ message: msg }),
  };
};
