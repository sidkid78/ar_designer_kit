'use client';

/**
 * app/projects/[projectId]/page.tsx
 * Project Detail Page - Renders the AR Design Workspace
 */

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { ProjectWorkspace } from '@/app/components/ProjectWorkspace';

interface ProjectData {
  id: string;
  name: string;
  roomCount: number;
  thumbnailUrl?: string;
}

export default function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { projectId } = use(params);
  
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  // Fetch project data
  useEffect(() => {
    if (!user || !projectId) return;

    const fetchProject = async () => {
      try {
        const projectRef = doc(db, `users/${user.uid}/projects`, projectId);
        const projectSnap = await getDoc(projectRef);

        if (!projectSnap.exists()) {
          setError('Project not found');
          setLoading(false);
          return;
        }

        setProject({
          id: projectSnap.id,
          ...projectSnap.data(),
        } as ProjectData);
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch project:', err);
        setError('Failed to load project');
        setLoading(false);
      }
    };

    fetchProject();
  }, [user, projectId]);

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-white/60">Loading project...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">{error}</p>
          <button
            onClick={() => router.push('/projects')}
            className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  // No project found
  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-center">
          <p className="text-white/60 text-lg mb-4">Project not found</p>
          <button
            onClick={() => router.push('/projects')}
            className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  // Render the workspace
  return (
    <div className="h-screen w-screen overflow-hidden">
      <ProjectWorkspace
        projectId={projectId}
        projectName={project.name}
        className="h-full w-full"
      />
    </div>
  );
}
