import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  DEFAULT_CATEGORIES,
  createRound,
  finishRound,
  startRound,
  submitAnswers,
  type AnswerSet,
  type GameRound,
  type Category,
} from "@game/game-engine";
import { validateWithHybridSources } from "./validation/service";
import { validateArabicGivenName } from "./validation/name-service";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "GAME",
    version: "0.3.0",
  });
});

app.post("/validation/check", async (req, res) => {
  const { value, category, letter } = req.body as {
    value?: string;
    category?: Category;
    letter?: string;
  };

  if (!category || !letter) {
    res.status(400).json({ ok: false, error: "category and letter are required" });
    return;
  }

  if (!DEFAULT_CATEGORIES.includes(category)) {
    res.status(400).json({ ok: false, error: "invalid category" });
    return;
  }

  let result = await validateWithHybridSources(value, category, letter);

  if (category === "human" && result.decision === "review" && value?.trim()) {
    const nameEvidence = await validateArabicGivenName(value.trim());
    if (nameEvidence && result.decision === "review") {
      result = {
        ...result,
        decision: "accept",
        reason: "known_word",
        confidence: nameEvidence.confidence,
        sources: [nameEvidence.source],
      };
    }
  }

  res.json({ ok: true, result });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

const rounds = new Map<string, GameRound>();

io.on("connection", (socket) => {
  console.log(`[GAME] player connected: ${socket.id}`);

  socket.on("game:create-round", (payload: { durationSeconds?: number } = {}) => {
    const round = createRound({
      durationSeconds: payload.durationSeconds ?? 60,
      categories: DEFAULT_CATEGORIES,
    });

    rounds.set(round.id, round);
    socket.join(round.id);
    socket.emit("game:round-created", round);
  });

  socket.on("game:join-round", (roundId: string) => {
    const round = rounds.get(roundId);

    if (!round) {
      socket.emit("game:error", { code: "ROUND_NOT_FOUND" });
      return;
    }

    socket.join(roundId);
    socket.emit("game:round-state", round);
  });

  socket.on("game:start-round", (roundId: string) => {
    const round = rounds.get(roundId);

    if (!round) {
      socket.emit("game:error", { code: "ROUND_NOT_FOUND" });
      return;
    }

    try {
      const started = startRound(round);
      rounds.set(roundId, started);
      io.to(roundId).emit("game:round-started", started);
    } catch (error) {
      socket.emit("game:error", {
        code: "ROUND_CANNOT_START",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  socket.on(
    "game:submit-answers",
    (payload: Omit<AnswerSet, "submittedAt"> & { roundId: string }) => {
      const round = rounds.get(payload.roundId);

      if (!round) {
        socket.emit("game:error", { code: "ROUND_NOT_FOUND" });
        return;
      }

      try {
        const updated = submitAnswers(round, {
          playerId: payload.playerId,
          answers: payload.answers,
          submittedAt: Date.now(),
        });

        rounds.set(payload.roundId, updated);
        socket.join(payload.roundId);
        io.to(payload.roundId).emit("game:answers-submitted", {
          playerId: payload.playerId,
          submittedAt: updated.submissions.find(
            (entry) => entry.playerId === payload.playerId,
          )?.submittedAt,
        });
      } catch (error) {
        socket.emit("game:error", {
          code: "ANSWERS_REJECTED",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  socket.on("game:finish-round", (roundId: string) => {
    const round = rounds.get(roundId);

    if (!round) {
      socket.emit("game:error", { code: "ROUND_NOT_FOUND" });
      return;
    }

    try {
      const { round: finishedRound, result } = finishRound(round);
      rounds.set(roundId, finishedRound);
      io.to(roundId).emit("game:round-finished", result);
    } catch (error) {
      socket.emit("game:error", {
        code: "ROUND_CANNOT_FINISH",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[GAME] player disconnected: ${socket.id} (${reason})`);
  });
});

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => {
  console.log(`[GAME] server listening on http://localhost:${port}`);
});
