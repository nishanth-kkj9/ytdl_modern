import { Router } from "express";
import { randomUUID } from "node:crypto";
import { config } from "../config.mjs";
import { isYouTubeUrl } from "../validate.mjs";

/**
 * download.mjs — POST /api/download, POST /api/cancel
 * Bridges download commands to the engine. Progress/result events are
 * delivered to the browser over WebSocket.
 */
export function downloadRouter(engineManager) {
  const router = Router();

  router.post("/", (req, res) => {
    const body = req.body || {};
    const url = String(body.url || "").trim();
    if (!url) {
      return res.status(400).json({ error: "url is required" });
    }
    if (!isYouTubeUrl(url)) {
      return res.status(400).json({ error: "Only YouTube URLs are supported" });
    }

    const id = String(body.id || "") || randomUUID();
    // P2-4: the client id is echoed into engine commands and bus events —
    // cap its length and restrict the charset so it can't carry arbitrary
    // payload into logs/NDJSON. Omitting the header lets the server generate.
    if (!/^[\w\-:]{1,128}$/.test(id)) {
      return res.status(400).json({ error: "Invalid id: must be 1-128 chars of [A-Za-z0-9_-:]" });
    }
    const format = String(body.format || "mp3").trim() || "mp3";
    const quality = String(body.quality || "high").trim() || "high";
    const mode = String(body.mode || "audio").trim() || "audio";

    // Validate mode
    if (!["audio", "video"].includes(mode)) {
      return res.status(400).json({ error: `Invalid mode: ${mode}. Must be "audio" or "video".` });
    }

    // Validate format against known containers
    const validFormats = mode === "audio"
      ? ["mp3", "opus", "m4a", "aac", "wav"]
      : ["mp4", "webm", "mkv"];
    if (!validFormats.includes(format)) {
      return res.status(400).json({ error: `Invalid format: ${format}. Valid: ${validFormats.join(", ")}` });
    }

    // Validate quality
    const validQualities = mode === "audio"
      ? ["maximum", "high", "medium", "low"]
      : ["maximum", "best", "2160p", "1080p", "720p", "480p", "360p", "high", "medium", "low"];
    if (!validQualities.includes(quality)) {
      return res.status(400).json({ error: `Invalid quality: ${quality}. Valid: ${validQualities.join(", ")}` });
    }

    const outputDir = config.downloadsDir;

    const cmd = {
      cmd: "download",
      id,
      url,
      format,
      quality,
      mode,
      output_dir: outputDir,
    };

    // Optional metadata for the engine (used for pre-fill / display).
    if (body.title) cmd.title = String(body.title).slice(0, 500);
    if (body.uploader) cmd.uploader = String(body.uploader).slice(0, 256);
    if (body.thumbnail) cmd.thumbnail = String(body.thumbnail).slice(0, 500);
    if (body.duration != null && body.duration !== "" && Number.isFinite(Number(body.duration))) {
      // P2-5: Number("") === 0, so an empty string used to coerce the
      // duration to 0 and display "0:00" — require a real value.
      cmd.duration = Number(body.duration);
    }
    if (body.webpage_url) cmd.webpage_url = String(body.webpage_url).slice(0, 500);

    try {
      engineManager.sendCommand(cmd);
      return res.json({ id });
    } catch (err) {
      return res.status(503).json({ error: err.message });
    }
  });

  return router;
}

export function cancelRouter(engineManager) {
  const router = Router();

  router.post("/", (req, res) => {
    const id = String(req.body?.id || "").trim();
    if (!id) {
      return res.status(400).json({ error: "id is required" });
    }
    try {
      engineManager.sendCommand({ cmd: "cancel", id });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(503).json({ error: err.message });
    }
  });

  return router;
}
