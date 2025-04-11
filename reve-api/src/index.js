import { ReveAI } from 'reve-sdk';

async function getCredentials(userId, env) {
  console.log(`[${userId}] Entering getCredentials function...`); // Log entry
  const kv = env.REVE_CREDENTIALS;
  let authToken, cookie, projectId, reveVersion;

  console.log(`[${userId}] Attempting KV lookups...`); // Log before KV access
  if (userId === 'casey') {
    [authToken, cookie, projectId, reveVersion] = await Promise.all([
      kv.get('authToken'),
      kv.get('cookie'),
      kv.get('projectId'),
      kv.get('reveVersion'),
    ]);
  } else {
    const prefix = `user-${userId}-`;
    [authToken, cookie, projectId, reveVersion] = await Promise.all([
      kv.get(`${prefix}authToken`),
      kv.get(`${prefix}cookie`),
      kv.get(`${prefix}projectId`),
      kv.get(`${prefix}reveVersion`),
    ]);
  }

  console.log(`[${userId}] KV lookups completed.`); // Log after KV access

  // Ensure all required credentials exist, especially for non-default users
  if (!authToken || !cookie) {
      console.error(`[${userId}] Missing authToken or cookie after KV lookup.`); // Log missing creds
      throw new Error(`Missing required credentials (authToken or cookie) for userId: ${userId}`);
  }
  // projectId and reveVersion can be optional/fallback

  console.log(`[${userId}] Returning credentials from getCredentials.`); // Log successful return
  return { authToken, cookie, projectId, reveVersion };
}

async function updateCredential(userId, keySuffix, value, env) {
    if (value === undefined || value === null) return; // Don't update if value is not provided

    const kv = env.REVE_CREDENTIALS;
    let key;

    if (userId === 'casey') {
        key = keySuffix;
    } else {
        key = `user-${userId}-${keySuffix}`;
    }
    await kv.put(key, value);
}


function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(message, status = 500, errorCode = 'UNKNOWN_ERROR') {
    return jsonResponse({ error: errorCode, message: message }, status);
}


async function handleGenerate(request, env) {
  console.log("Entering handleGenerate..."); // Log function entry
  try {
    console.log("Parsing request body...");
    const body = await request.json();
    console.log("Request body parsed.");
    const { prompt, negativePrompt, width, height, batchSize, seed, model, enhancePrompt, userId = 'casey' } = body;

    // Validate required parameters
    if (!prompt) {
      console.log("Prompt validation failed.");
      return errorResponse('Prompt is required', 400, 'MISSING_PROMPT');
    }
    console.log(`Prompt validated for user: ${userId}`);

    // Retrieve credentials based on userId
    let credentials;
    try {
        console.log(`Calling getCredentials for user: ${userId}...`);
        credentials = await getCredentials(userId, env);
        console.log(`Successfully received credentials for user: ${userId}`);
        // Logging for credential verification (placed correctly inside try block)
        console.log(`[${userId}] Retrieved Auth Token - Length: ${credentials.authToken?.length}, Start: ${credentials.authToken?.substring(0, 10)}...`);
        console.log(`[${userId}] Retrieved Cookie - Length: ${credentials.cookie?.length}, Start: ${credentials.cookie?.substring(0, 10)}...`);
        console.log(`[${userId}] Retrieved Project ID: ${credentials.projectId || '(not set/using auto)'}`);
    } catch (err) {
        console.error(`Credential fetch error for userId ${userId}: ${err.message}`);
        return errorResponse(`Could not retrieve credentials for user ${userId}. ${err.message}`, 400, 'MISSING_CREDENTIALS');
    }

    console.log(`Initializing ReveAI SDK for user: ${userId}...`);
    // Initialize the SDK (using fetched credentials, verbose true, no customHeaders)
    const reveAI = new ReveAI({
      auth: {
        authorization: `Bearer ${credentials.authToken}`,
        cookie: credentials.cookie,
      },
      projectId: credentials.projectId || undefined,
      verbose: true, // Keep verbose logging enabled
    });
    console.log("ReveAI SDK initialized.");

    console.log(`Calling reveAI.generateImage for user: ${userId}...`);
    // Generate image using the SDK
    const result = await reveAI.generateImage({
      prompt,
      negativePrompt: negativePrompt || '',
      width: width || 1360,
      height: height || 768,
      batchSize: batchSize || 1,
      seed: seed || -1,
      model: model || 'text2image_v1',
      // Explicitly disable prompt enhancement for testing
      enhancePrompt: false, 
    });
    console.log(`reveAI.generateImage call completed for user: ${userId}`);

    // Return the result
    return jsonResponse(result);

  } catch (error) {
    console.error("Error in handleGenerate:", error);
    // Handle SDK-specific errors
    if (error.name === 'ReveAIError') {
        return errorResponse(error.message, error.statusCode || 500, error.type);
    }
    // Handle JSON parsing errors or other request issues
    if (error instanceof SyntaxError) {
        return errorResponse("Invalid JSON payload", 400, "INVALID_JSON");
    }
    // Generic error
    return errorResponse(error.message || 'An unexpected error occurred', 500);
  }
}

async function handleEdit(request, env) {
  console.log("Entering handleEdit..."); // Log function entry
  try {
    console.log("Parsing request body...");
    const body = await request.json();
    console.log("Request body parsed.");
    const {
      prompt,
      negativePrompt,
      width,
      height,
      seed,
      model,
      instruction,
      originatingGeneration,
      annotatedPrompt,
      userId = 'casey'
    } = body;

    // Validate required parameters for editing
    if (!prompt) {
      console.log("Prompt validation failed.");
      return errorResponse('Original prompt is required for context', 400, 'MISSING_PROMPT');
    }
    if (!instruction) {
      console.log("Instruction validation failed.");
      return errorResponse('Edit instruction is required', 400, 'MISSING_INSTRUCTION');
    }
    if (!originatingGeneration) {
      console.log("Originating generation validation failed.");
      return errorResponse('Originating generation ID is required', 400, 'MISSING_ORIGINATING_GENERATION');
    }
    console.log(`Validations passed for user: ${userId}`);

    // Retrieve credentials based on userId
    let credentials;
    try {
        console.log(`Calling getCredentials for user: ${userId}...`);
        credentials = await getCredentials(userId, env);
        console.log(`Successfully received credentials for user: ${userId}`);
        // Logging for credential verification (placed correctly inside try block)
        console.log(`[${userId}] Retrieved Auth Token - Length: ${credentials.authToken?.length}, Start: ${credentials.authToken?.substring(0, 10)}...`);
        console.log(`[${userId}] Retrieved Cookie - Length: ${credentials.cookie?.length}, Start: ${credentials.cookie?.substring(0, 10)}...`);
        console.log(`[${userId}] Retrieved Project ID: ${credentials.projectId || '(not set/using auto)'}`);
    } catch (err) {
        console.error(`Credential fetch error for userId ${userId}: ${err.message}`);
        return errorResponse(`Could not retrieve credentials for user ${userId}. ${err.message}`, 400, 'MISSING_CREDENTIALS');
    }

    console.log(`Initializing ReveAI SDK for user: ${userId}...`);
    // Initialize the SDK (using fetched credentials, verbose true, no customHeaders)
    const reveAI = new ReveAI({
      auth: {
        authorization: `Bearer ${credentials.authToken}`,
        cookie: credentials.cookie,
      },
      projectId: credentials.projectId || undefined,
      verbose: true, // Keep verbose logging enabled
    });
    console.log("ReveAI SDK initialized.");

    console.log(`Calling reveAI.editImage for user: ${userId}...`);
    // Edit image using the SDK
    const result = await reveAI.editImage({
      prompt,
      negativePrompt: negativePrompt || '',
      width: width || 1360,
      height: height || 768,
      seed: seed || -1,
      model: model || 'text2image_v1',
      instruction,
      originatingGeneration,
      annotatedPrompt: annotatedPrompt || undefined,
    });
    console.log(`reveAI.editImage call completed for user: ${userId}`);

    // Return the result
    return jsonResponse(result);

  } catch (error) {
    console.error("Error in /edit:", error);
    // Handle SDK-specific errors
    if (error.name === 'ReveAIError') {
        return errorResponse(error.message, error.statusCode || 500, error.type);
    }
    // Handle JSON parsing errors or other request issues
    if (error instanceof SyntaxError) {
        return errorResponse("Invalid JSON payload", 400, "INVALID_JSON");
    }
    // Generic error
    return errorResponse(error.message || 'An unexpected error occurred during image edit', 500);
  }
}

// ... keep handleUpdateCredentials and export default as they were ...
async function handleUpdateCredentials(request, env) {
    try {
        const body = await request.json();
        const { userId, authToken, cookie, projectId, reveVersion } = body;

        if (!userId) {
            return errorResponse('userId is required to update credentials', 400, 'MISSING_USER_ID');
        }

        // Update credentials in KV
        const updatePromises = [
            updateCredential(userId, 'authToken', authToken, env),
            updateCredential(userId, 'cookie', cookie, env),
            updateCredential(userId, 'projectId', projectId, env),
            updateCredential(userId, 'reveVersion', reveVersion, env),
        ];

        const results = await Promise.allSettled(updatePromises);

        const failures = results.filter(result => result.status === 'rejected');
        if (failures.length > 0) {
            console.error(`Failed to update some credentials for userId ${userId}:`, failures);
            return errorResponse(`Failed to update some credentials for userId ${userId}. Check server logs.`, 500, 'KV_UPDATE_FAILED');
        }

        return jsonResponse({ success: true, message: `Credentials updated successfully for userId: ${userId}` });

    } catch (error) {
        console.error("Error in /update-credentials:", error);
        if (error instanceof SyntaxError) {
            return errorResponse("Invalid JSON payload", 400, "INVALID_JSON");
        }
        return errorResponse(error.message || 'An unexpected error occurred during credential update', 500);
    }
}


export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/generate') {
      return handleGenerate(request, env);
    } else if (request.method === 'POST' && url.pathname === '/edit') {
      return handleEdit(request, env);
    } else if (request.method === 'POST' && url.pathname === '/update-credentials') {
      return handleUpdateCredentials(request, env);
    } else {
      return new Response('Not Found', { status: 404 });
    }
  },
}; 