'use client';

/**
 * app/projects/[projectId]/rooms/[roomId]/page.tsx
 * Room Designer Page - App Router
 */

import { use } from 'react';
import { RoomDesigner } from '@/app/components/RoomDesigner';

interface PageProps {
  params: Promise<{
    projectId: string;
    roomId: string;
  }>;
}

export default function RoomDesignerPage({ params }: PageProps) {
  const { projectId, roomId } = use(params);

  return <RoomDesigner projectId={projectId} roomId={roomId} />;
}