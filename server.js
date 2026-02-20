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

  p1.ready = false;
  p2.ready = false;

  let questions;

  try {
    const response = await axios.get(
      "https://opentdb.com/api.php?amount=7&type=multiple"
    );
    questions = response.data.results;
  } catch (err) {
    console.log("Quiz API failed. Using fallback.");
    questions = fallbackQuestions;
  }

  p1.score = 0;
  p2.score = 0;

  let current = 0;

  function nextQuestion() {

    if (!p1.partner || !p2.partner) return finishQuiz();
    if (!p1.connected || !p2.connected) return finishQuiz();

    if (current >= questions.length) {
      finishQuiz();
      return;
    }

    const q = questions[current];

    const options = [...q.incorrect_answers, q.correct_answer];

    // Proper shuffle
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    const correctIndex = options.indexOf(q.correct_answer);

    const QUESTION_TIME = 20000;
    const REVEAL_DELAY = 3000;
    const endTime = Date.now() + QUESTION_TIME;

    let answers = {};

    const payload = {
      question: decodeHTML(q.question),
      options: options.map(decodeHTML),
      endTime
    };

    p1.emit("quiz-question", payload);
    p2.emit("quiz-question", payload);

    function handleAnswer(player, index) {

      if (!player.partner) return;
      if (Date.now() > endTime) return;
      if (answers[player.id] !== undefined) return;

      answers[player.id] = index;

      player.partner.emit("opponent-answered");

      if (index === correctIndex) {
        player.score += 5;
      }
    }

    p1.once("quiz-answer", (i) => handleAnswer(p1, i));
    p2.once("quiz-answer", (i) => handleAnswer(p2, i));

    setTimeout(() => {

      p1.removeAllListeners("quiz-answer");
      p2.removeAllListeners("quiz-answer");

      p1.emit("quiz-result", {
        correctIndex,
        score: p1.score
      });

      p2.emit("quiz-result", {
        correctIndex,
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

    if (p1.score > p2.score) winner = p1.id;
    else if (p2.score > p1.score) winner = p2.id;

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