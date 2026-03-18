const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

const REPLICATE_KEY = process.env.REPLICATE_API_TOKEN;

// Health check
app.get("/", (req, res) => res.json({ status: "ok", service: "nobsfitness-api" }));

// Generate future self via Flux Kontext Pro
app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, image_base64 } = req.body;
    if (!prompt || !image_base64) return res.status(400).json({ error: "prompt and image_base64 required" });

    // Create prediction
    const createResp = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions", {
      method: "POST",
      headers: { "Authorization": `Token ${REPLICATE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: {
          prompt,
          input_image: image_base64.startsWith("data:") ? image_base64 : `data:image/jpeg;base64,${image_base64}`,
          aspect_ratio: "match_input_image",
          safety_tolerance: 5,
          output_format: "jpg",
          output_quality: 95
        }
      })
    });

    const createData = await createResp.json();
    if (!createData.id) return res.status(500).json({ error: "Failed to create prediction", detail: createData });

    // Poll for completion
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const pollResp = await fetch(`https://api.replicate.com/v1/predictions/${createData.id}`, {
        headers: { "Authorization": `Token ${REPLICATE_KEY}` }
      });
      const poll = await pollResp.json();

      if (poll.status === "succeeded") {
        const output = Array.isArray(poll.output) ? poll.output[0] : poll.output;
        return res.json({ status: "succeeded", url: output, predict_time: poll.metrics?.predict_time });
      }
      if (poll.status === "failed") {
        return res.status(500).json({ status: "failed", error: poll.error });
      }
    }
    res.status(504).json({ error: "Generation timed out" });
  } catch (err) {
    console.error("Generate error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Upscale via Real-ESRGAN
app.post("/api/upscale", async (req, res) => {
  try {
    const { image_url } = req.body;
    if (!image_url) return res.status(400).json({ error: "image_url required" });

    const createResp = await fetch("https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions", {
      method: "POST",
      headers: { "Authorization": `Token ${REPLICATE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: { image: image_url, scale: 2, face_enhance: true } })
    });

    const createData = await createResp.json();
    if (!createData.id) return res.status(500).json({ error: "Failed to create upscale", detail: createData });

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollResp = await fetch(`https://api.replicate.com/v1/predictions/${createData.id}`, {
        headers: { "Authorization": `Token ${REPLICATE_KEY}` }
      });
      const poll = await pollResp.json();
      if (poll.status === "succeeded") {
        const output = Array.isArray(poll.output) ? poll.output[0] : poll.output;
        return res.json({ status: "succeeded", url: output });
      }
      if (poll.status === "failed") return res.status(500).json({ status: "failed", error: poll.error });
    }
    res.status(504).json({ error: "Upscale timed out" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`NoBSFitness API running on port ${PORT}`));
