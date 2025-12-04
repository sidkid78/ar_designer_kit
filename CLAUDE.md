# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AR Designer Kit is an AI-powered interior design application with AR visualization capabilities. It's a hybrid mobile app built with Next.js and wrapped in Capacitor for native iOS/Android functionality, with a Firebase/GCP serverless backend.

## Development Commands

### Frontend (Next.js)

```bash
cd frontend
npm run dev              # Start development server (http://localhost:3000)
npm run build            # Build production bundle
npm run start            # Start production server
npm run lint             # Run ESLint
npm run preinstall       # Force React 19 resolution (runs automatically)
```

### Firebase Functions

```bash
cd functions
npm run build            # Compile TypeScript to JavaScript
npm run build:watch      # Watch mode for development
npm run serve            # Build and start Firebase emulators
npm run deploy           # Deploy to Firebase
npm run logs             # View function logs
npm run lint             # Run ESLint with auto-fix
```

### Capacitor (Mobile)
```bash
cd frontend
npx cap sync             # Sync web assets to native projects
npx cap open ios         # Open iOS project in Xcode
npx cap open android     # Open Android project in Android Studio
```

## Architecture

### Frontend Architecture

**Technology Stack:**

- Next.js 16 (App Router) with React 19.2.0
- React Three Fiber (@react-three/fiber, @react-three/drei, @react-three/xr) for 3D rendering
- Capacitor 7.4+ for native bridge functionality
- Zustand for global state management
- Firebase SDK for authentication and Firestore access
- TailwindCSS for styling

**Key Architectural Patterns:**

1. **Hybrid App Model**: Next.js web app wrapped in Capacitor native shell to access device hardware (LiDAR, ARKit/ARCore)

2. **Native Bridge (ARBridge)**: TypeScript interface (`frontend/lib/ar-bridge.ts`) that registers a Capacitor plugin for AR functionality:
   - Device capability checks (LiDAR support)
   - Room scanning (start/stop scan, export mesh)
   - Object placement and removal
   - Material application
   - Event listeners for scan progress, object placement, etc.

3. **Component Structure**:
   - `ProjectWorkspace.tsx`: Main orchestrator for project views (scan/design/guide modes)
   - `ARCanvas.tsx` / `SimpleARCanvas.tsx`: Native AR camera overlay with WebGL 3D rendering
   - `WebXRCanvas.tsx`: Browser-based WebXR for AR experiences without native app
   - `RoomScanner.tsx`: UI for room scanning workflow
   - `EditingSessionPanel.tsx`: Chat-based conversational room editing interface
   - `TextureGallery.tsx`, `StyleVariationPicker.tsx`: AI-generated design assets UI

4. **Custom Hooks Pattern**:
   - `useAuth.tsx`: Firebase authentication provider and hook
   - `useFirestore.ts`: Generic Firestore CRUD operations with real-time listeners
   - `useRoomScanner.ts`: Room scanning state and AR bridge integration
   - `useRoomEditing.ts`: Multi-turn conversational editing sessions
   - `useWebXR.ts`: WebXR session management
   - `useStorage.ts`: Firebase Storage file operations

5. **Path Aliases**: Use `@/` prefix for imports (e.g., `@/hooks/useAuth`, `@/lib/firebase`)

### Backend Architecture

**Technology Stack:**

- Firebase Cloud Functions (Node 22, TypeScript)
- Google Cloud Platform (Cloud Vision, Cloud Storage, Cloud Tasks, Cloud Run)
- Firestore for database
- Stripe for subscription payments
- Google Generative AI (Nano Banana Pro) for conversational room editing

**Key Service Modules:**

1. **Room Scanning (`functions/src/room-scanning.ts`)**:
   - Triggered when scans are uploaded to Firestore
   - Uses Google Cloud Vision API for object recognition
   - Processes raw LiDAR/depth data
   - Updates scan documents with recognized objects and room dimensions

2. **Room Editing (`functions/src/room-editing.ts`)**:
   - Multi-turn conversational AI editing using Nano Banana Pro
   - Session persistence in Firestore with conversation history
   - Functions: `createEditingSession`, `sendRoomEdit`, `generateStyleVariations`, `generateTexture`, `getProductRecommendations`, `analyzeAndCreateSession`
   - Image processing with Sharp library
   - Cloud Storage integration for generated images

3. **Main Functions (`functions/src/index.ts`)**:
   - Firestore triggers for document creation
   - Cloud Task handlers for async AI processing
   - Stripe webhook handlers for subscription management
   - Re-exports room-editing functions

### Data Model

**Firestore Collections:**

- `users`: User profiles with subscription status and scan counts
- `projects`: User projects with metadata and preview images
- `scans`: Room scan data with processing status, recognized objects, dimensions
- `designs`: Generated design variations linked to scans
- `editingSessions`: Conversational editing sessions with history
- `subscriptions`: Stripe subscription data (managed by webhooks)

**Security**: Firestore rules enforce:

- Owner-based access control
- Subscription tier limits (freemium vs pro)
- Read-only access to AI-generated content until processing completes

### React 19 Compatibility

**Critical**: This project uses React 19.2.0 with package overrides for @react-three ecosystem:

- `frontend/package.json` includes extensive `overrides` to force React 19
- `preinstall` script runs `npm-force-resolutions`
- Next.js config transpiles Three.js packages for compatibility
- TypeScript definitions modified to use `unknown` instead of `any` for type safety

### Capacitor Configuration

**Important Settings** (`frontend/capacitor.config.json`):

- `webDir`: `.next` (Next.js build output)
- Development server URL configured for local network testing
- Image optimization disabled in Next.js for Capacitor compatibility
- Static export disabled to support dynamic routes

## Testing & Development Workflow

1. **Local Development**: Run `npm run dev` in `frontend/` for hot reload
2. **Firebase Emulation**: Run `npm run serve` in `functions/` to test cloud functions locally
3. **Mobile Testing**: Use `npx cap sync` to update native projects, then open in Xcode/Android Studio
4. **Development Network**: Update `capacitor.config.json` and `next.config.ts` with your local IP for mobile device testing

## Important Notes

- **Edge Processing**: Prefer on-device processing (3D mesh generation, basic object detection) over cloud to reduce latency and costs
- **Firestore Security**: Never bypass security rules; subscription limits enforced at database level
- **AI Processing**: Long-running AI tasks use Cloud Tasks queue to avoid function timeouts
- **Image Formats**: Use Sharp library for server-side image processing (WebP, JPEG optimization)
- **Native Dependencies**: AR functionality requires native iOS/Android implementation (not included in this repo)
