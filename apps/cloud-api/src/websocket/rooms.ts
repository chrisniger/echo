import WebSocket from 'ws';

export class RoomManager {
  private rooms = new Map<string, Set<WebSocket>>();

  join(roomId: string, ws: WebSocket): void {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId)!.add(ws);
  }

  leave(roomId: string, ws: WebSocket): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.delete(ws);
    if (room.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  leaveAll(ws: WebSocket): void {
    for (const [roomId, members] of this.rooms) {
      if (members.has(ws)) {
        members.delete(ws);
        if (members.size === 0) {
          this.rooms.delete(roomId);
        }
      }
    }
  }

  broadcast(roomId: string, message: string, exclude?: WebSocket): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const client of room) {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  broadcastToUser(userRooms: string[], message: string, exclude?: WebSocket): void {
    const sent = new Set<WebSocket>();
    for (const roomId of userRooms) {
      const room = this.rooms.get(roomId);
      if (!room) continue;
      for (const client of room) {
        if (client !== exclude && client.readyState === WebSocket.OPEN && !sent.has(client)) {
          client.send(message);
          sent.add(client);
        }
      }
    }
  }

  getRoomSize(roomId: string): number {
    return this.rooms.get(roomId)?.size ?? 0;
  }

  getRoomIds(): string[] {
    return Array.from(this.rooms.keys());
  }

  isInRoom(roomId: string, ws: WebSocket): boolean {
    return this.rooms.get(roomId)?.has(ws) ?? false;
  }
}
