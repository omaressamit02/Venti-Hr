
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Hourglass, AlertTriangle } from 'lucide-react';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';


interface AttendanceRecord {
  id: string;
  employeeName: string;
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut?: string;
  workHours: number;
  locationName?: string;
  delayMinutes?: number;
  originalDelayMinutes?: number;
  delayAction?: 'none' | 'forgiven';
  officialCheckInTime?: string;
  officialCheckOutTime?: string;
  isMissedCheckout?: boolean;
}

interface GlobalSettings {
    workStartTime?: string;
    workEndTime?: string;
    employeeAlert?: string;
}

interface UserProfile {
  id: string;
  employeeName: string;
  employeeCode: string;
}


export default function AttendancePage() {
  const db = useDb();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  useEffect(() => {
    const storedProfile = localStorage.getItem('userProfile');
    if (storedProfile && storedProfile.trim() !== '' && storedProfile !== 'undefined' && storedProfile !== 'null') {
      try {
        const parsed = JSON.parse(storedProfile);
        if (parsed && typeof parsed === 'object') {
            setUserProfile(parsed);
        }
      } catch (e) {
        console.error("Error parsing profile in Attendance", e);
        localStorage.removeItem('userProfile');
      }
    }
    setIsLoadingProfile(false);
  }, []);
  
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  
  const attendanceRef = useMemoFirebase(() => {
    if (!db) return null;
    return ref(db, `attendance/${selectedMonth}`);
  }, [db, selectedMonth]);

  const [monthlyAttendanceData, isAttendanceLoading] = useDbData<Record<string, Omit<AttendanceRecord, 'id'>>>(attendanceRef);
  
  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);
  
  const isLoading = isLoadingProfile || isAttendanceLoading || isSettingsLoading;


  const allAttendanceRecords = useMemo(() => {
    if (!monthlyAttendanceData || !userProfile) return [];
    
    return Object.entries(monthlyAttendanceData)
      .filter(([, record]) => record.employeeId === userProfile.id)
      .map(([id, record]): AttendanceRecord | null => {
        if (!record || !record.date || !record.checkIn) {
            return null;
        }

        const officialCheckIn = record.officialCheckInTime || settings?.workStartTime || '08:00';
        const officialCheckOut = record.officialCheckOutTime || settings?.workEndTime || '16:00';

        const [inH, inM] = officialCheckIn.split(':').map(Number);
        const [outH, outM] = officialCheckOut.split(':').map(Number);
        
        const officialCheckInDate = new Date(record.date + 'T00:00:00');
        officialCheckInDate.setHours(inH, inM, 0, 0);

        const officialCheckOutDate = new Date(record.date + 'T00:00:00');
        officialCheckOutDate.setHours(outH, outM, 0, 0);

        if (inH > outH) {
            officialCheckOutDate.setDate(officialCheckOutDate.getDate() + 1);
        }

        const checkInTimestamp = new Date(record.checkIn).getTime();
        const effectiveCheckInTime = Math.max(checkInTimestamp, officialCheckInDate.getTime());
        
        let workHours = 0;
        let isMissedCheckout = false;
        if (record.checkOut) {
            const checkOutTimestamp = new Date(record.checkOut).getTime();
            const effectiveCheckOutTime = Math.min(checkOutTimestamp, officialCheckOutDate.getTime());
            workHours = (effectiveCheckOutTime - effectiveCheckInTime);
        } else {
            const fourHoursAfterOfficial = new Date(officialCheckOutDate.getTime() + 4 * 60 * 60 * 1000);
            if (new Date() > fourHoursAfterOfficial) {
                isMissedCheckout = true;
            }
        }

        return {
            id,
            employeeId: record.employeeId,
            employeeName: userProfile.employeeName,
            date: record.date,
            checkIn: new Date(record.checkIn).toLocaleTimeString('ar-EG'),
            checkOut: record.checkOut ? new Date(record.checkOut).toLocaleTimeString('ar-EG') : 'لم يسجل انصراف',
            workHours: workHours > 0 ? workHours / (1000 * 60 * 60) : 0,
            delayMinutes: record.delayMinutes || 0,
            originalDelayMinutes: record.originalDelayMinutes,
            delayAction: record.delayAction || 'none',
            locationName: record.locationName,
            officialCheckInTime: officialCheckIn,
            officialCheckOutTime: officialCheckOut,
            isMissedCheckout: isMissedCheckout,
        };
    }).filter((record): record is AttendanceRecord => record !== null);
  }, [monthlyAttendanceData, userProfile, settings]);


  const filteredData = useMemo(() => {
    if (!allAttendanceRecords) return [];
    
    const monthDate = new Date(selectedMonth + '-01T00:00:00');
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);

    const data = allAttendanceRecords.filter(d => {
        const recordDate = new Date(d.date);
        return recordDate >= monthStart && recordDate <= monthEnd;
    });

    return data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allAttendanceRecords, selectedMonth]);
  

  const totalHours = filteredData.reduce((acc, curr) => acc + curr.workHours, 0).toFixed(2);
  const totalDelayMinutes = filteredData.reduce((acc, curr) => acc + (curr.delayMinutes || 0), 0);

  const months = Array.from({ length: 12 }, (_, i) => {
    return format(subMonths(new Date(), i), 'yyyy-MM');
  });

  return (
    <div className="space-y-6">
       {settings?.employeeAlert && (
            <Alert className="border-yellow-500/50 bg-yellow-500/10">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <AlertTitle className="text-yellow-700 dark:text-yellow-500">تنبيه هام</AlertTitle>
                <AlertDescription className="font-bold text-yellow-600 dark:text-yellow-500">
                    {settings.employeeAlert}
                </AlertDescription>
            </Alert>
        )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            سجل حضوري
          </CardTitle>
          {userProfile && (
            <CardDescription>
                {userProfile.employeeName} - {userProfile.employeeCode}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
            <div className="space-y-2">
              <label className="text-sm font-medium">اختر الشهر</label>
              <Select
                dir="rtl"
                value={selectedMonth}
                onValueChange={setSelectedMonth}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الشهر" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month} value={month}>
                      {new Date(month + '-02').toLocaleDateString('ar', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>
            ملخص الشهر
        </CardTitle>
        </CardHeader>
        <CardContent>
        <div className="flex gap-4 md:gap-8 text-center justify-around">
            <div>
                <p className="text-sm font-medium text-muted-foreground flex items-center justify-center gap-1"><Hourglass className="h-4 w-4"/> إجمالي التأخير</p>
                <p className="text-2xl font-bold text-destructive">{totalDelayMinutes} <span className="text-base font-normal">دقيقة</span></p>
                </div>
            <div>
                <p className="text-sm font-medium text-muted-foreground">إجمالي الساعات</p>
                <p className="text-2xl font-bold">{totalHours} <span className="text-base font-normal">ساعة</span></p>
                </div>
        </div>
        </CardContent>
    </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            سجل الحضور الشهري
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">الدوام الرسمي</TableHead>
                  <TableHead className="text-right">وقت الحضور</TableHead>
                  <TableHead className="text-right">وقت الانصراف</TableHead>
                  <TableHead className="text-left">دقائق التأخير</TableHead>
                  <TableHead className="text-left">ساعات العمل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    </TableRow>
                  ))
                )}
                {!isLoading && filteredData.length > 0 ? (
                  filteredData.map((record) => (
                    <TableRow key={record.id} className={cn(record.isMissedCheckout && 'border-orange-500')}>
                       <TableCell className="text-right">
                        <div>{new Date(record.date).toLocaleDateString('ar-EG')}</div>
                        {record.locationName && (
                            <div className="text-xs text-muted-foreground">من: {record.locationName}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        <div>{record.officialCheckInTime || '--:--'}</div>
                        <div>{record.officialCheckOutTime || '--:--'}</div>
                      </TableCell>
                      <TableCell className="text-right">{record.checkIn}</TableCell>
                      <TableCell className="text-right">
                        {record.isMissedCheckout ? <Badge variant="outline" className="border-yellow-500 text-yellow-600">{record.checkOut}</Badge> : record.checkOut}
                      </TableCell>
                       <TableCell className={'text-left font-mono font-bold'}>
                         {record.delayAction === 'forgiven' ? (
                            <>
                               <span className="line-through text-muted-foreground">{record.originalDelayMinutes}</span>
                               <span className="ml-2 text-green-600">0</span>
                               <Badge variant="secondary" className="mr-2">تم التجاوز</Badge>
                            </>
                         ) : (
                           <span className={record.delayMinutes && record.delayMinutes > 0 ? 'text-destructive' : ''}>
                             {record.delayMinutes}
                           </span>
                         )}
                       </TableCell>
                      <TableCell className="text-left font-mono">{record.workHours.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      {isLoading ? 'جاري تحميل السجلات...' : 'لا توجد سجلات لعرضها لهذا الشهر.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
           {/* Mobile Cards */}
          <div className="space-y-4 md:hidden">
            {isLoading && Array.from({length: 3}).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full"/></CardContent></Card>)}
             {!isLoading && filteredData.length > 0 ? (
                  filteredData.map((record) => (
                    <Card key={record.id} className={cn(record.isMissedCheckout ? 'border-2 border-orange-500' : '')}>
                        <CardContent className="p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <div className="font-semibold col-span-2">{new Date(record.date).toLocaleDateString('ar-EG')}</div>
                             {record.locationName && (
                                <div className="text-muted-foreground col-span-2 text-xs">من: {record.locationName}</div>
                            )}
                             <div>
                              <div className="text-muted-foreground">التأخير</div>
                              <div className={'font-mono font-bold text-lg'}>
                                {record.delayAction === 'forgiven' ? (
                                    <>
                                       <span className="line-through text-muted-foreground text-sm">{record.originalDelayMinutes}</span>
                                       <span className="mr-2 text-green-600">0</span>
                                       <Badge variant="secondary" className="mr-2 text-xs">تم التجاوز</Badge>
                                    </>
                                ) : (
                                  <span className={record.delayMinutes && record.delayMinutes > 0 ? 'text-destructive' : ''}>
                                    {record.delayMinutes}
                                  </span>
                                )}
                                <span className="text-xs">دقائق</span>
                              </div>
                            </div>
                             <div>
                              <div className="text-muted-foreground">ساعات العمل</div>
                              <div className="font-mono font-bold text-lg">{record.workHours.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">وقت الحضور</div>
                              <div>{record.checkIn}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">وقت الانصراف</div>
                              <div>{record.checkOut}</div>
                            </div>
                             <div className="col-span-2">
                                <div className="text-muted-foreground">الدوام الرسمي</div>
                                <div className="text-xs">{record.officialCheckInTime || '--:--'} - {record.officialCheckOutTime || '--:--'}</div>
                            </div>
                            {record.isMissedCheckout && (
                                <div className="col-span-2 mt-2 flex items-center gap-2 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-md text-yellow-800 dark:text-yellow-300">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span className="text-xs font-semibold">لم يتم تسجيل انصراف (يطبق خصم)</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))
            ) : (
                 <div className="h-24 text-center flex items-center justify-center">
                    {isLoading ? 'جاري تحميل السجلات...' : 'لا توجد سجلات لعرضها لهذا الشهر.'}
                </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

