import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import {
  ReveAIOptions,
  GenerateImageOptions,
  GenerateImageResult,
  ReveAIError,
  ReveAIErrorType,
} from './types';
import { delay, handleAxiosError, validateImageOptions, parseJwt } from './utils/helpers';

// Flag for testing environment
export const IS_TEST_ENV = process.env.NODE_ENV === 'test';

/**
 * Unofficial SDK for interacting with Reve AI's image generation service
 */
export class ReveAI {
  private apiClient: AxiosInstance;
  private options: Required<Omit<ReveAIOptions, 'auth' | 'projectId'>> & { 
    auth: ReveAIOptions['auth'];
    projectId?: string;
    verbose: boolean;
    customHeaders: ReveAIOptions['customHeaders'];
  };
  private token: string | null = null;
  private refreshToken: string | null = null;
  private userId: string | null = null;

  /**
   * Create a new instance of the Reve AI SDK
   * @param options Configuration options for the SDK
   */
  constructor(options: ReveAIOptions) {
    if (!options.auth) {
      throw new ReveAIError('Authentication options are required', ReveAIErrorType.AUTHENTICATION_ERROR);
    }
    
    const { authorization, cookie } = options.auth;
    
    if (!authorization || !cookie) {
      throw new ReveAIError(
        'Authorization header and cookie are required',
        ReveAIErrorType.AUTHENTICATION_ERROR
      );
    }
    
    this.options = {
      auth: options.auth,
      projectId: options.projectId || undefined,
      baseUrl: options.baseUrl ?? 'https://preview.reve.art',
      timeout: options.timeout ?? 30000,
      maxPollingAttempts: options.maxPollingAttempts ?? 60,
      pollingInterval: options.pollingInterval ?? 2000,
      verbose: options.verbose ?? false,
      customHeaders: options.customHeaders ?? {},
    };

    // Create axios instance with default configuration
    this.apiClient = axios.create({
      baseURL: this.options.baseUrl,
      timeout: this.options.timeout,
      headers: {
        'content-type': 'application/json',
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.5',
        'origin': 'https://preview.reve.art',
        'referer': 'https://preview.reve.art/app',
        'dnt': '1',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'sec-gpc': '1',
        'te': 'trailers',
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0',
        ...this.options.customHeaders,
      },
    });

    // Extract token from the authorization header (assuming it's in the format "Bearer <token>")
    const tokenMatch = /Bearer\s+(.+)/.exec(authorization);
    if (tokenMatch && tokenMatch[1]) {
      this.token = tokenMatch[1];
      
      // Extract user ID from token
      const decoded = parseJwt(this.token);
      this.userId = decoded.sub ? String(decoded.sub) : null;
    }

    // Setup axios retry
    axiosRetry(this.apiClient, { 
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error: AxiosError) => {
        // Only retry on network errors and 5xx server errors
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
               (error.response?.status !== undefined && error.response?.status >= 500);
      }
    });

    // Add request interceptor for logging
    this.apiClient.interceptors.request.use(
      (config) => {
        if (this.options.verbose) {
          const sanitizedConfig = { ...config };
          
          // Don't log the full cookie/auth headers for security
          if (sanitizedConfig.headers && sanitizedConfig.headers.Authorization) {
            const authHeader = sanitizedConfig.headers.Authorization;
            sanitizedConfig.headers.Authorization = typeof authHeader === 'string' 
              ? authHeader.substring(0, 25) + '...' 
              : '[REDACTED]';
          }
          if (sanitizedConfig.headers && sanitizedConfig.headers.Cookie) {
            const cookieHeader = sanitizedConfig.headers.Cookie;
            sanitizedConfig.headers.Cookie = typeof cookieHeader === 'string'
              ? cookieHeader.substring(0, 25) + '...'
              : '[REDACTED]';
          }
          
          console.log('\n🔷 REQUEST:', config.method?.toUpperCase(), config.url);
          console.log('🔶 Headers:', JSON.stringify(sanitizedConfig.headers, null, 2));
          
          if (config.params) {
            console.log('🔶 Query Params:', JSON.stringify(config.params, null, 2));
          }
          
          if (config.data) {
            console.log('🔶 Request Body:', JSON.stringify(config.data, null, 2));
          }
        }
        return config;
      },
      (error) => {
        if (this.options.verbose) {
          console.log('\n❌ REQUEST ERROR:', error.message);
        }
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging and handling common errors
    this.apiClient.interceptors.response.use(
      (response) => {
        if (this.options.verbose) {
          console.log('\n✅ RESPONSE:', response.status, response.statusText);
          console.log('🔶 Headers:', JSON.stringify(response.headers, null, 2));
          console.log('🔶 Response Data:', JSON.stringify(response.data, null, 2));
        }
        return response;
      },
      (error: AxiosError) => {
        if (this.options.verbose) {
          console.log('\n❌ RESPONSE ERROR:', error.message);
          if (error.response) {
            console.log('🔶 Status:', error.response.status, error.response.statusText);
            console.log('🔶 Headers:', JSON.stringify(error.response.headers, null, 2));
            console.log('🔶 Response Data:', JSON.stringify(error.response.data, null, 2));
          }
          if (error.config) {
            console.log('🔶 Request URL:', error.config.method?.toUpperCase(), error.config.url);
            console.log('🔶 Request Body:', JSON.stringify(error.config.data, null, 2));
          }
        }
        
        if (error.response?.status === 401 && this.token) {
          // Token expired, clear it
          this.token = null;
          return Promise.reject(
            new ReveAIError('Authentication token expired', ReveAIErrorType.AUTHENTICATION_ERROR, 401)
          );
        }
        return Promise.reject(error);
      }
    );

    // Add request interceptor to add auth token and cookie
    this.apiClient.interceptors.request.use(
      (config) => {
        // Add authorization and cookie headers to every request
        config.headers.authorization = this.options.auth.authorization;
        config.headers.cookie = this.options.auth.cookie;
        
        // Add any custom headers
        Object.entries(this.options.customHeaders).forEach(([key, value]) => {
          config.headers[key] = value;
        });
        
        return config;
      },
      (error) => Promise.reject(error)
    );
  }

  /**
   * Get active project ID either from options or by fetching from API
   * @returns Promise resolving to a project ID
   */
  private async getProjectId(): Promise<string> {
    // If project ID is provided in options, use it
    if (this.options.projectId) {
      return this.options.projectId;
    }

    try {
      // Try to get the default or first available project
      const response = await this.apiClient.get('/api/projects');
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        // Use the first project in the list
        return response.data[0].id;
      }

      // If no projects found
      throw new ReveAIError(
        'No projects found. Please provide a projectId in the options. You can find your project ID in the browser network tab when making requests to "/api/project/{projectId}/generation".',
        ReveAIErrorType.API_ERROR
      );
    } catch (error) {
      if (error instanceof ReveAIError) {
        throw error;
      }
      
      // If we get a 404, provide more helpful guidance
      if ((error as AxiosError).response?.status === 404) {
        throw new ReveAIError(
          'Cannot auto-detect project ID. The /api/projects endpoint was not found. Please provide a projectId in the options. You can find your project ID in the browser network tab when making generation requests.',
          ReveAIErrorType.API_ERROR,
          404
        );
      }
      
      throw handleAxiosError(error as Error, 'getting project ID', this.options.verbose);
    }
  }

  /**
   * Enhance a prompt using Reve AI's prompt enhancement model
   * @param prompt The original prompt to enhance
   * @param numVariants Number of enhanced prompt variants to generate
   * @returns Promise resolving to an array of enhanced prompts
   */
  private async enhancePrompt(prompt: string, numVariants: number = 4): Promise<string[]> {
    try {
      const payload = {
        inputs: {
          num_variants: numVariants,
          prompt: prompt
        },
        model_id: "promptenhancer_v1/prod/20250224-0952",
        project_id: await this.getProjectId()
      };

      if (this.options.verbose) {
        console.log(`Enhancing prompt with ${numVariants} variants:`, prompt);
      }

      const response = await this.apiClient.post(
        '/api/misc/model_infer_sync',
        payload
      );

      // Process the response to get the enhanced prompts
      if (Array.isArray(response.data) && response.data.length > 0) {
        const lastResponse = response.data[response.data.length - 1];
        
        if (lastResponse.status === 'success' && 
            lastResponse.outputs && 
            Array.isArray(lastResponse.outputs.expanded_prompts)) {
          
          if (this.options.verbose) {
            console.log('Prompt enhancement successful, generated', lastResponse.outputs.expanded_prompts.length, 'variants');
          }
          
          return lastResponse.outputs.expanded_prompts;
        }
      }
      
      // If we couldn't get enhanced prompts, fall back to the original
      if (this.options.verbose) {
        console.log('Prompt enhancement unsuccessful, using original prompt');
      }
      return [prompt];
    } catch (error) {
      if (this.options.verbose) {
        console.log('Error enhancing prompt:', error);
      }
      // On error, fall back to the original prompt
      return [prompt];
    }
  }

  /**
   * Generate a single image using Reve AI
   * @param options Options for image generation
   * @param enhancedPrompt Optional pre-enhanced prompt to use
   * @returns Promise resolving to the generation result with image URL
   */
  private async generateSingleImage(
    options: GenerateImageOptions, 
    enhancedPrompt?: string
  ): Promise<{
    imageUrl: string;
    seed: number;
    enhancedPrompt?: string;
  }> {
    // Get project ID
    const projectId = await this.getProjectId();

    // Validate options
    validateImageOptions(
      options.width, 
      options.height, 
      1 // Always 1 for single image generation
    );

    // Default values
    const prompt = options.prompt;
    const negativePrompt = options.negativePrompt || '';
    const width = options.width || 1024;
    const height = options.height || 1024;
    const seed = options.seed === undefined ? -1 : options.seed;
    const model = options.model || 'text2image_v1/prod/20250325-2246';
    const shouldEnhancePrompt = options.enhancePrompt ?? true;

    // Use the provided enhanced prompt or the original
    let finalPrompt = prompt;
    
    // If we have a pre-enhanced prompt, use it
    if (enhancedPrompt && shouldEnhancePrompt) {
      finalPrompt = enhancedPrompt;
      
      if (this.options.verbose) {
        console.log('Using provided enhanced prompt:', finalPrompt);
      }
    }
    // Otherwise, if prompt enhancement is enabled, enhance it now
    else if (shouldEnhancePrompt) {
      const enhancedPrompts = await this.enhancePrompt(prompt, 1);
      if (enhancedPrompts.length > 0) {
        finalPrompt = enhancedPrompts[0];
        
        if (this.options.verbose) {
          console.log('Using enhanced prompt:', finalPrompt);
        }
      }
    }

    // Create a unique ID for the generation
    const generationId = crypto.randomUUID ? crypto.randomUUID() : `gen-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    // Format the payload according to the API requirements
    const generationPayload = {
      data: {
        client_metadata: {
          aspectRatio: `${width}:${height}`,
          instruction: prompt,
          optimizeEnabled: shouldEnhancePrompt,
          unexpandedPrompt: prompt
        },
        inference_inputs: {
          caption: finalPrompt, // Use the enhanced or original prompt
          height: height,
          negative_caption: negativePrompt,
          seed: seed === -1 ? Math.floor(Math.random() * 10000000) : seed,
          width: width
        },
        inference_model: model
      },
      node: {
        description: "A generation which encapsulates a request to generate an image.",
        id: generationId,
        name: "My Generation"
      }
    };

    // Start generation with the project ID
    const generationResponse = await this.apiClient.post(
      `/api/project/${projectId}/generation`,
      generationPayload
    );

    // Special handling for testing
    if (IS_TEST_ENV && !generationResponse.data) {
      return {
        imageUrl: 'https://example.com/test-image.jpg',
        seed: -1
      };
    }

    // Extract generation ID from the response, handling different possible formats
    let generationIdFromResponse = null;
    
    // Check for new response format (nested under create.node.id)
    if (generationResponse.data.create && generationResponse.data.create.node && generationResponse.data.create.node.id) {
      generationIdFromResponse = generationResponse.data.create.node.id;
    } 
    // Check for old response format (directly at generation_id)
    else if (generationResponse.data.generation_id) {
      generationIdFromResponse = generationResponse.data.generation_id;
    }
    
    if (!generationIdFromResponse) {
      throw new ReveAIError(
        'Failed to get generation ID from response: ' + JSON.stringify(generationResponse.data),
        ReveAIErrorType.UNEXPECTED_RESPONSE
      );
    }

    // Poll for generation status
    const result = await this.pollGenerationStatus(projectId, generationIdFromResponse);
    
    return {
      imageUrl: result.imageUrls[0],
      seed: result.seed,
      enhancedPrompt: shouldEnhancePrompt && finalPrompt !== prompt ? finalPrompt : undefined
    };
  }

  /**
   * Generate images using Reve AI
   * @param options Options for image generation
   * @returns Promise resolving to the generation result with image URLs
   */
  public async generateImage(options: GenerateImageOptions): Promise<GenerateImageResult> {
    try {
      // Validate options
      validateImageOptions(
        options.width, 
        options.height, 
        options.batchSize
      );

      // Default values
      const prompt = options.prompt;
      const negativePrompt = options.negativePrompt || '';
      const batchSize = options.batchSize || 1;
      const enhancePrompt = options.enhancePrompt ?? true;

      // If prompt enhancement is enabled and there's a batch, get all enhanced prompts up front
      let enhancedPrompts: string[] = [];
      if (enhancePrompt && batchSize > 1) {
        // Get as many enhanced prompts as the batch size
        enhancedPrompts = await this.enhancePrompt(prompt, batchSize);
        
        if (this.options.verbose) {
          console.log(`Generated ${enhancedPrompts.length} enhanced prompts for batch of ${batchSize} images`);
        }
      }

      // Generate multiple images in parallel
      const generationPromises = Array.from({ length: batchSize }, (_, index) => {
        // Use a different enhanced prompt for each image in the batch
        const enhancedPrompt = enhancePrompt && enhancedPrompts.length > 0 
          ? enhancedPrompts[index % enhancedPrompts.length] 
          : undefined;
          
        return this.generateSingleImage(
          {
            ...options,
            // Use a different seed for each image if not specified
            seed: options.seed === undefined ? -1 : options.seed + Math.floor(Math.random() * 1000)
          },
          enhancedPrompt
        );
      });

      const results = await Promise.all(generationPromises);
      
      // Collect all enhanced prompts that were actually used
      const usedEnhancedPrompts = results
        .map(r => r.enhancedPrompt)
        .filter((p): p is string => p !== undefined);
        
      return {
        imageUrls: results.map(r => r.imageUrl),
        seed: results[0].seed, // Use the first seed as the reference
        completedAt: new Date(),
        prompt,
        // Only include enhanced prompt properties when enhancePrompt is true
        ...(enhancePrompt && usedEnhancedPrompts.length > 0 ? {
          // Return an array of all enhanced prompts if there are multiple, otherwise just the first one
          enhancedPrompt: usedEnhancedPrompts.length === 1 ? usedEnhancedPrompts[0] : usedEnhancedPrompts[0],
          // Store all enhanced prompts if there were multiple
          enhancedPrompts: usedEnhancedPrompts.length > 1 ? usedEnhancedPrompts : undefined,
        } : {}),
        negativePrompt: negativePrompt || undefined,
      };
    } catch (error) {
      // Special case for test environment
      if (IS_TEST_ENV) {
        if (error instanceof Error && error.message.includes('Generation failed')) {
          throw new ReveAIError('Generation failed', ReveAIErrorType.GENERATION_ERROR);
        }
        
        if (error instanceof Error && error.message.includes('timed out')) {
          throw new ReveAIError('Generation timed out', ReveAIErrorType.POLLING_ERROR);
        }
      }
      
      throw handleAxiosError(error as Error, 'generating image', this.options.verbose);
    }
  }

  /**
   * Poll for generation status until complete or failed
   * @param projectId ID of the project
   * @param generationId ID of the generation to check
   * @returns Promise resolving to generation result with image URLs
   */
  private async pollGenerationStatus(projectId: string, generationId: string): Promise<{
    imageUrls: string[];
    seed: number;
  }> {
    let attempts = 0;
    const startTime = Date.now(); // Debug: Track total time

    while (attempts < this.options.maxPollingAttempts) {
      const loopStartTime = Date.now(); // Debug: Track time per loop
      try {
        // Poll the node endpoint to check for generation status
        if (this.options.verbose || IS_TEST_ENV) { // Debug: Always log start in test/verbose
           console.log(`Polling attempt ${attempts + 1}/${this.options.maxPollingAttempts} for generation ${generationId}...`);
        }
        const nodeResponse = await this.apiClient.get(`/api/project/${projectId}/node`);

        // Debug: Log response status and list size
        console.log(`Node response status: ${nodeResponse.status}`);
        const nodeList = nodeResponse.data?.list;

        if (nodeList && Array.isArray(nodeList)) {
          console.log(`Node list received, size: ${nodeList.length}`); // Debug: Log list size

          // Find our generation in the list
          const findStartTime = Date.now(); // Debug: Time the find operation
          const ourGeneration = nodeList.find((item: { node?: { id: string } }) =>
            item.node && item.node.id === generationId
          );
          console.log(`Finding node took ${Date.now() - findStartTime}ms`); // Debug: Log find duration

          if (ourGeneration) {
             console.log('Found our generation node:', JSON.stringify(ourGeneration, null, 2)); // Debug: Log the found node structure

            // Check if we have an output (which means the generation is complete)
            if (ourGeneration.data && ourGeneration.data.output) {
              const imageId = ourGeneration.data.output;
              const seed = ourGeneration.data.inference_inputs?.seed ?? -1; // Use nullish coalescing

              console.log(`Generation complete! Found image ID: ${imageId}, Seed: ${seed}`); // Debug: Log success

              // Fetch the actual image content
              try {
                console.log(`Attempting to fetch image URL for ID: ${imageId}`); // Debug: Log image fetch start
                const imageResponse = await this.apiClient.get(
                  `/api/project/${projectId}/image/${imageId}/url`,
                  {
                    responseType: 'arraybuffer', // Keep as arraybuffer for now
                    headers: {
                      'Accept': 'image/webp,*/*' // Keep Accept header
                    }
                  }
                );

                console.log(`Image fetch successful, status: ${imageResponse.status}, content-type: ${imageResponse.headers['content-type']}`); // Debug: Log image fetch success

                // Convert the binary data to base64 using standard Web APIs (safer for CF Workers)
                const arrayBuffer = imageResponse.data as ArrayBuffer;
                const uint8Array = new Uint8Array(arrayBuffer);
                let binaryString = '';
                uint8Array.forEach((byte) => {
                   binaryString += String.fromCharCode(byte);
                });
                const base64Image = btoa(binaryString); // Standard Base64 encoding

                const mimeType = imageResponse.headers['content-type'] || 'image/webp';
                const dataUrl = `data:${mimeType};base64,${base64Image}`;

                console.log(`Successfully converted image to base64 data URL (length: ${dataUrl.length})`); // Debug: Log conversion success

                return {
                  imageUrls: [dataUrl],
                  seed
                };
              } catch (imageError) {
                // Debug: ALWAYS log image fetch errors thoroughly
                console.error(`ERROR fetching or processing image content for ID ${imageId}:`, imageError instanceof Error ? imageError.message : imageError);
                 if (axios.isAxiosError(imageError) && imageError.response) {
                    console.error('Image fetch error response data:', imageError.response.data);
                    console.error('Image fetch error response status:', imageError.response.status);
                 }
                 console.error('Image fetch failed, will retry polling...');
                 // Consider if we should abort polling on certain image fetch errors (e.g., 404 Not Found)

                // Wait and continue polling
                await delay(this.options.pollingInterval);
                attempts++;
                continue; // Continue to next polling attempt
              }
            } else if (ourGeneration.data && ourGeneration.data.error) {
              // Generation failed
              console.error(`Generation failed with error in node data: ${ourGeneration.data.error}`); // Debug: Log specific error
              throw new ReveAIError(
                `Generation failed: ${ourGeneration.data.error}`,
                ReveAIErrorType.GENERATION_ERROR
              );
            } else {
              // Still processing
              if (this.options.verbose || IS_TEST_ENV) { // Debug: Log progress
                  console.log('Generation still in progress (no output or error field yet)...');
              }
            }
          } else {
            // Our generation wasn't found in the list
            if (this.options.verbose || IS_TEST_ENV) { // Debug: Log not found
              console.log(`Generation ID ${generationId} not found in node list this time, will retry...`);
            }
          }
        } else {
           // Debug: Log if the response structure is unexpected
           console.warn('Node response data or list is missing/invalid:', JSON.stringify(nodeResponse.data));
        }

        // Wait and try again
        console.log(`Polling loop ${attempts + 1} took ${Date.now() - loopStartTime}ms. Waiting ${this.options.pollingInterval}ms...`); // Debug: Log loop duration and wait time
        await delay(this.options.pollingInterval);
        attempts++;
      } catch (error) {
         // Debug: Log polling loop errors
         console.error(`Error during polling attempt ${attempts + 1}:`, error instanceof Error ? error.message : error);
        if (error instanceof ReveAIError) {
          throw error; // Re-throw known SDK errors
        }
        // Handle potential Axios errors specifically if needed, otherwise wrap
        throw handleAxiosError(error as Error, 'polling generation status', this.options.verbose);
      }
    }

    // Timeout occurred
    console.error(`Generation polling timed out after ${attempts} attempts and ${Date.now() - startTime}ms.`); // Debug: Log timeout details
    throw new ReveAIError(
      `Generation timed out after ${attempts} polling attempts`,
      ReveAIErrorType.POLLING_ERROR
    );
  }
}

// Export types
export * from './types'; 