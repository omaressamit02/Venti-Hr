
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
import { Hourglass, AlertTriangle, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { format, subMonths, startOfMonth, endOfMonth, parseISO, addHours } from 'date-fns';
import { arEG } from 'date-fns/locale';
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
  const [isMounted, setIsMounted] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  useEffect(() => {
    setIsMounted(true);
    const now = new Date();
    setSelectedMonth(format(now, 'yyyy-MM'));

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
  
  const attendanceRef = useMemoFirebase(() => {
    if (!db || !selectedMonth) return null;
    return ref(db, `attendance/${selectedMonth}`);
  }, [db, selectedMonth]);

  const [monthlyAttendanceData, isAttendanceLoading] = useDbData<Record<string, Omit<AttendanceRecord, 'id'>>>(attendanceRef);
  
  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);
  
  const isLoading = !isMounted || isLoadingProfile || isAttendanceLoading || isSettingsLoading;


  const allAttendanceRecords = useMemo(() => {
    if (!monthlyAttendanceData || !userProfile) return [];
    
    return Object.entries(monthlyAttendanceData)
      .filter(([, record]) => record.employeeId === userProfile.id)
      .map(([id, record]): AttendanceRecord | null => {
        if (!record || !record.date || !record.checkIn) {
            return null;
        }

        // 1. Build Official Times
        const officialCheckIn = record.officialCheckInTime || settings?.workStartTime || '08:00';
        const officialCheckOut = record.officialCheckOutTime || settings?.workEndTime || '16:00';

        const [inH, inM] = officialCheckIn.split(':').map(Number);
        const [outH, outM] = officialCheckOut.split(':').map(Number);
        
        const officialCheckInDate = new Date(`${record.date}T${officialCheckIn}:00`);
        const officialCheckOutDate = new Date(`${record.date}T${officialCheckOut}:00`);

        // Handle night shift official checkout
        if (inH > outH) {
            officialCheckOutDate.setDate(officialCheckOutDate.getDate() + 1);
        }

        const checkInTime = new Date(record.checkIn);
        const checkInTimestamp = checkInTime.getTime();
        const effectiveCheckInTime = Math.max(checkInTimestamp, officialCheckInDate.getTime());
        
        let workHours = 0;
        let isMissedCheckout = false;

        if (record.checkOut) {
            const checkOutTime = new Date(record.checkOut);
            const checkOutTimestamp = checkOutTime.getTime();
            
            // For work hours calculation, we cap it at official times if desired, or use actual
            // Here we use the actual until official end to be fair
            const effectiveCheckOutTime = Math.min(checkOutTimestamp, officialCheckOutDate.getTime());
            
            // Next day checkout check: if actual checkout is next calendar day, it's not early leave
            const isNextDayCheckout = checkOutTime.getDate() !== new Date(record.date).getDate() || 
                                     checkOutTime.getMonth() !== new Date(record.date).getMonth() ||
                                     checkOutTime.getFullYear() !== new Date(record.date).getFullYear();

            workHours = Math.max(0, checkOutTimestamp - effectiveCheckInTime);
        } else {
            // Check for missed checkout (4 hours after official end)
            const fourHoursAfterOfficial = addHours(officialCheckOutDate, 4);
            if (new Date() > fourHoursAfterOfficial) {
                isMissedCheckout = true;
            }
        }

        return {
            id,
            employeeId: record.employeeId,
            employeeName: userProfile.employeeName,
            date: record.date,
            checkIn: checkInTime.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true }),
            checkOut: record.checkOut 
                ? new Date(record.checkOut).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true }) 
                : 'لم يسجل انصراف',
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
    if (!allAttendanceRecords || !selectedMonth) return [];
    
    return [...allAttendanceRecords].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allAttendanceRecords, selectedMonth]);
  

  const totalHours = filteredData.reduce((acc, curr) => acc + curr.workHours, 0).toFixed(2);
  const totalDelayMinutes = filteredData.reduce((acc, curr) => 
    curr.delayAction === 'forgiven' ? acc : acc + (curr.delayMinutes || 0), 0
  );

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
            <CalendarIcon className="h-5 w-5 text-primary" />
            سجل حضوري
          </CardTitle>
          {userProfile && (
            <CardDescription>
                {userProfile.employeeName} - {userProfile.employeeCode}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
            <div className="space-y-2 max-w-sm">
              <label className="text-sm font-medium">اختر الشهر</label>
              {!isMounted ? (
                <Skeleton className="h-10 w-full" />
              ) : (
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
              )}
            </div>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Hourglass className="h-4 w-4"/> إجمالي التأخير الفعلي
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-3xl font-bold text-destructive">{totalDelayMinutes} <span className="text-base font-normal">دقيقة</span></p>
                <p className="text-xs text-muted-foreground mt-1">لا يشمل التأخيرات المتجاوز عنها من الإدارة</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4"/> إجمالي الساعات المحققة
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-3xl font-bold text-primary">{totalHours} <span className="text-base font-normal">ساعة</span></p>
                <p className="text-xs text-muted-foreground mt-1">إجمالي وقت التواجد الفعلي في العمل</p>
            </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">سجل الحضور اليومي</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="hidden md:block">
            <div className="overflow-x-auto">
                <Table className="whitespace-nowrap min-w-[800px]">
                <TableHeader>
                    <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الدوام الرسمي</TableHead>
                    <TableHead className="text-right">وقت الحضور</TableHead>
                    <TableHead className="text-right">وقت الانصراف</TableHead>
                    <TableHead className="text-left">تأخير (دقيقة)</TableHead>
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
                        <TableRow key={record.id} className={cn(record.isMissedCheckout && 'bg-orange-50 dark:bg-orange-950/20')}>
                        <TableCell className="text-right">
                            <div className="font-medium">{new Date(record.date).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short' })}</div>
                            {record.locationName && (
                                <div className="text-[10px] text-muted-foreground">الفرع: {record.locationName}</div>
                            )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground font-mono">
                            <div>{record.officialCheckInTime} - {record.officialCheckOutTime}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{record.checkIn}</TableCell>
                        <TableCell className="text-right font-mono">
                            {record.isMissedCheckout ? (
                                <Badge variant="outline" className="border-yellow-500 text-yellow-600 font-sans">لم يسجل</Badge>
                            ) : record.checkOut}
                        </TableCell>
                        <TableCell className={'text-left font-mono font-bold'}>
                            {record.delayAction === 'forgiven' ? (
                                <div className="flex flex-col items-start gap-1">
                                    <span className="line-through text-muted-foreground text-xs">{record.originalDelayMinutes}</span>
                                    <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px] px-2">تم التجاوز</Badge>
                                </div>
                            ) : (
                            <span className={cn(record.delayMinutes && record.delayMinutes > 0 ? 'text-destructive' : 'text-green-600')}>
                                {record.delayMinutes || 0}
                            </span>
                            )}
                        </TableCell>
                        <TableCell className="text-left font-mono font-bold">{record.workHours.toFixed(2)}</TableCell>
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
          </div>

           {/* Mobile View */}
          <div className="space-y-4 md:hidden p-4">
            {isLoading && Array.from({length: 3}).map((_, i) => <Card key={i} className="p-4"><Skeleton className="h-24 w-full"/></Card>)}
             {!isLoading && filteredData.length > 0 ? (
                  filteredData.map((record) => (
                    <Card key={record.id} className={cn("overflow-hidden border-2", record.isMissedCheckout ? 'border-orange-400' : 'border-border')}>
                        <div className="bg-muted/30 p-3 border-b flex justify-between items-center">
                            <span className="font-bold text-sm">{new Date(record.date).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                            <Badge variant="outline" className="font-mono text-[10px]">{record.officialCheckInTime} : {record.officialCheckOutTime}</Badge>
                        </div>
                        <CardContent className="p-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                             <div>
                              <div className="text-muted-foreground mb-1">وقت الحضور</div>
                              <div className="font-mono font-bold text-sm flex items-center gap-1">
                                  <LogIn className="h-3 w-3 text-green-500" />
                                  {record.checkIn}
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground mb-1">وقت الانصراف</div>
                              <div className="font-mono font-bold text-sm flex items-center gap-1">
                                  <LogOut className="h-3 w-3 text-orange-500" />
                                  {record.isMissedCheckout ? <span className="text-yellow-600 font-sans">لم يسجل</span> : record.checkOut}
                              </div>
                            </div>

                             <div className="border-t pt-2">
                              <div className="text-muted-foreground mb-1">التأخير</div>
                              <div className={'font-mono'}>
                                {record.delayAction === 'forgiven' ? (
                                    <div className="flex items-center gap-2">
                                       <span className="line-through text-muted-foreground">{record.originalDelayMinutes}</span>
                                       <Badge variant="secondary" className="bg-green-100 text-green-800 text-[9px] px-1">متجاوز</Badge>
                                    </div>
                                ) : (
                                  <span className={cn("text-lg font-bold", record.delayMinutes && record.delayMinutes > 0 ? 'text-destructive' : 'text-green-600')}>
                                    {record.delayMinutes || 0} <span className="text-[10px] font-normal">د</span>
                                  </span>
                                )}
                              </div>
                            </div>
                             <div className="border-t pt-2">
                              <div className="text-muted-foreground mb-1">ساعات العمل</div>
                              <div className="font-mono font-bold text-lg text-primary">{record.workHours.toFixed(2)} <span className="text-[10px] font-normal text-muted-foreground">ساعة</span></div>
                            </div>
                            
                            {record.isMissedCheckout && (
                                <div className="col-span-2 mt-2 flex items-center gap-2 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-md text-yellow-800 dark:text-yellow-300">
                                    <AlertTriangle className="h-3 w-3" />
                                    <span className="text-[10px] font-bold">تنبيه: لم يتم تسجيل انصراف لليوم (سيطبق خصم مالي).</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))
            ) : (
                 <div className="h-24 text-center flex items-center justify-center text-muted-foreground">
                    {isLoading ? 'جاري تحميل السجلات...' : 'لا توجد سجلات لعرضها لهذا الشهر.'}
                </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { LogIn, LogOut } from 'lucide-react';
