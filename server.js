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
  const TOTAL_QUESTIONS = quizQuestions.length;

  function sendQuestion() {

    if (!p1.connected || !p2.connected) return;

    if (questionIndex >= TOTAL_QUESTIONS) {
      finishQuiz();
      return;
    }

    const question = quizQuestions[questionIndex];

    let answers = {
      [p1.id]: null,
      [p2.id]: null
    };

    const payload = {
      id: questionIndex,
      question: question.question,
      options: question.options,
      duration: 10
    };

    p1.emit("quiz-question", payload);
    p2.emit("quiz-question", payload);

    function handleAnswer(player, index) {

      if (answers[player.id] !== null) return;

      answers[player.id] = index;

      if (index === question.answer) {
        player.score += 5;
      }

      checkIfBothAnswered();
    }

    function checkIfBothAnswered() {
      if (
        answers[p1.id] !== null &&
        answers[p2.id] !== null
      ) {
        closeQuestion();
      }
    }

    p1.once("quiz-answer", (index) => handleAnswer(p1, index));
    p2.once("quiz-answer", (index) => handleAnswer(p2, index));

    function closeQuestion() {

      p1.removeAllListeners("quiz-answer");
      p2.removeAllListeners("quiz-answer");

      p1.emit("quiz-result", {
        correctAnswer: question.answer,
        score: p1.score
      });

      p2.emit("quiz-result", {
        correctAnswer: question.answer,
        score: p2.score
      });

      questionIndex++;

      setTimeout(sendQuestion, 3000);
    }

    setTimeout(closeQuestion, 10000);
  }

  function finishQuiz() {

    let winner = null;

    if (p1.score > p2.score) winner = p1.id;
    else if (p2.score > p1.score) winner = p2.id;

    p1.emit("quiz-end", {
      yourScore: p1.score,
      opponentScore: p2.score,
      winner: winner
    });

    p2.emit("quiz-end", {
      yourScore: p2.score,
      opponentScore: p1.score,
      winner: winner
    });
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
