import fs from "node:fs";
import { workerData, parentPort } from "node:worker_threads";

import ffmpegStatic from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";

const MAX_SIZE__BYTES = 100 * 1024 * 1024;
const MEDIUM_SIZE__BYTES = 64 * 1024 * 1024;
const MIN_SIZE__BYTES = 16 * 1024 * 1024;

const { filename, size, mimeType, path, init, } = workerData as {
  filename: string
  size: number
  mimeType: string
  path: string
  init: number
};

const outputPath = `/tmp/compressed-${filename}`;

(async () => {
  await new Promise<boolean>((resolve, reject) => {
    let command = "-threads 3 -vcodec libx265 -crf 35 -preset superfast".split(" ");

    console.log("size medium", size, MEDIUM_SIZE__BYTES)
    console.log("size min", size, MIN_SIZE__BYTES)

    if (size < MIN_SIZE__BYTES) {
      return resolve(false);
    }

    if (size > MAX_SIZE__BYTES) {
      return reject("file is too big");
    }

    if (size > MIN_SIZE__BYTES) {
      command = "-threads 3 -vcodec libx265 -crf 35 -preset superfast".split(" ");
    }

    if (size > MEDIUM_SIZE__BYTES) {
      command = "-threads 3 -vcodec libx265 -crf 40 -preset ultrafast".split(" ");
    }

    parentPort!.postMessage("command-" + command);

    ffmpeg.setFfmpegPath(ffmpegStatic as string)
    ffmpeg()
    .input(path)
    .outputOptions(
      "-threads 6 -vcodec libx265 -crf 35 -preset superfast".split(" ")
    )
    .saveToFile(outputPath)
    .on('end', () => {
      return resolve(true)
    })
    .on('error', err => {
      return reject(err)
    })
  })
  .then((didConverted) => {
    if (didConverted) {
      fs.copyFileSync(outputPath, path);
    }

    const timingInMinutes = (Date.now() - init) / 1000;
    const data = {
      filename,
      timing: timingInMinutes,
      status: "compressed"
    }
    parentPort!.postMessage(JSON.stringify(data));
  })
  .catch((reason) => {
    const data = {
      filename,
      timing: (Date.now() - init) / 100,
      status: "failed",
      reason
    }
    parentPort!.postMessage(JSON.stringify(data));
  })
})();
