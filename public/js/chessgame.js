//Socket io setup
const socket = io();
const chess = new Chess();
const boardElement = document.querySelector(".chessboard");

//for video streaming
//const SimplePeer = require("simple-peer");

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;

//here you have to design the board
const renderBoard = () => {
  const board = chess.board();
  boardElement.innerHTML = "";

  board.forEach((row, rowindex) => {
    row.forEach((square, squareindex) => {
      console.log(square);
      const squareElement = document.createElement("div");
      squareElement.classList.add(
        "square",
        (rowindex + squareindex) % 2 === 0 ? "light" : "dark" //for board pattern
      );
      squareElement.dataset.col = squareindex;
      squareElement.dataset.row = rowindex;

      //all the square which are not null must have a peice
      if (square) {
        const pieceElement = document.createElement("div");
        pieceElement.classList.add(
          "piece",
          square.color === "w" ? "white" : "black"
        );
        pieceElement.innerText = getPieceUnicode(square);
        pieceElement.draggable = playerRole === square.color;

        pieceElement.addEventListener("dragstart", (e) => {
          if (pieceElement.draggable) {
            draggedPiece = pieceElement;
            sourceSquare = { row: rowindex, col: squareindex };
            e.dataTransfer.setData("text/plain", "");
          }
        });
        pieceElement.addEventListener("dragend", (e) => {
          draggedPiece = null;
          sourceSquare = null;
        });

        //attaching square to piece
        squareElement.appendChild(pieceElement);
      }

      //if someone tries to drag unusual peice
      squareElement.addEventListener("dragover", function (e) {
        e.preventDefault();
      });

      squareElement.addEventListener("drop", function (e) {
        e.preventDefault();
        if (draggedPiece) {
          const targetSource = {
            row: parseInt(squareElement.dataset.row),
            col: parseInt(squareElement.dataset.col),
          };

          handleMove(sourceSquare, targetSource);
        }
      });
      boardElement.appendChild(squareElement);
    });
  });

  if (playerRole === "b") {
    boardElement.classList.add("flipped");
  } else {
    boardElement.classList.remove("flipped");
  }
};

const handleMove = (source, target) => {
  const move = {
    from: `${String.fromCharCode(97 + source.col)}${8 - source.row}`,
    to: `${String.fromCharCode(97 + target.col)}${8 - target.row}`,
    promotion: "q",
  };

  socket.emit("move", move);
};

const getPieceUnicode = (piece) => {
  const unicodePieces = {
    p: "♙️",
    r: "♜",
    n: "♞",
    b: "♝",
    q: "♛",
    k: "♚",
    P: "♙️",
    R: "♖",
    N: "♘",
    B: "♗",
    Q: "♕",
    K: "♔",
  };
  return unicodePieces[piece.type] || "";
};

socket.on("playerRole", function (role) {
  playerRole = role;
  renderBoard();
});
socket.on("spectatorRole", function (role) {
  playerRole = null;
  renderBoard();
});
socket.on("boardState", function (fen) {
  if (
    typeof fen === "string" &&
    fen.match(
      /^([rnbqkpRNBQKP1-8]{1,8}\/){7}([rnbqkpRNBQKP1-8]{1,8})( [wb]{1} ){1}([KQkq]{1,4}){1}(-){1}([a-h1-8]{1,2}){1}$/
    )
  ) {
    chess.load(fen);
    renderBoard();
  } else {
    console.error("Invalid FEN string:", fen);
  }
});

socket.on("move", function (move) {
  console.log("Board state before move:", chess.board());
  console.log("Move:", move);
  if (chess.move(move)) {
    renderBoard();
  } else {
    console.error("Invalid move:", move);
  }
});

// Retrieve the username from local storage
const usernamevalue = localStorage.getItem("username");
console.log("usernamevalue");

// If the username is not null or empty, pass it to the EJS template
if (usernamevalue) {
  document.getElementById(
    "username-container"
  ).innerHTML = `<h1 style="color:white ;font-size: 2rem; line-height: 1;">COME ON <span class="inner-word text-violet-800">${usernamevalue}</span>,LET'S PLAY CHESS!</h1>`;
}

// VIDEO STREAMING
let localStream;
let peer;
let opponentId;
function startVideo() {
  navigator.mediaDevices
    .getUserMedia({ video: true, audio: true })
    .then((stream) => {
      const localVideo = document.getElementById("local-video");
      localVideo.srcObject = stream;
      localStream = stream;

      socket.emit("joinRoom", "chessRoom");
    })
    .catch((err) => console.error("Error accessing media devices.", err));

  // Handle receiving the opponent's ID
  socket.on("paired", (data) => {
    opponentId = data.opponentId;
    console.log("Paired with opponent:", opponentId);
  });

  socket.on("signal", (data) => {
    if (peer) {
      console.log("Signal received:", data.signal);
      peer.signal(data.signal);
    }
  });
}

const callButton = document.getElementById("call-button");
callButton.addEventListener("click", () => {
  const callNotification = document.getElementById("callNotification");
  callNotification.classList.remove("hidden");

  if (opponentId) {
    console.log("Sending call request to:", opponentId);

    socket.emit("callRequest", { to: opponentId });
  } else {
    alert("Opponent not found.");
  }
});

socket.on("callRequest", (data) => {
  const callNotification = document.getElementById("callNotification");
  console.log(callNotification);
  callNotification.style.display = "block";

  document.getElementById("acceptCall").onclick = () => {
    callNotification.style.display = "none";
    socket.emit("callResponse", { to: data.from, accepted: true });
    startRemoteVideo(data.from, false, null);
  };

  document.getElementById("declineCall").onclick = () => {
    callNotification.style.display = "none";
    socket.emit("callResponse", { to: data.from, accepted: false });
  };
});

socket.on("callResponse", (data) => {
  if (data.accepted) {
    console.log("Call accepted by:", data.from);
    startRemoteVideo(data.from, true, null);
  } else {
    alert("Opponent declined the call");
  }
});

function startRemoteVideo(opponentId, initiator, signal) {
  console.log("Starting video call with:", opponentId, "Initiator:", initiator);
  peer = new SimplePeer({
    initiator: initiator,
    stream: localStream,
    trickle: false,
  });

  peer.on("signal", (data) => {
    console.log("Sending signal to:", opponentId, data);
    socket.emit("signal", {
      signal: data,
      to: opponentId,
    });
  });
  peer.on("connect", () => {
    console.log("Peer connection established");
  });
  peer.on("stream", (stream) => {
    try {
      console.log("Received remote stream:", stream);
      const remoteVideo = document.getElementById("remote-video");
      if (remoteVideo) {
        remoteVideo.srcObject = stream;
        remoteVideo.play();
      } else {
        console.error("Remote video element not found.");
      }
    } catch (error) {
      console.error("Error handling remote stream:", error);
    }
  });
}
// Add mute button functionalities
document.getElementById("muteAudio").addEventListener("click", () => {
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  document.getElementById("muteAudio").textContent = audioTrack.enabled
    ? "Mute Audio"
    : "Unmute Audio";
});

document.getElementById("muteVideo").addEventListener("click", () => {
  const videoTrack = localStream.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;
  document.getElementById("muteVideo").textContent = videoTrack.enabled
    ? "Video Off"
    : "Video On";
});

// ALERT MESSAGE ON CHECKMATE
socket.on("gameOver", function (message) {
  alert(message);
});
//running render board
renderBoard();
