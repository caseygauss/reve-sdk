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

  /**
   * Reve version cookie value
   */
  reve_version: string;
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
 * Result of an image generation
 */
export interface GenerateImageResult {
  /**
   * Array of URLs to the generated images
   */
  imageUrls: string[];

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
   * The enhanced prompt used for generation (if prompt enhancement was enabled)
   * For single image generations, this will be the enhanced prompt used
   * For multi-image generations, this will be the first enhanced prompt used
   */
  enhancedPrompt?: string;

  /**
   * Array of all enhanced prompts used for generation (for multi-image generations)
   * Only provided when batch size > 1 and multiple different enhanced prompts were used
   */
  enhancedPrompts?: string[];

  /**
   * Any negative prompt used for generation
   */
  negativePrompt?: string;
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