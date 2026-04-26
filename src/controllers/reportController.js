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
  const incomingTitle = payload.titulo ?? payload.title ?? payload.name;
  const incomingDescription = payload.descripcion ?? payload.description ?? payload.body;

  if (!partial || incomingTitle !== undefined) {
    normalized.titulo = normalizeTrimmedString(incomingTitle, "titulo", { required: true });
  }

  if (incomingDescription !== undefined) {
    normalized.descripcion = String(incomingDescription || "").trim();
  }

  if (payload.tipo !== undefined) {
    const tipo = String(payload.tipo).trim().toLowerCase();
    const tipoMap = {
      incidente: "incidente",
      infraestructura: "mantenimiento",
      mantenimiento: "mantenimiento",
      operacion: "operacion",
      operativa: "operacion",
      sistema: "sistema",
      otro: "operacion"
    };
    normalized.tipo = tipoMap[tipo] || tipo;
  }

  if (payload.estado !== undefined) {
    const estado = String(payload.estado).trim().toLowerCase();
    const estadoMap = {
      nuevo: "abierto",
      abierta: "abierto",
      abierto: "abierto",
      en_proceso: "en_proceso",
      enproceso: "en_proceso",
      cerrado: "cerrado",
      cerrada: "cerrado"
    };
    normalized.estado = estadoMap[estado] || estado;
  }

  if (payload.prioridad !== undefined) {
    const prioridad = String(payload.prioridad).trim().toLowerCase();
    const prioridadMap = {
      baja: "baja",
      media: "media",
      normal: "media",
      alta: "alta",
      critica: "critica",
      crítico: "critica",
      critical: "critica"
    };
    normalized.prioridad = prioridadMap[prioridad] || prioridad;
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

  if (payload.fotos !== undefined) {
    if (!Array.isArray(payload.fotos)) {
      throw createHttpError("fotos debe ser un arreglo");
    }

    normalized.fotos = payload.fotos
      .filter(Boolean)
      .map((photo, index) => {
        if (!photo.url && !photo.secure_url) {
          throw createHttpError(`La foto ${index + 1} requiere url o secure_url`);
        }

        return {
          url: String(photo.url || photo.secure_url).trim(),
          secure_url: photo.secure_url ? String(photo.secure_url).trim() : null,
          public_id: photo.public_id ? String(photo.public_id).trim() : null,
          asset_id: photo.asset_id ? String(photo.asset_id).trim() : null,
          filename: photo.filename ? String(photo.filename).trim() : null,
          content_type: photo.content_type ? String(photo.content_type).trim() : null,
          width: photo.width ? Number(photo.width) : null,
          height: photo.height ? Number(photo.height) : null,
          uploaded_at: photo.uploaded_at ? new Date(photo.uploaded_at) : new Date()
        };
      });
  }

  return normalized;
}

function toReportResponse(report) {
  if (!report) {
    return report;
  }

  const raw = typeof report.toObject === "function" ? report.toObject() : { ...report };
  return {
    ...raw,
    id: raw._id,
    title: raw.titulo || "",
    name: raw.titulo || "",
    description: raw.descripcion || "",
    body: raw.descripcion || "",
    status: raw.estado || "",
    priority: raw.prioridad || "",
    type: raw.tipo || "",
    reporter_name: raw.reportado_por_nombre || "",
    reporter_uid: raw.reportado_por_uid || ""
  };
}

async function createReport(req, res, next) {
  try {
    const payload = normalizeReportPayload(req.body);
    const report = await Report.create({
      ...payload,
      creado_por: req.currentUser?._id || null,
      reportado_por_nombre: req.currentUser?.nombre || null,
      reportado_por_uid: req.currentUser?.firebase_uid || null,
      reportado_en: new Date(),
      metadata: {
        ...payload.metadata,
        reportado_por_rol: req.currentUser?.rol || null,
        email_reportante: req.currentUser?.email || null
      }
    });
    sendSuccess(res, toReportResponse(report), undefined, 201);
  } catch (error) {
    if (error?.name === "ValidationError" && !error.status) {
      error.status = 400;
    }
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

    if (req.query.reportado_por_uid) {
      query.reportado_por_uid = String(req.query.reportado_por_uid).trim();
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

    sendSuccess(res, data.map(toReportResponse), {
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

    sendSuccess(res, toReportResponse(report));
  } catch (error) {
    next(error);
  }
}

async function updateReport(req, res, next) {
  try {
    const payload = normalizeReportPayload(req.body, { partial: true });
    delete payload.reportado_por_nombre;
    delete payload.reportado_por_uid;
    delete payload.reportado_en;
    delete payload.creado_por;

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true }
    ).populate("creado_por");

    if (!report) {
      throw createHttpError("Reporte no encontrado", 404);
    }

    sendSuccess(res, toReportResponse(report));
  } catch (error) {
    if (error?.name === "ValidationError" && !error.status) {
      error.status = 400;
    }
    next(error);
  }
}

module.exports = {
  createReport,
  getReportById,
  getReports,
  updateReport
};
