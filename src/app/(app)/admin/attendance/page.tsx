
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
import { Filter, Hourglass, MoreVertical, Trash2, Undo, CheckCircle, XCircle, Clock, MapPin, ChevronLeft, ChevronRight, AlertTriangle, Wallet, ChevronsUpDown, Check, LogOut, LogIn, PlusCircle, Calendar as CalendarIcon, Loader2, Zap, RotateCcw } from 'lucide-react';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, update, push, set, remove } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
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
  isMissedCheckout?: boolean;
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

interface GlobalSettings {
    workStartTime?: string;
    workEndTime?: string;
    locations?: GlobalSettingsLocation[];
    lateAllowance?: number;
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
  const [attendanceData, isAttendanceLoading] = useDbData<Record<string, any>>(attendanceRef);
  
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

        const status = record.status || 'present';
        const delayAction = record.delayAction || 'none';
        const delayMinutesFromDb = record.delayMinutes || 0;
        const overtimeMinutes = record.overtimeMinutes || 0;
        const overtimeStatus = record.overtimeStatus || 'pending';

        if (status === 'absent' || status === 'weekly_off' || status === 'on_leave') {
            const statusLabels: Record<string, string> = { absent: 'غائب', weekly_off: 'إجازة أسبوعية', on_leave: 'إجازة معتمدة' };
            return {
                ...record,
                id,
                employeeName: employee.employeeName,
                workHours: 0,
                delayMinutes: 0,
                checkIn: statusLabels[status] || 'غير محدد',
                checkOut: '-',
                status: status,
            } as AttendanceRecord;
        }

        let officialCheckIn = record.officialCheckInTime || (employee?.shiftConfiguration === 'custom' && employee.checkInTime) || settings?.workStartTime || '08:00';
        let officialCheckOut = record.officialCheckOutTime || (employee?.shiftConfiguration === 'custom' && employee.checkOutTime) || settings?.workEndTime || '16:00';
        
        const officialCheckInDate = new Date(`${record.date}T${officialCheckIn}:00`);
        const officialCheckOutDate = new Date(`${record.date}T${officialCheckOut}:00`);
        
        const [inH] = officialCheckIn.split(':').map(Number);
        const [outH] = officialCheckOut.split(':').map(Number);
        if (inH > outH) officialCheckOutDate.setDate(officialCheckOutDate.getDate() + 1);

        let workHours = 0;
        let isMissedCheckout = false;
        
        if (record.checkIn) {
            const checkInTime = new Date(record.checkIn);
            const effectiveIn = Math.max(checkInTime.getTime(), officialCheckInDate.getTime());
            
            if (record.checkOut) {
                const checkOutTime = new Date(record.checkOut);
                workHours = Math.max(0, checkOutTime.getTime() - effectiveIn);
            } else {
                const fourHoursAfterOfficial = addHours(officialCheckOutDate, 4);
                if (new Date() > fourHoursAfterOfficial) isMissedCheckout = true;
            }
        }
        
        if (overtimeStatus === 'approved' && overtimeMinutes > 0) {
            workHours += (overtimeMinutes * 60 * 1000);
        }
        
        return {
            ...record,
            id,
            employeeId: record.employeeId,
            employeeName: employee.employeeName,
            date: record.date,
            rawCheckIn: record.checkIn,
            checkIn: record.checkIn ? new Date(record.checkIn).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '-',
            rawCheckOut: record.checkOut,
            checkOut: record.checkOut ? new Date(record.checkOut).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'لم يسجل انصراف',
            workHours: workHours / (1000 * 60 * 60),
            delayMinutes: delayMinutesFromDb,
            originalDelayMinutes: record.originalDelayMinutes,
            delayAction: delayAction,
            status: status,
            officialCheckInTime: officialCheckIn,
            officialCheckOutTime: officialCheckOut,
            overtimeMinutes: overtimeMinutes,
            overtimeStatus: overtimeStatus,
            locationName: record.locationName,
            isMissedCheckout: isMissedCheckout,
        };
    }).filter((record): record is AttendanceRecord => record !== null);
  }, [attendanceData, employeesMap, settings]);

  const absentRecords = useMemo(() => {
    if (viewMode !== 'monthly' || !employeesData) return [];
    const monthStart = new Date(filters.date.getFullYear(), filters.date.getMonth(), 1);
    const monthEnd = new Date(filters.date.getFullYear(), filters.date.getMonth() + 1, 0);
    const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const virtualData: AttendanceRecord[] = [];
    const filteredEmployees = filters.employee === 'all' ? Array.from(employeesMap.values()) : [employeesMap.get(filters.employee)].filter(Boolean);
    
    filteredEmployees.forEach(emp => {
      if (!emp) return;
      const empDaysOff = emp.daysOff || (emp.dayOff ? [emp.dayOff] : []);
      const empAttendance = allAttendanceRecords.filter(rec => rec.employeeId === emp.id);
      
      monthDays.forEach(day => {
        if (empDaysOff.includes(getDay(day).toString())) return;
        const dayString = format(day, 'yyyy-MM-dd');
        if (!empAttendance.some(rec => rec.date === dayString)) {
          virtualData.push({
            id: `v-${emp.id}-${dayString}`, 
            employeeId: emp.id,
            employeeName: emp.employeeName,
            date: dayString,
            status: 'absent',
            checkIn: 'غائب',
            checkOut: '-',
            workHours: 0,
            delayMinutes: 0,
          } as AttendanceRecord);
        }
      });
    });
    return virtualData;
  }, [viewMode, filters.date, filters.employee, employeesData, allAttendanceRecords, employeesMap]);

  useEffect(() => {
    let data;
    if (viewMode === 'monthly') {
      data = [...allAttendanceRecords, ...absentRecords];
    } else { 
      const selectedDateStr = format(filters.date, 'yyyy-MM-dd');
      data = allAttendanceRecords.filter(d => d.date === selectedDateStr);
    }
    if (filters.employee !== 'all') data = data.filter(d => d.employeeId === filters.employee);
    
    setFilteredData(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  }, [allAttendanceRecords, filters, viewMode, absentRecords]);

  const handleFilterChange = (key: string, value: any) => setFilters((prev) => ({ ...prev, [key]: value }));
  const handleDateChange = (amount: number) => {
    const newDate = addDays(filters.date, amount);
    setFilters(prev => ({...prev, date: newDate}));
  };

  const handleAttendanceAction = async (recordId: string, action: 'forgive_delay' | 'mark_absent' | 'revert' | 'cancel_checkout' | 'set_weekly_off' | 'delete_record') => {
      if (!db) return;

      if (action === 'delete_record') { 
          if (recordId.startsWith('v-')) {
              toast({ title: 'لا يوجد سجل فعلي لحذفه' });
              return;
          }
          setRecordToDelete(recordId); 
          setIsDeleteDialogOpen(true); 
          return; 
      }

      const isVirtual = recordId.startsWith('v-');
      const originalRecord = allAttendanceRecords.find(r => r.id === recordId) || absentRecords.find(r => r.id === recordId);
      
      if (!originalRecord) return;

      let updates: any = {};
      let isNew = false;
      let finalPath = `attendance/${selectedMonth}/${recordId}`;

      if (isVirtual) {
          isNew = true;
          const parts = recordId.split('-');
          const empId = parts[1];
          const date = `${parts[2]}-${parts[3]}-${parts[4]}`;
          updates = { 
              employeeId: empId, 
              date, 
              employeeId_date: `${empId}_${date}`,
              status: action === 'set_weekly_off' ? 'weekly_off' : 'absent' 
          };
      } else {
          switch (action) {
              case 'forgive_delay':
                  updates = { 
                      delayMinutes: 0, 
                      originalDelayMinutes: originalRecord.originalDelayMinutes || originalRecord.delayMinutes, 
                      delayAction: 'forgiven' 
                  };
                  break;
              case 'mark_absent':
                  updates = { status: 'absent', delayAction: 'none' };
                  break;
              case 'set_weekly_off':
                  updates = { status: 'weekly_off', delayAction: 'none' };
                  break;
              case 'cancel_checkout':
                  updates = { checkOut: null, rawCheckOut: null };
                  break;
              case 'revert':
                  updates = { 
                      status: 'present', 
                      delayMinutes: originalRecord.originalDelayMinutes || originalRecord.delayMinutes || 0,
                      originalDelayMinutes: null,
                      delayAction: 'none',
                      overtimeMinutes: null,
                      overtimeStatus: null
                  };
                  break;
          }
      }

      try {
        if (isNew) {
            const newRef = push(ref(db, `attendance/${selectedMonth}`));
            await set(newRef, updates);
        } else {
            await update(ref(db, finalPath), updates);
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
      
      let checkInIso = null, checkOutIso = null, delayMinutes = 0;
      if (manualEntry.status === 'present') {
          const checkInDate = new Date(`${manualEntry.date}T${manualEntry.checkIn}`);
          let checkOutDate = new Date(`${manualEntry.date}T${manualEntry.checkOut}`);
          if (checkOutDate < checkInDate) checkOutDate = addDays(checkOutDate, 1);
          
          checkInIso = checkInDate.toISOString();
          checkOutIso = checkOutDate.toISOString();
          
          const officialStart = (employee?.shiftConfiguration === 'custom' && employee.checkInTime) || settings?.workStartTime || '08:00';
          const workStartToday = new Date(`${manualEntry.date}T${officialStart}`);
          if (checkInDate > workStartToday) delayMinutes = Math.floor((checkInDate.getTime() - workStartToday.getTime()) / 60000);
      }
      
      try {
          const mKey = manualEntry.date.slice(0, 7);
          await set(push(ref(db, `attendance/${mKey}`)), { 
              employeeId: manualEntry.employeeId, 
              date: manualEntry.date, 
              checkIn: checkInIso, 
              checkOut: checkOutIso, 
              status: manualEntry.status, 
              delayMinutes, 
              employeeId_date: `${manualEntry.employeeId}_${manualEntry.date}`,
              notes: 'إضافة يدوية' 
          });
          toast({ title: 'تمت الإضافة بنجاح' });
          setIsManualEntryOpen(false);
      } catch (error) { toast({ variant: 'destructive', title: 'فشل الإضافة' }); }
  };

  const handleOpenOvertimeDialog = (record: AttendanceRecord) => {
    setSelectedRecordForOvertime(record);
    let suggested = 0;
    if (record.rawCheckOut && record.officialCheckOutTime) {
      const actualOut = new Date(record.rawCheckOut).getTime();
      const [h, m] = record.officialCheckOutTime.split(':').map(Number);
      const offDate = new Date(record.rawCheckOut);
      offDate.setHours(h, m, 0, 0);
      if (actualOut > offDate.getTime()) suggested = Math.floor((actualOut - offDate.getTime()) / 60000);
    }
    setOvertimeInputValue(record.overtimeMinutes?.toString() || suggested.toString());
    setIsOvertimeDialogOpen(true);
  };

  const handleApproveOvertime = async () => {
    if (!db || !selectedRecordForOvertime) return;
    const mins = parseInt(overtimeInputValue, 10);
    try {
        await update(ref(db, `attendance/${selectedMonth}/${selectedRecordForOvertime.id}`), { overtimeMinutes: mins, overtimeStatus: 'approved' });
        toast({ title: 'تم اعتماد الإضافي' });
        setIsOvertimeDialogOpen(false);
    } catch (error) { toast({ variant: 'destructive', title: 'فشل الاعتماد' }); }
  };

  const renderActionMenu = (record: AttendanceRecord) => (
    <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
            {(record.status === 'present' || (!record.status && record.rawCheckIn)) && (
                <>
                    <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'forgive_delay')}>
                        <CheckCircle className="ml-2 h-4 w-4 text-green-500" /> 
                        تصفير التأخير (تجاوز)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleOpenOvertimeDialog(record)}>
                        <Clock className="ml-2 h-4 w-4 text-blue-500" /> 
                        احتساب وقت إضافي
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'cancel_checkout')} disabled={!record.rawCheckOut}>
                        <Undo className="ml-2 h-4 w-4 text-orange-500" /> 
                        إلغاء الانصراف
                    </DropdownMenuItem>
                </>
            )}
            <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'mark_absent')} disabled={record.status === 'absent'}>
                <XCircle className="ml-2 h-4 w-4 text-red-500" /> 
                احتساب اليوم غياب
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'set_weekly_off')} disabled={record.status === 'weekly_off'}>
                <CalendarIcon className="ml-2 h-4 w-4 text-blue-500" /> 
                احتساب كإجازة أسبوعية بديلة
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'revert')}>
                <RotateCcw className="ml-2 h-4 w-4 text-slate-500" /> 
                إلغاء كل الإجراءات
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleAttendanceAction(record.id, 'delete_record')} className="text-destructive font-bold">
                <Trash2 className="ml-2 h-4 w-4" /> 
                حذف السجل نهائياً
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
  );

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
        <CardHeader><CardTitle className="flex items-center gap-2"><Filter className="h-6 w-6" /> فلاتر العرض</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label className="text-sm">الموظف</Label>
               <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                        {filters.employee === 'all' ? 'كل الموظفين' : employeesMap.get(filters.employee)?.employeeName || 'اختر'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                        <CommandInput placeholder="ابحث..." />
                        <CommandList>
                            <CommandEmpty>لا يوجد.</CommandEmpty>
                            <CommandGroup>
                                <CommandItem onSelect={() => handleFilterChange('employee', 'all')}>الكل</CommandItem>
                                {employeesList.map((emp) => (
                                    <CommandItem key={emp.id} onSelect={() => handleFilterChange('employee', emp.id)}>{emp.employeeName}</CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
               <Label className="text-sm">{viewMode === 'daily' ? 'التاريخ' : 'الشهر'}</Label>
               {!isMounted ? <Skeleton className="h-10 w-full" /> : (
               <div className="flex items-center gap-2">
                 <Button variant="outline" size="icon" onClick={() => handleDateChange(viewMode === 'daily' ? 1 : 30)}><ChevronRight className="h-4 w-4" /></Button>
                 <Input type={viewMode === 'daily' ? 'date' : 'month'} value={format(filters.date, viewMode === 'daily' ? 'yyyy-MM-dd' : 'yyyy-MM')} onChange={e => handleFilterChange('date', new Date(e.target.value))} className="text-center" />
                 <Button variant="outline" size="icon" onClick={() => handleDateChange(viewMode === 'daily' ? -1 : -30)}><ChevronLeft className="h-4 w-4" /></Button>
               </div>
               )}
            </div>
            <div className="flex items-center space-x-2 space-x-reverse pt-2">
              <Switch id="monthly-view" checked={viewMode === 'monthly'} onCheckedChange={(c) => setViewMode(c ? 'monthly' : 'daily')} />
              <Label htmlFor="monthly-view">عرض شهري</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {!isMounted 
              ? 'جاري التحميل...' 
              : `سجلات ${viewMode === 'daily' ? `يوم ${format(filters.date, 'PPP', { locale: arEG })}` : `شهر ${format(filters.date, 'MMMM yyyy', { locale: arEG })}`}`
            }
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الموظف</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الحضور</TableHead>
                    <TableHead className="text-right">الانصراف</TableHead>
                    <TableHead className="text-left">الساعات</TableHead>
                    <TableHead className="text-left">التأخير</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!isLoading && filteredData.map((record) => (
                      <TableRow key={record.id} className={cn(record.status === 'absent' && 'bg-destructive/5', record.status === 'weekly_off' && 'bg-muted')}>
                        <TableCell className="text-right"><div>{record.employeeName}</div>{record.locationName && <div className="text-[10px] text-muted-foreground">{record.locationName}</div>}</TableCell>
                        <TableCell className="text-right text-xs">{new Date(record.date).toLocaleDateString('ar-EG')}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{record.checkIn}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{record.checkOut}</TableCell>
                        <TableCell className="text-left font-mono text-xs font-bold text-primary">
                            {record.workHours.toFixed(2)}
                            {record.overtimeStatus === 'approved' && <div className="text-[9px] text-green-600">(+{record.overtimeMinutes}د)</div>}
                        </TableCell>
                        <TableCell className={cn("text-left font-mono font-bold text-xs", record.delayMinutes > 0 && 'text-destructive')}>
                          {record.delayAction === 'forgiven' ? <span className="text-green-600">0 (تجاوز)</span> : record.delayMinutes}
                        </TableCell>
                        <TableCell className="text-center">{renderActionMenu(record)}</TableCell>
                      </TableRow>
                  ))}
                </TableBody>
            </Table>
          </div>
          
          <div className="md:hidden space-y-4">
              {!isLoading && filteredData.map(record => (
                  <Card key={record.id} className={cn("overflow-hidden border-2", record.status === 'absent' && 'bg-destructive/5 border-destructive/20')}>
                      <CardHeader className="p-4 bg-muted/30 border-b flex flex-row justify-between items-center">
                          <div className="flex flex-col">
                              <span className="font-bold text-sm">{record.employeeName}</span>
                              <span className="text-[10px] text-muted-foreground">{format(new Date(record.date), 'PPPP', {locale: arEG})}</span>
                          </div>
                          <div className="flex items-center gap-2">
                              <Badge variant={record.status === 'present' ? 'secondary' : record.status === 'absent' ? 'destructive' : 'outline'} className="text-[10px]">
                                {record.status === 'present' ? 'حاضر' : record.status === 'absent' ? 'غائب' : 'إجازة'}
                              </Badge>
                              {renderActionMenu(record)}
                          </div>
                      </CardHeader>
                      <CardContent className="p-4 grid grid-cols-2 gap-4 text-xs">
                          <div><p className="text-muted-foreground">الحضور: {record.checkIn}</p></div>
                          <div><p className="text-muted-foreground">الانصراف: {record.checkOut}</p></div>
                          <div className="border-t pt-2"><p className="font-bold text-primary">ساعات: {record.workHours.toFixed(2)}</p></div>
                          <div className="border-t pt-2">
                            <p className={cn("font-bold", record.delayMinutes > 0 && record.delayAction !== 'forgiven' && "text-destructive")}>
                                تأخير: {record.delayAction === 'forgiven' ? <span className="text-green-600">0 (تجاوز)</span> : `${record.delayMinutes}د`}
                            </p>
                          </div>
                      </CardContent>
                  </Card>
              ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isOvertimeDialogOpen} onOpenChange={setIsOvertimeDialogOpen}>
        <DialogContent><DialogHeader><DialogTitle>اعتماد وقت إضافي</DialogTitle></DialogHeader>
            <div className="py-4 space-y-4">
                <Label>عدد الدقائق المعتمدة</Label>
                <Input type="number" value={overtimeInputValue} onChange={(e) => setOvertimeInputValue(e.target.value)} />
            </div>
            <DialogFooter><Button onClick={handleApproveOvertime}>تأكيد</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isManualEntryOpen} onOpenChange={setIsManualEntryOpen}>
        <DialogContent>
            <DialogHeader><DialogTitle>إضافة سجل يدوي</DialogTitle></DialogHeader>
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
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>وقت الحضور</Label><Input type="time" value={manualEntry.checkIn} onChange={e => setManualEntry(prev => ({...prev, checkIn: e.target.value}))}/></div>
                    <div className="space-y-2"><Label>وقت الانصراف</Label><Input type="time" value={manualEntry.checkOut} onChange={e => setManualEntry(prev => ({...prev, checkOut: e.target.value}))}/></div>
                </div>
                <Button variant="secondary" className="w-full" onClick={() => {
                    const emp = employeesMap.get(manualEntry.employeeId);
                    if(emp) setManualEntry(prev => ({...prev, checkIn: emp.checkInTime || '08:00', checkOut: emp.checkOutTime || '16:00'}));
                }}><Zap className="h-4 w-4 ml-2" /> تعبئة الموعد الرسمي للموظف</Button>
            </div>
            <DialogFooter><Button onClick={handleAddManualEntry}>حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>حذف السجل</AlertDialogTitle><AlertDialogDescription>هل تريد حذف السجل نهائياً؟</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={confirmDeleteRecord} className="bg-destructive">حذف</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
