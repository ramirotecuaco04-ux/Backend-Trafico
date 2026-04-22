const http = require("http");
require("dotenv").config();
require("./database/db");

const createApp = require("./app");
const initSocket = require("./sockets/socket");

const app = createApp();
const server = http.createServer(app);
const io = initSocket(server);

app.set("io", io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
