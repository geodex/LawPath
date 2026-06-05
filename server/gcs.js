const crypto = require("crypto");
const { Storage } = require("@google-cloud/storage");

let storageClient;

function exposeConfigError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  return error;
}

function configuredBucketName() {
  return process.env.GCS_BUCKET_NAME || process.env.GEMINI_GCS_BUCKET_NAME || process.env.GOOGLE_CLOUD_STORAGE_BUCKET || "";
}

function createStorageClient() {
  if (storageClient) return storageClient;

  const credentialsJson = process.env.GCS_CREDENTIALS_JSON || process.env.GOOGLE_CREDENTIALS_JSON;
  const options = {};

  if (process.env.GOOGLE_CLOUD_PROJECT) {
    options.projectId = process.env.GOOGLE_CLOUD_PROJECT;
  }

  if (credentialsJson) {
    try {
      options.credentials = JSON.parse(credentialsJson);
    } catch (_error) {
      throw exposeConfigError("Google Cloud credentials JSON is invalid. Check GCS_CREDENTIALS_JSON or GOOGLE_CREDENTIALS_JSON in .env.");
    }
  }

  storageClient = new Storage(options);
  return storageClient;
}

function requireBucketName() {
  const bucketName = configuredBucketName();
  if (!bucketName) {
    throw exposeConfigError("Google Cloud Storage bucket is not configured. Set GCS_BUCKET_NAME in .env.");
  }
  return bucketName;
}

function safeObjectPart(value) {
  return String(value || "object")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "object";
}

function extensionFromContentType(contentType) {
  if (contentType === "image/png") return ".png";
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "application/json") return ".json";
  if (contentType === "text/html") return ".html";
  if (contentType?.startsWith("text/")) return ".txt";
  return "";
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) {
    throw new Error("Invalid file payload.");
  }

  const contentType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  const buffer = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");

  return { buffer, contentType };
}

async function getPublicUrl(bucketName, objectName) {
  if (process.env.GCS_PUBLIC_BASE_URL) {
    return `${process.env.GCS_PUBLIC_BASE_URL.replace(/\/$/, "")}/${objectName}`;
  }

  if (process.env.GCS_SIGNED_URLS === "false") {
    return "";
  }

  try {
    const [url] = await createStorageClient()
      .bucket(bucketName)
      .file(objectName)
      .getSignedUrl({
        action: "read",
        expires: Date.now() + 1000 * 60 * 60 * 12
      });
    return url;
  } catch (error) {
    console.warn("Could not create GCS signed URL:", error.message);
    return "";
  }
}

async function uploadBuffer({ buffer, contentType, objectName, metadata = {} }) {
  const bucketName = requireBucketName();
  const bucket = createStorageClient().bucket(bucketName);
  const file = bucket.file(objectName);

  await file.save(buffer, {
    resumable: false,
    contentType,
    metadata: {
      metadata
    }
  });

  const publicUrl = await getPublicUrl(bucketName, objectName);

  return {
    bucket: bucketName,
    objectName,
    gcsUri: `gs://${bucketName}/${objectName}`,
    publicUrl,
    contentType,
    byteSize: buffer.length
  };
}

async function uploadDataUrl({ dataUrl, prefix, fileName, metadata }) {
  const { buffer, contentType } = parseDataUrl(dataUrl);
  const ext = fileName && fileName.includes(".")
    ? `.${safeObjectPart(fileName.split(".").pop())}`
    : extensionFromContentType(contentType);
  const objectName = `${prefix}/${Date.now()}-${crypto.randomUUID()}-${safeObjectPart(fileName || "upload")}${ext}`;
  return uploadBuffer({ buffer, contentType, objectName, metadata });
}

async function uploadText({ text, prefix, fileName, contentType = "text/plain", metadata }) {
  const objectName = `${prefix}/${Date.now()}-${crypto.randomUUID()}-${safeObjectPart(fileName)}${extensionFromContentType(contentType)}`;
  return uploadBuffer({ buffer: Buffer.from(String(text || ""), "utf8"), contentType, objectName, metadata });
}

module.exports = {
  configuredBucketName,
  safeObjectPart,
  uploadBuffer,
  uploadDataUrl,
  uploadText
};
