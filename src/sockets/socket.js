const { Server } = require("socket.io");

function initSocket(server){
  const io = new Server(server, {
    cors: { origin: "*" }
  });

  io.on("connection", socket => {
    console.log("Cliente conectado:", socket.id);

    socket.on("disconnect", () => {
      console.log("Cliente desconectado");
    });
  });

  return io;
}

module.exports = initSocket;
