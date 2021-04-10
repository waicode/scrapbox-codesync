exports.okResponse = (msg = "ok") => {
  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        message: msg,
      },
      null,
      2
    ),
  };
};

exports.unauthorizedResponse = (msg = "unauthorized") => {
  return {
    statusCode: 401,
    body: JSON.stringify(
      {
        message: msg,
      },
      null,
      2
    ),
  };
};

exports.badRequestResponse = (msg = "bad request") => {
  return {
    statusCode: 400,
    body: JSON.stringify(
      {
        message: msg,
      },
      null,
      2
    ),
  };
};

exports.fatalResponse = (msg = "fatal error") => {
  return {
    statusCode: 500,
    body: JSON.stringify(
      {
        message: msg,
      },
      null,
      2
    ),
  };
};
