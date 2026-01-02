'use client';

import QrCodeDisplay from '@/components/qr-code-display';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useState, useMemo, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { QrCode, WifiOff } from 'lucide-react';

interface Location {
  id: string;
  name: string;
  lat: string;
  lon: string;
}

interface Settings {
    locations?: Location[];
    qrCodeRequired?: boolean;
}

export default function QrDisplayPage() {
  const db = useDb();
  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isLoadingSettings] = useDbData<Settings>(settingsRef);

  const locations = useMemo<Location[]>(() => {
    const rawLocations = settings?.locations;
    if (!rawLocations) return [];
    const locationsArray = Array.isArray(rawLocations) ? rawLocations : Object.values(rawLocations);
    return locationsArray.filter((loc): loc is Location => typeof loc === 'object' && loc !== null && 'id' in loc);
  }, [settings]);

  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  
  const qrCodeRequired = settings?.qrCodeRequired ?? true;

  useEffect(() => {
    // This effect ensures the selectedLocation state is always valid and in sync with the locations from the DB.
    if (locations.length > 0) {
      if (selectedLocation) {
        // If a location is currently selected, check if it still exists in the updated list.
        const stillExists = locations.some(loc => loc.id === selectedLocation.id);
        if (!stillExists) {
          // If the selected location was deleted, fall back to the first available one.
          setSelectedLocation(locations[0]);
        }
      } else {
        // If no location is selected yet (e.g., on initial load), select the first one.
        setSelectedLocation(locations[0]);
      }
    } else {
      // If there are no locations at all, clear the selection.
      setSelectedLocation(null);
    }
  }, [locations, selectedLocation]);


  return (
    <div className="flex justify-center items-start pt-10">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-headline">رمز الحضور و الانصراف</CardTitle>
           {qrCodeRequired ? (
              <CardDescription>امسح الرمز التالي لتسجيل الحضور أو الانصراف</CardDescription>
            ) : (
                <CardDescription>تسجيل الحضور والانصراف لا يتطلب QR Code حالياً.</CardDescription>
            )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="location-select">اختر الفرع لعرض الرمز</Label>
            {isLoadingSettings && !locations.length ? (
                <Skeleton className="h-10 w-full" />
            ) : (
            <Select
              dir="rtl"
              value={selectedLocation?.id || ''}
              onValueChange={(value) => {
                const newLocation = locations.find(loc => loc.id === value);
                if (newLocation) {
                  setSelectedLocation(newLocation);
                }
              }}
              disabled={locations.length === 0 || !qrCodeRequired}
            >
              <SelectTrigger id="location-select">
                <SelectValue placeholder={locations.length === 0 ? "الرجاء إضافة فرع" : "اختر الفرع"} />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            )}
          </div>
          
          { !qrCodeRequired ? (
              <Alert variant="default" className="text-center">
                  <WifiOff className="h-4 w-4" />
                  <AlertTitle>ميزة QR معطلة</AlertTitle>
                  <AlertDescription>
                    تم تعطيل التسجيل عبر QR Code من الإعدادات. يمكن للموظفين التسجيل مباشرة من شاشة "مسح QR Code" بناءً على موقعهم.
                  </AlertDescription>
              </Alert>
          ) : isLoadingSettings && !selectedLocation ? (
             <div className="flex flex-col items-center gap-4 text-center text-muted-foreground">
                 <Skeleton className="h-[220px] w-[220px] rounded-lg" />
                <p>جاري تحميل الإعدادات...</p>
            </div>
          ) : !selectedLocation ? (
             <div className="flex flex-col items-center gap-4 text-center text-muted-foreground">
                 <QrCode className="h-24 w-24 text-muted-foreground/50" />
                <p>الرجاء إضافة فرع في صفحة الإعدادات أولاً لعرض الرمز.</p>
            </div>
          ) : (
             <QrCodeDisplay locationData={selectedLocation} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
