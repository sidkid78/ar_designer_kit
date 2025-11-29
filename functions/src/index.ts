// functions/src/index.ts
// AR Designer Kit - Firebase Cloud Functions
// Copyright 2024

import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFunctions } from 'firebase-admin/functions';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

// Initialize Firebase Admin
admin.initializeApp();

const db = getFirestore();

// ============================================================================
// Room Editing Functions (Nano Banana) - Re-export from module
// ============================================================================

export {
  createEditingSession,
  sendRoomEdit,
  generateStyleVariations,
  generateTexture,
  getProductRecommendations,
  analyzeAndCreateSession,
  getSessionHistory,
  deleteSession,
} from './room-editing';
const storage = getStorage();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

// ============================================================================
// Types
// ============================================================================

interface ScanDocument {
  projectId: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  rawScanFileUrl: string;
  recognizedObjects?: RecognizedObject[];
  processedAt?: FirebaseFirestore.Timestamp;
  error?: string;
}

interface RecognizedObject {
  label: string;
  confidence: number;
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  category: 'architectural' | 'furniture' | 'fixture' | 'other';
}

interface DesignDocument {
  projectId: string;
  userId: string;
  baseScanId: string;
  stylePrompt: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  generatedTextures?: GeneratedTexture[];
}

interface GeneratedTexture {
  surfaceType: string;
  textureUrl: string;
  thumbnailUrl: string;
}

interface AITaskPayload {
  type: 'object_recognition' | 'style_generation' | 'floor_plan';
  projectId: string;
  documentId: string;
  userId: string;
  inputUrl?: string;
  prompt?: string;
}

// ============================================================================
// Firestore Triggers - Enqueue AI Tasks
// ============================================================================

/**
 * When a new scan is created, enqueue object recognition task
 */
export const onScanCreated = onDocumentCreated(
  'projects/{projectId}/scans/{scanId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const scan = snapshot.data() as ScanDocument;
    const { projectId, scanId } = event.params;

    console.log(`[onScanCreated] New scan: ${projectId}/${scanId}`);

    // Update status to processing
    await snapshot.ref.update({
      status: 'processing',
      processingStartedAt: FieldValue.serverTimestamp(),
    });

    // Enqueue object recognition task
    const queue = getFunctions().taskQueue('processAIScan');
    
    const payload: AITaskPayload = {
      type: 'object_recognition',
      projectId,
      documentId: scanId,
      userId: scan.userId,
      inputUrl: scan.rawScanFileUrl,
    };

    await queue.enqueue(payload, {
      dispatchDeadlineSeconds: 60 * 5, // 5 minute timeout
      uri: await getTaskHandlerUri('processAIScan'),
    });

    console.log(`[onScanCreated] Task enqueued for scan: ${scanId}`);
  }
);

/**
 * When a new design is created, enqueue style generation task
 */
export const onDesignCreated = onDocumentCreated(
  'projects/{projectId}/designs/{designId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const design = snapshot.data() as DesignDocument;
    const { projectId, designId } = event.params;

    console.log(`[onDesignCreated] New design: ${projectId}/${designId}`);

    // Update status to generating
    await snapshot.ref.update({
      status: 'generating',
      generationStartedAt: FieldValue.serverTimestamp(),
    });

    // Enqueue style generation task
    const queue = getFunctions().taskQueue('processAIDesign');
    
    const payload: AITaskPayload = {
      type: 'style_generation',
      projectId,
      documentId: designId,
      userId: design.userId,
      prompt: design.stylePrompt,
    };

    await queue.enqueue(payload, {
      dispatchDeadlineSeconds: 60 * 5,
      uri: await getTaskHandlerUri('processAIDesign'),
    });

    console.log(`[onDesignCreated] Task enqueued for design: ${designId}`);
  }
);

// ============================================================================
// Cloud Tasks Handlers - AI Processing
// ============================================================================

/**
 * Process scan with Gemini AI for object recognition
 */
export const processAIScan = onTaskDispatched(
  {
    retryConfig: {
      maxAttempts: 3,
      minBackoffSeconds: 30,
      maxBackoffSeconds: 120,
    },
    rateLimits: {
      maxConcurrentDispatches: 10,
    },
    memory: '1GiB',
    timeoutSeconds: 300,
  },
  async (req) => {
    const payload = req.data as AITaskPayload;
    const { projectId, documentId, inputUrl } = payload;

    console.log(`[processAIScan] Processing scan: ${projectId}/${documentId}`);

    const scanRef = db.doc(`projects/${projectId}/scans/${documentId}`);

    try {
      // Import Gemini AI service
      const { GeminiAIService } = await import('./services/gemini-ai');
      const gemini = new GeminiAIService();

      // Download scan image from Cloud Storage
      const imageBuffer = await downloadFromStorage(inputUrl!);

      // Run object recognition with Gemini
      const recognizedObjects = await gemini.recognizeObjects(imageBuffer);

      // Update Firestore with results
      await scanRef.update({
        status: 'completed',
        recognizedObjects,
        processedAt: FieldValue.serverTimestamp(),
      });

      console.log(`[processAIScan] Completed scan: ${documentId}, found ${recognizedObjects.length} objects`);

    } catch (error) {
      console.error(`[processAIScan] Failed:`, error);

      await scanRef.update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        failedAt: FieldValue.serverTimestamp(),
      });

      throw error; // Re-throw for retry
    }
  }
);

/**
 * Process design with Gemini AI / Imagen for style generation
 */
export const processAIDesign = onTaskDispatched(
  {
    retryConfig: {
      maxAttempts: 3,
      minBackoffSeconds: 60,
      maxBackoffSeconds: 300,
    },
    rateLimits: {
      maxConcurrentDispatches: 5, // Lower limit for expensive generation
    },
    memory: '2GiB',
    timeoutSeconds: 300,
  },
  async (req) => {
    const payload = req.data as AITaskPayload;
    const { projectId, documentId, prompt } = payload;

    console.log(`[processAIDesign] Processing design: ${projectId}/${documentId}`);

    const designRef = db.doc(`projects/${projectId}/designs/${documentId}`);

    try {
      // Get design document for base scan reference
      const designDoc = await designRef.get();
      const design = designDoc.data() as DesignDocument;

      // Get the base scan for context
      const scanDoc = await db.doc(`projects/${projectId}/scans/${design.baseScanId}`).get();
      const scan = scanDoc.data() as ScanDocument;

      // Import Gemini AI service
      const { GeminiAIService } = await import('./services/gemini-ai');
      const gemini = new GeminiAIService();

      // Get recognized surfaces from scan
      const surfaces = scan.recognizedObjects?.filter(
        obj => ['wall', 'floor', 'ceiling'].includes(obj.label)
      ) || [];

      // Generate textures for each surface type
      const generatedTextures: GeneratedTexture[] = [];

      for (const surface of surfaces) {
        const enhancedPrompt = `${prompt}, ${surface.label} texture, seamless, high quality, photorealistic`;
        
        const textureBuffer = await gemini.generateStyleTexture(enhancedPrompt);
        
        // Upload to Cloud Storage
        const textureUrl = await uploadToStorage(
          textureBuffer,
          `projects/${projectId}/designs/${documentId}/${surface.label}_texture.jpg`
        );

        // Generate thumbnail
        const thumbnailUrl = await generateThumbnail(textureBuffer, projectId, documentId, surface.label);

        generatedTextures.push({
          surfaceType: surface.label,
          textureUrl,
          thumbnailUrl,
        });
      }

      // Update Firestore with results
      await designRef.update({
        status: 'completed',
        generatedTextures,
        completedAt: FieldValue.serverTimestamp(),
      });

      console.log(`[processAIDesign] Completed design: ${documentId}, generated ${generatedTextures.length} textures`);

    } catch (error) {
      console.error(`[processAIDesign] Failed:`, error);

      await designRef.update({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        failedAt: FieldValue.serverTimestamp(),
      });

      throw error;
    }
  }
);

// ============================================================================
// Stripe Integration
// ============================================================================

/**
 * Create Stripe checkout session for Pro subscription
 */
export const createCheckoutSession = onCall(
  { enforceAppCheck: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { priceId, successUrl, cancelUrl } = request.data;

    if (!priceId || !successUrl || !cancelUrl) {
      throw new HttpsError('invalid-argument', 'Missing required parameters');
    }

    const userId = request.auth.uid;

    // Get or create Stripe customer
    const userDoc = await db.doc(`users/${userId}`).get();
    const userData = userDoc.data();
    
    let customerId = userData?.subscription?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: request.auth.token.email,
        metadata: { firebaseUserId: userId },
      });
      customerId = customer.id;

      await db.doc(`users/${userId}`).update({
        'subscription.stripeCustomerId': customerId,
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId },
      subscription_data: {
        metadata: { userId },
      },
    });

    return { sessionId: session.id, url: session.url };
  }
);

/**
 * Stripe webhook handler
 */
export const stripeWebhook = onCall(async (request) => {
  const sig = request.rawRequest?.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !endpointSecret) {
    throw new HttpsError('invalid-argument', 'Missing signature');
  }

  let event: Stripe.Event;

  try {
    const rawBody = (request.rawRequest as any)?.rawBody;
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    throw new HttpsError('invalid-argument', 'Webhook signature verification failed');
  }

  console.log(`[stripeWebhook] Event: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;

      if (userId && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        await db.doc(`users/${userId}`).update({
          'subscription.status': 'active',
          'subscription.plan': 'pro',
          'subscription.stripeSubscriptionId': subscription.id,
          'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
          'subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end,
        });

        console.log(`[stripeWebhook] User ${userId} subscribed to Pro`);
      }
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata?.userId;

      if (userId) {
        const status = subscription.status === 'active' ? 'active' :
                       subscription.status === 'canceled' ? 'canceled' :
                       subscription.status === 'past_due' ? 'past_due' : 'inactive';

        await db.doc(`users/${userId}`).update({
          'subscription.status': status,
          'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
          'subscription.cancelAtPeriodEnd': subscription.cancel_at_period_end,
        });

        console.log(`[stripeWebhook] User ${userId} subscription updated: ${status}`);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscription = await stripe.subscriptions.retrieve(
        invoice.subscription as string
      );
      const userId = subscription.metadata?.userId;

      if (userId) {
        await db.doc(`users/${userId}`).update({
          'subscription.status': 'past_due',
        });

        // TODO: Send email notification
        console.log(`[stripeWebhook] User ${userId} payment failed`);
      }
      break;
    }
  }

  return { received: true };
});

/**
 * Cancel subscription
 */
export const cancelSubscription = onCall(
  { enforceAppCheck: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const userId = request.auth.uid;
    const userDoc = await db.doc(`users/${userId}`).get();
    const subscriptionId = userDoc.data()?.subscription?.stripeSubscriptionId;

    if (!subscriptionId) {
      throw new HttpsError('not-found', 'No active subscription');
    }

    // Cancel at period end (don't immediately revoke access)
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    await db.doc(`users/${userId}`).update({
      'subscription.cancelAtPeriodEnd': true,
      'subscription.canceledAt': FieldValue.serverTimestamp(),
    });

    return {
      canceledAt: subscription.cancel_at,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    };
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

async function getTaskHandlerUri(functionName: string): Promise<string> {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.FUNCTION_REGION || 'us-central1';
  
  return `https://${location}-${projectId}.cloudfunctions.net/${functionName}`;
}

async function downloadFromStorage(gsUrl: string): Promise<Buffer> {
  const bucket = storage.bucket();
  const filePath = gsUrl.replace('gs://', '').split('/').slice(1).join('/');
  
  const [buffer] = await bucket.file(filePath).download();
  return buffer;
}

async function uploadToStorage(buffer: Buffer, path: string): Promise<string> {
  const bucket = storage.bucket();
  const file = bucket.file(path);
  
  await file.save(buffer, {
    contentType: 'image/jpeg',
    metadata: {
      cacheControl: 'public, max-age=31536000',
    },
  });

  await file.makePublic();
  
  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

async function generateThumbnail(
  buffer: Buffer,
  projectId: string,
  designId: string,
  surfaceType: string
): Promise<string> {
  // Use Sharp for thumbnail generation (would need to be added as dependency)
  // For now, just upload the same image as thumbnail
  const thumbnailPath = `projects/${projectId}/designs/${designId}/${surfaceType}_thumb.jpg`;
  return uploadToStorage(buffer, thumbnailPath);
}