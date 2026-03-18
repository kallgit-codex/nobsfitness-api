const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

const REPLICATE_KEY = process.env.REPLICATE_API_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

app.get("/api/health", (req, res) => res.json({ status: "ok", service: "nobsfitness" }));

// Generate future self via Flux Kontext Pro
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, image_base64 } = req.body;
    if (!prompt || !image_base64) return res.status(400).json({ error: "prompt and image_base64 required" });
    const createResp = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions", {
      method: "POST",
      headers: { "Authorization": `Token ${REPLICATE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: {
          prompt,
          input_image: image_base64.startsWith("data:") ? image_base64 : `data:image/jpeg;base64,${image_base64}`,
          aspect_ratio: "match_input_image", safety_tolerance: 5, output_format: "jpg", output_quality: 95
        }
      })
    });
    const createData = await createResp.json();
    if (!createData.id) return res.status(500).json({ error: "Failed to create prediction", detail: createData });
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const poll = await (await fetch(`https://api.replicate.com/v1/predictions/${createData.id}`, { headers: { "Authorization": `Token ${REPLICATE_KEY}` } })).json();
      if (poll.status === "succeeded") {
        const output = Array.isArray(poll.output) ? poll.output[0] : poll.output;
        return res.json({ status: "succeeded", url: output, predict_time: poll.metrics?.predict_time });
      }
      if (poll.status === "failed") return res.status(500).json({ status: "failed", error: poll.error });
    }
    res.status(504).json({ error: "Generation timed out" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Coach chat proxy for Anthropic
app.post("/api/chat", async (req, res) => {
  try {
    const { system, messages } = req.body;
    if (!messages) return res.status(400).json({ error: "messages required" });
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: system || "", messages })
    });
    const data = await resp.json();
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Upscale
app.post("/api/upscale", async (req, res) => {
  try {
    const { image_url } = req.body;
    if (!image_url) return res.status(400).json({ error: "image_url required" });
    const createResp = await fetch("https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions", {
      method: "POST",
      headers: { "Authorization": `Token ${REPLICATE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: { image: image_url, scale: 2, face_enhance: true } })
    });
    const cd = await createResp.json();
    if (!cd.id) return res.status(500).json({ error: "Failed", detail: cd });
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const poll = await (await fetch(`https://api.replicate.com/v1/predictions/${cd.id}`, { headers: { "Authorization": `Token ${REPLICATE_KEY}` } })).json();
      if (poll.status === "succeeded") { const o = Array.isArray(poll.output) ? poll.output[0] : poll.output; return res.json({ status: "succeeded", url: o }); }
      if (poll.status === "failed") return res.status(500).json({ status: "failed", error: poll.error });
    }
    res.status(504).json({ error: "timeout" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`NoBSFitness on port ${PORT}`));
