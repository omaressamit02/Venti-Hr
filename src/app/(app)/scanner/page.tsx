
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { LogIn, LogOut, XCircle, Loader2, Navigation, CheckCircle, MapPin, RefreshCw, AlertTriangle, Clock, CalendarIcon } from 'lucide-react';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, set, update, query, orderByChild, equalTo, get, serverTimestamp as dbServerTimestamp, push, limitToLast } from 'firebase/database';
import { md5 } from 'js-md5';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import QrScanner from 'react-qr-scanner';
import { format, subDays, startOfDay } from 'date-fns';
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

const WORK_DAY_START_HOUR = 4; // 4 AM

const getWorkDayDate = (date: Date): Date => {
    const checkDate = new Date(date);
    if (checkDate.getHours() < WORK_DAY_START_HOUR) {
        checkDate.setDate(checkDate.getDate() - 1);
    }
    return checkDate;
};

type UserStatus = 'checked_in' | 'checked_out' | 'loading' | 'error';
interface LastAction {
    type: 'check_in' | 'check_out';
    time: string;
}

const CameraScanner = ({ onScan, onError }: { onScan: (data: any) => void, onError: (error: any) => void }) => {
    const handleError = (err: any) => {
        console.error(err);
        onError(err);
    }
    
    const handleScan = (data: any) => {
        if (data) {
            onScan(data);
        }
    }
    
    return (
        <div className="w-full aspect-square bg-black rounded-lg flex items-center justify-center overflow-hidden relative">
            <QrScanner
                delay={300}
                onError={handleError}
                onScan={handleScan}
                style={{ width: '100%', height: '100%' }}
                constraints={{ video: { facingMode: "environment" } }}
            />
            <div className="absolute inset-0 z-10">
                <div className="absolute top-1/2 left-1/2 w-[70%] h-[70%] -translate-x-1/2 -translate-y-1/2">
                    <div className="absolute -top-1 -left-1 w-10 h-10 border-t-4 border-l-4 border-primary rounded-tl-lg"></div>
                    <div className="absolute -top-1 -right-1 w-10 h-10 border-t-4 border-r-4 border-primary rounded-tr-lg"></div>
                    <div className="absolute -bottom-1 -left-1 w-10 h-10 border-b-4 border-l-4 border-primary rounded-bl-lg"></div>
                    <div className="absolute -bottom-1 -right-1 w-10 h-10 border-b-4 border-r-4 border-primary rounded-br-lg"></div>
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
    const isAssignedToSpecificBranches = employeeLocationIds && employeeLocationIds.length > 0;
    
    const relevantLocations = isAssignedToSpecificBranches
        ? allLocations.filter(loc => employeeLocationIds.includes(loc.id))
        : allLocations;

    if (relevantLocations.length === 0) return null;

    let closestLocation: TargetLocationData | null = null;
    let minDistance = Infinity;

    for (const loc of relevantLocations) {
        if (!loc.lat || !loc.lon) continue;
        const distance = getDistance(location.lat, location.lon, parseFloat(loc.lat), parseFloat(loc.lon));
        if (distance < minDistance) {
            minDistance = distance;
            closestLocation = {
                ...loc,
                distance,
                isInside: distance <= allowedRadius,
            };
        }
    }

    return closestLocation;
  }, [location, allLocations, settings?.locationRadius, userProfile]);
  
  const requestLocation = useCallback(() => {
        setIsRequestingLocation(true);
        setLocationError(null);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                });
                setLocationError(null);
                setIsRequestingLocation(false);
            },
            (error) => {
                setLocationError('لا يمكن الوصول للموقع. يرجى تفعيل الإذن والمحاولة مرة أخرى.');
                setLocation(null);
                setIsRequestingLocation(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }, []);

    useEffect(() => {
        const storedProfile = localStorage.getItem('userProfile');
        if (storedProfile) {
            setUserProfile(JSON.parse(storedProfile));
        }
        requestLocation();
    }, [requestLocation]);

    // This is the core logic for handling check-in/out across midnight
    const findOpenAttendanceRecord = useCallback(async () => {
        if (!db || !userProfile) return null;

        // We check today's and yesterday's month strings to cover overnight shifts
        const today = new Date();
        const yesterday = subDays(today, 1);
        const monthStrings = Array.from(new Set([format(today, 'yyyy-MM'), format(yesterday, 'yyyy-MM')]));
        
        for (const monthString of monthStrings) {
            const attendanceRef = ref(db, `attendance/${monthString}`);
            // Fetch last 10 records for the user to be safe
            const q = query(attendanceRef, orderByChild('employeeId'), equalTo(userProfile.id), limitToLast(10));
            const snapshot = await get(q);

            if (snapshot.exists()) {
                const records = Object.entries(snapshot.val()) as [string, AttendanceRecord][];
                // Find the most recent record that has a checkIn but no checkOut
                const openRecord = records
                    .sort((a, b) => new Date(b[1].checkIn).getTime() - new Date(a[1].checkIn).getTime())
                    .find(([, record]) => record.checkIn && !record.checkOut);
                
                if (openRecord) {
                    const [recordId] = openRecord;
                    // Check if it's within a reasonable time frame (e.g., 24 hours)
                    const checkInTime = new Date(openRecord[1].checkIn).getTime();
                    if ((today.getTime() - checkInTime) < 24 * 60 * 60 * 1000) {
                         return { recordId, path: `attendance/${monthString}/${recordId}` };
                    }
                }
            }
        }
        return null;
    }, [db, userProfile]);

    useEffect(() => {
        const checkUserStatus = async () => {
            if (!db) return;
            setUserStatus('loading');
            try {
                const openRecord = await findOpenAttendanceRecord();
                if (openRecord) {
                    const recordSnapshot = await get(ref(db, openRecord.path));
                    if (recordSnapshot.exists()) {
                        const recordData = recordSnapshot.val();
                        setLastAction({ type: 'check_in', time: recordData.checkIn });
                        if(recordData.checkOut){
                             setUserStatus('checked_out');
                             setLastAction({ type: 'check_out', time: recordData.checkOut });
                        } else {
                            setUserStatus('checked_in');
                        }
                    } else {
                         setUserStatus('checked_out');
                         setLastAction(null);
                    }
                } else {
                    setUserStatus('checked_out');
                    const lastRecord = await findLastAttendanceRecord();
                    if (lastRecord) {
                         setLastAction({ type: 'check_out', time: lastRecord.checkOut! });
                    } else {
                        setLastAction(null);
                    }
                }
            } catch (error) {
                setUserStatus('error');
                console.error("Error checking user status:", error);
            }
        };

        if (userProfile && db) {
            checkUserStatus();
        }
    }, [userProfile, db, findOpenAttendanceRecord, isProcessing]);

  const findLastAttendanceRecord = useCallback(async (): Promise<AttendanceRecord | null> => {
        if (!db || !userProfile) return null;

        const today = new Date();
        const monthString = format(today, 'yyyy-MM');
        
        const attendanceRef = ref(db, `attendance/${monthString}`);
        const q = query(attendanceRef, orderByChild('employeeId'), equalTo(userProfile.id), limitToLast(1));
        const snapshot = await get(q);

        if (snapshot.exists()) {
            const [recordId, recordData] = Object.entries(snapshot.val())[0] as [string, AttendanceRecord];
            return { ...recordData, id: recordId };
        }
        return null;
    }, [db, userProfile]);


  const validateUserAndDevice = useCallback(async (): Promise<EmployeeProfile> => {
    if (!userProfile || !db) throw new Error("لم يتم العثور على ملف تعريف المستخدم.");
    
    const freshUserProfileSnapshot = await get(ref(db, `employees/${userProfile.id}`));
    if (!freshUserProfileSnapshot.exists()) throw new Error("لم يتم العثور على حساب الموظف.");
    
    const freshUserProfile: EmployeeProfile = {id: userProfile.id, ...freshUserProfileSnapshot.val()};
    setUserProfile(freshUserProfile);
    
    const currentDeviceId = localStorage.getItem('device_id');
    if (!freshUserProfile.deviceId) {
         if (!currentDeviceId) {
            const newId = `device_${Date.now()}`;
            localStorage.setItem('device_id', newId);
            await update(ref(db, `employees/${userProfile.id}`), { deviceId: newId });
            toast({ title: "تم تسجيل الجهاز", description: "تم ربط هذا الجهاز بحسابك. يمكنك الآن المتابعة." });
            return { ...freshUserProfile, deviceId: newId };
         } else {
            await update(ref(db, `employees/${userProfile.id}`), { deviceId: currentDeviceId });
            return { ...freshUserProfile, deviceId: currentDeviceId };
         }
    }

    if (freshUserProfile.deviceId !== currentDeviceId) {
        throw new Error(`الجهاز المستخدم لا يطابق الجهاز المسجل.`);
    }

    return freshUserProfile;
  }, [userProfile, db, toast]);

  const processAttendance = useCallback(async (mode: 'check_in' | 'check_out', validatedLocationId: string, validatedLocationName: string, freshUserProfile: EmployeeProfile, currentGpsLocation: {lat: number, lon: number}, distance: number) => {
     if (!db || !settings) throw new Error("بيانات الإعدادات أو قاعدة البيانات غير متاحة.");
      
    const now = new Date();
    const workDayDate = getWorkDayDate(now);
    const workDayString = workDayDate.toISOString().split('T')[0];
    
    if (mode === 'check_in') {
        const openRecord = await findOpenAttendanceRecord();
        if (openRecord) {
             throw new Error("لديك بالفعل سجل حضور مفتوح. يرجى تسجيل الانصراف أولاً.");
        }

        const monthString = format(workDayDate, 'yyyy-MM');
        const monthAttendanceRef = ref(db, `attendance/${monthString}`);
        const attendanceQuery = query(monthAttendanceRef, orderByChild('employeeId_date'), equalTo(`${freshUserProfile.id}_${workDayString}`));
        const snapshot = await get(attendanceQuery);
        
        if (snapshot.exists()) throw new Error("لديك بالفعل سجل حضور لهذا اليوم.");

        const newRecordRef = push(monthAttendanceRef);
        let officialCheckInTime = settings.workStartTime;
        let officialCheckOutTime = settings.workEndTime;

        if (freshUserProfile.shiftConfiguration === 'custom' && freshUserProfile.checkInTime) {
            officialCheckInTime = freshUserProfile.checkInTime;
        }
        if (freshUserProfile.shiftConfiguration === 'custom' && freshUserProfile.checkOutTime) {
            officialCheckOutTime = freshUserProfile.checkOutTime;
        }

        const [hours, minutes] = officialCheckInTime.split(':').map(Number);
        const workStartToday = new Date();
        workStartToday.setHours(hours, minutes, 0, 0);
        
        let delayMinutes = 0;
        if (now.getTime() > workStartToday.getTime()) {
             delayMinutes = Math.floor((now.getTime() - workStartToday.getTime()) / 60000);
        }

        await set(newRecordRef, {
            employeeId: freshUserProfile.id,
            date: workDayString,
            checkIn: now.toISOString(),
            delayMinutes,
            officialCheckInTime,
            officialCheckOutTime,
            deviceId: localStorage.getItem('device_id'),
            locationId: validatedLocationId,
            locationName: validatedLocationName,
            checkInLocation: currentGpsLocation,
            checkInDistance: distance,
            employeeId_date: `${freshUserProfile.id}_${workDayString}`,
            createdAt: dbServerTimestamp()
        });

        toast({
            title: "تم تسجيل الحضور بنجاح",
            description: `وقت الحضور: ${new Date().toLocaleTimeString('ar-EG')} من ${validatedLocationName}`,
            className: "bg-green-100 dark:bg-green-900 border-green-500",
        });

    } else if (mode === 'check_out') {
        const openRecord = await findOpenAttendanceRecord();
        
        if (!openRecord) {
            throw new Error("لا يوجد سجل حضور مفتوح لتسجيل الانصراف له.");
        }

        const recordRef = ref(db, openRecord.path);
        await update(recordRef, { checkOut: new Date().toISOString(), checkOutLocation: currentGpsLocation, checkOutDistance: distance });
        
        toast({
            title: "تم تسجيل الانصراف بنجاح",
            description: `وقت الانصراف: ${new Date().toLocaleTimeString('ar-EG')}`,
            className: "bg-blue-100 dark:bg-blue-900 border-blue-500",
        });
    }
  }, [db, settings, toast, findOpenAttendanceRecord]);

  const handleQrCodeResult = useCallback(async (qrCodeResult: { text: string } | null, mode: 'check_in' | 'check_out') => {
    const qrDataString = qrCodeResult?.text;
    if (isProcessing || !db || !qrDataString || !settings || !location) return;

    setIsProcessing(true);

    try {
        const freshUserProfile = await validateUserAndDevice();
        
        const qrData = JSON.parse(qrDataString);
        const { id, locId, expiry, signature } = qrData;
        
        if (!id || !locId || !expiry || !signature) throw new Error("بيانات رمز QR غير مكتملة.");
        if (Date.now() > expiry) throw new Error("انتهت صلاحية رمز الحضور. حاول مرة أخرى.");
        
        const expectedSignature = md5(`${id}|${expiry}|${locId}|${SERVER_SECRET}`);
        if (signature !== expectedSignature) throw new Error(`توقيع رمز QR غير صالح. الرمز مزور أو قديم.`);

        const targetLocation = allLocations.find(l => l.id === locId);
        if (!targetLocation) {
            throw new Error(`لم يتم العثور على الفرع بالمعرف ${locId} في الإعدادات.`);
        }
        
        const employeeLocationIds = freshUserProfile.locationIds || [];
        if (employeeLocationIds.length > 0 && !employeeLocationIds.includes(locId)) {
            throw new Error(`هذا الرمز خاص بفرع آخر. أنت غير مسجل في فرع "${targetLocation.name}".`);
        }

        const distance = getDistance(location.lat, location.lon, parseFloat(targetLocation.lat), parseFloat(targetLocation.lon));
        const allowedRadius = settings.locationRadius || 100;
        if (distance > allowedRadius) {
            throw new Error(`أنت خارج النطاق الجغرافي المسموح به. المسافة: ${Math.round(distance)} متر.`);
        }
        
        await processAttendance(mode, targetLocation.id, targetLocation.name, freshUserProfile, location, distance);

    } catch (error: any) {
        toast({ variant: "destructive", title: "فشل تسجيل العملية", description: error.message || "حدث خطأ غير متوقع." });
    } finally {
        setTimeout(() => {
            setIsProcessing(false);
            setShowScanner(false);
        }, 3000);
    }
  }, [isProcessing, db, location, settings, toast, validateUserAndDevice, processAttendance, SERVER_SECRET, allLocations]);

  const handleScan = useCallback((data: { text: string } | null) => {
    if (data) {
        const mode = userStatus === 'checked_out' ? 'check_in' : 'check_out';
        handleQrCodeResult(data, mode);
    }
  }, [handleQrCodeResult, userStatus]);

  const handleDirectAttendance = useCallback(async (mode: 'check_in' | 'check_out') => {
    if (isProcessing || !location) return;
    
    setIsProcessing(true);
    
    try {
        const freshUserProfile = await validateUserAndDevice();
        const currentTarget = targetLocationData;
        
        if (!currentTarget || !currentTarget.isInside) {
            throw new Error(`أنت خارج النطاق الجغرافي المسموح به للفرع.`);
        }
        
        const employeeLocationIds = freshUserProfile.locationIds || [];
        if (employeeLocationIds.length > 0 && !employeeLocationIds.includes(currentTarget.id)) {
          throw new Error(`أنت تحاول التسجيل من فرع "${currentTarget.name}" ولكنك غير مسجل فيه.`);
        }
        
        await processAttendance(mode, currentTarget.id, currentTarget.name, freshUserProfile, location, currentTarget.distance);

    } catch (error: any) {
         toast({ variant: "destructive", title: "فشل تسجيل العملية", description: error.message || "حدث خطأ غير متوقع." });
    } finally {
        setTimeout(() => {
            setIsProcessing(false);
        }, 3000);
    }
  }, [isProcessing, validateUserAndDevice, targetLocationData, processAttendance, toast, location]);

  const handleActionButtonClick = () => {
    const mode = userStatus === 'checked_out' ? 'check_in' : 'check_out';

    if (!location) {
        toast({ variant: "destructive", title: "الموقع الجغرافي مطلوب", description: "يجب تفعيل خدمات الموقع للمتابعة." });
        return;
    }
    if (qrCodeRequired) {
        setShowScanner(true);
    } else {
        handleDirectAttendance(mode);
    }
  };

  const locationStatusMessage = () => {
    if (isRequestingLocation) return "جاري محاولة تحديد الموقع...";
    if (isSettingsLoading || !userProfile) return "جاري تحديد الموقع والفرع...";
    if (locationError) return locationError;
    if (!location) return "لم يتم تحديد الموقع بعد.";
    if (!targetLocationData) {
        const isAssigned = userProfile.locationIds && userProfile.locationIds.length > 0;
        return isAssigned ? "لا يوجد أي من فروعك المخصصة قريب منك." : "لم يتم العثور على أي فروع قريبة.";
    }
    
    const branchName = targetLocationData.name;

    if (targetLocationData.isInside) {
      return `أنت في نطاق ${branchName}.`;
    }

    return `أقرب فرع (${branchName}): ${Math.round(targetLocationData.distance)} متر.`;
  };

  const openGoogleMapsDirections = () => {
    if (!location || !targetLocationData) return;
    const { lat, lon } = location;
    const { lat: destLat, lon: destLon } = targetLocationData;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lon}&destination=${destLat},${destLon}&travelmode=walking`;
    window.open(url, '_blank');
  };

  const { officialCheckInTime, officialCheckOutTime } = useMemo(() => {
    if (!userProfile || !settings) {
      return { officialCheckInTime: '--:--', officialCheckOutTime: '--:--' };
    }

    const isCustom = userProfile.shiftConfiguration === 'custom';
    const officialCheckIn = (isCustom && userProfile.checkInTime) ? userProfile.checkInTime : settings.workStartTime;
    const officialCheckOut = (isCustom && userProfile.checkOutTime) ? userProfile.checkOutTime : settings.workEndTime;

    return { officialCheckInTime: officialCheckIn, officialCheckOutTime: officialCheckOut };
  }, [userProfile, settings]);

  const renderContent = () => {
    if (!userProfile || isSettingsLoading || userStatus === 'loading') {
      return (
        <div className="text-center text-muted-foreground p-8">
            <Loader2 className="h-8 w-8 mx-auto animate-spin mb-4"/>
            <p>جاري تحميل البيانات وتحديد الحالة...</p>
        </div>
      );
    }

    if (isProcessing) {
        return (
            <div className="flex flex-col items-center justify-center text-foreground space-y-4 p-8">
                <CheckCircle className="w-16 h-16 text-green-500 animate-pulse" />
                <p className="text-lg font-bold">تم، جاري المعالجة...</p>
            </div>
        );
    }
    
    if (showScanner) {
      return (
        <div className="space-y-4">
          <CameraScanner onScan={handleScan} onError={(err) => toast({ variant: 'destructive', title: 'خطأ في الكاميرا', description: err?.message })} />
          <p className="text-center text-muted-foreground">وجه الكاميرا نحو رمز QR Code</p>
          <Button variant="outline" className="w-full" onClick={() => setShowScanner(false)}>إلغاء</Button>
        </div>
      );
    }

    const isWithinRange = targetLocationData?.isInside ?? false;
    const isButtonDisabled = isProcessing || isRequestingLocation || !location || !isWithinRange;
    const buttonText = userStatus === 'checked_in' ? 'تسجيل انصراف' : 'تسجيل حضور';
    const ButtonIcon = userStatus === 'checked_in' ? LogOut : LogIn;
    const buttonVariant = userStatus === 'checked_in' ? 'destructive' : 'default';

    return (
      <div className="space-y-4">
        <div className={`text-center text-sm p-2 rounded-md bg-muted border ${isWithinRange ? 'text-green-600 border-green-200' : 'text-orange-600 font-bold border-orange-500/50'}`}>
            {locationStatusMessage()}
        </div>
        
        {locationError && (
            <Button variant="secondary" size="sm" className="w-full" onClick={requestLocation} disabled={isRequestingLocation}>
                <RefreshCw className="ml-2 h-4 w-4" />
                إعادة طلب صلاحية الموقع
            </Button>
        )}

        {targetLocationData && !targetLocationData.isInside && (
            <Button variant="secondary" size="sm" className="w-full" onClick={openGoogleMapsDirections}>
                <Navigation className="ml-2 h-4 w-4" />
                افتح خرائط جوجل للتوجيه
            </Button>
        )}
        
        <Button size="lg" variant={buttonVariant} className="w-full h-20 text-2xl" onClick={handleActionButtonClick} disabled={isButtonDisabled}>
           <ButtonIcon className="ml-4 h-8 w-8"/>
           {buttonText}
        </Button>

         {isButtonDisabled && location && !isWithinRange && (
          <p className="text-center text-destructive text-sm font-semibold">
            أنت خارج النطاق الجغرافي. لا يمكنك التسجيل.
          </p>
        )}
      </div>
    );
  };

  const renderStatusCard = () => {
    return (
        <div className="space-y-2">
            <div className='flex items-center gap-2 text-muted-foreground'>
                <Clock className="h-4 w-4" />
                <h3 className="text-sm font-medium">حالتك الحالية</h3>
            </div>
            {userStatus === 'loading' ? (
                <Skeleton className="h-10 w-full" />
            ) : userStatus === 'error' ? (
                <p className="text-destructive text-sm">خطأ في تحميل الحالة.</p>
            ) : (
                <div className="flex justify-between items-center text-center p-2 bg-muted rounded-md text-sm">
                     <div>
                        <p className="text-muted-foreground">الحالة</p>
                        <p className="font-bold text-base">{userStatus === 'checked_in' ? 'داخل العمل' : 'خارج العمل'}</p>
                    </div>
                     {lastAction && (
                        <div>
                            <p className="text-muted-foreground">آخر {lastAction.type === 'check_in' ? 'حضور' : 'انصراف'}</p>
                            <p className="font-bold text-sm" dir="ltr">{new Date(lastAction.time).toLocaleString('ar-EG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                     )}
                </div>
            )}
        </div>
    );
  };

  const renderOfficialTimes = () => {
    return (
      <div className="space-y-2">
            <div className='flex items-center gap-2 text-muted-foreground'>
                <CalendarIcon className="h-4 w-4" />
                <h3 className="text-sm font-medium">مواعيد دوامك الرسمية</h3>
            </div>
          {isSettingsLoading || !userProfile ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <div className="flex justify-around text-center p-2 bg-muted rounded-md">
              <div>
                <p className="text-muted-foreground text-sm">الحضور</p>
                <p className="font-bold text-lg">{officialCheckInTime}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">الانصراف</p>
                <p className="font-bold text-lg">{officialCheckOutTime}</p>
              </div>
            </div>
          )}
        </div>
    );
  };
  
    const renderLocationInfo = () => {
    return (
      <div className="space-y-2">
         <div className='flex items-center gap-2 text-muted-foreground'>
            <MapPin className="h-4 w-4" />
            <h3 className="text-sm font-medium">معلومات الموقع</h3>
        </div>
           {isRequestingLocation || isSettingsLoading ? (
            <Skeleton className="h-12 w-full" />
           ) : (
            <div className="p-2 bg-muted rounded-md text-sm space-y-1">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">أقرب فرع:</span>
                    <span className="font-bold">{targetLocationData?.name || 'غير محدد'}</span>
                </div>
                 <div className="flex justify-between">
                    <span className="text-muted-foreground">المسافة:</span>
                    <span className="font-mono">{targetLocationData ? `${Math.round(targetLocationData.distance)} متر` : '-'}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">الحالة:</span>
                    <span className={`font-bold ${targetLocationData?.isInside ? 'text-green-600' : 'text-orange-600'}`}>{targetLocationData?.isInside ? 'داخل النطاق' : 'خارج النطاق'}</span>
                </div>
                 <div className="flex justify-between">
                    <span className="text-muted-foreground">إحداثياتك:</span>
                    <span className="font-mono text-xs">{location ? `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}` : '-'}</span>
                </div>
            </div>
           )}
        </div>
    );
  };


  return (
    <div className="flex justify-center items-start pt-4">
      <Card className="w-full max-w-xs shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-headline">تسجيل الدخول</CardTitle>
          <CardDescription>
            {currentDate}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            {renderContent()}
            <Separator className="my-4"/>
            {renderStatusCard()}
            <Separator className="my-4"/>
            {renderOfficialTimes()}
             <Separator className="my-4"/>
            {renderLocationInfo()}
        </CardContent>
      </Card>
    </div>
  );
}
