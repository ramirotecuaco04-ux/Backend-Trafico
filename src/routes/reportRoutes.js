const express = require("express");
const {
  createReport,
  getReportById,
  getReports,
  updateReport
} = require("../controllers/reportController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireRole("admin", "vialidad", "patrulla"), getReports);
router.get("/:id", requireRole("admin", "vialidad", "patrulla"), getReportById);
router.post("/", requireRole("admin", "vialidad", "patrulla"), createReport);
router.patch("/:id", requireRole("admin"), updateReport);

module.exports = router;
