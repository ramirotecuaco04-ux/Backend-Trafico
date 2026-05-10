const OperationalMessage = require("../models/OperationalMessage");
const { createHttpError, sendSuccess } = require("../utils/http");
const {
  normalizeLimit,
  normalizePage,
  normalizeSortDirection,
  normalizeTrimmedString,
  validateObjectId
} = require("../utils/validation");

/**
 * Mapea el mensaje para el cliente, calculando el estado de lectura (is_read)
 * para mantener la consistencia con el modelo de Alertas.
 */
function mapMessageResponse(message, userId) {
  const msgObj = message.toObject ? message.toObject() : message;
  const is_read = userId && msgObj.read_by
    ? msgObj.read_by.some(id => String(id) === String(userId))
    : false;

  // Eliminamos read_by para no exponer IDs internos y mantener consistencia con alertas
  delete msgObj.read_by;

  return {
    ...msgObj,
    is_read: !!is_read
  };
}

function normalizeMessagePayload(payload = {}) {
  const body = normalizeTrimmedString(payload.body, "body", { required: true });
  const subject = normalizeTrimmedString(payload.subject, "subject") || "";
  const priority = normalizeTrimmedString(payload.priority, "priority") || "media";
  const toRole = normalizeTrimmedString(payload.to_role, "to_role", { allowNull: true });
  const toUser = payload.to_user || null;

  if (!toRole && !toUser) {
    throw createHttpError("Debes indicar to_role o to_user");
  }

  return {
    body,
    subject,
    priority,
    to_role: toRole || null,
    to_user: toUser
  };
}

async function createMessage(req, res, next) {
  try {
    const payload = normalizeMessagePayload(req.body);
    const message = await OperationalMessage.create({
      ...payload,
      from_user: req.currentUser._id
    });

    const populated = await OperationalMessage.findById(message._id)
      .populate("from_user", "nombre rol")
      .populate("to_user", "nombre rol");

    const mapped = mapMessageResponse(populated, req.currentUser._id);

    if (req.io) {
      req.io.emit("operational-message", mapped);
    }

    sendSuccess(res, mapped, { event_emitted: true }, 201);
  } catch (error) {
    next(error);
  }
}

async function getMessages(req, res, next) {
  try {
    const limit = normalizeLimit(req.query.limit);
    const page = normalizePage(req.query.page);
    const sortDirection = normalizeSortDirection(req.query.sort);
    const skip = (page - 1) * limit;
    const query = {};
    const userId = req.currentUser._id;

    if (req.currentUser.rol === "admin") {
      if (req.query.to_role) {
        query.to_role = String(req.query.to_role).trim();
      }
    } else {
      query.$or = [
        { to_role: req.currentUser.rol },
        { to_user: userId },
        { from_user: userId }
      ];
    }

    // Filtrar solo no leídos si se solicita
    if (req.query.unread === "true") {
      query.read_by = { $ne: userId };
    }

    const [messages, total] = await Promise.all([
      OperationalMessage.find(query)
        .populate("from_user", "nombre rol")
        .populate("to_user", "nombre rol")
        .sort({ createdAt: sortDirection })
        .skip(skip)
        .limit(limit),
      OperationalMessage.countDocuments(query)
    ]);

    const mappedMessages = messages.map(m => mapMessageResponse(m, userId));

    sendSuccess(res, mappedMessages, {
      count: mappedMessages.length,
      total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (error) {
    next(error);
  }
}

async function markMessageAsRead(req, res, next) {
  try {
    validateObjectId(req.params.id, "message id");
    const userId = req.currentUser._id;
    const message = await OperationalMessage.findById(req.params.id);

    if (!message) {
      throw createHttpError("Mensaje no encontrado", 404);
    }

    const alreadyRead = message.read_by.some((id) => String(id) === String(userId));
    if (!alreadyRead) {
      message.read_by.push(userId);
      await message.save();
    }

    const populated = await OperationalMessage.findById(message._id)
      .populate("from_user", "nombre rol")
      .populate("to_user", "nombre rol");

    sendSuccess(res, mapMessageResponse(populated, userId));
  } catch (error) {
    next(error);
  }
}

async function markAllMessagesAsRead(req, res, next) {
  try {
    const userId = req.currentUser._id;
    const userRole = req.currentUser.rol;

    // Buscamos mensajes dirigidos al usuario o a su rol que no hayan sido leídos
    const query = {
      $or: [
        { to_user: userId },
        { to_role: userRole }
      ],
      read_by: { $ne: userId }
    };

    const result = await OperationalMessage.updateMany(
      query,
      { $addToSet: { read_by: userId } }
    );

    sendSuccess(res, {
      success: true,
      message: "Todos los mensajes recibidos han sido marcados como leídos",
      modified_count: result.modifiedCount || 0
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createMessage,
  getMessages,
  markMessageAsRead,
  markAllMessagesAsRead
};
