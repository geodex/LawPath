// server/transcribe.js
// Voice notes → text, via Google Cloud Speech-to-Text.
//
// WHY THIS SERVICE: Claude takes text, images and PDFs — it has no audio
// input, so a voice note must be transcribed before any of the analysis
// pipeline can touch it. Google Speech-to-Text is chosen not because it is the
// best transcriber in the abstract but because this platform already
// authenticates to Google Cloud with a service account for Vision OCR and GCS.
// That means no new vendor, no new billing relationship, and no new
// third-party processor to assess under POPIA — the firm's audio goes to a
// processor its clients' documents already go to.
//
// NO NEW DEPENDENCY: google-auth-library is already present (a dependency of
// @google-cloud/storage), so the REST API is called directly with a token
// minted from the same credentials rather than pulling in @google-cloud/speech.
//
// SETUP: the Speech-to-Text API must be enabled on the GCP project. Everything
// else — the service account, the key material — is already in place.

const AUTH_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

// Speech-to-Text takes the encoding from the container for these, so the
// common recorder outputs work without the caller declaring a sample rate.
// Anything else is refused with a clear instruction rather than silently
// producing an empty transcript.
const SUPPORTED = {
  "audio/mpeg": "MP3", "audio/mp3": "MP3",
  "audio/wav": "LINEAR16", "audio/x-wav": "LINEAR16", "audio/wave": "LINEAR16",
  "audio/flac": "FLAC", "audio/x-flac": "FLAC",
  "audio/ogg": "OGG_OPUS", "audio/opus": "OGG_OPUS",
  "audio/webm": "WEBM_OPUS",
  "audio/m4a": "MP3", "audio/x-m4a": "MP3", "audio/mp4": "MP3"
};

const EXT_FALLBACK = {
  ".mp3": "MP3", ".wav": "LINEAR16", ".flac": "FLAC",
  ".ogg": "OGG_OPUS", ".opus": "OGG_OPUS", ".webm": "WEBM_OPUS",
  ".m4a": "MP3", ".mp4": "MP3"
};

function encodingFor(mimeType, fileName) {
  const mt = String(mimeType || "").toLowerCase().split(";")[0].trim();
  if (SUPPORTED[mt]) return SUPPORTED[mt];
  const name = String(fileName || "").toLowerCase();
  const ext = Object.keys(EXT_FALLBACK).find(e => name.endsWith(e));
  return ext ? EXT_FALLBACK[ext] : null;
}

function isAudio(mimeType, fileName) {
  return Boolean(encodingFor(mimeType, fileName));
}

async function accessToken() {
  const { GoogleAuth } = require("google-auth-library");
  const credentialsJson = process.env.GCS_CREDENTIALS_JSON || process.env.GOOGLE_CREDENTIALS_JSON;
  const options = { scopes: [AUTH_SCOPE] };
  if (process.env.GOOGLE_CLOUD_PROJECT) options.projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (credentialsJson) {
    try { options.credentials = JSON.parse(credentialsJson); }
    catch { throw new Error("Google Cloud credentials JSON is invalid (env GCS_CREDENTIALS_JSON)."); }
  }
  const auth = new GoogleAuth(options);
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const value = typeof token === "string" ? token : token?.token;
  if (!value) throw new Error("Could not obtain a Google Cloud access token — check the service account credentials.");
  return value;
}

/**
 * Transcribe an audio buffer. Returns the transcript as a string.
 *
 * Uses the synchronous `recognize` endpoint, which accepts inline audio up to
 * roughly one minute. Longer notes need `longrunningrecognize` with the audio
 * staged in GCS — deliberately not built yet: an attorney's voice note to file
 * is typically well under a minute, and the failure here is explicit rather
 * than a truncated transcript passed off as complete.
 */
const INLINE_LIMIT_BYTES = 10 * 1024 * 1024;

async function transcribeAudio({ buffer, mimeType, fileName, languageCode }) {
  if (!buffer || !buffer.length) return { text: "", reason: "empty_audio" };

  const encoding = encodingFor(mimeType, fileName);
  if (!encoding) return { text: "", reason: "unsupported_audio" };

  if (buffer.length > INLINE_LIMIT_BYTES) {
    return { text: "", reason: "audio_too_large" };
  }

  const token = await accessToken();
  const res = await fetch("https://speech.googleapis.com/v1/speech:recognize", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      config: {
        encoding,
        // en-ZA so South African place names, surnames and legal terms are
        // recognised; alternatives cover the code-switching that is ordinary
        // in SA practice.
        languageCode: languageCode || "en-ZA",
        alternativeLanguageCodes: ["en-GB", "af-ZA"],
        enableAutomaticPunctuation: true,
        model: "latest_long",
        // Let the API read the rate from the container rather than guessing.
        audioChannelCount: 1,
        enableSeparateRecognitionPerChannel: false
      },
      audio: { content: buffer.toString("base64") }
    })
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = payload?.error?.message || `Speech-to-Text HTTP ${res.status}`;
    // The single most likely first-run failure, named precisely so nobody
    // spends an afternoon on it.
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
      throw new Error("The Cloud Speech-to-Text API is not enabled on this Google Cloud project. Enable it in the Google Cloud console (same project as the Vision OCR service account), then retry.");
    }
    throw new Error(msg);
  }

  const text = (payload.results || [])
    .map(r => r.alternatives?.[0]?.transcript || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return { text: "", reason: "no_speech_detected" };
  return { text, reason: "ok" };
}

module.exports = { transcribeAudio, isAudio, encodingFor };
