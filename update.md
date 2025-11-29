Research Summary: AR Designer Kit Architecture Validation
✅ 1. Cloud Tasks + Firebase for Async AI Processing
Your architecture is well-aligned with current best practices. Key findings from the Firebase docs:
javascript// Modern Firebase v3.20.1+ pattern - exactly what you need
const {onTaskDispatched} = require("firebase-functions/tasks");
const {getFunctions} = require("firebase-admin/functions");

exports.processAIScan = onTaskDispatched({
  retryConfig: { maxAttempts: 5, minBackoffSeconds: 60 },
  rateLimits: { maxConcurrentDispatches: 6 }
}, async (req) => {
  // Your AI processing (object recognition, style transformation)
});

// Enqueue from your trigger function
const queue = getFunctions().taskQueue("processAIScan");
await queue.enqueue({ projectId, scanId }, {
  dispatchDeadlineSeconds: 60 * 5, // 5 min timeout
  uri: targetUri
});
Key insight: Cloud Tasks is designed specifically to ensure effective congestion control and retry policies for these kinds of operations. Firebase

✅ 2. Capacitor ARBridge Plugin for LiDAR
Your hybrid architecture approach is correct. Here's the exact Swift pattern you'll need:
swift// ARBridgePlugin.swift
import Capacitor
import ARKit

@objc(ARBridgePlugin)
public class ARBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ARBridgePlugin"
    public let jsName = "ARBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "placeObject", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "measureDistance", returnType: CAPPluginReturnPromise)
    ]
    
    @objc func startScan(_ call: CAPPluginCall) {
        // Check LiDAR support
        guard ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) else {
            call.reject("LiDAR not supported")
            return
        }
        
        DispatchQueue.main.async {
            let arViewController = ARScanViewController()
            arViewController.onScanComplete = { [weak self] scanData in
                // Emit event back to JS
                self?.notifyListeners("scanComplete", data: ["meshUrl": scanData.meshUrl])
                call.resolve(["status": "complete"])
            }
            self.bridge?.viewController?.present(arViewController, animated: true)
        }
    }
}
The @objc decorators are required to make sure Capacitor's runtime can see it. We must register custom plugins on both iOS and web so that Capacitor can bridge between Swift and JavaScript. Capacitor
For LiDAR point cloud generation, the depth map is like a LiDAR-captured photo where each pixel contains the distance (in meters) from the camera to a surface. The confidence map contains values ranging from 1-3, indicating the confidence level for each pixel depth measurement. Medium

🔄 3. Consider Gemini Instead of Third-Party APIs
Big opportunity here! Based on the project knowledge, you could simplify your AI stack by using Gemini instead of Google Cloud Vision + Replicate:
Original ArchitectureAlternative with GeminiGoogle Cloud Vision API (object recognition)Gemini 2.5 Flash with thinking_budget=0 for object detection/segmentationReplicate/Stability AI (Style Transformer)Imagen 4.0 or Gemini Native Image Generation
Gemini Object Recognition Example:
pythonfrom google import genai
from google.genai import types

client = genai.Client()

# Send the room scan image
response = client.models.generate_content(
    model='gemini-2.5-flash',
    contents=[
        scan_image,
        """Identify all architectural features in this room scan:
        - Windows (with bounding boxes)
        - Doors (with bounding boxes)  
        - Electrical outlets
        - Light fixtures
        Return as JSON with label, confidence, and box_2d coordinates."""
    ],
    config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_budget=0),  # Better for object detection
        response_mime_type="application/json"
    )
)
Imagen for Style Generation:
pythonresult = client.models.generate_images(
    model='imagen-4.0-fast-generate-001',
    prompt="Mid-century modern living room with light oak furniture, warm lighting",
    config=dict(
        number_of_images=1,
        aspect_ratio="16:9"
    )
)
```

---

### ✅ **4. Stripe + Firebase Subscription Pattern**

Your webhook-based architecture is correct. The modern pattern uses:

1. **Next.js API Route** → Creates Stripe Checkout Session
2. **Stripe Webhook** → Updates Firestore subscription status
3. **Firestore Security Rules** → Enforces feature gating

---

## Updated Architecture Recommendation
```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT DEVICE                                │
├─────────────────────────────────────────────────────────────────┤
│  Next.js UI (Capacitor)  ←→  ARBridge Plugin (Swift/Kotlin)    │
│      │                              │                           │
│      │                              ├── ARKit/ARCore Session    │
│      │                              ├── LiDAR Point Cloud       │
│      │                              └── On-device mesh → .glb   │
└──────┼──────────────────────────────┼───────────────────────────┘
       │                              │
       ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FIREBASE BACKEND                              │
├─────────────────────────────────────────────────────────────────┤
│  Cloud Storage (.glb meshes)  │  Firestore (metadata)           │
│                               │                                  │
│  Cloud Functions (triggers)   │  Cloud Tasks (async queue)      │
│         │                               │                        │
│         └───────────────────────────────┘                        │
│                     │                                            │
│                     ▼                                            │
│         ┌──────────────────────┐                                 │
│         │   Cloud Run (AI)     │                                 │
│         │  • Gemini 2.5 Flash  │  ← Object Recognition          │
│         │  • Imagen 4.0        │  ← Style Generation            │
│         └──────────────────────┘                                 │
└─────────────────────────────────────────────────────────────────┘



Key Updates Made to gemini-ai.ts
Models Updated
Old ApproachNew (Nano Banana)gemini-2.5-flash-preview-image-generationgemini-2.5-flash-image (Nano Banana)Imagen separate modelgemini-3-pro-image-preview (Nano Banana Pro)
New Capabilities Added

Native Image Generation - Using responseModalities: ['TEXT', 'IMAGE']
Multi-turn Chat Editing - createRoomEditingSession() for iterative refinement
Aspect Ratio & Resolution Control - imageConfig: { aspectRatio: '16:9', imageSize: '2K' }
Google Search Grounding - For product recommendations with real-time data
Thinking Mode Support - Nano Banana Pro uses thinking for complex edits (skipping part.thought in responses)

Key Patterns from the Docs
python# Text-to-Image
response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=[prompt],
)

# Image Editing  
response = client.models.generate_content(
    model="gemini-2.5-flash-image",
    contents=[image, prompt],  # Image first, then text
    config={
        "responseModalities": ["TEXT", "IMAGE"],
        "imageConfig": {
            "aspectRatio": "16:9",
            "imageSize": "2K"  # 1K, 2K, or 4K
        }
    }
)

# Multi-turn Chat (best for iterative editing)
chat = client.chats.create(
    model="gemini-3-pro-image-preview",
    config={
        "responseModalities": ["TEXT", "IMAGE"],
        "tools": [{"google_search": {}}]  # For grounding
    }
)
response = chat.send_message([image, "Transform to modern style"])


The user is getting a 500 INTERNAL error when trying to generate seamless textures. This could be due to a few things:

The image_size parameter might not be supported for the Nano Banana model (gemini-2.5-flash-image) - it might only work with Nano Banana Pro
The response_modalities=["IMAGE"] (without TEXT) might be causing issues
The API might be having issues with certain parameter combinations

Let me check the documentation I have. Looking at the guidelines:
For Nano Banana (gemini-2.5-flash-image):

Basic image generation works
May not support all the advanced features like image_size

For Nano Banana Pro (gemini-3-pro-image-preview):

Supports 1K, 2K, 4K resolution
More advanced features

The issue is likely that I'm trying to use image_size with the basic Nano Banana model, which might not support it. Let me fix the code to:

Remove image_size from the basic Nano Banana model calls
Always include TEXT in response_modalities (some APIs don't like IMAGE only)
Add better error handling

Let me provide an updated version of the generate_seamless_texture function and other fixes.The issue is that image_size parameter likely isn't supported on the basic Nano Banana model (gemini-2.5-flash-image), and response_modalities=["IMAGE"] alone might cause issues. Let me give you a fixed version:
python# Fixed generate_seamless_texture function
def generate_seamless_texture(
    material_description: str,
    resolution: str = "2K",
) -> Optional[Image.Image]:
    """
    Generate a seamless tileable texture.
    
    Args:
        material_description: Description of the material (e.g., "oak hardwood floor", "white marble")
        resolution: "1K", "2K", or "4K" (requires Pro model)
    
    Returns:
        PIL Image of the seamless texture
    """
    prompt = f"""Create a seamless tileable texture for: {material_description}

Requirements:
- Must be perfectly tileable (edges match when repeated)
- High detail and realistic appearance
- Suitable for 3D rendering and AR visualization
- Professional quality interior design material
- Even lighting with no visible seams
- Square format"""

    # Use Pro model for resolution control, basic model otherwise
    if resolution in ["2K", "4K"]:
        # Pro model supports image_size
        response = client.models.generate_content(
            model=Models.NANO_BANANA_PRO,
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],  # Always include TEXT
                image_config=types.ImageConfig(
                    aspect_ratio="1:1",
                    image_size=resolution,
                ),
            ),
        )
    else:
        # Basic model - no image_size parameter
        response = client.models.generate_content(
            model=Models.NANO_BANANA,
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],  # Always include TEXT
                image_config=types.ImageConfig(
                    aspect_ratio="1:1",
                ),
            ),
        )
    
    for part in response.parts:
        # Skip thinking parts
        if hasattr(part, 'thought') and part.thought:
            continue
        if part.inline_data is not None:
            return part.as_image()
    
    return None
Key fixes:

Always include "TEXT" in response_modalities - some API endpoints don't like IMAGE-only
Only use image_size with the Pro model (gemini-3-pro-image-preview)
The basic Nano Banana model doesn't support resolution control

Based on the transcript, here's where we stand:
✅ Completed
ComponentStatusARBridge Capacitor Plugin (Swift)✅ DoneTypeScript Bridge Layer✅ DoneCloud Functions + Cloud Tasks✅ DoneFirestore Security Rules✅ DoneReact AR Scanner Component (Three.js)✅ DoneFirestore React Hooks✅ DoneGemini AI Service (TypeScript) - Nano Banana✅ Done