
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Briefcase, Calendar, Clock, UserCheck, UserX } from 'lucide-react';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref } from 'firebase/database';
import { format, getDaysInYear, differenceInDays, startOfYear, endOfYear } from 'date-fns';

interface UserProfile {
  id: string;
  employeeName: string;
}

interface AttendanceRecord {
  employeeId: string;
  checkIn: string;
  checkOut?: string;
  delayMinutes?: number;
  date: string;
}

interface EmployeeRequest {
  requestType: "leave_full_day" | "leave_half_day" | "mission";
  status: "pending" | "approved" | "rejected";
  startDate: string;
  endDate: string;
}

export default function HomePage() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [dateState, setDateState] = useState<Date | null>(null);
  const [isClient, setIsClient] = useState(false);
  
  const db = useDb();
  
  // --- Data Fetching ---
  const currentMonthStr = useMemo(() => format(new Date(), 'yyyy-MM'), []);
  
  const attendanceRef = useMemoFirebase(() => 
    (db && userProfile?.id) ? ref(db, `attendance/${currentMonthStr}`) : null, 
  [db, userProfile, currentMonthStr]);
  const [monthlyAttendance, isAttendanceLoading] = useDbData<Record<string, AttendanceRecord>>(attendanceRef);

  const requestsRef = useMemoFirebase(() => 
    (db && userProfile?.id) ? ref(db, `employee_requests/${userProfile.id}`) : null,
  [db, userProfile]);
  const [allRequests, isRequestsLoading] = useDbData<Record<string, EmployeeRequest>>(requestsRef);
  
  const isLoading = isAttendanceLoading || isRequestsLoading;
  
  // --- Effects ---
  useEffect(() => {
    setIsClient(true);
    const storedProfile = localStorage.getItem('userProfile');
    if (storedProfile) {
      setUserProfile(JSON.parse(storedProfile));
    }
    setDateState(new Date());
    const timer = setInterval(() => setDateState(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  
  // --- Memoized Calculations ---

  const userAttendance = useMemo(() => {
    if (!monthlyAttendance || !userProfile) return [];
    return Object.values(monthlyAttendance).filter(rec => rec.employeeId === userProfile.id);
  }, [monthlyAttendance, userProfile]);
  
  const attendanceStatus = useMemo(() => {
    if (userAttendance.length === 0) return { status: 'خارج العمل', time: null };
    
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayRecord = userAttendance.find(rec => rec.date === todayStr);

    if (!todayRecord) {
         const lastRecord = userAttendance.sort((a,b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime())[0];
         if(lastRecord && lastRecord.checkOut) {
             return { status: 'خارج العمل', time: `آخر انصراف: ${new Date(lastRecord.checkOut).toLocaleTimeString('ar-EG')}` };
         } else if (lastRecord) {
             return { status: 'داخل العمل', time: `مسجل حضور منذ: ${new Date(lastRecord.checkIn).toLocaleTimeString('ar-EG')}` };
         }
         return { status: 'خارج العمل', time: null };
    }

    if (todayRecord.checkOut) {
      return { status: 'خارج العمل', time: `تم الانصراف: ${new Date(todayRecord.checkOut).toLocaleTimeString('ar-EG')}` };
    }
    if (todayRecord.checkIn) {
      return { status: 'داخل العمل', time: `تم الحضور: ${new Date(todayRecord.checkIn).toLocaleTimeString('ar-EG')}` };
    }
    return { status: 'خارج العمل', time: null };
  }, [userAttendance]);
  
  const totalDelayMinutes = useMemo(() => {
    return userAttendance.reduce((total, record) => total + (record.delayMinutes || 0), 0);
  }, [userAttendance]);
  
  const pendingRequestsCount = useMemo(() => {
    if (!allRequests) return 0;
    return Object.values(allRequests).filter(req => req.status === 'pending').length;
  }, [allRequests]);
  
  const remainingLeaveDays = useMemo(() => {
    const totalLeaveBalance = 21; // Assume a standard balance
    if (!allRequests) return totalLeaveBalance;

    const currentYear = new Date().getFullYear();
    
    let daysTaken = 0;
    Object.values(allRequests).forEach(req => {
        if (req.status === 'approved' && req.requestType.startsWith('leave')) {
            const startDate = new Date(req.startDate);
            if (startDate.getFullYear() === currentYear) {
                if(req.requestType === 'leave_half_day'){
                    daysTaken += 0.5;
                } else {
                    const endDate = new Date(req.endDate);
                    daysTaken += differenceInDays(endDate, startDate) + 1;
                }
            }
        }
    });

    return totalLeaveBalance - daysTaken;
  }, [allRequests]);

  const welcomeMessage = () => {
      const hour = new Date().getHours();
      if (hour < 12) return 'صباح الخير';
      if (hour < 18) return 'يوم سعيد';
      return 'مساء الخير';
  }

  return (
    <div className="space-y-8">
       <div className="flex items-center justify-between space-y-2">
           <div>
                {userProfile ? (
                    <h2 className="text-3xl font-bold tracking-tight font-headline">
                        {welcomeMessage()}, {userProfile.employeeName}!
                    </h2>
                ) : (
                    <Skeleton className="h-10 w-64" />
                )}
                 <p className="text-muted-foreground">
                    نظرة عامة على يومك والمهام الحالية
                </p>
           </div>
            <div className="flex items-center space-x-2 space-x-reverse text-right">
                {isClient && dateState ? (
                    <>
                        <div className="p-2 bg-muted rounded-md">
                            <p className="text-lg font-semibold">{dateState.toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long' })}</p>
                            <p className="text-xs text-muted-foreground">{dateState.toLocaleDateString('ar-EG-u-nu-latn', { weekday: 'long' })}</p>
                        </div>
                        <div className="p-2 bg-muted rounded-md">
                            <p className="text-lg font-semibold">{dateState.toLocaleString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                            <p className="text-xs text-muted-foreground">التوقيت المحلي</p>
                        </div>
                    </>
                ) : (
                    <>
                        <Skeleton className="h-16 w-24" />
                        <Skeleton className="h-16 w-24" />
                    </>
                )}
            </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              حالة الحضور
            </CardTitle>
            {attendanceStatus.status === 'داخل العمل' ? <UserCheck className="h-4 w-4 text-green-500" /> : <UserX className="h-4 w-4 text-muted-foreground" />}
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-3/4"/> : <div className="text-2xl font-bold">{attendanceStatus.status}</div> }
            {isLoading ? <Skeleton className="h-4 w-1/2 mt-1"/> : <p className="text-xs text-muted-foreground">{attendanceStatus.time || 'لم تسجل حضورك لهذا اليوم بعد'}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              مجموع التأخيرات
            </CardTitle>
             <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-1/2"/> : <div className="text-2xl font-bold">{totalDelayMinutes} دقيقة</div> }
            <p className="text-xs text-muted-foreground">
              هذا الشهر
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">طلبات معلقة</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-1/4"/> : <div className="text-2xl font-bold">{pendingRequestsCount}</div>}
            <p className="text-xs text-muted-foreground">
              لديك {pendingRequestsCount} طلب إجازة أو مأمورية قيد المراجعة
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">أيام الإجازة المتبقية</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-1/4"/> : <div className="text-2xl font-bold">{remainingLeaveDays}</div> }
            <p className="text-xs text-muted-foreground">
              من رصيد الإجازات السنوي (تقديري)
            </p>
          </CardContent>
        </Card>
      </div>

       <Card>
            <CardHeader>
                <CardTitle>الإعلانات والمهام</CardTitle>
                 <CardDescription>آخر التحديثات والملاحظات من الإدارة</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">لا توجد إعلانات جديدة في الوقت الحالي.</p>
            </CardContent>
        </Card>

    </div>
  );
}
