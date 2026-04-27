const express = require("express");
const {
  createReport,
  getReportById,
  getReports,
  updateReport
} = require("../controllers/reportController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

// Ambulancia NO tiene acceso a reportes. Solo Admin y Vialidad.
router.get("/", requireRole("admin", "vialidad"), getReports);
router.get("/:id", requireRole("admin", "vialidad"), getReportById);
router.post("/", requireRole("admin", "vialidad"), createReport);
router.patch("/:id", requireRole("admin"), updateReport);

module.exports = router;
