// src/hooks/useFirestore.ts
// AR Designer Kit - Firestore React Hooks
// Copyright 2024

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  DocumentReference,
  QueryConstraint,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';

// ============================================================================
// Types
// ============================================================================

export interface Project {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  previewImageUrl?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface Scan {
  id: string;
  projectId: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  rawScanFileUrl: string;
  recognizedObjects?: RecognizedObject[];
  dimensions?: RoomDimensions;
  processedAt?: Timestamp;
  createdAt: Timestamp;
  error?: string;
}

export interface RecognizedObject {
  label: string;
  confidence: number;
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  category?: string;
}

export interface RoomDimensions {
  width: number;
  length: number;
  height: number;
}

export interface Design {
  id: string;
  projectId: string;
  userId: string;
  baseScanId: string;
  name?: string;
  stylePrompt: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  generatedTextures?: GeneratedTexture[];
  createdAt: Timestamp;
  completedAt?: Timestamp;
  error?: string;
}

export interface GeneratedTexture {
  surfaceType: string;
  textureUrl: string;
  thumbnailUrl: string;
}

export interface PlacedObject {
  id: string;
  productId: string;
  model3DUrl: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scale: number;
  affiliateLink?: string;
}

export interface Subscription {
  plan: 'free' | 'pro';
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: Timestamp;
  cancelAtPeriodEnd?: boolean;
}

// ============================================================================
// Projects Hook
// ============================================================================

export function useProjects(options?: {
  limitCount?: number;
  constraints?: QueryConstraint[];
}) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    const constraints: QueryConstraint[] = [
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc'),
    ];

    if (options?.constraints) {
      constraints.push(...options.constraints);
    }

    if (options?.limitCount) {
      constraints.push(limit(options.limitCount));
    }

    const q = query(collection(db, 'projects'), ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const projectData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Project[];
        setProjects(projectData);
        setLoading(false);
      },
      (err) => {
        console.error('Projects subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, options?.limitCount, options?.constraints]);

  const createProject = useCallback(async (data: { name: string; description?: string }) => {
    if (!user) throw new Error('Must be authenticated');

    const docRef = await addDoc(collection(db, 'projects'), {
      ...data,
      ownerId: user.uid,
      createdAt: serverTimestamp(),
    });

    return docRef.id;
  }, [user]);

  const updateProject = useCallback(async (projectId: string, data: Partial<Project>) => {
    await updateDoc(doc(db, 'projects', projectId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    await deleteDoc(doc(db, 'projects', projectId));
  }, []);

  return {
    projects,
    loading,
    error,
    createProject,
    updateProject,
    deleteProject,
  };
}

// ============================================================================
// Single Project Hook
// ============================================================================

export function useProject(projectId: string | null | DocumentReference) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    const docRef = typeof projectId === 'string' 
      ? doc(db, 'projects', projectId)
      : projectId;

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setProject({ id: snapshot.id, ...snapshot.data() } as Project);
        } else {
          setProject(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Project subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [projectId]);

  return { project, loading, error };
}

// ============================================================================
// Scans Hook
// ============================================================================

export function useScans(projectId: string, options?: {
  limitCount?: number;
  constraints?: QueryConstraint[];
}) {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    const constraints: QueryConstraint[] = [
      orderBy('createdAt', 'desc'),
    ];

    if (options?.constraints) {
      constraints.push(...options.constraints);
    }

    if (options?.limitCount) {
      constraints.push(limit(options.limitCount));
    }

    const q = query(
      collection(db, 'projects', projectId, 'scans'),
      ...constraints
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const scanData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Scan[];
        setScans(scanData);
        setLoading(false);
      },
      (err) => {
        console.error('Scans subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [projectId, options?.limitCount, options?.constraints]);

  return { scans, loading, error };
}

export function useFirestoreScan(projectId: string) {
  const { user } = useAuth();

  const createScan = useCallback(async (data: {
    rawScanFileUrl: string;
    recognizedObjects?: RecognizedObject[];
    dimensions?: RoomDimensions;
  }) => {
    if (!user) throw new Error('Must be authenticated');

    const docRef = await addDoc(collection(db, 'projects', projectId, 'scans'), {
      ...data,
      projectId,
      userId: user.uid,
      status: 'pending',
      createdAt: serverTimestamp(),
    });

    return docRef.id;
  }, [user, projectId]);

  const updateScan = useCallback(async (scanId: string, data: Partial<Scan>) => {
    await updateDoc(doc(db, 'projects', projectId, 'scans', scanId), data);
  }, [projectId]);

  const deleteScan = useCallback(async (scanId: string) => {
    await deleteDoc(doc(db, 'projects', projectId, 'scans', scanId));
  }, [projectId]);

  // Upload mesh file to Cloud Storage
  const uploadMesh = useCallback(async (file: Blob, fileName: string) => {
    if (!user) throw new Error('Must be authenticated');

    const storageRef = ref(storage, `projects/${projectId}/meshes/${fileName}`);
    const snapshot = await uploadBytes(storageRef, file);
    return getDownloadURL(snapshot.ref);
  }, [user, projectId]);

  return {
    createScan,
    updateScan,
    deleteScan,
    uploadMesh,
  };
}

// ============================================================================
// Single Scan Hook (with real-time status updates)
// ============================================================================

export function useScan(projectId: string, scanId: string | null | DocumentReference) {
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!projectId || !scanId) {
      return;
    }

    const docRef = typeof scanId === 'string'
      ? doc(db, 'projects', projectId, 'scans', scanId)
      : scanId;

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setScan({ id: snapshot.id, ...snapshot.data() } as Scan);
        } else {
          setScan(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Scan subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [projectId, scanId]);

  return { scan, loading, error };
}

// ============================================================================
// Designs Hook
// ============================================================================

export function useDesigns(projectId: string, options?: {
  limitCount?: number;
  constraints?: QueryConstraint[];
}) {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    const constraints: QueryConstraint[] = [
      orderBy('createdAt', 'desc'),
    ];

    if (options?.constraints) {
      constraints.push(...options.constraints);
    }

    if (options?.limitCount) {
      constraints.push(limit(options.limitCount));
    }

    const q = query(
      collection(db, 'projects', projectId, 'designs'),
      ...constraints
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const designData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Design[];
        setDesigns(designData);
        setLoading(false);
      },
      (err) => {
        console.error('Designs subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [projectId, options?.limitCount, options?.constraints]);

  return { designs, loading, error };
}

export function useFirestoreDesign(projectId: string) {
  const { user } = useAuth();

  const createDesign = useCallback(async (data: {
    baseScanId: string;
    stylePrompt: string;
    name?: string;
  }) => {
    if (!user) throw new Error('Must be authenticated');

    const docRef = await addDoc(collection(db, 'projects', projectId, 'designs'), {
      ...data,
      projectId,
      userId: user.uid,
      status: 'pending',
      createdAt: serverTimestamp(),
    });

    return docRef.id;
  }, [user, projectId]);

  const updateDesign = useCallback(async (designId: string, data: Partial<Design>) => {
    await updateDoc(doc(db, 'projects', projectId, 'designs', designId), data);
  }, [projectId]);

  const deleteDesign = useCallback(async (designId: string) => {
    await deleteDoc(doc(db, 'projects', projectId, 'designs', designId));
  }, [projectId]);

  return {
    createDesign,
    updateDesign,
    deleteDesign,
  };
}

// ============================================================================
// Single Design Hook (with real-time status updates)
// ============================================================================

export function useDesign(projectId: string, designId: string | null | DocumentReference) {
  const [design, setDesign] = useState<Design | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!projectId || !designId) {
      return;
    }

    const docRef = typeof designId === 'string'
      ? doc(db, 'projects', projectId, 'designs', designId)
      : designId;

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setDesign({ id: snapshot.id, ...snapshot.data() } as Design);
        } else {
          setDesign(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Design subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [projectId, designId]);

  return { design, loading, error };
}

// ============================================================================
// Placed Objects Hook
// ============================================================================

export function usePlacedObjects(projectId: string, designId: string, options?: {
  limitCount?: number;
  constraints?: QueryConstraint[];
}) {
  const [objects, setObjects] = useState<PlacedObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!projectId || !designId) {
      return;
    }

    const constraints: QueryConstraint[] = [];

    if (options?.constraints) {
      constraints.push(...options.constraints);
    }

    if (options?.limitCount) {
      constraints.push(limit(options.limitCount));
    }

    const q = constraints.length > 0
      ? query(
          collection(db, 'projects', projectId, 'designs', designId, 'placedObjects'),
          ...constraints
        )
      : collection(db, 'projects', projectId, 'designs', designId, 'placedObjects');

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const objectData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as PlacedObject[];
        setObjects(objectData);
        setLoading(false);
      },
      (err) => {
        console.error('Placed objects subscription error:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [projectId, designId, options?.limitCount, options?.constraints]);

  const addObject = useCallback(async (data: Omit<PlacedObject, 'id'>) => {
    const docRef = await addDoc(
      collection(db, 'projects', projectId, 'designs', designId, 'placedObjects'),
      data
    );
    return docRef.id;
  }, [projectId, designId]);

  const updateObject = useCallback(async (objectId: string, data: Partial<PlacedObject>) => {
    await updateDoc(
      doc(db, 'projects', projectId, 'designs', designId, 'placedObjects', objectId),
      data
    );
  }, [projectId, designId]);

  const removeObject = useCallback(async (objectId: string) => {
    await deleteDoc(
      doc(db, 'projects', projectId, 'designs', designId, 'placedObjects', objectId)
    );
  }, [projectId, designId]);

  return {
    objects,
    loading,
    error,
    addObject,
    updateObject,
    removeObject,
  };
}

// ============================================================================
// Subscription Hook
// ============================================================================

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgradeModalState, setShowUpgradeModalState] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setSubscription(data.subscription || { plan: 'free', status: 'inactive' });
        } else {
          setSubscription({ plan: 'free', status: 'inactive' });
        }
        setLoading(false);
      },
      (err) => {
        console.error('Subscription subscription error:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const isPro = subscription?.status === 'active' && subscription?.plan === 'pro';
  const isTrialing = subscription?.status === 'trialing';
  const isPastDue = subscription?.status === 'past_due';

  const showUpgradeModal = useCallback(() => {
    setShowUpgradeModalState(true);
  }, []);

  const hideUpgradeModal = useCallback(() => {
    setShowUpgradeModalState(false);
  }, []);

  return {
    subscription,
    loading,
    isPro,
    isTrialing,
    isPastDue,
    showUpgradeModal,
    hideUpgradeModal,
    upgradeModalOpen: showUpgradeModalState,
  };
}