/**
 * room-editing.ts - Cloud Functions for Chat-Based Room Editing
 * 
 * Supports multi-turn conversational editing using Nano Banana Pro
 * with session persistence in Firestore.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { google } from '@google-cloud/aiplatform';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

// Initialize services
const db = admin.firestore();
const storage = new Storage();
const BUCKET_NAME = process.env.STORAGE_BUCKET || 'ar-designer-kit-assets';

// ============================================================================
// Types
// ============================================================================

interface ConversationTurn {
  role: 'user' | 'model';
  parts: Array<{
    text?: string;
    imageUrl?: string;
    inlineData?: {
      mimeType: string;
      data: string;  // base64
    };
  }>;
  timestamp: FirebaseFirestore.Timestamp;
}

interface EditingSession {
  id: string;
  userId: string;
  projectId: string;
  roomId: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  history: ConversationTurn[];
  currentImageUrl?: string;
  metadata: {
    roomType?: string;
    baseStyle?: string;
    editCount: number;
  };
}

interface StyleVariation {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  thumbnailUrl: string;
}

interface GeneratedTexture {
  id: string;
  name: string;
  materialType: string;
  imageUrl: string;
  thumbnailUrl: string;
  resolution: string;
  isSeamless: boolean;
}

// ============================================================================
// Gemini Client Setup
// ============================================================================

import { GoogleGenAI } from '@google/genai';

const genai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODELS = {
  FLASH: 'gemini-2.5-flash',
  PRO: 'gemini-2.5-pro',
  NANO_BANANA: 'gemini-2.5-flash-image',
  NANO_BANANA_PRO: 'gemini-3-pro-image-preview',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Upload image buffer to Cloud Storage
 */
async function uploadImage(
  buffer: Buffer,
  path: string,
  contentType: string = 'image/png'
): Promise<string> {
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(path);
  
  await file.save(buffer, {
    metadata: { contentType },
    resumable: false,
  });
  
  // Make publicly readable
  await file.makePublic();
  
  return `https://storage.googleapis.com/${BUCKET_NAME}/${path}`;
}

/**
 * Generate thumbnail from image buffer
 */
async function generateThumbnail(
  buffer: Buffer,
  maxWidth: number = 256
): Promise<Buffer> {
  // Using sharp for image processing (add to package.json)
  const sharp = require('sharp');
  return sharp(buffer)
    .resize(maxWidth, null, { withoutEnlargement: true })
    .png()
    .toBuffer();
}

/**
 * Convert Firestore history to Gemini content format
 */
function historyToContents(history: ConversationTurn[]): any[] {
  return history.map(turn => ({
    role: turn.role,
    parts: turn.parts.map(part => {
      if (part.text) {
        return { text: part.text };
      }
      if (part.inlineData) {
        return {
          inlineData: {
            mimeType: part.inlineData.mimeType,
            data: part.inlineData.data,
          },
        };
      }
      return { text: '' };
    }),
  }));
}

/**
 * Extract image from Gemini response parts
 */
function extractImageFromResponse(response: any): { imageData: Buffer | null; text: string } {
  let imageData: Buffer | null = null;
  let text = '';
  
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    // Skip thinking parts
    if (part.thought) continue;
    
    if (part.text) {
      text += part.text;
    }
    if (part.inlineData?.data) {
      imageData = Buffer.from(part.inlineData.data, 'base64');
    }
  }
  
  return { imageData, text };
}

// ============================================================================
// Cloud Functions
// ============================================================================

/**
 * Create a new room editing session
 */
export const createEditingSession = functions.https.onCall(
  async (data, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const { projectId, roomId, initialImageBase64, mimeType = 'image/jpeg' } = data;
    
    if (!projectId || !roomId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing projectId or roomId');
    }
    
    const userId = context.auth.uid;
    const sessionId = uuidv4();
    const now = admin.firestore.Timestamp.now();
    
    // Upload initial image if provided
    let initialImageUrl: string | undefined;
    if (initialImageBase64) {
      const buffer = Buffer.from(initialImageBase64, 'base64');
      const imagePath = `users/${userId}/projects/${projectId}/sessions/${sessionId}/original.${mimeType.split('/')[1]}`;
      initialImageUrl = await uploadImage(buffer, imagePath, mimeType);
    }
    
    // Create session document
    const session: EditingSession = {
      id: sessionId,
      userId,
      projectId,
      roomId,
      createdAt: now,
      updatedAt: now,
      history: [],
      currentImageUrl: initialImageUrl,
      metadata: {
        editCount: 0,
      },
    };
    
    await db
      .collection('users')
      .doc(userId)
      .collection('editingSessions')
      .doc(sessionId)
      .set(session);
    
    return {
      sessionId,
      initialImageUrl,
    };
  }
);

/**
 * Send an edit to an existing session
 */
export const sendRoomEdit = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const {
      sessionId,
      prompt,
      newImageBase64,
      mimeType = 'image/jpeg',
      aspectRatio = '16:9',
      imageSize = '2K',
    } = data;
    
    if (!sessionId || !prompt) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing sessionId or prompt');
    }
    
    const userId = context.auth.uid;
    
    // Get session
    const sessionRef = db
      .collection('users')
      .doc(userId)
      .collection('editingSessions')
      .doc(sessionId);
    
    const sessionDoc = await sessionRef.get();
    if (!sessionDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Session not found');
    }
    
    const session = sessionDoc.data() as EditingSession;
    
    // Build user message parts
    const userParts: any[] = [];
    
    // Add new image if provided
    if (newImageBase64) {
      userParts.push({
        inlineData: {
          mimeType,
          data: newImageBase64,
        },
      });
    }
    
    // Add prompt
    userParts.push({ text: prompt });
    
    // Build contents from history + new message
    const contents = historyToContents(session.history);
    contents.push({ role: 'user', parts: userParts });
    
    // Call Gemini
    const response = await genai.models.generateContent({
      model: MODELS.NANO_BANANA_PRO,
      contents,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio,
          imageSize,
        },
      },
    });
    
    // Extract result
    const { imageData, text } = extractImageFromResponse(response);
    
    // Upload generated image
    let generatedImageUrl: string | undefined;
    if (imageData) {
      const editNum = session.metadata.editCount + 1;
      const imagePath = `users/${userId}/projects/${session.projectId}/sessions/${sessionId}/edit_${editNum}.png`;
      generatedImageUrl = await uploadImage(imageData, imagePath);
    }
    
    // Update session history
    const now = admin.firestore.Timestamp.now();
    
    // Add user turn
    session.history.push({
      role: 'user',
      parts: newImageBase64
        ? [{ inlineData: { mimeType, data: newImageBase64 } }, { text: prompt }]
        : [{ text: prompt }],
      timestamp: now,
    });
    
    // Add model turn
    const modelParts: any[] = [];
    if (text) modelParts.push({ text });
    if (generatedImageUrl) modelParts.push({ imageUrl: generatedImageUrl });
    
    session.history.push({
      role: 'model',
      parts: modelParts,
      timestamp: now,
    });
    
    // Update session
    await sessionRef.update({
      history: session.history,
      updatedAt: now,
      currentImageUrl: generatedImageUrl || session.currentImageUrl,
      'metadata.editCount': session.metadata.editCount + 1,
    });
    
    return {
      imageUrl: generatedImageUrl,
      text,
      editCount: session.metadata.editCount + 1,
    };
  }
);

/**
 * Generate style variations for a room
 */
export const generateStyleVariations = functions
  .runWith({ timeoutSeconds: 300, memory: '2GB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const {
      projectId,
      roomId,
      imageBase64,
      mimeType = 'image/jpeg',
      baseStyle,
      numberOfVariations = 4,
    } = data;
    
    if (!projectId || !roomId || !imageBase64 || !baseStyle) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }
    
    const userId = context.auth.uid;
    const variationId = uuidv4();
    
    // Style modifiers for variations
    const styleModifiers = [
      { id: 'warm', name: 'Warm & Cozy', modifier: 'warm earth tones, soft textures, ambient lighting' },
      { id: 'cool', name: 'Cool & Modern', modifier: 'cool tones, clean lines, minimalist aesthetic' },
      { id: 'natural', name: 'Natural & Organic', modifier: 'natural materials, plants, earthy elements' },
      { id: 'luxurious', name: 'Luxurious & Elegant', modifier: 'premium materials, rich colors, sophisticated details' },
      { id: 'bright', name: 'Bright & Airy', modifier: 'light colors, open feel, maximum natural light' },
    ].slice(0, Math.min(numberOfVariations, 5));
    
    const variations: StyleVariation[] = [];
    
    // Generate each variation
    for (const modifier of styleModifiers) {
      const prompt = `Transform this room with a ${baseStyle} style featuring ${modifier.modifier}.
      
Create a professional interior design visualization that:
- Preserves the room's structure and layout
- Applies the style consistently throughout
- Looks realistic and achievable
- Maintains proper lighting and perspective`;

      try {
        const response = await genai.models.generateContent({
          model: MODELS.NANO_BANANA_PRO,
          contents: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            { text: prompt },
          ],
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: {
              aspectRatio: '16:9',
              imageSize: '2K',
            },
          },
        });
        
        const { imageData, text } = extractImageFromResponse(response);
        
        if (imageData) {
          // Upload full image
          const imagePath = `users/${userId}/projects/${projectId}/rooms/${roomId}/variations/${variationId}/${modifier.id}.png`;
          const imageUrl = await uploadImage(imageData, imagePath);
          
          // Generate and upload thumbnail
          const thumbnail = await generateThumbnail(imageData);
          const thumbPath = `users/${userId}/projects/${projectId}/rooms/${roomId}/variations/${variationId}/${modifier.id}_thumb.png`;
          const thumbnailUrl = await uploadImage(thumbnail, thumbPath);
          
          variations.push({
            id: modifier.id,
            name: modifier.name,
            description: text || `${baseStyle} style with ${modifier.modifier}`,
            imageUrl,
            thumbnailUrl,
          });
        }
      } catch (error) {
        console.error(`Failed to generate variation ${modifier.id}:`, error);
      }
    }
    
    // Store variations in Firestore
    await db
      .collection('users')
      .doc(userId)
      .collection('projects')
      .doc(projectId)
      .collection('rooms')
      .doc(roomId)
      .collection('styleVariations')
      .doc(variationId)
      .set({
        id: variationId,
        baseStyle,
        variations,
        createdAt: admin.firestore.Timestamp.now(),
      });
    
    return {
      variationId,
      variations,
    };
  });

/**
 * Generate a seamless texture
 */
export const generateTexture = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const {
      projectId,
      materialDescription,
      materialType = 'generic',
      resolution = '2K',
    } = data;
    
    if (!projectId || !materialDescription) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }
    
    const userId = context.auth.uid;
    const textureId = uuidv4();
    
    const prompt = `Create a seamless tileable texture for: ${materialDescription}

Requirements:
- Must be perfectly tileable (edges match when repeated)
- High detail and realistic appearance
- Suitable for 3D rendering and AR visualization
- Professional quality interior design material
- Even lighting with no visible seams
- Square format for easy tiling`;

    // Use Pro model for resolution control
    const response = await genai.models.generateContent({
      model: MODELS.NANO_BANANA_PRO,
      contents: [prompt],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: '1:1',
          imageSize: resolution,
        },
      },
    });
    
    const { imageData, text } = extractImageFromResponse(response);
    
    if (!imageData) {
      throw new functions.https.HttpsError('internal', 'Failed to generate texture');
    }
    
    // Upload texture
    const imagePath = `users/${userId}/projects/${projectId}/textures/${textureId}.png`;
    const imageUrl = await uploadImage(imageData, imagePath);
    
    // Generate and upload thumbnail
    const thumbnail = await generateThumbnail(imageData, 128);
    const thumbPath = `users/${userId}/projects/${projectId}/textures/${textureId}_thumb.png`;
    const thumbnailUrl = await uploadImage(thumbnail, thumbPath);
    
    const texture: GeneratedTexture = {
      id: textureId,
      name: materialDescription,
      materialType,
      imageUrl,
      thumbnailUrl,
      resolution,
      isSeamless: true,
    };
    
    // Store in Firestore
    await db
      .collection('users')
      .doc(userId)
      .collection('projects')
      .doc(projectId)
      .collection('textures')
      .doc(textureId)
      .set({
        ...texture,
        createdAt: admin.firestore.Timestamp.now(),
      });
    
    return texture;
  }
);

/**
 * Get product recommendations with Google Search grounding
 */
export const getProductRecommendations = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const {
      roomAnalysis,
      budget = 'medium',
      style,
      priorities = [],
    } = data;
    
    if (!roomAnalysis) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing roomAnalysis');
    }
    
    const budgetRanges: Record<string, string> = {
      low: 'budget-friendly under $500',
      medium: 'mid-range $500-2000',
      high: 'premium $2000-5000',
      luxury: 'luxury over $5000',
    };
    
    const prompt = `Based on this room analysis, recommend specific furniture and decor products.

Room Type: ${roomAnalysis.roomType}
Room Dimensions: ${roomAnalysis.dimensions?.estimatedWidth || 0}m x ${roomAnalysis.dimensions?.estimatedLength || 0}m
Style Recommendations: ${(roomAnalysis.styleRecommendations || []).join(', ')}
User Preferred Style: ${style || 'Not specified'}
Budget Range: ${budgetRanges[budget] || 'Not specified'}
Priorities: ${priorities.length > 0 ? priorities.join(', ') : 'Not specified'}

Search for REAL products currently available from major retailers. Provide 5-8 recommendations as a JSON array:
[
  {
    "name": "Product Name",
    "brand": "Brand Name",
    "priceRange": "$X - $Y",
    "retailer": "Store Name",
    "fitRationale": "Why this fits the room",
    "searchQuery": "search terms to find this product"
  }
]

Return ONLY valid JSON array.`;

    const response = await genai.models.generateContent({
      model: MODELS.NANO_BANANA_PRO,
      contents: [prompt],
      config: {
        responseModalities: ['TEXT'],
        tools: [{ googleSearch: {} }],
      },
    });
    
    const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    
    try {
      // Clean up response if needed
      let cleanJson = responseText;
      if (responseText.includes('```json')) {
        cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      
      const recommendations = JSON.parse(cleanJson);
      
      // Get search metadata if available
      const searchQueries = response.candidates?.[0]?.groundingMetadata?.webSearchQueries || [];
      
      return {
        recommendations,
        searchQueries,
      };
    } catch (error) {
      console.error('Failed to parse recommendations:', responseText);
      return {
        recommendations: [],
        searchQueries: [],
        error: 'Failed to parse recommendations',
      };
    }
  }
);

/**
 * Analyze room and create initial session with analysis
 */
export const analyzeAndCreateSession = functions
  .runWith({ timeoutSeconds: 120, memory: '1GB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const {
      projectId,
      roomId,
      imageBase64,
      mimeType = 'image/jpeg',
    } = data;
    
    if (!projectId || !roomId || !imageBase64) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }
    
    const userId = context.auth.uid;
    
    // Analyze room using Flash model (fast)
    const analysisPrompt = `You are an expert interior designer and architect.
Analyze this room image and provide a JSON object with:

{
  "roomType": "living room/bedroom/kitchen/etc",
  "dimensions": {
    "estimatedWidth": <meters>,
    "estimatedLength": <meters>,
    "estimatedHeight": <meters>
  },
  "lightingSuggestions": ["suggestion1", "suggestion2"],
  "styleRecommendations": ["style1", "style2"],
  "detectedFeatures": ["feature1", "feature2"],
  "currentStyle": "description of current style",
  "improvementAreas": ["area1", "area2"]
}

Return ONLY valid JSON.`;

    const analysisResponse = await genai.models.generateContent({
      model: MODELS.FLASH,
      contents: [
        {
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        },
        { text: analysisPrompt },
      ],
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 128 },
      },
    });
    
    let roomAnalysis;
    try {
      const analysisText = analysisResponse.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      roomAnalysis = JSON.parse(analysisText);
    } catch {
      roomAnalysis = {
        roomType: 'unknown',
        dimensions: {},
        lightingSuggestions: [],
        styleRecommendations: [],
        detectedFeatures: [],
      };
    }
    
    // Create session
    const sessionId = uuidv4();
    const now = admin.firestore.Timestamp.now();
    
    // Upload original image
    const buffer = Buffer.from(imageBase64, 'base64');
    const imagePath = `users/${userId}/projects/${projectId}/rooms/${roomId}/original.${mimeType.split('/')[1]}`;
    const imageUrl = await uploadImage(buffer, imagePath, mimeType);
    
    // Create session
    const session: EditingSession = {
      id: sessionId,
      userId,
      projectId,
      roomId,
      createdAt: now,
      updatedAt: now,
      history: [],
      currentImageUrl: imageUrl,
      metadata: {
        roomType: roomAnalysis.roomType,
        editCount: 0,
      },
    };
    
    await db
      .collection('users')
      .doc(userId)
      .collection('editingSessions')
      .doc(sessionId)
      .set(session);
    
    // Store room analysis
    await db
      .collection('users')
      .doc(userId)
      .collection('projects')
      .doc(projectId)
      .collection('rooms')
      .doc(roomId)
      .set({
        analysis: roomAnalysis,
        originalImageUrl: imageUrl,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });
    
    return {
      sessionId,
      imageUrl,
      roomAnalysis,
    };
  });

/**
 * Get session history
 */
export const getSessionHistory = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const { sessionId } = data;
    
    if (!sessionId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing sessionId');
    }
    
    const userId = context.auth.uid;
    
    const sessionDoc = await db
      .collection('users')
      .doc(userId)
      .collection('editingSessions')
      .doc(sessionId)
      .get();
    
    if (!sessionDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Session not found');
    }
    
    const session = sessionDoc.data() as EditingSession;
    
    // Map history to client-friendly format
    const history = session.history.map(turn => ({
      role: turn.role,
      text: turn.parts.find(p => p.text)?.text,
      imageUrl: turn.parts.find(p => p.imageUrl)?.imageUrl,
      timestamp: turn.timestamp.toDate().toISOString(),
    }));
    
    return {
      sessionId: session.id,
      projectId: session.projectId,
      roomId: session.roomId,
      currentImageUrl: session.currentImageUrl,
      metadata: session.metadata,
      history,
    };
  }
);

/**
 * Delete a session
 */
export const deleteSession = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    
    const { sessionId } = data;
    
    if (!sessionId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing sessionId');
    }
    
    const userId = context.auth.uid;
    
    // Delete session document
    await db
      .collection('users')
      .doc(userId)
      .collection('editingSessions')
      .doc(sessionId)
      .delete();
    
    // Note: Associated images in Cloud Storage should be cleaned up
    // via a scheduled function or storage lifecycle rules
    
    return { success: true };
  }
);