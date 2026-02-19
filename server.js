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

let waitingUser = null;

io.on("connection", (socket) => {

  console.log("User connected:", socket.id);

  socket.partner = null;

  function tryMatch() {
    if (waitingUser && waitingUser !== socket) {

      socket.partner = waitingUser;
      waitingUser.partner = socket;

      socket.emit("matched");
      waitingUser.emit("matched");

      waitingUser = null;

    } else {
      waitingUser = socket;
    }
  }

  tryMatch();

  socket.on("next-stranger", () => {

    if (socket.partner) {
      socket.partner.emit("partner-disconnected");
      socket.partner.partner = null;
      socket.partner = null;
    }

    tryMatch();
  });

  socket.on("signal", (data) => {
    socket.partner?.emit("signal", data);
  });

  socket.on("disconnect", () => {

    if (waitingUser === socket) {
      waitingUser = null;
    }

    if (socket.partner) {
      socket.partner.emit("partner-disconnected");
      socket.partner.partner = null;
    }

  });

});
l

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Social Horaa running on port ${PORT}`);
});

