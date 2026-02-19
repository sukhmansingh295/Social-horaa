const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.static("public"));

const server = http.createServer(app);
const io = socketio(server, {
  cors: { origin: "*" }
});

let waitingQueue = [];

function tryMatch() {
  if (waitingQueue.length >= 2) {
    const player1 = waitingQueue.shift();
    const player2 = waitingQueue.shift();

    player1.partner = player2;
    player2.partner = player1;

    player1.emit("matched", { initiator: true });
    player2.emit("matched", { initiator: false });
  }
}

io.on("connection", (socket) => {

  waitingQueue.push(socket);
  tryMatch();

  socket.on("signal", (data) => {
    if (socket.partner) {
      socket.partner.emit("signal", data);
    }
  });

  socket.on("next-stranger", () => {

    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);

    if (socket.partner) {
      socket.partner.emit("partner-disconnected");
      socket.partner.partner = null;
      socket.partner = null;
    }

    waitingQueue.push(socket);
    tryMatch();
  });

  socket.on("disconnect", () => {

    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);

    if (socket.partner) {
      socket.partner.emit("partner-disconnected");
      socket.partner.partner = null;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
