const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
require("dotenv").config();
require("./database/db");

const trafficRoutes = require("./routes/trafficRoutes");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }  // Puedes poner tu frontend aquí en producción
});

// Middleware
app.use(cors());
app.use(express.json());

// Pasar io a las rutas
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Rutas
app.use("/api/traffic", trafficRoutes);

// Socket.io conexión
io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);

  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));