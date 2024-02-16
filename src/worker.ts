import fs from "node:fs";
import { exec } from "node:child_process";
import { workerData } from "node:worker_threads";

import ffmpegStatic from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";

const { filename, size, mimeType, path } = workerData;

const outputPath = `/tmp/compressed-${filename}`;

const command = `ffmpeg -i ${path} -threads 3 -vcodec libx265 -crf 35 -preset superfast ${outputPath} -y`;

console.log("executing command", command);


(async () =>
  await new Promise<void>((resolve, reject) => {
  console.time("compression")
   ffmpeg.setFfmpegPath(ffmpegStatic as string)
   ffmpeg()
     .input(path)
     .outputOptions(
       "-threads 3 -vcodec libx265 -crf 35 -preset superfast".split(" ")
     )
     .saveToFile(outputPath)
     .on('end', () => {
       resolve()
     })
     .on('error', err => {
       reject(err)
     })
  })
    .then(() => {
      fs.copyFileSync(outputPath, path);
      console.log("file copied");
      console.timeEnd("compression");
    })
)();
