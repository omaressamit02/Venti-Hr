'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PlusCircle, MoreVertical, HandCoins, MinusCircle, Edit, CheckCircle, ShieldAlert, XCircle, RotateCcw, Search, Upload, Download, Users, UserCog, Archive, Trash2, Clock, MapPin, BadgePercent, Wallet, Lock } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useDb, useDbData, useMemoFirebase, useUser } from '@/firebase';
import { ref, set, update, push, query, orderByChild, equalTo, get } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { EmployeeForm, type EmployeeFormData } from './employee-form';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { navItems } from '@/lib/nav-items';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import readXlsxFile from 'read-excel-file';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';


interface Employee {
  id: string;
  employeeName: string;
  employeeCode: string;
  phoneNumber?: string;
  gender: 'male' | 'female';
  birthDate?: string;
  salary: number;
  shiftConfiguration: 'general' | 'custom';
  checkInTime?: string;
  checkOutTime?: string;
  permissions: string[];
  userStatus: 'Active' | 'Inactive' | 'Pending' | 'Archived';
  password?: string;
  deviceId?: string;
  locationIds?: string[];
  dayOff?: string;
  managerId?: string;
  disableDeductions?: boolean;
  locationLoginRequired?: boolean;
}

type Location = {
  id: string;
  name: string;
};

interface FixedDeduction {
    id: string;
    name: string;
    type: 'fixed' | 'percentage';
    value: number;
    transactionType: 'deduction' | 'addition';
}

interface DeductionRule {
    id: string;
    fromMinutes: number;
    toMinutes: number;
    deductionType: 'day_deduction' | 'fixed_amount' | 'hour_deduction' | 'minute_deduction';
    deductionValue: number;
}


type GlobalSettings = {
    locations: Location[];
    fixedDeductions?: FixedDeduction[];
    deductionRules?: DeductionRule[];
    lateAllowance?: number;
    lateAllowanceScope?: 'daily' | 'monthly';
    workStartTime?: string;
    workEndTime?: string;
};

type FinancialTransaction = {
    id: string;
    type: 'bonus' | 'penalty' | 'loan' | 'salary_advance';
    amount: number;
    date: string;
    installments?: number;
    status?: 'active' | 'paid';
    paidAmount?: number;
};

type AttendanceRecord = {
  employeeId: string;
  delayMinutes?: number;
};

type FinancialAction = 'bonus' | 'penalty' | 'loan' | 'salary_advance';
type UserStatus = 'Active' | 'Inactive' | 'Pending' | 'Archived';
type UploadResult = {
    employeeName: string;
    employeeCode: string;
    status: 'success' | 'error';
    message: string;
}

const permissionNavItems = navItems.filter(item => !item.superAdminOnly);

interface MonthlySummary {
    totalAdvances: number;
    totalFixedDeductions: number;
    totalDelayDeductions: number;
    remainingSalary: number;
}


export default function EmployeesPage() {
  const [isClient, setIsClient] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isActionFormOpen, setIsActionFormOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [actionType, setActionType] = useState<FinancialAction | null>(null);
  const [actionAmount, setActionAmount] = useState('');
  const [actionDays, setActionDays] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [loanInstallments, setLoanInstallments] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [isBulkManagerDialogOpen, setIsBulkManagerDialogOpen] = useState(false);
  const [isBulkPermissionsDialogOpen, setIsBulkPermissionsDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isBulkShiftDialogOpen, setIsBulkShiftDialogOpen] = useState(false);
  const [isBulkLocationDialogOpen, setIsBulkLocationDialogOpen] = useState(false);
  const [isBulkStatusDialogOpen, setIsBulkStatusDialogOpen] = useState(false);
  const [bulkManagerId, setBulkManagerId] = useState<string | undefined>('');
  const [bulkPermissions, setBulkPermissions] = useState<string[]>([]);
  const [bulkCheckInTime, setBulkCheckInTime] = useState('');
  const [bulkCheckOutTime, setBulkCheckOutTime] = useState('');
  const [bulkLocationIds, setBulkLocationIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<UserStatus>('Active');
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);


  const db = useDb();
  const { toast } = useToast();
  const { user } = useUser();

  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isLoading] = useDbData<Record<string, Omit<Employee, 'id'>>>(employeesRef);
  
  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings] = useDbData<GlobalSettings>(settingsRef);
  
  const allEmployees: Employee[] = useMemo(() => {
    if (!employeesData) return [];
    return Object.entries(employeesData).map(([id, data]) => ({ ...data, id: id }));
  }, [employeesData]);
  
  const filteredEmployees = useMemo(() => {
    return allEmployees.filter(emp => {
      const matchesSearch = searchTerm ? 
        emp.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.phoneNumber && emp.phoneNumber.includes(searchTerm))
        : true;
      const matchesLocation = selectedLocation === 'all' ? true : (emp.locationIds || []).includes(selectedLocation);
      return matchesSearch && matchesLocation;
    });
  }, [allEmployees, searchTerm, selectedLocation]);

  const employeesListForManager = useMemo(() => {
    if (!employeesData) return [];
    return Object.entries(employeesData)
        .map(([id, data]) => ({ value: id, label: data.employeeName }));
  }, [employeesData]);
  
  const employeesMap = useMemo(() => {
      if (!employeesData) return new Map();
      return new Map(Object.entries(employeesData).map(([id, emp]) => [id, emp.employeeName]));
  }, [employeesData]);
  
  const employeeCodeSet = useMemo(() => {
      if (!employeesData) return new Set();
      return new Set(Object.values(employeesData).map(emp => emp.employeeCode));
  }, [employeesData]);

  const locationsMap = useMemo(() => {
    if (!settings?.locations) return new Map();
    const locationsRaw = Array.isArray(settings.locations) ? settings.locations : Object.values(settings.locations);
    if (!Array.isArray(locationsRaw)) return new Map();
    const locationsArray: Location[] = locationsRaw.filter((loc): loc is Location => typeof loc === 'object' && loc !== null && 'id' in loc && 'name' in loc);
    return new Map(locationsArray.map((loc: Location) => [loc.id, loc.name]));
  }, [settings]);

  const locationsList = Array.from(locationsMap.entries()).map(([id, name]) => ({ id, name }));
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const seedDatabase = async () => {
        if (db && user && !isLoading && allEmployees && allEmployees.length === 0) {
            const defaultEmployeeRef = ref(db, `employees/${user.uid}`);
            const defaultEmployee = {
                employeeName: 'المدير العام',
                employeeCode: 'ADMIN',
                phoneNumber: '01000000000',
                gender: 'male',
                salary: 10000,
                shiftConfiguration: 'general' as 'general' | 'custom',
                permissions: navItems.map(item => item.href),
                userStatus: 'Active' as 'Active',
                dayOff: '5',
            };
            await set(defaultEmployeeRef, defaultEmployee);
            toast({
                title: 'تم إنشاء موظف افتراضي',
                description: 'تم إضافة "المدير العام" لتمكينك من بدء استخدام النظام.',
            });
        }
    };
    seedDatabase();
  }, [db, user, isLoading, allEmployees, toast]);


  const handleSaveEmployee = async (formData: EmployeeFormData) => {
    if (!db) {
      toast({
        variant: 'destructive',
        title: 'خطأ في قاعدة البيانات',
        description: 'لا يمكن الاتصال بقاعدة البيانات.',
      });
      return;
    }
    
    if (employeeCodeSet.has(formData.employeeCode)) {
         toast({
            variant: 'destructive',
            title: 'كود موظف مكرر',
            description: `الكود ${formData.employeeCode} مستخدم بالفعل.`,
        });
        return;
    }

    try {
      const newEmployeeRef = push(ref(db, 'employees'));
      
      const newEmployeeData: Omit<Employee, 'id'> = {
        employeeName: formData.employeeName,
        employeeCode: formData.employeeCode,
        phoneNumber: formData.phoneNumber,
        gender: formData.gender,
        birthDate: formData.birthDate,
        salary: formData.salary,
        password: formData.password,
        shiftConfiguration: formData.shiftConfiguration,
        checkInTime: formData.checkInTime,
        checkOutTime: formData.checkOutTime,
        permissions: formData.permissions,
        locationIds: formData.locationIds || [],
        dayOff: formData.dayOff,
        managerId: formData.managerId,
        userStatus: 'Active',
        disableDeductions: formData.disableDeductions,
        locationLoginRequired: formData.locationLoginRequired,
      };
      
      await set(newEmployeeRef, newEmployeeData);

      toast({
        title: 'تم الحفظ بنجاح',
        description: `تمت إضافة الموظف ${formData.employeeName} إلى النظام.`,
      });
      setIsFormOpen(false);
    } catch (error: any) {
      console.error("Error saving employee:", error);
      let description = 'لم نتمكن من حفظ بيانات الموظف.';
      
      toast({
        variant: 'destructive',
        title: 'خطأ في الحفظ',
        description: description,
      });
    }
  };

  const handleUpdateEmployee = async (formData: EmployeeFormData) => {
    if (!db || !editingEmployee) return;

    try {
      const employeeRef = ref(db, `employees/${editingEmployee.id}`);
      
      const updatedData: Partial<Employee> = {
        employeeName: formData.employeeName,
        employeeCode: formData.employeeCode,
        phoneNumber: formData.phoneNumber,
        gender: formData.gender,
        birthDate: formData.birthDate,
        salary: formData.salary,
        shiftConfiguration: formData.shiftConfiguration,
        checkInTime: formData.checkInTime,
        checkOutTime: formData.checkOutTime,
        permissions: formData.permissions,
        locationIds: formData.locationIds || [],
        dayOff: formData.dayOff,
        managerId: formData.managerId,
        disableDeductions: formData.disableDeductions,
        locationLoginRequired: formData.locationLoginRequired,
        ...(formData.password && { password: formData.password }),
      };
      
      await update(employeeRef, updatedData);
      
      toast({
        title: 'تم التحديث بنجاح',
        description: `تم تحديث بيانات الموظف ${formData.employeeName}.`,
      });
      setIsEditFormOpen(false);
      setEditingEmployee(null);

    } catch (error: any) {
        console.error("Error updating employee:", error);
        toast({
            variant: 'destructive',
            title: 'خطأ في التحديث',
            description: 'لم نتمكن من تحديث بيانات الموظف.',
        });
    }
  };
  
  const handleChangeUserStatus = async (employeeId: string, status: UserStatus) => {
     if (!db) return;
     try {
        const employeeRef = ref(db, `employees/${employeeId}`);
        await update(employeeRef, { userStatus: status });
        toast({
            title: 'تم تحديث الحالة',
            description: `تم تغيير حالة الموظف بنجاح.`,
        });
     } catch (error) {
        toast({
            variant: 'destructive',
            title: 'خطأ',
            description: 'فشل تحديث حالة الموظف.',
        });
     }
  };

  const handleResetDeviceId = async (employeeId: string) => {
    if (!db) return;
    try {
        const employeeRef = ref(db, `employees/${employeeId}`);
        await update(employeeRef, { deviceId: null });
        toast({
            title: 'تم إعادة التعيين',
            description: 'سيتم تسجيل جهاز جديد عند الدخول القادم للموظف.',
        });
    } catch (error) {
        toast({
            variant: 'destructive',
            title: 'خطأ',
            description: 'فشل إعادة تعيين معرّف الجهاز.',
        });
    }
  };

  const handleOpenEditDialog = (employee: Employee) => {
    setEditingEmployee(employee);
    setIsEditFormOpen(true);
  };

  const handleOpenActionDialog = async (employee: Employee, type: FinancialAction) => {
    setSelectedEmployee(employee);
    setActionType(type);
    setActionAmount('');
    setActionNotes('');
    setActionDays('');
    setLoanInstallments(1);
    setMonthlySummary(null);

    if (type === 'salary_advance' && db) {
        const monthKey = format(new Date(), 'yyyy-MM');
        
        // 1. Fetch Advances
        const transactionsRef = ref(db, `financial_transactions/${employee.id}/${monthKey}`);
        const txSnapshot = await get(transactionsRef);
        let totalAdvances = 0;
        if (txSnapshot.exists()) {
            const monthlyTxs = txSnapshot.val() as Record<string, FinancialTransaction>;
            totalAdvances = Object.values(monthlyTxs)
                .filter(tx => tx.type === 'salary_advance')
                .reduce((acc, tx) => acc + tx.amount, 0);
        }

        // 2. Fetch Fixed Deductions
        let totalFixedDeductions = 0;
        const fixedDeductionRules: FixedDeduction[] = Array.isArray(settings?.fixedDeductions)
          ? settings.fixedDeductions
          : settings?.fixedDeductions ? Object.values(settings.fixedDeductions) : [];

        if(fixedDeductionRules.length > 0) {
            totalFixedDeductions = fixedDeductionRules
                .filter(rule => rule.transactionType === 'deduction')
                .reduce((acc, rule) => {
                    if (rule.type === 'fixed') return acc + rule.value;
                    if (rule.type === 'percentage') return acc + (employee.salary / 100) * rule.value;
                    return acc;
                }, 0);
        }

        // 3. Fetch Attendance and Calculate Delay Deductions
        const attendanceRef = ref(db, `attendance/${monthKey}`);
        const attendanceSnapshot = await get(attendanceRef);
        let totalDelayDeductions = 0;
        if (attendanceSnapshot.exists()) {
            const employeeAttendance = Object.values(attendanceSnapshot.val() as Record<string, AttendanceRecord>)
                .filter(att => att.employeeId === employee.id);
            
            const totalDelayMinutes = employeeAttendance.reduce((acc, curr) => acc + (curr.delayMinutes || 0), 0);

            const deductionRulesRaw = settings?.deductionRules;
            const deductionRules: DeductionRule[] = (Array.isArray(deductionRulesRaw)
                ? deductionRulesRaw
                : (deductionRulesRaw ? Object.values(deductionRulesRaw).filter((r): r is DeductionRule => !!(r as any)?.id) : [])
            ).sort((a, b) => a.fromMinutes - b.fromMinutes);
            
            const lateAllowance = settings?.lateAllowanceScope === 'monthly' ? (settings?.lateAllowance || 0) : 0;
            const chargeableDelayMinutes = Math.max(0, totalDelayMinutes - lateAllowance);

            if (chargeableDelayMinutes > 0 && deductionRules.length > 0) {
                const dailyRate = (employee.salary || 0) / 30;
                 const workHoursPerDay = settings?.workStartTime && settings.workEndTime 
                    ? (new Date(`1970-01-01T${settings.workEndTime}`).getTime() - new Date(`1970-01-01T${settings.workStartTime}`).getTime()) / (1000 * 60 * 60)
                    : 8;
                const hourlyRate = dailyRate / workHoursPerDay;
                const minuteRate = hourlyRate / 60;
                
                const applicableRule = deductionRules.find(rule => chargeableDelayMinutes >= rule.fromMinutes && chargeableDelayMinutes <= rule.toMinutes);
                
                if (applicableRule) {
                    if (applicableRule.deductionType === 'fixed_amount') {
                        totalDelayDeductions = applicableRule.deductionValue;
                    } else if (applicableRule.deductionType === 'day_deduction') {
                        totalDelayDeductions = dailyRate * applicableRule.deductionValue;
                    } else if (applicableRule.deductionType === 'hour_deduction') {
                         totalDelayDeductions = hourlyRate * applicableRule.deductionValue;
                    } else if (applicableRule.deductionType === 'minute_deduction') {
                        totalDelayDeductions = minuteRate * applicableRule.deductionValue;
                    }
                }
            }
        }
        
        const remainingSalary = employee.salary - totalAdvances - totalFixedDeductions - totalDelayDeductions;
        setMonthlySummary({ totalAdvances, totalFixedDeductions, totalDelayDeductions, remainingSalary });
    }

    setIsActionFormOpen(true);
  };
  
  const handleSaveFinancialAction = async () => {
    if (!db || !selectedEmployee || !actionType) {
        toast({variant: "destructive", title: "بيانات غير مكتملة"});
        return;
    }

    let finalAmount = 0;
    if (actionType === 'bonus' || actionType === 'penalty') {
        const days = parseFloat(actionDays);
        if (isNaN(days) || days < 0) {
            toast({variant: "destructive", title: "الرجاء إدخال عدد أيام صحيح وموجب"});
            return;
        }
        finalAmount = (selectedEmployee.salary / 30) * days;
    } else { // loan or salary_advance
        const amount = parseFloat(actionAmount);
        if (isNaN(amount) || amount <= 0) {
            toast({variant: "destructive", title: "الرجاء إدخال مبلغ صحيح"});
            return;
        }
        finalAmount = amount;
    }


    const today = new Date();
    const monthKey = format(today, 'yyyy-MM');
    const path = `financial_transactions/${selectedEmployee.id}/${monthKey}`;
    const newTransactionRef = push(ref(db, path));
    
    let transactionData: any = {
        type: actionType,
        amount: finalAmount,
        notes: actionNotes,
        date: today.toISOString(),
        employeeId_date: `${selectedEmployee.id}_${format(today, 'yyyy-MM-dd')}`,
    };

    if (actionType === 'loan') {
        transactionData = {
            ...transactionData,
            installments: loanInstallments,
            status: 'active', // 'active' or 'paid'
            paidAmount: 0,
        };
    }

    await set(newTransactionRef, transactionData);
    toast({title: "تم حفظ الإجراء المالي بنجاح"});
    setIsActionFormOpen(false);
  }
  
  const handleDownloadTemplate = () => {
    const headers = ["employeeName", "employeeCode", "password", "salary", "gender", "birthDate", "locationIds", "dayOff", "managerCode"];
    const sampleData = [
        ["احمد محمد", "EMP001", "123456", 5000, "male", "1990-01-15", "branch-1,branch-2", "5", "ADMIN"],
    ];
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    saveAs(blob, "employee_template.xlsx");
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !db || !employeesRef) return;
    
    setIsUploading(true);
    setUploadResults([]);
    const file = event.target.files[0];

    const currentEmployeesSnapshot = await get(employeesRef);
    const currentEmployeesData = currentEmployeesSnapshot.val() || {};
    const currentCodeToIdMap = new Map(Object.entries(currentEmployeesData).map(([id, emp]: [string, any]) => [emp.employeeCode, id]));

    try {
        const rows = await readXlsxFile(file);
        const headers = rows[0] as string[];
        const dataRows = rows.slice(1);
        const results: UploadResult[] = [];

        for (const row of dataRows) {
            const employeeData = headers.reduce((obj, header, index) => {
                obj[header] = row[index];
                return obj;
            }, {} as any);
            
            const { employeeName, employeeCode, password, salary, gender, birthDate, locationIds, dayOff, managerCode } = employeeData;
            
            if (!employeeName || !employeeCode || !password || !salary || !gender) {
                results.push({ employeeName, employeeCode, status: 'error', message: 'بيانات ناقصة' });
                continue;
            }

            if (currentCodeToIdMap.has(employeeCode)) {
                results.push({ employeeName, employeeCode, status: 'error', message: 'كود الموظف مكرر' });
                continue;
            }
            
            let managerId = '';
            if (managerCode && currentCodeToIdMap.has(managerCode)) {
                managerId = currentCodeToIdMap.get(managerCode)!;
            }

            const newEmployeeRef = push(ref(db, 'employees'));
            await set(newEmployeeRef, {
                employeeName,
                employeeCode,
                password: String(password),
                salary: Number(salary),
                gender,
                birthDate: birthDate ? new Date(birthDate).toISOString().split('T')[0] : null,
                locationIds: locationIds ? String(locationIds).split(',').map(s => s.trim()) : [],
                dayOff: dayOff ? String(dayOff) : '5',
                managerId: managerId,
                userStatus: 'Active',
                permissions: navItems.filter(item => !item.adminOnly).map(item => item.href),
                shiftConfiguration: 'general',
            });

            currentCodeToIdMap.set(employeeCode, newEmployeeRef.key!);
            results.push({ employeeName, employeeCode, status: 'success', message: 'تمت الإضافة بنجاح' });
        }
        
        setUploadResults(results);

    } catch (error) {
        toast({ variant: 'destructive', title: 'خطأ في قراءة الملف', description: 'تأكد من أن الملف بالصيغة الصحيحة.' });
    } finally {
        setIsUploading(false);
    }
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedEmployeeIds(filteredEmployees.map(emp => emp.id));
    } else {
      setSelectedEmployeeIds([]);
    }
  };

  const handleToggleSelectOne = (employeeId: string, checked: boolean) => {
    if (checked) {
      setSelectedEmployeeIds(prev => [...prev, employeeId]);
    } else {
      setSelectedEmployeeIds(prev => prev.filter(id => id !== employeeId));
    }
  };

  const handleBulkAssignManager = async () => {
    if (!db || !bulkManagerId || selectedEmployeeIds.length === 0) {
        toast({ title: "الرجاء اختيار مدير والموظفين أولاً", variant: "destructive" });
        return;
    }

    const updates: { [key: string]: any } = {};
    selectedEmployeeIds.forEach(id => {
        updates[`/employees/${id}/managerId`] = bulkManagerId;
    });

    try {
        await update(ref(db), updates);
        toast({ title: "تم تعيين المدير بنجاح", description: `تم تعيين المدير لـ ${selectedEmployeeIds.length} موظف.` });
        setIsBulkManagerDialogOpen(false);
        setSelectedEmployeeIds([]);
        setBulkManagerId('');
    } catch (error) {
        toast({ title: "فشل تعيين المدير", variant: "destructive" });
    }
  };
  
  const handleBulkAssignLocation = async () => {
    if (!db || bulkLocationIds.length === 0 || selectedEmployeeIds.length === 0) {
        toast({ title: "الرجاء اختيار الفروع والموظفين أولاً", variant: "destructive" });
        return;
    }

    const updates: { [key: string]: any } = {};
    selectedEmployeeIds.forEach(id => {
        updates[`/employees/${id}/locationIds`] = bulkLocationIds;
    });

    try {
        await update(ref(db), updates);
        toast({ title: "تم تحديد الفروع بنجاح", description: `تم تحديث فروع ${selectedEmployeeIds.length} موظف.` });
        setIsBulkLocationDialogOpen(false);
        setSelectedEmployeeIds([]);
        setBulkLocationIds([]);
    } catch (error) {
        toast({ title: "فشل تحديد الفروع", variant: "destructive" });
    }
};


  const handleBulkAssignPermissions = async () => {
    if (!db || selectedEmployeeIds.length === 0) return;

    const updates: { [key: string]: any } = {};
    selectedEmployeeIds.forEach(id => {
        updates[`/employees/${id}/permissions`] = bulkPermissions;
    });

    try {
        await update(ref(db), updates);
        toast({ title: "تم تحديد الصلاحيات بنجاح", description: `تم تحديث صلاحيات ${selectedEmployeeIds.length} موظف.` });
        setIsBulkPermissionsDialogOpen(false);
        setSelectedEmployeeIds([]);
        setBulkPermissions([]);
    } catch (error) {
        toast({ title: "فشل تحديد الصلاحيات", variant: "destructive" });
    }
  };
  
  const handleBulkAssignShift = async () => {
    if (!db || !bulkCheckInTime || !bulkCheckOutTime || selectedEmployeeIds.length === 0) {
        toast({ title: "الرجاء تحديد أوقات الدوام والموظفين", variant: "destructive" });
        return;
    }

    const updates: { [key: string]: any } = {};
    selectedEmployeeIds.forEach(id => {
        updates[`/employees/${id}/shiftConfiguration`] = 'custom';
        updates[`/employees/${id}/checkInTime`] = bulkCheckInTime;
        updates[`/employees/${id}/checkOutTime`] = bulkCheckOutTime;
    });

    try {
        await update(ref(db), updates);
        toast({ title: "تم تحديد الوردية بنجاح", description: `تم تحديث وردية ${selectedEmployeeIds.length} موظف.` });
        setIsBulkShiftDialogOpen(false);
        setSelectedEmployeeIds([]);
        setBulkCheckInTime('');
        setBulkCheckOutTime('');
    } catch (error) {
        toast({ title: "فشل تحديد الوردية", variant: "destructive" });
    }
  };
  
  const handleBulkChangeStatus = async () => {
    if (!db || !bulkStatus || selectedEmployeeIds.length === 0) {
      toast({ title: 'الرجاء اختيار حالة والموظفين أولاً', variant: 'destructive' });
      return;
    }

    const updates: { [key: string]: any } = {};
    selectedEmployeeIds.forEach(id => {
      updates[`/employees/${id}/userStatus`] = bulkStatus;
    });

    try {
      await update(ref(db), updates);
      toast({ title: 'تم تغيير الحالة بنجاح', description: `تم تغيير حالة ${selectedEmployeeIds.length} موظف.` });
      setIsBulkStatusDialogOpen(false);
      setSelectedEmployeeIds([]);
    } catch (error) {
      toast({ title: 'فشل تغيير الحالة', variant: 'destructive' });
    }
  };


  const handleBulkDelete = async () => {
    if (!db || selectedEmployeeIds.length === 0) {
      toast({ title: "الرجاء تحديد الموظفين أولاً", variant: "destructive" });
      return;
    }

    const updates: { [key: string]: null } = {};
    selectedEmployeeIds.forEach(id => {
        updates[`/employees/${id}`] = null; // Delete employee
        updates[`/financial_transactions/${id}`] = null; // Delete financial transactions
        updates[`/employee_requests/${id}`] = null; // Delete employee requests
        // Note: Attendance records are not deleted here as they are nested by month.
        // They should be cleaned up via the database management page.
    });

    try {
        await update(ref(db), updates);
        toast({
            title: "تم الحذف بنجاح",
            description: `تم حذف ${selectedEmployeeIds.length} موظف وجميع بياناتهم المرتبطة.`,
        });
        setIsBulkDeleteDialogOpen(false);
        setSelectedEmployeeIds([]);
    } catch (error) {
        toast({ title: "فشل الحذف", variant: "destructive" });
    }
  };


  const actionTitles: Record<FinancialAction, string> = {
    bonus: 'إضافة مكافأة',
    penalty: 'إضافة جزاء',
    loan: 'إضافة سلفة',
    salary_advance: 'سحب جزئي من الراتب',
  };

  const statusConfig: Record<UserStatus, { text: string; variant: 'secondary' | 'destructive' | 'outline' | 'default', color: string }> = {
    Active: { text: 'نشط', variant: 'secondary', color: 'bg-green-500' },
    Inactive: { text: 'غير نشط', variant: 'destructive', color: 'bg-red-500' },
    Pending: { text: 'قيد المراجعة', variant: 'outline', color: 'bg-yellow-500' },
    Archived: { text: 'مؤرشف', variant: 'default', color: 'bg-gray-500' },
  };

  const getLocationNames = (locationIds?: string[]) => {
    if (!locationIds || locationIds.length === 0) {
      return 'كل الفروع';
    }
    return locationIds.map(id => locationsMap.get(id) || 'غير محدد').join(', ');
  };
  
    const formatCurrency = (amount: number) => {
        if (!isClient) return amount;
        return (amount || 0).toLocaleString('ar', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };
    
    const calculatedAmount = useMemo(() => {
        if (!selectedEmployee || !actionDays) return 0;
        const days = parseFloat(actionDays);
        if (isNaN(days)) return 0;
        return (selectedEmployee.salary / 30) * days;
    }, [selectedEmployee, actionDays]);


  return (
    <>
      <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
        <h2 className="text-3xl font-headline font-bold tracking-tight">
          إدارة الموظفين
        </h2>
        <div className="flex gap-2 w-full md:w-auto">
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
                <Button className="flex-1">
                <PlusCircle className="ml-2 h-4 w-4" />
                إضافة موظف
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                <DialogTitle>إضافة موظف جديد</DialogTitle>
                <DialogDescription>
                    أدخل بيانات الموظف الجديد هنا. انقر على حفظ عند الانتهاء.
                </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[70vh] pr-6 -mr-6">
                <EmployeeForm onSubmit={handleSaveEmployee} />
                </ScrollArea>
            </DialogContent>
            </Dialog>
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" className="flex-1">
                        <Upload className="ml-2 h-4 w-4" />
                        رفع من Excel
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl">
                     <DialogHeader>
                        <DialogTitle>رفع الموظفين من ملف Excel</DialogTitle>
                        <DialogDescription>
                            قم بتحميل القالب، املأ البيانات، ثم ارفع الملف هنا.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex gap-2">
                            <Button onClick={handleDownloadTemplate} variant="secondary" className="flex-1">
                                <Download className="ml-2 h-4 w-4" />
                                تحميل القالب
                            </Button>
                        </div>
                        <div className="space-y-2">
                             <Label htmlFor="excel-file">اختر ملف Excel</Label>
                             <Input id="excel-file" type="file" onChange={handleFileUpload} accept=".xlsx, .xls" disabled={isUploading} />
                        </div>
                        {isUploading && <p>جاري الرفع والمعالجة...</p>}
                        {uploadResults.length > 0 && (
                            <ScrollArea className="h-64 mt-4 border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>اسم الموظف</TableHead>
                                            <TableHead>الكود</TableHead>
                                            <TableHead>الحالة</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {uploadResults.map((res, index) => (
                                            <TableRow key={index}>
                                                <TableCell>{res.employeeName}</TableCell>
                                                <TableCell>{res.employeeCode}</TableCell>
                                                <TableCell>
                                                    <Badge variant={res.status === 'success' ? 'secondary' : 'destructive'}>
                                                        {res.message}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>قائمة الموظفين</CardTitle>
          <CardDescription>
            هنا يمكنك تصفح وتعديل بيانات الموظفين واتخاذ الإجراءات.
          </CardDescription>
           <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                 <Input 
                   placeholder="ابحث بالاسم، الكود، أو رقم الهاتف..."
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                   className="pl-10"
                 />
              </div>
              <Select dir="rtl" value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger>
                      <SelectValue placeholder="اختر الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value="all">كل الفروع</SelectItem>
                      {locationsList.map(loc => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                  </SelectContent>
              </Select>
          </div>
          {selectedEmployeeIds.length > 0 && (
            <div className="pt-4 flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                    {selectedEmployeeIds.length} موظف محدد
                </span>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                            <UserCog className="ml-2 h-4 w-4" />
                            إجراءات جماعية
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem onSelect={() => setIsBulkManagerDialogOpen(true)}>
                            <Users className="ml-2 h-4 w-4" />
                            تحديد مدير
                        </DropdownMenuItem>
                         <DropdownMenuItem onSelect={() => setIsBulkLocationDialogOpen(true)}>
                            <MapPin className="ml-2 h-4 w-4" />
                            تحديد فرع
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setIsBulkShiftDialogOpen(true)}>
                           <Clock className="ml-2 h-4 w-4" />
                            تحديد وردية خاصة
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setIsBulkStatusDialogOpen(true)}>
                           <ShieldAlert className="ml-2 h-4 w-4" />
                           تغيير الحالة
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setIsBulkPermissionsDialogOpen(true)}>
                           <ShieldAlert className="ml-2 h-4 w-4" />
                            تحديد الصلاحيات
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setIsBulkDeleteDialogOpen(true)} className="text-destructive focus:text-destructive">
                           <Trash2 className="ml-2 h-4 w-4" />
                            حذف الموظفين
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="sm" onClick={() => setSelectedEmployeeIds([])}>إلغاء التحديد</Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox 
                      onCheckedChange={(checked) => handleToggleSelectAll(checked as boolean)}
                      checked={filteredEmployees.length > 0 && selectedEmployeeIds.length === filteredEmployees.length}
                      aria-label="تحديد الكل"
                    />
                  </TableHead>
                  <TableHead className="text-right">اسم الموظف</TableHead>
                  <TableHead className="text-right">الحالة / الخصم</TableHead>
                  <TableHead className="text-right">الفرع / المدير</TableHead>
                  <TableHead className="text-left">الراتب</TableHead>
                  <TableHead className="text-right">معرف الجهاز</TableHead>
                  <TableHead className="text-center w-[100px]">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  Array.from({ length: 3 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell><Skeleton className="h-5 w-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                      <TableCell className="text-left"><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                    </TableRow>
                  ))
                )}
                {!isLoading && filteredEmployees && filteredEmployees.length > 0 ? (
                  filteredEmployees.map((employee) => (
                    <TableRow key={employee.id} data-state={selectedEmployeeIds.includes(employee.id) ? "selected" : ""}>
                        <TableCell>
                          <Checkbox
                              checked={selectedEmployeeIds.includes(employee.id)}
                              onCheckedChange={(checked) => handleToggleSelectOne(employee.id, checked as boolean)}
                              aria-label={`تحديد ${employee.employeeName}`}
                          />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium">{employee.employeeName}</div>
                        <div className="text-sm text-muted-foreground font-mono">{employee.employeeCode}</div>
                        {employee.phoneNumber && <div className="text-xs text-muted-foreground font-mono">{employee.phoneNumber}</div>}
                      </TableCell>
                      <TableCell className="text-right space-y-1">
                        <div className="flex flex-col items-end gap-1">
                            <Badge variant={statusConfig[employee.userStatus]?.variant || 'default'} className="whitespace-nowrap">
                            <span className={`inline-block w-2 h-2 ml-2 rounded-full ${statusConfig[employee.userStatus]?.color || 'bg-gray-400'}`}></span>
                            {statusConfig[employee.userStatus]?.text || employee.userStatus}
                            </Badge>
                            {employee.disableDeductions && (
                                <Badge variant="outline" className="border-amber-500 text-amber-500">
                                    <BadgePercent className="h-3 w-3 ml-1" />
                                    معفى من الخصم
                                </Badge>
                            )}
                             {employee.locationLoginRequired && (
                                <Badge variant="outline" className="border-blue-500 text-blue-500">
                                    <Lock className="h-3 w-3 ml-1" />
                                    الدخول من الفرع
                                </Badge>
                            )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <div className="max-w-xs truncate">{getLocationNames(employee.locationIds)}</div>
                        <div className="text-muted-foreground">{employeesMap.get(employee.managerId || '')}</div>
                      </TableCell>
                        <TableCell className="text-left font-mono">
                        {isClient
                          ? Number(employee.salary || 0).toLocaleString('ar') + ' ج.م'
                          : employee.salary}
                      </TableCell>
                      <TableCell className="text-right">
                          <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                              {employee.deviceId ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="truncate max-w-[120px] cursor-help">{employee.deviceId}</span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{employee.deviceId}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span>غير مسجل</span>
                              )}

                              {employee.deviceId && 
                                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleResetDeviceId(employee.id)}>
                                    <RotateCcw className="h-3 w-3 text-destructive"/>
                                </Button>
                              }
                          </div>
                      </TableCell>
                      <TableCell className="text-center">
                          <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                      <MoreVertical className="h-4 w-4" />
                                  </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleOpenEditDialog(employee)}>
                                      <Edit className="ml-2 h-4 w-4"/>
                                      تعديل البيانات
                                  </DropdownMenuItem>
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                        <ShieldAlert className="ml-2 h-4 w-4" />
                                        <span>تغيير الحالة</span>
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuPortal>
                                        <DropdownMenuSubContent>
                                            <DropdownMenuItem onClick={() => handleChangeUserStatus(employee.id, 'Active')}>
                                                <CheckCircle className="ml-2 h-4 w-4 text-green-500" />
                                                نشط (Active)
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleChangeUserStatus(employee.id, 'Pending')}>
                                                <ShieldAlert className="ml-2 h-4 w-4 text-yellow-500" />
                                                قيد المراجعة (Pending)
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleChangeUserStatus(employee.id, 'Inactive')}>
                                                <XCircle className="ml-2 h-4 w-4 text-red-500" />
                                                غير نشط (Inactive)
                                            </DropdownMenuItem>
                                             <DropdownMenuItem onClick={() => handleChangeUserStatus(employee.id, 'Archived')}>
                                                <Archive className="ml-2 h-4 w-4" />
                                                مؤرشف (Archived)
                                            </DropdownMenuItem>
                                        </DropdownMenuSubContent>
                                    </DropdownMenuPortal>
                                  </DropdownMenuSub>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleOpenActionDialog(employee, 'bonus')}>
                                      <PlusCircle className="ml-2 h-4 w-4 text-green-500"/>إضافة مكافأة
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleOpenActionDialog(employee, 'penalty')}>
                                      <MinusCircle className="ml-2 h-4 w-4 text-red-500"/>إضافة جزاء
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleOpenActionDialog(employee, 'loan')}>
                                        <HandCoins className="ml-2 h-4 w-4 text-yellow-500"/>إضافة سلفة
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleOpenActionDialog(employee, 'salary_advance')}>
                                        <Wallet className="ml-2 h-4 w-4 text-blue-500"/>سحب جزئي من الراتب
                                  </DropdownMenuItem>
                              </DropdownMenuContent>
                          </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                          {!isLoading && "لا يوجد موظفين يطابقون بحثك."}
                          {isLoading && "جاري تحميل الموظفين..."}
                      </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-4 md:hidden">
              {isLoading && (
                  Array.from({ length: 3 }).map((_, index) => (
                      <Card key={index}><CardContent className="p-4"><Skeleton className="h-32 w-full"/></CardContent></Card>
                  ))
              )}
               {!isLoading && filteredEmployees && filteredEmployees.length > 0 ? (
                  filteredEmployees.map((employee) => (
                    <Card 
                        key={employee.id} 
                        className={cn("transition-colors", selectedEmployeeIds.includes(employee.id) ? "bg-accent" : "")}
                        onClick={(e) => {
                            // Don't toggle selection if clicking on a button or dropdown inside the card
                            if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('[role=menu]')) return;
                            handleToggleSelectOne(employee.id, !selectedEmployeeIds.includes(employee.id))
                        }}
                    >
                        <CardHeader className="flex flex-row items-start justify-between p-4">
                             <div className="space-y-1">
                                <CardTitle className="text-lg">{employee.employeeName}</CardTitle>
                                <CardDescription className="font-mono">{employee.employeeCode}</CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    checked={selectedEmployeeIds.includes(employee.id)}
                                    onCheckedChange={(checked) => handleToggleSelectOne(employee.id, checked as boolean)}
                                    aria-label={`تحديد ${employee.employeeName}`}
                                    className="h-5 w-5"
                                />
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => handleOpenEditDialog(employee)}>
                                            <Edit className="ml-2 h-4 w-4"/>
                                            تعديل البيانات
                                        </DropdownMenuItem>
                                        <DropdownMenuSub>
                                            <DropdownMenuSubTrigger>
                                                <ShieldAlert className="ml-2 h-4 w-4" />
                                                <span>تغيير الحالة</span>
                                            </DropdownMenuSubTrigger>
                                            <DropdownMenuPortal>
                                                <DropdownMenuSubContent>
                                                    <DropdownMenuItem onClick={() => handleChangeUserStatus(employee.id, 'Active')}>
                                                        <CheckCircle className="ml-2 h-4 w-4 text-green-500" />
                                                        نشط (Active)
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleChangeUserStatus(employee.id, 'Pending')}>
                                                        <ShieldAlert className="ml-2 h-4 w-4 text-yellow-500" />
                                                        قيد المراجعة (Pending)
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleChangeUserStatus(employee.id, 'Inactive')}>
                                                        <XCircle className="ml-2 h-4 w-4 text-red-500" />
                                                        غير نشط (Inactive)
                                                    </DropdownMenuItem>
                                                     <DropdownMenuItem onClick={() => handleChangeUserStatus(employee.id, 'Archived')}>
                                                        <Archive className="ml-2 h-4 w-4" />
                                                        مؤرشف (Archived)
                                                    </DropdownMenuItem>
                                                </DropdownMenuSubContent>
                                            </DropdownMenuPortal>
                                        </DropdownMenuSub>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => handleOpenActionDialog(employee, 'bonus')}>
                                            <PlusCircle className="ml-2 h-4 w-4 text-green-500"/>إضافة مكافأة
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleOpenActionDialog(employee, 'penalty')}>
                                            <MinusCircle className="ml-2 h-4 w-4 text-red-500"/>إضافة جزاء
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleOpenActionDialog(employee, 'loan')}>
                                            <HandCoins className="ml-2 h-4 w-4 text-yellow-500"/>إضافة سلفة
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleOpenActionDialog(employee, 'salary_advance')}>
                                            <Wallet className="ml-2 h-4 w-4 text-blue-500"/>سحب جزئي من الراتب
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 space-y-3">
                             <div className="space-y-1">
                                <Badge variant={statusConfig[employee.userStatus]?.variant || 'default'} className="whitespace-nowrap">
                                <span className={`inline-block w-2 h-2 ml-2 rounded-full ${statusConfig[employee.userStatus]?.color || 'bg-gray-400'}`}></span>
                                {statusConfig[employee.userStatus]?.text || employee.userStatus}
                                </Badge>
                                {employee.disableDeductions && (
                                    <Badge variant="outline" className="border-amber-500 text-amber-500 mr-2">
                                        <BadgePercent className="h-3 w-3 ml-1" />
                                        معفى من الخصم
                                    </Badge>
                                )}
                                {employee.locationLoginRequired && (
                                    <Badge variant="outline" className="border-blue-500 text-blue-500 mr-2">
                                        <Lock className="h-3 w-3 ml-1" />
                                        الدخول من الفرع
                                    </Badge>
                                )}
                            </div>
                            <div className="text-sm">
                                <span className="text-muted-foreground">الراتب: </span>
                                <span className="font-mono">
                                    {isClient ? Number(employee.salary || 0).toLocaleString('ar') + ' ج.م' : employee.salary}
                                </span>
                            </div>
                            <div className="text-sm">
                                <span className="text-muted-foreground">المدير: </span>
                                <span>{employeesMap.get(employee.managerId || '') || 'لا يوجد'}</span>
                            </div>
                            <div className="text-sm">
                                <span className="text-muted-foreground">الفروع: </span>
                                <span className="max-w-xs truncate">{getLocationNames(employee.locationIds)}</span>
                            </div>
                             <div className="text-sm text-muted-foreground font-mono flex items-center gap-2 pt-2 border-t">
                                <span className="text-sm text-foreground">الجهاز:</span>
                                {employee.deviceId ? (
                                    <span className="truncate max-w-[120px]">{employee.deviceId}</span>
                                ) : (
                                    <span>غير مسجل</span>
                                )}

                                {employee.deviceId && 
                                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 mr-auto" onClick={() => handleResetDeviceId(employee.id)}>
                                        <RotateCcw className="h-3 w-3 text-destructive"/>
                                    </Button>
                                }
                            </div>
                        </CardContent>
                    </Card>
                  ))
                ) : (
                    <div className="h-24 text-center flex items-center justify-center text-muted-foreground">
                        {!isLoading && "لا يوجد موظفين يطابقون بحثك."}
                    </div>
                )}
          </div>
        </CardContent>
      </Card>
      
      <Dialog open={isEditFormOpen} onOpenChange={setIsEditFormOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>تعديل بيانات الموظف</DialogTitle>
                <DialogDescription>
                    تعديل بيانات {editingEmployee?.employeeName}. كلمة المرور اختيارية.
                </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh] pr-6 -mr-6">
              <EmployeeForm 
                  onSubmit={handleUpdateEmployee} 
                  currentEmployeeId={editingEmployee?.id}
                  defaultValues={editingEmployee ? {
                      ...editingEmployee,
                      shiftConfiguration: editingEmployee.shiftConfiguration || 'general',
                      checkInTime: editingEmployee.checkInTime || '',
                      checkOutTime: editingEmployee.checkOutTime || '',
                      password: '', // Don't show old password
                      permissions: editingEmployee.permissions || [],
                      locationIds: editingEmployee.locationIds || [],
                  } : {}}
              />
            </ScrollArea>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isActionFormOpen} onOpenChange={setIsActionFormOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{actionType ? actionTitles[actionType] : ''} لـ {selectedEmployee?.employeeName}</DialogTitle>
            </DialogHeader>

            {actionType === 'salary_advance' && monthlySummary && selectedEmployee && (
                <div className="p-4 my-4 bg-muted/50 rounded-lg space-y-2 text-sm">
                    <h4 className="font-semibold mb-3">ملخص الراتب للشهر الحالي</h4>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">الراتب الأساسي:</span>
                        <span className="font-mono">{formatCurrency(selectedEmployee.salary)} ج.م</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">خصومات التأخير المتراكمة:</span>
                        <span className="font-mono text-destructive">-{formatCurrency(monthlySummary.totalDelayDeductions)} ج.م</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">إجمالي المسحوبات هذا الشهر:</span>
                        <span className="font-mono text-destructive">-{formatCurrency(monthlySummary.totalAdvances)} ج.م</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">الخصومات الثابتة (تأمينات..):</span>
                        <span className="font-mono text-destructive">-{formatCurrency(monthlySummary.totalFixedDeductions)} ج.م</span>
                    </div>
                    <Separator className="my-2"/>
                    <div className="flex justify-between font-bold text-base">
                        <span>الراتب المتبقي (تقريبي):</span>
                        <span className="font-mono text-primary">{formatCurrency(monthlySummary.remainingSalary)} ج.م</span>
                    </div>
                </div>
            )}

            <div className="grid gap-4 py-4">
                {(actionType === 'bonus' || actionType === 'penalty') ? (
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="days" className="text-right col-span-1">عدد الأيام</Label>
                        <div className='col-span-3 flex items-center gap-2'>
                           <Input id="days" type="number" value={actionDays} onChange={e => setActionDays(e.target.value)} min="0" step="0.25" />
                           <Badge variant="secondary" className="whitespace-nowrap font-mono">{formatCurrency(calculatedAmount)} ج.م</Badge>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="amount" className="text-right">المبلغ</Label>
                        <Input id="amount" type="number" value={actionAmount} onChange={e => setActionAmount(e.target.value)} className="col-span-3" />
                    </div>
                )}
                 {actionType === 'loan' && (
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="installments" className="text-right">عدد الأقساط</Label>
                        <Input id="installments" type="number" value={loanInstallments} onChange={e => setLoanInstallments(parseInt(e.target.value))} className="col-span-3" min="1"/>
                    </div>
                 )}
                 <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="notes" className="text-right">ملاحظات</Label>
                    <Input id="notes" value={actionNotes} onChange={e => setActionNotes(e.target.value)} className="col-span-3" />
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button variant="outline">إلغاء</Button>
                </DialogClose>
                <Button onClick={handleSaveFinancialAction}>حفظ الإجراء</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Manager Dialog */}
      <Dialog open={isBulkManagerDialogOpen} onOpenChange={setIsBulkManagerDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>تحديد مدير لمجموعة</DialogTitle>
                <DialogDescription>اختر المدير الذي سيتم تعيينه لـ {selectedEmployeeIds.length} موظف محدد.</DialogDescription>
            </DialogHeader>
             <div className="py-4">
                <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        className={cn("w-full justify-between", !bulkManagerId && "text-muted-foreground")}
                    >
                        {bulkManagerId ? employeesListForManager.find(emp => emp.value === bulkManagerId)?.label : "اختر المدير"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                        <CommandInput placeholder="ابحث عن مدير..." />
                        <CommandEmpty>لا يوجد موظف بهذا الاسم.</CommandEmpty>
                        <CommandGroup>
                        {employeesListForManager.map((employee) => (
                            <CommandItem
                            value={employee.label}
                            key={employee.value}
                            onSelect={() => setBulkManagerId(employee.value)}
                            >
                            <Check className={cn("mr-2 h-4 w-4", employee.value === bulkManagerId ? "opacity-100" : "opacity-0")} />
                            {employee.label}
                            </CommandItem>
                        ))}
                        </CommandGroup>
                    </Command>
                    </PopoverContent>
                </Popover>
             </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="outline">إلغاء</Button></DialogClose>
                <Button onClick={handleBulkAssignManager}>حفظ التعيين</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Location Dialog */}
        <Dialog open={isBulkLocationDialogOpen} onOpenChange={setIsBulkLocationDialogOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>تحديد فرع لمجموعة</DialogTitle>
                    <DialogDescription>اختر الفروع التي سيتم تعيينها لـ {selectedEmployeeIds.length} موظف محدد.</DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[50vh] p-4">
                 <div className="space-y-3">
                    {locationsList.map((loc) => (
                      <div key={loc.id} className="flex items-center space-x-2 space-x-reverse">
                        <Checkbox
                          id={`bulk-loc-${loc.id}`}
                          checked={bulkLocationIds.includes(loc.id)}
                          onCheckedChange={(checked) => {
                            setBulkLocationIds(prev => 
                                checked ? [...prev, loc.id] : prev.filter(id => id !== loc.id)
                            )
                          }}
                        />
                        <Label htmlFor={`bulk-loc-${loc.id}`} className="font-normal">{loc.name}</Label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">إلغاء</Button></DialogClose>
                    <Button onClick={handleBulkAssignLocation}>حفظ التعيين</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      
      {/* Bulk Permissions Dialog */}
      <Dialog open={isBulkPermissionsDialogOpen} onOpenChange={setIsBulkPermissionsDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>تحديد صلاحيات لمجموعة</DialogTitle>
                <DialogDescription>اختر الصلاحيات التي سيتم تطبيقها على {selectedEmployeeIds.length} موظف محدد.</DialogDescription>
            </DialogHeader>
             <ScrollArea className="max-h-[50vh] p-4">
                 <div className="space-y-3">
                    {permissionNavItems.map((item) => (
                      <div key={item.href} className="flex items-center space-x-2 space-x-reverse">
                        <Checkbox
                          id={`bulk-perm-${item.href}`}
                          checked={bulkPermissions.includes(item.href)}
                          onCheckedChange={(checked) => {
                            setBulkPermissions(prev => 
                                checked ? [...prev, item.href] : prev.filter(p => p !== item.href)
                            )
                          }}
                        />
                        <Label htmlFor={`bulk-perm-${item.href}`} className="font-normal">{item.label}</Label>
                      </div>
                    ))}
                  </div>
             </ScrollArea>
            <DialogFooter>
                <DialogClose asChild><Button variant="outline">إلغاء</Button></DialogClose>
                <Button onClick={handleBulkAssignPermissions}>حفظ الصلاحيات</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
      
       {/* Bulk Status Dialog */}
      <Dialog open={isBulkStatusDialogOpen} onOpenChange={setIsBulkStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تغيير حالة المجموعة</DialogTitle>
            <DialogDescription>
              اختر الحالة الجديدة التي سيتم تطبيقها على {selectedEmployeeIds.length} موظف محدد.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select dir="rtl" value={bulkStatus} onValueChange={(value: UserStatus) => setBulkStatus(value)}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">نشط (Active)</SelectItem>
                <SelectItem value="Pending">قيد المراجعة (Pending)</SelectItem>
                <SelectItem value="Inactive">غير نشط (Inactive)</SelectItem>
                <SelectItem value="Archived">مؤرشف (Archived)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">إلغاء</Button>
            </DialogClose>
            <Button onClick={handleBulkChangeStatus}>حفظ التغييرات</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Shift Dialog */}
      <Dialog open={isBulkShiftDialogOpen} onOpenChange={setIsBulkShiftDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>تحديد وردية خاصة لمجموعة</DialogTitle>
                <DialogDescription>أدخل أوقات الحضور والانصراف التي سيتم تطبيقها على {selectedEmployeeIds.length} موظف محدد.</DialogDescription>
            </DialogHeader>
             <div className="py-4 space-y-4">
                 <div className="space-y-2">
                    <Label htmlFor="bulk-checkin">وقت الحضور</Label>
                    <Input id="bulk-checkin" type="time" value={bulkCheckInTime} onChange={e => setBulkCheckInTime(e.target.value)} />
                 </div>
                  <div className="space-y-2">
                    <Label htmlFor="bulk-checkout">وقت الانصراف</Label>
                    <Input id="bulk-checkout" type="time" value={bulkCheckOutTime} onChange={e => setBulkCheckOutTime(e.target.value)} />
                 </div>
             </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="outline">إلغاء</Button></DialogClose>
                <Button onClick={handleBulkAssignShift}>حفظ الوردية</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Bulk Delete Dialog */}
        <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>هل أنت متأكد تمامًا؟</AlertDialogTitle>
                    <AlertDialogDescription>
                        هذا الإجراء سيقوم بحذف {selectedEmployeeIds.length} موظف بشكل نهائي مع جميع بياناتهم المالية والإدارية. لا يمكن التراجع عن هذا الإجراء.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive hover:bg-destructive/90">
                        نعم، قم بالحذف النهائي
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

    </>
  );
}
