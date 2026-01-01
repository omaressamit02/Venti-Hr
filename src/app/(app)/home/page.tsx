
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, query, orderByChild, equalTo, type Query, limitToLast } from 'firebase/database';
import { useMemo, useState, useEffect } from 'react';
import { Clock, CalendarDays, Hourglass } from 'lucide-react';
import { format } from 'date-fns';


interface AttendanceRecord {
  id: string;
  date: string;
  checkIn: string;
  checkOut?: string;
  delayMinutes?: number;
}

interface UserProfile {
  id: string;
  employeeName: string;
}

export default function HomePage() {
  const db = useDb();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const storedProfile = localStorage.getItem('userProfile');
    if (storedProfile) {
      setUserProfile(JSON.parse(storedProfile));
    }
  }, []);

  const currentMonth = format(new Date(), 'yyyy-MM');

  const attendanceQuery: Query | null = useMemoFirebase(() => {
    if (!db || !userProfile?.id) return null;
    // This query is still not ideal as it fetches all records for a user.
    // A better structure would be /attendance/{userId}/{month}/{day}
    // But for now, we'll work with this and filter client-side.
    // A small optimization could be to query by month if the data was structured like /attendance/{month}
    return query(
      ref(db, `attendance/${currentMonth}`),
      orderByChild('employeeId'),
      equalTo(userProfile.id)
    );
  }, [db, userProfile, currentMonth]);

  const [attendanceData, isLoading] = useDbData<Record<string, Omit<AttendanceRecord, 'id'>>>(attendanceQuery);

  const monthlyStats = useMemo(() => {
    if (!attendanceData) return { totalDays: 0, totalDelay: 0, avgCheckIn: '--:--' };
    
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const recordsThisMonth = Object.values(attendanceData).filter(rec => new Date(rec.date) >= monthStart);

    const totalDays = recordsThisMonth.length;
    const totalDelay = recordsThisMonth.reduce((acc, curr) => acc + (curr.delayMinutes || 0), 0);
    
    const totalCheckInMinutes = recordsThisMonth.reduce((acc, curr) => {
        const time = new Date(curr.checkIn);
        return acc + (time.getHours() * 60 + time.getMinutes());
    }, 0);
    
    const avgCheckInMinutes = totalDays > 0 ? totalCheckInMinutes / totalDays : 0;
    const avgHour = Math.floor(avgCheckInMinutes / 60);
    const avgMinute = Math.round(avgCheckInMinutes % 60);
    const avgCheckIn = totalDays > 0 ? `${String(avgHour).padStart(2, '0')}:${String(avgMinute).padStart(2, '0')}` : '--:--';

    return { totalDays, totalDelay, avgCheckIn };

  }, [attendanceData]);

  if (!userProfile) {
      return (
         <div className="space-y-6">
             <Skeleton className="h-10 w-64" />
             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                 <Skeleton className="h-32 w-full" />
                 <Skeleton className="h-32 w-full" />
                 <Skeleton className="h-32 w-full" />
             </div>
         </div>
      )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-headline font-bold tracking-tight">
        أهلاً بك، {userProfile.employeeName}
      </h2>
      
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">أيام الحضور (هذا الشهر)</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-1/2" /> : <div className="text-2xl font-bold">{monthlyStats.totalDays}</div>}
            <p className="text-xs text-muted-foreground">يوم حضور مسجل</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي التأخير (هذا الشهر)</CardTitle>
            <Hourglass className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-1/2" /> : <div className="text-2xl font-bold">{monthlyStats.totalDelay} <span className="text-base font-normal">دقيقة</span></div>}
            <p className="text-xs text-muted-foreground">مجموع دقائق التأخير</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              متوسط وقت الحضور
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-1/2" /> : <div className="text-2xl font-bold">{monthlyStats.avgCheckIn}</div>}
            <p className="text-xs text-muted-foreground">متوسط وقت الحضور هذا الشهر</p>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
