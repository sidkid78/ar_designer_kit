// functions/src/room-scanning.ts
// Cloud Functions for photo-based room scanning with Gemini Vision
// Part of AR Designer Kit

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import {
  recognizeObjects,
  analyzeRoom,
  generateFloorPlan,
  type RecognizedObject,
  type RoomAnalysis,
  type FloorPlanData,
} from "./services/gemini-ai";

const db = getFirestore();
const storage = getStorage();

// ============================================================================
// Types
// ============================================================================

interface AnalyzeRoomPhotosRequest {
  projectId: string;
  scanId: string;
  photoUrls: string[];
}

interface RoomScanResult {
  scanId: string;
  roomType: string;
  dimensions: {
    width: number;
    length: number;
    height: number;
    unit: "meters" | "feet";
  };
  recognizedObjects: RecognizedObject[];
  floorPlan: FloorPlanData | null;
  styleRecommendations: string[];
  lightingSuggestions: string[];
  detectedFeatures: string[];
  photos: string[];
  processedAt: Date;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function downloadImageFromUrl(url: string): Promise<Buffer> {
  // Handle both gs:// URLs and https:// URLs
  if (url.startsWith("gs://")) {
    const path = url.replace(/^gs:\/\/[^/]+\//, "");
    const bucket = storage.bucket();
    const [buffer] = await bucket.file(path).download();
    return buffer;
  } else {
    // Firebase Storage download URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

async function updateProgress(
  projectId: string,
  scanId: string,
  stage: string,
  progress: number
): Promise<void> {
  const scanRef = db.doc(`projects/${projectId}/scans/${scanId}`);
  await scanRef.update({
    analysisProgress: {
      stage,
      progress,
      updatedAt: Timestamp.now(),
    },
  });
}

function mergeRecognizedObjects(allObjects: RecognizedObject[]): RecognizedObject[] {
  // Group by label and keep highest confidence
  const objectMap = new Map<string, RecognizedObject>();
  
  for (const obj of allObjects) {
    const existing = objectMap.get(obj.label);
    if (!existing || obj.confidence > existing.confidence) {
      objectMap.set(obj.label, obj);
    }
  }
  
  return Array.from(objectMap.values())
    .sort((a, b) => b.confidence - a.confidence);
}

function estimateDimensionsFromAnalyses(
  analyses: RoomAnalysis[]
): { width: number; length: number; height: number } {
  // Average the dimension estimates from multiple views
  let totalWidth = 0;
  let totalLength = 0;
  let totalHeight = 0;
  let validCount = 0;

  for (const analysis of analyses) {
    const dims = analysis.dimensions;
    if (dims.estimatedWidth > 0 && dims.estimatedLength > 0) {
      totalWidth += dims.estimatedWidth;
      totalLength += dims.estimatedLength;
      totalHeight += dims.estimatedHeight || 2.5; // Default ceiling height
      validCount++;
    }
  }

  if (validCount === 0) {
    // Return reasonable defaults for a typical room
    return { width: 4.0, length: 5.0, height: 2.5 };
  }

  return {
    width: totalWidth / validCount,
    length: totalLength / validCount,
    height: totalHeight / validCount,
  };
}

// ============================================================================
// Main Analysis Function
// ============================================================================

export const analyzeRoomPhotos = onCall<AnalyzeRoomPhotosRequest>(
  {
    memory: "2GiB",
    timeoutSeconds: 300,
    maxInstances: 10,
  },
  async (request): Promise<RoomScanResult> => {
    // Validate authentication
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const { projectId, scanId, photoUrls } = request.data;

    // Validate input
    if (!projectId || !scanId || !photoUrls || photoUrls.length < 1) {
      throw new HttpsError("invalid-argument", "Missing required parameters");
    }

    console.log(
      `[analyzeRoomPhotos] Starting analysis for ${projectId}/${scanId} with ${photoUrls.length} photos`
    );

    const scanRef = db.doc(`projects/${projectId}/scans/${scanId}`);

    try {
      // ======================================================================
      // Stage 1: Download and process each photo
      // ======================================================================
      
      await updateProgress(projectId, scanId, "detecting", 0);
      
      const allRecognizedObjects: RecognizedObject[] = [];
      const roomAnalyses: RoomAnalysis[] = [];
      const downloadedImages: Buffer[] = [];

      for (let i = 0; i < photoUrls.length; i++) {
        const url = photoUrls[i];
        const progress = (i / photoUrls.length) * 100;
        
        console.log(`[analyzeRoomPhotos] Processing photo ${i + 1}/${photoUrls.length}`);
        await updateProgress(projectId, scanId, "detecting", progress);

        try {
          // Download image
          const imageBuffer = await downloadImageFromUrl(url);
          downloadedImages.push(imageBuffer);

          // Run object recognition
          const objects = await recognizeObjects(imageBuffer, "image/jpeg");
          allRecognizedObjects.push(...objects);
          console.log(`[analyzeRoomPhotos] Found ${objects.length} objects in photo ${i + 1}`);

          // Run room analysis on first 4 photos (main walls)
          if (i < 4) {
            const analysis = await analyzeRoom(imageBuffer, "image/jpeg");
            roomAnalyses.push(analysis);
          }
        } catch (error) {
          console.error(
            `[analyzeRoomPhotos] Error processing photo ${i + 1}:`,
            error
          );
          // Continue with other photos
        }
      }

      // ======================================================================
      // Stage 2: Merge and deduplicate results
      // ======================================================================
      
      await updateProgress(projectId, scanId, "measuring", 0);
      
      const mergedObjects = mergeRecognizedObjects(allRecognizedObjects);
      console.log(
        `[analyzeRoomPhotos] Merged to ${mergedObjects.length} unique objects`
      );

      // Estimate room dimensions from analyses
      const dimensions = estimateDimensionsFromAnalyses(roomAnalyses);
      console.log(
        `[analyzeRoomPhotos] Estimated dimensions: ${JSON.stringify(dimensions)}`
      );

      // Determine room type (majority vote)
      const roomTypeCounts = new Map<string, number>();
      for (const analysis of roomAnalyses) {
        const type = analysis.roomType.toLowerCase();
        roomTypeCounts.set(type, (roomTypeCounts.get(type) || 0) + 1);
      }
      let roomType = "living room"; // default
      let maxCount = 0;
      for (const [type, count] of roomTypeCounts) {
        if (count > maxCount) {
          maxCount = count;
          roomType = type;
        }
      }

      // Collect unique suggestions and features
      const styleSet = new Set<string>();
      const lightingSet = new Set<string>();
      const featureSet = new Set<string>();

      for (const analysis of roomAnalyses) {
        analysis.styleRecommendations.forEach(s => styleSet.add(s));
        analysis.lightingSuggestions.forEach(l => lightingSet.add(l));
        analysis.detectedFeatures.forEach(f => featureSet.add(f));
      }

      await updateProgress(projectId, scanId, "measuring", 100);

      // ======================================================================
      // Stage 3: Generate floor plan
      // ======================================================================
      
      await updateProgress(projectId, scanId, "floorplan", 0);
      
      let floorPlan: FloorPlanData | null = null;
      
      // Use first image for floor plan generation with recognized objects
      if (downloadedImages.length > 0) {
        try {
          floorPlan = await generateFloorPlan(
            downloadedImages[0],
            mergedObjects,
            "image/jpeg"
          );
          console.log(`[analyzeRoomPhotos] Generated floor plan with ${floorPlan.walls.length} walls`);
        } catch (error) {
          console.error("[analyzeRoomPhotos] Floor plan generation failed:", error);
          // Continue without floor plan
        }
      }

      await updateProgress(projectId, scanId, "floorplan", 100);

      // ======================================================================
      // Stage 4: Compile results and update Firestore
      // ======================================================================

      const result: RoomScanResult = {
        scanId,
        roomType: roomType.charAt(0).toUpperCase() + roomType.slice(1),
        dimensions: {
          width: Math.round(dimensions.width * 10) / 10,
          length: Math.round(dimensions.length * 10) / 10,
          height: Math.round(dimensions.height * 10) / 10,
          unit: "meters",
        },
        recognizedObjects: mergedObjects,
        floorPlan,
        styleRecommendations: Array.from(styleSet).slice(0, 5),
        lightingSuggestions: Array.from(lightingSet).slice(0, 5),
        detectedFeatures: Array.from(featureSet).slice(0, 10),
        photos: photoUrls,
        processedAt: new Date(),
      };

      // Update Firestore with results
      await scanRef.update({
        status: "completed",
        roomType: result.roomType,
        dimensions: result.dimensions,
        recognizedObjects: result.recognizedObjects,
        floorPlan: result.floorPlan,
        styleRecommendations: result.styleRecommendations,
        lightingSuggestions: result.lightingSuggestions,
        detectedFeatures: result.detectedFeatures,
        processedAt: FieldValue.serverTimestamp(),
        analysisProgress: {
          stage: "complete",
          progress: 100,
          updatedAt: Timestamp.now(),
        },
      });

      console.log(`[analyzeRoomPhotos] Analysis complete for ${scanId}`);
      return result;

    } catch (error) {
      console.error("[analyzeRoomPhotos] Fatal error:", error);
      
      // Update Firestore with error
      await scanRef.update({
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        failedAt: FieldValue.serverTimestamp(),
      });

      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Analysis failed"
      );
    }
  }
);

// ============================================================================
// Quick Analyze (Single Photo - for testing)
// ============================================================================

export const quickAnalyzePhoto = onCall<{ photoUrl: string }>(
  {
    memory: "1GiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const { photoUrl } = request.data;
    
    if (!photoUrl) {
      throw new HttpsError("invalid-argument", "Missing photoUrl");
    }

    try {
      const imageBuffer = await downloadImageFromUrl(photoUrl);
      
      const [objects, analysis] = await Promise.all([
        recognizeObjects(imageBuffer, "image/jpeg"),
        analyzeRoom(imageBuffer, "image/jpeg"),
      ]);

      return {
        objects,
        analysis,
      };
    } catch (error) {
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Analysis failed"
      );
    }
  }
);
