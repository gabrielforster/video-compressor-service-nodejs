import { Worker } from "node:worker_threads"
import { createHash } from "node:crypto"
import fs from "node:fs"

import WebSocket from "ws";
import express, { Request } from "express"
import cors from "cors"
import multer from "multer"
import pino from "pino"
import { on } from "node:events";
const logger = pino()

const PORT = process.env.PORT ?? 80

const MAX_FILE_SIZE = 64 * 1024 * 1024;

const MIME_TYPES_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "video/mp4": "mp4",
}


let sockets: WebSocket[] = [];

const server = new WebSocket.Server({
  port: 81
});

server.on("connection", function(socket) {
  sockets.push(socket);
  socket.on("message", function(msg) {
    sockets.forEach(s => s.send(msg));
  });
  socket.on("close", function() {
    sockets = sockets.filter(s => s !== socket);
  });
});


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "/tmp/uploads/") // specify the destination directory
  },
  filename: function (req, file, cb) {
    const hash = createHash("sha256")
      .update(file.originalname + Date.now())
      .digest("hex");

    const ext = MIME_TYPES_MAP[file.mimetype];
    const filename = `${hash}.${ext}`;

    cb(null, filename)
  }
});

const filter = function (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!Object.keys(MIME_TYPES_MAP).some((mimeType) => mimeType === file.mimetype.toLowerCase())) {
    cb(new Error("invalid file type"));
  }

  if (file.size > MAX_FILE_SIZE) {
    cb(new Error("max file size reached"));
  }

  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: filter
});

const app = express()
app.use(cors())

app.get("/health", (_, res) => {
  res.send("Its healthy");
});

app.post("/upload", upload.single("file"), (req, res) => {
  const initTime = Date.now()
  logger.info("started file upload");
  if (!req.file) {
    logger.error("badrequest on file upload");
    return res.status(400).send("No file uploaded");
  }

  logger.info("started file compression");
  const worker = new Worker("./dist/src/worker.js", {
    workerData: {
      path: req.file.path,
      filename: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,
      init: Date.now()
    },
  });

  worker.on("message", (message) => {

    if (message.startsWith("command-")) {
      logger.child({ command: message.replace("command-", "") }).info("ffmpeg command");
      return
    }

    const messageParsed = JSON.parse(message);
    if (message.status === "failed") {
      logger.child({ reason: messageParsed.reason }).error("file compression failed");
    } else {
      logger.child({ miliseconds: messageParsed.timing }).info("file compressed");
    }

    sockets.forEach((ws) => {
      ws.send(message);
    });
  });

  const response = {
    filename: req.file.filename,
    status: "uploaded"
  }

  res.setHeader("Location", "download/" + req.file.filename);
  res.setHeader("Content-Type", "application/json");


  const seconds = (Date.now() - initTime) / 1000;
  logger.child({ seconds }).info("file uploaded");
  return res.status(201).json(response);
});

app.get("/download", (req, res) => {
  const filename = req.query.filename as string;
  const path = `/tmp/uploads/${filename}`;

  if (!fs.existsSync(path)) {
    return res.status(404).send("File not found");
  }

  const type = filename.split(".").pop();
  const mimeType = Object.keys(MIME_TYPES_MAP).find((key) => MIME_TYPES_MAP[key] === type);

  res.setHeader("Content-Type", mimeType!)
  res.download(path);
});

app.get("/list", (_, res) => {
  const files = fs.readdirSync("/tmp/uploads").map(filename => {
    const stats = fs.statSync(`/tmp/uploads/${filename}`);

    return {
      location: filename,
      size: stats.size
    }
  });
  res.json(files);
});

app.listen(PORT, () => { logger.info("running on port 3000") });
