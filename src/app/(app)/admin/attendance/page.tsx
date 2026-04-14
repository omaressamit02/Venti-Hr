
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
import { Filter, Hourglass, MoreVertical, Trash2, Undo, CheckCircle, XCircle, Clock, MapPin, ChevronLeft, ChevronRight, AlertTriangle, Wallet, ChevronsUpDown, Check, LogOut, LogIn, PlusCircle, Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, update, push, set, remove } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TableCaption,
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
  const [filteredData, setFilteredData] = useState<AttendanceRecord[]>([]);
  const [filters, setFilters] = useState({
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

  // Manual Entry State
  const [manualEntry, setManualEntry] = useState({
      employeeId: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      checkIn: '08:00',
      checkOut: '16:00',
      status: 'present' as 'present' | 'absent' | 'weekly_off'
  });


  const db = useDb();
  const { toast } = useToast();
  
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
        if (!record || !record.date) {
            console.warn(`Skipping invalid attendance record with id: ${id}`, record);
            return null;
        }

        const employee = employeesMap.get(record.employeeId);
        
        if (!employee) {
            return null;
        }

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
                              settings?.workStartTime || '00:00';
        let officialCheckOut = record.officialCheckOutTime || 
                               (employee?.shiftConfiguration === 'custom' && employee.checkOutTime) || 
                               settings?.workEndTime || '23:59';
        
        const [officialCheckInHours, officialCheckInMinutes] = officialCheckIn.split(':').map(Number);
        const officialCheckInDate = new Date(record.checkIn);
        officialCheckInDate.setHours(officialCheckInHours, officialCheckInMinutes, 0, 0);

        const checkInTimestamp = new Date(record.checkIn).getTime();
        const effectiveCheckInTime = Math.max(checkInTimestamp, officialCheckInDate.getTime());
        
        let workHours = 0;
        let isMissedCheckout = false;
        let earlyLeaveMinutes = 0;
        let earlyLeaveDeductionValue = 0;
        
        const dailyRate = (employee.salary || 0) / (employee.workDaysPerMonth || 30);

        if (record.checkOut) {
            const checkOutTimestamp = new Date(record.checkOut).getTime();
            const [officialCheckOutHours, officialCheckOutMinutes] = officialCheckOut.split(':').map(Number);
            const officialCheckOutDate = new Date(record.checkIn); 
            officialCheckOutDate.setHours(officialCheckOutHours, officialCheckOutMinutes, 0, 0);
            
            if (officialCheckInHours > officialCheckOutHours) {
                officialCheckOutDate.setDate(officialCheckOutDate.getDate() + 1);
            }

            if (checkOutTimestamp < officialCheckOutDate.getTime()) {
                earlyLeaveMinutes = Math.floor((officialCheckOutDate.getTime() - checkOutTimestamp) / (1000 * 60));
                
                const earlyLeaveRulesRaw = settings?.earlyLeaveDeductionRules;
                const rules: DeductionRule[] = (Array.isArray(earlyLeaveRulesRaw)
                    ? earlyLeaveRulesRaw
                    : (earlyLeaveRulesRaw ? Object.values(earlyLeaveRulesRaw) as DeductionRule[] : [])
                );

                 if(rules.length > 0 && earlyLeaveMinutes > 0){
                    const applicableRule = rules.sort((a, b) => a.fromMinutes - b.fromMinutes).find((r: DeductionRule) => earlyLeaveMinutes >= r.fromMinutes && earlyLeaveMinutes <= r.toMinutes);
                    if (applicableRule) {
                        if (applicableRule.deductionType === 'day_deduction') {
                            earlyLeaveDeductionValue = dailyRate * applicableRule.deductionValue;
                        }
                    }
                }
            }
            
            const workDurationUntilOfficialEnd = officialCheckOutDate.getTime() - effectiveCheckInTime;
            const workDurationUntilActualEnd = checkOutTimestamp - effectiveCheckInTime;
            
            workHours = Math.min(workDurationUntilOfficialEnd, workDurationUntilActualEnd);

            if (record.overtimeStatus === 'approved' && record.overtimeMinutes) {
                const overtimeInMillis = record.overtimeMinutes * 60 * 1000;
                const actualOvertimeWorked = Math.max(0, checkOutTimestamp - officialCheckOutDate.getTime());
                const approvedOvertimeToAdd = Math.min(overtimeInMillis, actualOvertimeWorked);
                workHours += approvedOvertimeToAdd;
            }
        } else {
            const [hours, minutes] = officialCheckOut.split(':').map(Number);
            const officialCheckOutDate = new Date(record.checkIn);
            officialCheckOutDate.setHours(hours, minutes, 0, 0);

            if (officialCheckInHours > hours) {
                officialCheckOutDate.setDate(officialCheckOutDate.getDate() + 1);
            }

            const fourHoursAfterOfficial = addHours(officialCheckOutDate, 4);

            if (new Date() > fourHoursAfterOfficial) {
                isMissedCheckout = true;
            }
        }
        
        let delayDeductionValue = 0;
        let missedCheckoutDeductionValue = 0;

        if (isMissedCheckout && settings?.deductionForIncompleteRecord) {
          missedCheckoutDeductionValue = dailyRate * settings.deductionForIncompleteRecord;
        }

        if (record.delayMinutes && record.delayMinutes > (settings?.lateAllowance || 0) && settings?.deductionRules) {
            const deductionRulesRaw = settings?.deductionRules;
            const rules: DeductionRule[] = (Array.isArray(deductionRulesRaw)
                ? deductionRulesRaw
                : (deductionRulesRaw ? Object.values(deductionRulesRaw) as DeductionRule[] : [])
            );

            if (rules.length > 0) {
              const applicableRule = rules.sort((a,b) => a.fromMinutes - b.fromMinutes).find((r: DeductionRule) => record.delayMinutes >= r.fromMinutes && record.delayMinutes <= r.toMinutes);
              if (applicableRule) {
                if (applicableRule.deductionType === 'day_deduction') {
                  delayDeductionValue = dailyRate * applicableRule.deductionValue;
                }
              }
            }
        }
        
        return {
            id,
            employeeId: record.employeeId,
            employeeName: employee?.employeeName || 'غير معروف',
            date: new Date(record.date).toISOString().split('T')[0],
            rawCheckIn: record.checkIn,
            checkIn: new Date(record.checkIn).toLocaleTimeString('ar-EG'),
            rawCheckOut: record.checkOut,
            checkOut: record.checkOut ? new Date(record.checkOut).toLocaleTimeString('ar-EG') : 'لم يسجل انصراف',
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

    const filteredEmployees: Employee[] = filters.employee === 'all'
      ? Array.from(employeesMap.values())
      : [employeesMap.get(filters.employee)].filter((e): e is Employee => !!e);

    filteredEmployees.forEach(emp => {
      const empDaysOff = emp.daysOff || (emp.dayOff ? [emp.dayOff] : []);
      const empAttendance = allAttendanceRecords.filter(rec => rec.employeeId === emp.id);

      monthDays.forEach(day => {
        if (empDaysOff.includes(getDay(day).toString())) return;
        const dayString = format(day, 'yyyy-MM-dd');
        const hasRecord = empAttendance.some(rec => rec.date === dayString);
        if (!hasRecord) {
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
      if (monthlyFilter === 'absent') {
          data = absentRecords;
      }
    } else { // daily view
      const selectedDateStr = format(filters.date, 'yyyy-MM-dd');
      data = allAttendanceRecords.filter(d => d.date === selectedDateStr);
    }
    
    if (filters.employee !== 'all') {
      data = data.filter(d => d.employeeId === filters.employee);
    }
    
    if (filters.location !== 'all') {
        data = data.filter(d => d.locationId === filters.location);
    }
    
    if (showMissedCheckoutOnly) {
      data = data.filter(d => d.isMissedCheckout);
    }
    
    setFilteredData(data.sort((a, b) => new Date(b.rawCheckIn || b.date).getTime() - new Date(a.rawCheckIn || a.date).getTime()));
  }, [allAttendanceRecords, filters, viewMode, monthlyFilter, absentRecords, showMissedCheckoutOnly]);


  const handleFilterChange = (key: string, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };
  
  const handleDateChange = (amount: number) => {
    const newDate = addDays(filters.date, amount);
    if (viewMode === 'monthly' && newDate.getMonth() !== filters.date.getMonth()) {
      setFilters(prev => ({...prev, date: new Date(newDate.getFullYear(), newDate.getMonth(), 1)}));
    } else {
      setFilters(prev => ({...prev, date: newDate}));
    }
  };

  const handleAttendanceAction = async (recordId: string, action: 'forgive_delay' | 'mark_absent' | 'revert' | 'cancel_checkout' | 'set_weekly_off' | 'delete_record') => {
      if (!db) return;
      
      if (action === 'delete_record') {
          setRecordToDelete(recordId);
          setIsDeleteDialogOpen(true);
          return;
      }

      const originalRecord = allAttendanceRecords.find(r => r.id === recordId);
      const recordRef = ref(db, `attendance/${selectedMonth}/${recordId}`);

      let updates: any = {};

      if (action === 'forgive_delay' && originalRecord) {
          updates = {
              delayMinutes: 0,
              originalDelayMinutes: originalRecord.delayMinutes,
              delayAction: 'forgiven',
              status: 'present',
          };
      } else if (action === 'mark_absent') {
          updates = {
              status: 'absent',
              delayAction: 'none',
              checkIn: null,
              checkOut: null,
              delayMinutes: 0
          };
      } else if (action === 'set_weekly_off') {
          updates = {
              status: 'weekly_off',
              delayAction: 'none',
              checkIn: null,
              checkOut: null,
              delayMinutes: 0,
              originalDelayMinutes: 0
          };
      } else if (action === 'cancel_checkout') {
          updates = {
              checkOut: null,
              rawCheckOut: null,
              earlyLeaveMinutes: null,
              earlyLeaveDeductionValue: null,
          };
      } else if (action === 'revert' && originalRecord) {
          updates = {
              delayMinutes: originalRecord.originalDelayMinutes || originalRecord.delayMinutes,
              originalDelayMinutes: null,
              delayAction: 'none',
              status: 'present',
              overtimeMinutes: null,
              overtimeStatus: null,
          };
      }

      try {
        if (recordId.includes('-')) {
            // For virtual absent records, we need to create them
            const [empId, date] = recordId.split('-');
            const newRef = push(attendanceRef!);
            await set(newRef, {
                employeeId: empId,
                date: date,
                status: action === 'set_weekly_off' ? 'weekly_off' : 'absent',
                employeeId_date: `${empId}_${date}`
            });
        } else {
            await update(recordRef, updates);
        }
        toast({ title: 'تم تحديث السجل بنجاح' });
      } catch (error) {
          toast({ variant: 'destructive', title: 'فشل تحديث السجل' });
      }
  };

  const confirmDeleteRecord = async () => {
      if (!db || !recordToDelete) return;
      setIsDeleting(true);
      try {
          const recordRef = ref(db, `attendance/${selectedMonth}/${recordToDelete}`);
          await remove(recordRef);
          toast({ title: 'تم حذف السجل بنجاح' });
          setIsDeleteDialogOpen(false);
          setRecordToDelete(null);
      } catch (error) {
          toast({ variant: 'destructive', title: 'فشل حذف السجل' });
      } finally {
          setIsDeleting(false);
      }
  };

  const handleAddManualEntry = async () => {
      if (!db || !manualEntry.employeeId) {
          toast({ variant: 'destructive', title: 'بيانات ناقصة' });
          return;
      }

      // Check for duplicate: Prevent adding more than one record for same user on same day
      const alreadyExists = allAttendanceRecords.some(r => r.employeeId === manualEntry.employeeId && r.date === manualEntry.date && !r.id.includes('-'));
      if (alreadyExists) {
          toast({ variant: 'destructive', title: 'سجل مكرر', description: 'يوجد سجل لهذا الموظف في هذا اليوم بالفعل.' });
          return;
      }

      const monthKey = manualEntry.date.slice(0, 7);
      const employee = employeesMap.get(manualEntry.employeeId);
      
      let checkInIso = null;
      let checkOutIso = null;
      let delayMinutes = 0;

      if (manualEntry.status === 'present') {
          checkInIso = new Date(`${manualEntry.date}T${manualEntry.checkIn}`).toISOString();
          checkOutIso = new Date(`${manualEntry.date}T${manualEntry.checkOut}`).toISOString();
          
          const officialStart = (employee?.shiftConfiguration === 'custom' && employee.checkInTime) || settings?.workStartTime || '08:00';
          const workStartToday = new Date(`${manualEntry.date}T${officialStart}`);
          const actualStart = new Date(checkInIso);
          if (actualStart > workStartToday) {
              delayMinutes = Math.floor((actualStart.getTime() - workStartToday.getTime()) / 60000);
          }
      }

      try {
          const newRecordRef = push(ref(db, `attendance/${monthKey}`));
          await set(newRecordRef, {
              employeeId: manualEntry.employeeId,
              date: manualEntry.date,
              checkIn: checkInIso,
              checkOut: checkOutIso,
              status: manualEntry.status,
              delayMinutes,
              employeeId_date: `${manualEntry.employeeId}_${manualEntry.date}`,
              notes: 'إضافة يدوية من الإدارة'
          });
          toast({ title: 'تمت الإضافة اليدوية بنجاح' });
          setIsManualEntryOpen(false);
      } catch (error) {
          toast({ variant: 'destructive', title: 'فشل الإضافة' });
      }
  };

  const handleOpenOvertimeDialog = (record: AttendanceRecord) => {
    setSelectedRecordForOvertime(record);
    
    let suggestedOvertime = 0;
    if (record.rawCheckOut && record.officialCheckOutTime) {
      const checkOutTime = new Date(record.rawCheckOut).getTime();
      const [hours, minutes] = record.officialCheckOutTime.split(':').map(Number);
      const officialCheckOutDate = new Date(record.rawCheckOut);
      officialCheckOutDate.setHours(hours, minutes, 0, 0);
      const officialCheckOutTimestamp = officialCheckOutDate.getTime();
      
      if (checkOutTime > officialCheckOutTimestamp) {
        suggestedOvertime = Math.floor((checkOutTime - officialCheckOutTimestamp) / (1000 * 60));
      }
    }
    
    setOvertimeInputValue(record.overtimeMinutes?.toString() || suggestedOvertime.toString());
    setIsOvertimeDialogOpen(true);
  };

  const handleApproveOvertime = async () => {
    if (!db || !selectedRecordForOvertime) return;

    const minutes = parseInt(overtimeInputValue, 10);
    if (isNaN(minutes) || minutes < 0) {
      toast({ variant: 'destructive', title: 'قيمة غير صالحة', description: 'الرجاء إدخال عدد صحيح موجب للدقائق.' });
      return;
    }
    const recordRef = ref(db, `attendance/${selectedMonth}/${selectedRecordForOvertime.id}`);
    try {
        await update(recordRef, {
            overtimeMinutes: minutes,
            overtimeStatus: 'approved',
        });
        toast({ title: 'تم اعتماد الوقت الإضافي بنجاح' });
        setIsOvertimeDialogOpen(false);
        setSelectedRecordForOvertime(null);
        setOvertimeInputValue('');
    } catch (error) {
        toast({ variant: 'destructive', title: 'فشل اعتماد الوقت الإضافي' });
    }
  };

  const locationsList = useMemo(() => {
    if (!settings?.locations) return [];
    const locationsRaw = Array.isArray(settings.locations) ? settings.locations : Object.values(settings.locations);
    return locationsRaw.filter((loc): loc is GlobalSettingsLocation => !!(loc as any)?.id);
  }, [settings]);


  const totalHours = filteredData.reduce((acc, curr) => curr.status === 'present' ? acc + curr.workHours : acc, 0).toFixed(2);
  const totalDelayMinutes = filteredData.reduce((acc, curr) => curr.status === 'present' ? acc + curr.delayMinutes : acc, 0);

  const isLoading = isAttendanceLoading || isEmployeesLoading || isSettingsLoading;

  
  const openLocation = (employeeLocation?: Location, record?: AttendanceRecord) => {
    if (!employeeLocation || !record || !record.locationId) return;

    const allLocations: GlobalSettingsLocation[] = Array.isArray(settings?.locations) ? settings.locations : settings?.locations ? Object.values(settings.locations) : [];
    const branchLocation = allLocations.find(loc => loc.id === record.locationId);
    
    if (!branchLocation) {
        window.open(`https://www.google.com/maps/search/?api=1&query=${employeeLocation.lat},${employeeLocation.lon}`, '_blank');
        return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&origin=${branchLocation.lat},${branchLocation.lon}&destination=${employeeLocation.lat},${employeeLocation.lon}&travelmode=walking`;
    window.open(url, '_blank');
  };
  
    const formatCurrency = (amount: number) => {
      return (amount || 0).toLocaleString('ar', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
      });
  };

  const renderContent = () => {
    if (isLoading && filteredData.length === 0) {
      return Array.from({ length: 5 }).map((_, index) => (
        <Card key={index} className="md:hidden">
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/4" />
          </CardContent>
        </Card>
      ));
    }
    if (filteredData.length > 0) {
      return filteredData.map((record) => (
        <Card key={record.id} className={cn(
          record.status === 'absent' ? 'bg-destructive/10 border-destructive/30' : '',
          record.status === 'weekly_off' ? 'bg-muted border-muted-foreground/30' : '',
          record.isMissedCheckout ? 'border-2 border-orange-500' : ''
        )}>
          <CardContent className="p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
             <div className="font-semibold col-span-2 flex justify-between items-center">
                 <span>{record.employeeName}</span>
                 <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                         <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'forgive_delay')} disabled={record.status !== 'present'}>
                             <CheckCircle className="ml-2 h-4 w-4 text-green-500" /> تصفير التأخير (تجاوز)
                         </DropdownMenuItem>
                         <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'mark_absent')}>
                             <XCircle className="ml-2 h-4 w-4 text-red-500"/> احتساب اليوم غياب
                         </DropdownMenuItem>
                         <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'set_weekly_off')}>
                             <CalendarIcon className="ml-2 h-4 w-4 text-blue-500"/> احتساب كإجازة أسبوعية بديلة
                         </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenOvertimeDialog(record)} disabled={record.status !== 'present'}>
                             <Clock className="ml-2 h-4 w-4 text-blue-500" /> احتساب وقت إضافي
                         </DropdownMenuItem>
                         {record.checkOut !== 'لم يسجل انصراف' && record.status === 'present' && (
                             <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'cancel_checkout')}>
                                 <LogIn className="ml-2 h-4 w-4 text-orange-500" /> إلغاء تسجيل الانصراف
                             </DropdownMenuItem>
                         )}
                         <DropdownMenuSeparator />
                         <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'revert')} disabled={record.delayAction === 'none' && record.status === 'present' && !record.overtimeStatus}>
                             <Undo className="ml-2 h-4 w-4" /> إلغاء كل الإجراءات
                         </DropdownMenuItem>
                         <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'delete_record')} className="text-destructive focus:text-destructive">
                             <Trash2 className="ml-2 h-4 w-4" /> حذف السجل نهائياً
                         </DropdownMenuItem>
                    </DropdownMenuContent>
                 </DropdownMenu>
             </div>
             {record.locationName && (
                <div className="text-muted-foreground col-span-2 text-xs">من: {record.locationName}</div>
            )}
             {record.status !== 'present' && (
                 <div className="col-span-2">
                    <Badge variant={record.status === 'absent' ? 'destructive' : 'secondary'}>
                        {record.status === 'absent' ? 'تم احتسابه غياب' : record.status === 'weekly_off' ? 'إجازة أسبوعية' : 'إجازة'}
                    </Badge>
                 </div>
             )}
            <div>
              <div className="text-muted-foreground">التاريخ</div>
              <div>{new Date(record.date).toLocaleDateString('ar-EG')}</div>
            </div>
             <div>
              <div className="text-muted-foreground">ساعات العمل</div>
              <div className="font-mono">{record.workHours.toFixed(2)}</div>
            </div>
            {record.status === 'present' && (
                <>
                <div>
                <div className="text-muted-foreground">وقت الحضور</div>
                <div className="flex items-center gap-1">
                    {record.checkIn}
                    {record.checkInLocation && (
                        <div
                            className={cn("flex items-center gap-1 cursor-pointer", (record.checkInDistance && settings?.locationRadius && record.checkInDistance > settings.locationRadius) ? 'text-destructive' : 'text-primary')}
                            onClick={() => openLocation(record.checkInLocation, record)}
                        >
                            <MapPin className="h-3 w-3" />
                            {record.checkInDistance != null && <span className="text-xs">({record.checkInDistance.toFixed(0)}م)</span>}
                        </div>
                    )}
                </div>
                <div className="text-xs text-muted-foreground">الرسمي: {record.officialCheckInTime}</div>
                </div>
                <div>
                <div className="text-muted-foreground">وقت الانصراف</div>
                <div className="flex items-center gap-1">
                    {record.checkOut}
                    {record.checkOutLocation && (
                        <div
                            className={cn("flex items-center gap-1 cursor-pointer", (record.checkOutDistance && settings?.locationRadius && record.checkOutDistance > settings.locationRadius) ? 'text-destructive' : 'text-primary')}
                            onClick={() => openLocation(record.checkOutLocation, record)}
                        >
                            <MapPin className="h-3 w-3" />
                            {record.checkOutDistance != null && <span className="text-xs">({record.checkOutDistance.toFixed(0)}م)</span>}
                        </div>
                    )}
                </div>
                <div className="text-xs text-muted-foreground">الرسمي: {record.officialCheckOutTime}</div>
                </div>
                </>
            )}
            <div className="col-span-1">
                <div className="text-muted-foreground">التأخير</div>
                <div className={`font-mono font-bold ${record.delayMinutes > 0 ? 'text-destructive' : ''}`}>
                    {record.delayAction === 'forgiven' ? (
                        <>
                           <span className="line-through text-muted-foreground">{record.originalDelayMinutes}</span>
                           <span className="mr-2">0</span>
                           <Badge variant="secondary" className="mr-2">تم التجاوز</Badge>
                        </>
                    ) : record.delayMinutes}
                </div>
             </div>
              <div className="col-span-1">
                <div className="text-muted-foreground">انصراف مبكر</div>
                <div className={`font-mono font-bold ${(record.earlyLeaveMinutes || 0) > 0 ? 'text-orange-600' : ''}`}>
                    {record.earlyLeaveMinutes || 0}
                </div>
              </div>
             {record.status === 'present' && (
                 <div className="col-span-2 grid grid-cols-2 gap-x-4 border-t pt-2 mt-1">
                 <div className="col-span-1">
                      <div className="text-muted-foreground">خصم التأخير</div>
                      <div className="font-mono text-destructive text-xs">
                          { (record.delayDeductionValue || 0) > 0 ? `${formatCurrency(record.delayDeductionValue || 0)} ج.م` : '-'}
                      </div>
                  </div>
                 <div className="col-span-1">
                      <div className="text-muted-foreground">خصم مبكر</div>
                      <div className="font-mono text-orange-600 text-xs">
                          { (record.earlyLeaveDeductionValue || 0) > 0 ? `${formatCurrency(record.earlyLeaveDeductionValue || 0)} ج.م` : '-'}
                      </div>
                  </div>
             </div>
             )}
             {record.overtimeStatus === 'approved' && (
                <div className="col-span-2">
                    <div className="text-muted-foreground">وقت إضافي معتمد</div>
                    <div className="font-mono font-bold text-green-600">
                        {record.overtimeMinutes} دقيقة
                    </div>
                </div>
             )}
             {record.isMissedCheckout && (
                  <div className="col-span-2 mt-2 flex items-center justify-between p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-md text-yellow-800 dark:text-yellow-300">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-xs font-semibold">لم يتم تسجيل انصراف</span>
                      </div>
                      {(record.missedCheckoutDeductionValue || 0) > 0 && (
                          <div className="text-xs font-mono font-bold text-destructive/80">
                              خصم: {formatCurrency(record.missedCheckoutDeductionValue || 0)} ج.م
                          </div>
                      )}
                  </div>
              )}
          </CardContent>
        </Card>
      ));
    }
    return (
      <div className="text-center text-muted-foreground md:hidden h-24 flex items-center justify-center">
        {isLoading ? 'جاري تحميل السجلات...' : 'لا توجد سجلات لهذا اليوم.'}
      </div>
    );
  };


  return (
    <>
    <div className="space-y-6">
      <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold font-headline">مراقبة الحضور</h2>
          <Button onClick={() => setIsManualEntryOpen(true)}>
              <PlusCircle className="ml-2 h-4 w-4" />
              إضافة سجل يدوي
          </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-6 w-6" />
            فلترة السجلات
          </CardTitle>
        </CardHeader>
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
                                <CommandItem key="all" value="كل الموظفين" onSelect={() => handleFilterChange('employee', 'all')}>
                                    <Check className={cn("mr-2 h-4 w-4", filters.employee === 'all' ? "opacity-100" : "opacity-0")} />
                                    كل الموظفين
                                </CommandItem>
                                {employeesList.map((emp) => (
                                    <CommandItem key={emp.id} value={emp.employeeName} onSelect={() => handleFilterChange('employee', emp.id)}>
                                        <Check className={cn("mr-2 h-4 w-4", filters.employee === emp.id ? "opacity-100" : "opacity-0")}/>
                                        {emp.employeeName}
                                        <span className='text-xs text-muted-foreground mr-2 font-mono'>{emp.employeeCode}</span>
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
              <Select dir="rtl" value={filters.location} onValueChange={(value) => handleFilterChange('location', value)} disabled={isSettingsLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الفرع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع</SelectItem>
                  {locationsList.map((loc: GlobalSettingsLocation) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
               <Label className="text-sm font-medium">{viewMode === 'daily' ? 'التاريخ' : 'الشهر'}</Label>
               <div className="flex items-center gap-2">
                 <Button variant="outline" size="icon" onClick={() => handleDateChange(viewMode === 'daily' ? 1 : 30)}>
                    <ChevronRight className="h-4 w-4" />
                 </Button>
                 <Input 
                    type={viewMode === 'daily' ? 'date' : 'month'}
                    value={viewMode === 'daily' ? format(filters.date, 'yyyy-MM-dd') : format(filters.date, 'yyyy-MM')}
                    onChange={e => handleFilterChange('date', new Date(e.target.value))}
                    className="text-center"
                 />
                 <Button variant="outline" size="icon" onClick={() => handleDateChange(viewMode === 'daily' ? -1 : -30)}>
                    <ChevronLeft className="h-4 w-4" />
                 </Button>
               </div>
            </div>
            <div className="flex items-center space-x-2 space-x-reverse pt-2 lg:col-start-1">
              <Switch id="monthly-view" checked={viewMode === 'monthly'} onCheckedChange={(checked) => setViewMode(checked ? 'monthly' : 'daily')} />
              <Label htmlFor="monthly-view">عرض شهري</Label>
            </div>
             {viewMode === 'monthly' && (
              <div className="md:col-span-2 lg:col-span-1 space-y-2">
                <Label>فلترة خاصة بالشهر</Label>
                <Select dir="rtl" value={monthlyFilter} onValueChange={(v) => setMonthlyFilter(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">عرض الكل</SelectItem>
                    <SelectItem value="absent">غياب</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
             <div className="flex items-center space-x-2 space-x-reverse pt-2">
              <Checkbox id="missed-checkout" checked={showMissedCheckoutOnly} onCheckedChange={(checked) => setShowMissedCheckoutOnly(checked as boolean)} />
              <Label htmlFor="missed-checkout">عرض الحضور بدون انصراف فقط</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col md:flex-row items-center justify-between gap-4">
          <CardTitle>
             سجلات الحضور لـ{viewMode === 'daily' ? `يوم ${format(filters.date, 'PPP', { locale: arEG })}` : `شهر ${format(filters.date, 'MMMM yyyy', { locale: arEG })}`}
          </CardTitle>
           <div className="flex gap-4 md:gap-8 text-center">
               <div>
                  <p className="text-sm font-medium text-muted-foreground flex items-center justify-center gap-1"><Hourglass className="h-4 w-4"/> إجمالي التأخير</p>
                  <p className="text-2xl font-bold text-destructive">{totalDelayMinutes} <span className="text-base font-normal">دقيقة</span></p>
                </div>
               <div>
                  <p className="text-sm font-medium text-muted-foreground">إجمالي الساعات</p>
                  <p className="text-2xl font-bold">{totalHours} <span className="text-base font-normal">ساعة</span></p>
                </div>
           </div>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">اسم الموظف</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">وقت الحضور</TableHead>
                  <TableHead className="text-right">وقت الانصراف</TableHead>
                  <TableHead className="text-left">التأخير</TableHead>
                  <TableHead className="text-left">انصراف مبكر</TableHead>
                  <TableHead className="text-left">قيمة الخصم</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && filteredData.length === 0 && (
                   Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                    </TableRow>
                  ))
                )}
                {!isLoading && filteredData.length > 0 ? (
                  filteredData.map((record) => (
                    <TableRow key={record.id} className={cn(
                        record.status === 'absent' ? 'bg-destructive/10' : '',
                        record.status === 'weekly_off' ? 'bg-muted' : '',
                        record.isMissedCheckout ? 'border-orange-500' : ''
                    )}>
                      <TableCell className="text-right">
                        <div>{record.employeeName}</div>
                        {record.locationName && (
                            <div className="text-xs text-muted-foreground">من: {record.locationName}</div>
                        )}
                        {record.status !== 'present' && <Badge variant={record.status === 'absent' ? "destructive" : "secondary"}>
                            {record.status === 'absent' ? 'غياب' : record.status === 'weekly_off' ? 'إجازة أسبوعية' : 'إجازة'}
                        </Badge>}
                      </TableCell>
                      <TableCell className="text-right">{new Date(record.date).toLocaleDateString('ar-EG')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                             {record.checkInLocation && (
                                <div
                                    className={cn("flex items-center gap-1 cursor-pointer", (record.checkInDistance != null && settings?.locationRadius && record.checkInDistance > settings.locationRadius) ? 'text-destructive' : 'text-primary')}
                                    onClick={() => openLocation(record.checkInLocation, record)}
                                >
                                    <MapPin className="h-3 w-3" />
                                    {record.checkInDistance != null && <span className="text-xs">({record.checkInDistance.toFixed(0)}م)</span>}
                                </div>
                            )}
                            {record.checkIn}
                        </div>
                        {record.status === 'present' && <div className="text-xs text-muted-foreground text-right">الرسمي: {record.officialCheckInTime}</div>}
                      </TableCell>
                      <TableCell className="text-right">
                         <div className="flex items-center gap-1 justify-end">
                            {record.checkOutLocation && (
                                 <div
                                    className={cn("flex items-center gap-1 cursor-pointer", (record.checkOutDistance != null && settings?.locationRadius && record.checkOutDistance > settings.locationRadius) ? 'text-destructive' : 'text-primary')}
                                    onClick={() => openLocation(record.checkOutLocation, record)}
                                >
                                    <MapPin className="h-3 w-3" />
                                    {record.checkOutDistance != null && <span className="text-xs">({record.checkOutDistance.toFixed(0)}م)</span>}
                                </div>
                            )}
                            {record.isMissedCheckout ? <Badge variant="outline" className="border-yellow-500 text-yellow-600">{record.checkOut}</Badge> : record.checkOut}
                        </div>
                         {record.status === 'present' && <div className="text-xs text-muted-foreground text-right">الرسمي: {record.officialCheckOutTime}</div>}
                      </TableCell>
                       <TableCell className={`text-left font-mono font-bold ${record.delayMinutes > 0 ? 'text-destructive' : ''}`}>
                         {record.delayAction === 'forgiven' ? (
                            <>
                               <span className="line-through text-muted-foreground">{record.originalDelayMinutes}</span>
                               <span className="ml-2">0</span>
                            </>
                         ) : record.delayMinutes}
                       </TableCell>
                       <TableCell className={`text-left font-mono font-bold ${(record.earlyLeaveMinutes || 0) > 0 ? 'text-orange-600' : ''}`}>
                         {record.earlyLeaveMinutes || 0}
                       </TableCell>
                        <TableCell className="text-left font-mono text-destructive">
                           {(record.delayDeductionValue || 0) > 0 && 
                            <div className="text-xs" title="خصم تأخير">{formatCurrency(record.delayDeductionValue || 0)} ج.م</div>
                           }
                           {(record.earlyLeaveDeductionValue || 0) > 0 && 
                            <div className="text-xs text-orange-600" title="خصم انصراف مبكر">{formatCurrency(record.earlyLeaveDeductionValue || 0)} ج.م</div>
                           }
                           {(record.missedCheckoutDeductionValue || 0) > 0 && 
                            <div className="text-xs" title="خصم عدم انصراف">{formatCurrency(record.missedCheckoutDeductionValue || 0)} ج.م</div>
                           }
                           {!(record.delayDeductionValue || 0) && !(record.missedCheckoutDeductionValue || 0) && !(record.earlyLeaveDeductionValue || 0) && '-'}
                        </TableCell>
                      <TableCell className="text-center">
                          <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                   <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'forgive_delay')} disabled={record.status !== 'present'}>
                                       <CheckCircle className="ml-2 h-4 w-4 text-green-500" /> تصفير التأخير (تجاوز)
                                   </DropdownMenuItem>
                                   <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'mark_absent')}>
                                       <XCircle className="ml-2 h-4 w-4 text-red-500"/> احتساب اليوم غياب
                                   </DropdownMenuItem>
                                   <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'set_weekly_off')}>
                                       <CalendarIcon className="ml-2 h-4 w-4 text-blue-500"/> احتساب كإجازة أسبوعية بديلة
                                   </DropdownMenuItem>
                                   <DropdownMenuItem onClick={() => handleOpenOvertimeDialog(record)} disabled={record.status !== 'present'}>
                                     <Clock className="ml-2 h-4 w-4 text-blue-500" /> احتساب وقت إضافي
                                   </DropdownMenuItem>
                                   {record.checkOut !== 'لم يسجل انصراف' && record.status === 'present' && (
                                     <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'cancel_checkout')}>
                                         <LogIn className="ml-2 h-4 w-4 text-orange-500" /> إلغاء تسجيل الانصراف
                                     </DropdownMenuItem>
                                   )}
                                   <DropdownMenuSeparator />
                                   <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'revert')} disabled={record.delayAction === 'none' && record.status === 'present' && !record.overtimeStatus}>
                                       <Undo className="ml-2 h-4 w-4" /> إلغاء كل الإجراءات
                                   </DropdownMenuItem>
                                   <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'delete_record')} className="text-destructive focus:text-destructive">
                                       <Trash2 className="ml-2 h-4 w-4" /> حذف السجل نهائياً
                                   </DropdownMenuItem>
                              </DropdownMenuContent>
                          </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      {isLoading ? 'جاري تحميل السجلات...' : 'لا توجد سجلات لهذا اليوم.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-4 md:hidden">
            {renderContent()}
          </div>
        </CardContent>
      </Card>
    </div>
    
    <Dialog open={isOvertimeDialogOpen} onOpenChange={setIsOvertimeDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>اعتماد وقت إضافي</DialogTitle>
                <DialogDescription>
                    أدخل عدد الدقائق الإضافية التي توافق عليها للموظف "{selectedRecordForOvertime?.employeeName}" في تاريخ {new Date(selectedRecordForOvertime?.date || '').toLocaleDateString('ar-EG')}.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="overtime-minutes" className="text-right">
                    الدقائق
                </Label>
                <Input
                    id="overtime-minutes"
                    type="number"
                    value={overtimeInputValue}
                    onChange={(e) => setOvertimeInputValue(e.target.value)}
                    className="col-span-3"
                    min="0"
                />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsOvertimeDialogOpen(false)}>إلغاء</Button>
                <Button onClick={handleApproveOvertime}>موافقة واعتماد</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <Dialog open={isManualEntryOpen} onOpenChange={setIsManualEntryOpen}>
        <DialogContent className="max-w-md">
            <DialogHeader>
                <DialogTitle>إضافة سجل حضور يدوي</DialogTitle>
                <DialogDescription>أدخل بيانات الحضور للموظف يدوياً.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                    <Label>الموظف</Label>
                    <Select value={manualEntry.employeeId} onValueChange={(val) => setManualEntry(prev => ({...prev, employeeId: val}))}>
                        <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                        <SelectContent>
                            {employeesList.map((emp) => (
                                <SelectItem key={emp.id} value={emp.id}>{emp.employeeName}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>التاريخ</Label>
                    <Input type="date" value={manualEntry.date} onChange={e => setManualEntry(prev => ({...prev, date: e.target.value}))} />
                </div>
                <div className="space-y-2">
                    <Label>الحالة</Label>
                    <Select value={manualEntry.status} onValueChange={(val: any) => setManualEntry(prev => ({...prev, status: val}))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="present">حاضر</SelectItem>
                            <SelectItem value="absent">غائب</SelectItem>
                            <SelectItem value="weekly_off">إجازة أسبوعية</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {manualEntry.status === 'present' && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>وقت الحضور</Label>
                            <Input type="time" value={manualEntry.checkIn} onChange={e => setManualEntry(prev => ({...prev, checkIn: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                            <Label>وقت الانصراف</Label>
                            <Input type="time" value={manualEntry.checkOut} onChange={e => setManualEntry(prev => ({...prev, checkOut: e.target.value}))} />
                        </div>
                    </div>
                )}
            </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="outline">إلغاء</Button></DialogClose>
                <Button onClick={handleAddManualEntry}>حفظ السجل</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>تنبيه: هل أنت متأكد من الحذف؟</AlertDialogTitle>
                <AlertDialogDescription>
                    سيتم حذف سجل الحضور هذا نهائياً من النظام. لا يمكن التراجع عن هذا الإجراء.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setRecordToDelete(null)}>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteRecord} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isDeleting}>
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Trash2 className="h-4 w-4 ml-2" />}
                    تأكيد الحذف النهائي
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
