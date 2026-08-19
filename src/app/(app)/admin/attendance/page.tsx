
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Filter, Hourglass, MoreVertical, Trash2, Undo, CheckCircle, XCircle, Clock, MapPin, ChevronLeft, ChevronRight, AlertTriangle, Wallet, ChevronsUpDown, Check, LogOut, LogIn, PlusCircle, Calendar as CalendarIcon, Loader2, Zap } from 'lucide-react';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, update, push, set, remove } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TableCaption,
} from '@/components/ui/table';
import {
  TableBody as TableBodyUi,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { format, addDays, eachDayOfInterval, getDay, addHours, parseISO } from 'date-fns';
import { arEG } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList, CommandItem } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';


interface Location {
  id?: string;
  lat: number;
  lon: number;
}
interface AttendanceRecord {
  id: string;
  employeeName: string;
  employeeId: string;
  date: string;
  checkIn: string;
  rawCheckIn?: string;
  checkOut?: string;
  rawCheckOut?: string;
  workHours: number;
  delayMinutes: number;
  earlyLeaveMinutes?: number;
  originalDelayMinutes?: number;
  delayAction?: 'none' | 'forgiven';
  status?: 'present' | 'absent' | 'weekly_off' | 'on_leave';
  locationId?: string;
  locationName?: string;
  officialCheckInTime?: string;
  officialCheckOutTime?: string;
  overtimeMinutes?: number;
  overtimeStatus?: 'pending' | 'approved' | 'rejected';
  checkInLocation?: Location;
  checkOutLocation?: Location;
  checkInDistance?: number;
  checkOutDistance?: number;
  isMissedCheckout?: boolean;
  delayDeductionValue?: number;
  earlyLeaveDeductionValue?: number;
  missedCheckoutDeductionValue?: number;
}

interface Employee {
  id: string;
  employeeName: string;
  employeeCode: string;
  salary: number;
  workDaysPerMonth?: number;
  dayOff?: string;
  daysOff?: string[];
  shiftConfiguration?: 'general' | 'custom';
  checkInTime?: string;
  checkOutTime?: string;
}

interface GlobalSettingsLocation {
    id: string;
    name: string;
    lat: string;
    lon: string;
}

interface DeductionRule {
    id: string;
    fromMinutes: number;
    toMinutes: number;
    deductionType: 'day_deduction' | 'fixed_amount' | 'hour_deduction' | 'minute_deduction';
    deductionValue: number;
}

interface GlobalSettings {
    workStartTime?: string;
    workEndTime?: string;
    locationRadius?: number;
    locations?: GlobalSettingsLocation[];
    deductionForIncompleteRecord?: number;
    lateAllowance?: number;
    deductionRules?: DeductionRule[];
    earlyLeaveDeductionRules?: DeductionRule[];
}

export default function AttendancePage() {
  const [isMounted, setIsMounted] = useState(false);
  const [filteredData, setFilteredData] = useState<AttendanceRecord[]>([]);
  const [filters, setFilters] = useState<{employee: string, date: Date, location: string}>({
    employee: 'all',
    date: new Date(), 
    location: 'all',
  });
  const [isOvertimeDialogOpen, setIsOvertimeDialogOpen] = useState(false);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedRecordForOvertime, setSelectedRecordForOvertime] = useState<AttendanceRecord | null>(null);
  const [overtimeInputValue, setOvertimeInputValue] = useState('');
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [monthlyFilter, setMonthlyFilter] = useState<'all' | 'absent'>('all');
  const [showMissedCheckoutOnly, setShowMissedCheckoutOnly] = useState(false);

  const [manualEntry, setManualEntry] = useState({
      employeeId: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      checkIn: '08:00',
      checkOut: '16:00',
      status: 'present' as 'present' | 'absent' | 'weekly_off'
  });

  const db = useDb();
  const { toast } = useToast();

  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  const selectedMonth = format(filters.date, 'yyyy-MM');
  const attendanceRef = useMemoFirebase(() => db ? ref(db, `attendance/${selectedMonth}`) : null, [db, selectedMonth]);
  const [attendanceData, isAttendanceLoading] = useDbData<Record<string, Omit<AttendanceRecord, 'id' | 'rawCheckIn' | 'rawCheckOut'>>>(attendanceRef);
  
  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);

  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);

  const employeesMap = useMemo(() => {
    if (!employeesData) return new Map();
    return new Map(Object.entries(employeesData).map(([id, emp]) => [id, { ...emp, id }]));
  }, [employeesData]);

  const employeesList = useMemo(() => {
    if (!employeesMap.size) return [];
    return Array.from(employeesMap.values());
  }, [employeesMap]);

  const allAttendanceRecords = useMemo(() => {
    if (!attendanceData || !employeesMap.size) return [];
    
    return Object.entries(attendanceData).map(([id, record]): AttendanceRecord | null => {
        if (!record || !record.date) return null;

        const employee = employeesMap.get(record.employeeId);
        if (!employee) return null;

        if (record.status === 'absent' || record.status === 'weekly_off' || record.status === 'on_leave') {
            return {
                id,
                ...record,
                employeeName: employee.employeeName,
                workHours: 0,
                delayMinutes: 0,
                checkIn: record.status === 'absent' ? 'غياب' : record.status === 'weekly_off' ? 'إجازة أسبوعية' : 'إجازة معتمدة',
                checkOut: '-'
            } as AttendanceRecord;
        }

        let officialCheckIn = record.officialCheckInTime || 
                              (employee?.shiftConfiguration === 'custom' && employee.checkInTime) || 
                              settings?.workStartTime || '08:00';
        let officialCheckOut = record.officialCheckOutTime || 
                               (employee?.shiftConfiguration === 'custom' && employee.checkOutTime) || 
                               settings?.workEndTime || '16:00';
        
        const officialCheckInDate = new Date(`${record.date}T${officialCheckIn}:00`);
        const officialCheckOutDate = new Date(`${record.date}T${officialCheckOut}:00`);
        
        const [inH, inM] = officialCheckIn.split(':').map(Number);
        const [outH, outM] = officialCheckOut.split(':').map(Number);
        if (inH > outH) {
            officialCheckOutDate.setDate(officialCheckOutDate.getDate() + 1);
        }

        const checkInTimestamp = new Date(record.checkIn).getTime();
        const effectiveCheckInTime = Math.max(checkInTimestamp, officialCheckInDate.getTime());
        
        let workHours = 0;
        let isMissedCheckout = false;
        let earlyLeaveMinutes = 0;
        let earlyLeaveDeductionValue = 0;
        
        const dailyRate = (employee.salary || 0) / (employee.workDaysPerMonth || 30);

        if (record.checkOut) {
            const checkOutTimestamp = new Date(record.checkOut).getTime();
            const actualCheckOutDate = new Date(record.checkOut);
            const workDayDateObj = new Date(record.date);
            const isStrictlyNextDay = actualCheckOutDate.getFullYear() > workDayDateObj.getFullYear() || 
                                      (actualCheckOutDate.getFullYear() === workDayDateObj.getFullYear() && actualCheckOutDate.getMonth() > workDayDateObj.getMonth()) ||
                                      (actualCheckOutDate.getFullYear() === workDayDateObj.getFullYear() && actualCheckOutDate.getMonth() === workDayDateObj.getMonth() && actualCheckOutDate.getDate() > workDayDateObj.getDate());

            if (checkOutTimestamp < officialCheckOutDate.getTime() && !isStrictlyNextDay) {
                earlyLeaveMinutes = Math.floor((officialCheckOutDate.getTime() - checkOutTimestamp) / (1000 * 60));
                const earlyLeaveRulesRaw = settings?.earlyLeaveDeductionRules;
                const rules: DeductionRule[] = Array.isArray(earlyLeaveRulesRaw) ? earlyLeaveRulesRaw : (earlyLeaveRulesRaw ? Object.values(earlyLeaveRulesRaw) as DeductionRule[] : []);

                 if(rules.length > 0 && earlyLeaveMinutes > 0){
                    const applicableRule = rules.sort((a, b) => a.fromMinutes - b.fromMinutes).find((r: DeductionRule) => earlyLeaveMinutes >= r.fromMinutes && earlyLeaveMinutes <= r.toMinutes);
                    if (applicableRule && applicableRule.deductionType === 'day_deduction') {
                        earlyLeaveDeductionValue = dailyRate * applicableRule.deductionValue;
                    }
                }
            }
            const actualDuration = checkOutTimestamp - effectiveCheckInTime;
            workHours = Math.max(0, actualDuration);
        } else {
            const fourHoursAfterOfficial = addHours(officialCheckOutDate, 4);
            if (new Date() > fourHoursAfterOfficial) isMissedCheckout = true;
        }
        
        // BOOST: Add approved overtime minutes to work hours
        if (record.overtimeStatus === 'approved' && record.overtimeMinutes) {
            workHours += (record.overtimeMinutes * 60 * 1000);
        }

        let delayDeductionValue = 0;
        let missedCheckoutDeductionValue = 0;

        if (isMissedCheckout && settings?.deductionForIncompleteRecord) {
          missedCheckoutDeductionValue = dailyRate * settings.deductionForIncompleteRecord;
        }

        if (record.delayMinutes && record.delayMinutes > (settings?.lateAllowance || 0) && settings?.deductionRules && record.delayAction !== 'forgiven') {
            const deductionRulesRaw = settings?.deductionRules;
            const rules: DeductionRule[] = Array.isArray(deductionRulesRaw) ? deductionRulesRaw : (deductionRulesRaw ? Object.values(deductionRulesRaw) as DeductionRule[] : []);
            if (rules.length > 0) {
              const applicableRule = rules.sort((a,b) => a.fromMinutes - b.fromMinutes).find((r: DeductionRule) => record.delayMinutes >= r.fromMinutes && record.delayMinutes <= r.toMinutes);
              if (applicableRule && applicableRule.deductionType === 'day_deduction') delayDeductionValue = dailyRate * applicableRule.deductionValue;
            }
        }
        
        return {
            id,
            employeeId: record.employeeId,
            employeeName: employee?.employeeName || 'غير معروف',
            date: record.date,
            rawCheckIn: record.checkIn,
            checkIn: new Date(record.checkIn).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true }),
            rawCheckOut: record.checkOut,
            checkOut: record.checkOut ? new Date(record.checkOut).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'لم يسجل انصراف',
            workHours: (workHours > 0 ? workHours : 0) / (1000 * 60 * 60),
            delayMinutes: record.delayMinutes || 0,
            earlyLeaveMinutes: earlyLeaveMinutes,
            originalDelayMinutes: record.originalDelayMinutes,
            delayAction: record.delayAction || 'none',
            status: record.status || 'present',
            officialCheckInTime: officialCheckIn,
            officialCheckOutTime: officialCheckOut,
            overtimeMinutes: record.overtimeMinutes,
            overtimeStatus: record.overtimeStatus,
            locationId: record.locationId,
            checkInLocation: record.checkInLocation,
            checkOutLocation: record.checkOutLocation,
            checkInDistance: record.checkInDistance,
            checkOutDistance: record.checkOutDistance,
            locationName: record.locationName,
            isMissedCheckout: isMissedCheckout,
            delayDeductionValue,
            earlyLeaveDeductionValue,
            missedCheckoutDeductionValue,
        };
    }).filter((record): record is AttendanceRecord => record !== null);
  }, [attendanceData, employeesMap, settings]);

  const absentRecords = useMemo(() => {
    if (viewMode !== 'monthly' || monthlyFilter !== 'absent' || !employeesData) return [];
    const monthStart = new Date(filters.date.getFullYear(), filters.date.getMonth(), 1);
    const monthEnd = new Date(filters.date.getFullYear(), filters.date.getMonth() + 1, 0);
    const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const absentData: AttendanceRecord[] = [];
    const filteredEmployees: Employee[] = filters.employee === 'all' ? Array.from(employeesMap.values()) : [employeesMap.get(filters.employee)].filter((e): e is Employee => !!e);
    filteredEmployees.forEach(emp => {
      const empDaysOff = emp.daysOff || (emp.dayOff ? [emp.dayOff] : []);
      const empAttendance = allAttendanceRecords.filter(rec => rec.employeeId === emp.id);
      monthDays.forEach(day => {
        if (empDaysOff.includes(getDay(day).toString())) return;
        const dayString = format(day, 'yyyy-MM-dd');
        if (!empAttendance.some(rec => rec.date === dayString)) {
          absentData.push({
            id: `${emp.id}-${dayString}`,
            employeeId: emp.id,
            employeeName: emp.employeeName,
            date: dayString,
            status: 'absent',
            checkIn: 'غياب',
            checkOut: 'غياب',
            workHours: 0,
            delayMinutes: 0,
          });
        }
      });
    });
    return absentData;
  }, [viewMode, monthlyFilter, filters.date, filters.employee, employeesData, allAttendanceRecords, employeesMap]);

  useEffect(() => {
    let data;
    if (viewMode === 'monthly') {
      data = [...allAttendanceRecords];
      if (monthlyFilter === 'absent') data = absentRecords;
    } else { 
      const selectedDateStr = format(filters.date, 'yyyy-MM-dd');
      data = allAttendanceRecords.filter(d => d.date === selectedDateStr);
    }
    if (filters.employee !== 'all') data = data.filter(d => d.employeeId === filters.employee);
    if (filters.location !== 'all') data = data.filter(d => d.locationId === filters.location);
    if (showMissedCheckoutOnly) data = data.filter(d => d.isMissedCheckout);
    setFilteredData(data.sort((a, b) => new Date(b.rawCheckIn || b.date).getTime() - new Date(a.rawCheckIn || a.date).getTime()));
  }, [allAttendanceRecords, filters, viewMode, monthlyFilter, absentRecords, showMissedCheckoutOnly]);

  const handleFilterChange = (key: string, value: any) => setFilters((prev) => ({ ...prev, [key]: value }));
  const handleDateChange = (amount: number) => {
    const newDate = addDays(filters.date, amount);
    if (viewMode === 'monthly' && newDate.getMonth() !== filters.date.getMonth()) setFilters(prev => ({...prev, date: new Date(newDate.getFullYear(), newDate.getMonth(), 1)}));
    else setFilters(prev => ({...prev, date: newDate}));
  };

  const handleAttendanceAction = async (recordId: string, action: 'forgive_delay' | 'mark_absent' | 'revert' | 'cancel_checkout' | 'set_weekly_off' | 'delete_record') => {
      if (!db) return;
      if (action === 'delete_record') { setRecordToDelete(recordId); setIsDeleteDialogOpen(true); return; }
      const originalRecord = allAttendanceRecords.find(r => r.id === recordId);
      const recordRef = ref(db, `attendance/${selectedMonth}/${recordId}`);
      let updates: any = {};
      if (action === 'forgive_delay' && originalRecord) updates = { delayMinutes: 0, originalDelayMinutes: originalRecord.originalDelayMinutes || originalRecord.delayMinutes, delayAction: 'forgiven', status: 'present' };
      else if (action === 'mark_absent') updates = { status: 'absent', delayAction: 'none', checkIn: null, checkOut: null, delayMinutes: 0 };
      else if (action === 'set_weekly_off') updates = { status: 'weekly_off', delayAction: 'none', checkIn: null, checkOut: null, delayMinutes: 0, originalDelayMinutes: 0 };
      else if (action === 'cancel_checkout') updates = { checkOut: null, rawCheckOut: null, earlyLeaveMinutes: null, earlyLeaveDeductionValue: null };
      else if (action === 'revert' && originalRecord) updates = { delayMinutes: originalRecord.originalDelayMinutes || originalRecord.delayMinutes, originalDelayMinutes: null, delayAction: 'none', status: 'present', overtimeMinutes: null, overtimeStatus: null };
      try {
        if (recordId.includes('-')) {
            const [empId, date] = recordId.split('-');
            const newRef = push(attendanceRef!);
            await set(newRef, { employeeId: empId, date: date, status: action === 'set_weekly_off' ? 'weekly_off' : 'absent', employeeId_date: `${empId}_${date}` });
        } else await update(recordRef, updates);
        toast({ title: 'تم تحديث السجل بنجاح' });
      } catch (error) { toast({ variant: 'destructive', title: 'فشل تحديث السجل' }); }
  };

  const confirmDeleteRecord = async () => {
      if (!db || !recordToDelete) return;
      setIsDeleting(true);
      try {
          await remove(ref(db, `attendance/${selectedMonth}/${recordToDelete}`));
          toast({ title: 'تم حذف السجل بنجاح' });
          setIsDeleteDialogOpen(false);
          setRecordToDelete(null);
      } catch (error) { toast({ variant: 'destructive', title: 'فشل حذف السجل' }); }
      finally { setIsDeleting(false); }
  };

  const handleAddManualEntry = async () => {
      if (!db || !manualEntry.employeeId) { toast({ variant: 'destructive', title: 'بيانات ناقصة' }); return; }
      const employee = employeesMap.get(manualEntry.employeeId);
      let checkInDate = new Date(`${manualEntry.date}T${manualEntry.checkIn}`);
      let checkOutDate = new Date(`${manualEntry.date}T${manualEntry.checkOut}`);
      if (manualEntry.status === 'present' && checkOutDate < checkInDate) checkOutDate = addDays(checkOutDate, 1);
      let checkInIso = null, checkOutIso = null, delayMinutes = 0;
      if (manualEntry.status === 'present') {
          checkInIso = checkInDate.toISOString();
          checkOutIso = checkOutDate.toISOString();
          const officialStart = (employee?.shiftConfiguration === 'custom' && employee.checkInTime) || settings?.workStartTime || '08:00';
          const workStartToday = new Date(`${manualEntry.date}T${officialStart}`);
          if (checkInDate > workStartToday) delayMinutes = Math.floor((checkInDate.getTime() - workStartToday.getTime()) / 60000);
      }
      try {
          const monthKey = manualEntry.date.slice(0, 7);
          await set(push(ref(db, `attendance/${monthKey}`)), { employeeId: manualEntry.employeeId, date: manualEntry.date, checkIn: checkInIso, checkOut: checkOutIso, status: manualEntry.status, delayMinutes, employeeId_date: `${manualEntry.employeeId}_${manualEntry.date}`, notes: 'إضافة يدوية من الإدارة' });
          toast({ title: 'تمت الإضافة اليدوية بنجاح' });
          setIsManualEntryOpen(false);
      } catch (error) { toast({ variant: 'destructive', title: 'فشل الإضافة' }); }
  };

  const handleOpenOvertimeDialog = (record: AttendanceRecord) => {
    setSelectedRecordForOvertime(record);
    let suggestedOvertime = 0;
    if (record.rawCheckOut && record.officialCheckOutTime) {
      const checkOutTime = new Date(record.rawCheckOut).getTime();
      const [hours, minutes] = record.officialCheckOutTime.split(':').map(Number);
      const officialCheckOutDate = new Date(record.rawCheckOut);
      officialCheckOutDate.setHours(hours, minutes, 0, 0);
      if (checkOutTime > officialCheckOutDate.getTime()) suggestedOvertime = Math.floor((checkOutTime - officialCheckOutDate.getTime()) / 60000);
    }
    setOvertimeInputValue(record.overtimeMinutes?.toString() || suggestedOvertime.toString());
    setIsOvertimeDialogOpen(true);
  };

  const handleApproveOvertime = async () => {
    if (!db || !selectedRecordForOvertime) return;
    const minutes = parseInt(overtimeInputValue, 10);
    if (isNaN(minutes) || minutes < 0) { toast({ variant: 'destructive', title: 'قيمة غير صالحة' }); return; }
    try {
        await update(ref(db, `attendance/${selectedMonth}/${selectedRecordForOvertime.id}`), { overtimeMinutes: minutes, overtimeStatus: 'approved' });
        toast({ title: 'تم اعتماد الوقت الإضافي بنجاح' });
        setIsOvertimeDialogOpen(false);
        setSelectedRecordForOvertime(null);
    } catch (error) { toast({ variant: 'destructive', title: 'فشل اعتماد الوقت الإضافي' }); }
  };

  const locationsList = useMemo(() => {
    if (!settings?.locations) return [];
    const locationsRaw = Array.isArray(settings.locations) ? settings.locations : Object.values(settings.locations);
    return locationsRaw.filter((loc): loc is GlobalSettingsLocation => !!(loc as any)?.id);
  }, [settings]);

  const totalHours = filteredData.reduce((acc, curr) => curr.status === 'present' ? acc + curr.workHours : acc, 0).toFixed(2);
  const totalDelayMinutes = filteredData.reduce((acc, curr) => curr.status === 'present' ? acc + curr.delayMinutes : acc, 0);

  const manualEntryEmployee = manualEntry.employeeId ? employeesMap.get(manualEntry.employeeId) : null;
  const manualEntryDelay = useMemo(() => {
    if (manualEntry.status !== 'present' || !manualEntry.employeeId || !manualEntry.checkIn) return 0;
    const emp = employeesMap.get(manualEntry.employeeId);
    const officialStart = (emp?.shiftConfiguration === 'custom' && emp.checkInTime) || settings?.workStartTime || '08:00';
    const checkInDate = new Date(`${manualEntry.date}T${manualEntry.checkIn}`);
    const officialDate = new Date(`${manualEntry.date}T${officialStart}`);
    return checkInDate > officialDate ? Math.floor((checkInDate.getTime() - officialDate.getTime()) / 60000) : 0;
  }, [manualEntry, employeesMap, settings]);

  const isLoading = isAttendanceLoading || isEmployeesLoading || isSettingsLoading;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold font-headline">مراقبة الحضور</h2>
          <Button onClick={() => setIsManualEntryOpen(true)}>
              <PlusCircle className="ml-2 h-4 w-4" /> إضافة سجل يدوي
          </Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Filter className="h-6 w-6" /> فلترة السجلات</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label className="text-sm font-medium">الموظف</Label>
               <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between">
                        {filters.employee === 'all' ? 'كل الموظفين' : employeesMap.get(filters.employee)?.employeeName || 'اختر الموظف'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                        <CommandInput placeholder="ابحث عن موظف..." />
                        <CommandList>
                            <CommandEmpty>لم يتم العثور على موظف.</CommandEmpty>
                            <CommandGroup>
                                <CommandItem key="all" onSelect={() => handleFilterChange('employee', 'all')}>
                                    <Check className={cn("mr-2 h-4 w-4", filters.employee === 'all' ? "opacity-100" : "opacity-0")} /> كل الموظفين
                                </CommandItem>
                                {employeesList.map((emp) => (
                                    <CommandItem key={emp.id} onSelect={() => handleFilterChange('employee', emp.id)}>
                                        <Check className={cn("mr-2 h-4 w-4", filters.employee === emp.id ? "opacity-100" : "opacity-0")}/>
                                        {emp.employeeName}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">الفرع</Label>
              <Select dir="rtl" value={filters.location} onValueChange={(v) => handleFilterChange('location', v)}>
                <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                <SelectContent><SelectItem value="all">كل الفروع</SelectItem>{locationsList.map(loc => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
               <Label className="text-sm font-medium">{viewMode === 'daily' ? 'التاريخ' : 'الشهر'}</Label>
               <div className="flex items-center gap-2">
                 <Button variant="outline" size="icon" onClick={() => handleDateChange(viewMode === 'daily' ? 1 : 30)}><ChevronRight className="h-4 w-4" /></Button>
                 <Input type={viewMode === 'daily' ? 'date' : 'month'} value={!isMounted ? '' : viewMode === 'daily' ? format(filters.date, 'yyyy-MM-dd') : format(filters.date, 'yyyy-MM')} onChange={e => handleFilterChange('date', new Date(e.target.value))} className="text-center" />
                 <Button variant="outline" size="icon" onClick={() => handleDateChange(viewMode === 'daily' ? -1 : -30)}><ChevronLeft className="h-4 w-4" /></Button>
               </div>
            </div>
            <div className="flex items-center space-x-2 space-x-reverse pt-2">
              <Switch id="monthly-view" checked={viewMode === 'monthly'} onCheckedChange={(checked) => setViewMode(checked ? 'monthly' : 'daily')} />
              <Label htmlFor="monthly-view">عرض شهري</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col md:flex-row items-center justify-between gap-4">
          <CardTitle>سجلات الحضور لـ{!isMounted ? '...' : viewMode === 'daily' ? `يوم ${format(filters.date, 'PPP', { locale: arEG })}` : `شهر ${format(filters.date, 'MMMM yyyy', { locale: arEG })}`}</CardTitle>
           <div className="flex gap-4 md:gap-8 text-center">
               <div><p className="text-sm font-medium text-muted-foreground flex items-center justify-center gap-1"><Hourglass className="h-4 w-4"/> إجمالي التأخير</p><p className="text-2xl font-bold text-destructive">{totalDelayMinutes} <span className="text-base font-normal">دقيقة</span></p></div>
               <div><p className="text-sm font-medium text-muted-foreground">إجمالي الساعات</p><p className="text-2xl font-bold">{totalHours} <span className="text-base font-normal">ساعة</span></p></div>
           </div>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <div className="hidden md:block">
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الموظف</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الدوام الرسمي</TableHead>
                    <TableHead className="text-right">الحضور</TableHead>
                    <TableHead className="text-right">الانصراف</TableHead>
                    <TableHead className="text-left">ساعات العمل</TableHead>
                    <TableHead className="text-left">التأخير</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!isLoading && filteredData.map((record) => (
                      <TableRow key={record.id} className={cn(record.status === 'absent' ? 'bg-destructive/10' : '', record.status === 'weekly_off' ? 'bg-muted' : '', record.isMissedCheckout && 'border-orange-500')}>
                        <TableCell className="text-right"><div>{record.employeeName}</div>{record.locationName && <div className="text-[10px] text-muted-foreground">من: {record.locationName}</div>}</TableCell>
                        <TableCell className="text-right text-xs">{new Date(record.date).toLocaleDateString('ar-EG')}</TableCell>
                        <TableCell className="text-right text-[10px] font-mono text-muted-foreground">{record.officialCheckInTime} - {record.officialCheckOutTime}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{record.checkIn}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{record.checkOut}</TableCell>
                        <TableCell className="text-left font-mono font-bold text-primary text-xs">
                            {record.workHours.toFixed(2)}
                            {record.overtimeStatus === 'approved' && <div className="text-[9px] text-green-600">(+{record.overtimeMinutes}د إضافي)</div>}
                        </TableCell>
                        <TableCell className={cn("text-left font-mono font-bold text-xs", record.delayMinutes > 0 ? 'text-destructive' : '')}>
                          {record.delayAction === 'forgiven' ? <span>0 (متجاوز)</span> : record.delayMinutes}
                        </TableCell>
                        <TableCell className="text-center">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'forgive_delay')} disabled={record.status !== 'present'}><CheckCircle className="ml-2 h-4 w-4 text-green-500" /> تصفير التأخير</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleOpenOvertimeDialog(record)} disabled={record.status !== 'present'}><Clock className="ml-2 h-4 w-4 text-blue-500" /> اعتماد وقت إضافي</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'delete_record')} className="text-destructive"><Trash2 className="ml-2 h-4 w-4" /> حذف</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                      </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="md:hidden space-y-4 mt-4">
              {filteredData.map(record => (
                  <Card key={record.id} className={cn("overflow-hidden", record.status === 'absent' && 'bg-destructive/10 border-destructive/20', record.isMissedCheckout && 'border-orange-500')}>
                      <CardHeader className="p-4 bg-muted/30 border-b flex flex-row justify-between items-center">
                          <div className="flex flex-col">
                              <span className="font-bold text-sm">{record.employeeName}</span>
                              <span className="text-[10px] text-muted-foreground">{new Date(record.date).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
                          </div>
                          <div className="flex items-center gap-2">
                              <Badge variant={record.status === 'present' ? 'secondary' : 'destructive'} className="text-[10px]">
                                {record.status === 'present' ? 'حاضر' : record.status === 'absent' ? 'غائب' : 'إجازة'}
                              </Badge>
                               <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'forgive_delay')} disabled={record.status !== 'present'}><CheckCircle className="ml-2 h-4 w-4 text-green-500" /> تصفير</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleOpenOvertimeDialog(record)} disabled={record.status !== 'present'}><Clock className="ml-2 h-4 w-4 text-blue-500" /> إضافي</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'delete_record')} className="text-destructive"><Trash2 className="ml-2 h-4 w-4" /> حذف</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                      </CardHeader>
                      <CardContent className="p-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                          <div>
                              <p className="text-muted-foreground mb-1">الحضور:</p>
                              <p className="font-mono font-bold">{record.checkIn}</p>
                          </div>
                          <div>
                              <p className="text-muted-foreground mb-1">الانصراف:</p>
                              <p className="font-mono font-bold">{record.checkOut}</p>
                          </div>
                          <div className="border-t pt-2">
                              <p className="text-muted-foreground mb-1">ساعات العمل:</p>
                              <p className="font-bold text-primary">{record.workHours.toFixed(2)} {record.overtimeStatus === 'approved' && `(+${record.overtimeMinutes}د)`}</p>
                          </div>
                          <div className="border-t pt-2">
                              <p className="text-muted-foreground mb-1">التأخير:</p>
                              <p className={cn("font-bold", record.delayMinutes > 0 && "text-destructive")}>{record.delayAction === 'forgiven' ? '0 (تجاوز)' : `${record.delayMinutes} دقيقة`}</p>
                          </div>
                          {record.isMissedCheckout && (
                              <div className="col-span-2 flex items-center gap-1 text-orange-600 font-bold bg-orange-50 p-2 rounded">
                                  <AlertTriangle className="h-3 w-3" /> لم يسجل انصراف
                              </div>
                          )}
                      </CardContent>
                  </Card>
              ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isOvertimeDialogOpen} onOpenChange={setIsOvertimeDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>اعتماد وقت إضافي</DialogTitle></DialogHeader>
            <div className="py-4 space-y-4">
                <Label>عدد دقائق الوقت الإضافي المعتمدة</Label>
                <Input type="number" value={overtimeInputValue} onChange={(e) => setOvertimeInputValue(e.target.value)} />
                <p className="text-xs text-muted-foreground">سيتم إضافة هذه الدقائق إلى إجمالي ساعات العمل وموازنة التأخيرات في الراتب.</p>
            </div>
            <DialogFooter><Button onClick={handleApproveOvertime}>تأكيد و اعتماد</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isManualEntryOpen} onOpenChange={setIsManualEntryOpen}>
        <DialogContent>
            <DialogHeader><DialogTitle>إضافة سجل حضور يدوي</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label>الموظف</Label>
                    <Select value={manualEntry.employeeId} onValueChange={(v) => setManualEntry(prev => ({...prev, employeeId: v}))}>
                        <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                        <SelectContent>{employeesList.map(e => <SelectItem key={e.id} value={e.id}>{e.employeeName}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>تاريخ السجل</Label>
                    <Input type="date" value={manualEntry.date} onChange={e => setManualEntry(prev => ({...prev, date: e.target.value}))}/>
                </div>
                {manualEntryEmployee && (
                    <div className="p-3 bg-muted rounded-lg flex justify-between items-center text-xs">
                        <div>
                            <p className="text-muted-foreground">الموعد الرسمي:</p>
                            <p className="font-bold">{(manualEntryEmployee as any).checkInTime || '08:00'} - {(manualEntryEmployee as any).checkOutTime || '16:00'}</p>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => {
                            const e = manualEntryEmployee as any;
                            setManualEntry(prev => ({...prev, checkIn: e.checkInTime || '08:00', checkOut: e.checkOutTime || '16:00'}));
                        }}><Zap className="h-3 w-3 ml-1" /> بالموعد الرسمي</Button>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>وقت الحضور</Label><Input type="time" value={manualEntry.checkIn} onChange={e => setManualEntry(prev => ({...prev, checkIn: e.target.value}))}/></div>
                    <div className="space-y-2"><Label>وقت الانصراف</Label><Input type="time" value={manualEntry.checkOut} onChange={e => setManualEntry(prev => ({...prev, checkOut: e.target.value}))}/></div>
                </div>
                {manualEntry.checkIn && manualEntry.employeeId && (
                    <div className={cn("p-2 rounded-md text-center text-xs font-bold", manualEntryDelay > 0 ? "bg-destructive/10 text-destructive" : "bg-green-100 text-green-700")}>
                        {manualEntryDelay > 0 ? `تنبيه: يوجد تأخير ${manualEntryDelay} دقيقة سيتم احتسابه.` : "الحضور في الموعد / مبكر."}
                    </div>
                )}
            </div>
            <DialogFooter><Button onClick={handleAddManualEntry}>حفظ السجل</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>تأكيد الحذف</AlertDialogTitle><AlertDialogDescription>هل أنت متأكد من حذف هذا السجل نهائياً؟</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteRecord} className="bg-destructive">تأكيد الحذف</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
