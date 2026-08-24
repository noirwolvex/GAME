import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "GAME",
    version: "0.1.0",
  });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log(`[GAME] player connected: ${socket.id}`);

  socket.on("disconnect", (reason) => {
    console.log(`[GAME] player disconnected: ${socket.id} (${reason})`);
  });
});

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => {
  console.log(`[GAME] server listening on http://localhost:${port}`);
});
