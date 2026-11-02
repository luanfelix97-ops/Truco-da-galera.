const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));
app.get("/health", (_, res) => res.json({ ok: true }));

const rooms = new Map();
const SUITS = ["♠", "♥", "♦", "♣"];
const VALUES = ["4","5","6","7","Q","J","K","A","2","3"];
const BASE = {"4":1,"5":2,"6":3,"7":4,"Q":5,"J":6,"K":7,"A":8,"2":9,"3":10};
const nextValue = {"4":"5","5":"6","6":"7","7":"Q","Q":"J","J":"K","K":"A","A":"2","2":"3","3":"4"};

function makeDeck() {
  return VALUES.flatMap(v => SUITS.map(s => ({v,s,id:v+s})));
}
function shuffle(a) {
  for (let i=a.length-1;i>0;i--) { const j=crypto.randomInt(i+1); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function strength(card, manilha) {
  if (card.v === manilha) return 20 + SUITS.indexOf(card.s); // ♠ > ♥ > ♣ > ♦? corrected below
  return BASE[card.v];
}
function publicState(room) {
  return {
    code: room.code, names: room.players.map(p=>p.name),
    ready: room.players.length === 2,
    score: room.score, handNo: room.handNo, points: room.points,
    vira: room.vira, manilha: room.manilha,
    table: room.table, turn: room.turn,
    trickWins: room.trickWins, status: room.status,
    bet: room.bet, pendingTruco: room.pendingTruco,
    message: room.message, handResult: room.handResult
  };
}
function sendRoom(room) {
  const state = publicState(room);
  room.players.forEach((p,i) => {
    if (p.socketId) io.to(p.socketId).emit("state", {...state, me:i, hand:room.hands[i] || []});
  });
}
function startHand(room) {
  const deck = shuffle(makeDeck());
  room.hands = [deck.slice(0,3), deck.slice(3,6)];
  room.vira = deck[6];
  room.manilha = nextValue[room.vira.v];
  room.table = [];
  room.trickWins = [0,0];
  room.turn = room.handNo % 2 === 1 ? 0 : 1;
  room.bet = 1;
  room.pendingTruco = null;
  room.status = "playing";
  room.handResult = null;
  room.message = "Mão iniciada. Boa sorte!";
}
function endHand(room, winner, reason) {
  room.score[winner] += room.bet;
  room.status = "hand_over";
  room.handResult = winner;
  room.message = `${room.players[winner].name} venceu a mão (${reason}) e ganhou ${room.bet} ponto(s).`;
}
function evaluateTrick(room) {
  const [a,b] = room.table.slice(-2);
  if (!a || !b) return;
  const sa = strength(a.card, room.manilha), sb = strength(b.card, room.manilha);
  if (sa > sb) room.trickWins[a.player]++;
  else if (sb > sa) room.trickWins[b.player]++;
  else { room.trickWins[0] += 0.5; room.trickWins[1] += 0.5; }
  if (room.trickWins[0] >= 1.5) return endHand(room,0,"duas vazas");
  if (room.trickWins[1] >= 1.5) return endHand(room,1,"duas vazas");
  if (room.table.length >= 6) {
    if (room.trickWins[0] > room.trickWins[1]) return endHand(room,0,"melhor resultado nas três vazas");
    if (room.trickWins[1] > room.trickWins[0]) return endHand(room,1,"melhor resultado nas três vazas");
    return endHand(room, room.handNo % 2 === 1 ? 0 : 1, "desempate da mão");
  }
  room.turn = room.table[room.table.length-1].player === 0 ? 1 : 0;
}
function validRoomCode() {
  let code; do { code = String(crypto.randomInt(100000,999999)); } while(rooms.has(code)); return code;
}
io.on("connection", socket => {
  socket.on("createRoom", ({name}, cb) => {
    const code = validRoomCode();
    const room = {code, players:[{socketId:socket.id,name:(name||"Jogador 1").slice(0,18)}],
      score:[0,0], handNo:1, points:0, hands:[[],[]], vira:null, manilha:null,
      table:[], turn:0, trickWins:[0,0], status:"waiting", bet:1,
      pendingTruco:null, message:"Aguardando o segundo jogador...", handResult:null};
    rooms.set(code,room); socket.join(code); socket.data.room=code; socket.data.player=0;
    cb({ok:true,code}); sendRoom(room);
  });
  socket.on("joinRoom", ({code,name}, cb) => {
    const room=rooms.get(String(code||"").trim());
    if (!room) return cb({ok:false,error:"Sala não encontrada."});
    if (room.players.length>=2) return cb({ok:false,error:"Essa sala já está cheia."});
    room.players.push({socketId:socket.id,name:(name||"Jogador 2").slice(0,18)});
    socket.join(room.code); socket.data.room=room.code; socket.data.player=1;
    startHand(room); cb({ok:true,code:room.code}); sendRoom(room);
  });
  socket.on("playCard", ({index}, cb) => {
    const room=rooms.get(socket.data.room), player=socket.data.player;
    if (!room || room.status!=="playing" || room.turn!==player || room.pendingTruco!==null) return cb?.({ok:false,error:"Não é sua vez."});
    const card=room.hands[player][index];
    if (!card) return cb?.({ok:false,error:"Carta inválida."});
    room.hands[player].splice(index,1);
    room.table.push({player,card});
    room.message=`${room.players[player].name} jogou uma carta.`;
    if (room.table.length%2===0) evaluateTrick(room);
    else room.turn=1-player;
    cb?.({ok:true}); sendRoom(room);
  });
  socket.on("callTruco", cb => {
    const room=rooms.get(socket.data.room), player=socket.data.player;
    if (!room || room.status!=="playing" || room.pendingTruco!==null || room.bet>=12) return cb?.({ok:false,error:"Não é possível pedir truco agora."});
    room.pendingTruco={by:player, value:room.bet===1?3:room.bet===3?6:room.bet===6?9:12};
    room.message=`${room.players[player].name} pediu TRUCO!`;
    sendRoom(room); cb?.({ok:true});
  });
  socket.on("respondTruco", ({accept}, cb) => {
    const room=rooms.get(socket.data.room), player=socket.data.player;
    if (!room || !room.pendingTruco || room.pendingTruco.by===player) return cb?.({ok:false,error:"Não há pedido para você responder."});
    if (accept) { room.bet=room.pendingTruco.value; room.message=`Truco aceito! Vale ${room.bet}.`; room.pendingTruco=null; }
    else { endHand(room,room.pendingTruco.by,"truco recusado"); room.pendingTruco=null; }
    sendRoom(room); cb?.({ok:true});
  });
  socket.on("nextHand", cb => {
    const room=rooms.get(socket.data.room);
    if (!room || room.status!=="hand_over" || room.players.length!==2) return cb?.({ok:false,error:"A mão ainda não terminou."});
    if (room.score[0]>=12 || room.score[1]>=12) {
      room.status="match_over"; room.message=`${room.players[room.score[0]>=12?0:1].name} venceu a partida!`;
    } else { room.handNo++; startHand(room); }
    sendRoom(room); cb?.({ok:true});
  });
  socket.on("disconnect", () => {
    const code=socket.data.room, room=rooms.get(code);
    if (room) { room.message="Um jogador desconectou. A sala será encerrada."; room.status="closed"; sendRoom(room); rooms.delete(code); }
  });
});
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log("Truco da Galera rodando na porta "+PORT));
