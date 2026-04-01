
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { LogIn, LogOut, Loader2, CheckCircle, MapPin, RefreshCw, AlertTriangle, Clock, Camera, Target, History, Calendar as CalendarIcon } from 'lucide-react';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, set, update, query, orderByChild, equalTo, get, serverTimestamp as dbServerTimestamp, push, limitToLast } from 'firebase/database';
import { md5 } from 'js-md5';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import QrScanner from 'react-qr-scanner';
import { format, subDays } from 'date-fns';
import { arEG } from 'date-fns/locale';
import { SERVER_SECRET } from '@/hooks/use-qr-code-manager';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';


interface EmployeeProfile {
  id: string;
  employeeName: string;
  employeeCode: string;
  deviceId?: string;
  locationIds?: string[];
  shiftConfiguration?: 'general' | 'custom';
  checkInTime?: string;
  checkOutTime?: string;
}

interface AttendanceRecord {
    id: string;
    employeeId: string;
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
    qrLocationCheckRequired: boolean;
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
        <div className="w-full aspect-square bg-black rounded-lg flex items-center justify-center overflow-hidden relative border-4 border-muted">
            <QrScanner
                delay={300}
                onError={onError}
                onScan={onScan}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                constraints={{ 
                    video: { 
                        facingMode: "environment",
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    } 
                }}
            />
            <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40">
                <div className="w-full h-full border-2 border-primary/50 relative">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary"></div>
                    <div className="absolute top-0 left-0 w-full h-0.5 bg-primary/50 animate-scan"></div>
                </div>
            </div>
            <p className="absolute bottom-4 left-0 right-0 text-center text-white text-xs bg-black/60 py-1">وجه الكاميرا نحو الرمز الموجود على شاشة الفرع</p>
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
  
  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);
  
  const qrCodeRequired = settings?.qrCodeRequired ?? true;
  const qrLocationCheckRequired = settings?.qrLocationCheckRequired ?? true;
  
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
                setLocationError('لا يمكن الوصول للموقع. يرجى تفعيل GPS والمحاولة مرة أخرى.');
                setIsRequestingLocation(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }, []);

    useEffect(() => {
        const storedProfile = localStorage.getItem('userProfile');
        if (storedProfile && storedProfile !== 'undefined') {
            try {
                setUserProfile(JSON.parse(storedProfile));
            } catch (e) {
                console.error("Error parsing profile in Scanner", e);
            }
        }
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

  const processAttendance = useCallback(async (mode: 'check_in' | 'check_out', validatedLocationId: string, validatedLocationName: string, freshUserProfile: EmployeeProfile, currentGpsLocation: {lat: number, lon: number} | null, distance: number | null) => {
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
            ...(currentGpsLocation && { checkInLocation: currentGpsLocation }),
            ...(distance !== null && { checkInDistance: distance }),
            employeeId_date: `${freshUserProfile.id}_${workDayString}`,
            status: 'present'
        });
        toast({ title: "تم تسجيل الحضور بنجاح", variant: "default" });
    } else {
        const openRecordInfo = await findOpenAttendanceRecord();
        if (!openRecordInfo) throw new Error("لا يوجد سجل حضور مفتوح.");
        await update(ref(db, openRecordInfo.path), { 
            checkOut: now.toISOString(), 
            ...(currentGpsLocation && { checkOutLocation: currentGpsLocation }), 
            ...(distance !== null && { checkOutDistance: distance })
        });
        toast({ title: "تم تسجيل الانصراف بنجاح", variant: "default" });
    }
  }, [db, settings, toast, findOpenAttendanceRecord]);

  const handleScan = useCallback(async (data: any) => {
    if (isProcessing) return;
    if (qrCodeRequired && !data) return;

    // Standardize data from different versions of react-qr-scanner
    const qrText = typeof data === 'string' ? data : data?.text;
    if (qrCodeRequired && !qrText) return;

    setIsProcessing(true);
    try {
        const freshUserProfile = await validateUserAndDevice();
        
        let validatedLocationId = '';
        let validatedLocationName = '';
        
        // 1. Process QR Data if required
        if (qrCodeRequired && qrText) {
            // Simplified string format: "id|locId|exp|sig"
            const [id, locId, expiry, signature] = qrText.split('|');
            
            if (!id || !locId || !expiry || !signature) throw new Error("تنسيق رمز QR غير صالح.");
            
            if (Date.now() > (Number(expiry) + 10000)) throw new Error("انتهت صلاحية الرمز. يرجى التحديث.");
            
            const expectedSig = md5(`${id}|${expiry}|${locId}|${SERVER_SECRET}`);
            if (signature !== expectedSig) throw new Error("رمز غير صالح أو تم التلاعب به.");

            const targetLocation = allLocations.find(l => l.id === locId);
            if (!targetLocation) throw new Error("هذا الرمز تابع لفرع غير مسجل لك.");
            
            validatedLocationId = targetLocation.id;
            validatedLocationName = targetLocation.name;
        }

        // 2. Location Check
        let currentDistance = null;
        if (qrLocationCheckRequired || !qrCodeRequired) {
            if (!location) throw new Error("يرجى تفعيل GPS أولاً للسماح بالتحقق من تواجدك.");
            
            if (qrCodeRequired) {
                const targetLocation = allLocations.find(l => l.id === validatedLocationId);
                if (targetLocation) {
                    currentDistance = getDistance(location.lat, location.lon, parseFloat(targetLocation.lat), parseFloat(targetLocation.lon));
                    if (currentDistance > (settings?.locationRadius || 100)) {
                        throw new Error(`أنت بعيد عن موقع ${targetLocation.name} بمسافة ${Math.round(currentDistance)} متر.`);
                    }
                }
            } else {
                if (!targetLocationData || !targetLocationData.isInside) {
                    throw new Error(targetLocationData ? `أنت بعيد عن ${targetLocationData.name} بمسافة ${Math.round(targetLocationData.distance)}م` : "لست داخل نطاق أي فرع مسموح لك به.");
                }
                validatedLocationId = targetLocationData.id;
                validatedLocationName = targetLocationData.name;
                currentDistance = targetLocationData.distance;
            }
        }

        await processAttendance(userStatus === 'checked_in' ? 'check_out' : 'check_in', validatedLocationId, validatedLocationName, freshUserProfile, location, currentDistance);
        setShowScanner(false);
    } catch (error: any) {
        console.error("Scan Error:", error);
        toast({ variant: "destructive", title: "فشل العملية", description: error.message || "حدث خطأ غير متوقع." });
    } finally {
        setTimeout(() => setIsProcessing(false), 1000);
    }
  }, [isProcessing, qrCodeRequired, qrLocationCheckRequired, location, allLocations, targetLocationData, settings, toast, validateUserAndDevice, processAttendance, userStatus]);

  const renderContent = () => {
    if (!userProfile || isSettingsLoading || userStatus === 'loading') {
      return (
        <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-20 w-full" />
        </div>
      );
    }

    if (isProcessing) {
        return (
            <div className="flex flex-col items-center justify-center space-y-4 p-8">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <p className="text-lg font-bold animate-pulse">جاري التحقق من البيانات...</p>
            </div>
        );
    }
    
    if (showScanner) {
      return (
        <div className="space-y-6">
          <CameraScanner onScan={handleScan} onError={(err: any) => toast({ variant: 'destructive', title: 'خطأ في الكاميرا', description: 'يرجى إعطاء صلاحية الكاميرا للمتصفح.' })} />
          <Button variant="outline" className="w-full" onClick={() => setShowScanner(false)}>إلغاء و العودة</Button>
        </div>
      );
    }

    const isWithinRange = targetLocationData?.isInside ?? false;
    const ButtonIcon = userStatus === 'checked_in' ? LogOut : LogIn;

    return (
      <div className="space-y-6">
        {settings?.employeeAlert && (
            <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-700 dark:text-yellow-400 font-bold">{settings.employeeAlert}</AlertDescription>
            </Alert>
        )}

        <Card className="border-2">
            <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <MapPin className={cn("h-5 w-5", isWithinRange ? "text-green-500" : "text-destructive")} />
                        <span className="font-semibold">الموقع الجغرافي:</span>
                    </div>
                    {isRequestingLocation ? (
                        <div className="flex items-center gap-1 text-muted-foreground text-xs">
                            <RefreshCw className="h-3 w-3 animate-spin" /> جاري التحديد...
                        </div>
                    ) : (
                        <Badge variant={isWithinRange ? "secondary" : "destructive"}>
                            {isWithinRange ? "داخل النطاق" : "خارج النطاق"}
                        </Badge>
                    )}
                </div>
                
                <div className="text-sm space-y-1">
                    <p className="text-muted-foreground">{locationStatusMessage()}</p>
                    {userProfile.shiftConfiguration === 'custom' && (
                        <div className="flex items-center gap-2 text-primary font-bold">
                            <Clock className="h-4 w-4" />
                            <span>دوامك: {userProfile.checkInTime} إلى {userProfile.checkOutTime}</span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
        
        <Button 
            size="lg" 
            variant={userStatus === 'checked_in' ? 'destructive' : 'default'} 
            className="w-full h-24 text-xl font-bold shadow-lg"
            onClick={() => {
                if (qrCodeRequired) {
                    setShowScanner(true);
                } else {
                    handleScan(null);
                }
            }}
            disabled={!qrCodeRequired && !isWithinRange && qrLocationCheckRequired}
        >
           <ButtonIcon className="ml-2 h-6 w-6"/>
           {userStatus === 'checked_in' ? 'تسجيل انصراف الآن' : 'تسجيل حضور الآن'}
        </Button>

        <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1"><History className="h-3 w-3" /> آخر عملية</p>
                <p className="font-mono font-bold">{lastAction ? format(new Date(lastAction.time), 'HH:mm') : '--:--'}</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1"><Target className="h-3 w-3" /> الحالة</p>
                <Badge variant={userStatus === 'checked_in' ? "secondary" : "outline"}>
                    {userStatus === 'checked_in' ? "متواجد" : "منصرف"}
                </Badge>
            </div>
        </div>
      </div>
    );
  };

  const locationStatusMessage = () => {
    if (isRequestingLocation) return "جاري البحث عن أقرب فرع...";
    if (locationError) return locationError;
    if (!targetLocationData) return "لم يتم العثور على فروع قريبة منك مسموح لك بها.";
    return `أنت الآن في ${targetLocationData.name} (تبعد ${Math.round(targetLocationData.distance)}م)`;
  };

  return (
    <div className="flex justify-center items-start pt-4 px-2">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-headline">بصمة الحضور الذكية</CardTitle>
          <CardDescription className="flex items-center justify-center gap-2">
            <CalendarIcon className="h-4 w-4" /> {currentDate}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
            {renderContent()}
        </CardContent>
      </Card>
    </div>
  );
}
