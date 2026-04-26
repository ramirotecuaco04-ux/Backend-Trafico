const crypto = require("crypto");
const { getCloudinaryConfig } = require("../config/cloudinary");
const { createHttpError, sendSuccess } = require("../utils/http");
const { normalizeTrimmedString } = require("../utils/validation");

function buildSignature(paramsToSign, apiSecret) {
  const sortedEntries = Object.entries(paramsToSign)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));

  const stringToSign = sortedEntries
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : value}`)
    .join("&");

  return crypto
    .createHash("sha1")
    .update(stringToSign + apiSecret)
    .digest("hex");
}

async function createCloudinaryReportSignature(req, res, next) {
  try {
    const cloudinary = getCloudinaryConfig();

    if (!cloudinary) {
      throw createHttpError("Cloudinary no esta configurado en el backend", 500);
    }

    const intersectionId = normalizeTrimmedString(req.body.intersection_id, "intersection_id", { allowNull: true }) || "sin-interseccion";
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `traffic_reports/${intersectionId}`;
    const tags = ["traffic-report", req.currentUser.rol, intersectionId];
    const tagsCsv = tags.join(",");
    const context = `reported_by=${req.currentUser.nombre}|reported_role=${req.currentUser.rol}`;
    const paramsToSign = {
      timestamp,
      folder,
      tags: tagsCsv,
      context
    };

    const signature = buildSignature(paramsToSign, cloudinary.apiSecret);

    sendSuccess(res, {
      cloud_name: cloudinary.cloudName,
      api_key: cloudinary.apiKey,
      timestamp,
      folder,
      tags: tagsCsv,
      context,
      signature
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createCloudinaryReportSignature
};
