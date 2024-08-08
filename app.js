const express = require("express");
const socket = require("socket.io");
const http = require("http");
const { Chess } = require("chess.js");
const path = require("path");
const { title } = require("process");
const rooms = {};

//Create Express app instance
const app = express();

// SO here we are creating a link between the http server and the express server
const server = http.createServer(app);
//Socket have give all its functionalities to the io
const io = socket(server);

// Handle favicon.ico requests to prevent 404 errors
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

//Waiting screen procedure
let gameplayer = 0;

const chess = new Chess();
let players = {};
let currentPlayer = "w";

app.set("view engine", "ejs"); //initializing ejs
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public"))); // we may now use static things like css

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/front.html");
});
app.get("/game", (req, res) => {
  res.render("index", { title: "ChessGame" });
});
//WHen a new user will connect to the game
io.on("connection", function (uniquesocket) {
  console.log("a new user connected :", uniquesocket.id);
  //FOR VIDEO STREAMING
  uniquesocket.on("signal", (data) => {
    io.to(data.to).emit("signal", {
      from: uniquesocket.id,
      signal: data.signal,
    });
  });

  uniquesocket.on("callRequest", (data) => {
    io.to(data.to).emit("callRequest", { from: uniquesocket.id });
  });
  uniquesocket.on("callResponse", (data) => {
    io.to(data.to).emit("callResponse", {
      from: uniquesocket.id,
      accepted: data.accepted,
    });
  });

  //Here this for waiting screen
  uniquesocket.on("startGame", () => {
    // Increment the player count
    gameplayer++;

    // If there are two players, start the game
    if (gameplayer % 2 === 0) {
      // Emit the "gameStarted" event to all connected clients
      io.emit("gameStarted");
    }
  });

  uniquesocket.on("joinRoom", (room) => {
    uniquesocket.join(room);
    if (!rooms[room]) {
      rooms[room] = [];
    }
    rooms[room].push(uniquesocket.id);
    io.to(room).emit("userList", rooms[room]);

    if (rooms[room].length === 2) {
      const [player1, player2] = rooms[room];
      io.to(player1).emit("paired", { opponentId: player2 });
      io.to(player2).emit("paired", { opponentId: player1 });
    }
  });
  //waiting screen code ends above

  if (!players.white) {
    players.white = uniquesocket.id;
    uniquesocket.emit("playerRole", "w");
  } else if (!players.black) {
    players.black = uniquesocket.id;
    uniquesocket.emit("playerRole", "b");
  } else {
    uniquesocket.emit("spectatorRole");
  }

  //in order to show a message on disconnection
  //now if a user will disconnect then the id of them will be removed
  uniquesocket.on("disconnect", function () {
    console.log("Player disconnected");
    gameplayer--;
    for (const room in rooms) {
      rooms[room] = rooms[room].filter((id) => id !== uniquesocket.id);
      io.to(room).emit("userList", rooms[room]);
    }
    if (uniquesocket.id == players.white) {
      delete players.white;
    } else if (uniquesocket.id == players.black) {
      delete players.black;
    }
  });

  //GOING FOR THE MOVE FUNCTIONALITY
  uniquesocket.on("move", function (move) {
    try {
      if (chess.turn() === "w" && uniquesocket.id != players.white) return;
      if (chess.turn() === "b" && uniquesocket.id != players.black) return;
      const result = chess.move(move);
      if (result) {
        currentPlayer = chess.turn();
        io.emit("move", move);
        io.emit("boardState", chess.fen());

        // Check if the game is over
        if (chess.in_checkmate()) {
          io.emit(
            "gameOver",
            "Checkmate! " +
              (chess.turn() === "w" ? "Black" : "White") +
              " wins!"
          );
        } else if (chess.in_stalemate()) {
          io.emit("gameOver", "Stalemate! It's a draw!");
        } else if (chess.in_threefold_repetition()) {
          io.emit("gameOver", "Threefold repetition! It's a draw!");
        } else if (chess.insufficient_material()) {
          io.emit("gameOver", "Insufficient material! It's a draw!");
        }
      } else {
        console.log("Invalid move:", move);
        uniquesocket.emit("invalidMove", move);
      }
    } catch (err) {
      console.log(err);
      uniquesocket.emit("Invalid move:", move);
    }
  });

  //to catch and respond from the message emitted form the font end
  //uniquesocket.on("hello", function () {
  //console.log("Hello mil gya mere bhai ");

  //now if backend want to send data to all the frontent
  //io.emit("good morning");
  //});
});

server.listen(3000, function () {
  console.log("server is running on port 3000");
});
