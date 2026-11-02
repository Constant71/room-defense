import { parseRoom } from './room';
import type { Room } from './types';

export interface RoomListing {
  file: string;
  name: string;
  updated: number;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export async function listRooms(): Promise<RoomListing[]> {
  return json<RoomListing[]>(await fetch('/api/rooms'));
}

export async function loadRoom(file: string): Promise<Room> {
  return parseRoom(await json<unknown>(await fetch(`/api/rooms/${encodeURIComponent(file)}`)));
}

export async function saveRoom(file: string, room: Room): Promise<void> {
  await json(
    await fetch(`/api/rooms/${encodeURIComponent(file)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(room),
    }),
  );
}
