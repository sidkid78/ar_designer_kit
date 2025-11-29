'use client';

/**
 * app/projects/[projectId]/rooms/new/page.tsx
 * Create a new room and redirect to designer
 */

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

interface PageProps {
  params: Promise<{
    projectId: string;
  }>;
}

const ROOM_TYPES = [
  { id: 'living-room', name: 'Living Room', icon: '🛋️' },
  { id: 'bedroom', name: 'Bedroom', icon: '🛏️' },
  { id: 'kitchen', name: 'Kitchen', icon: '🍳' },
  { id: 'bathroom', name: 'Bathroom', icon: '🚿' },
  { id: 'dining-room', name: 'Dining Room', icon: '🍽️' },
  { id: 'office', name: 'Home Office', icon: '💼' },
  { id: 'nursery', name: 'Nursery', icon: '👶' },
  { id: 'outdoor', name: 'Outdoor Space', icon: '🌳' },
  { id: 'other', name: 'Other', icon: '📦' },
];

export default function NewRoomPage({ params }: PageProps) {
  const { projectId } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  
  const [name, setName] = useState('');
  const [roomType, setRoomType] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError('Please sign in to create a room');
      return;
    }

    if (!name.trim()) {
      setError('Please enter a room name');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const roomsRef = collection(db, `users/${user.uid}/projects/${projectId}/rooms`);
      const docRef = await addDoc(roomsRef, {
        name: name.trim(),
        roomType: roomType || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Redirect to the room designer
      router.push(`/projects/${projectId}/rooms/${docRef.id}`);
    } catch (err) {
      console.error('Failed to create room:', err);
      setError('Failed to create room. Please try again.');
      setCreating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Add New Room</h1>
        <p className="text-gray-600 mt-1">Create a new room to start designing</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Room Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
            Room Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Master Bedroom, Living Room"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
            disabled={creating}
          />
        </div>

        {/* Room Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Room Type (Optional)
          </label>
          <div className="grid grid-cols-3 gap-3">
            {ROOM_TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => setRoomType(roomType === type.id ? '' : type.id)}
                disabled={creating}
                className={`
                  p-4 rounded-lg border-2 text-center transition-all
                  ${roomType === type.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }
                  ${creating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <span className="text-2xl block mb-1">{type.icon}</span>
                <span className="text-sm font-medium">{type.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            disabled={creating}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className={`
              flex-1 px-4 py-3 rounded-lg text-white font-medium transition-colors
              flex items-center justify-center gap-2
              ${creating || !name.trim()
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
              }
            `}
          >
            {creating ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creating...
              </>
            ) : (
              <>
                Create Room
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}