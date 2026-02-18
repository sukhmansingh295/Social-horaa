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

  // player1 will create offer
  player1.emit("matched", { initiator: true });
  player2.emit("matched", { initiator: false });
}

}

io.on("connection", (socket) => {

  console.log("User connected:", socket.id);

  waitingQueue.push(socket);
  tryMatch();

  socket.on("signal", (data) => {
    socket.partner?.emit("signal", data);
  });

  // 🔥 NEXT STRANGER LOGIC
  socket.on("next-stranger", () => {

    // Remove from queue if waiting
    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);

    // Notify current partner
    if (socket.partner) {
      socket.partner.emit("partner-disconnected");
      socket.partner.partner = null;
      socket.partner = null;
    }

    // Put back in queue
    waitingQueue.push(socket);
    tryMatch();
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);

    if (socket.partner) {
      socket.partner.emit("partner-disconnected");
      socket.partner.partner = null;
    }
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Social Horaa running on port ${PORT}`);
});

