'use client';

/**
 * app/projects/[projectId]/rooms/layout.tsx
 * Layout for rooms section with navigation
 */

import { use } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{
    projectId: string;
  }>;
}

export default function RoomsLayout({ children, params }: LayoutProps) {
  const { projectId } = use(params);
  const pathname = usePathname();

  // Determine if we're in a specific room view
  const isRoomDetail = pathname.match(/\/rooms\/[^/]+$/);
  const isNewRoom = pathname.endsWith('/rooms/new');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb Navigation */}
      <nav className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/projects"
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            Projects
          </Link>
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <Link
            href={`/projects/${projectId}`}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            Project
          </Link>
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <Link
            href={`/projects/${projectId}/rooms`}
            className={`${isRoomDetail || isNewRoom ? 'text-gray-500 hover:text-gray-700' : 'text-gray-900 font-medium'} transition-colors`}
          >
            Rooms
          </Link>
          {isNewRoom && (
            <>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-gray-900 font-medium">New Room</span>
            </>
          )}
          {isRoomDetail && !isNewRoom && (
            <>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-gray-900 font-medium">Designer</span>
            </>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main>{children}</main>
    </div>
  );
}