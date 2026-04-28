
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, MapPin } from 'lucide-react';
import qr from 'qr-image';
import { useQrCodeManager } from '@/hooks/use-qr-code-manager';

interface Location {
  id: string;
  name: string;
  lat: string;
  lon: string;
}
interface QrCodeDisplayProps {
    locationData: Location | null;
}

export default function QrCodeDisplay({ locationData }: QrCodeDisplayProps) {
  const { activeQrCodeString, loading, error, countdown } = useQrCodeManager(locationData);
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);

  useEffect(() => {
    if (activeQrCodeString) {
      const svgString = qr.imageSync(activeQrCodeString, { type: 'svg' });
      const dataUri = `data:image/svg+xml;base64,${Buffer.from(svgString).toString('base64')}`;
      setQrDataUri(dataUri);
    } else {
      setQrDataUri(null);
    }
  }, [activeQrCodeString]);
  

  if (loading && !qrDataUri) {
    return (
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="h-[220px] w-[220px] rounded-lg" />
        <Skeleton className="h-4 w-[200px]" />
        <Skeleton className="h-4 w-[150px]" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>خطأ</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!qrDataUri || !locationData) {
    return (
        <div className="flex flex-col items-center gap-4 text-center">
            <Skeleton className="h-[220px] w-[220px] rounded-lg" />
            <p className="text-muted-foreground">جاري إنشاء رمز QR جديد...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="relative w-[220px] h-[220px] bg-white p-2.5 rounded-lg shadow-md border">
        {loading && qrDataUri && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg z-10">
            <p className="text-primary font-semibold animate-pulse">
              جاري التحديث...
            </p>
          </div>
        )}
        <Image
          src={qrDataUri}
          alt="رمز QR للحضور"
          width={200}
          height={200}
          className="mx-auto"
        />
      </div>
      <p className="font-medium text-lg">
        يتغير الرمز خلال:{' '}
        <span className="font-bold text-primary tabular-nums text-xl">
          {countdown}
        </span>
      </p>
      <div className="text-xs text-muted-foreground flex flex-col items-center gap-1">
        <div className="flex items-center gap-1">
          <MapPin className="w-3 h-3"/>
          <span>الموقع المعتمد: {locationData.name}</span>
        </div>
        <div className="font-mono text-xs" dir="ltr">
            ({parseFloat(locationData.lat).toFixed(4)}, {parseFloat(locationData.lon).toFixed(4)})
        </div>
      </div>
    </div>
  );
}
