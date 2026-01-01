
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDb, useDbData } from '@/firebase';
import { ref, set, serverTimestamp as dbServerTimestamp, get } from 'firebase/database';
import { md5 } from 'js-md5';

export const SERVER_SECRET = 'your-very-secret-key-that-should-be-in-env';

// Full payload stored in DB
export interface QrCodePayloadDb {
  id: string;
  locationId: string;
  locationName: string;
  location: {
    latitude: number;
    longitude: number;
  };
  expiryTimestamp: number;
  signature: string;
  createdAt: object | number;
}

// The QR code will now contain a simple string: "id|locId|exp|sig"
export type QrCodeString = string;


interface LocationData {
    id: string;
    name: string;
    lat: string;
    lon: string;
}

const QR_REFRESH_INTERVAL_SECONDS = 10;

export const useQrCodeManager = (locationData: LocationData | null) => {
  const db = useDb();
  
  const [activeQrCodeString, setActiveQrCodeString] = useState<QrCodeString | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(QR_REFRESH_INTERVAL_SECONDS);
  const [expiry, setExpiry] = useState<number>(0);

  const generateAndStoreQrCode = useCallback(async () => {
    if (!db || !locationData || !locationData.id || !locationData.lat || !locationData.lon) {
      if(locationData){
         setError('بيانات الفرع غير مكتملة (خطوط الطول/العرض مفقودة).');
      }
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const qrId = `qr_${Date.now()}`;
      const expiryTimestamp = Date.now() + QR_REFRESH_INTERVAL_SECONDS * 1000;
      
      const signature = md5(`${qrId}|${expiryTimestamp}|${locationData.id}|${SERVER_SECRET}`);

      const newQrCodeForDb: Omit<QrCodePayloadDb, 'createdAt'> = {
        id: qrId,
        locationId: locationData.id,
        locationName: locationData.name,
        location: {
            latitude: parseFloat(locationData.lat),
            longitude: parseFloat(locationData.lon),
        },
        expiryTimestamp,
        signature,
      };
      
      const qrCodeRef = ref(db, `qr_codes/${locationData.id}`);
      await set(qrCodeRef, { ...newQrCodeForDb, createdAt: dbServerTimestamp() });
      
      const newQrCodeForImage = JSON.stringify({
        id: qrId,
        locId: locationData.id,
        expiry: expiryTimestamp,
        signature: signature,
        location: {
            latitude: parseFloat(locationData.lat),
            longitude: parseFloat(locationData.lon),
        }
      });
      
      setActiveQrCodeString(newQrCodeForImage);
      setExpiry(expiryTimestamp);
      setError(null);

    } catch (e: any) {
      console.error("Failed to generate QR code", e);
      setError(e.message || 'فشل في إنشاء رمز QR جديد.');
    } finally {
        setLoading(false);
    }
  }, [db, locationData]);

  // Timer effect
  useEffect(() => {
    if (!expiry) return;

    const timer = setInterval(() => {
        const now = Date.now();
        const remaining = Math.round((expiry - now) / 1000);

        if (remaining <= 0) {
            setCountdown(0);
            // Time to regenerate
            generateAndStoreQrCode();
        } else {
            setCountdown(remaining);
        }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiry, generateAndStoreQrCode]);
  
  // Initial generation and regeneration when locationData changes
  useEffect(() => {
      if (locationData) {
          generateAndStoreQrCode();
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationData]);


  return {
    activeQrCodeString,
    loading,
    error,
    countdown,
  };
};
