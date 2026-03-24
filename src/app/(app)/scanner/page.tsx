
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { LogIn, LogOut, Loader2, Navigation, CheckCircle, MapPin, RefreshCw, AlertTriangle, Clock, CalendarIcon, Camera } from 'lucide-react';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, set, update, query, orderByChild, equalTo, get, serverTimestamp as dbServerTimestamp, push, limitToLast } from 'firebase/database';
import { md5 } from 'js-md5';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import QrScanner from 'react-qr-scanner';
import { format, subDays } from 'date-fns';
import { arEG } from 'date-fns/locale';
import { Separator } from '@/components/ui/separator';
import { SERVER_SECRET } from '@/hooks/use-qr-code-manager';


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
        <div className="w-full aspect-square bg-black rounded-3xl flex items-center justify-center overflow-hidden relative border-8 border-primary/10 shadow-inner">
            <QrScanner
                delay={100}
                onError={onError}
                onScan={onScan}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                constraints={{ video: { facingMode: "environment", focusMode: "continuous" } }}
            />
            {/* Visual Guide Overlay */}
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
                <div className="w-72 h-72 border-2 border-white/30 rounded-3xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]">
                    {/* Corners */}
                    <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-primary rounded-tl-2xl"></div>
                    <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-primary rounded-tr-2xl"></div>
                    <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-primary rounded-bl-2xl"></div>
                    <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-primary rounded-br-2xl"></div>
                    
                    {/* Pulsing Scanning Line */}
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-primary/80 animate-scan shadow-[0_0_15px_rgba(var(--primary),0.8)]"></div>
                </div>
                <div className="mt-10 flex flex-col items-center gap-2">
                    <p className="text-white font-bold text-lg bg-primary/20 backdrop-blur-md px-6 py-2 rounded-full border border-white/10">وجه الكاميرا نحو الكود</p>
                    <div className="animate-bounce">
                        <Camera className="text-primary h-6 w-6" />
                    </div>
                </div>
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
        toast({ title: "تم تسجيل الحضور بنجاح", className: "bg-green-100 border-green-500" });
    } else {
        const openRecordInfo = await findOpenAttendanceRecord();
        if (!openRecordInfo) throw new Error("لا يوجد سجل حضور مفتوح.");
        await update(ref(db, openRecordInfo.path), { 
            checkOut: now.toISOString(), 
            ...(currentGpsLocation && { checkOutLocation: currentGpsLocation }), 
            ...(distance !== null && { checkOutDistance: distance })
        });
        toast({ title: "تم تسجيل الانصراف بنجاح", className: "bg-blue-100 border-blue-500" });
    }
  }, [db, settings, toast, findOpenAttendanceRecord]);

  const handleScan = useCallback(async (data: { text: string } | null) => {
    if (isProcessing) return;
    
    // If QR is required, we MUST have scan data
    if (qrCodeRequired && !data) return;

    setIsProcessing(true);
    try {
        const freshUserProfile = await validateUserAndDevice();
        
        let validatedLocationId = '';
        let validatedLocationName = '';
        
        // 1. Process QR Data if required
        if (qrCodeRequired && data) {
            const qrData = JSON.parse(data.text);
            const { locId, expiry, signature } = qrData;
            
            if (Date.now() > (expiry + 5000)) throw new Error("انتهت صلاحية الرمز. يرجى التحديث.");
            if (signature !== md5(`${qrData.id}|${expiry}|${locId}|${SERVER_SECRET}`)) throw new Error("رمز غير صالح.");

            const targetLocation = allLocations.find(l => l.id === locId);
            if (!targetLocation) throw new Error("فرع غير معروف.");
            
            validatedLocationId = targetLocation.id;
            validatedLocationName = targetLocation.name;
        }

        // 2. Location Check (Optional based on settings)
        let currentDistance = null;
        if (qrLocationCheckRequired || !qrCodeRequired) {
            if (!location) throw new Error("يرجى تفعيل GPS أولاً.");
            
            if (qrCodeRequired) {
                // If QR scanned, check distance to THAT branch
                const targetLocation = allLocations.find(l => l.id === validatedLocationId);
                if (targetLocation) {
                    currentDistance = getDistance(location.lat, location.lon, parseFloat(targetLocation.lat), parseFloat(targetLocation.lon));
                    if (currentDistance > (settings?.locationRadius || 100)) {
                        throw new Error(`أنت بعيد عن ${targetLocation.name} بمسافة ${Math.round(currentDistance)} متر.`);
                    }
                }
            } else {
                // If button punch, check closest branch
                if (!targetLocationData || !targetLocationData.isInside) {
                    throw new Error(targetLocationData ? `أنت بعيد عن ${targetLocationData.name} بمسافة ${Math.round(targetLocationData.distance)}م` : "لست داخل نطاق أي فرع.");
                }
                validatedLocationId = targetLocationData.id;
                validatedLocationName = targetLocationData.name;
                currentDistance = targetLocationData.distance;
            }
        } else if (qrCodeRequired && !qrLocationCheckRequired) {
            // QR is enough, no GPS check needed
        }

        await processAttendance(userStatus === 'checked_in' ? 'check_out' : 'check_in', validatedLocationId, validatedLocationName, freshUserProfile, location, currentDistance);
        setShowScanner(false);
    } catch (error: any) {
        console.error("Scan Error:", error);
        toast({ variant: "destructive", title: "خطأ", description: error.message || "حدث خطأ أثناء المعالجة." });
    } finally {
        setTimeout(() => setIsProcessing(false), 1500);
    }
  }, [isProcessing, qrCodeRequired, qrLocationCheckRequired, location, allLocations, targetLocationData, settings, toast, validateUserAndDevice, processAttendance, userStatus]);

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
                <div className="relative">
                    <Loader2 className="w-20 h-20 text-primary animate-spin" />
                    <RefreshCw className="absolute inset-0 m-auto w-8 h-8 text-primary/50" />
                </div>
                <p className="text-xl font-bold animate-pulse">جاري التحقق من البيانات...</p>
            </div>
        );
    }
    
    if (showScanner) {
      return (
        <div className="space-y-6">
          <CameraScanner onScan={handleScan} onError={(err: any) => toast({ variant: 'destructive', title: 'خطأ في الكاميرا', description: 'يرجى التأكد من إعطاء صلاحية الكاميرا للمتصفح.' })} />
          <Button variant="ghost" className="w-full text-destructive hover:bg-destructive/10" onClick={() => setShowScanner(false)}>إلغاء العملية</Button>
        </div>
      );
    }

    const isWithinRange = targetLocationData?.isInside ?? false;
    const ButtonIcon = userStatus === 'checked_in' ? LogOut : LogIn;

    return (
      <div className="space-y-6">
        {settings?.employeeAlert && (
            <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-700 rounded-2xl">
                <AlertTriangle className="h-5 w-5" />
                <AlertDescription className="font-bold text-sm leading-relaxed">{settings.employeeAlert}</AlertDescription>
            </Alert>
        )}
        
        {/* Status Badge */}
        <div className={`flex items-center justify-center gap-3 py-4 px-6 rounded-2xl border-2 transition-colors ${isWithinRange ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
            <div className={`p-2 rounded-full ${isWithinRange ? 'bg-green-200' : 'bg-orange-200'}`}>
                <MapPin className="h-5 w-5" />
            </div>
            <span className="font-bold text-sm">
                {locationStatusMessage()}
            </span>
        </div>
        
        <Button 
            size="lg" 
            variant={userStatus === 'checked_in' ? 'destructive' : 'default'} 
            className="w-full h-32 text-2xl font-bold shadow-2xl rounded-3xl active:scale-95 transition-all group overflow-hidden relative"
            onClick={() => {
                if (qrCodeRequired) {
                    setShowScanner(true);
                } else {
                    handleScan(null);
                }
            }}
            disabled={!qrCodeRequired && !isWithinRange && qrLocationCheckRequired}
        >
           <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
           <ButtonIcon className="ml-4 h-10 w-10 relative z-10"/>
           <span className="relative z-10">
                {userStatus === 'checked_in' ? 'تسجيل انصراف' : 'تسجيل حضور'}
           </span>
        </Button>
        
        {!qrCodeRequired && !isWithinRange && (
            <p className="text-center text-xs text-destructive animate-pulse font-bold">
                يجب أن تكون داخل حدود الفرع للتسجيل
            </p>
        )}
      </div>
    );
  };

  const locationStatusMessage = () => {
    if (isRequestingLocation) return "جاري تحديد موقعك الجغرافي...";
    if (locationError) return locationError;
    if (!targetLocationData) return "لا يوجد فروع قريبة منك.";
    return targetLocationData.isInside ? `أنت الآن داخل نطاق ${targetLocationData.name}` : `أقرب فرع (${targetLocationData.name}): يبعد ${Math.round(targetLocationData.distance)}م`;
  };

  return (
    <div className="flex justify-center items-start pt-4 px-2 min-h-[80vh]">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-background/95 backdrop-blur-xl overflow-hidden rounded-[2.5rem]">
        <div className="h-2 bg-primary"></div>
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-3xl font-headline text-primary mb-1">بصمة الحضور</CardTitle>
          <CardDescription className="text-base font-bold bg-muted/50 py-1 px-4 rounded-full inline-block mx-auto">
            {currentDate}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8 p-6">
            {renderContent()}
            
            <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-muted/30 rounded-3xl text-center border border-muted">
                    <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-bold">الحالة</p>
                    <Badge variant={userStatus === 'checked_in' ? 'secondary' : 'outline'} className="text-sm px-4">
                        {userStatus === 'checked_in' ? 'متصل بالعمل' : 'منصرف'}
                    </Badge>
                </div>
                <div className="p-4 bg-muted/30 rounded-3xl text-center border border-muted">
                    <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-bold">آخر حركة</p>
                    <p className="font-mono font-bold text-lg" dir="ltr">
                        {lastAction ? format(new Date(lastAction.time), 'HH:mm') : '--:--'}
                    </p>
                </div>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
