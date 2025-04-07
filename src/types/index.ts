/**
 * Authentication options for the Reve AI SDK
 */
export interface AuthOptions {
  /**
   * Authorization header value (Bearer token)
   */
  authorization: string;

  /**
   * Cookie value for authentication
   */
  cookie: string;
}

/**
 * Configuration options for the Reve AI SDK
 */
export interface ReveAIOptions {
  /**
   * Authentication options
   */
  auth: AuthOptions;

  /**
   * Project ID to use for generations
   * If not provided, the SDK will try to use a default project
   */
  projectId?: string;

  /**
   * Base URL for the Reve AI API
   * @default "https://preview.reve.art"
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Maximum number of polling attempts when checking generation status
   * @default 60
   */
  maxPollingAttempts?: number;

  /**
   * Polling interval in milliseconds
   * @default 2000
   */
  pollingInterval?: number;
  
  /**
   * Enable verbose logging of requests and responses
   * @default false
   */
  verbose?: boolean;

  /**
   * Custom headers to add to every request
   * These will be merged with the default headers
   */
  customHeaders?: Record<string, string>;
}

/**
 * Options for generating an image
 */
export interface GenerateImageOptions {
  /**
   * The prompt to generate the image from
   */
  prompt: string;

  /**
   * Negative prompt to exclude certain features from the image
   */
  negativePrompt?: string;

  /**
   * Width of the output image
   * @default 1024
   */
  width?: number;

  /**
   * Height of the output image
   * @default 1024
   */
  height?: number;

  /**
   * Seed for reproducible generations
   * Set to -1 for random seed
   * @default -1
   */
  seed?: number;

  /**
   * Number of images to generate
   * @default 1
   */
  batchSize?: number;
  
  /**
   * Model to use for generation
   * @default "text2image_v1/prod/20250325-2246"
   */
  model?: string;

  /**
   * Whether to enhance the prompt automatically
   * @default true
   */
  enhancePrompt?: boolean;
}

/**
 * Options for editing an existing image
 */
export interface EditImageOptions extends Omit<GenerateImageOptions, 'batchSize' | 'enhancePrompt'> {
  /**
   * The instruction describing the edit to be applied
   */
  instruction: string;

  /**
   * The generation ID of the image to be edited
   */
  originatingGeneration: string;

  /**
   * Optional: The enhanced prompt (caption) from the original image generation.
   * Used as context for generating the edit prompt.
   */
  originalCaption?: string;

  /**
   * Optional: Annotated prompt (if available from a previous step or context)
   * This can sometimes help guide the edit more precisely.
   */
  annotatedPrompt?: string;
}

/**
 * Result of an image generation or edit operation
 */
export interface BaseImageResult {
  /**
   * Unique ID for the generated image
   * Note: For batch operations, this reflects the ID of the *first* image.
   */
  generationId: string;

  /**
   * URL to the generated image
   */
  imageUrl: string;

  /**
   * The seed that was used for generation
   */
  seed: number;

  /**
   * Timestamp when the generation was completed
   */
  completedAt: Date;

  /**
   * The original prompt used for generation
   */
  prompt: string;

  /**
   * Any negative prompt used for generation
   */
  negativePrompt?: string;
}

/**
 * Result of an image generation operation
 */
export interface GenerateImageResult {
  /**
   * Array of unique IDs for each generated image in the batch
   */
  generationIds: string[];

  /**
   * Array of URLs to the generated images
   */
  imageUrls: string[];

  /**
   * The seed that was used for generation (usually the seed of the first image)
   */
  seed: number;

  /**
   * Timestamp when the generation was completed
   */
  completedAt: Date;

  /**
   * The original prompt used for generation
   */
  prompt: string;

  /**
   * The actual caption used for generation (could be the original or enhanced prompt).
   * Only provided when batch size is 1.
   */
  caption?: string;

  /**
   * Array of all captions used for generation (could be original or enhanced prompts).
   * Only provided when batch size > 1.
   */
  captions?: string[];

  /**
   * The enhanced prompt used for generation (if prompt enhancement was enabled).
   * For single image generations, this will be the enhanced prompt used.
   * For multi-image generations, this will be the first enhanced prompt used.
   */
  enhancedPrompt?: string;

  /**
   * Array of all enhanced prompts used for generation (for multi-image generations).
   * Only provided when batch size > 1 and multiple different enhanced prompts were used.
   */
  enhancedPrompts?: string[];

  /**
   * Any negative prompt used for generation
   */
  negativePrompt?: string;
}

/**
 * Result of an image edit operation
 */
export interface EditImageResult extends BaseImageResult {
  /**
   * The instruction used for the edit
   */
  instruction: string;

  /**
   * The generation ID of the original image that was edited
   */
  originatingGeneration: string;

  /**
   * The final enhanced prompt generated and used for this specific edit.
   */
  finalCaption: string;

  /**
   * The annotated prompt that might have been used during the edit
   */
  annotatedPrompt?: string;
}

/**
 * Status of a generation task
 */
export enum GenerationStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Error types that can occur during SDK operations
 */
export enum ReveAIErrorType {
  AUTHENTICATION_ERROR = 'authentication_error',
  API_ERROR = 'api_error',
  REQUEST_ERROR = 'request_error',
  TIMEOUT_ERROR = 'timeout_error',
  GENERATION_ERROR = 'generation_error',
  POLLING_ERROR = 'polling_error',
  UNEXPECTED_RESPONSE = 'unexpected_response',
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * Custom error class for SDK errors
 */
export class ReveAIError extends Error {
  type: ReveAIErrorType;
  statusCode?: number;
  
  constructor(message: string, type: ReveAIErrorType = ReveAIErrorType.UNKNOWN_ERROR, statusCode?: number) {
    super(message);
    this.name = 'ReveAIError';
    this.type = type;
    this.statusCode = statusCode;
  }
} 