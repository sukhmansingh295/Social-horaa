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

/* ---------------- QUIZ QUESTIONS ---------------- */

const quizQuestions = [
  {
    question: "What is the capital of Japan?",
    options: ["Tokyo", "Seoul", "Beijing", "Bangkok"],
    answer: 0
  },
  {
    question: "2 + 2 = ?",
    options: ["3", "4", "5", "6"],
    answer: 1
  },
  {
    question: "Which planet is Red?",
    options: ["Earth", "Mars", "Venus", "Jupiter"],
    answer: 1
  },
  {
    question: "HTML stands for?",
    options: [
      "Hyper Text Markup Language",
      "High Transfer Machine Language",
      "Hyper Tool Multi Language",
      "None"
    ],
    answer: 0
  }
];

/* ---------------- MATCHMAKING ---------------- */



let waitingQueue = [];

function tryMatch() {

  if (waitingQueue.length >= 2) {

    const player1 = waitingQueue.shift();
    const player2 = waitingQueue.shift();

    player1.partner = player2;
    player2.partner = player1;

      player1.score = 0;
      player2.score = 0;

    player1.emit("matched", { initiator: true });
    player2.emit("matched", { initiator: false });

    startQuiz(player1, player2);
  }
}

/* ---------------- QUIZ SYSTEM ---------------- */

function startQuiz(p1, p2) {

  let questionIndex = 0;

  function sendQuestion() {

    if (!p1.connected || !p2.connected) return;

    if (questionIndex >= quizQuestions.length) {

      p1.emit("quiz-end", { score: p1.score });
      p2.emit("quiz-end", { score: p2.score });

      return;
    }

    const question = quizQuestions[questionIndex];

    p1.emit("quiz-question", question);
    p2.emit("quiz-question", question);

    let answered1 = false;
    let answered2 = false;

    p1.once("quiz-answer", (index) => {
      if (index === question.answer) p1.score++;
      answered1 = true;
    });

    p2.once("quiz-answer", (index) => {
      if (index === question.answer) p2.score++;
      answered2 = true;
    });

    setTimeout(() => {

      p1.emit("quiz-score", { score: p1.score });
      p2.emit("quiz-score", { score: p2.score });

      questionIndex++;
      sendQuestion();

    }, 10000);
  }

  sendQuestion();
}

/* ---------------- SOCKET EVENTS ---------------- */

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
