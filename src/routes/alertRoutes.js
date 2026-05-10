const express = require("express");
const {
  createAlert,
  getAlertById,
  getAlerts,
  updateAlert,
  markAllAsRead
} = require("../controllers/alertController");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Rutas protegidas por autenticación y roles
router.get("/", requireAuth, requireRole("admin", "vialidad", "ambulancia"), getAlerts);
router.patch("/read-all", requireAuth, requireRole("admin", "vialidad"), markAllAsRead);
router.get("/:id", requireAuth, requireRole("admin", "vialidad", "ambulancia"), getAlertById);
router.post("/", requireAuth, requireRole("admin", "vialidad", "ambulancia"), createAlert);
router.patch("/:id", requireAuth, requireRole("admin"), updateAlert);

module.exports = router;
