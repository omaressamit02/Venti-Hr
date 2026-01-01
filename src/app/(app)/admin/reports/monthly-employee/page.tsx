
'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from "@/components/ui/card";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup } from "@/components/ui/command";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { UserCheck, UserX, Calendar, Clock, Briefcase, Moon, ChevronsUpDown as ChevronDown, Loader2, AlertTriangle, Share2 } from "lucide-react";

import { useDb, useDbData, useMemoFirebase } from "@/firebase";
import { ref } from "firebase/database";
import { format, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth } from "date-fns";
import { arEG } from "date-fns/locale";

// ----------------------------------------------------------
// Interfaces
// ----------------------------------------------------------

interface Employee {
  id: string;
  employeeName: string;
  dayOff?: string;
  shiftConfiguration?: "general" | "custom";
  checkInTime?: string;
  checkOutTime?: string;
}

interface AttendanceRecord {
  employeeId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  delayMinutes?: number;
  officialCheckOutTime?: string;
}

interface EmployeeRequest {
  requestType: "leave_full_day" | "leave_half_day" | "mission";
  status: "approved";
  startDate: string;
  endDate: string;
}

interface GlobalSettings {
  workStartTime?: string;
  workEndTime?: string;
  companyName?: string;
}

type DailyStatus = "present" | "absent" | "on_leave" | "mission" | "weekly_off";

interface DailyReport {
  date: string;
  dayName: string;
  officialCheckInTime?: string;
  officialCheckOutTime?: string;
  status: DailyStatus;
  notes?: string;
  checkIn?: string;
  checkOut?: string;
  delayMinutes?: number;
  workHours?: number;
  isMissedCheckout?: boolean;
}

// ----------------------------------------------------------
// Status UI Config
// ----------------------------------------------------------

const STATUS_CONFIG = {
  present: { text: "حاضر", badgeVariant: "secondary", icon: <UserCheck className="h-4 w-4 text-green-500" /> },
  absent: { text: "غائب", badgeVariant: "destructive", icon: <UserX className="h-4 w-4 text-red-500" /> },
  on_leave: { text: "إجازة", badgeVariant: "outline", icon: <Calendar className="h-4 w-4 text-blue-500" /> },
  mission: { text: "مأمورية", badgeVariant: "outline", icon: <Briefcase className="h-4 w-4 text-purple-500" /> },
  weekly_off: { text: "إجازة أسبوعية", badgeVariant: "default", icon: <Moon className="h-4 w-4 text-gray-500" /> }
} as const;

// ----------------------------------------------------------
// Page Component
// ----------------------------------------------------------

export default function MonthlyEmployeeReportPage() {

  const db = useDb();

  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  // ----------------------------------------------------------
  // Firebase Data Fetching
  // ----------------------------------------------------------

  const employeesRef = useMemoFirebase(() => db ? ref(db, "employees") : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);

  const attendanceRef = useMemoFirebase(() => db ? ref(db, `attendance/${selectedMonth}`) : null, [db, selectedMonth]);
  const [attendanceData, isAttendanceLoading] = useDbData<Record<string, AttendanceRecord>>(attendanceRef);

  const requestsRef = useMemoFirebase(() => db ? ref(db, `employee_requests/${selectedEmployeeId}`) : null, [db, selectedEmployeeId]);
  const [requestsData, isRequestsLoading] = useDbData<Record<string, EmployeeRequest>>(requestsRef);

  const settingsRef = useMemoFirebase(() => db ? ref(db, "global_settings/main") : null, [db]);
  const [settingsData, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);

  // ----------------------------------------------------------
  // Derived Data
  // ----------------------------------------------------------

  const employeesList = useMemo(() => {
    if (!employeesData) return [];
    return Object.entries(employeesData).map(([id, emp]) => ({ ...emp, id }));
  }, [employeesData]);


  useEffect(() => {
    if (!selectedEmployeeId && employeesList.length > 0) {
      setSelectedEmployeeId(employeesList[0].id);
    }
  }, [employeesList, selectedEmployeeId]);


  // Generate month dates
  const monthlyReport: DailyReport[] = useMemo(() => {
    if (!selectedEmployeeId || !employeesData || !settingsData) return [];

    const employee = employeesData[selectedEmployeeId];
    if (!employee) return [];

    const monthDate = new Date(selectedMonth + "-02T00:00:00");
    const startDate = startOfMonth(monthDate);
    
    const today = new Date();
    const endDate = isSameMonth(monthDate, today) ? today : endOfMonth(monthDate);
    
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    const employeeDayOff = employee.dayOff ? parseInt(employee.dayOff, 10) : -1;
    const employeeAttendance = attendanceData ? Object.values(attendanceData).filter(a => a.employeeId === selectedEmployeeId) : [];
    const employeeRequests = requestsData ? Object.values(requestsData) : [];

    const globalIn = settingsData.workStartTime || "--";
    const globalOut = settingsData.workEndTime || "--";

    return days.map((day): DailyReport => {

      const dayStr = format(day, "yyyy-MM-dd");
      const dayOfWeek = getDay(day);

      const officialIn = (employee.shiftConfiguration === "custom" && employee.checkInTime) ? employee.checkInTime : globalIn;
      const officialOut = (employee.shiftConfiguration === "custom" && employee.checkOutTime) ? employee.checkOutTime : globalOut;

      const base: DailyReport = {
        date: dayStr,
        dayName: format(day, "EEEE", { locale: arEG }),
        officialCheckInTime: officialIn,
        officialCheckOutTime: officialOut,
        status: "absent" // Default to absent
      };

      const attendance = employeeAttendance.find(a => a.date === dayStr);

      if (dayOfWeek === employeeDayOff) {
          if (attendance) { // Worked on day off
             const processedAttendance = processAttendance(attendance);
             return { ...base, ...processedAttendance, status: "present", notes: "عمل في يوم الإجازة" };
          }
          return { ...base, status: "weekly_off" };
      }

      // Check requests
      const activeReq = employeeRequests.find(r => {
        if (r.status !== "approved") return false;
        const reqStart = new Date(r.startDate);
        const reqEnd = new Date(r.endDate);
        reqStart.setHours(0,0,0,0);
        reqEnd.setHours(0,0,0,0);
        return day >= reqStart && day <= reqEnd;
      });

      if (activeReq) {
        return {
          ...base,
          status: activeReq.requestType === "mission" ? "mission" : "on_leave",
          notes: activeReq.requestType === "leave_full_day" ? "إجازة يوم كامل" : "إجازة نصف يوم"
        };
      }

      // Check attendance
      if (attendance) {
        return {
          ...base,
          status: "present",
          ...processAttendance(attendance)
        };
      }

      // If nothing else, it's an absence
      return base;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    function processAttendance(attendance: AttendanceRecord) {
        const checkIn = attendance.checkIn ? new Date(attendance.checkIn) : null;
        const checkOut = attendance.checkOut ? new Date(attendance.checkOut) : null;
        let isMissedCheckout = false;

        let workHours = 0;
        if (checkIn && checkOut) {
          workHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
        } else if (checkIn) {
            const officialCheckoutStr = attendance.officialCheckOutTime || settingsData?.workEndTime;
            if(officialCheckoutStr){
              const [hours, minutes] = officialCheckoutStr.split(':').map(Number);
              const officialCheckoutDate = new Date(checkIn);
              officialCheckoutDate.setHours(hours, minutes, 0, 0);
              const fourHoursAfterOfficial = new Date(officialCheckoutDate.getTime() + 4 * 60 * 60 * 1000);
              if (new Date() > fourHoursAfterOfficial) {
                  isMissedCheckout = true;
              }
            }
        }

        return {
          checkIn: checkIn?.toLocaleTimeString("ar-EG") || "-",
          checkOut: checkOut?.toLocaleTimeString("ar-EG") || "-",
          delayMinutes: attendance.delayMinutes || 0,
          workHours: Math.max(workHours, 0),
          isMissedCheckout: isMissedCheckout
        };
    }

  }, [selectedMonth, selectedEmployeeId, attendanceData, employeesData, requestsData, settingsData]);

  // Summary Stats
  const summaryStats = useMemo(() => {
    const s = { present: 0, absent: 0, delay: 0, hours: 0, on_leave: 0, mission: 0, weekly_off: 0, missed_checkout: 0 };

    monthlyReport.forEach(d => {
      if (s[d.status] !== undefined) {
         // @ts-ignore
         s[d.status]++;
      }
      if (d.status === "present") {
        s.delay += d.delayMinutes || 0;
        s.hours += d.workHours || 0;
        if (d.isMissedCheckout) {
          s.missed_checkout++;
        }
      }
    });

    return s;
  }, [monthlyReport]);

  const months = Array.from({ length: 12 }, (_, i) => format(subMonths(new Date(), i), "yyyy-MM"));
  const loading = isAttendanceLoading || isEmployeesLoading || isRequestsLoading || isSettingsLoading;
  
  const handleShareWhatsApp = () => {
    const employee = employeesList.find(e => e.id === selectedEmployeeId);
    if (!employee) return;

    let message = `*تقرير الحضور الشهري*\n`;
    message += `*الشركة:* ${settingsData?.companyName || 'غير محدد'}\n`;
    message += `*الموظف:* ${employee.employeeName}\n`;
    message += `*عن شهر:* ${new Date(selectedMonth + "-02").toLocaleString("ar", { month: "long", year: "numeric" })}\n\n`;

    message += `*ملخص الأداء:*\n`;
    message += `  - أيام الحضور: ${summaryStats.present} يوم\n`;
    message += `  - أيام الغياب: ${summaryStats.absent} يوم\n`;
    message += `  - إجمالي التأخير: ${summaryStats.delay} دقيقة\n`;
    message += `  - متوسط ساعات العمل اليومي: ${(summaryStats.hours / (summaryStats.present || 1)).toFixed(2)} ساعة\n`;
    message += `  - أيام الإجازات: ${summaryStats.on_leave} يوم\n`;
    message += `  - أيام المأموريات: ${summaryStats.mission} يوم\n\n`;

    message += `*السجل اليومي:*\n`;
    monthlyReport.forEach(day => {
        const statusInfo = STATUS_CONFIG[day.status];
        message += `- *${day.date} (${day.dayName}):* ${statusInfo.text}`;
        if (day.status === 'present') {
            message += ` (حضور: ${day.checkIn}, انصراف: ${day.checkOut || 'لم يسجل'})`;
            if (day.delayMinutes && day.delayMinutes > 0) {
              message += ` - تأخير: ${day.delayMinutes} دقيقة`;
            }
        }
        message += `\n`;
    });

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  // ----------------------------------------------------------
  // Render
  // ----------------------------------------------------------

  return (
    <div className="space-y-6">

      <h2 className="text-3xl font-bold">تقرير الموظف الشهري</h2>

      {/* Filter Card */}
      <Card>
        <CardHeader>
          <CardTitle>فلترة التقرير</CardTitle>
          <CardDescription>اختر الموظف والشهر لعرض التقرير.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Employee Selector */}
          <div className="space-y-2">
            <Label>الموظف</Label>

            {isEmployeesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    {selectedEmployeeId
                      ? employeesList.find(e => e.id === selectedEmployeeId)?.employeeName
                      : "اختر موظف"}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>

                <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
                  <Command>
                    <CommandInput placeholder="ابحث عن موظف..." />
                    <CommandList>
                      <CommandEmpty>لا يوجد نتائج.</CommandEmpty>
                      <CommandGroup>
                        {employeesList.map(emp => (
                          <CommandItem key={emp.id} onSelect={() => setSelectedEmployeeId(emp.id)}>
                            {emp.employeeName}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Month Selector */}
          <div className="space-y-2">
            <Label>الشهر</Label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {months.map(m => (
                  <SelectItem key={m} value={m}>
                    {new Date(m + "-02").toLocaleString("ar", { month: "long", year: "numeric" })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle>أيام الحضور</CardTitle></CardHeader><CardContent>{summaryStats.present}</CardContent></Card>
        <Card><CardHeader><CardTitle>أيام الغياب</CardTitle></CardHeader><CardContent>{summaryStats.absent}</CardContent></Card>
        <Card><CardHeader><CardTitle>إجمالي التأخير</CardTitle></CardHeader><CardContent>{summaryStats.delay} دقيقة</CardContent></Card>
        <Card><CardHeader><CardTitle>متوسط الساعات</CardTitle></CardHeader><CardContent>{(summaryStats.hours / (summaryStats.present || 1)).toFixed(2)}</CardContent></Card>
      </div>

      {/* Daily Report */}
      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle>السجل اليومي</CardTitle>
          <Button variant="outline" onClick={handleShareWhatsApp} disabled={!selectedEmployeeId || loading}>
            <Share2 className="h-4 w-4 ml-2" />
            مشاركة عبر واتساب
          </Button>
        </CardHeader>
        <CardContent>
            {loading ? (
                <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                       <Skeleton key={i} className="h-24 w-full rounded-lg" />
                    ))}
                </div>
            ) : monthlyReport.length > 0 ? (
                <>
                {/* Desktop Table */}
                <div className="w-full overflow-auto border rounded-lg hidden md:block" >
                    <Table className="whitespace-nowrap">
                        <TableHeader>
                            <TableRow>
                                <TableHead>التاريخ</TableHead>
                                <TableHead>اليوم</TableHead>
                                <TableHead>الحالة</TableHead>
                                <TableHead>الدوام الرسمي</TableHead>
                                <TableHead>الحضور</TableHead>
                                <TableHead>الانصراف</TableHead>
                                <TableHead>التأخير (د)</TableHead>
                                <TableHead>ساعات العمل</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                             {monthlyReport.map(day => (
                                <TableRow key={day.date} className={cn(day.isMissedCheckout && 'border-l-4 border-orange-500')}>
                                    <TableCell>{day.date}</TableCell>
                                    <TableCell>{day.dayName}</TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS_CONFIG[day.status].badgeVariant}>
                                            {STATUS_CONFIG[day.status].text}
                                        </Badge>
                                        {day.notes && day.status !== 'on_leave' && <div className="text-xs text-muted-foreground mt-1">{day.notes}</div>}
                                        {day.isMissedCheckout && (
                                            <div className="flex items-center gap-1 mt-1 text-xs text-yellow-600">
                                               <AlertTriangle className="h-3 w-3" />
                                                <span>خصم عدم انصراف</span>
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {day.officialCheckInTime && day.officialCheckOutTime ? `${day.officialCheckInTime} - ${day.officialCheckOutTime}`: '-'}
                                    </TableCell>
                                    <TableCell>{day.checkIn || '-'}</TableCell>
                                    <TableCell>{day.checkOut || '-'}</TableCell>
                                    <TableCell className={cn(day.delayMinutes && day.delayMinutes > 0 ? "text-destructive font-bold" : "")}>
                                        {day.delayMinutes ?? '-'}
                                    </TableCell>
                                    <TableCell>{day.workHours ? day.workHours.toFixed(2) : '-'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {/* Mobile Cards */}
                <div className="space-y-4 md:hidden">
                    {monthlyReport.map(day => (
                        <Card key={day.date} className={cn(day.isMissedCheckout && 'border-orange-400')}>
                            <CardHeader className="p-3">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="font-bold">{day.date}</p>
                                        <p className="text-sm text-muted-foreground">{day.dayName}</p>
                                    </div>
                                     <Badge variant={STATUS_CONFIG[day.status].badgeVariant} className="text-sm">
                                        {STATUS_CONFIG[day.status].icon}
                                        <span className="mr-1">{STATUS_CONFIG[day.status].text}</span>
                                    </Badge>
                                </div>
                            </CardHeader>
                            {day.status === 'present' && (
                                <CardContent className="p-3 pt-0 text-sm space-y-2">
                                     <div className="grid grid-cols-2 gap-2 text-center border-t pt-2">
                                        <div>
                                            <p className="text-muted-foreground">الحضور</p>
                                            <p className="font-mono">{day.checkIn}</p>
                                        </div>
                                         <div>
                                            <p className="text-muted-foreground">الانصراف</p>
                                            <p className="font-mono">{day.checkOut}</p>
                                        </div>
                                     </div>
                                     <div className="grid grid-cols-2 gap-2 text-center border-t pt-2">
                                         <div>
                                            <p className="text-muted-foreground">التأخير</p>
                                            <p className={cn("font-mono font-bold", day.delayMinutes && day.delayMinutes > 0 ? "text-destructive" : "")}>
                                                {day.delayMinutes ?? 0} د
                                            </p>
                                        </div>
                                          <div>
                                            <p className="text-muted-foreground">ساعات العمل</p>
                                            <p className="font-mono font-bold">{day.workHours ? day.workHours.toFixed(2) : '-'}</p>
                                        </div>
                                     </div>
                                      {day.isMissedCheckout && (
                                        <div className="flex items-center gap-1 text-xs text-yellow-600">
                                            <AlertTriangle className="h-3 w-3" />
                                            <span>لم يتم تسجيل انصراف (يطبق خصم).</span>
                                        </div>
                                    )}
                                </CardContent>
                            )}
                            {(day.status === 'on_leave' || (day.notes && day.status !== 'present')) && (
                               <CardContent className="p-3 pt-0 text-sm">
                                <p className="text-muted-foreground text-center pt-2 border-t">{day.notes}</p>
                               </CardContent>
                            )}
                        </Card>
                    ))}
                </div>
                </>

            ) : (
                 <div className="text-center py-10 text-muted-foreground">
                    <p>لا توجد بيانات لهذا الموظف في الشهر المحدد.</p>
                </div>
            )}
        </CardContent>
      </Card>

    </div>
  );
}
