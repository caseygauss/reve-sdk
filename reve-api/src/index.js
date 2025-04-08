async function handleGenerate(request, env) {
  try {
    const body = await request.json();
    const { prompt, negativePrompt, width, height, batchSize, seed, model, enhancePrompt, userId = 'casey' } = body; // Default userId to 'casey'

    // Validate required parameters
    if (!prompt) {
      // ... existing code ...
    }

    // Initialize the SDK
    const reveAI = new ReveAI({
      auth: {
        authorization: `Bearer ${credentials.authToken}`,
        cookie: credentials.cookie,
      },
      projectId: credentials.projectId || undefined, // Fallback to auto-detection if not set in KV
      verbose: false,
    });

    // ... existing code ...
  } catch (error) {
    // ... existing code ...
  }
}

async function handleEdit(request, env) {
  try {
    const body = await request.json();
    const {
      prompt, // Original prompt for context
      negativePrompt,
      width,
      height,
      seed,
      model,
      instruction, // Edit instruction
      originatingGeneration, // ID of the image to edit
      annotatedPrompt, // Optional annotated prompt
      userId = 'casey' // Default userId to 'casey'
    } = body;

    // Validate required parameters for editing
    // ... existing code ...

    // Initialize the SDK
    const reveAI = new ReveAI({
      auth: {
        authorization: `Bearer ${credentials.authToken}`,
        cookie: credentials.cookie,
        // reve_version: credentials.reveVersion, // Assuming SDK doesn't strictly need this
      },
      projectId: credentials.projectId || undefined,
      verbose: false, // Keep verbose off unless debugging
    });

    // Edit image using the SDK
    // ... existing code ...
  } catch (error) {
    // ... existing code ...
  }
} 