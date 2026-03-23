
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { LogIn, LogOut, Loader2, Navigation, CheckCircle, MapPin, RefreshCw, AlertTriangle, Clock, CalendarIcon } from 'lucide-react';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, set, update, query, orderByChild, equalTo, get, serverTimestamp as dbServerTimestamp, push, limitToLast } from 'firebase/database';
import { md5 } from 'js-md5';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import QrScanner from 'react-qr-scanner';
import { format, subDays } from 'date-fns';
import { arEG } from 'date-fns/locale';
import { Separator } from '@/components/ui/separator';


interface EmployeeProfile {
  id: string;
  employeeCode: string;
  deviceId?: string;
  locationIds?: string[];
  shiftConfiguration?: 'general' | 'custom';
  checkInTime?: string;
  checkOutTime?: string;
}

interface AttendanceRecord {
    id: string;
    checkIn: string;
    checkOut?: string;
    date: string;
    status?: 'present' | 'absent' | 'weekly_off';
}

interface LocationDb {
    id: string;
    name: string;
    lat: string;
    lon: string;
}

interface TargetLocationData extends LocationDb {
    distance: number;
    isInside: boolean;
}

interface GlobalSettings {
    locationRadius: number;
    workStartTime: string;
    workEndTime: string;
    lateAllowance: number;
    qrCodeRequired: boolean;
    locations: LocationDb[];
    employeeAlert?: string;
}

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; 
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; 
}

const WORK_DAY_START_HOUR = 4;

const getWorkDayDate = (date: Date): Date => {
    const checkDate = new Date(date);
    if (checkDate.getHours() < WORK_DAY_START_HOUR) {
        checkDate.setDate(checkDate.getDate() - 1);
    }
    return checkDate;
};

type UserStatus = 'checked_in' | 'checked_out' | 'loading' | 'error';

const CameraScanner = ({ onScan, onError }: { onScan: (data: any) => void, onError: (error: any) => void }) => {
    return (
        <div className="w-full aspect-square bg-black rounded-lg flex items-center justify-center overflow-hidden relative border-4 border-primary/20">
            <QrScanner
                delay={200}
                onError={onError}
                onScan={onScan}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                constraints={{ video: { facingMode: "environment" } }}
            />
            {/* Visual Guide Overlay */}
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
                <div className="w-64 h-64 border-2 border-primary/50 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                    {/* Corners */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary"></div>
                    {/* Scanning Line Animation */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-primary/80 animate-scan"></div>
                </div>
                <p className="mt-8 text-white font-bold bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm">ضع رمز QR داخل المربع</p>
            </div>
        </div>
    );
};


export default function ScannerPage() {
  const [showScanner, setShowScanner] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isRequestingLocation, setIsRequestingLocation] = useState(true);
  const [userProfile, setUserProfile] = useState<EmployeeProfile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [userStatus, setUserStatus] = useState<UserStatus>('loading');
  const [lastAction, setLastAction] = useState<{ type: 'check_in' | 'check_out', time: string } | null>(null);
  const [currentDate, setCurrentDate] = useState('');

  const { toast } = useToast();
  const db = useDb();
  
  const SERVER_SECRET = 'your-very-secret-key-that-should-be-in-env';

  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);
  
  const qrCodeRequired = settings?.qrCodeRequired ?? true;
  
  const allLocations = useMemo<LocationDb[]>(() => {
    if (!settings?.locations) return [];
    const locationsRaw = Array.isArray(settings.locations) ? settings.locations : Object.values(settings.locations);
    return locationsRaw.filter((loc): loc is LocationDb => typeof loc === 'object' && loc !== null && 'id' in loc);
  }, [settings]);

 useEffect(() => {
    setCurrentDate(format(new Date(), 'EEEE, d MMMM yyyy', { locale: arEG }));
  }, []);

 const targetLocationData = useMemo((): TargetLocationData | null => {
    if (!location || !allLocations.length || !userProfile) return null;
    const allowedRadius = settings?.locationRadius || 100;
    const employeeLocationIds = userProfile.locationIds || [];
    const relevantLocations = (employeeLocationIds.length > 0) ? allLocations.filter(loc => employeeLocationIds.includes(loc.id)) : allLocations;
    if (relevantLocations.length === 0) return null;
    let closestLocation: TargetLocationData | null = null;
    let minDistance = Infinity;
    for (const loc of relevantLocations) {
        if (!loc.lat || !loc.lon) continue;
        const distance = getDistance(location.lat, location.lon, parseFloat(loc.lat), parseFloat(loc.lon));
        if (distance < minDistance) {
            minDistance = distance;
            closestLocation = { ...loc, distance, isInside: distance <= allowedRadius };
        }
    }
    return closestLocation;
  }, [location, allLocations, settings?.locationRadius, userProfile]);
  
  const requestLocation = useCallback(() => {
        setIsRequestingLocation(true);
        setLocationError(null);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
                setLocationError(null);
                setIsRequestingLocation(false);
            },
            () => {
                setLocationError('لا يمكن الوصول للموقع. يرجى تفعيل الإذن والمحاولة مرة أخرى.');
                setIsRequestingLocation(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }, []);

    useEffect(() => {
        const storedProfile = localStorage.getItem('userProfile');
        if (storedProfile) setUserProfile(JSON.parse(storedProfile));
        requestLocation();
    }, [requestLocation]);

    const findOpenAttendanceRecord = useCallback(async () => {
        if (!db || !userProfile) return null;
        const today = new Date();
        const monthStrings = [format(today, 'yyyy-MM'), format(subDays(today, 1), 'yyyy-MM')];
        for (const monthString of monthStrings) {
            const attendanceRef = ref(db, `attendance/${monthString}`);
            const q = query(attendanceRef, orderByChild('employeeId'), equalTo(userProfile.id), limitToLast(5));
            const snapshot = await get(q);
            if (snapshot.exists()) {
                const records = Object.entries(snapshot.val()) as [string, AttendanceRecord][];
                const openRecordEntry = records.find(([, record]) => record.checkIn && !record.checkOut && record.status !== 'weekly_off' && record.status !== 'absent');
                if (openRecordEntry) return { recordId: openRecordEntry[0], path: `attendance/${monthString}/${openRecordEntry[0]}`, data: openRecordEntry[1] };
            }
        }
        return null;
    }, [db, userProfile]);

    useEffect(() => {
        const checkUserStatus = async () => {
            if (!db || !userProfile) return;
            setUserStatus('loading');
            try {
                const openRecord = await findOpenAttendanceRecord();
                if (openRecord) {
                    setLastAction({ type: 'check_in', time: openRecord.data.checkIn });
                    setUserStatus('checked_in');
                } else {
                    setUserStatus('checked_out');
                }
            } catch (error) {
                setUserStatus('error');
            }
        };
        checkUserStatus();
    }, [userProfile, db, findOpenAttendanceRecord, isProcessing]);

  const validateUserAndDevice = useCallback(async (): Promise<EmployeeProfile> => {
    if (!userProfile || !db) throw new Error("بيانات المستخدم غير موجودة.");
    const freshUserProfileSnapshot = await get(ref(db, `employees/${userProfile.id}`));
    if (!freshUserProfileSnapshot.exists()) throw new Error("لم يتم العثور على حساب الموظف.");
    const freshUserProfile: EmployeeProfile = {id: userProfile.id, ...freshUserProfileSnapshot.val()};
    const currentDeviceId = localStorage.getItem('device_id');
    if (freshUserProfile.deviceId && freshUserProfile.deviceId !== currentDeviceId) {
        throw new Error(`هذا الجهاز غير مسجل لحسابك. يرجى مراجعة الإدارة.`);
    }
    return freshUserProfile;
  }, [userProfile, db]);

  const processAttendance = useCallback(async (mode: 'check_in' | 'check_out', validatedLocationId: string, validatedLocationName: string, freshUserProfile: EmployeeProfile, currentGpsLocation: {lat: number, lon: number}, distance: number) => {
     if (!db || !settings) throw new Error("بيانات الإعدادات غير متاحة.");
    const now = new Date();
    const workDayDate = getWorkDayDate(now);
    const workDayString = format(workDayDate, 'yyyy-MM-dd');
    const monthString = format(workDayDate, 'yyyy-MM');
    
    if (mode === 'check_in') {
        const newRecordRef = push(ref(db, `attendance/${monthString}`));
        const officialStart = (freshUserProfile.shiftConfiguration === 'custom' && freshUserProfile.checkInTime) || settings.workStartTime;
        const workStartToday = new Date(`${workDayString}T${officialStart}`);
        let delayMinutes = (now > workStartToday) ? Math.floor((now.getTime() - workStartToday.getTime()) / 60000) : 0;

        await set(newRecordRef, {
            employeeId: freshUserProfile.id,
            date: workDayString,
            checkIn: now.toISOString(),
            delayMinutes,
            officialCheckInTime: officialStart,
            officialCheckOutTime: (freshUserProfile.shiftConfiguration === 'custom' && freshUserProfile.checkOutTime) || settings.workEndTime,
            locationId: validatedLocationId,
            locationName: validatedLocationName,
            checkInLocation: currentGpsLocation,
            checkInDistance: distance,
            employeeId_date: `${freshUserProfile.id}_${workDayString}`,
            status: 'present'
        });
        toast({ title: "تم تسجيل الحضور بنجاح", className: "bg-green-100 border-green-500" });
    } else {
        const openRecordInfo = await findOpenAttendanceRecord();
        if (!openRecordInfo) throw new Error("لا يوجد سجل حضور مفتوح.");
        await update(ref(db, openRecordInfo.path), { 
            checkOut: now.toISOString(), 
            checkOutLocation: currentGpsLocation, 
            checkOutDistance: distance 
        });
        toast({ title: "تم تسجيل الانصراف بنجاح", className: "bg-blue-100 border-blue-500" });
    }
  }, [db, settings, toast, findOpenAttendanceRecord]);

  const handleScan = useCallback(async (data: { text: string } | null) => {
    if (!data || isProcessing || !location) return;
    setIsProcessing(true);
    try {
        const freshUserProfile = await validateUserAndDevice();
        const qrData = JSON.parse(data.text);
        const { locId, expiry, signature } = qrData;
        
        if (Date.now() > expiry) throw new Error("انتهت صلاحية الرمز. يرجى التحديث.");
        if (signature !== md5(`${qrData.id}|${expiry}|${locId}|${SERVER_SECRET}`)) throw new Error("رمز غير صالح.");

        const targetLocation = allLocations.find(l => l.id === locId);
        if (!targetLocation) throw new Error("فرع غير معروف.");
        
        const distance = getDistance(location.lat, location.lon, parseFloat(targetLocation.lat), parseFloat(targetLocation.lon));
        if (distance > (settings?.locationRadius || 100)) throw new Error(`أنت بعيد عن الفرع بمسافة ${Math.round(distance)} متر.`);
        
        await processAttendance(userStatus === 'checked_in' ? 'check_out' : 'check_in', targetLocation.id, targetLocation.name, freshUserProfile, location, distance);
        setShowScanner(false);
    } catch (error: any) {
        toast({ variant: "destructive", title: "خطأ", description: error.message || "حدث خطأ أثناء المسح." });
    } finally {
        setTimeout(() => setIsProcessing(false), 2000);
    }
  }, [isProcessing, db, location, settings, toast, validateUserAndDevice, processAttendance, allLocations, userStatus]);

  const renderContent = () => {
    if (!userProfile || isSettingsLoading || userStatus === 'loading') {
      return (
        <div className="text-center text-muted-foreground p-8">
            <Loader2 className="h-8 w-8 mx-auto animate-spin mb-4 text-primary"/>
            <p>جاري تحميل البيانات...</p>
        </div>
      );
    }

    if (isProcessing) {
        return (
            <div className="flex flex-col items-center justify-center space-y-4 p-8">
                <Loader2 className="w-16 h-16 text-primary animate-spin" />
                <p className="text-lg font-bold">جاري معالجة الطلب...</p>
            </div>
        );
    }
    
    if (showScanner) {
      return (
        <div className="space-y-4">
          <CameraScanner onScan={handleScan} onError={(err: any) => toast({ variant: 'destructive', title: 'خطأ في الكاميرا' })} />
          <Button variant="outline" className="w-full" onClick={() => setShowScanner(false)}>إلغاء</Button>
        </div>
      );
    }

    const isWithinRange = targetLocationData?.isInside ?? false;
    const ButtonIcon = userStatus === 'checked_in' ? LogOut : LogIn;

    return (
      <div className="space-y-4">
        {settings?.employeeAlert && (
            <Alert className="border-yellow-500/50 bg-yellow-500/10 text-yellow-700">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="font-bold">{settings.employeeAlert}</AlertDescription>
            </Alert>
        )}
        <div className={`text-center text-sm p-3 rounded-xl border-2 ${isWithinRange ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
            <MapPin className="h-4 w-4 mx-auto mb-1" />
            {locationStatusMessage()}
        </div>
        
        <Button size="lg" variant={userStatus === 'checked_in' ? 'destructive' : 'default'} className="w-full h-24 text-2xl shadow-xl rounded-2xl active:scale-95 transition-transform" onClick={() => location ? (qrCodeRequired ? setShowScanner(true) : handleScan(null)) : requestLocation()} disabled={!location || (!isWithinRange && !qrCodeRequired)}>
           <ButtonIcon className="ml-4 h-8 w-8"/>
           {userStatus === 'checked_in' ? 'تسجيل انصراف' : 'تسجيل حضور'}
        </Button>
      </div>
    );
  };

  const locationStatusMessage = () => {
    if (isRequestingLocation) return "جاري تحديد الموقع...";
    if (locationError) return locationError;
    if (!targetLocationData) return "لا يوجد فروع قريبة منك.";
    return targetLocationData.isInside ? `أنت داخل نطاق ${targetLocationData.name}` : `أقرب فرع (${targetLocationData.name}): يبعد ${Math.round(targetLocationData.distance)}م`;
  };

  return (
    <div className="flex justify-center items-start pt-4 px-2">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-background/80 backdrop-blur-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-headline text-primary">بصمة الحضور</CardTitle>
          <CardDescription className="text-base font-bold">{currentDate}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            {renderContent()}
            <Separator />
            <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted rounded-xl text-center">
                    <p className="text-xs text-muted-foreground mb-1">الحالة</p>
                    <p className="font-bold">{userStatus === 'checked_in' ? 'متصل' : 'منصرف'}</p>
                </div>
                <div className="p-3 bg-muted rounded-xl text-center">
                    <p className="text-xs text-muted-foreground mb-1">آخر حركة</p>
                    <p className="font-bold text-xs" dir="ltr">{lastAction ? format(new Date(lastAction.time), 'HH:mm') : '--:--'}</p>
                </div>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
