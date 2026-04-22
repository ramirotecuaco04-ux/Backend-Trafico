const Report = require("../models/Report");
const { createHttpError, sendSuccess } = require("../utils/http");
const {
  normalizeDate,
  normalizeLimit,
  normalizePage,
  normalizeSortDirection,
  normalizeTrimmedString,
  validateObjectId
} = require("../utils/validation");

function normalizeReportPayload(payload = {}, { partial = false } = {}) {
  const normalized = {};

  if (!partial || payload.titulo !== undefined) {
    normalized.titulo = normalizeTrimmedString(payload.titulo, "titulo", { required: true });
  }

  if (payload.descripcion !== undefined) {
    normalized.descripcion = String(payload.descripcion || "").trim();
  }

  if (payload.tipo !== undefined) {
    normalized.tipo = String(payload.tipo).trim();
  }

  if (payload.estado !== undefined) {
    normalized.estado = String(payload.estado).trim();
  }

  if (payload.prioridad !== undefined) {
    normalized.prioridad = String(payload.prioridad).trim();
  }

  if (payload.intersection_id !== undefined) {
    normalized.intersection_id = payload.intersection_id
      ? String(payload.intersection_id).trim()
      : null;
  }

  if (payload.creado_por !== undefined) {
    normalized.creado_por = payload.creado_por || null;
  }

  if (payload.metadata !== undefined) {
    normalized.metadata = payload.metadata || {};
  }

  return normalized;
}

async function createReport(req, res, next) {
  try {
    const report = await Report.create(normalizeReportPayload(req.body));
    sendSuccess(res, report, undefined, 201);
  } catch (error) {
    next(error);
  }
}

async function getReports(req, res, next) {
  try {
    const limit = normalizeLimit(req.query.limit);
    const page = normalizePage(req.query.page);
    const sortDirection = normalizeSortDirection(req.query.sort);
    const skip = (page - 1) * limit;
    const query = {};
    const startDate = normalizeDate(req.query.start_date, "start_date");
    const endDate = normalizeDate(req.query.end_date, "end_date");

    if (req.query.estado) {
      query.estado = String(req.query.estado).trim();
    }

    if (req.query.tipo) {
      query.tipo = String(req.query.tipo).trim();
    }

    if (req.query.intersection_id) {
      query.intersection_id = String(req.query.intersection_id).trim();
    }

    if (req.query.prioridad) {
      query.prioridad = String(req.query.prioridad).trim();
    }

    if (startDate || endDate) {
      query.createdAt = {};

      if (startDate) {
        query.createdAt.$gte = startDate;
      }

      if (endDate) {
        query.createdAt.$lte = endDate;
      }
    }

    const [data, total] = await Promise.all([
      Report.find(query)
        .populate("creado_por")
        .sort({ createdAt: sortDirection })
        .skip(skip)
        .limit(limit),
      Report.countDocuments(query)
    ]);

    sendSuccess(res, data, {
      count: data.length,
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (error) {
    next(error);
  }
}

async function getReportById(req, res, next) {
  try {
    validateObjectId(req.params.id, "report id");
    const report = await Report.findById(req.params.id).populate("creado_por");

    if (!report) {
      throw createHttpError("Reporte no encontrado", 404);
    }

    sendSuccess(res, report);
  } catch (error) {
    next(error);
  }
}

async function updateReport(req, res, next) {
  try {
    const payload = normalizeReportPayload(req.body, { partial: true });
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    ).populate("creado_por");

    if (!report) {
      throw createHttpError("Reporte no encontrado", 404);
    }

    sendSuccess(res, report);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createReport,
  getReportById,
  getReports,
  updateReport
};
