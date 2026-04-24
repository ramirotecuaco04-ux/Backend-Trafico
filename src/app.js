const express = require("express");
const cors = require("cors");

const trafficRoutes = require("./routes/trafficRoutes");
const reportRoutes = require("./routes/reportRoutes");
const alertRoutes = require("./routes/alertRoutes");
const userRoutes = require("./routes/userRoutes");
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const messageRoutes = require("./routes/messageRoutes");
const semaphoreRoutes = require("./routes/semaphoreRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const { requireAuth } = require("./middleware/auth");

function createApp() {
  const app = express();
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
    : "*";

  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  app.use((req, res, next) => {
    req.io = req.app.get("io");
    next();
  });

  app.get("/api/health", (req, res) => {
    res.json({
      success: true,
      data: {
        status: "ok",
        service: "trafico_backend",
        realtime: Boolean(req.app.get("io"))
      }
    });
  });

  app.use("/api/traffic", trafficRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/dashboard", requireAuth, dashboardRoutes);
  app.use("/api/reports", requireAuth, reportRoutes);
  app.use("/api/alerts", requireAuth, alertRoutes);
  app.use("/api/users", requireAuth, userRoutes);
  app.use("/api/messages", requireAuth, messageRoutes);
  app.use("/api/semaphores", requireAuth, semaphoreRoutes);
  app.use("/api/uploads", requireAuth, uploadRoutes);

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        message: "Ruta no encontrada",
        status: 404,
        path: req.originalUrl
      }
    });
  });

  app.use((err, req, res, next) => {
    const status = err.status || 500;
    const message = err.message || "Error interno del servidor";

    if (status >= 500) {
      console.error(err);
    }

    res.status(status).json({
      success: false,
      error: {
        message,
        status,
        path: req.originalUrl,
        details: err.details || null
      }
    });
  });

  return app;
}

module.exports = createApp;
