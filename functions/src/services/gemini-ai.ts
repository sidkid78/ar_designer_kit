/* functions/src/services/gemini-ai.ts */
// functions/src/services/gemini-ai.ts
// AR Designer Kit - Unified Gemini AI Service
// Updated with Nano Banana (gemini-2.5-flash-image) and Nano Banana Pro (gemini-3-pro-image-preview)
// Copyright 2024

import {GenerateContentConfig, GoogleGenAI} from "@google/genai";

// ============================================================================
// Types
// ============================================================================

export interface RecognizedObject {
  label: string;
  confidence: number;
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  category: "architectural" | "furniture" | "fixture" | "other";
}

export interface RoomAnalysis {
  roomType: string;
  dimensions: {
    estimatedWidth: number;
    estimatedLength: number;
    estimatedHeight: number;
  };
  lightingSuggestions: string[];
  styleRecommendations: string[];
  detectedFeatures: string[];
}

export interface GeneratedTexture {
  surfaceType: string;
  textureUrl: string;
  thumbnailUrl: string;
  prompt: string;
}

export interface StyleVariation {
  id: string;
  name: string;
  imageUrl: string;
  description: string;
  _imageData?: Buffer; // Internal use for upload
}

export interface FloorPlanData {
  walls: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }>;
  doors: Array<{ position: { x: number; y: number }; width: number; angle: number }>;
  windows: Array<{ position: { x: number; y: number }; width: number; height: number }>;
  dimensions: { width: number; length: number };
}

export interface ProductRecommendation {
  name: string;
  brand: string;
  priceRange: string;
  retailer: string;
  fitRationale: string;
  searchQuery: string;
}

// ============================================================================
// Gemini Client Configuration
// ============================================================================

// Initialize client - picks up GEMINI_API_KEY from environment
const genai = new GoogleGenAI({});

// Models
const MODELS = {
  // Text + Vision (no image generation)
  FLASH: "gemini-2.5-flash",
  PRO: "gemini-2.5-pro",

  // Native Image Generation (Nano Banana)
  NANO_BANANA: "gemini-2.5-flash-image", // Fast image gen/editing
  NANO_BANANA_PRO: "gemini-3-pro-image-preview", // Advanced, thinking mode, up to 14 ref images
};

// ============================================================================
// Object Recognition (replaces Cloud Vision API)
// ============================================================================

/**
 * Recognize objects in a room scan image using Gemini Vision
 * Uses gemini-2.5-flash for fast object detection
 */
export async function recognizeObjects(
  imageData: Buffer,
  mimeType = "image/jpeg"
): Promise<RecognizedObject[]> {
  const systemPrompt = `You are an expert architectural and interior design feature detector.
Analyze this room image and identify ALL visible objects and architectural features.

For each detected item, provide:
- label: specific name (
    e.g., "wall", 
    "floor", "ceiling", "window", "door", "sofa", "table", "chair", "lamp", "plant", "outlet", "light_switch"
    )
- confidence: 0.0 to 1.0 based on detection certainty
- boundingBox: normalized coordinates (0-1) for minX, minY, maxX, maxY
- category: one of "architectural", "furniture", "fixture", "other"

Categories:
- architectural: walls, floors, ceilings, columns, beams, stairs
- furniture: tables, chairs, sofas, beds, desks, shelves, cabinets
- fixture: windows, doors, outlets, switches, vents, built-in lighting
- other: plants, decorations, artwork, rugs, curtains

Be thorough - detect even partially visible objects. Return results sorted by confidence (highest first).

Respond with a JSON array only.`;

  const response = await genai.models.generateContent({
    model: MODELS.FLASH,
    contents: [
      {
        role: "user",
        parts: [
          {text: systemPrompt},
          {
            inlineData: {
              mimeType,
              data: imageData.toString("base64"),
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      thinkingConfig: {
        thinkingBudget: 0, // Fast detection, no reasoning needed
      },
    },
  });

  try {
    const objects = JSON.parse(response.text || "[]") as RecognizedObject[];
    // Filter low-confidence detections
    return objects.filter((obj) => obj.confidence >= 0.5);
  } catch (e) {
    console.error("Failed to parse object recognition response:", e);
    return [];
  }
}

// ============================================================================
// Room Analysis
// ============================================================================

/**
 * Analyze a room image for design recommendations
 * Uses gemini-2.5-flash with thinking for spatial reasoning
 */
export async function analyzeRoom(
  imageData: Buffer,
  mimeType = "image/jpeg"
): Promise<RoomAnalysis> {
  const systemPrompt = `You are an expert interior designer and architect.
Analyze this room image and provide:

1. roomType: The type of room (living room, bedroom, kitchen, bathroom, office, dining room, etc.)
2. dimensions: Estimated dimensions in meters based on visual cues
3. lightingSuggestions: 3-5 specific lighting improvement recommendations
4. styleRecommendations: 3-5 interior design style recommendations that would suit this space
5. detectedFeatures: Notable architectural or design features present

Consider:
- Current lighting conditions (natural vs artificial)
- Existing furniture and decor style
- Room proportions and flow
- Potential for improvement

Respond with JSON only.`;

  const response = await genai.models.generateContent({
    model: MODELS.FLASH,
    contents: [
      {
        role: "user",
        parts: [
          {text: systemPrompt},
          {
            inlineData: {
              mimeType,
              data: imageData.toString("base64"),
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      thinkingConfig: {
        thinkingBudget: 128, // Enable reasoning for analysis
      },
    },
  });

  try {
    return JSON.parse(response.text || "{}") as RoomAnalysis;
  } catch (e) {
    console.error("Failed to parse room analysis response:", e);
    return {
      roomType: "unknown",
      dimensions: {estimatedWidth: 0, estimatedLength: 0, estimatedHeight: 0},
      lightingSuggestions: [],
      styleRecommendations: [],
      detectedFeatures: [],
    };
  }
}

// ============================================================================
// Style Generation with Nano Banana (Native Image Generation)
// ============================================================================

/**
 * Generate room visualization with applied style using Nano Banana
 * Uses gemini-2.5-flash-image for fast style generation
 */
export async function generateRoomStyle(
  roomImageData: Buffer,
  stylePrompt: string,
  mimeType = "image/jpeg",
  aspectRatio = "16:9"
): Promise<{ imageData: Buffer; description: string }> {
  const enhancedPrompt = `Transform this room image according to the following style:
${stylePrompt}

Important guidelines:
- Preserve the room's basic structure and layout
- Change materials, colors, textures, and decor to match the style
- Maintain realistic lighting that matches the new materials
- Keep the same camera angle and perspective
- Make it look like a professional interior design visualization`;

  const response = await genai.models.generateContent({
    model: MODELS.NANO_BANANA,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: roomImageData.toString("base64"),
            },
          },
          {text: enhancedPrompt},
        ],
      },
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: aspectRatio as any,
      },
    },
  });

  let imageData: Buffer | null = null;
  let description = "";

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.text) {
      description = part.text;
    } else if (part.inlineData) {
      imageData = Buffer.from(part.inlineData.data!, "base64");
    }
  }

  if (!imageData) {
    throw new Error("No image generated");
  }

  return {imageData, description};
}

/**
 * Generate multiple style variations using Nano Banana Pro
 * Uses gemini-3-pro-image-preview for higher quality with thinking
 */
export async function generateStyleVariations(
  roomImageData: Buffer,
  baseStylePrompt: string,
  numberOfVariations = 3,
  mimeType = "image/jpeg"
): Promise<StyleVariation[]> {
  const variations: StyleVariation[] = [];

  // Define style variation modifiers
  const styleModifiers = [
    {id: "warm", name: "Warm & Cozy", modifier: "with warm earth tones, soft textures, and ambient lighting"},
    {id: "cool", name: "Cool & Modern", modifier: "with cool tones, clean lines, and minimalist aesthetic"},
    {id: "natural", name: "Natural & Organic", modifier: "with natural materials, plants, and earthy elements"},
    {id: "luxurious", name: "Luxurious & Elegant", modifier: "with premium materials, rich colors, and sophisticated details"},
    {id: "bright", name: "Bright & Airy", modifier: "with light colors, open feel, and maximum natural light"},
  ];

  const selectedModifiers = styleModifiers.slice(0, numberOfVariations);

  for (const modifier of selectedModifiers) {
    const fullPrompt = `Transform this room with a ${baseStylePrompt} style, ${modifier.modifier}.
    
Create a professional interior design visualization that:
- Preserves the room's structure
- Applies the style consistently throughout
- Looks realistic and achievable`;

    try {
      const response = await genai.models.generateContent({
        model: MODELS.NANO_BANANA_PRO,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: roomImageData.toString("base64"),
                },
              },
              {text: fullPrompt},
            ],
          },
        ],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: "2K",
          },
        },
      });

      let imageData: Buffer | null = null;
      let description = "";

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        // Skip thought parts (intermediate reasoning)
        if ((part as any).thought) continue;

        if (part.text) {
          description = part.text;
        } else if (part.inlineData) {
          imageData = Buffer.from(part.inlineData.data!, "base64");
        }
      }

      if (imageData) {
        variations.push({
          id: modifier.id,
          name: modifier.name,
          imageUrl: "", // Will be set after upload to Cloud Storage
          description: description || `${baseStylePrompt} ${modifier.modifier}`,
          _imageData: imageData, // Store for later upload
        });
      }
    } catch (error) {
      console.error(`Failed to generate variation ${modifier.id}:`, error);
    }
  }

  return variations;
}

/**
 * Generate seamless tileable texture using Nano Banana
 * Perfect for AR material application
 */
export async function generateSeamlessTexture(
  materialPrompt: string,
  resolution: "1K" | "2K" | "4K" = "2K"
): Promise<Buffer> {
  const enhancedPrompt = `Create a seamless tileable texture for: ${materialPrompt}

Requirements:
- Must be perfectly tileable (edges match when repeated)
- High detail and realistic appearance
- Suitable for 3D rendering and AR visualization
- Professional quality interior design material
- Even lighting with no visible seams`;

  const response = await genai.models.generateContent({
    model: MODELS.NANO_BANANA,
    contents: [{role: "user", parts: [{text: enhancedPrompt}]}],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: {
        aspectRatio: "1:1",
        imageSize: resolution,
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return Buffer.from(part.inlineData.data!, "base64");
    }
  }

  throw new Error("No texture generated");
}

// ============================================================================
// Multi-Turn Image Editing (Chat-based)
// ============================================================================

/**
 * Create a chat session for iterative room editing
 * Uses Nano Banana Pro for best multi-turn editing results
 */
export function createRoomEditingSession() {
  return genai.chats.create({
    model: MODELS.NANO_BANANA_PRO,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      tools: [{googleSearch: {}}], // Enable grounding for product suggestions
    },
  });
}

/**
 * Send an edit request to an existing chat session
 */
export async function sendRoomEdit(
  chat: ReturnType<typeof createRoomEditingSession>,
  editPrompt: string,
  newImage?: Buffer,
  mimeType = "image/jpeg",
  aspectRatio?: string,
  imageSize?: "1K" | "2K" | "4K"
): Promise<{ imageData: Buffer | null; text: string }> {
  const parts: any[] = [];

  if (newImage) {
    parts.push({
      inlineData: {
        mimeType,
        data: newImage.toString("base64"),
      },
    });
  }
  parts.push({text: editPrompt});

  const config: GenerateContentConfig = {
    responseModalities: ["TEXT", "IMAGE"],
  };
  if (aspectRatio || imageSize) {
    config.imageConfig = {};
    if (aspectRatio) config.imageConfig.aspectRatio = aspectRatio;
    if (imageSize) config.imageConfig.imageSize = imageSize;
  }

  const response = await chat.sendMessage({message: parts} as any);

  let imageData: Buffer | null = null;
  let text = "";

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    // Skip thought parts
    if ((part as any).thought) continue;

    if (part.text) {
      text += part.text;
    } else if (part.inlineData) {
      imageData = Buffer.from(part.inlineData.data!, "base64");
    }
  }

  return {imageData, text};
}

// ============================================================================
// Floor Plan Generation
// ============================================================================

/**
 * Generate floor plan data from room image
 * Uses gemini-2.5-pro for complex spatial reasoning
 */
export async function generateFloorPlan(
  imageData: Buffer,
  recognizedObjects: RecognizedObject[],
  mimeType = "image/jpeg"
): Promise<FloorPlanData> {
  const objectContext = recognizedObjects
    .filter((obj) => ["wall", "door", "window", "floor"].some((type) => obj.label.includes(type)))
    .map((obj) => `${obj.label} at (${obj.boundingBox.minX.toFixed(2)}, ${obj.boundingBox.minY.toFixed(2)})`)
    .join(", ");

  const systemPrompt = `You are an expert architect analyzing a room image to generate a 2D floor plan.

Detected features: ${objectContext}

Based on this image and detected features, generate a floor plan with:
1. walls: Array of wall segments with start and end coordinates (in meters, origin at room corner)
2. doors: Array of doors with position, width (meters), and opening angle (degrees)
3. windows: Array of windows with position, width, and height (in meters)
4. dimensions: Overall room width and length in meters

Use visual perspective cues to estimate real-world dimensions. Standard ceiling height is ~2.5m for reference.

Respond with JSON only.`;

  const response = await genai.models.generateContent({
    model: MODELS.PRO,
    contents: [
      {
        role: "user",
        parts: [
          {text: systemPrompt},
          {
            inlineData: {
              mimeType,
              data: imageData.toString("base64"),
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      thinkingConfig: {
        thinkingBudget: 256, // Extended reasoning for spatial analysis
      },
    },
  });

  try {
    return JSON.parse(response.text || "{}") as FloorPlanData;
  } catch (e) {
    console.error("Failed to parse floor plan response:", e);
    return {
      walls: [],
      doors: [],
      windows: [],
      dimensions: {width: 0, length: 0},
    };
  }
}

// ============================================================================
// Product Recommendations with Google Search Grounding
// ============================================================================

/**
 * Get product recommendations using Google Search grounding
 * Uses Nano Banana Pro with Google Search tool
 */
export async function getProductRecommendations(
  roomAnalysis: RoomAnalysis,
  userPreferences: {
    budget?: "low" | "medium" | "high" | "luxury";
    style?: string;
    priorities?: string[];
  }
): Promise<ProductRecommendation[]> {
  const budgetRange = {
    low: "budget-friendly under $500",
    medium: "mid-range $500-2000",
    high: "premium $2000-5000",
    luxury: "luxury over $5000",
  };

  const prompt = `Based on this room analysis and user preferences, recommend specific furniture and decor products.

Room Type: ${roomAnalysis.roomType}
Room Dimensions: ${roomAnalysis.dimensions.estimatedWidth}m x ${roomAnalysis.dimensions.estimatedLength}m
Style Recommendations: ${roomAnalysis.styleRecommendations.join(", ")}
User Preferred Style: ${userPreferences.style || "Not specified"}
Budget Range: ${userPreferences.budget ? budgetRange[userPreferences.budget] : "Not specified"}
Priorities: ${userPreferences.priorities?.join(", ") || "Not specified"}

Provide 5-8 specific product recommendations with:
- Actual product names and brands
- Realistic price ranges
- Where to buy (major retailers)
- Why this product fits the space

Search for current products available in the market.

Respond with a JSON array of recommendations.`;

  const response = await genai.models.generateContent({
    model: MODELS.NANO_BANANA_PRO,
    contents: [{role: "user", parts: [{text: prompt}]}],
    config: {
      responseModalities: ["TEXT"],
      tools: [{googleSearch: {}}],
      responseMimeType: "application/json",
    },
  });

  try {
    return JSON.parse(response.text || "[]") as ProductRecommendation[];
  } catch (e) {
    console.error("Failed to parse product recommendations:", e);
    return [];
  }
}

// ============================================================================
// Batch Processing
// ============================================================================

/**
 * Process multiple frames for object recognition
 * Batches requests to avoid rate limiting
 */
export async function batchRecognizeObjects(
  frames: Array<{ data: Buffer; mimeType: string }>,
  batchSize = 5
): Promise<RecognizedObject[]> {
  const allObjects: RecognizedObject[] = [];

  for (let i = 0; i < frames.length; i += batchSize) {
    const batch = frames.slice(i, i + batchSize);
    const batchPromises = batch.map((frame) =>
      recognizeObjects(frame.data, frame.mimeType)
    );

    const batchResults = await Promise.all(batchPromises);

    for (const objects of batchResults) {
      allObjects.push(...objects);
    }

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < frames.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Deduplicate based on spatial proximity
  return mergeDetections(allObjects);
}

/**
 * Merge duplicate detections based on spatial proximity
 */
function mergeDetections(objects: RecognizedObject[]): RecognizedObject[] {
  const merged: RecognizedObject[] = [];
  const used = new Set<number>();

  for (let i = 0; i < objects.length; i++) {
    if (used.has(i)) continue;

    const current = objects[i];
    let bestConfidence = current.confidence;
    let bestObject = current;

    for (let j = i + 1; j < objects.length; j++) {
      if (used.has(j)) continue;

      const other = objects[j];

      // Check if same label and spatially close
      if (current.label === other.label && isSpatiallyClose(current.boundingBox, other.boundingBox, 0.1)) {
        used.add(j);
        if (other.confidence > bestConfidence) {
          bestConfidence = other.confidence;
          bestObject = other;
        }
      }
    }

    merged.push(bestObject);
  }

  return merged;
}

function isSpatiallyClose(
  box1: RecognizedObject["boundingBox"],
  box2: RecognizedObject["boundingBox"],
  threshold: number
): boolean {
  const center1 = {x: (box1.minX + box1.maxX) / 2, y: (box1.minY + box1.maxY) / 2};
  const center2 = {x: (box2.minX + box2.maxX) / 2, y: (box2.minY + box2.maxY) / 2};

  const distance = Math.sqrt(
    Math.pow(center1.x - center2.x, 2) + Math.pow(center1.y - center2.y, 2)
  );

  return distance < threshold;
}

// ============================================================================
// Export all functions
// ============================================================================

export default {
  recognizeObjects,
  analyzeRoom,
  generateRoomStyle,
  generateStyleVariations,
  generateSeamlessTexture,
  createRoomEditingSession,
  sendRoomEdit,
  generateFloorPlan,
  getProductRecommendations,
  batchRecognizeObjects,
};
