const express = require("express");
const {
  createAlert,
  getAlertById,
  getAlerts,
  updateAlert
} = require("../controllers/alertController");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireRole("admin", "vialidad", "ambulancia"), getAlerts);
router.get("/:id", requireRole("admin", "vialidad", "ambulancia"), getAlertById);
router.post("/", requireRole("admin", "vialidad"), createAlert);
router.patch("/:id", requireRole("admin"), updateAlert);

module.exports = router;
