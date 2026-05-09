const express = require("express");
const { getAllTrafficLights } = require("../controllers/trafficLightController");
const {
  activateSemaphoreOverride,
  getRealtimeSemaphoreState,
  getSemaphoreOverrides,
  releaseSemaphoreOverride
} = require("../controllers/semaphoreController");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

/**
 * @route GET /api/semaphores
 * @desc Obtener toda la infraestructura de semáforos
 * @access admin, vialidad, ambulancia
 */
router.get("/", requireAuth, requireRole("admin", "vialidad", "ambulancia"), (req, res, next) => {
  // Log solicitado para confirmación de rol (usando req.currentUser.rol según el middleware del proyecto)
  console.log('📡 Petición de semáforos recibida del rol: ' + req.currentUser.rol);
  getAllTrafficLights(req, res, next);
});

/**
 * @route GET /api/semaphores/state
 * @desc Obtener estado dinámico en tiempo real
 */
router.get("/state", requireAuth, requireRole("admin", "ambulancia"), getRealtimeSemaphoreState);

/**
 * @route POST /api/semaphores/overrides
 * @desc Activar prioridad (Paso de emergencia)
 * @access admin, ambulancia
 */
router.post("/overrides", requireAuth, requireRole("admin", "ambulancia"), activateSemaphoreOverride);

/**
 * @route PATCH /api/semaphores/overrides/:id/release
 * @desc Liberar prioridad
 */
router.patch("/overrides/:id/release", requireAuth, requireRole("admin", "ambulancia"), releaseSemaphoreOverride);

module.exports = router;
