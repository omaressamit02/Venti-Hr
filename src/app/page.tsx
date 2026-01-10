
'use client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ref, update, push, set } from 'firebase/database';
import { navItems } from '@/lib/nav-items';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Navigation, CheckCircle } from 'lucide-react';


interface Employee {
  id: string;
  employeeName: string;
  employeeCode: string;
  password?: string;
  permissions: string[];
  userStatus: 'Active' | 'Inactive' | 'Pending' | 'Archived';
  deviceId?: string;
  locationLoginRequired?: boolean;
  allowLoginFromAnyDevice?: boolean;
  locationIds?: string[];
}

interface Settings {
    companyName?: string;
    locations?: SystemLocation[];
    locationRadius?: number;
}

interface SystemLocation {
  id: string;
  name: string;
  lat: string;
  lon: string;
}

interface UserLocation {
  lat: number;
  lon: number;
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


// Function to generate a simple UUID
const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const db = useDb();

  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLocationLoading, setIsLocationLoading] = useState(true);

  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isDbLoading] = useDbData<Record<string, Employee>>(employeesRef);

  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<Settings>(settingsRef);
  
  useEffect(() => {
    if (!isSettingsLoading && settings?.companyName) {
        document.title = settings.companyName;
    }
  }, [isSettingsLoading, settings]);
  
  const requestLocation = useCallback(() => {
    setIsLocationLoading(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
        setIsLocationLoading(false);
      },
      () => {
        setLocationError("لا يمكن تسجيل الدخول بدون صلاحية الموقع. الرجاء تفعيلها.");
        setIsLocationLoading(false);
      }
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);
  
  const logLoginAttempt = (data: {
    employeeId?: string,
    employeeName?: string,
    employeeCode: string,
    status: 'success' | 'failure',
    failureReason?: string,
  }) => {
    if (!db) return;
    const logRef = push(ref(db, 'login_logs'));
    set(logRef, {
      ...data,
      timestamp: new Date().toISOString(),
      location: userLocation,
      deviceId: localStorage.getItem('device_id') || 'Not Found',
      userAgent: navigator.userAgent,
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userLocation) {
        toast({
            variant: 'destructive',
            title: 'الموقع مطلوب',
            description: 'يجب السماح بالوصول إلى الموقع لتسجيل الدخول.',
        });
        return;
    }
    
    setIsLoading(true);

    try {
      // Superuser check
      if (employeeCode === 'admin' && password === '203040') {
        const superuserProfile = {
          id: 'superuser',
          employeeName: 'Super Admin',
          employeeCode: 'admin',
          permissions: navItems.map(item => item.href), // All permissions
        };
        localStorage.setItem('userProfile', JSON.stringify(superuserProfile));
        toast({
          title: 'أهلاً بك أيها المدير الخارق',
          description: 'تم تسجيل الدخول بصلاحيات كاملة.',
        });
        
        logLoginAttempt({ employeeCode, status: 'success', employeeName: 'Super Admin' });
        router.push('/home');
        setIsLoading(false);
        return;
      }

      if (isDbLoading || !employeesData) {
          toast({ title: 'جاري تحميل بيانات الموظفين...', description: 'الرجاء الانتظار لحظات.' });
          setIsLoading(false);
          return;
      }
      
      const foundEntry = Object.entries(employeesData).find(
        ([, emp]) => emp.employeeCode === employeeCode
      );

      if (foundEntry) {
        const [id, foundEmployee] = foundEntry;
        
        if (foundEmployee.userStatus === 'Inactive' || foundEmployee.userStatus === 'Archived') {
            logLoginAttempt({ employeeId: id, employeeName: foundEmployee.employeeName, employeeCode, status: 'failure', failureReason: 'Inactive account' });
            throw new Error('هذا الحساب غير نشط. يرجى مراجعة الإدارة.');
        }

        // Location Login Check - Stricter Logic
        if(foundEmployee.locationLoginRequired) {
            const employeeLocationIds = foundEmployee.locationIds || [];
            const rawLocations = settings?.locations ? (Array.isArray(settings.locations) ? settings.locations : Object.values(settings.locations)) : [];
            const allSystemLocations: SystemLocation[] = rawLocations.filter((loc: any): loc is SystemLocation => !!(loc && typeof loc === 'object' && 'id' in loc));

            // Employee must be assigned to at least one location if this setting is on
            if (employeeLocationIds.length === 0) {
                 logLoginAttempt({ employeeId: id, employeeName: foundEmployee.employeeName, employeeCode, status: 'failure', failureReason: 'No assigned locations for forced login' });
                 throw new Error('حسابك مفعل عليه الدخول من الفرع فقط، ولكن لم يتم تحديد أي فرع لك. يرجى مراجعة الإدارة.');
            }

            const relevantLocations = allSystemLocations.filter(loc => employeeLocationIds.includes(loc.id));
            
            if (relevantLocations.length === 0) {
                 logLoginAttempt({ employeeId: id, employeeName: foundEmployee.employeeName, employeeCode, status: 'failure', failureReason: 'Assigned location not found in system' });
                 throw new Error('لم يتم العثور على الفروع المخصصة لك في إعدادات النظام. يرجى مراجعة الإدارة.');
            }

            const allowedRadius = settings?.locationRadius || 100;
            const isWithinAnyLocation = relevantLocations.some(loc => {
                if (!loc.lat || !loc.lon) return false;
                const distance = getDistance(userLocation.lat, userLocation.lon, parseFloat(loc.lat), parseFloat(loc.lon));
                return distance <= allowedRadius;
            });

            if (!isWithinAnyLocation) {
                 logLoginAttempt({ employeeId: id, employeeName: foundEmployee.employeeName, employeeCode, status: 'failure', failureReason: 'Outside allowed location' });
                 throw new Error('أنت خارج النطاق الجغرافي المسموح به لتسجيل الدخول.');
            }
        }


        if (foundEmployee.password === password) {
            let employeeToLogin = { ...foundEmployee, id };

            // --- Device ID Logic ---
            if (!foundEmployee.allowLoginFromAnyDevice) {
                let localDeviceId = localStorage.getItem('device_id');
                
                if (!foundEmployee.deviceId && db) { // First login ever for this user
                    if (!localDeviceId) {
                        localDeviceId = generateUUID();
                        localStorage.setItem('device_id', localDeviceId);
                    }
                    await update(ref(db, `employees/${id}`), { deviceId: localDeviceId });
                    employeeToLogin.deviceId = localDeviceId; // Update local object
                    toast({
                        title: 'تم تسجيل هذا الجهاز',
                        description: 'تم ربط هذا الجهاز بحسابك بنجاح.',
                    });
                } else if (foundEmployee.deviceId) { // Device is already registered
                     if (!localDeviceId) { // Trying to log in from a new browser/incognito
                        logLoginAttempt({ employeeId: id, employeeName: foundEmployee.employeeName, employeeCode, status: 'failure', failureReason: 'Device mismatch (no local ID)' });
                        throw new Error('لا يمكنك تسجيل الدخول من هذا الجهاز. يرجى استخدام جهازك المسجل.');
                    }
                    if (foundEmployee.deviceId !== localDeviceId) {
                        logLoginAttempt({ employeeId: id, employeeName: foundEmployee.employeeName, employeeCode, status: 'failure', failureReason: 'Device ID mismatch' });
                        throw new Error('لا يمكنك تسجيل الدخول من هذا الجهاز. يرجى استخدام جهازك المسجل أو الطلب من المدير إعادة تعيينه.');
                    }
                }
            }
            // --- End of Device ID Logic ---


            // Special handling for 'Pending' users
            if (foundEmployee.userStatus === 'Pending' && db) {
                await update(ref(db, `employees/${id}`), { userStatus: 'Active' });
                employeeToLogin.userStatus = 'Active'; // Update local object
                toast({
                    title: 'تم تفعيل حسابك بنجاح',
                    description: 'يمكنك الآن استخدام النظام بشكل كامل.',
                });
                logLoginAttempt({ employeeId: id, employeeName: foundEmployee.employeeName, employeeCode, status: 'success' });
            } else {
                logLoginAttempt({ employeeId: id, employeeName: foundEmployee.employeeName, employeeCode, status: 'success' });
            }


            localStorage.setItem('userProfile', JSON.stringify(employeeToLogin));
            
            toast({
                title: 'تم تسجيل الدخول بنجاح',
                description: `أهلاً بك، ${employeeToLogin.employeeName}`,
            });
            router.push('/home');

        } else {
            logLoginAttempt({ employeeId: id, employeeName: foundEmployee.employeeName, employeeCode, status: 'failure', failureReason: 'Wrong password' });
            throw new Error('كلمة المرور غير صحيحة.');
        }
      } else {
        logLoginAttempt({ employeeCode, status: 'failure', failureReason: 'Employee code not found' });
        toast({
            variant: 'destructive',
            title: 'فشل تسجيل الدخول',
            description: 'كود الموظف غير موجود.',
        });
      }

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'فشل تسجيل الدخول',
        description: error.message || 'حدث خطأ غير متوقع.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-sm mx-auto shadow-2xl bg-card">
        <CardHeader className="text-center space-y-2">
          {isSettingsLoading ? <Skeleton className="h-10 w-48 mx-auto" /> : (
            <CardTitle className="text-4xl font-headline text-primary">
              {settings?.companyName || 'حضورى'}
            </CardTitle>
          )}
          <CardDescription>نظام إدارة الحضور والانصراف</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="employee-code">كود الموظف</Label>
              <Input
                id="employee-code"
                type="text"
                placeholder="أدخل كود الموظف"
                required
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                placeholder="أدخل كلمة المرور"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
              />
            </div>
             <div className="pt-2">
                {isLocationLoading ? (
                    <Alert variant="default" className="text-center">
                        <Loader2 className="h-4 w-4 animate-spin"/>
                        <AlertDescription>
                            جاري تحديد موقعك...
                        </AlertDescription>
                    </Alert>
                ) : locationError ? (
                     <Alert variant="destructive">
                        <AlertDescription className="text-center">
                            {locationError}
                        </AlertDescription>
                         <Button type="button" variant="link" className="w-full h-auto p-1 mt-2 text-destructive-foreground" onClick={requestLocation}>
                            إعادة طلب صلاحية الموقع
                        </Button>
                    </Alert>
                ) : (
                     <div className="flex justify-center items-center gap-2 text-sm text-blue-600">
                        <CheckCircle className="h-4 w-4" />
                        <span>تم تحديد الموقع بنجاح</span>
                    </div>
                )}
            </div>
            <Button type="submit" className="w-full" disabled={isLoading || isDbLoading || isSettingsLoading || isLocationLoading || !!locationError}>
              {isLoading ? 'جاري التحقق...' : 'تسجيل الدخول'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center justify-center text-sm gap-4 pt-6">
            <Link href="/register" className="text-primary hover:underline">
                إنشاء حساب موظف جديد
            </Link>
            <div className="text-xs text-muted-foreground text-center">
                للدعم و الأستفسار
                <br />
                م/ أحمد متولى
                <br />
                م / عمر عصام
            </div>
        </CardFooter>
      </Card>
    </main>
  );
}
