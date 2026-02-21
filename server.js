const express = require("express");
const http = require("http");
const socketio = require("socket.io");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.static("public"));

const server = http.createServer(app);
const io = socketio(server, {
  cors: { origin: "*" }
});

/* ---------------- FALLBACK QUESTIONS ---------------- */

const fallbackQuestions = [
  {
    question: "What is the capital of Japan?",
    incorrect_answers: ["Seoul", "Beijing", "Bangkok"],
    correct_answer: "Tokyo"
  },
  {
    question: "2 + 2 = ?",
    incorrect_answers: ["3", "5", "6"],
    correct_answer: "4"
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
  }
}

/* ---------------- QUIZ SYSTEM ---------------- */

async function startQuiz(p1, p2) {

  if (p1.gameActive || p2.gameActive) return;

  p1.gameActive = true;
  p2.gameActive = true;

  p1.score = 0;
  p2.score = 0;

  const response = await axios.get(
    "https://opentdb.com/api.php?amount=7&type=multiple"
  );

  const questions = response.data.results;
  let current = 0;

  function nextQuestion() {

    if (current >= questions.length) {
      finishQuiz();
      return;
    }

    const q = questions[current];
    const options = [...q.incorrect_answers, q.correct_answer];
    options.sort(() => Math.random() - 0.5);

    const correctIndex = options.indexOf(q.correct_answer);

    const QUESTION_TIME = 20000;
    const REVEAL_DELAY = 3000;

    const startTime = Date.now();
    const endTime = startTime + QUESTION_TIME;

    let answers = {};

    const payload = {
      question: q.question,
      options,
      correctIndex,
      startTime,
      endTime
    };

    p1.emit("quiz-question", payload);
    p2.emit("quiz-question", payload);

    p1.once("quiz-answer", (index) => {
      answers[p1.id] = index;
      if (index === correctIndex) p1.score += 5;
    });

    p2.once("quiz-answer", (index) => {
      answers[p2.id] = index;
      if (index === correctIndex) p2.score += 5;
    });

    setTimeout(() => {

      p1.emit("quiz-result", {
        correctIndex,
        yourAnswer: answers[p1.id] ?? null,
        score: p1.score
      });

      p2.emit("quiz-result", {
        correctIndex,
        yourAnswer: answers[p2.id] ?? null,
        score: p2.score
      });

      current++;
      setTimeout(nextQuestion, REVEAL_DELAY);

    }, QUESTION_TIME);
  }

  function finishQuiz() {

  p1.gameActive = false;
  p2.gameActive = false;

  let winner = null;

  if (p1.score > p2.score) {
    winner = p1.id;
  } else if (p2.score > p1.score) {
    winner = p2.id;
  }

  p1.emit("quiz-end", {
    yourScore: p1.score,
    opponentScore: p2.score,
    winner
  });

  p2.emit("quiz-end", {
    yourScore: p2.score,
    opponentScore: p1.score,
    winner
  });
}

  nextQuestion();
}

/* -------- HTML DECODE -------- */

function decodeHTML(html) {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/* ---------------- SOCKET EVENTS ---------------- */

io.on("connection", (socket) => {

  socket.ready = false;
  socket.gameActive = false;


  socket.on("quiz-cancel", () => {
  socket.ready = false;
  socket.gameActive = false;

  if (socket.partner) {
    socket.partner.ready = false;
    socket.partner.gameActive = false;
    socket.partner.emit("quiz-cancelled");
  }
});

  socket.on("player-ready", () => {

    if (!socket.partner) return;

    socket.ready = true;
    const partner = socket.partner;

    if (partner.ready && !socket.gameActive && !partner.gameActive) {

      socket.emit("both-ready");
      partner.emit("both-ready");

      startQuiz(socket, partner);
    }

  });

  waitingQueue.push(socket);
  tryMatch();

  socket.on("signal", (data) => {
    if (socket.partner) {
      socket.partner.emit("signal", data);
    }
  });

  socket.on("next-stranger", () => {

    socket.ready = false;
    socket.gameActive = false;

    waitingQueue = waitingQueue.filter(s => s.id !== socket.id);

    if (socket.partner) {
      socket.partner.ready = false;
      socket.partner.gameActive = false;

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
      socket.partner.ready = false;
      socket.partner.gameActive = false;

      socket.partner.emit("partner-disconnected");
      socket.partner.partner = null;
    }
  });
});

/* ---------------- START SERVER ---------------- */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});