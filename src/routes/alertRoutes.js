const express = require("express");
const {
  createAlert,
  getAlertById,
  getAlerts,
  updateAlert,
  markAllAsRead,
  dismissAlert
} = require("../controllers/alertController");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Rutas protegidas por autenticación y roles
router.get("/", requireAuth, requireRole("admin", "vialidad", "ambulancia"), getAlerts);
// Permitimos que ambulancia también pueda limpiar sus notificaciones
router.patch("/read-all", requireAuth, requireRole("admin", "vialidad", "ambulancia"), markAllAsRead);
router.get("/:id", requireAuth, requireRole("admin", "vialidad", "ambulancia"), getAlertById);
router.post("/", requireAuth, requireRole("admin", "vialidad", "ambulancia"), createAlert);

// Descarte de alerta (Persistente)
router.patch("/:id/dismiss", requireAuth, requireRole("admin", "vialidad"), dismissAlert);

// Edición general de la alerta (solo admin)
router.patch("/:id", requireAuth, requireRole("admin"), updateAlert);

module.exports = router;
