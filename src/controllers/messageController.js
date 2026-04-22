const OperationalMessage = require("../models/OperationalMessage");
const { createHttpError, sendSuccess } = require("../utils/http");
const {
  normalizeLimit,
  normalizePage,
  normalizeSortDirection,
  normalizeTrimmedString,
  validateObjectId
} = require("../utils/validation");

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

    if (req.io) {
      req.io.emit("operational-message", populated);
    }

    sendSuccess(res, populated, { event_emitted: true }, 201);
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

    if (req.currentUser.rol === "admin") {
      if (req.query.to_role) {
        query.to_role = String(req.query.to_role).trim();
      }
    } else {
      query.$or = [
        { to_role: req.currentUser.rol },
        { to_user: req.currentUser._id },
        { from_user: req.currentUser._id }
      ];
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

    sendSuccess(res, messages, {
      count: messages.length,
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
    const message = await OperationalMessage.findById(req.params.id);

    if (!message) {
      throw createHttpError("Mensaje no encontrado", 404);
    }

    const alreadyRead = message.read_by.some((userId) => String(userId) === String(req.currentUser._id));
    if (!alreadyRead) {
      message.read_by.push(req.currentUser._id);
      await message.save();
    }

    const populated = await OperationalMessage.findById(message._id)
      .populate("from_user", "nombre rol")
      .populate("to_user", "nombre rol");

    sendSuccess(res, populated);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createMessage,
  getMessages,
  markMessageAsRead
};
