
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import QrCodeDisplay from '@/components/qr-code-display';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal } from 'lucide-react';


interface Location {
  id: string;
  name: string;
  lat: string;
  lon: string;
}

interface GlobalSettings {
    locations?: Location[] | Record<string, Omit<Location, 'id'>>;
}


export default function QrDisplayPage() {
    const db = useDb();
    const [selectedLocationId, setSelectedLocationId] = useState<string>('');

    const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
    const [settings, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);
    
    const locations: Location[] = useMemo(() => {
        if (!settings?.locations) return [];
        if (Array.isArray(settings.locations)) return settings.locations;
        return Object.entries(settings.locations).map(([id, loc]) => ({ ...loc, id }));
    }, [settings]);

    const selectedLocation = useMemo(() => {
        return locations.find(loc => loc.id === selectedLocationId) || null;
    }, [locations, selectedLocationId]);

    const handleLocationChange = (locationId: string) => {
        setSelectedLocationId(locationId);
    };

    return (
        <div className="space-y-6">
             <h2 className="text-3xl font-headline font-bold tracking-tight">
                عرض رمز الحضور (QR Code)
            </h2>
            <Card>
                <CardHeader>
                    <CardTitle>اختيار موقع العرض</CardTitle>
                    <CardDescription>
                        اختر الفرع الذي تريد عرض رمز الحضور الخاص به. سيتغير الرمز تلقائياً.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isSettingsLoading ? <Skeleton className="h-10 w-full" /> : (
                         <Select dir="rtl" onValueChange={handleLocationChange} value={selectedLocationId}>
                            <SelectTrigger>
                                <SelectValue placeholder="اختر الفرع لعرض الرمز..." />
                            </SelectTrigger>
                            <SelectContent>
                                {locations.length > 0 ? (
                                    locations.map((loc) => (
                                        <SelectItem key={loc.id} value={loc.id}>
                                            {loc.name}
                                        </SelectItem>
                                    ))
                                ) : (
                                    <SelectItem value="none" disabled>لا توجد فروع معرفة</SelectItem>
                                )}
                            </SelectContent>
                        </Select>
                    )}
                </CardContent>
            </Card>

            {selectedLocationId ? (
                 <Card>
                    <CardContent className="pt-6">
                       <QrCodeDisplay locationData={selectedLocation}/>
                    </CardContent>
                </Card>
            ) : (
                <Alert>
                    <Terminal className="h-4 w-4" />
                    <AlertTitle>في انتظار اختيارك</AlertTitle>
                    <AlertDescription>
                        الرجاء اختيار فرع من القائمة أعلاه لعرض رمز الحضور الخاص به.
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}

