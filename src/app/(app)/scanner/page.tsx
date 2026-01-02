
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, update, get, serverTimestamp as dbServerTimestamp, query, orderByChild, equalTo, limitToLast } from 'firebase/database';
import { md5 } from 'js-md5';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Camera, CameraOff, CheckCircle, XCircle } from 'lucide-react';

// Assuming useQrCodeManager provides this secret. In a real app, this must be kept secure.
import { SERVER_SECRET } from '@/hooks/use-qr-code-manager'; 

let QrScanner: any = null;
if (typeof window !== 'undefined') {
  QrScanner = require('react-qr-scanner');
}

interface UserProfile {
  id: string;
  employeeName: string;
  deviceId: string;
}

interface QrCodePayload {
    id: string;
    locId: string;
    expiry: number;
    signature: string;
    location: {
        latitude: number;
        longitude: number;
    };
}

interface Settings {
    locationRadius?: number;
    employeeAlert?: string;
}

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
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


export default function ScannerPage() {
    const { toast } = useToast();
    const db = useDb();

    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [scanResult, setScanResult] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
    const [hasCameraPermission, setHasCameraPermission] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
    const [settingsData, isSettingsLoading] = useDbData<Settings>(settingsRef);


    useEffect(() => {
        const profile = localStorage.getItem('userProfile');
        if (profile) {
            setUserProfile(JSON.parse(profile));
        }
    }, []);

    const getCameraPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        setHasCameraPermission(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
        setStatus({ type: 'error', message: 'يرجى تفعيل صلاحية الكاميرا لاستخدام الماسح الضوئي.' });
      }
    };
    
    useEffect(() => {
      getCameraPermission();
    }, []);

    const resetStatus = () => {
        setTimeout(() => {
            setStatus(null);
            setScanResult(null); // Allow for a new scan
        }, 5000);
    };

    const handleScan = async (data: { text: string } | null) => {
        if (data && !isLoading && !scanResult) {
            setIsLoading(true);
            setScanResult(data.text);
            await processAttendance(data.text);
            setIsLoading(false);
            resetStatus();
        }
    };

    const processAttendance = async (qrData: string) => {
        if (!db || !userProfile) {
             setStatus({ type: 'error', message: 'خطأ: لم يتم العثور على بيانات المستخدم أو خدمة قاعدة البيانات.' });
             return;
        }

        let payload: QrCodePayload;
        try {
            payload = JSON.parse(qrData);
        } catch (e) {
            setStatus({ type: 'error', message: 'رمز QR غير صالح أو تالف.' });
            return;
        }
        
        // --- 1. Payload Validation ---
        if (!payload.id || !payload.locId || !payload.expiry || !payload.signature) {
             setStatus({ type: 'error', message: 'رمز QR غير مكتمل. الرجاء المحاولة مرة أخرى.' });
             return;
        }
        
        // --- 2. Expiry Check ---
        if (Date.now() > payload.expiry) {
            setStatus({ type: 'error', message: 'انتهت صلاحية رمز QR. يرجى إعادة المحاولة برمز جديد.' });
            return;
        }
        
        // --- 3. Signature Verification ---
        const expectedSignature = md5(`${payload.id}|${payload.expiry}|${payload.locId}|${SERVER_SECRET}`);
        if (payload.signature !== expectedSignature) {
            setStatus({ type: 'error', message: 'توقيع رمز QR غير صحيح. لا تحاول العبث بالنظام.' });
            return;
        }

        // --- 4. Location Check ---
        let userLocation: {lat: number, lon: number} | null = null;
        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
            });
            userLocation = { lat: position.coords.latitude, lon: position.coords.longitude };
        } catch (error) {
             setStatus({ type: 'error', message: 'لا يمكن تحديد موقعك. يرجى تفعيل صلاحية الموقع والمحاولة مرة أخرى.' });
             return;
        }
        
        const distance = getDistance(userLocation.lat, userLocation.lon, payload.location.latitude, payload.location.longitude);
        const allowedRadius = settingsData?.locationRadius || 100; // Default 100 meters
        
        if (distance > allowedRadius) {
             setStatus({ type: 'error', message: `أنت خارج النطاق المسموح به (${Math.round(distance)} متر). يجب أن تكون ضمن نطاق ${allowedRadius} متر من موقع الفرع.` });
             return;
        }
        
        // --- 5. Device ID Check ---
        const localDeviceId = localStorage.getItem('device_id');
        if(userProfile.deviceId !== localDeviceId) {
             setStatus({ type: 'error', message: 'هذا الجهاز غير مسجل لحسابك. لا يمكن تسجيل الحضور.' });
             return;
        }
        
        // --- 6. Record Attendance ---
        try {
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
            const monthStr = today.toISOString().substring(0, 7); // YYYY-MM
            const attendanceId = `${userProfile.id}_${dateStr}`;
            
            const attendanceRef = ref(db, `attendance/${monthStr}/${attendanceId}`);
            const snapshot = await get(attendanceRef);

            let recordUpdate: any = {};
            let message = '';
            
            if (snapshot.exists()) { // Existing record for today -> Check-Out
                const existingRecord = snapshot.val();
                if (existingRecord.checkOutTime) {
                     setStatus({ type: 'error', message: 'لقد قمت بتسجيل الحضور والانصراف لهذا اليوم بالفعل.' });
                     return;
                }
                recordUpdate = {
                    checkOutTime: new Date().toISOString(),
                    checkOutLocation: userLocation,
                    checkOutDistance: Math.round(distance),
                };
                message = `تم تسجيل انصرافك بنجاح، ${userProfile.employeeName}.`;
            } else { // No record for today -> Check-In
                 recordUpdate = {
                    employeeId: userProfile.id,
                    employeeName: userProfile.employeeName,
                    date: dateStr,
                    checkInTime: new Date().toISOString(),
                    status: 'present',
                    deviceId: userProfile.deviceId,
                    locationId: payload.locId,
                    checkInLocation: userLocation,
                    checkInDistance: Math.round(distance),
                    employeeId_date: `${userProfile.id}_${dateStr}`
                 };
                message = `تم تسجيل حضورك بنجاح، ${userProfile.employeeName}.`;
            }

            await update(ref(db, `attendance/${monthStr}/${attendanceId}`), recordUpdate);

            setStatus({ type: 'success', message });

        } catch (error: any) {
            console.error("Firebase update failed:", error);
            setStatus({ type: 'error', message: error.message || 'فشل تسجيل العملية في قاعدة البيانات.' });
        }
    };

    const handleError = (err: any) => {
        console.error(err);
        if(!status) { // Don't override an existing status
           setStatus({ type: 'error', message: 'حدث خطأ أثناء مسح الرمز. حاول مرة أخرى.' });
           resetStatus();
        }
    };
    
    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-headline font-bold tracking-tight">
                تسجيل الحضور والانصراف
            </h2>
            
            {settingsData?.employeeAlert && (
                 <Alert variant="default" className="bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/50 dark:border-blue-700 dark:text-blue-300">
                    <AlertTitle>تنبيه من الإدارة</AlertTitle>
                    <AlertDescription>{settingsData.employeeAlert}</AlertDescription>
                </Alert>
            )}
            
            <Card className="overflow-hidden">
                <div className="relative w-full aspect-square max-w-md mx-auto bg-gray-900" style={{'--scanner-height': '100%'} as React.CSSProperties}>
                    {QrScanner && hasCameraPermission && (
                        <>
                            <QrScanner
                                onScan={handleScan}
                                onError={handleError}
                                constraints={{
                                    audio: false,
                                    video: { facingMode: "environment" }
                                }}
                                style={{ width: '100%', height: '100%' }}
                            />
                            {/* Scanner overlay */}
                            <div className="absolute inset-0 pointer-events-none">
                                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4">
                                    <div className="absolute -top-1 -left-1 w-10 h-10 border-t-4 border-l-4 border-primary rounded-tl-lg"></div>
                                    <div className="absolute -top-1 -right-1 w-10 h-10 border-t-4 border-r-4 border-primary rounded-tr-lg"></div>
                                    <div className="absolute -bottom-1 -left-1 w-10 h-10 border-b-4 border-l-4 border-primary rounded-bl-lg"></div>
                                    <div className="absolute -bottom-1 -right-1 w-10 h-10 border-b-4 border-r-4 border-primary rounded-br-lg"></div>
                                    
                                    {/* Laser line */}
                                    {!isLoading && !status && <div className="absolute top-0 left-0 right-0 h-1 bg-red-500 rounded-full shadow-[0_0_10px_2px_rgba(239,68,68,0.8)] animate-scan"></div>}
                                 </div>
                            </div>
                        </>
                    )}
                    
                    {!hasCameraPermission && (
                         <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/50 p-4">
                            <CameraOff className="w-16 h-16 mb-4"/>
                            <h3 className="text-lg font-semibold">الكاميرا غير متاحة</h3>
                            <p className="text-center text-sm">الرجاء السماح بالوصول إلى الكاميرا لتسجيل الحضور.</p>
                             <Button onClick={getCameraPermission} className="mt-4">إعادة طلب الصلاحية</Button>
                         </div>
                    )}

                    {isLoading && (
                         <div className="absolute inset-0 flex items-center justify-center text-white bg-black/70">
                            <Loader2 className="w-12 h-12 animate-spin"/>
                         </div>
                    )}
                    
                    {status && (
                        <div className={`absolute inset-0 flex flex-col items-center justify-center text-white p-4 text-center ${status.type === 'success' ? 'bg-green-600/90' : 'bg-red-600/90'}`}>
                           {status.type === 'success' ? <CheckCircle className="w-20 h-20 mb-4"/> : <XCircle className="w-20 h-20 mb-4"/>}
                            <p className="font-bold text-lg">{status.message}</p>
                         </div>
                    )}
                </div>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>تعليمات</CardTitle>
                </CardHeader>
                <CardContent>
                     <ul className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                        <li>تأكد من أنك متصل بالإنترنت.</li>
                        <li>قم بتوجيه الكاميرا إلى رمز الاستجابة السريعة (QR Code) المعروض.</li>
                        <li>انتظر حتى يتم مسح الرمز تلقائياً.</li>
                        <li>ستظهر رسالة تؤكد نجاح عملية الحضور أو الانصراف.</li>
                        <li>تأكد من أنك ضمن النطاق الجغرافي المسموح به للفرع.</li>
                    </ul>
                </CardContent>
            </Card>

        </div>
    );
}

