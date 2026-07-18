import { useState, useEffect } from 'react';
import { offlineService, type SyncStatus } from '../services/offline';

export function useOffline() {
  const [status, setStatus] = useState<SyncStatus>(offlineService.getStatus());

  useEffect(() => {
    const unsubscribe = offlineService.subscribe(setStatus);
    return unsubscribe;
  }, []);

  const sync = async () => {
    await offlineService.sync();
  };

  const checkStatus = async () => {
    await offlineService.checkStatus();
  };

  const clearQueue = () => {
    offlineService.clearQueue();
  };

  return {
    ...status,
    sync,
    checkStatus,
    clearQueue,
  };
}
