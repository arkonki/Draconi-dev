import { supabase } from '../supabase';

export interface PushSubscriptionRecord {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiration_time: string | null;
  created_at: string;
  updated_at: string;
}

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function serializeSubscription(subscription: PushSubscription) {
  const p256dhKey = subscription.getKey('p256dh');
  const authKey = subscription.getKey('auth');

  if (!p256dhKey || !authKey) {
    throw new Error('Push subscription keys are missing.');
  }

  return {
    endpoint: subscription.endpoint,
    p256dh: arrayBufferToBase64(p256dhKey),
    auth: arrayBufferToBase64(authKey),
    expiration_time:
      subscription.expirationTime === null ? null : new Date(subscription.expirationTime).toISOString(),
  };
}

export function isPushSupported(): boolean {
  return Boolean(
    typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && VAPID_PUBLIC_KEY
  );
}

export const pushSubscriptionApi = {
  getPublicKey: () => VAPID_PUBLIC_KEY,

  getBrowserSubscription: async (): Promise<PushSubscription | null> => {
    if (!isPushSupported()) {
      return null;
    }

    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  },

  subscribeCurrentBrowser: async (): Promise<PushSubscription> => {
    if (!isPushSupported() || !VAPID_PUBLIC_KEY) {
      throw new Error('Push notifications are not configured.');
    }

    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      return existingSubscription;
    }

    return registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  },

  saveSubscription: async (userId: string, subscription: PushSubscription): Promise<PushSubscriptionRecord> => {
    const payload = {
      user_id: userId,
      ...serializeSubscription(subscription),
    };

    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert(payload, { onConflict: 'endpoint' })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as PushSubscriptionRecord;
  },

  deleteSubscriptionByEndpoint: async (endpoint: string): Promise<void> => {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint);

    if (error) {
      throw error;
    }
  },

  unsubscribeCurrentBrowser: async (): Promise<void> => {
    const existingSubscription = await pushSubscriptionApi.getBrowserSubscription();
    if (!existingSubscription) {
      return;
    }

    const endpoint = existingSubscription.endpoint;
    await existingSubscription.unsubscribe();
    await pushSubscriptionApi.deleteSubscriptionByEndpoint(endpoint);
  },
};
