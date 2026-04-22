function createHttpError(message, status = 400, details = null) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

function sendSuccess(res, data, meta, status = 200) {
  const payload = {
    success: true,
    data
  };

  if (meta !== undefined) {
    payload.meta = meta;
  }

  return res.status(status).json(payload);
}

module.exports = {
  createHttpError,
  sendSuccess
};
