
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { BarChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Bar, ResponsiveContainer, Cell } from 'recharts';
import { format, subMonths, getDaysInMonth, startOfMonth, eachDayOfInterval, isSameDay, endOfMonth, getDay } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserCheck, UserX, Calendar, Clock, BarChart3, Filter, Trophy, HandCoins, AlertCircle, PlusCircle, Star, Info, Moon, Sun, Medal } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';


interface Employee {
  id: string;
  employeeName: string;
  gender: 'male' | 'female';
  locationIds?: string[];
  userStatus: 'Active' | 'Inactive' | 'Pending' | 'Archived';
  daysOff?: string[];
  salary: number;
  workDaysPerMonth?: number;
}

interface Location {
  id: string;
  name: string;
}

interface AttendanceRecord {
  employeeId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  delayMinutes?: number;
  status?: 'present' | 'absent' | 'weekly_off';
}

interface FinancialTransaction {
  employeeId: string;
  type: 'bonus' | 'penalty';
  amount: number;
  date: string;
}


interface EmployeeRequest {
  requestType: 'leave_full_day' | 'leave_half_day' | 'mission';
  status: 'approved';
  startDate: string;
  endDate: string;
}

interface GlobalSettings {
    workStartTime?: string;
    workEndTime?: string;
}


type DailyStatus = 'present' | 'absent' | 'on_leave' | 'weekly_off';

const STATUS_CONFIG: { [key in DailyStatus]: { text: string; badgeVariant: 'secondary' | 'destructive' | 'outline' | 'default'; icon: React.ReactNode; } } = {
  present: { text: 'حاضر', badgeVariant: 'secondary', icon: <UserCheck className="h-4 w-4 text-green-500" /> },
  absent: { text: 'غائب', badgeVariant: 'destructive', icon: <UserX className="h-4 w-4 text-red-500" /> },
  on_leave: { text: 'إجازة معتمدة', badgeVariant: 'outline', icon: <Calendar className="h-4 w-4 text-blue-500" /> },
  weekly_off: { text: 'إجازة أسبوعية', badgeVariant: 'default', icon: <Moon className="h-4 w-4 text-gray-500" /> },
};

const getWorkDaysInRange = (startDate: Date, endDate: Date, daysOff: string[]): Date[] => {
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    return days.filter(day => !daysOff.includes(getDay(day).toString()));
};


export default function ReportsPage() {
  const db = useDb();
  const router = useRouter();
  const [reportDate, setReportDate] = useState(new Date());
  const [reportMonth, setReportMonth] = useState(format(new Date(), 'yyyy-MM'));

  // --- Data Fetching ---
  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);

  const attendanceMonthForDaily = format(reportDate, 'yyyy-MM');
  const attendanceRefDaily = useMemoFirebase(() => db ? ref(db, `attendance/${attendanceMonthForDaily}`) : null, [db, attendanceMonthForDaily]);
  const [attendanceDataDaily, isAttendanceDailyLoading] = useDbData<Record<string, AttendanceRecord>>(attendanceRefDaily);
  
  const attendanceRefMonthly = useMemoFirebase(() => db ? ref(db, `attendance/${reportMonth}`) : null, [db, reportMonth]);
  const [attendanceDataMonthly, isAttendanceMonthlyLoading] = useDbData<Record<string, AttendanceRecord>>(attendanceRefMonthly);

  const requestsRef = useMemoFirebase(() => db ? ref(db, 'employee_requests') : null, [db]);
  const [requestsData, isRequestsLoading] = useDbData<Record<string, Record<string, EmployeeRequest>>>(requestsRef);
  
  const transactionsRef = useMemoFirebase(() => db ? ref(db, 'financial_transactions') : null, [db]);
  const [transactionsData, isTransactionsLoading] = useDbData<Record<string, Record<string, Record<string, FinancialTransaction>>>>(transactionsRef);

  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);


  const allEmployees: Employee[] = useMemo(() => {
      if (!employeesData) return [];
      return Object.entries(employeesData)
        .filter(([, emp]) => emp.userStatus === 'Active')
        .map(([id, emp]) => ({ ...emp, id }));
  }, [employeesData]);


  // --- Daily Attendance Report Logic ---
  const dailyAttendanceReport = useMemo(() => {
    if (!allEmployees.length) return [];

    const reportDateStr = format(reportDate, 'yyyy-MM-dd');
    const reportDayOfWeek = getDay(reportDate).toString();

    const report: {
        id: string;
        employeeName: string;
        status: DailyStatus;
        notes?: string;
        checkInTime?: string;
        checkOutTime?: string;
        delayMinutes?: number;
    }[] = [];
    
    allEmployees.forEach(employee => {
        // 1. Check for manual attendance record first (might override status)
        const attendanceRecord = attendanceDataDaily ? Object.values(attendanceDataDaily).find(rec => rec.employeeId === employee.id && rec.date === reportDateStr) : null;

        if (attendanceRecord?.status === 'weekly_off') {
             report.push({ id: employee.id, employeeName: employee.employeeName, status: 'weekly_off', notes: 'إجازة أسبوعية بديلة' });
             return;
        }
        
        if (attendanceRecord?.status === 'absent') {
             report.push({ id: employee.id, employeeName: employee.employeeName, status: 'absent', notes: 'تم احتسابه غياب' });
             return;
        }

        // 2. Check for regular weekly day off
        const employeeDaysOff = employee.daysOff || [];
        if(employeeDaysOff.includes(reportDayOfWeek)) {
            report.push({ id: employee.id, employeeName: employee.employeeName, status: 'weekly_off', notes: 'إجازة أسبوعية' });
            return;
        }

        // 3. Check for approved leave
        const employeeRequests = requestsData?.[employee.id] ? Object.values(requestsData[employee.id]) : [];
        const approvedLeave = employeeRequests.find(req => {
            if (req.status === 'approved' && req.requestType.startsWith('leave')) {
                const startDate = new Date(req.startDate);
                startDate.setHours(0, 0, 0, 0);
                const endDate = new Date(req.endDate);
                endDate.setHours(23, 59, 59, 999);
                return reportDate >= startDate && reportDate <= endDate;
            }
            return false;
        });

        if (approvedLeave) {
            report.push({
                id: employee.id,
                employeeName: employee.employeeName,
                status: 'on_leave',
                notes: approvedLeave.requestType === 'leave_full_day' ? 'إجازة يوم كامل' : 'إجازة نصف يوم'
            });
            return;
        }

        // 4. Check for attendance (present)
        if (attendanceRecord && attendanceRecord.checkIn) {
             report.push({
                id: employee.id,
                employeeName: employee.employeeName,
                status: 'present',
                checkInTime: new Date(attendanceRecord.checkIn).toLocaleTimeString('ar-EG'),
                checkOutTime: attendanceRecord.checkOut ? new Date(attendanceRecord.checkOut).toLocaleTimeString('ar-EG') : undefined,
                delayMinutes: attendanceRecord.delayMinutes,
             });
             return;
        }
        
        // 5. If none of the above, employee is absent
        report.push({
            id: employee.id,
            employeeName: employee.employeeName,
            status: 'absent'
        });
    });

    return report.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [reportDate, allEmployees, attendanceDataDaily, requestsData]);

  const dailyStatusCounts = useMemo(() => {
    const counts = { present: 0, absent: 0, on_leave: 0, weekly_off: 0 };
    dailyAttendanceReport.forEach(item => {
        if(item.status === 'on_leave' || item.status === 'weekly_off') {
            counts.on_leave++;
        } else {
            counts[item.status]++;
        }
    });
    return counts;
  }, [dailyAttendanceReport]);


    // --- Ideal Employee Report Logic ---
    const idealEmployeeReport = useMemo(() => {
      const POINTS_PER_DAY = 4;
      
      if (!attendanceDataMonthly || !employeesData || !allEmployees.length) return [];
      
      const employeeStats: { [key: string]: { 
          totalDelay: number; 
          absenceDays: number;
          bonuses: number;
          penalties: number;
          startingPoints: number;
      } } = {};

      const monthDate = new Date(reportMonth + '-02T00:00:00');
      const today = new Date();
      const calculationEndDate = today < endOfMonth(monthDate) ? today : endOfMonth(monthDate);

      allEmployees.forEach(emp => {
          const daysOff = emp.daysOff || ['5']; 
          const workDaysSoFar = getWorkDaysInRange(startOfMonth(monthDate), calculationEndDate, daysOff).length;
          const startingPoints = workDaysSoFar * POINTS_PER_DAY;
          employeeStats[emp.id] = { totalDelay: 0, absenceDays: 0, bonuses: 0, penalties: 0, startingPoints };
      });
      
      const presentDaysByEmployee: { [key: string]: Set<string> } = {};
      Object.values(attendanceDataMonthly).forEach(rec => {
          if (employeeStats[rec.employeeId] && new Date(rec.date) <= calculationEndDate) {
              if (rec.delayMinutes && rec.delayMinutes > 0) {
                  employeeStats[rec.employeeId].totalDelay += rec.delayMinutes;
              }
              if (rec.checkIn && rec.status !== 'weekly_off' && rec.status !== 'absent') {
                  if (!presentDaysByEmployee[rec.employeeId]) {
                    presentDaysByEmployee[rec.employeeId] = new Set();
                  }
                  presentDaysByEmployee[rec.employeeId].add(rec.date);
              }
          }
      });
      
      
      allEmployees.forEach(emp => {
        const daysOff = emp.daysOff || ['5']; 
        const workDays = getWorkDaysInRange(startOfMonth(monthDate), calculationEndDate, daysOff);
        
        const employeeRequests = requestsData && requestsData[emp.id] ? Object.values(requestsData[emp.id]) : [];
        const approvedLeaveDays = new Set<string>();
        employeeRequests.forEach(req => {
            if (req.status === 'approved' && req.requestType.startsWith('leave')) {
                const interval = eachDayOfInterval({ start: new Date(req.startDate), end: new Date(req.endDate) });
                interval.forEach(day => {
                    if (day <= calculationEndDate) {
                        approvedLeaveDays.add(format(day, 'yyyy-MM-dd'));
                    }
                });
            }
        });
        
        let absenceCount = 0;
        workDays.forEach(day => {
            const dayStr = format(day, 'yyyy-MM-dd');
            // Respect manual 'weekly_off' override from attendance records
            const manualOff = Object.values(attendanceDataMonthly || {}).some(a => a.employeeId === emp.id && a.date === dayStr && a.status === 'weekly_off');
            if (manualOff) return;

            const attended = presentDaysByEmployee[emp.id]?.has(dayStr);
            if (!attended && !approvedLeaveDays.has(dayStr)) {
                absenceCount++;
            }
        });
        if (employeeStats[emp.id]) {
            employeeStats[emp.id].absenceDays = absenceCount;
        }
      });
      
      if (transactionsData) {
        Object.entries(transactionsData).forEach(([employeeId, employeeMonths]) => {
            if(employeeStats[employeeId] && employeeMonths) {
                const monthTransactions = employeeMonths[reportMonth];
                if (monthTransactions) {
                    Object.values(monthTransactions).forEach(tx => {
                        if (new Date(tx.date) <= calculationEndDate) {
                            if (tx.type === 'bonus') {
                                employeeStats[employeeId].bonuses += tx.amount;
                            } else if (tx.type === 'penalty') {
                                employeeStats[employeeId].penalties += tx.amount;
                            }
                        }
                    });
                }
            }
        });
      }
      
      return Object.entries(employeeStats)
          .map(([employeeId, stats]) => {
              const employee = employeesData[employeeId];
              if (!employee) return null;

              // CRITICAL: Divider is customized per employee
              const dailyRate = (employee.salary || 0) / (employee.workDaysPerMonth || 30);

              const bonusDays = dailyRate > 0 ? stats.bonuses / dailyRate : 0;
              const penaltyDays = dailyRate > 0 ? stats.penalties / dailyRate : 0;
              
              const bonusPoints = bonusDays * POINTS_PER_DAY;
              const penaltyPoints = penaltyDays * POINTS_PER_DAY;
              const absencePoints = stats.absenceDays * POINTS_PER_DAY;
              const delayPoints = (stats.totalDelay / 60) * 3;
              
              const totalPoints = stats.startingPoints + bonusPoints - penaltyPoints - absencePoints - delayPoints;
              
              return {
                  employeeId,
                  employeeName: employee.employeeName,
                  ...stats,
                  totalPoints,
                  bonusPoints,
                  penaltyPoints,
                  absencePoints,
                  delayPoints
              }
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
          .sort((a, b) => {
              if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
              if (a.absenceDays !== b.absenceDays) return a.absenceDays - b.absenceDays;
              if (a.totalDelay !== b.totalDelay) return a.totalDelay - b.totalDelay;
              if (a.penalties !== b.penalties) return a.penalties - b.penalties;
              return b.bonuses - a.bonuses;
          });

  }, [attendanceDataMonthly, transactionsData, requestsData, reportMonth, employeesData, allEmployees, settings]);


  const months = Array.from({ length: 12 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'));
  const isLoading = isEmployeesLoading || isAttendanceDailyLoading || isRequestsLoading || isAttendanceMonthlyLoading || isTransactionsLoading || isSettingsLoading;
  
  const rankColors = [
    "bg-amber-400/20 border-amber-500", // Gold
    "bg-slate-400/20 border-slate-500", // Silver
    "bg-orange-400/20 border-orange-500" // Bronze
  ];


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-headline font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            التقارير العامة
        </h2>
      </div>

       <Tabs defaultValue="daily-attendance" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="daily-attendance">تقرير الحضور اليومي</TabsTrigger>
            <TabsTrigger value="monthly-delay" onClick={() => router.push('/admin/reports/monthly-employee')}>تقرير الموظف الشهري</TabsTrigger>
            <TabsTrigger value="ideal-employee">الموظف المثالي</TabsTrigger>
        </TabsList>
        
        {/* Daily Attendance Report */}
        <TabsContent value="daily-attendance">
            <Card className="mt-4">
                <CardHeader>
                    <CardTitle>تقرير الحضور اليومي</CardTitle>
                    <CardDescription>عرض حالة الحضور والغياب والإجازات للموظفين في يوم محدد.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                     <div className="space-y-2 max-w-sm">
                        <Label htmlFor="report-date">اختر التاريخ</Label>
                        <Input id="report-date" type="date" value={format(reportDate, 'yyyy-MM-dd')} onChange={e => setReportDate(new Date(e.target.value))} />
                    </div>
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">الحاضرون</CardTitle>
                            <UserCheck className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent>
                            {isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{dailyStatusCounts.present}</div>}
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">الغائبون</CardTitle>
                            <UserX className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent>
                            {isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{dailyStatusCounts.absent}</div>}
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">في إجازة</CardTitle>
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent>
                             {isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{dailyStatusCounts.on_leave + dailyStatusCounts.weekly_off}</div>}
                          </CardContent>
                        </Card>
                      </div>
                         <div className="lg:col-span-3">
                            <Card>
                                <CardHeader><CardTitle className="text-lg">قائمة الحالات</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="hidden md:block">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>اسم الموظف</TableHead>
                                                    <TableHead>الحالة</TableHead>
                                                    <TableHead>وقت الحضور</TableHead>
                                                    <TableHead>التأخير (د)</TableHead>
                                                    <TableHead>ملاحظات</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {isLoading && Array.from({length: 5}).map((_, i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell></TableRow>)}
                                                {!isLoading && dailyAttendanceReport.map(item => (
                                                    <TableRow key={item.id}>
                                                        <TableCell>{item.employeeName}</TableCell>
                                                        <TableCell>
                                                            <Badge variant={STATUS_CONFIG[item.status].badgeVariant}>{STATUS_CONFIG[item.status].text}</Badge>
                                                        </TableCell>
                                                        <TableCell className="font-mono">{item.checkInTime || '-'}</TableCell>
                                                        <TableCell className={`font-mono font-bold ${item.delayMinutes && item.delayMinutes > 0 ? 'text-destructive' : ''}`}>{item.delayMinutes ?? '-'}</TableCell>
                                                        <TableCell className="text-xs text-muted-foreground">{item.notes || '-'}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    <div className="space-y-4 md:hidden">
                                        {!isLoading && dailyAttendanceReport.map(item => (
                                            <Card key={item.id}>
                                                <CardHeader className="p-3">
                                                    <div className="flex justify-between items-center">
                                                         <CardTitle className="text-base">{item.employeeName}</CardTitle>
                                                          <Badge variant={STATUS_CONFIG[item.status].badgeVariant}>{STATUS_CONFIG[item.status].text}</Badge>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="p-3 pt-0 text-sm space-y-2">
                                                    {item.status === 'present' && (
                                                        <>
                                                        <div className="flex justify-between"><span className="text-muted-foreground">وقت الحضور:</span> <span className="font-mono">{item.checkInTime}</span></div>
                                                        <div className="flex justify-between"><span className="text-muted-foreground">دقائق التأخير:</span> <span className={`font-mono font-bold ${item.delayMinutes && item.delayMinutes > 0 ? 'text-destructive' : ''}`}>{item.delayMinutes ?? 0}</span></div>
                                                        </>
                                                    )}
                                                     {item.notes && (
                                                        <div className="text-xs text-muted-foreground pt-2 border-t">{item.notes}</div>
                                                     )}
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                </CardContent>
            </Card>
        </TabsContent>

        {/* Monthly Delay Report placeholder */}
        <TabsContent value="monthly-delay">
            <Card className="mt-4">
                <CardHeader>
                    <CardTitle>تقرير الموظف الشهري</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>يتم عرض هذا التقرير في صفحته الخاصة.</p>
                </CardContent>
            </Card>
        </TabsContent>

         {/* Ideal Employee Report */}
        <TabsContent value="ideal-employee">
             <Card className="mt-4">
                <CardHeader>
                    <CardTitle>تقرير الموظف المثالي (نظام النقاط)</CardTitle>
                    <CardDescription>
                        يتم ترتيب الموظفين بناءً على مجموع نقاطهم المحتسبة حتى اليوم.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2 max-w-sm">
                        <Label htmlFor="report-month-ideal">اختر الشهر</Label>
                        <Select dir="rtl" value={reportMonth} onValueChange={setReportMonth}>
                        <SelectTrigger id="report-month-ideal"><SelectValue/></SelectTrigger>
                        <SelectContent>
                            {months.map(month => (
                                <SelectItem key={month} value={month}>{new Date(month + '-02').toLocaleDateString('ar', { month: 'long', year: 'numeric' })}</SelectItem>
                            ))}
                        </SelectContent>
                        </Select>
                    </div>
                     <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>آلية احتساب النقاط</AlertTitle>
                        <div className="text-xs [&_p]:leading-relaxed">
                            <ul className="list-disc pr-5 text-xs space-y-1 mt-2">
                                <li><b>الرصيد الابتدائي:</b> (أيام العمل في الشهر حتى اليوم) × 4 نقاط.</li>
                                <li><b>نقاط المكافآت (تضاف):</b> (قيمة المكافأة / الراتب اليومي) × 4 نقاط.</li>
                                <li><b>نقاط الجزاءات (تخصم):</b> (قيمة الجزاء / الراتب اليومي) × 4 نقاط.</li>
                                <li><b>نقاط الغياب (تخصم):</b> (عدد أيام الغياب) × 4 نقاط.</li>
                                <li><b>نقاط التأخير (تخصم):</b> (إجمالي ساعات التأخير) × 3 نقاط.</li>
                            </ul>
                        </div>
                    </Alert>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                       {idealEmployeeReport.slice(0,3).map((item, index) => (
                           <Card key={item.employeeId} className={cn("border-2", rankColors[index], index === 0 ? 'md:col-start-2' : '')}>
                               <CardContent className="p-4 text-center">
                                   <Medal className={cn("mx-auto h-12 w-12", ["text-amber-500", "text-slate-500", "text-orange-500"][index])} />
                                   <h3 className="text-lg font-bold mt-2">{item.employeeName}</h3>
                                   <p className="font-bold text-2xl text-primary">{item.totalPoints.toFixed(2)}</p>
                                   <p className="text-xs text-muted-foreground">نقطة</p>
                               </CardContent>
                           </Card>
                       ))}
                    </div>

                    <div className="lg:col-span-3">
                            <Card>
                            <CardHeader><CardTitle className="text-lg">ترتيب الموظفين المثالي</CardTitle></CardHeader>
                            <CardContent>
                                <div className="hidden md:block">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>الترتيب</TableHead>
                                                <TableHead>اسم الموظف</TableHead>
                                                <TableHead className="text-center">الغياب (يوم)</TableHead>
                                                <TableHead className="text-center">التأخير (دقيقة)</TableHead>
                                                <TableHead className="text-center">الجزاءات (ج.م)</TableHead>
                                                <TableHead className="text-center">المكافآت (ج.م)</TableHead>
                                                <TableHead className="text-center font-bold text-primary">إجمالي النقاط (نقطة)</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isLoading && Array.from({length: 5}).map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-10 w-full" /></TableCell></TableRow>)}
                                            {!isLoading && idealEmployeeReport.map((item, index) => (
                                                <TableRow key={item.employeeId}>
                                                    <TableCell className="font-bold text-lg">
                                                        {index < 3 ? <Medal className={cn("h-6 w-6", ["text-amber-500", "text-slate-500", "text-orange-500"][index])} /> : index + 1}
                                                    </TableCell>
                                                    <TableCell className="font-semibold">{item.employeeName}</TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="font-bold text-lg">{item.absenceDays}</div>
                                                        <div className="text-xs font-mono text-destructive">(-{item.absencePoints.toFixed(2)})</div>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="font-bold text-lg">{item.totalDelay}</div>
                                                         <div className="text-xs font-mono text-destructive">(-{item.delayPoints.toFixed(2)})</div>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="font-bold text-lg">{item.penalties.toLocaleString()}</div>
                                                        <div className="text-xs font-mono text-destructive">(-{item.penaltyPoints.toFixed(2)})</div>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="font-bold text-lg">{item.bonuses.toLocaleString()}</div>
                                                        <div className="text-xs font-mono text-green-600">(+{item.bonusPoints.toFixed(2)})</div>
                                                    </TableCell>
                                                    <TableCell className="text-center font-mono font-bold text-2xl text-primary">{item.totalPoints.toFixed(2)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                                <div className="space-y-2 md:hidden">
                                    {!isLoading && idealEmployeeReport.map((item, index) => (
                                        <Card key={item.employeeId} className="p-4">
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-3">
                                                    <div className="font-bold text-lg">
                                                        {index < 3 ? <Medal className={cn("h-6 w-6", ["text-amber-500", "text-slate-500", "text-orange-500"][index])} /> : `${index + 1}.`}
                                                    </div>
                                                    <span className="font-semibold">{item.employeeName}</span>
                                                </div>
                                                 <Badge variant="secondary" className="text-base bg-blue-100 text-blue-800">
                                                    {item.totalPoints.toFixed(2)} نقطة
                                                </Badge>
                                            </div>
                                            <div className="mt-2 text-xs text-muted-foreground grid grid-cols-2 gap-2">
                                                <p className="flex items-center gap-1"><UserX className="h-3 w-3"/> غياب: <span className="font-mono">{item.absenceDays}</span></p>
                                                <p className="flex items-center gap-1"><Clock className="h-3 w-3"/> تأخير: <span className="font-mono">{item.totalDelay}</span></p>
                                                <p className="flex items-center gap-1"><AlertCircle className="h-3 w-3"/> جزاءات: <span className="font-mono text-destructive">{item.penalties.toLocaleString()}</span></p>
                                                <p className="flex items-center gap-1"><PlusCircle className="h-3 w-3"/> مكافآت: <span className="font-mono text-green-600">{item.bonuses.toLocaleString()}</span></p>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </CardContent>
            </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
