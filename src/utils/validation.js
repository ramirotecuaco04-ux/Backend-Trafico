const mongoose = require("mongoose");
const { createHttpError } = require("./http");

function normalizeTrimmedString(value, fieldName, { required = false, allowNull = false } = {}) {
  if (value === undefined) {
    if (required) {
      throw createHttpError(`${fieldName} es obligatorio`);
    }

    return undefined;
  }

  if (value === null) {
    if (allowNull) {
      return null;
    }

    if (required) {
      throw createHttpError(`${fieldName} es obligatorio`);
    }

    return undefined;
  }

  const normalized = String(value).trim();

  if (required && normalized.length === 0) {
    throw createHttpError(`${fieldName} es obligatorio`);
  }

  if (!required && normalized.length === 0) {
    return allowNull ? null : undefined;
  }

  return normalized;
}

function normalizeNonNegativeNumber(value, fieldName, defaultValue = 0) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createHttpError(`${fieldName} debe ser un numero mayor o igual a 0`);
  }

  return parsed;
}

function normalizeBoolean(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value === "true" || value === "1" || value === 1) {
    return true;
  }

  if (value === "false" || value === "0" || value === 0) {
    return false;
  }

  throw createHttpError(`${fieldName} debe ser booleano`);
}

function normalizeDate(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw createHttpError(`${fieldName} no es una fecha valida`);
  }

  return parsedDate;
}

function normalizeLimit(limitValue, defaultValue = 50, maxValue = 200) {
  if (limitValue === undefined) {
    return defaultValue;
  }

  const parsed = Number(limitValue);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError("limit debe ser un entero positivo");
  }

  return Math.min(parsed, maxValue);
}

function normalizePage(pageValue, defaultValue = 1) {
  if (pageValue === undefined) {
    return defaultValue;
  }

  const parsed = Number(pageValue);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError("page debe ser un entero positivo");
  }

  return parsed;
}

function normalizeSortDirection(value, defaultValue = -1) {
  if (value === undefined) {
    return defaultValue;
  }

  if (value === "asc" || value === "1" || value === 1) {
    return 1;
  }

  if (value === "desc" || value === "-1" || value === -1) {
    return -1;
  }

  throw createHttpError("sort debe ser asc o desc");
}

function validateObjectId(id, fieldName = "id") {
  if (!mongoose.isValidObjectId(id)) {
    throw createHttpError(`${fieldName} no es un identificador valido`, 400);
  }

  return id;
}

module.exports = {
  normalizeBoolean,
  normalizeDate,
  normalizeLimit,
  normalizePage,
  normalizeNonNegativeNumber,
  normalizeSortDirection,
  normalizeTrimmedString,
  validateObjectId
};
