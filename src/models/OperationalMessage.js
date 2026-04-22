const mongoose = require("mongoose");

const operationalMessageSchema = new mongoose.Schema({
  from_user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  to_role: {
    type: String,
    enum: ["admin", "vialidad", "ambulancia"],
    default: null
  },
  to_user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  subject: { type: String, trim: true, default: "" },
  body: { type: String, required: true, trim: true },
  priority: {
    type: String,
    enum: ["baja", "media", "alta", "critica"],
    default: "media"
  },
  read_by: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }]
}, { timestamps: true });

module.exports = mongoose.model("OperationalMessage", operationalMessageSchema);
