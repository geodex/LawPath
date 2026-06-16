const crypto = require("crypto");

let visionClient;
let storageClient;

function loadClients() {
  // Lazy-require so installs that haven't yet been deployed (no Vision API
  // perms, dev machines without GCP creds) don't crash at server boot.
  if (visionClient && storageClient) return { visionClient, storageClient };
  const vision = require("@google-cloud/vision");
  const { Storage } = require("@google-cloud/storage");

  const credentialsJson = process.env.GCS_CREDENTIALS_JSON || process.env.GOOGLE_CREDENTIALS_JSON;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || undefined;
  const options = {};
  if (projectId) options.projectId = projectId;
  if (credentialsJson) {
    try {
      options.credentials = JSON.parse(credentialsJson);
    } catch {
      throw new Error("Google Cloud credentials JSON is invalid (env GCS_CREDENTIALS_JSON).");
    }
  }

  visionClient = new vision.ImageAnnotatorClient(options);
  storageClient = new Storage(options);
  return { visionClient, storageClient };
}

// Run Vision API DOCUMENT_TEXT_DETECTION across every page of a PDF
// supplied as a Buffer. Stages the PDF in GCS, runs the async batch
// annotation, downloads the JSON results, concatenates the fullTextAnnotation
// from every page, and cleans up the staging objects.
//
// Returns a string (concatenated text of every page). Throws on:
//   - missing bucket config
//   - Vision API not enabled on the project
//   - service-account perms missing
//   - PDF entirely unprocessable (returns empty string but no throw)
async function ocrPdfWithVision({ buffer, tenantId, fileName }) {
  const bucketName = process.env.GCS_BUCKET_NAME || process.env.GEMINI_GCS_BUCKET_NAME || process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
  if (!bucketName) throw new Error("GCS bucket is not configured (env GCS_BUCKET_NAME).");

  const { visionClient, storageClient } = loadClients();
  const bucket = storageClient.bucket(bucketName);

  const jobId = `${Date.now()}-${crypto.randomUUID()}`;
  const safeTenant = String(tenantId || "platform").replace(/[^a-zA-Z0-9_-]/g, "-");
  const inputObject = `ocr-staging/${safeTenant}/${jobId}/input.pdf`;
  const outputPrefix = `ocr-staging/${safeTenant}/${jobId}/output/`;

  // 1. Stage the PDF buffer in GCS so Vision can read it.
  await bucket.file(inputObject).save(buffer, {
    resumable: false,
    contentType: "application/pdf",
    metadata: { metadata: { ownerType: "ocr_input", tenantId: String(tenantId || ""), fileName: String(fileName || "") } }
  });

  let fullText = "";
  let stagedObjects = [inputObject];

  try {
    // 2. Async batch OCR. batchSize=20 means each output JSON covers up
    //    to 20 pages — keeps individual response files manageable.
    const [operation] = await visionClient.asyncBatchAnnotateFiles({
      requests: [{
        inputConfig: {
          gcsSource: { uri: `gs://${bucketName}/${inputObject}` },
          mimeType: "application/pdf"
        },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        outputConfig: {
          gcsDestination: { uri: `gs://${bucketName}/${outputPrefix}` },
          batchSize: 20
        }
      }]
    });

    // 3. Wait for the LRO. Typical 1-page doc: a few seconds. 30-page
    //    deed of sale: ~20–30 seconds.
    await operation.promise();

    // 4. List the JSON output files, parse each, concatenate page text
    //    in document order.
    const [files] = await bucket.getFiles({ prefix: outputPrefix });
    files.sort((a, b) => a.name.localeCompare(b.name));
    stagedObjects.push(...files.map((f) => f.name));

    for (const file of files) {
      const [contents] = await file.download();
      let parsed;
      try { parsed = JSON.parse(contents.toString("utf8")); } catch { continue; }
      for (const response of parsed.responses || []) {
        const text = response.fullTextAnnotation?.text || "";
        if (text) fullText += text + "\n\n";
      }
    }
  } finally {
    // 5. Best-effort cleanup so OCR staging doesn't accumulate in the
    //    bucket. Failures here are non-fatal — the result has already
    //    been captured.
    await Promise.allSettled(stagedObjects.map((obj) => bucket.file(obj).delete().catch(() => {})));
  }

  return fullText.trim();
}

module.exports = { ocrPdfWithVision };
