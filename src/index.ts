import { Worker } from "node:worker_threads"
import { createHash } from "node:crypto"
import fs from "node:fs"
import express, { Request } from "express"
import multer from "multer"

const PORT = process.env.PORT ?? 3000

const MAX_FILE_SIZE = 64 * 1024 * 1024;

const MIME_TYPES_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "video/mp4": "mp4",
}


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

app.get("/health", (_, res) => {
  res.send("Its healthy");
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded");
  }

  new Worker("./dist/src/worker.js", {
    workerData: {
      path: req.file.path,
      filename: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,
    },
  });

  res.setHeader("Location", "download/" + req.file.filename);
  res.status(201).send("File uploaded");
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

app.listen(PORT, () => { console.log("running on port 3000") });
